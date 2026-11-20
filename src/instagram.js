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

export function olderScrollPosition(currentTop, distance, flexDirection = "") {
  const top = Number(currentTop) || 0;
  const amount = Math.max(1, Number(distance) || 1);
  // Instagram pode usar flex-direction: column-reverse. Nesse modo,
  // scrollTop começa em zero e fica negativo ao carregar mensagens antigas.
  return flexDirection === "column-reverse" || top < 0
    ? top - amount
    : Math.max(0, top - amount);
}

async function readConversationScrollState(page, move = false) {
  return page.evaluate(shouldMove => {
    const markerSelector = '[role="row"],[role="listitem"],[data-testid*="message"],[data-testid*="Message"],time';
    const candidates = [...document.querySelectorAll("body *")].filter(element => {
      if (element === document.body || element === document.documentElement) return false;
      const rect = element.getBoundingClientRect();
      if (rect.width < 260 || rect.height < 220 || rect.bottom < 0 || rect.top > innerHeight) return false;
      if (rect.right < innerWidth * 0.45 || rect.left > innerWidth + 20) return false;
      return element.scrollHeight > element.clientHeight + 80 && element.clientHeight > 160;
    }).map(element => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const evidence = element.querySelectorAll(markerSelector).length;
      return { element, rect, evidence, area: rect.width * rect.height, style };
    });

    // Prefere a área rolável que contém sinais de mensagens no painel da conversa.
    // Em caso de empate, escolhe o contêiner menor (mais interno), não o painel externo.
    candidates.sort((a, b) =>
      (b.evidence - a.evidence) ||
      (a.area - b.area) ||
      (b.rect.height - a.rect.height)
    );
    const selected = candidates[0];
    if (!selected) {
      return {
        found: false,
        candidateCount: candidates.length,
        fallbackPoint: { x: Math.round(innerWidth * 0.78), y: Math.round(innerHeight * 0.72) }
      };
    }

    const { element, rect, evidence, style } = selected;
    const beforeTop = element.scrollTop;
    const distance = Math.max(420, Math.round(element.clientHeight * 0.72));
    const state = {
      found: true,
      tag: element.tagName.toLowerCase(),
      role: element.getAttribute("role") || "",
      className: String(element.className || "").slice(0, 100),
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      scrollTop: Math.round(beforeTop),
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      flexDirection: style.flexDirection,
      messageMarkers: evidence,
      distance
    };

    if (shouldMove) {
      const currentTop = Number(beforeTop) || 0;
      const olderTop = style.flexDirection === "column-reverse" || currentTop < 0
        ? currentTop - distance
        : Math.max(0, currentTop - distance);
      element.scrollTop = olderTop;
      state.requestedScrollTop = Math.round(element.scrollTop);
    }
    return state;
  }, move);
}

async function scrollToOlderMessages(page) {
  const before = await readConversationScrollState(page, true);
  await page.waitForTimeout(900);
  let after = await readConversationScrollState(page, false);
  let usedWheelFallback = false;

  // Só usa a roda do mouse se o scroll programático não moveu o contêiner.
  // Isso evita aplicar duas rolagens em sequência e causar efeito de "piscar".
  const moved = before.found && after.found &&
    (after.scrollTop < before.scrollTop - 2 ||
      after.scrollHeight > before.scrollHeight + 20 ||
      after.messageMarkers > before.messageMarkers);
  if (!moved) {
    const point = before.found
      ? { x: before.left + Math.round(before.width / 2), y: before.top + Math.round(before.height / 2) }
      : before.fallbackPoint || { x: 1100, y: 700 };
    await page.mouse.move(point.x, point.y);
    await page.mouse.wheel(0, -Math.max(650, before.distance || 800));
    usedWheelFallback = true;
    await page.waitForTimeout(1100);
    after = await readConversationScrollState(page, false);
  }

  const progressed = before.found && after.found &&
    (after.scrollTop < before.scrollTop - 2 ||
      after.scrollHeight > before.scrollHeight + 20 ||
      after.messageMarkers > before.messageMarkers);
  return { progressed, before, after, usedWheelFallback };
}

