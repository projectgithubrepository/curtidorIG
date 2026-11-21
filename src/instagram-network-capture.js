const MAX_DIAGNOSTIC_RESPONSES = 500;
const MAX_DEPTH = 20;
const URL_PATTERN = /(?:https?:\/\/(?:www\.)?instagram\.com)?\/(?:p|reel|tv|stories)\/[A-Za-z0-9._-]+(?:\/[^\s"'<>]*)?/gi;

function requestBody(request) {
  try { return request.postDataJSON(); } catch {}
  try {
    const raw = request.postData();
    if (!raw) return null;
    const params = new URLSearchParams(raw);
    const result = {};
    for (const key of ["operationName", "fb_api_req_friendly_name", "doc_id", "query_hash"]) {
      const value = params.get(key);
      if (value) result[key] = value;
    }
    const variables = params.get("variables");
    if (variables) { try { result.variables = JSON.parse(variables); } catch {} }
    return result;
  } catch { return null; }
}

function operationNameFromRequest(request) {
  const candidates = [];
  try {
    const body = requestBody(request);
    const visit = value => {
      if (!value || typeof value !== "object") return;
      if (typeof value.operationName === "string") candidates.push(value.operationName);
      if (typeof value.fb_api_req_friendly_name === "string") candidates.push(value.fb_api_req_friendly_name);
      if (Array.isArray(value)) value.forEach(visit);
      else if (value.variables && typeof value.variables === "object") visit(value.variables);
    };
    visit(body);
  } catch {}
  try {
    const url = new URL(request.url());
    for (const key of ["operationName", "fb_api_req_friendly_name", "query_hash", "doc_id"]) {
      const value = url.searchParams.get(key);
      if (value) candidates.push(value);
    }
  } catch {}
  return [...new Set(candidates)].join(", ");
}

function requestContext(request) {
  const result = { threadId: "", operation: operationNameFromRequest(request) };
  const inspect = value => {
    if (!value || typeof value !== "object") return;
    if (!result.threadId) {
      for (const key of ["thread_id", "threadId", "conversation_id", "thread_v2_id"]) {
        if (value[key] != null && /^\d{6,}$/.test(String(value[key]))) {
          result.threadId = String(value[key]);
          break;
        }
      }
    }
    if (Array.isArray(value)) value.forEach(inspect);
    else for (const child of Object.values(value)) if (child && typeof child === "object") inspect(child);
  };
  try { inspect(requestBody(request)); } catch {}
  try {
    const url = new URL(request.url());
    for (const key of ["thread_id", "threadId", "conversation_id"]) {
      const value = url.searchParams.get(key);
      if (value && /^\d{6,}$/.test(value)) result.threadId = value;
    }
  } catch {}
  return result;
}

function normalizeTimestamp(value) {
  if (value == null || value === "") return "";
  const numeric = Number(value);
  let date;
  if (Number.isFinite(numeric)) {
    date = new Date(numeric < 1e12 ? numeric * 1000 : numeric);
  } else {
    date = new Date(value);
  }
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function collectUrls(value, output, seen = new WeakSet(), depth = 0) {
  if (depth > MAX_DEPTH || value == null) return;
  if (typeof value === "string") {
    const matches = value.match(URL_PATTERN) || [];
    for (const raw of matches) {
      const normalized = raw.replace(/\\\//g, "/").replace(/[),.;]+$/, "");
      try {
        const parsed = new URL(normalized, "https://www.instagram.com");
        if (!/^(?:www\.)?instagram\.com$/i.test(parsed.hostname)) continue;
        const match = parsed.pathname.match(/^\/(p|reel|tv|stories)\/([A-Za-z0-9._-]+)/i);
        if (!match) continue;
        // URLs de Stories têm três segmentos: /stories/username/story_id.
        // Preservar o ID evita colapsar todos os Stories do mesmo perfil em um único item.
        let url;
        if (match[1].toLowerCase() === "stories") {
          const segments = parsed.pathname.split("/").filter(Boolean);
          if (segments.length < 3 || !/^\d+$/.test(segments[2])) continue;
          url = "https://www.instagram.com/stories/" + segments[1] + "/" + segments[2];
        } else {
          url = "https://www.instagram.com/" + match[1].toLowerCase() + "/" + match[2];
        }
        if (!output.includes(url)) output.push(url);
      } catch {}
    }
    return;
  }
  if (typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) value.forEach(item => collectUrls(item, output, seen, depth + 1));
  else for (const child of Object.values(value)) collectUrls(child, output, seen, depth + 1);
}

function storyIdentity(value, depth = 0, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || depth > 8 || seen.has(value)) return { username: "", storyId: "" };
  seen.add(value);
  const username = String(value.username ?? value.user?.username ?? value.user_info?.username ?? value.owner?.username ?? value.author?.username ?? "");
  const candidates = [value.story_id, value.story_pk, value.story_media_id, value.pk, value.media_id, value.mediaId, value.id];
  const rawId = candidates.find(item => item != null && /^\d+(?:_\d+)?$/.test(String(item)));
  let storyId = rawId == null ? "" : String(rawId).split("_")[0];
  let nested = { username: "", storyId: "" };
  for (const child of Object.values(value)) {
    if (child && typeof child === "object") {
      nested = storyIdentity(child, depth + 1, seen);
      if (nested.username && nested.storyId) break;
    }
  }
  return { username: username || nested.username, storyId: storyId || nested.storyId };
}

function collectStoryUrls(value, output, seen = new WeakSet(), depth = 0, storyContext = false) {
  if (!value || typeof value !== "object" || depth > MAX_DEPTH || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach(item => collectStoryUrls(item, output, seen, depth + 1, storyContext));
    return;
  }
  const entries = Object.entries(value);
  const typename = String(value.__typename || value.type || "").toLowerCase();
  const productType = String(value.product_type || value.productType || "").toLowerCase();
  const ownStoryMarker = /story|stories/.test(typename) || /^(story|stories)$/.test(productType) || value.is_story === true || String(value.media_type || "").toLowerCase() === "story" || entries.some(([key]) => /^(story_id|story_pk|story_media_id)$/i.test(key));
  const identity = storyIdentity(value);
  if ((storyContext || ownStoryMarker) && identity.username && identity.storyId) {
    const url = "https://www.instagram.com/stories/" + identity.username + "/" + identity.storyId;
    if (!output.includes(url)) output.push(url);
  }
  for (const [key, child] of entries) {
    if (!child || typeof child !== "object") continue;
    const childStoryContext = storyContext || /^(story|stories|story_share|shared_story|story_media|story_item|story_items|shared_story_media)$/i.test(key);
    collectStoryUrls(child, output, seen, depth + 1, childStoryContext);
  }
}
function collectMediaCodes(value, output, seen = new WeakSet(), depth = 0, insideShare = false) {
  if (!value || typeof value !== "object" || depth > MAX_DEPTH || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach(item => collectMediaCodes(item, output, seen, depth + 1, insideShare));
    return;
  }
  const code = value.code ?? value.shortcode ?? value.short_code;
  const ownMediaContext = Boolean(value.media || value.media_share || value.xma ||
    value.product_type || value.media_type != null || value.image_versions2 ||
    value.video_versions || value.carousel_media || value.__typename === "XDTMedia");
  if (code && (ownMediaContext || insideShare) && /^[A-Za-z0-9_-]{5,}$/.test(String(code))) {
    const productType = String(value.product_type || "").toLowerCase();
    // Story IDs não são shortcodes de Feed. Só criamos URLs de Story quando
    // há uma estrutura explícita de story_share/shared_story com perfil e ID.
    if (productType !== "story" && productType !== "stories") {
      const path = productType === "clips" ? "reel" : "p";
      const url = "https://www.instagram.com/" + path + "/" + String(code);
      if (!output.includes(url)) output.push(url);
    }
  }
  for (const [key, child] of Object.entries(value)) {
    const childIsShare = insideShare || /^(share|media_share|xma|shared_media|media)$/i.test(key);
    collectMediaCodes(child, output, seen, depth + 1, childIsShare);
  }
}

function isMessageObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const id = value.message_id ?? value.mid ?? value.item_id;
  if (id == null) return false;
  return Boolean(value.sender || value.timestamp_ms != null || value.timestamp != null ||
    value.created_at != null || value.text_body != null || value.content || value.message);
}

function messageText(value) {
  const candidates = [value.text_body, value.text, value.message_text, value.caption, value.title];
  for (const item of candidates) {
    if (typeof item === "string" && item.trim()) return item.slice(0, 1600);
  }
  const content = value.content;
  if (content && typeof content === "object") {
    for (const key of ["text", "text_body", "caption"]) {
      if (typeof content[key] === "string" && content[key].trim()) return content[key].slice(0, 1600);
    }
  }
  return "";
}

function senderName(value) {
  const sender = value.sender ?? value.user ?? value.from;
  if (typeof sender === "string") return sender.slice(0, 120);
  if (sender && typeof sender === "object") {
    return String(sender.username ?? sender.name ?? sender.full_name ?? sender.igid ?? sender.id ?? "").slice(0, 120);
  }
  return "";
}

function extractPayload(payload, context = {}) {
  const keys = new Set();
  const messageIds = new Set();
  const records = [];
  const structures = [];
  const seen = new WeakSet();
  let objectsVisited = 0;
  let sharedMediaObjects = 0;
  let hasReactionFields = false;

  function visit(value, path = "$", depth = 0, inheritedThreadId = "") {
    if (!value || typeof value !== "object" || depth > MAX_DEPTH || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, path + "[" + index + "]", depth + 1, inheritedThreadId));
      return;
    }
    objectsVisited++;
    const ownKeys = Object.keys(value);
    ownKeys.forEach(key => keys.add(key));
    const currentThreadId = String(value.thread_id ?? value.threadId ?? value.conversation_id ?? value.thread_v2_id ?? (inheritedThreadId || context.threadId) ?? "");
    if (ownKeys.some(key => /reaction|emoji|reactor/i.test(key))) hasReactionFields = true;
    if (value.share || value.media || value.media_share || value.xma || value.slide_messages) sharedMediaObjects++;

    if (isMessageObject(value)) {
      const id = String(value.message_id ?? value.mid ?? value.item_id);
      messageIds.add(id);
      const urls = [];
      collectUrls(value, urls);
      collectStoryUrls(value, urls);
      collectMediaCodes(value, urls);
      const timestamp = normalizeTimestamp(value.timestamp_ms ?? value.timestamp ?? value.created_at ?? value.sent_at);
      const text = messageText(value);
      const localThreadId = currentThreadId;
      records.push({
        messageId: id,
        threadId: localThreadId,
        timestamp,
        sender: senderName(value),
        text,
        urls,
        hasReactionData: ownKeys.some(key => /reaction|emoji|reactor/i.test(key)) ||
          Boolean(value.reactions || value.reaction_summary || value.reaction_count),
        structurePath: path,
        objectKeys: ownKeys.slice(0, 45)
      });
      if (structures.length < 8) structures.push({ path, keys: ownKeys.slice(0, 45), contentType: value.content?.__typename || value.content?.type || "" });
    }
    for (const [key, child] of Object.entries(value)) visit(child, path + "." + key, depth + 1, currentThreadId);
  }
  visit(payload);
  return {
    records, structures, objectsVisited, messageLikeObjects: records.length,
    distinctMessageIds: messageIds.size, sharedMediaObjects, storyUrls: records.reduce((sum, record) => sum + record.urls.filter(url => /\\/stories\\//i.test(url)).length, 0), hasReactionFields,
    hasShareFields: [...keys].some(key => /^(share|media_share|xma|slide_messages)$/i.test(key)),
    hasPermalinkOrUrl: [...keys].some(key => /^(permalink|url|href)$/i.test(key)),
    hasMessageId: [...keys].some(key => /^(message_id|mid|item_id)$/i.test(key)),
    hasTextBody: keys.has("text_body"), hasTimestampMs: keys.has("timestamp_ms"),
    hasSender: keys.has("sender")
  };
}

export function createInstagramNetworkCapture(page) {
  const responses = [];
  const recordsByKey = new Map();
  const operations = new Set();
  let stopped = false;
  const pending = new Set();
  const websocketStats = { connections: 0, frames: 0, parsedFrames: 0, unparsedFrames: 0, messageLikeObjects: 0, sharedMediaObjects: 0, storyUrls: 0, hasMessageId: false, hasTextBody: false, hasTimestampMs: false, hasSender: false, hasReactionFields: false, hasShareFields: false, hasPermalinkOrUrl: false };
  const websocketOperations = new Set();

  const mergeRecords = (items, context = {}) => {
    for (const record of items) {
      const key = record.messageId + "|" + record.threadId;
      const previous = recordsByKey.get(key);
      if (!previous || previous.urls.length < record.urls.length || (!previous.timestamp && record.timestamp)) {
        recordsByKey.set(key, { ...record, responseThreadId: context.threadId || "" });
      } else {
        previous.urls = [...new Set([...previous.urls, ...record.urls])];
        if (!previous.timestamp) previous.timestamp = record.timestamp;
        if (!previous.text) previous.text = record.text;
        if (!previous.sender) previous.sender = record.sender;
        previous.hasReactionData ||= record.hasReactionData;
      }
    }
  };

  const onWebSocket = socket => {
    websocketStats.connections++;
    websocketOperations.add("websocket:" + (() => {
      try { return new URL(socket.url()).pathname; } catch { return "unknown"; }
    })());
    socket.on("framereceived", data => {
      websocketStats.frames++;
      let payload;
      try {
        // Playwright emits the frame payload itself (string or Buffer),
        // not an event object containing a .payload property.
        if (typeof data === "string") payload = JSON.parse(data);
        else if (Buffer.isBuffer(data)) payload = JSON.parse(data.toString("utf8"));
        else if (data && typeof data.toString === "function") payload = JSON.parse(data.toString());
        else throw new Error("unsupported websocket frame");
      } catch {
        websocketStats.unparsedFrames++;
        return;
      }
      websocketStats.parsedFrames++;
      // Frames de Direct frequentemente omitem o thread_id no próprio payload.
      // A captura é iniciada antes de abrir o grupo e permanece restrita à conversa
      // ativa durante a varredura; use a rota atual como escopo somente quando o
      // quadro não trouxer uma identificação própria.
      const activeThreadId = String(page.url?.() || "").match(/\/direct\/t\/(\d+)/)?.[1] || "";
      const extracted = extractPayload(payload, { threadId: activeThreadId, operation: "websocket" });
      websocketStats.messageLikeObjects += extracted.messageLikeObjects;
      websocketStats.sharedMediaObjects += extracted.sharedMediaObjects;\n      websocketStats.storyUrls += extracted.storyUrls;
      websocketStats.hasMessageId ||= extracted.hasMessageId;
      websocketStats.hasTextBody ||= extracted.hasTextBody;
      websocketStats.hasTimestampMs ||= extracted.hasTimestampMs;
      websocketStats.hasSender ||= extracted.hasSender;
      websocketStats.hasReactionFields ||= extracted.hasReactionFields;
      websocketStats.hasShareFields ||= extracted.hasShareFields;
      websocketStats.hasPermalinkOrUrl ||= extracted.hasPermalinkOrUrl;
      mergeRecords(extracted.records);
    });
  };

  const onResponse = response => {
    if (stopped) return;
    let url;
    try { url = new URL(response.url()); } catch { return; }
    if (!/(^|\.)instagram\.com$/i.test(url.hostname)) return;
    if (!/graphql|direct|thread|inbox|message/i.test(url.pathname)) return;
    const contentLength = Number(response.headers()["content-length"] || 0);
    if (contentLength > 10 * 1024 * 1024) return;

    const request = response.request();
    const context = requestContext(request);
    // Regressão coberta em tests/instagram-network-capture.test.js.
    // IGDMessageListOffMsysQuery nem sempre repete thread_id nas variables.
    // Como a captura começa ao abrir uma conversa específica, associe essa
    // resposta ao thread ativo somente para a operação de listagem de mensagens.
    if (!context.threadId && /IGDMessageListOffMsysQuery/i.test(context.operation)) {
      const activeThreadId = String(page.url?.() || "").match(/\/direct\/t\/(\d+)/)?.[1] || "";
      if (activeThreadId) context.threadId = activeThreadId;
    }
    if (context.operation) operations.add(context.operation);
    const entry = {
      endpoint: url.pathname.includes("/graphql") ? "graphql" : "instagram-api",
      path: url.pathname.slice(0, 180),
      method: request.method?.() || "unknown",
      operation: context.operation || "unknown",
      threadId: context.threadId,
      status: response.status(),
      contentType: (response.headers()["content-type"] || "").split(";")[0].slice(0, 80),
      payload: null,
      parseError: false
    };
    const task = (async () => {
      try {
        const payload = await response.json();
        entry.payload = extractPayload(payload, context);
        mergeRecords(entry.payload.records, context);
      } catch { entry.parseError = true; }
      responses.push(entry);
    })();
    pending.add(task);
    task.finally(() => pending.delete(task));
  };

  page.on("response", onResponse);
  page.on("websocket", onWebSocket);
  const stop = async () => {
    if (!stopped) {
      stopped = true;
      page.off("response", onResponse);
      page.off("websocket", onWebSocket);
    }
    await Promise.allSettled([...pending]);
  };

  return {
    stop,
    records() { return [...recordsByKey.values()].map(record => ({ ...record, urls: [...record.urls] })); },
    summary() {
      const parsed = responses.filter(item => item.payload);
      const byOperation = new Map();
      const aggregate = parsed.reduce((result, item) => {
        result.messageLikeObjects += item.payload.messageLikeObjects;
        result.sharedMediaObjects += item.payload.sharedMediaObjects;\n        result.storyUrls += item.payload.storyUrls;
        result.hasMessageId ||= item.payload.hasMessageId;
        result.hasReactionFields ||= item.payload.hasReactionFields;
        result.hasShareFields ||= item.payload.hasShareFields;
        const key = item.operation || "unknown";
        const current = byOperation.get(key) || { operation: key, responses: 0, messageLikeObjects: 0, sharedMediaObjects: 0 };
        current.responses++;
        current.messageLikeObjects += item.payload.messageLikeObjects;
        current.sharedMediaObjects += item.payload.sharedMediaObjects;
        byOperation.set(key, current);
        return result;
      }, { messageLikeObjects: 0, sharedMediaObjects: 0, storyUrls: 0, hasMessageId: false, hasReactionFields: false, hasShareFields: false });
      const allStructures = parsed.flatMap(item => item.payload.structures).slice(0, 12);
      return {
        capturedAt: new Date().toISOString(),
        capturedResponses: responses.length,
        parsedResponses: parsed.length,
        unparsedResponses: responses.filter(item => item.parseError).length,
        operations: [...new Set([...operations, ...websocketOperations])].slice(0, 30),
        websocketEndpoints: [...websocketOperations].slice(0, 20),
        websocketConnections: websocketStats.connections,
        websocketFrames: websocketStats.frames,
        parsedWebSocketFrames: websocketStats.parsedFrames,
        unparsedWebSocketFrames: websocketStats.unparsedFrames,
        webSocketMessageLikeObjects: websocketStats.messageLikeObjects,
        webSocketSharedMediaObjects: websocketStats.sharedMediaObjects,\n        webSocketStoryUrls: websocketStats.storyUrls,\n        storyUrlsExtracted: aggregate.storyUrls + websocketStats.storyUrls,
        operationDetails: [...byOperation.values()].slice(0, 30),
        distinctMessageIds: recordsByKey.size,
        extractedShareUrls: [...recordsByKey.values()].reduce((sum, item) => sum + item.urls.length, 0),
        messageLikeObjects: aggregate.messageLikeObjects + websocketStats.messageLikeObjects,
        sharedMediaObjects: aggregate.sharedMediaObjects + websocketStats.sharedMediaObjects,
        hasMessageId: aggregate.hasMessageId || websocketStats.hasMessageId,
        hasTextBody: parsed.some(item => item.payload.hasTextBody) || websocketStats.hasTextBody,
        hasTimestampMs: parsed.some(item => item.payload.hasTimestampMs) || websocketStats.hasTimestampMs,
        hasSender: parsed.some(item => item.payload.hasSender) || websocketStats.hasSender,
        hasReactionFields: aggregate.hasReactionFields || websocketStats.hasReactionFields,
        hasShareFields: aggregate.hasShareFields || websocketStats.hasShareFields,
        hasPermalinkOrUrl: parsed.some(item => item.payload.hasPermalinkOrUrl) || websocketStats.hasPermalinkOrUrl,
        structures: allStructures,
        responseDetailsTruncated: Math.max(0, responses.length - MAX_DIAGNOSTIC_RESPONSES),
        responseDetails: responses.slice(0, MAX_DIAGNOSTIC_RESPONSES).map(item => ({
          endpoint: item.endpoint, path: item.path, method: item.method, operation: item.operation, threadIdPresent: Boolean(item.threadId),
          status: item.status, contentType: item.contentType, parseError: item.parseError,
          ...(item.payload ? { payload: {
            objectsVisited: item.payload.objectsVisited,
            messageLikeObjects: item.payload.messageLikeObjects,
            distinctMessageIds: item.payload.distinctMessageIds,
            sharedMediaObjects: item.payload.sharedMediaObjects,\n            storyUrls: item.payload.storyUrls,
            hasMessageId: item.payload.hasMessageId,
            hasTextBody: item.payload.hasTextBody,
            hasTimestampMs: item.payload.hasTimestampMs,
            hasSender: item.payload.hasSender,
            hasReactionFields: item.payload.hasReactionFields,
            hasShareFields: item.payload.hasShareFields,
            hasPermalinkOrUrl: item.payload.hasPermalinkOrUrl
          } } : {})
        }))
      };
    }
  };
}

export function summarizeInstagramNetworkCapture(capture) {
  return capture.summary();
}
