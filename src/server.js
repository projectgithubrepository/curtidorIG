import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openInstagram, collectGroupPosts, inspectPost } from "./instagram.js";
import { createComment } from "./comments.js";
import { appendHistory, getTaskState, getRecentComments, readHistory } from "./history.js";
import { mergeTaskState, taskStateLabel } from "./group-state.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.resolve(__dirname, "../public")));

let running = false;
let stopRequested = false;
let browserContext = null;
let results = [];
let progress = { total: 0, done: 0, current: "", message: "Pronto." };
let diagnosticReport = null;
let diagnosticLog = [];

function logDiagnostic(level, message, details = {}) {
  diagnosticLog.push({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(Object.keys(details).length ? { details } : {})
  });
  if (diagnosticLog.length > 1000) diagnosticLog.shift();
}

function reportItem(item) {
  return {
    url: item.url || "",
    contentType: item.contentType || "",
    sharedAt: item.sharedAt || "",
    dateUnknown: Boolean(item.dateUnknown),
    collectionMode: item.collectionMode || "",
    status: item.status || "",
    taskState: item.taskState || null
  };
}

app.get("/api/diagnostic-report", (_req, res) => {
  if (!diagnosticReport) return res.status(404).json({ error: "Ainda não há relatório. Execute uma coleta primeiro." });
  res.setHeader("Content-Disposition", 'attachment; filename="curtidorig-relatorio-diagnostico.json"');
  res.json(diagnosticReport);
});

