import { chromium } from "playwright";
import path from "node:path";
import { isAdministrativeMessage, parseAdministrativeMilestone } from "./group-state.js";
import { createInstagramNetworkCapture } from "./instagram-network-capture.js";

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
    const urlPattern = /https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel|tv|stories)\/[A-Za-z0-9._-]+(?:\/[^\s]*)?/gi;
    const normalizeUrl = value => {
      try {
        const parsed = new URL(value, location.origin);
        if (!/^(?:www\.)?instagram\.com$/i.test(parsed.hostname)) return "";
        if (!/^\/(?:p|reel|tv|stories)\//.test(parsed.pathname)) return "";
        return parsed.origin + parsed.pathname.replace(/\/$/, "");
      } catch { return ""; }
    };
    const candidates = new Map();
    for (const anchor of document.querySelectorAll("a[href]")) {
      const url = normalizeUrl(anchor.getAttribute("href") || anchor.href);
      if (!url) continue;
      const container = anchor.closest('[role="row"],[role="listitem"],[data-testid*="message"],[data-testid*="Message"]') || anchor.parentElement;
      const messageText = (container?.innerText || anchor.innerText || "").slice(0, 1200);
      let sharedAt = "";
      for (let node = anchor, depth = 0; node && depth < 10; node = node.parentElement, depth++) {
        const time = node.querySelector?.("time[datetime],time[title],time[aria-label]");
        if (time) {
          sharedAt = time.getAttribute("datetime") || time.getAttribute("title") || time.getAttribute("aria-label") || time.textContent || "";
          break;
        }
      }
      if (!candidates.has(url)) candidates.set(url, { url, messageText, sharedAt });
    }
    const messageNodes = [...document.querySelectorAll('[role="row"],[role="listitem"],[data-testid*="message"],[data-testid*="Message"]')];
    for (const node of messageNodes) {
      const messageText = (node.innerText || "").slice(0, 1600);
      for (const match of messageText.matchAll(urlPattern)) {
        const url = normalizeUrl(match[0]);
        if (url && !candidates.has(url)) {
          const time = node.querySelector("time[datetime],time[title],time[aria-label]");
          const sharedAt = time ? (time.getAttribute("datetime") || time.getAttribute("title") || time.getAttribute("aria-label") || time.textContent || "") : "";
          candidates.set(url, { url, messageText, sharedAt });
        }
      }
    }
    return [...candidates.values()].map(item => ({
      ...item,
      contentType: /\/stories\//.test(item.url) ? "story" : "feed",
      sharedAt: item.sharedAt || "",
      groupCheck: false
    }));
  }).then(items => items.filter(item => !isAdministrativeMessage(item.messageText)));
}

async function readVisibleAdministrativeMilestones(page) {
  const texts = await page.locator('[role="row"],[role="listitem"],[data-testid*="message"]').allInnerTexts().catch(() => []);
  return texts.map(parseAdministrativeMilestone).filter(Boolean);
}

async function scrollToOlderMessages(page) {
  const target = await page.evaluate(() => {
    const candidates = [...document.querySelectorAll("body *")].filter(element => {
      const style = getComputedStyle(element);
      return /(auto|scroll)/.test(style.overflowY) &&
        element.scrollHeight > element.clientHeight + 80 &&
        element.clientHeight > 120;
    });
    candidates.sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      const aRight = ar.left > innerWidth * 0.35 ? 1 : 0;
      const bRight = br.left > innerWidth * 0.35 ? 1 : 0;
      return (bRight - aRight) || ((br.height * br.width) - (ar.height * ar.width));
    });
    const element = candidates[0];
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    element.scrollTop = Math.max(0, element.scrollTop - Math.max(500, element.clientHeight * 0.8));
    return {
      x: Math.max(5, Math.min(innerWidth - 5, rect.left + rect.width / 2)),
      y: Math.max(5, Math.min(innerHeight - 5, rect.top + rect.height / 2))
    };
  });
  if (target) {
    await page.mouse.move(target.x, target.y);
    await page.mouse.wheel(0, -850);
  } else {
    await page.mouse.move(1100, 700);
    await page.mouse.wheel(0, -850);
  }
  await page.waitForTimeout(900);
}

