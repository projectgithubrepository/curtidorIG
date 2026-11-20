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

export function hasGroupCheck(value) {
  const text = String(value ?? "");
  return /(?:✅|☑️|✔️|✓)/u.test(text);
}

export function mergeTaskState(previous = {}, observed = {}) {
  const merged = {};
  for (const key of ["saved", "liked", "commented", "groupCheck"]) {
    merged[key] = Boolean(previous[key] || observed[key]);
  }
  merged.complete = merged.saved && merged.liked && merged.commented && merged.groupCheck;
  return merged;
}

export function taskStateLabel(state = {}) {
  const merged = mergeTaskState({}, state);
  if (merged.complete) return "fluxo completo — ignorar";
  const pending = [];
  if (!merged.saved) pending.push("salvar");
  if (!merged.liked) pending.push("curtir");
  if (!merged.commented) pending.push("comentar");
  if (!merged.groupCheck) pending.push("check no grupo");
  return `pendente: ${pending.join(", ")}`;
}
