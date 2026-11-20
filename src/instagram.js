import { chromium } from "playwright";
import path from "node:path";
import { isAdministrativeMessage, parseAdministrativeMilestone } from "./group-state.js";

const PROFILE_DIR = path.resolve("data", "instagram-profile");

export async function openInstagram() {
  return chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1440, height: 1000 },
    locale: "pt-BR"
  });
}

function dateInRange(sharedAt, startDate, endDate) {
  if (!sharedAt) return { known: false, inRange: false, iso: "" };
  const parsed = new Date(sharedAt);
  if (Number.isNaN(parsed.getTime())) return { known: false, inRange: false, iso: "" };
  const day = [parsed.getFullYear(), String(parsed.getMonth() + 1).padStart(2, "0"), String(parsed.getDate()).padStart(2, "0")].join("-");
  return { known: true, inRange: day >= startDate && day <= endDate, iso: parsed.toISOString() };
}

async function readVisiblePostLinks(page) {
  return page.evaluate(() => {
    const anchors = [...document.querySelectorAll('a[href*="/p/"],a[href*="/reel/"],a[href*="/tv/"],a[href*="/stories/"]')];
    return anchors.map(anchor => {
      let node = anchor;
      let messageText = "";
      let sharedAt = "";
      for (let depth = 0; node && depth < 12; depth++, node = node.parentElement) {
        const time = node.querySelector?.("time[datetime],time[title],time[aria-label]");
        if (time) {
          sharedAt = time.getAttribute("datetime") || time.getAttribute("title") || time.getAttribute("aria-label") || time.textContent || "";
          messageText = (node.innerText || "").slice(0, 1000);
          break;
        }
      }
      if (!messageText) {
        const container = anchor.closest('[role="row"],[role="listitem"],[data-testid*="message"]') || anchor.parentElement;
        messageText = (container?.innerText || anchor.innerText || "").slice(0, 1000);
      }
      const url = anchor.href.split("?")[0];
      const reactionLabels = [...(node?.querySelectorAll?.("[aria-label],img[alt]") || [])].map(element => element.getAttribute("aria-label") || element.getAttribute("alt") || "").join(" ");
      return { url, contentType: /\/stories\//.test(url) ? "story" : "feed", sharedAt, messageText, groupCheck: /(?:✅|☑️|✔️|✓)/u.test(messageText + " " + reactionLabels) };
    });
  }).then(items => items.filter(item => !isAdministrativeMessage(item.messageText)));
}

async function readVisibleAdministrativeMilestones(page) {
  const texts = await page.locator('[role="row"],[role="listitem"],[data-testid*="message"]').allInnerTexts().catch(() => []);
  return texts.map(parseAdministrativeMilestone).filter(Boolean);
}

async function scrollToOlderMessages(page) {
  await page.mouse.wheel(0, -750);
  await page.waitForTimeout(650);
}

export async function collectGroupPosts(page, { groupName, startDate, endDate, shouldStop = () => false }) {
  await page.goto("https://www.instagram.com/direct/inbox/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);
  if (page.url().includes("/accounts/login")) {
    throw new Error("Faça login manualmente no Instagram e inicie a coleta novamente.");
  }

  const search = page.getByPlaceholder(/pesquisar|search/i).first();
  if (await search.count()) {
    await search.fill(groupName);
    await page.waitForTimeout(1800);
  }
  const exact = page.getByText(groupName, { exact: true }).first();
  if (!(await exact.count())) {
    throw new Error(`Não encontrei o grupo "${groupName}". Confira o nome ou abra a conversa manualmente no Instagram e tente novamente.`);
  }
  await exact.click();
  await page.waitForTimeout(1800);

  const found = new Map();
  const milestones = new Map();
  let previousCount = -1;
  let stableRounds = 0;

  // Estratégia principal: só aceita mensagens cuja data possa ser lida e esteja no período.
  for (let round = 0; round < 35 && !shouldStop(); round++) {
    for (const marker of await readVisibleAdministrativeMilestones(page)) milestones.set(marker.text, marker);
    const batch = await readVisiblePostLinks(page);
    for (const item of batch) {
      const date = dateInRange(item.sharedAt, startDate, endDate);
      if (date.known && date.inRange) found.set(item.url, { ...item, sharedAt: date.iso, dateUnknown: false, collectionMode: "date" });
    }
    if (found.size === previousCount) stableRounds++; else stableRounds = 0;
    previousCount = found.size;
    if (stableRounds >= 4) break;
    await scrollToOlderMessages(page);
  }

  // Plano B: se a interface não expuser datas legíveis, varre o histórico recente
  // até percorrer cerca de 300 mensagens recentes (limite de 30 rolagens). Links com
  // data conhecida fora do período continuam excluídos; datas ausentes são marcadas.
  if (!found.size && !shouldStop()) {
    const fallback = new Map();
    let stableFallbackRounds = 0;
    let previousFallbackSize = -1;
    for (let round = 0; round < 30 && !shouldStop(); round++) {
      for (const marker of await readVisibleAdministrativeMilestones(page)) milestones.set(marker.text, marker);
      const batch = await readVisiblePostLinks(page);
      for (const item of batch) {
        if (fallback.has(item.url)) continue;
        const date = dateInRange(item.sharedAt, startDate, endDate);
        if (date.known && !date.inRange) continue;
        fallback.set(item.url, {
          ...item,
          sharedAt: date.known ? date.iso : "",
          dateUnknown: !date.known,
          collectionMode: "last-300-fallback"
        });
      }

      if (fallback.size === previousFallbackSize) stableFallbackRounds++; else stableFallbackRounds = 0;
      previousFallbackSize = fallback.size;
      if (stableFallbackRounds >= 5 && round >= 20) break;
      await scrollToOlderMessages(page);
    }
    for (const [url, item] of fallback) found.set(url, item);
  }

  if (!found.size) {
    throw new Error("Não encontrei links de publicações no grupo, mesmo após tentar a leitura por data e a varredura de até 300 mensagens recentes. Confira se a conversa carregou e se há links compartilhados nesse trecho; nenhuma interação foi feita.");
  }
  const milestoneList = [...milestones.values()];
  return [...found.values()].map(item => ({ ...item, administrativeMilestones: milestoneList })).sort((a, b) => {
    if (!a.sharedAt) return 1;
    if (!b.sharedAt) return -1;
    return a.sharedAt.localeCompare(b.sharedAt);
  });
}

export async function inspectPost(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1800);
  if (page.url().includes("/accounts/login")) throw new Error("A sessão do Instagram expirou. Faça login novamente.");
  const article = page.locator("article").first();
  const caption = await article.innerText({ timeout: 12000 }).catch(() => "");
  if (!caption.trim()) throw new Error("Não consegui ler a publicação; ela pode ser privada ou indisponível.");
  const observedState = await article.evaluate(element => {
    const labels = [...element.querySelectorAll('button,[role="button"]')].map(node =>
      [node.getAttribute("aria-label"), node.getAttribute("title"), node.innerText].filter(Boolean).join(" ")
    ).join(" ");
    const profileLink = [...document.querySelectorAll("nav a[href]")].find(node =>
      /perfil|profile/i.test([node.getAttribute("aria-label"), node.innerText].filter(Boolean).join(" "))
    );
    const username = (profileLink?.getAttribute("href") || "").match(/^\/([^/]+)\/?$/)?.[1] || "";
    let commented = false;
    if (username) commented = [...element.querySelectorAll("li")].some(item =>
      [...item.querySelectorAll("a[href]")].some(link => link.getAttribute("href") === "/" + username + "/") &&
      (item.innerText || "").trim().length > username.length
    );
    return { liked: /descurtir|unlike/i.test(labels), saved: /remover dos salvos|remove from saved/i.test(labels), commented };
  }).catch(() => ({ liked: false, saved: false, commented: false }));
  return { caption: caption.slice(0, 5000), observedState };
}
