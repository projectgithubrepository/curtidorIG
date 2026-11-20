import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.resolve("data");
const HISTORY_FILE = path.join(DATA_DIR, "historico.csv");
const HEADER = ["data_hora","url","legenda","curtida","comentario","status","detalhe","grupo_origem","data_compartilhamento","salva","comentada","check_grupo","fluxo_completo","marco_administrativo"];

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
      entry.data_hora ?? "", entry.url ?? "", entry.legenda ?? "", entry.curtida ?? "não",
      entry.comentario ?? "", entry.status ?? "", entry.detalhe ?? "", entry.grupo_origem ?? "",
      entry.data_compartilhamento ?? "", "não", "não", "não", "não", ""
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

export function getTaskState(url) {
  const entries = historyEntries().filter(entry => entry.url === url);
  const latest = entries.at(-1) ?? {};
  const saved = truthy(latest.salva);
  const liked = truthy(latest.curtida);
  const commented = truthy(latest.comentada);
  const groupCheck = truthy(latest.check_grupo);
  return { saved, liked, commented, groupCheck, complete: saved && liked && commented && groupCheck };
}

export function getCompletedUrls() {
  return new Set(historyEntries().filter(entry =>
    truthy(entry.salva) && truthy(entry.curtida) && truthy(entry.comentada) && truthy(entry.check_grupo)
  ).map(entry => entry.url));
}

// Compatibilidade com versões anteriores: só considera concluído o fluxo inteiro.
export const getProcessedUrls = getCompletedUrls;

export function appendHistory(entry) {
  ensureHistory();
  const row = [
    entry.date ?? new Date().toISOString(), entry.url, entry.caption ?? "",
    entry.liked ? "sim" : "não", entry.comment ?? "", entry.status ?? "pendente",
    entry.detail ?? "", entry.groupName ?? "", entry.sharedAt ?? "",
    entry.saved ? "sim" : "não", entry.commented ? "sim" : "não",
    entry.groupCheck ? "sim" : "não", entry.complete ? "sim" : "não",
    entry.milestone ? JSON.stringify(entry.milestone) : ""
  ];
  fs.appendFileSync(HISTORY_FILE, row.map(csvCell).join(",") + "\n", "utf8");
}

export function getRecentComments(limit=200) {
  ensureHistory();
  const rows=parseCsvRows(fs.readFileSync(HISTORY_FILE,"utf8"));
  return rows.slice(1).reverse().map(row=>row[4] ?? "").filter(Boolean).slice(0,Math.max(0,limit));
}
