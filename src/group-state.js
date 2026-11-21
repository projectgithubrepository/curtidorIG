export function normalizeGroupText(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
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
  const dateMatch = String(value ?? "").match(/\b(\d{1,2})(?:\s+do\s+|[/-])(\d{1,2})(?:(?:[/-]|\s+de\s+)(\d{2,4}))?\b/i);
  let date = "";
  if (dateMatch) {
    const year = dateMatch[3] ? (dateMatch[3].length === 2 ? `20${dateMatch[3]}` : dateMatch[3]) : "";
    date = year ? `${year}-${dateMatch[2].padStart(2, "0")}-${dateMatch[1].padStart(2, "0")}` : `${dateMatch[2].padStart(2, "0")}-${dateMatch[1].padStart(2, "0")}`;
  }
  const feed = text.match(/(\d+)\s*(?:publicacoes?\s*)?feed\b/);
  const stories = text.match(/(\d+)\s*stories\b/);
  return {
    type: "administrative",
    date,
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
  for (const key of ["saved", "liked", "commented", "sharedToGroup", "shareAttempted", "groupCheck", "commentForbidden"]) {
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
  if (!merged.saved) pending.push("salvar");
  else if (!merged.savedFolderVerified) pending.push("confirmar pasta correta");
  if (!merged.liked) pending.push("curtir");
  if (!merged.commented && !merged.commentForbidden) pending.push("comentar");
  if (!merged.sharedToGroup) pending.push(merged.shareAttempted ? "verificar envio ao grupo coletivo antes de tentar novamente" : "enviar ao grupo coletivo");
  if (!merged.groupCheck) pending.push("reagir à mensagem original");
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
    const matches = /^\\d{4}-\\d{2}-\\d{2}$/.test(date)
      ? date >= startDate && date <= endDate
      : /^\\d{2}-\\d{2}$/.test(date) && days.has(date);
    return matches;
  });
  if (!marker) return null;
  return {
    date: marker.date,
    feedCount: marker.feedCount,
    storiesCount: marker.storiesCount,
    totalCount: (marker.feedCount ?? 0) + (marker.storiesCount ?? 0),
    sourceText: marker.text || ""
  };
}