app.get("/api/diagnostic-log", (_req, res) => {
  if (!diagnosticReport) return res.status(404).type("text/plain; charset=utf-8").send("Ainda não há log. Execute uma coleta primeiro.");
  const lines = [
    "curtidorIG - LOG DE DIAGNÓSTICO",
    `Gerado: ${new Date().toISOString()}`,
    `Grupo: ${diagnosticReport.request?.groupName || "não informado"}`,
    `Período: ${diagnosticReport.request?.startDate || "?"} até ${diagnosticReport.request?.endDate || "?"}`,
    `Resultado: ${diagnosticReport.outcome || "indisponível"}`,
    "",
    ...diagnosticLog.map(entry => {
      const detail = entry.details ? " | " + JSON.stringify(entry.details) : "";
      return `[${entry.timestamp}] [${entry.level}] ${entry.message}${detail}`;
    }),
    "",
    "Resumo técnico:",
    JSON.stringify(diagnosticReport.networkDiagnostics || {}, null, 2),
    "",
    "Diagnóstico da página:",
    JSON.stringify(diagnosticReport.pageDiagnostics || {}, null, 2),
    "",
    "Observação: este log não inclui texto privado de mensagens, cookies, tokens ou senhas."
  ];
  res.setHeader("Content-Disposition", 'attachment; filename="curtidorig-diagnostico.log"');
  res.type("text/plain; charset=utf-8").send(lines.join("\\n"));
}

async function getInstagramContext() {
  if (browserContext) {
    try {
      browserContext.pages();
      return browserContext;
    } catch {
      browserContext = null;
    }
  }
  browserContext = await openInstagram();
  browserContext.on("close", () => { browserContext = null; });
  return browserContext;
}

app.get("/api/status", (_req, res) => res.json({
  running,
  connected: Boolean(browserContext),
  progress
}));
app.get("/api/results", (_req, res) => res.json({ results }));
app.get("/api/history", (_req, res) => res.type("text/csv; charset=utf-8").send(readHistory()));

app.post("/api/connect", async (_req, res) => {
  try {
    const context = await getInstagramContext();
    const page = context.pages()[0] || await context.newPage();
    await page.goto("https://www.instagram.com/direct/inbox/", { waitUntil: "domcontentloaded", timeout: 60000 });
    progress.message = "Instagram aberto. Faça login nessa janela; a sessão será guardada para as próximas vezes.";
    res.json({ ok: true, message: "Janela do Instagram aberta. Faça login e depois clique em Coletar publicações." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/stop", (_req, res) => {
  stopRequested = true;
  res.json({ ok: true, message: "A coleta será interrompida." });
});

app.post("/api/start", async (req, res) => {
  if (running) return res.status(409).json({ error: "Já existe uma coleta em andamento." });
  const groupName = String(req.body.groupName ?? "").trim();
  const startDate = String(req.body.startDate ?? "");
  const endDate = String(req.body.endDate ?? "");
  if (!groupName) return res.status(400).json({ error: "Informe o nome exato do grupo do Instagram." });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || startDate > endDate) {
    return res.status(400).json({ error: "Informe um período válido, com data inicial anterior ou igual à final." });
  }

  running = true;
  stopRequested = false;
  results = [];
  diagnosticLog = [];
  diagnosticReport = null;
  const startedAt = new Date().toISOString();
  logDiagnostic("INFO", "Coleta iniciada", { groupName, startDate, endDate });
  progress = { total: 0, done: 0, current: groupName, message: "Abrindo o Instagram..." };
  res.json({ ok: true, message: "Coleta iniciada." });

  (async () => {
    try {
      const context = await getInstagramContext();
      const page = context.pages()[0] || await context.newPage();
      progress.message = "Localizando a conversa. O nome precisa corresponder exatamente.";
      logDiagnostic("INFO", "Abrindo a caixa de entrada e localizando o grupo");
      const collected = await collectGroupPosts(page, { groupName, startDate, endDate, shouldStop: () => stopRequested });
      logDiagnostic("INFO", "Varredura da conversa concluída", {
        publicationsFound: collected.length,
        administrativeMilestones: new Set(collected.flatMap(item => (item.administrativeMilestones || []).map(marker => marker.text))).size,
        networkResponses: collected[0]?.networkDiagnostics?.capturedResponses ?? 0
      });
      if (stopRequested) return;
      progress.total = collected.length;
      const withoutDate = collected.filter(item => item.dateUnknown).length;
      const usedFallback = collected.some(item => item.collectionMode === "last-300-fallback");
      const milestoneCount = new Set(collected.flatMap(item => (item.administrativeMilestones || []).map(marker => marker.text))).size;
      const network = collected[0]?.networkDiagnostics;
      const networkStatus = network
        ? `Rede Instagram: ${network.capturedResponses} respostas; ${network.messageLikeObjects} objetos de mensagem; reações ${network.hasReactionFields ? "presentes" : "não detectadas"}; compartilhamentos ${network.hasShareFields ? "presentes" : "não detectados"}.`
        : "Diagnóstico de rede indisponível.";
      progress.message = `${collected.length} links encontrados${usedFallback ? " pela varredura de recuperação" : ""}; ${withoutDate} sem data identificável; ${milestoneCount} marcos administrativos identificados. ${networkStatus} Verificando histórico...`;
      const previous = getRecentComments(200);
      logDiagnostic("INFO", "Iniciando inspeção das publicações encontradas", { total: collected.length });
      for (const item of collected) {
        if (stopRequested) break;
        const previousState = mergeTaskState(getTaskState(item.url), { groupCheck: item.groupCheck });
        if (previousState.complete) {
          results.push({ ...item, taskState: previousState, status: "fluxo completo — ignorar", comment: "" });
          progress.done++;
          continue;
        }
        if (item.contentType === "story") {
          const result = { ...item, taskState: previousState, caption: "", comment: "", status: "Story identificada — análise e ações específicas ainda não disponíveis" };
          results.push(result);
          appendHistory({ url: item.url, status: result.status, groupName, sharedAt: item.sharedAt, saved: previousState.saved, savedFolderVerified: previousState.savedFolderVerified, liked: previousState.liked, commented: previousState.commented, groupCheck: previousState.groupCheck, milestone: item.administrativeMilestones, detail: result.status });
          progress.done++;
          continue;
        }
        try {
          const inspection = await inspectPost(page, item.url);
          const taskState = mergeTaskState(previousState, inspection.observedState);
          if (taskState.complete) {
            results.push({ ...item, caption: inspection.caption, taskState, status: "fluxo completo — ignorar", comment: "" });
            appendHistory({ url: item.url, caption: inspection.caption, status: "fluxo completo — ignorar", groupName, sharedAt: item.sharedAt, saved: taskState.saved, savedFolderVerified: taskState.savedFolderVerified, liked: taskState.liked, commented: taskState.commented, groupCheck: taskState.groupCheck, complete: true, milestone: item.administrativeMilestones });
            progress.done++;
            continue;
          }
          const comment = taskState.commented ? "" : createComment(inspection.caption, [...previous, ...results.map(r => r.comment).filter(Boolean)]);
          const result = { ...item, caption: inspection.caption, comment, taskState, status: item.dateUnknown ? "data do compartilhamento não identificada" : taskStateLabel(taskState) };
          results.push(result);
          appendHistory({ url: item.url, caption: inspection.caption, comment, status: result.status, groupName, sharedAt: item.sharedAt, saved: taskState.saved, savedFolderVerified: taskState.savedFolderVerified, liked: taskState.liked, commented: taskState.commented, groupCheck: taskState.groupCheck, complete: taskState.complete, milestone: item.administrativeMilestones, detail: `Grupo: ${groupName}; mensagem: ${item.sharedAt}; ${result.status}` });
        } catch (error) {
          const result = { ...item, caption: "", comment: "", status: "não foi possível analisar", detail: error.message };
          results.push(result);
          appendHistory({ url: item.url, status: "erro na análise", groupName, sharedAt: item.sharedAt, detail: error.message });
        }
        progress.done++;
      }
      const network = results[0]?.networkDiagnostics;
      const networkStatus = network
        ? ` Captura de rede: ${network.capturedResponses} respostas, ${network.messageLikeObjects} objetos de mensagem; reações ${network.hasReactionFields ? "detectadas" : "não detectadas"}.`
        : "";
      progress.message = `Coleta concluída: ${results.length} itens listados.${networkStatus} Nenhuma ação de curtir, comentar, salvar ou reagir foi executada.`;
      logDiagnostic("INFO", "Coleta concluída", { listed: results.length, networkResponses: network?.capturedResponses ?? 0 });
      diagnosticReport = {
        schemaVersion: 1,
        application: "curtidorIG",
        generatedAt: new Date().toISOString(),
        startedAt,
        finishedAt: new Date().toISOString(),
        outcome: stopRequested ? "interrompida" : "concluída",
        request: { groupName, startDate, endDate },
        summary: {
          publicationsFound: collected.length,
          publicationsInspected: results.length,
          administrativeMilestones: new Set(collected.flatMap(item => (item.administrativeMilestones || []).map(marker => marker.text))).size,
          stories: collected.filter(item => item.contentType === "story").length,
          feedsAndReels: collected.filter(item => item.contentType !== "story").length,
          itemsWithoutDate: collected.filter(item => item.dateUnknown).length
        },
        networkDiagnostics: collected[0]?.networkDiagnostics || null,
        pageDiagnostics: null,
        publications: results.map(reportItem),
        administrativeMilestones: collected[0]?.administrativeMilestones || [],
        log: diagnosticLog
      };
    } catch (error) {
      progress.message = error.message;
      logDiagnostic("ERROR", error.message, {
        name: error.name || "Error",
        networkResponses: error.networkDiagnostics?.capturedResponses ?? null,
        pageDiagnostics: error.pageDiagnostics || null
      });
      diagnosticReport = {
        schemaVersion: 1,
        application: "curtidorIG",
        generatedAt: new Date().toISOString(),
        startedAt,
        finishedAt: new Date().toISOString(),
        outcome: "erro",
        request: { groupName, startDate, endDate },
        summary: { publicationsFound: results.length, publicationsInspected: results.length },
        networkDiagnostics: error.networkDiagnostics || results[0]?.networkDiagnostics || null,
        pageDiagnostics: error.pageDiagnostics || null,
        publications: results.map(reportItem),
        log: diagnosticLog,
        error: { name: error.name || "Error", message: error.message }
      };
    } finally {
      // Mantém o contexto persistente aberto para preservar a sessão autenticada.
      running = false;
      progress.current = "";
      if (stopRequested) progress.message = "Coleta interrompida.";
      logDiagnostic("INFO", "Execução finalizada", { stopped: stopRequested, progressMessage: progress.message });
      if (diagnosticReport) diagnosticReport.log = diagnosticLog;
    }
  })();
});

const port = Number(process.env.PORT || 4173);
app.listen(port, "127.0.0.1", () => console.log(`curtidorIG disponível em http://127.0.0.1:${port}`));