function addNetworkMessages(records, { groupThreadId, startDate, endDate, found, fallback, milestones }) {
  let accepted = 0;
  let unknownDateCandidates = 0;
  let rejectedThread = 0;
  let rejectedUnscoped = 0;
  let rejectedIdentity = 0;
  for (const record of records) {
    if (!groupThreadId || !record.threadId) {
      rejectedUnscoped++;
      continue;
    }
    if (record.threadId !== groupThreadId) {
      rejectedThread++;
      continue;
    }
    if (!record.messageId) { rejectedIdentity++; continue; }
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
        messageId: String(record.messageId),
        threadId: String(groupThreadId),
        identityVerified: true,
        sender: record.sender || "",
        messageText: text,
        sharedAt: date.iso,
        dateUnknown: !date.known,
        contentType: /\/stories\//i.test(url) ? "story" : "feed",
        collectionMode: date.known ? "network-date" : "network-date-unknown",
        groupCheck: false,
        networkReactionDataPresent: Boolean(record.hasReactionData)
      };
      // A mesma publicação pode ser compartilhada mais de uma vez no mesmo grupo.
      // A identidade é a mensagem, não apenas a URL do post.
      const identityKey = String(record.messageId) + "::" + url;
      if (date.known) {
        const previous = found.get(identityKey) || found.get(url) || {};
        found.delete(url);
        found.set(identityKey, { ...previous, ...item, sharedAt: date.iso, dateUnknown: false, collectionMode: "network-date" });
        accepted++;
      } else {
        const previous = fallback.get(identityKey) || found.get(identityKey) || found.get(url) || {};
        const merged = { ...previous, ...item, dateUnknown: true, collectionMode: "network-date-unknown" };
        if (found.has(url)) { found.delete(url); found.set(identityKey, merged); }
        else if (found.has(identityKey)) found.set(identityKey, merged);
        else fallback.set(identityKey, merged);
        unknownDateCandidates++;
      }
    }
  }
  return { accepted, unknownDateCandidates, rejectedThread, rejectedUnscoped, rejectedIdentity };
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
  if (!activeThreadId) {
    await networkCapture.stop();
    throw new Error("Não foi possível confirmar o ID da conversa aberta. Coleta cancelada para evitar misturar mensagens de outros grupos.");
  }

  const found = new Map();
  const fallback = new Map();
  const milestones = new Map();
  let noScrollProgressRounds = 0;
  let historyRounds = 0;
  let scrollProgressRounds = 0;
  let wheelFallbackRounds = 0;
  let lastScrollState = null;
  let scrollTargetFound = false;

  // Não interrompe a varredura só porque ainda não encontrou links:
  // conversas longas podem começar com dezenas de mensagens administrativas.
  // Continua subindo até detectar o topo/ausência real de carregamento do histórico.
  for (let round = 0; round < 70 && !shouldStop(); round++) {
    historyRounds++;
    for (const marker of await readVisibleAdministrativeMilestones(page)) milestones.set(marker.text, marker);
    const batch = await readVisiblePostLinks(page);
    for (const item of batch) {
      const date = dateInRange(item.sharedAt, startDate, endDate);
      if (date.known && date.inRange) found.set(item.url, { ...item, sharedAt: date.iso, dateUnknown: false, collectionMode: "date" });
    }

    const scroll = await scrollToOlderMessages(page);
    lastScrollState = { before: scroll.before, after: scroll.after };
    scrollTargetFound ||= Boolean(scroll.before?.found);
    if (scroll.usedWheelFallback) wheelFallbackRounds++;
    noScrollProgressRounds = scroll.progressed ? 0 : noScrollProgressRounds + 1;
    if (scroll.progressed) scrollProgressRounds++;
    // Garante uma varredura mínima antes de concluir que chegou ao início.
    if (historyRounds >= 12 && noScrollProgressRounds >= 6) break;
  }

  await networkCapture.stop();
  const networkRecords = networkCapture.records();
  const networkDiagnostics = networkCapture.summary();
  const networkMerge = addNetworkMessages(networkRecords, {
    groupThreadId: activeThreadId, startDate, endDate, found, fallback, milestones
  });

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
      networkDiagnostics.extractedShareUrls + " URLs extraídas; " + fallback.size + " candidatas sem data; " +
      networkMerge.rejectedThread + " mensagens descartadas por divergência de conversa; " +
      networkMerge.rejectedUnscoped + " mensagens sem identificação de conversa descartadas. Nenhuma interação foi feita.");
    error.networkDiagnostics = networkDiagnostics;
    error.pageDiagnostics = diagnostics;
    error.scrollDiagnostics = {
      historyRounds,
      scrollProgressRounds,
      stalledRounds: noScrollProgressRounds,
      wheelFallbackRounds,
      scrollTargetFound,
      lastScrollState
    };
    throw error;
  }

  const milestoneList = [...milestones.values()];
  return [...found.values()].map(item => ({
    ...item,
    threadId: String(item.threadId || activeThreadId),
    identityVerified: Boolean(item.messageId && (item.threadId || activeThreadId)),
    administrativeMilestones: milestoneList,
    networkDiagnostics: {
      ...networkDiagnostics,
      normalizedNetworkMessages: networkRecords.length,
      acceptedNetworkPosts: networkMerge.accepted,
      unknownDateCandidates: networkMerge.unknownDateCandidates,
      rejectedOtherThreads: networkMerge.rejectedThread,
      rejectedUnscopedMessages: networkMerge.rejectedUnscoped,
      rejectedMessagesWithoutId: networkMerge.rejectedIdentity
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
