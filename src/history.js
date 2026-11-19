import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.resolve("data");
const HISTORY_FILE = path.join(DATA_DIR, "historico.csv");
const HEADER = ["data_hora", "url", "legenda", "curtida", "comentario", "status", "detalhe"];

function csvCell(value) {
  const text = String(value ?? "");
  return '"' + text.replaceAll('"', '""') + '"';
}

export function ensureHistory() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(HISTORY_FILE)) {
    fs.writeFileSync(HISTORY_FILE, HEADER.join(",") + "\n", "utf8");
  }
}

export function readHistory() {
  ensureHistory();
  return fs.readFileSync(HISTORY_FILE, "utf8");
}

export function getProcessedUrls() {
  ensureHistory();
  const rows = fs.readFileSync(HISTORY_FILE, "utf8").split(/\r?\n/).slice(1);
  return new Set(rows.filter(Boolean).map((line) => {
    // URLs são gravadas como segunda coluna CSV; esta leitura simples é segura
    // porque a URL do Instagram não contém vírgulas nem quebras de linha.
    return line.match(/^"[^"]*","([^"]*)"/)?.[1] ?? "";
  }).filter(Boolean));
}

export function appendHistory(entry) {
  ensureHistory();
  const row = [
    entry.date ?? new Date().toISOString(),
    entry.url,
    entry.caption ?? "",
    entry.liked ? "sim" : "não",
    entry.comment ?? "",
    entry.status ?? "erro",
    entry.detail ?? ""
  ];
  fs.appendFileSync(HISTORY_FILE, row.map(csvCell).join(",") + "\n", "utf8");
}

function parseCsvRow(line) {
  const cells=[]; let value=""; let quoted=false;
  for(let i=0;i<line.length;i++) {
    const char=line[i];
    if(char === '"' && quoted && line[i+1] === '"') { value+='"'; i++; }
    else if(char === '"') quoted=!quoted;
    else if(char === "," && !quoted) { cells.push(value); value=""; }
    else value+=char;
  }
  cells.push(value);
  return cells;
}

export function getRecentComments(limit=200) {
  ensureHistory();
  const lines=fs.readFileSync(HISTORY_FILE,"utf8").split(/\r?\n/).filter(Boolean);
  return lines.slice(1).reverse().map(line=>parseCsvRow(line)[4] ?? "")
    .filter(Boolean).slice(0,Math.max(0,limit));
}
