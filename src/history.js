import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.resolve("data");
const HISTORY_FILE = path.join(DATA_DIR, "historico.csv");
const HEADER = ["data_hora","url","id_conversa","id_mensagem","legenda","curtida","comentario","status","detalhe","grupo_origem","data_compartilhamento","salva","comentada","check_grupo","fluxo_completo","marco_administrativo","pasta_correta","colecao_destino","enviado_grupo","comentario_proibido","emoji_reacao","envio_tentado","comentario_tentado","curtida_tentada","salvamento_tentado","reacao_tentada"];

function csvCell(value) {
  const text = String(value ?? "");
  return '"' + text.replaceAll('"', '""') + '"';
}

function parseCsvRows(content) {
  const rows=[]; let row=[]; let value=""; let quoted=false;
  for(let i=0;i<content.length;i++) {
    const char=content[i];
    if(char === '"' && quoted && content[i+1] === '"') { value+='"'; i++; }
    else if(char === '"') quoted=!quoted;
    else if(char === "," && !quoted) { row.push(value); value=""; }
    else if((char === "\n" || char === "\r") && !quoted) {
      if(char === "\r" && content[i+1] === "\n") i++;
      row.push(value); rows.push(row); row=[]; value="";
    } else value+=char;
  }
  if(value.length || row.length) { row.push(value); rows.push(row); }
  return rows;
}

function truthy(value) {
  return ["sim","true","1","yes"].includes(String(value ?? "").trim().toLowerCase());
}

export function ensureHistory() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(HISTORY_FILE)) {
    fs.writeFileSync(HISTORY_FILE, HEADER.join(",") + "\n", "utf8");
    return;
  }
  const content = fs.readFileSync(HISTORY_FILE, "utf8");
  const rows = parseCsvRows(content);
  if (rows[0]?.join(",") === HEADER.join(",")) return;
  const oldHeader = rows[0] ?? [];
  const migrated = [HEADER];
  for (const oldRow of rows.slice(1)) {
    if (!oldRow.some(Boolean)) continue;
    const entry = Object.fromEntries(oldHeader.map((key, index) => [key, oldRow[index] ?? ""]));
    migrated.push([
      entry.data_hora ?? "", entry.url ?? "", entry.id_conversa ?? "", entry.id_mensagem ?? "",
      entry.legenda ?? "", entry.curtida ?? "não", entry.comentario ?? "", entry.status ?? "pendente",
      entry.detalhe ?? "", entry.grupo_origem ?? "", entry.data_compartilhamento ?? "",
      entry.salva ?? "não", entry.comentada ?? "não", entry.check_grupo ?? "não",
      entry.fluxo_completo ?? "não", entry.marco_administrativo ?? "",
      entry.pasta_correta ?? "não", entry.colecao_destino ?? "", entry.enviado_grupo ?? "não", entry.comentario_proibido ?? "não", entry.emoji_reacao ?? "", entry.envio_tentado ?? "não", entry.comentario_tentado ?? "não", entry.curtida_tentada ?? "não", entry.salvamento_tentado ?? "não", entry.reacao_tentada ?? "não"
    ]);
  }
  fs.writeFileSync(HISTORY_FILE, migrated.map(row => row.map(csvCell).join(",")).join("\n") + "\n", "utf8");
}

export function readHistory() {
  ensureHistory();
  return fs.readFileSync(HISTORY_FILE, "utf8");
}

function historyEntries() {
  ensureHistory();
  const rows = parseCsvRows(fs.readFileSync(HISTORY_FILE, "utf8"));
  const headers = rows[0] ?? HEADER;
  return rows.slice(1).filter(row => row[1]).map(row =>
    Object.fromEntries(headers.map((key, index) => [key, row[index] ?? ""]))
  );
}

export function getTaskState(url, groupThreadId = "", messageId = "", completionEmoji = "🌸") {
  // A publicação só tem identidade suficiente quando está vinculada à conversa e à mensagem exatas.
  if (!url || !groupThreadId || !messageId) return { saved: false, savedFolderVerified: false, liked: false, commented: false, sharedToGroup:false, shareAttempted:false, commentAttempted:false, likeAttempted:false, saveAttempted:false, reactionAttempted:false, commentForbidden:false, groupCheck: false, reactionEmoji:"", complete: false };
  const entries = historyEntries().filter(entry => entry.url === url && entry.id_conversa === String(groupThreadId) && entry.id_mensagem === String(messageId));
  const latest = entries.at(-1) ?? {};
  const saved = truthy(latest.salva);
  const savedFolderVerified = truthy(latest.pasta_correta);
  const liked = truthy(latest.curtida);
  const commented = truthy(latest.comentada);
  const reactionEmoji = String(latest.emoji_reacao ?? "");
  const groupCheck = truthy(latest.check_grupo) && reactionEmoji === completionEmoji;
  const sharedToGroup = truthy(latest.enviado_grupo);
  const shareAttempted = truthy(latest.envio_tentado);
  const commentForbidden = truthy(latest.comentario_proibido);
  const commentAttempted = truthy(latest.comentario_tentado);
  const likeAttempted = truthy(latest.curtida_tentada);
  const saveAttempted = truthy(latest.salvamento_tentado);
  const reactionAttempted = truthy(latest.reacao_tentada);
  return { saved, savedFolderVerified, liked, commented, commentAttempted, likeAttempted, saveAttempted, reactionAttempted, sharedToGroup, shareAttempted, commentForbidden, groupCheck, reactionEmoji, complete: saved && savedFolderVerified && liked && (commented || commentForbidden) && sharedToGroup && groupCheck };
}

