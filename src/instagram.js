import { chromium } from "playwright";
import path from "node:path";

const PROFILE_DIR = path.resolve("data", "instagram-profile");

export async function openInstagram() {
  return chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1440, height: 1000 },
    locale: "pt-BR"
  });
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
  let previousCount = -1;
  let stableRounds = 0;
  for (let round = 0; round < 35 && !shouldStop(); round++) {
    const batch = await page.evaluate(() => {
      const anchors = [...document.querySelectorAll('a[href*="/p/"],a[href*="/reel/"],a[href*="/tv/"]')];
      return anchors.map(anchor => {
        let node = anchor;
        let messageText = "";
        let sharedAt = "";
        for (let depth = 0; node && depth < 7; depth++, node = node.parentElement) {
          const time = node.querySelector?.("time[datetime],time[title],time[aria-label]");
          if (time) {
            sharedAt = time.getAttribute("datetime") || time.getAttribute("title") || time.getAttribute("aria-label") || "";
            messageText = (node.innerText || "").slice(0, 1000);
            break;
          }
        }
        return { url: anchor.href.split("?")[0], sharedAt, messageText };
      });
    });
    for (const item of batch) {
      if (!item.sharedAt) continue;
      const parsed = new Date(item.sharedAt);
      if (Number.isNaN(parsed.getTime())) continue;
      const day = [parsed.getFullYear(), String(parsed.getMonth() + 1).padStart(2, "0"), String(parsed.getDate()).padStart(2, "0")].join("-");
      if (day >= startDate && day <= endDate) found.set(item.url, { ...item, sharedAt: parsed.toISOString() });
    }
    if (found.size === previousCount) stableRounds++; else stableRounds = 0;
    previousCount = found.size;
    if (stableRounds >= 4) break;
    await page.evaluate(() => {
      const candidates = [...document.querySelectorAll("*")].filter(el => el.scrollHeight > el.clientHeight + 100 && el.clientHeight > 100);
      candidates.sort((a,b) => b.scrollHeight - a.scrollHeight);
      if (candidates[0]) candidates[0].scrollTop = 0;
    });
    await page.waitForTimeout(900);
  }
  if (!found.size) {
    throw new Error("Não encontrei links de publicações com data legível no período. O Instagram pode ter alterado a interface ou não carregado mensagens antigas; nenhuma interação foi feita.");
  }
  return [...found.values()].sort((a,b) => a.sharedAt.localeCompare(b.sharedAt));
}

export async function inspectPost(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1800);
  if (page.url().includes("/accounts/login")) throw new Error("A sessão do Instagram expirou. Faça login novamente.");
  const caption = await page.locator("article").first().innerText({ timeout: 12000 }).catch(() => "");
  if (!caption.trim()) throw new Error("Não consegui ler a publicação; ela pode ser privada ou indisponível.");
  return caption.slice(0, 5000);
}