function addNetworkMessages(records, { groupThreadId, startDate, endDate, found, fallback, milestones }) {
  let accepted = 0;
  let rejectedThread = 0;
  for (const record of records) {
    if (record.threadId && groupThreadId && record.threadId !== groupThreadId) {
      rejectedThread++;
      continue;
    }
    const text = record.text || "";
    if (text && isAdministrativeMessage(text)) {
      const marker = parseAdministrativeMilestone(text);
      if (marker) milestones.set(record.messageId, { ...marker, messageId: record.messageId, sharedAt: record.timestamp });
      continue;
    }
    for (const url of record.urls || []) {
      const date = dateInRange(record.timestamp, startDate, endDate);
      if (date.known && !date.inRange) continue;
      const item = {
        url,
        messageId: record.messageId,
        sender: record.sender || "",
        messageText: text,
        sharedAt: date.iso,
        dateUnknown: !date.known,
        contentType: /\/stories\//i.test(url) ? "story" : "feed",
        collectionMode: date.known ? "network-date" : "network-date-unknown",
        groupCheck: false,
        networkReactionDataPresent: Boolean(record.hasReactionData)
      };
      if (date.known) {
        if (!found.has(url)) { found.set(url, item); accepted++; }
      } else if (!fallback.has(url)) {
        fallback.set(url, item);
        accepted++;
      }
    }
  }
  return { accepted, rejectedThread };
}

export async function collectGroupPosts(page, { groupName, startDate, endDate, shouldStop = () => false }) {
  let networkCapture = null;
  try {
    await page.goto("https://www.instagram.com/direct/inbox/", { waitUntil: "domcontentloaded", timeout: 60000 });
  } catch (error) {
    throw error;
  }
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

  // Inicia a captura imediatamente antes de abrir o grupo para não misturar
  // mensagens recebidas de outras conversas durante a carga da caixa de entrada.
  networkCapture = createInstagramNetworkCapture(page);
  await exact.click();
  await page.waitForTimeout(1800);
  const activeThreadId = page.url().match(/\/direct\/t\/(\d+)/)?.[1] || "";

  const found = new Map();
  const fallback = new Map();
  const milestones = new Map();
  let previousCount = -1;
  let stableRounds = 0;

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

  await networkCapture.stop();
  const networkRecords = networkCapture.records();
  const networkDiagnostics = networkCapture.summary();
  const networkMerge = addNetworkMessages(networkRecords, {
    groupThreadId: activeThreadId, startDate, endDate, found, fallback, milestones
  });

  // Sem data confirmada, preserva os links como candidatos separados; eles não
  // entram no período automaticamente e ficam identificados como data desconhecida.
  if (!found.size) {
    for (const [url, item] of fallback) found.set(url, item);
  }

  if (!found.size) {
    const diagnostics = await page.evaluate(() => {
      const anchors = [...document.querySelectorAll("a[href]")];
      const instagramLinks = anchors.filter(a => /instagram\.com\/(?:p|reel|tv|stories)\//i.test(a.href)).length;
      const messageNodes = document.querySelectorAll('[role="row"],[role="listitem"],[data-testid*="message"],[data-testid*="Message"]').length;
      return { url: location.href, anchors: anchors.length, instagramLinks, messageNodes };
    });
    const error = new Error("Nenhuma publicação foi extraída. Diagnóstico: " + diagnostics.instagramLinks +
      " links do Instagram em " + diagnostics.anchors + " links da página; " +
      diagnostics.messageNodes + " elementos de mensagem. Página: " + diagnostics.url +
      ". Rede: " + networkDiagnostics.capturedResponses + " respostas; " +
      networkDiagnostics.distinctMessageIds + " mensagens deduplicadas; " +
      networkDiagnostics.extractedShareUrls + " URLs extraídas; " +
      networkMerge.rejectedThread + " mensagens descartadas por divergência de conversa. Nenhuma interação foi feita.");
    error.networkDiagnostics = networkDiagnostics;
    error.pageDiagnostics = diagnostics;
    throw error;
  }

  const milestoneList = [...milestones.values()];
  return [...found.values()].map(item => ({
    ...item,
    administrativeMilestones: milestoneList,
    networkDiagnostics: {
      ...networkDiagnostics,
      normalizedNetworkMessages: networkRecords.length,
      acceptedNetworkPosts: networkMerge.accepted,
      rejectedOtherThreads: networkMerge.rejectedThread
    }
  })).sort((a, b) => {
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