export function getCompletedUrls() {
  return new Set(historyEntries().filter(entry =>
    truthy(entry.salva) && truthy(entry.pasta_correta) && truthy(entry.curtida) && (truthy(entry.comentada) || truthy(entry.comentario_proibido)) && truthy(entry.enviado_grupo) && truthy(entry.check_grupo) && Boolean(entry.emoji_reacao)
  ).map(entry => entry.url));
}

// Tentativas de ações sobre a publicação são globais por URL, pois uma mesma
// publicação pode aparecer em várias mensagens de origem. A reação permanece
// vinculada à mensagem exata e é recuperada por getTaskState().
export function getPendingUrlAttempts(url) {
  const entries = historyEntries().filter(entry => entry.url === url);
  const any = key => entries.some(entry => truthy(entry[key]));
  const confirmed = key => entries.some(entry => truthy(entry[key]));
  return {
    likeAttempted: any("curtida_tentada") && !confirmed("curtida"),
    saveAttempted: any("salvamento_tentado") && !(confirmed("salva") && confirmed("pasta_correta")),
    commentAttempted: any("comentario_tentado") && !confirmed("comentada"),
    shareAttempted: any("envio_tentado") && !confirmed("enviado_grupo")
  };
}

// Compatibilidade com versões anteriores: só considera concluído o fluxo inteiro.
export const getProcessedUrls = getCompletedUrls;

export function appendHistory(entry) {
  ensureHistory();
  const groupThreadId = String(entry.groupThreadId ?? "");
  const messageId = String(entry.messageId ?? "");
  const identityVerified = Boolean(entry.url && groupThreadId && messageId);
  const previous = identityVerified ? getTaskState(entry.url, groupThreadId, messageId, entry.completionEmoji || "🌸") : {};
  const state = {
    saved: Boolean(previous.saved || entry.saved),
    savedFolderVerified: Boolean(previous.savedFolderVerified || entry.savedFolderVerified),
    liked: Boolean(previous.liked || entry.liked),
    commented: Boolean(previous.commented || entry.commented),
    groupCheck: Boolean(previous.groupCheck || (entry.groupCheck && entry.completionEmoji)),
    sharedToGroup: Boolean(previous.sharedToGroup || entry.sharedToGroup),
    shareAttempted: entry.sharedToGroup ? false : Boolean(previous.shareAttempted || entry.shareAttempted),
    commentForbidden: Boolean(previous.commentForbidden || entry.commentForbidden),
    // Tentativas são pendências, não um histórico eterno: confirmação posterior
    // do estado real resolve a pendência e libera uma futura mudança legítima.
    commentAttempted: entry.commented ? false : Boolean(previous.commentAttempted || entry.commentAttempted),
    likeAttempted: entry.liked ? false : Boolean(previous.likeAttempted || entry.likeAttempted),
    saveAttempted: entry.saved && entry.savedFolderVerified ? false : Boolean(previous.saveAttempted || entry.saveAttempted),
    reactionAttempted: entry.groupCheck ? false : Boolean(previous.reactionAttempted || entry.reactionAttempted),
    reactionEmoji: entry.groupCheck && entry.completionEmoji ? entry.completionEmoji : (previous.reactionEmoji || "")
  };
  const complete = identityVerified && state.saved && state.savedFolderVerified && state.liked && (state.commented || state.commentForbidden) && state.sharedToGroup && state.groupCheck;
  const row = [
    entry.date ?? new Date().toISOString(), entry.url, groupThreadId, messageId, entry.caption ?? "",
    state.liked ? "sim" : "não", entry.comment ?? "", entry.status ?? "pendente",
    entry.detail ?? "", entry.groupName ?? "", entry.sharedAt ?? "",
    state.saved ? "sim" : "não", state.commented ? "sim" : "não",
    state.groupCheck ? "sim" : "não", complete ? "sim" : "não",
    entry.milestone ? JSON.stringify(entry.milestone) : "", state.savedFolderVerified ? "sim" : "não", entry.collectionName ?? "", state.sharedToGroup ? "sim" : "não", state.commentForbidden ? "sim" : "não", state.reactionEmoji, state.shareAttempted ? "sim" : "não", state.commentAttempted ? "sim" : "não", state.likeAttempted ? "sim" : "não", state.saveAttempted ? "sim" : "não", state.reactionAttempted ? "sim" : "não"
  ];
  fs.appendFileSync(HISTORY_FILE, row.map(csvCell).join(",") + "\n", "utf8");
}

export function getRecentComments(limit=200) {
  ensureHistory();
  const rows=parseCsvRows(fs.readFileSync(HISTORY_FILE,"utf8"));
  return rows.slice(1).reverse().map(row=>row[4] ?? "").filter(Boolean).slice(0,Math.max(0,limit));
}
