const MAX_RESPONSES = 120;
const MAX_DEPTH = 18;

function operationNameFromRequest(request) {
  try {
    const body = request.postDataJSON();
    if (body && typeof body.operationName === "string") return body.operationName;
    if (Array.isArray(body)) {
      return body.map(item => item?.operationName).filter(Boolean).join(", ");
    }
  } catch {}
  try {
    const url = new URL(request.url());
    return url.searchParams.get("query_hash") || url.searchParams.get("doc_id") || "";
  } catch {
    return "";
  }
}

function inspectPayload(payload) {
  const keys = new Set();
  const messageIds = new Set();
  const reactionKeys = new Set();
  let objectsVisited = 0;
  let messageLikeObjects = 0;
  let sharedMediaObjects = 0;
  const seen = new WeakSet();

  function visit(value, depth = 0) {
    if (!value || typeof value !== "object" || depth > MAX_DEPTH || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    objectsVisited++;
    const ownKeys = Object.keys(value);
    for (const key of ownKeys) keys.add(key);
    const id = value.message_id ?? value.mid ?? value.item_id;
    if (id !== undefined && id !== null && (value.sender || value.timestamp_ms || value.text_body !== undefined || value.content)) {
      messageLikeObjects++;
      messageIds.add(String(id).slice(0, 100));
    }
    for (const key of ownKeys) {
      if (/reaction|emoji|reactor/i.test(key)) reactionKeys.add(key);
    }
    if (value.share || value.media || value.media_share || value.xma || value.slide_messages) sharedMediaObjects++;
    for (const child of Object.values(value)) visit(child, depth + 1);
  }

  visit(payload);
  const allKeys = [...keys];
  return {
    objectsVisited,
    messageLikeObjects,
    distinctMessageIds: messageIds.size,
    sharedMediaObjects,
    hasMessageId: allKeys.some(key => /^(message_id|mid|item_id)$/.test(key)),
    hasTextBody: keys.has("text_body"),
    hasTimestampMs: keys.has("timestamp_ms"),
    hasSender: keys.has("sender"),
    hasReactionFields: reactionKeys.size > 0,
    reactionFieldNames: [...reactionKeys].slice(0, 20),
    hasShareFields: allKeys.some(key => /^(share|media_share|xma|slide_messages)$/.test(key)),
    hasPermalinkOrUrl: allKeys.some(key => /^(permalink|url|href)$/.test(key))
  };
}

export function createInstagramNetworkCapture(page) {
  const responses = [];
  const operations = new Set();
  let stopped = false;
  const pending = new Set();

  const onResponse = response => {
    if (stopped || responses.length >= MAX_RESPONSES) return;
    let url;
    try {
      url = new URL(response.url());
    } catch {
      return;
    }
    if (!["www.instagram.com", "instagram.com"].includes(url.hostname.toLowerCase())) return;
    if (!url.pathname.includes("/graphql") && !url.pathname.includes("/api/v1/direct")) return;

    const contentLength = Number(response.headers()["content-length"] || 0);
    if (contentLength > 10 * 1024 * 1024) return;

    const request = response.request();
    const operation = operationNameFromRequest(request);
    if (operation) operations.add(operation);

    const entry = {
      endpoint: url.pathname.includes("/graphql") ? "graphql" : "direct-api",
      operation: operation || "unknown",
      status: response.status(),
      contentType: (response.headers()["content-type"] || "").split(";")[0].slice(0, 80),
      payload: null,
      parseError: false
    };

    const task = (async () => {
      try {
        const payload = await response.json();
        entry.payload = inspectPayload(payload);
      } catch {
        entry.parseError = true;
      }
      if (responses.length < MAX_RESPONSES) responses.push(entry);
    })();
    pending.add(task);
    task.finally(() => pending.delete(task));
  };

  page.on("response", onResponse);
  const stop = async () => {
    if (!stopped) {
      stopped = true;
      page.off("response", onResponse);
    }
    await Promise.allSettled([...pending]);
  };

  return {
    stop,
    summary() {
      const parsed = responses.filter(item => item.payload);
      const byOperation = new Map();
      const aggregate = parsed.reduce((result, item) => {
        result.messageLikeObjects += item.payload.messageLikeObjects;
        result.sharedMediaObjects += item.payload.sharedMediaObjects;
        result.distinctMessageIds += item.payload.distinctMessageIds;
        result.hasSender ||= item.payload.hasSender;
        result.hasPermalinkOrUrl ||= item.payload.hasPermalinkOrUrl;
        result.hasReactionFields ||= item.payload.hasReactionFields;
        result.hasShareFields ||= item.payload.hasShareFields;
        result.hasMessageId ||= item.payload.hasMessageId;
        result.hasTimestampMs ||= item.payload.hasTimestampMs;
        result.hasTextBody ||= item.payload.hasTextBody;
        const key = item.operation || "unknown";
        const current = byOperation.get(key) || {
          operation: key, responses: 0, messageLikeObjects: 0, sharedMediaObjects: 0,
          hasReactionFields: false, hasShareFields: false
        };
        current.responses++;
        current.messageLikeObjects += item.payload.messageLikeObjects;
        current.sharedMediaObjects += item.payload.sharedMediaObjects;
        current.hasReactionFields ||= item.payload.hasReactionFields;
        current.hasShareFields ||= item.payload.hasShareFields;
        byOperation.set(key, current);
        return result;
      }, {
        messageLikeObjects: 0,
        sharedMediaObjects: 0,
        distinctMessageIds: 0,
        hasSender: false,
        hasPermalinkOrUrl: false,
        hasReactionFields: false,
        hasShareFields: false,
        hasMessageId: false,
        hasTimestampMs: false,
        hasTextBody: false
      });
      return {
        capturedAt: new Date().toISOString(),
        capturedResponses: responses.length,
        parsedResponses: parsed.length,
        unparsedResponses: responses.filter(item => item.parseError).length,
        operations: [...operations].slice(0, 30),
        operationDetails: [...byOperation.values()].slice(0, 30),
        responseDetails: responses.map(item => ({
          endpoint: item.endpoint,
          operation: item.operation,
          status: item.status,
          contentType: item.contentType,
          parseError: item.parseError,
          ...(item.payload ? { payload: {
            objectsVisited: item.payload.objectsVisited,
            messageLikeObjects: item.payload.messageLikeObjects,
            distinctMessageIds: item.payload.distinctMessageIds,
            sharedMediaObjects: item.payload.sharedMediaObjects,
            hasMessageId: item.payload.hasMessageId,
            hasTextBody: item.payload.hasTextBody,
            hasTimestampMs: item.payload.hasTimestampMs,
            hasSender: item.payload.hasSender,
            hasReactionFields: item.payload.hasReactionFields,
            reactionFieldNames: item.payload.reactionFieldNames,
            hasShareFields: item.payload.hasShareFields,
            hasPermalinkOrUrl: item.payload.hasPermalinkOrUrl
          } } : {})
        })),
        ...aggregate
      };
    }
  };
}

export function summarizeInstagramNetworkCapture(capture) {
  return capture.summary();
}
