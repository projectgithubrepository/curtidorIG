import { chromium } from "playwright";
import path from "node:path";
import { isAdministrativeMessage, parseAdministrativeMilestone } from "./group-state.js";
import { createInstagramNetworkCapture } from "./instagram-network-capture.js";

const PROFILE_DIR = path.resolve("data", "instagram-profile");
const MAX_STALLED_SCROLL_ROUNDS = 8;

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

export function didScrollTowardOlderMessages(before, after) {
  return Boolean(before?.found && after?.found &&
    Number(after.scrollTop) < Number(before.scrollTop) - 2);
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

async function readOldestVisibleMessageDate(page) {
  const values = await page.evaluate(() => {
    const messageNodes = [...document.querySelectorAll('[role="row"],[role="listitem"],[data-testid*="message"],[data-testid*="Message"]')];
    return messageNodes.flatMap(message => [...message.querySelectorAll("time[datetime],time[title],time[aria-label]")])
      .filter(node => {
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.right > innerWidth * 0.45 &&
          rect.left < innerWidth + 10 && rect.bottom > 0 && rect.top < innerHeight;
      }).map(node => node.getAttribute("datetime") || node.getAttribute("title") || node.getAttribute("aria-label") || "")
        .filter(Boolean);
  }).catch(() => []);
  const days = values.map(value => new Date(value)).filter(date => !Number.isNaN(date.getTime()))
    .map(date => [date.getFullYear(), String(date.getMonth()+1).padStart(2,"0"), String(date.getDate()).padStart(2,"0")].join("-"))
    .sort();
  return days[0] || "";
}

function isAtHistoryStart(state) {
  if (!state) return false;
  const top = Number(state.scrollTop) || 0;
  const maxDistance = Math.max(0, Number(state.scrollHeight) - Number(state.clientHeight));
  if (state.flexDirection === "column-reverse" || top < 0) {
    return maxDistance > 0 && Math.abs(top) >= maxDistance - 8;
  }
  return top <= 8;
}

export function didReachHistoryStart(after, progressed) {
  return Boolean(progressed && isAtHistoryStart(after));
}

async function scrollToOlderMessages(page) {
  const before = await readConversationScrollState(page, true);
  await page.waitForTimeout(900);
  let after = await readConversationScrollState(page, false);
  let usedWheelFallback = false;

  // Só usa a roda do mouse se o scroll programático não moveu o contêiner.
  // Isso evita aplicar duas rolagens em sequência e causar efeito de "piscar".
  // Só considerar avanço quando o contêiner realmente se deslocou na direção
  // do histórico antigo. Crescimento de scrollHeight/DOM pode ocorrer sem rolagem
  // e não comprova que mensagens anteriores foram alcançadas.
  const moved = didScrollTowardOlderMessages(before, after);
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

  const progressed = didScrollTowardOlderMessages(before, after);
  return { progressed, before, after, usedWheelFallback };
}

export function addNetworkMessages(records, { groupThreadId, startDate, endDate, found, fallback, milestones }) {
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
        const previous = found.get(identityKey) || found.get(url) || fallback.get(identityKey) || {};
        fallback.delete(identityKey);
        found.delete(url);
        found.set(identityKey, { ...previous, ...item, sharedAt: date.iso, dateUnknown: false, collectionMode: "network-date" });
        accepted++;
      } else {
        const previous = fallback.get(identityKey) || found.get(identityKey) || found.get(url) || {};
        const merged = { ...previous, ...item, dateUnknown: true, collectionMode: "network-date-unknown" };
        // Se o DOM forneceu uma data válida, ela prevalece sobre um timestamp ausente no payload.
        if (previous.sharedAt && !previous.dateUnknown) {
          merged.sharedAt = previous.sharedAt;
          merged.dateUnknown = false;
          merged.collectionMode = previous.collectionMode || "date";
        }
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
  let dateBoundaryReached = false;
  let historyBoundaryReached = false;
  let historyStalled = false;
  let oldestVisibleDate = "";

  // Não interrompe a varredura só porque ainda não encontrou links:
  // conversas longas podem começar com dezenas de mensagens administrativas.
  // Continua subindo até detectar o topo/ausência real de carregamento do histórico.
  while (!shouldStop() && !dateBoundaryReached && !historyBoundaryReached && !historyStalled) {
    historyRounds++;
    for (const marker of await readVisibleAdministrativeMilestones(page)) milestones.set(marker.text, marker);
    const batch = await readVisiblePostLinks(page);
    for (const item of batch) {
      const date = dateInRange(item.sharedAt, startDate, endDate);
      if (date.known && date.inRange) found.set(item.url, { ...item, sharedAt: date.iso, dateUnknown: false, collectionMode: "date" });
    }
    oldestVisibleDate = await readOldestVisibleMessageDate(page) || oldestVisibleDate;
    if (oldestVisibleDate && oldestVisibleDate < startDate) {
      dateBoundaryReached = true;
      break;
    }

    const scroll = await scrollToOlderMessages(page);
    lastScrollState = { before: scroll.before, after: scroll.after };
    scrollTargetFound ||= Boolean(scroll.before?.found);
    if (scroll.usedWheelFallback) wheelFallbackRounds++;
    noScrollProgressRounds = scroll.progressed ? 0 : noScrollProgressRounds + 1;
    if (scroll.progressed) scrollProgressRounds++;
    // Só confirma o início quando o contêiner de mensagens está no topo.
    // Falta de movimento fora do topo não encerra a varredura: o diagnóstico
    // permanece incompleto até o limite global, em vez de declarar fim do histórico.
    if (didReachHistoryStart(scroll.after, scroll.progressed) || (!scroll.progressed && scroll.before?.found && isAtHistoryStart(scroll.before))) {
      historyBoundaryReached = true;
      break;
    }
    if (noScrollProgressRounds >= MAX_STALLED_SCROLL_ROUNDS) {
      historyStalled = true;
      break;
    }
  }

  await networkCapture.stop();
  const networkRecords = networkCapture.records();
  const networkDiagnostics = networkCapture.summary();
  const networkMerge = addNetworkMessages(networkRecords, {
    groupThreadId: activeThreadId, startDate, endDate, found, fallback, milestones
  });

  if (!found.size && !fallback.size) {
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
  historyBoundaryReached = historyBoundaryReached || dateBoundaryReached;
  const collectionDiagnostics = {
    historyRounds,
    scrollProgressRounds,
    stalledRounds: noScrollProgressRounds,
    wheelFallbackRounds,
    scrollTargetFound,
    stableBoundaryReached: historyBoundaryReached,
    dateBoundaryReached,
    oldestVisibleDate,
    historyStalled,
    stoppedByUser: Boolean(shouldStop()),
    visibleItems: found.size,
    unknownDateCandidates: fallback.size,
  };
  // Não descartar silenciosamente mensagens com link e identidade, mas sem timestamp.
  // Elas seguem para inspeção como candidatas com data desconhecida e não entram na contagem
  // de cobertura da data até que a data seja confirmada.
  return [...found.values(), ...fallback.values()].map(item => ({
    ...item,
    threadId: String(item.threadId || activeThreadId),
    identityVerified: Boolean(item.messageId && (item.threadId || activeThreadId)),
    administrativeMilestones: milestoneList,
    collectionDiagnostics,
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

export function interpretPostSnapshot(snapshot) {
  const finalUrl = String(snapshot.url || "");
  const title = String(snapshot.title || "");
  const bodyText = String(snapshot.bodyText || "").trim();
  const articleText = String(snapshot.articleText || "").trim();
  const mainText = String(snapshot.mainText || "").trim();
  const dialogText = String(snapshot.dialogText || "").trim();
  const ogDescription = String(snapshot.ogDescription || "").trim();
  const selectors = snapshot.selectors || {};
  const combined = [title, bodyText].join("\n").toLowerCase();
  const diagnostics = {
    requestedUrl: String(snapshot.requestedUrl || ""),
    finalUrl,
    httpStatus: snapshot.httpStatus ?? null,
    title: title.slice(0, 180),
    selectors,
    visibleText: bodyText.slice(0, 500),
    detectedMedia: Boolean(snapshot.hasVideo || snapshot.hasImage),
    hasArticle: Boolean(selectors.article),
    hasMain: Boolean(selectors.main),
    hasDialog: Boolean(selectors.dialog)
  };

  const finalPath = (() => { try { return new URL(finalUrl).pathname; } catch { return finalUrl; } })();
  if (finalPath.startsWith("/accounts/login") || finalPath.startsWith("/accounts/signup") || /entrar na sua conta|log in to instagram|log in to continue/i.test(combined)) {
    throw Object.assign(new Error("Instagram redirecionou para login; a sessão precisa ser autenticada."), { inspectionDiagnostics: { ...diagnostics, reason: "login" } });
  }
  if (/challenge|checkpoint|suspended/i.test(finalPath) || /confirme que é você|confirm it’s you|security code|atividade suspeita|suspicious activity/i.test(combined)) {
    throw Object.assign(new Error("Instagram apresentou uma etapa de segurança ou confirmação; a publicação não foi analisada."), { inspectionDiagnostics: { ...diagnostics, reason: "security-check" } });
  }
  if (snapshot.httpStatus && snapshot.httpStatus >= 400) {
    throw Object.assign(new Error("Instagram respondeu com HTTP " + snapshot.httpStatus + " ao abrir a publicação."), { inspectionDiagnostics: { ...diagnostics, reason: "http-error" } });
  }
  if (/content unavailable|this page isn't available|página não está disponível|conteúdo indisponível|link que você acessou pode estar quebrado/i.test(combined)) {
    throw Object.assign(new Error("O Instagram exibiu uma mensagem de conteúdo indisponível. Não é possível concluir se a publicação é privada ou foi removida."), { inspectionDiagnostics: { ...diagnostics, reason: "unavailable-message" } });
  }

  const caption = (articleText || dialogText || mainText || ogDescription).trim();
  if (!caption) {
    diagnostics.reason = snapshot.hasVideo || snapshot.hasImage ? "media-without-readable-caption" : "post-content-not-rendered";
    diagnostics.captionAvailable = false;
  } else {
    diagnostics.captionAvailable = true;
  }
  return { caption: caption.slice(0, 5000), diagnostics };
}

async function expandVisibleCommentThreads(page) {
  const more = page.getByText(/ver todos os? \d+ comentários|view all \d+ comments|ver mais comentários|view more comments|carregar mais comentários|load more comments|ver comentários anteriores|view previous comments/i).first();
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!(await more.count().catch(() => 0)) || !(await more.isVisible().catch(() => false))) break;
    await more.click().catch(() => {});
    await page.waitForTimeout(250);
  }
}

export function isCommentStateVerified({ usernameKnown = false, alreadyCommented = false, commentListComplete = false } = {}) {
  return Boolean(usernameKnown && (alreadyCommented || commentListComplete));
}

export function getGroupShareState(url, inventory = {}) {
  const canonical = value => {
    try {
      const parsed = new URL(value);
      const parts = parsed.pathname.split("/").filter(Boolean);
      if (["p","reel","tv"].includes((parts[0] || "").toLowerCase()) && parts[1]) return "media:" + parts[1];
      if ((parts[0] || "").toLowerCase() === "stories" && parts[1] && parts[2]) return "story:" + parts[1].toLowerCase() + ":" + parts[2];
      return parsed.origin + parsed.pathname.replace(/\/$/, "");
    } catch { return String(value || ""); }
  };
  if ((inventory.sharedUrls || []).some(value => canonical(value) === canonical(url))) return "already-shared";
  return inventory.inventoryComplete === true ? "not-shared" : "unknown";
}

export async function inspectPost(page, url) {
  let response = null;
  try {
    response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  } catch (error) {
    throw Object.assign(new Error("Falha de navegação ao abrir a publicação: " + error.message), {
      inspectionDiagnostics: { requestedUrl: url, finalUrl: page.url(), reason: "navigation-error", navigationError: error.message }
    });
  }

  // Aguarda a renderização real do post, de uma tela de segurança ou de um erro.
  // Não depende de um atraso fixo nem de networkidle (o Instagram mantém conexões abertas).
  await page.waitForFunction(() => {
    const text = (document.body?.innerText || "").toLowerCase();
    const articleText = document.querySelector("article")?.innerText?.trim() || "";
    const mainText = document.querySelector("main")?.innerText?.trim() || "";
    const dialogText = document.querySelector("[role='dialog']")?.innerText?.trim() || "";
    const hasMedia = Boolean(document.querySelector("video, article img, main img, [role='dialog'] img"));
    const knownState = /content unavailable|this page isn't available|página não está disponível|conteúdo indisponível|entrar na sua conta|log in to instagram|challenge|checkpoint|confirme que é você/.test(text);
    return articleText.length > 20 || dialogText.length > 20 || (mainText.length > 100 && (hasMedia || /comentários|comments|curtidas|likes/i.test(mainText))) || hasMedia || knownState;
  }, null, { timeout: 18000 }).catch(() => {});

  const snapshot = await page.evaluate(() => {
    const article = document.querySelector("article");
    const main = document.querySelector("main");
    const dialog = document.querySelector("[role='dialog']");
    const meta = document.querySelector('meta[property="og:description"],meta[name="description"]');
    const bodyText = (document.body?.innerText || "").trim();
    return {
      url: location.href,
      title: document.title || "",
      bodyText: bodyText.slice(0, 1000),
      articleText: article?.innerText || "",
      mainText: main?.innerText || "",
      dialogText: dialog?.innerText || "",
      ogDescription: meta?.content || "",
      hasVideo: Boolean(document.querySelector("video")),
      hasImage: Boolean(document.querySelector("article img, main img, [role='dialog'] img")),
      selectors: {
        article: Boolean(article),
        main: Boolean(main),
        dialog: Boolean(dialog),
        video: Boolean(document.querySelector("video")),
        image: Boolean(document.querySelector("article img, main img, [role='dialog'] img"))
      }
    };
  });
  const interpreted = interpretPostSnapshot({
    ...snapshot,
    requestedUrl: url,
    httpStatus: response?.status?.() ?? null
  });

  await expandVisibleCommentThreads(page);
  const rootSelector = snapshot.selectors.article ? "article" : snapshot.selectors.dialog ? '[role="dialog"]' : "main";
  let observedState;
  let stateReadError = "";
  try {
    observedState = await page.locator(rootSelector).first().evaluate(element => {
      const controls = [...element.querySelectorAll('button,[role="button"]')];
      const controlLabels = controls.map(node => [node.getAttribute("aria-label"), node.getAttribute("title"), node.innerText].filter(Boolean).join(" ").trim()).filter(Boolean);
      const labels = controlLabels.join(" ");
      const profileLinks = [...document.querySelectorAll("nav a[href],a[href]")].filter(node => /perfil|profile/i.test([node.getAttribute("aria-label"), node.innerText].filter(Boolean).join(" ")));
      const usernames = [...new Set(profileLinks.map(node => (node.getAttribute("href") || "").split("/").filter(Boolean)[0]).filter(Boolean))];
      const username = usernames.length === 1 ? usernames[0] : "";
      const commentRows = [...element.querySelectorAll("li")].filter(item => item.querySelector("a[href]"));
      const commented = username ? commentRows.some(item => [...item.querySelectorAll("a[href]")].some(link => link.getAttribute("href") === "/" + username + "/") && (item.innerText || "").trim().length > username.length) : false;
      const visibleText = (element.innerText || "").toLowerCase();
      const totalMatch = visibleText.match(/(?:ver todos os|view all)\s+(\d+)\s+(?:comentários|comments)|(\d+)\s+(?:comentários|comments)/i);
      const expectedComments = totalMatch ? Number(totalMatch[1] || totalMatch[2]) : null;
      const explicitEmpty = /ainda não há comentários|seja o primeiro a comentar|no comments yet|be the first to comment/i.test(visibleText);
      const hasMoreComments = /ver todos os|view all|ver mais comentários|view more comments|carregar mais comentários|load more comments|comentários anteriores|previous comments/i.test(visibleText);
      const commentListComplete = explicitEmpty || (expectedComments !== null && commentRows.length >= expectedComments && !hasMoreComments);
      const commentStateVerified = Boolean(username && (commented || commentListComplete));
      return {
        liked: /descurtir|unlike/i.test(labels), saved: /remover dos salvos|remove from saved/i.test(labels), commented,
        stateKnown: { liked: /curtir|like|descurtir|unlike/i.test(labels), saved: /salvar|save|remover dos salvos|remove from saved/i.test(labels), commented: commentStateVerified },
        verificationDiagnostics: {
          rootSelector, controlCount: controls.length, controlLabels: controlLabels.slice(0, 30),
          likeControlFound: /curtir|like|descurtir|unlike/i.test(labels), saveControlFound: /salvar|save|remover dos salvos|remove from saved/i.test(labels),
          profileLinkCount: profileLinks.length, identifiedUsername: username || null, commentRowsInspected: commentRows.length,
          expectedCommentCount: expectedComments, commentListComplete, alreadyCommented: commented,
          commentInspectionReason: !username ? (profileLinks.length > 1 ? "Mais de um link de perfil compatível; identidade ambígua." : "Link do perfil do usuário não identificado na página.") : commented ? "Comentário do perfil encontrado; ação já concluída." : commentListComplete ? "Lista de comentários integralmente conferida; comentário do perfil não encontrado." : "Lista de comentários incompleta; ação bloqueada para evitar duplicidade."
        },
        controlCount: controls.length, controlLabels: controlLabels.join(" | ").slice(0, 1600)
      };
    });
  } catch (error) {
    stateReadError = error.message || String(error);
    observedState = { liked:false, saved:false, commented:false, stateKnown:{liked:false,saved:false,commented:false}, verificationDiagnostics:{rootSelector,readError:stateReadError,controlCount:0,controlLabels:[]}, controlCount:0, controlLabels:"" };
  }
  interpreted.diagnostics.stateVerification = {
    ...(observedState.verificationDiagnostics || {}), stateReadError: stateReadError || null,
    liked: observedState.stateKnown.liked ? (observedState.liked ? "já curtida" : "não curtida") : "desconhecido",
    saved: observedState.stateKnown.saved ? (observedState.saved ? "salva" : "não salva") : "desconhecido",
    commented: observedState.stateKnown.commented ? (observedState.commented ? "comentário encontrado nos comentários visíveis" : "não encontrado nos comentários visíveis") : "desconhecido"
  };
  return { caption: interpreted.caption, observedState, stateKnown: observedState.stateKnown, inspectionDiagnostics: interpreted.diagnostics };
}


export function extractInstagramUsernameFromProfileHref(value, base = "https://www.instagram.com/") {
  try {
    const url = new URL(value, base);
    if (!/(^|\.)instagram\.com$/i.test(url.hostname)) return "";
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length !== 1) return "";
    const reserved = new Set(["accounts", "direct", "explore", "reels", "stories", "p", "reel", "tv", "saved"]);
    return reserved.has(parts[0].toLowerCase()) ? "" : parts[0];
  } catch { return ""; }
}

export function buildInstagramSavedUrl(username) {
  const account = String(username || "").trim().replace(/^@/, "");
  if (!/^[a-zA-Z0-9._]{1,30}$/.test(account)) throw new Error("Não foi possível identificar o usuário da conta autenticada do Instagram.");
  return "https://www.instagram.com/" + encodeURIComponent(account) + "/saved/";
}

export function isInstagramSavedUrl(value, base = "https://www.instagram.com/") {
  try {
    const url = new URL(value, base);
    const segments = url.pathname.split("/").filter(Boolean);
    return /(^|\.)instagram\.com$/i.test(url.hostname) &&
      segments.length >= 2 &&
      segments[1].toLowerCase() === "saved" &&
      Boolean(extractInstagramUsernameFromProfileHref("/" + segments[0] + "/", base));
  } catch { return false; }
}

// As coleções do Instagram são apresentadas dentro da área /{usuario}/saved/.
// O nome exato do cartão/link, e não um ID de rota inventado, identifica a pasta.
export function isInstagramSavedCollectionUrl(value, base = "https://www.instagram.com/") {
  try {
    const url = new URL(value, base);
    const baseUrl = new URL(base);
    const savedParts = url.pathname.split("/").filter(Boolean);
    const baseParts = baseUrl.pathname.split("/").filter(Boolean);
    return url.origin === baseUrl.origin &&
      isInstagramSavedUrl(url.href, baseUrl.href) &&
      savedParts[0]?.toLowerCase() === baseParts[0]?.toLowerCase();
  } catch { return false; }
}

function normalizeSavedCollectionLabel(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function savedCollectionLabelMatches(value, wanted) {
  const raw = String(value || "");
  return raw.split(/[\r\n]+/).some(line => normalizeSavedCollectionLabel(line) === wanted) ||
    normalizeSavedCollectionLabel(raw) === wanted;
}

export function selectSavedCollectionHref(anchors, collectionName, baseUrl) {
  const wanted = normalizeSavedCollectionLabel(collectionName);
  if (!wanted) throw new Error("Informe o nome exato da coleção.");
  const base = new URL(baseUrl);
  if (!isInstagramSavedUrl(base.href)) throw new Error("A página atual não pertence à área Salvos do Instagram.");
  const matches = (anchors || []).filter(anchor => {
    const labels = [anchor.text, anchor.ariaLabel, anchor.title, ...(Array.isArray(anchor.labels) ? anchor.labels : [])];
    if (!labels.some(label => savedCollectionLabelMatches(label, wanted))) return false;
    try {
      const url = new URL(anchor.href, base.href);
      return url.origin === base.origin && isInstagramSavedCollectionUrl(url.href, base.href);
    } catch { return false; }
  });
  const unique = [...new Map(matches.map(item => {
    const url = new URL(item.href, base.href);
    return [url.href, url.href];
  })).values()];
  if (unique.length !== 1) {
    throw new Error(unique.length
      ? "Há mais de um link compatível com essa coleção dentro de Salvos; navegação bloqueada por segurança."
      : "Não encontrei um link inequívoco para a coleção \"" + collectionName + "\" dentro de Salvos. Nenhuma alteração foi feita.");
  }
  return unique[0];
}

// Inspeciona uma coleção dos Salvos. Nunca segue links que saiam dessa área.
export async function inspectSavedCollection(page, collectionName) {
  const name = String(collectionName || "").trim();
  if (!name) throw new Error("Informe o nome exato da coleção que será usada como origem.");
  // Descobre o perfil da sessão autenticada pela navegação do próprio Instagram.
  // Não fixa username de exemplo nem assume /saved/ sem o segmento do perfil.
  const profileLink = page.locator('nav a[href^="/"]').filter({ has: page.locator('img') });
  const profileCandidates = await page.locator('nav a[href^="/"]').evaluateAll(nodes => nodes
    .map(anchor => ({
      href: anchor.getAttribute("href") || "",
      label: [anchor.getAttribute("aria-label"), anchor.getAttribute("title"), anchor.innerText].filter(Boolean).join(" ")
    }))
    .filter(item => /perfil|profile/i.test(item.label)));
  let username = "";
  for (const candidate of profileCandidates) {
    username = extractInstagramUsernameFromProfileHref(candidate.href);
    if (username) break;
  }
  if (!username) {
    const avatarCandidates = await profileLink.evaluateAll(nodes => nodes.map(anchor => ({
      href: anchor.getAttribute("href") || "",
      alt: [...anchor.querySelectorAll("img")].map(img => img.alt || "").join(" ")
    })));
    for (const candidate of avatarCandidates) {
      username = extractInstagramUsernameFromProfileHref(candidate.href);
      if (username) break;
    }
  }
  if (!username) throw new Error("Não consegui identificar com segurança o usuário da sessão autenticada para abrir /{usuario}/saved/. Nenhuma coleção foi selecionada.");
  const savedUrl = buildInstagramSavedUrl(username);
  await page.goto(savedUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1800);
  if (/\/accounts\/login/.test(page.url())) throw new Error("Faça login no Instagram antes de acessar os Salvos.");
  if (!isInstagramSavedUrl(page.url())) {
    throw new Error("O Instagram redirecionou para fora de Salvos (" + page.url() + "). Navegação e dessalvamento cancelados.");
  }
  // Em várias versões web, as coleções ficam em uma aba separada dentro de Salvos.
  // Abre essa aba antes de procurar o cartão, sem confundir o inventário geral com pastas.
  const collectionTab = page.getByRole("tab", { name: /^(coleções|collections)$/i }).first();
  const collectionButton = page.getByRole("button", { name: /^(coleções|collections)$/i }).first();
  const collectionLink = page.getByRole("link", { name: /^(coleções|collections)$/i }).first();
  if (await collectionTab.count().catch(() => 0) && await collectionTab.isVisible().catch(() => false)) {
    await collectionTab.click();
    await page.waitForTimeout(900);
  } else if (await collectionButton.count().catch(() => 0) && await collectionButton.isVisible().catch(() => false)) {
    await collectionButton.click();
    await page.waitForTimeout(900);
  } else if (await collectionLink.count().catch(() => 0) && await collectionLink.isVisible().catch(() => false)) {
    await collectionLink.click();
    await page.waitForTimeout(900);
  }
  // A interface do Instagram varia: o nome pode estar no texto de um filho,
  // no aria-label, no title ou em um cartão cujo link envolve a miniatura.
  const anchors = await page.locator("a[href]").evaluateAll(nodes => nodes
    .filter(anchor => {
      const rect = anchor.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    })
    .map(anchor => {
      // Em algumas versões do Instagram, o nome da coleção fica fora do
      // próprio <a>, em um irmão ou no cartão que envolve a miniatura.
      // Recolhe somente rótulos dos ancestrais próximos, sem usar o texto
      // global da página, e mantém o href real do link dentro de Salvos.
      const ancestorLabels = [];
      for (let node = anchor, depth = 0; node && depth < 5; node = node.parentElement, depth++) {
        if (node === document.body || node === document.documentElement) break;
        const text = (node.innerText || "").trim();
        if (text && text.length <= 500) ancestorLabels.push(text);
        for (const child of node.querySelectorAll("[aria-label],[title],img[alt]")) {
          for (const value of [child.getAttribute("aria-label"), child.getAttribute("title"), child.getAttribute("alt")]) {
            if (value) ancestorLabels.push(value);
          }
        }
      }
      return {
        href: anchor.href,
        text: (anchor.innerText || "").trim(),
        ariaLabel: (anchor.getAttribute("aria-label") || "").trim(),
        title: (anchor.getAttribute("title") || "").trim(),
        labels: [...new Set(ancestorLabels)]
      };
    }));
  // Alguns layouts renderizam o nome em um ramo irmão do link da miniatura.
  // Procura o texto exato e associa somente um link descendente na área Salvos.
  const siblingLabelLinks = await page.locator("body *").evaluateAll((nodes, targetName) => {
    const normalize = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLocaleLowerCase();
    const target = normalize(targetName);
    const found = [];
    for (const node of nodes) {
      const text = (node.children.length ? [...node.childNodes].filter(child => child.nodeType === 3).map(child => child.textContent).join(" ") : node.textContent || "").trim();
      if (!text || normalize(text) !== target) continue;
      for (let parent = node, depth = 0; parent && depth < 8; parent = parent.parentElement, depth++) {
        const links = [...parent.querySelectorAll("a[href]")].filter(anchor => {
          try { const url = new URL(anchor.href, location.href); return url.origin === location.origin && isInstagramSavedCollectionUrl(url.href, location.href); } catch { return false; }
        });
        const uniqueLinks = [...new Map(links.map(anchor => [anchor.href, anchor])).values()];
        if (uniqueLinks.length === 1) {
          const anchor = uniqueLinks[0];
          found.push({ href: anchor.href, text: anchor.innerText || "", ariaLabel: anchor.getAttribute("aria-label") || "", title: anchor.getAttribute("title") || "", labels: [text] });
          break;
        }
      }
    }
    return found;
  }, name);
  anchors.push(...siblingLabelLinks);
  let collectionHref;
  try { collectionHref = selectSavedCollectionHref(anchors, name, page.url()); }
  catch (error) {
    const diagnostics = await page.evaluate(() => ({ url: location.href, title: document.title, visibleText: (document.body?.innerText || "").slice(0, 1200), savedLinks: [...document.querySelectorAll("a[href]")].filter(a => /\/saved\//i.test(a.getAttribute("href") || "")).length })).catch(() => ({}));
    throw new Error(error.message + " Diagnóstico da página Salvos: " + JSON.stringify(diagnostics));
  }
  await page.goto(collectionHref, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1400);
  if (!isInstagramSavedCollectionUrl(page.url())) {
    throw new Error("O link da coleção não abriu uma rota específica de coleção (" + page.url() + "). A página geral /saved/ não será aceita como pasta. Nenhuma publicação será processada.");
  }
  let stableRounds = 0;
  let previousCount = 0;
  for (let round = 0; round < 80 && stableRounds < 5; round++) {
    const count = await page.locator('main a[href*="/p/"],main a[href*="/reel/"],main a[href*="/tv/"]').count();
    stableRounds = count > previousCount ? 0 : stableRounds + 1;
    previousCount = count;
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(650);
  }
  const items = await page.locator('main a[href*="/p/"],main a[href*="/reel/"],main a[href*="/tv/"]').evaluateAll(anchors => {
    const map = new Map();
    for (const anchor of anchors) {
      try {
        const url = new URL(anchor.href);
        if (!/^\/(p|reel|tv)\//.test(url.pathname)) continue;
        const clean = url.origin + url.pathname.replace(/\/$/, "");
        if (!map.has(clean)) map.set(clean, { url: clean, contentType: url.pathname.includes("/reel/") ? "reel" : "feed" });
      } catch {}
    }
    return [...map.values()];
  });
  return { collectionName: name, collectionUrl: page.url(), items };
}

async function readSavedToggle(page) {
  return page.locator("article,main,[role='dialog']").evaluateAll(roots => {
    const controls = roots.flatMap(root => [...root.querySelectorAll('button,[role="button"]')]);
    const labels = controls.filter(node => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }).map(node => [node.getAttribute("aria-label"),node.getAttribute("title"),node.innerText].filter(Boolean).join(" ").trim()).filter(Boolean);
    if (labels.some(label => /remover dos salvos|remove from saved|remove saved/i.test(label))) return "saved";
    if (labels.some(label => /^(salvar|save|salvar publicação|save post)$/i.test(label))) return "unsaved";
    return "unknown";
  }).catch(() => "unknown");
}

export async function unsaveSavedCollectionItem(page, url) {
  let target;
  try { target = new URL(url); } catch { return { url, status: "bloqueada — URL inválida" }; }
  if (!/^www\.?instagram\.com$/i.test(target.hostname) || !/^\/(p|reel|tv)\//.test(target.pathname)) {
    return { url, status: "bloqueada — URL não é uma publicação válida do Instagram" };
  }
  await page.goto(target.href, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(900);
  if (/\/accounts\/login/.test(page.url())) return { url, status: "bloqueada — Instagram solicitou login" };
  let current;
  try { current = new URL(page.url()); } catch { return { url, status: "bloqueada — endereço final inválido" }; }
  if (current.hostname !== target.hostname || current.pathname.replace(/\/$/, "") !== target.pathname.replace(/\/$/, "")) {
    return { url, status: "bloqueada — Instagram redirecionou para outro endereço; nenhum clique realizado" };
  }
  const before = await readSavedToggle(page);
  if (before === "unsaved") return { url, status: "já dessalva — nenhuma ação" };
  if (before !== "saved") return { url, status: "bloqueada — não foi possível confirmar o estado salvo pelo controle do Instagram" };
  const controls = page.locator("article button,article [role='button'],main button,main [role='button'],[role='dialog'] button,[role='dialog'] [role='button']");
  const matches = [];
  for (let index = 0; index < await controls.count(); index++) {
    const control = controls.nth(index);
    if (!(await control.isVisible().catch(() => false))) continue;
    const label = await control.evaluate(node => [node.getAttribute("aria-label"),node.getAttribute("title"),node.innerText].filter(Boolean).join(" ").trim());
    if (/remover dos salvos|remove from saved|remove saved/i.test(label)) matches.push(control);
  }
  if (matches.length !== 1) return { url, status: "bloqueada — controle explícito de remover dos salvos não identificado de forma única" };
  await matches[0].click();
  await page.waitForTimeout(1000);
  const after = await readSavedToggle(page);
  if (after !== "unsaved") return { url, status: "falha de verificação — estado após clique: " + after };
  return { url, status: "dessalvada e verificada" };
}

function visibleButton(page, patterns, root = "article,main,[role='dialog']") {
  const names = patterns.map(pattern => new RegExp(pattern, "i"));
  return page.locator(root).first().locator("button,[role='button']").evaluateAll((nodes, regexSources) => {
    const visible = nodes.filter(node => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    return visible.map(node => ({
      label: [node.getAttribute("aria-label"), node.getAttribute("title"), node.innerText].filter(Boolean).join(" ").trim()
    })).filter(item => regexSources.some(source => new RegExp(source, "i").test(item.label)));
  }, names.map(regex => regex.source));
}

async function uniqueButton(page, patterns, root = "article,main,[role='dialog']") {
  const candidates = await visibleButton(page, patterns, root);
  if (candidates.length !== 1) throw new Error(candidates.length ? "Mais de um controle corresponde à ação; execução bloqueada." : "Controle da ação não encontrado; execução bloqueada.");
  const escaped = candidates[0].label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return page.locator(root).first().getByRole("button", { name: new RegExp(escaped, "i") }).first();
}

export async function executeLike(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1200);
  const likeState = await page.locator("article,main,[role='dialog']").first().evaluate(root => {
    const labels = [...root.querySelectorAll("button,[role=button]")].map(node => [node.getAttribute("aria-label"),node.getAttribute("title"),node.innerText].filter(Boolean).join(" ")).join(" ");
    if (/descurtir|unlike/i.test(labels)) return true;
    if (/curtir|\\blike\\b/i.test(labels)) return false;
    return null;
  }).catch(() => null);
  if (likeState === null) throw new Error("Estado da curtida não identificado com segurança; clique bloqueado para não desfazer uma curtida existente.");
  if (likeState) return { liked: true, status: "já curtida — não repetida" };
  const button = await uniqueButton(page, ["curtir", "like"]);
  await button.click();
  await page.waitForTimeout(700);
  const verified = await page.locator("article,main,[role='dialog']").first().evaluate(root => [...root.querySelectorAll("button,[role=button]")].some(node => /descurtir|unlike/i.test([node.getAttribute("aria-label"),node.getAttribute("title"),node.innerText].filter(Boolean).join(" "))));
  if (!verified) throw new Error("A curtida não pôde ser verificada após o clique.");
  return { liked: true, status: "curtida verificada" };
}

function savedCollectionKey(url) {
  const parsed = new URL(url);
  return parsed.pathname.replace(/\/$/,"");
}

export async function executeSaveToCollection(page, url, collectionName, knownCollectionUrls = null) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1200);
  const key = savedCollectionKey(url);
  const root = page.locator("article,main,[role='dialog']").first();
  const labels = await root.locator("button,[role='button']").evaluateAll(nodes => nodes.map(node => [node.getAttribute("aria-label"),node.getAttribute("title"),node.innerText].filter(Boolean).join(" ")).join(" | "));
  const isSaved = /remover dos salvos|remove from saved/i.test(labels);
  if (isSaved) {
    if (knownCollectionUrls?.has(key)) return { saved:true,savedFolderVerified:true,status:"já salva na coleção correta — não repetida" };
    if (!knownCollectionUrls && await (async()=>{const collection=await inspectSavedCollection(page,collectionName);return collection.items.some(item=>savedCollectionKey(item.url)===key);})()) return { saved:true,savedFolderVerified:true,status:"já salva na coleção correta — não repetida" };
    throw new Error("A publicação já está salva, mas não aparece comprovadamente na coleção solicitada. Não vou alternar o estado de salvamento.");
  }
  const saveControl = await uniqueButton(page, ["^salvar$", "^save$"]);
  await saveControl.click();
  await page.waitForTimeout(700);
  const dialog = page.getByRole("dialog").last();
  const dialogVisible = await dialog.count() && await dialog.isVisible().catch(() => false);
  if (!dialogVisible) throw new Error("O Instagram não abriu o seletor de coleções. O salvamento na pasta correta não pode ser confirmado.");
  const collection = dialog.getByText(collectionName, { exact: true });
  if (await collection.count() !== 1) throw new Error(`A coleção “${collectionName}” não foi identificada de forma única no seletor.`);
  await collection.click();
  await page.waitForTimeout(500);
  const save = dialog.getByRole("button", { name: /concluir|done|salvar|save/i }).last();
  if (await save.count() && await save.isVisible().catch(() => false)) await save.click();
  await page.waitForTimeout(800);
  const finalLabels = await root.locator("button,[role='button']").evaluateAll(nodes => nodes.map(node => [node.getAttribute("aria-label"),node.getAttribute("title"),node.innerText].filter(Boolean).join(" ")).join(" | ")).catch(() => "");
  if (!/remover dos salvos|remove from saved/i.test(finalLabels)) throw new Error("O Instagram não confirmou o estado salvo após selecionar a coleção.");
  knownCollectionUrls?.add(key);
  return { saved:true,savedFolderVerified:true,status:"salva na coleção e verificada pelo seletor e estado salvo" };
}
export async function executeComment(page, url, comment) {
  const current = await inspectPost(page, url);
  if (current.stateKnown?.commented !== true) throw new Error("Estado dos comentários não confirmado integralmente; comentário bloqueado para evitar duplicidade.");
  if (current.observedState.commented) return { commented:true, status:"comentário já identificado — não repetido" };
  const text = String(comment || "").trim();
  const words = text.match(/[\p{L}\p{N}]+/gu) || [];
  if (words.length < 2 || !/\p{Extended_Pictographic}/u.test(text)) throw new Error("Comentário bloqueado: precisa ter pelo menos duas palavras e um emoji.");
  const boxes = page.locator('textarea,[contenteditable="true"][role="textbox"],[contenteditable="true"]');
  const count = await boxes.count();
  let editor = null;
  for (let i=0;i<count;i++) if (await boxes.nth(i).isVisible().catch(()=>false)) { editor=boxes.nth(i); break; }
  if (!editor) throw new Error("Campo de comentário não identificado.");
  await editor.fill(text);
  const post = page.getByRole("button", { name: /publicar|postar|^post$/i }).last();
  if (!(await post.count())) throw new Error("Botão de publicar comentário não identificado.");
  await post.click();
  await page.waitForTimeout(900);
  const body = await page.locator("article,main").first().innerText().catch(() => "");
  if (!body.includes(text)) throw new Error("O comentário não apareceu na publicação após o envio.");
  return { commented: true, status: "comentário publicado e verificado" };
}

export async function inspectDestinationGroup(page, destinationGroupName) {
  const groupName = String(destinationGroupName || "").trim();
  if (!groupName) return { verified:false, reason:"Nome do grupo coletivo não informado.", threadId:"" };
  await page.goto("https://www.instagram.com/direct/inbox/", { waitUntil:"domcontentloaded", timeout:60000 });
  await page.waitForTimeout(1200);
  if (page.url().includes("/accounts/login")) {
    return { verified:false, reason:"Instagram redirecionou para o login; grupo coletivo não foi verificado.", threadId:"" };
  }
  const search = page.getByPlaceholder(/pesquisar|search/i).first();
  if (!(await search.count())) {
    return { verified:false, reason:"Campo de busca de conversas não foi localizado.", threadId:"" };
  }
  await search.fill(groupName);
  await page.waitForTimeout(1500);
  const exact = page.getByText(groupName, { exact:true });
  const count = await exact.count();
  if (count !== 1) {
    return {
      verified:false,
      reason:count === 0
        ? `Nenhuma conversa com o nome exato “${groupName}” foi encontrada.`
        : `Foram encontrados ${count} resultados com o mesmo nome; destino ambíguo.`,
      threadId:""
    };
  }
  await exact.first().click();
  await page.waitForTimeout(1000);
  const threadId = page.url().match(/\/direct\/t\/(\d+)/)?.[1] || "";
  if (!threadId) return { verified:false, reason:`O resultado “${groupName}” abriu, mas o ID da conversa não foi confirmado.`, threadId:"", sharedUrls:[], sharedInventoryComplete:false };
  // Percorre o histórico do destino antes de decidir se um link ainda precisa ser enviado.
  const sharedUrls = new Set();
  let sharedInventoryComplete = false;
  let stalledRounds = 0;
  for (let round = 0; round < 150 && stalledRounds < MAX_STALLED_SCROLL_ROUNDS; round++) {
    for (const item of await readVisiblePostLinks(page)) sharedUrls.add(item.url);
    const scroll = await scrollToOlderMessages(page);
    if (didReachHistoryStart(scroll.after, scroll.progressed) || (!scroll.progressed && scroll.before?.found && isAtHistoryStart(scroll.before))) {
      sharedInventoryComplete = true;
      for (const item of await readVisiblePostLinks(page)) sharedUrls.add(item.url);
      break;
    }
    stalledRounds = scroll.progressed ? 0 : stalledRounds + 1;
  }
  return {
    verified:true,
    reason: sharedInventoryComplete
      ? `Grupo “${groupName}” localizado; histórico percorrido até o início e links inventariados.`
      : `Grupo “${groupName}” localizado, mas o histórico não foi percorrido integralmente; envio bloqueado para evitar duplicidade.`,
    threadId, sharedUrls:[...sharedUrls], sharedInventoryComplete, stalledRounds
  };
}

export async function executeShareToGroup(page, url, destinationGroupName, onBeforeSend = async () => {}, groupInventory = null) {
  const groupName = String(destinationGroupName || "").trim();
  if (!groupName) throw new Error("Informe o nome exato do grupo coletivo de envios.");
  if (getGroupShareState(url, groupInventory) === "unknown") throw new Error("Histórico do grupo coletivo não foi conferido integralmente; envio bloqueado para evitar duplicidade.");
  if (getGroupShareState(url, groupInventory) === "already-shared") {
    return { sharedToGroup:true, status:"publicação já encontrada no grupo coletivo — não reenviada" };
  }
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1000);
  const share = await uniqueButton(page, ["compartilhar publicação", "share post", "^compartilhar$", "^share$"]);
  await share.click();
  await page.waitForTimeout(700);
  const dialog = page.getByRole("dialog").last();
  const search = dialog.locator('input,[role="combobox"]').first();
  if (!(await search.count())) throw new Error("Busca de destinatários do compartilhamento não identificada.");
  await search.fill(groupName);
  await page.waitForTimeout(1000);
  const target = dialog.getByText(groupName, { exact: true });
  if (await target.count() !== 1) throw new Error("O grupo coletivo não foi identificado de forma única na lista de destinatários.");
  await target.click();
  await page.waitForTimeout(400);
  const send = dialog.getByRole("button", { name: /enviar|send|compartilhar/i }).last();
  if (!(await send.count())) throw new Error("Botão de envio não identificado.");
  await onBeforeSend();
  await send.click();
  await page.waitForTimeout(1200);
  const confirmation = await page.locator("body").innerText();
  if (!/enviado|enviada|sent|compartilhado|shared/i.test(confirmation)) throw new Error("O Instagram não exibiu confirmação de envio; estado não registrado.");
  return { sharedToGroup: true, status: "enviado ao grupo coletivo e confirmado" };
}

export async function executeCompletionReaction(page, item, emoji = "🌸") {
  if (!item?.threadId || !item?.messageId || !item?.identityVerified || !item?.messageText) {
    throw new Error("Reação bloqueada: não há identidade e texto suficientes da mensagem original.");
  }
  await page.goto(`https://www.instagram.com/direct/t/${encodeURIComponent(item.threadId)}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1200);
  const excerpt = String(item.messageText).trim().slice(0, 100);
  const candidates = page.locator('[role="row"],[role="listitem"],[data-testid*="message"],[data-testid*="Message"]').filter({ hasText: excerpt });
  const count = await candidates.count();
  if (count !== 1) throw new Error("Mensagem original não localizada de forma única; reação bloqueada.");
  const message = candidates.first();
  const existingReaction = await message.locator('button,[role="button"],[aria-label],[title],img[alt],[data-emoji]').evaluateAll((nodes, targetEmoji) => nodes.some(node => [
    node.getAttribute("aria-label"), node.getAttribute("title"), node.getAttribute("alt"),
    node.getAttribute("data-emoji"), node.innerText
  ].filter(Boolean).join(" ").includes(targetEmoji)), emoji).catch(() => false);
  if (existingReaction) return { groupCheck:true, status:`reação ${emoji} já presente — não repetida` };
  await message.hover();
  const reaction = message.locator('button[aria-label*="reagir" i],button[aria-label*="reação" i],button[aria-label*="reaction" i],button[aria-label*="emoji" i],[role="button"][aria-label*="reagir" i],[role="button"][aria-label*="reação" i],[role="button"][aria-label*="reaction" i]').first();
  if (!(await reaction.count())) throw new Error("Controle de reação da mensagem não identificado.");
  await reaction.click();
  await page.waitForTimeout(400);
  const picker = page.locator('[role="dialog"],[role="menu"]').last();
  const emojiButton = picker.getByRole("button", { name: new RegExp(emoji.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).first();
  if (!(await emojiButton.count())) throw new Error(`Emoji ${emoji} não encontrado no seletor de reações.`);
  await emojiButton.click();
  await page.waitForTimeout(700);
  const reactionPresent = await message.locator('button,[role="button"],[aria-label],[title],img[alt],[data-emoji]').evaluateAll((nodes, targetEmoji) => nodes.some(node => [
    node.getAttribute("aria-label"), node.getAttribute("title"), node.getAttribute("alt"),
    node.getAttribute("data-emoji"), node.innerText
  ].filter(Boolean).join(" ").includes(targetEmoji)), emoji).catch(() => false);
  if (!reactionPresent) throw new Error("A reação não pôde ser verificada na mensagem original.");
  return { groupCheck: true, status: `reação ${emoji} aplicada e verificada na mensagem original` };
}


export async function inspectStory(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1200);
  await expandVisibleCommentThreads(page);
  if (/accounts\/login/.test(page.url())) throw new Error("Sessão do Instagram não autenticada.");
  const snapshot = await page.evaluate(() => {
    const visible = node => { const r=node.getBoundingClientRect(); return r.width>0 && r.height>0; };
    const fields = [...document.querySelectorAll('textarea,input,[contenteditable="true"],[role="textbox"]')].filter(visible);
    const publicField = fields.find(node => {
      const label = [node.getAttribute("placeholder"),node.getAttribute("aria-label"),node.getAttribute("data-placeholder")].filter(Boolean).join(" ").toLowerCase();
      return /(coment|comment)/i.test(label) && !/(mensagem|message|responder|reply|enviar mensagem)/i.test(label);
    });
    const controls = [...document.querySelectorAll('button,[role="button"]')].filter(visible).map(node =>
      [node.getAttribute("aria-label"),node.getAttribute("title"),node.innerText].filter(Boolean).join(" ").trim()
    );
    const bodyText=(document.body?.innerText||"").slice(0,4000);
    const profile=[...document.querySelectorAll("nav a[href],a[href]")].find(a=>/perfil|profile/i.test([a.getAttribute("aria-label"),a.innerText].filter(Boolean).join(" ")));
    const username=(profile?.getAttribute("href")||"").split("/").filter(Boolean)[0]||"";
    const commentNodes=[...document.querySelectorAll("li,[role='listitem']")].filter(node=>node.querySelector("a[href]"));
    const alreadyCommented=Boolean(username && commentNodes.some(node =>
      [...node.querySelectorAll("a[href]")].some(a=>a.getAttribute("href")==="/"+username+"/") &&
      (node.innerText||"").trim().length>username.length
    ));
    const lower=bodyText.toLowerCase();
    const totalMatch=lower.match(/(?:ver todos os|view all)\s+(\d+)\s+(?:comentários|comments)|(\d+)\s+(?:comentários|comments)/i);
    const expectedComments=totalMatch?Number(totalMatch[1]||totalMatch[2]):null;
    const explicitEmpty=/ainda não há comentários|seja o primeiro a comentar|no comments yet|be the first to comment/i.test(lower);
    const hasMoreComments=/ver todos os|view all|ver mais comentários|view more comments|carregar mais comentários|load more comments|comentários anteriores|previous comments/i.test(lower);
    const commentListComplete=explicitEmpty||(expectedComments!==null&&commentNodes.length>=expectedComments&&!hasMoreComments);
    return { publicCommentAvailable:Boolean(publicField), publicCommentLabel:publicField ? [publicField.getAttribute("placeholder"),publicField.getAttribute("aria-label")].filter(Boolean).join(" ") : "", alreadyCommented, usernameKnown:Boolean(username), commentListComplete, expectedComments, commentRowsInspected:commentNodes.length, controls, bodyText };
  });
  return { ...snapshot, stateKnown:{ publicCommentAvailable:true, alreadyCommented:isCommentStateVerified({usernameKnown:snapshot.usernameKnown,alreadyCommented:snapshot.alreadyCommented,commentListComplete:snapshot.commentListComplete}) } };
}

export async function executeStoryComment(page, url, comment) {
  const text=String(comment||"").trim();
  const words=text.match(/[\p{L}\p{N}]+/gu)||[];
  if(words.length<2 || !/\p{Extended_Pictographic}/u.test(text)) throw new Error("Comentário do Story precisa ter pelo menos duas palavras e um emoji.");
  const state=await inspectStory(page,url);
  if(!state.publicCommentAvailable) throw new Error("Comentário público indisponível neste Story; nenhuma resposta privada será enviada.");
  if(!state.usernameKnown || state.stateKnown?.alreadyCommented !== true) throw new Error("A lista de comentários do Story não foi conferida integralmente; comentário bloqueado para evitar duplicidade.");
  if(state.alreadyCommented) return {commented:true,status:"comentário público já identificado — não repetido"};
  const fields=page.locator('textarea,input,[contenteditable="true"],[role="textbox"]');
  let editor=null;
  for(let i=0;i<await fields.count();i++){
    const el=fields.nth(i); if(!(await el.isVisible().catch(()=>false))) continue;
    const label=await el.evaluate(node=>[node.getAttribute("placeholder"),node.getAttribute("aria-label"),node.getAttribute("data-placeholder")].filter(Boolean).join(" "));
    if(/coment|comment/i.test(label)&&!/(mensagem|message|responder|reply)/i.test(label)){editor=el;break;}
  }
  if(!editor) throw new Error("Campo de comentário público do Story não identificado.");
  await editor.fill(text);
  const publish=page.getByRole("button",{name:/publicar|postar|^post$|comentar|comment/i}).last();
  if(!(await publish.count())) throw new Error("Botão de publicação do comentário público não identificado.");
  await publish.click(); await page.waitForTimeout(900);
  const body=await page.locator("body").innerText().catch(()=>"");
  if(!body.includes(text)) throw new Error("Comentário público do Story não foi confirmado na tela.");
  return {commented:true,status:"comentário público no Story publicado e verificado"};
}

export async function executeStoryShareToGroup(page, url, destinationGroupName, onBeforeSend=async()=>{}) {
  const groupName=String(destinationGroupName||"").trim();
  if(!groupName) throw new Error("Informe o grupo coletivo de destino.");
  await page.goto(url,{waitUntil:"domcontentloaded",timeout:60000}); await page.waitForTimeout(1000);
  const share=page.getByRole("button",{name:/compartilhar|share|enviar/i}).last();
  if(!(await share.count())) throw new Error("Controle de compartilhamento do Story não identificado.");
  await share.click(); await page.waitForTimeout(700);
  const dialog=page.getByRole("dialog").last();
  const search=dialog.locator('input,[role="combobox"]').first();
  if(!(await search.count())) throw new Error("Busca de destinatários do Story não identificada.");
  await search.fill(groupName); await page.waitForTimeout(900);
  const target=dialog.getByText(groupName,{exact:true});
  if(await target.count()!==1) throw new Error("Grupo coletivo não identificado de forma única.");
  await target.click(); await page.waitForTimeout(300);
  const send=dialog.getByRole("button",{name:/enviar|send|compartilhar/i}).last();
  if(!(await send.count())) throw new Error("Botão de envio do Story não identificado.");
  await onBeforeSend(); await send.click(); await page.waitForTimeout(1000);
  return {sharedToGroup:true,status:"Story enviado ao grupo coletivo; confirmação visual deve ser conferida"};
}
