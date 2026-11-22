export function normalizeGroupText(value) {
  return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function isAdministrativeMessage(value) {
  const text = normalizeGroupText(value);
  const signals = [
    /\baviso\b/, /\bconferencia\b/, /\brecorde\b/, /\bpasta de salvos\b/,
    /\bpedidos\b/, /\bparticipacao diaria\b/, /\bme chama no direct\b/,
    /\bqualquer reclamacao\b/, /\bverificacao\b/
  ];
  return signals.filter(pattern => pattern.test(text)).length >= 2;
}

export function parseAdministrativeMilestone(value) {
  const text = normalizeGroupText(value);
  if (!isAdministrativeMessage(value)) return null;
  const dateMatch = String(value ?? "").match(/\\b(\\d{1,2})(?:\\s+do\\s+|[/-])(\\d{1,2})(?:(?:[/-]|\\s+de\\s+)(\\d{2,4}))?\\b/i);
  let date = "";
  if (dateMatch) {
    const day = Number(dateMatch[1]);
    const month = Number(dateMatch[2]);
    const year = dateMatch[3] ? Number(dateMatch[3].length === 2 ? `20${dateMatch[3]}` : dateMatch[3]) : null;
    const validCalendarDate = day >= 1 && day <= 31 && month >= 1 && month <= 12 &&
      (year == null || (year >= 2000 && year <= 2100 && new Date(Date.UTC(year, month - 1, day)).getUTCDate() === day));
    if (validCalendarDate) {
      date = year != null
        ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
        : `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  const feed = text.match(/(\\d+)\\s*(?:publicacoes?\\s*)?feed\\b/);
  const stories = text.match(/(\\d+)\\s*stories\\b/);
  return {
    type: "administrative",
    date,
    todayReference: /\\bhoje\\b/.test(text),
    feedCount: feed ? Number(feed[1]) : null,
    storiesCount: stories ? Number(stories[1]) : null,
    text: String(value ?? "").slice(0, 1200)
  };
}

// Texto/emoji no corpo da mensagem não comprova uma reação aplicada à mensagem correta.
// Mantido por compatibilidade; sem dados estruturados de reação, o estado é sempre desconhecido/falso.
export function hasGroupCheck(_value) {
  return false;
}

export function mergeTaskState(previous = {}, observed = {}) {
  const merged = {};
  for (const key of ["saved", "liked", "commented", "commentAttempted", "likeAttempted", "saveAttempted", "reactionAttempted", "sharedToGroup", "shareAttempted", "groupCheck", "commentForbidden"]) {
    merged[key] = Boolean(previous[key] || observed[key]);
  }
  merged.savedFolderVerified = merged.saved && Boolean(previous.savedFolderVerified || observed.savedFolderVerified);
  merged.complete = merged.saved && merged.savedFolderVerified && merged.liked && (merged.commented || merged.commentForbidden) && merged.sharedToGroup && merged.groupCheck;
  return merged;
}

export function taskStateLabel(state = {}) {
  const merged = mergeTaskState({}, state);
  if (merged.complete) return "fluxo completo — ignorar";
  const pending = [];
  if (!merged.saved) pending.push(merged.saveAttempted ? "verificar tentativa de salvamento manualmente antes de clicar novamente" : "salvar");
  else if (!merged.savedFolderVerified) pending.push("confirmar pasta correta");
  if (!merged.liked) pending.push(merged.likeAttempted ? "verificar tentativa de curtida manualmente antes de clicar novamente" : "curtir");
  if (!merged.commented && !merged.commentForbidden) pending.push(merged.commentAttempted ? "verificar comentário tentado antes de qualquer nova publicação" : "comentar");
  if (!merged.sharedToGroup) pending.push(merged.shareAttempted ? "verificar envio ao grupo coletivo antes de tentar novamente" : "enviar ao grupo coletivo");
  if (!merged.groupCheck) pending.push(merged.reactionAttempted ? "verificar tentativa de reação manualmente antes de clicar novamente" : "reagir à mensagem original");
  return `pendente: ${pending.join(", ")}`;
}


// Localiza a meta publicada pela administração para a janela coletada.
// Datas sem ano (ex.: 18/11) são associadas ao ano do período solicitado.
export function administrativeTargetsForRange(markers = [], startDate = "", endDate = "") {
  const validRange = /^\\d{4}-\\d{2}-\\d{2}$/.test(startDate) &&
    /^\\d{4}-\\d{2}-\\d{2}$/.test(endDate) && startDate <= endDate;
  if (!validRange) return null;
  const days = new Set();
  const cursor = new Date(startDate + "T12:00:00Z");
  const finish = new Date(endDate + "T12:00:00Z");
  for (let count = 0; cursor <= finish && count <= 370; count++) {
    days.add(cursor.toISOString().slice(5, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  const marker = markers.find(item => {
    if (item.feedCount == null && item.storiesCount == null) return false;
    const date = String(item.date || "");
    if (/^\\d{4}-\\d{2}-\\d{2}$/.test(date)) return date >= startDate && date <= endDate;
    if (/^\\d{2}-\\d{2}$/.test(date)) return days.has(date);
    // "HOJE" uses the timestamp of this exact administrative message.
    if (item.todayReference && item.sharedAt) {
      const shared = new Date(item.sharedAt);
      if (!Number.isNaN(shared.getTime())) {
        const localDay = [shared.getFullYear(), String(shared.getMonth() + 1).padStart(2, "0"), String(shared.getDate()).padStart(2, "0")].join("-");
        return localDay >= startDate && localDay <= endDate;
      }
    }
    return false;
  });
  if (!marker) return null;
  const markerDate = /^\\d{4}-\\d{2}-\\d{2}$/.test(String(marker.date || ""))
    ? marker.date
    : marker.todayReference && marker.sharedAt
      ? (() => {
          const d = new Date(marker.sharedAt);
          return Number.isNaN(d.getTime()) ? "" : [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
        })()
      : marker.date;
  return {
    date: markerDate,
    feedCount: marker.feedCount,
    storiesCount: marker.storiesCount,
    totalCount: (marker.feedCount ?? 0) + (marker.storiesCount ?? 0),
    sourceText: marker.text || ""
  };
}
