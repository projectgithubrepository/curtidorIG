import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openInstagram, collectGroupPosts, inspectPost, inspectSavedCollection, unsaveSavedCollectionItem, executeLike, executeSaveToCollection, executeComment, executeShareToGroup, executeCompletionReaction } from "./instagram.js";
import { createComment } from "./comments.js";
import { appendHistory, getTaskState, getRecentComments, readHistory } from "./history.js";
import { mergeTaskState, taskStateLabel } from "./group-state.js";
import { buildExecutionPlan, interpretGroupInstructions } from "./execution-plan.js";

// Keep Direct network diagnostics metadata-only.
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
let cleanupResults = [];
let cleanupProgress = { total: 0, done: 0, current: "", mode: "test", collectionName: "", message: "Nenhuma limpeza iniciada." };

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
    taskState: item.taskState || null,
    stateVerification: item.stateVerification || null,
    identityVerified: Boolean(item.identityVerified),
    inspectionDiagnostics: item.inspectionDiagnostics || null,
    plan: item.plan || [],
    actionLog: item.actionLog || []
  };
}

app.get("/api/diagnostic-report", (_req, res) => {
  if (!diagnosticReport) return res.status(404).json({ error: "Ainda não há relatório. Execute uma coleta primeiro." });
  res.setHeader("Content-Disposition", 'attachment; filename="curtidorig-relatorio-diagnostico.json"');
  res.json(diagnosticReport);
});

app.get("/api/diagnostic-log", (_req, res) => {
  if (!diagnosticReport) return res.status(404).type("text/plain; charset=utf-8").send("Ainda não há diagnóstico. Execute uma coleta primeiro.");

  const report = diagnosticReport;
  const network = report.networkDiagnostics || {};
  const summary = report.summary || {};
  const operationLines = (network.operationDetails || []).slice(0, 8).map(item =>
    `- ${item.operation}: ${item.responses} resposta(s), ${item.messageLikeObjects} mensagem(ns), ${item.sharedMediaObjects} compartilhamento(s)`
  );
  const errorLines = (report.log || []).filter(item => item.level === "ERROR" || item.level === "WARN").slice(-5)
    .map(item => `- [${item.level}] ${item.message}`);
  const inspectionLines = (report.publications || []).filter(item => item.inspectionDiagnostics).slice(0, 40)
    .map(item => {
      const detail = item.inspectionDiagnostics;
      const selectors = detail.selectors || {};
      return `- ${item.url || "URL não informada"} | legenda: ${detail.captionAvailable === false ? "não legível" : "disponível"} | motivo: ${detail.reason || "ok"} | HTTP: ${detail.httpStatus ?? "?"} | artigo: ${selectors.article ? "sim" : "não"} | main: ${selectors.main ? "sim" : "não"} | diálogo: ${selectors.dialog ? "sim" : "não"} | mídia: ${detail.detectedMedia ? "sim" : "não"} | URL final: ${detail.finalUrl || "?"}`;
    });
  const planLines = (report.publications || []).slice(0, 40).map(item => {
    const actions = (item.plan || []).map(action => `${action.label}: ${action.status}${action.reason ? " (" + action.reason + ")" : ""}`).join(" | ");
    return `- ${item.url || "URL não informada"} | ${item.status || "sem status"} | ${actions || "planejamento indisponível"}`;
  });
  const page = report.pageDiagnostics || {};
  const scroll = report.scrollDiagnostics || {};
  const scrollLines = scroll.historyRounds !== undefined ? [
    "",
    "NAVEGAÇÃO DO HISTÓRICO",
    `Rodadas: ${scroll.historyRounds} | Com avanço: ${scroll.scrollProgressRounds} | Sem avanço no final: ${scroll.stalledRounds}`,
    `Contêiner de conversa localizado: ${scroll.scrollTargetFound ? "sim" : "não"} | Tentativas com roda do mouse: ${scroll.wheelFallbackRounds}`,
    ...(scroll.lastScrollState ? [
      `Antes: scrollTop ${scroll.lastScrollState.before?.scrollTop ?? "?"} / altura ${scroll.lastScrollState.before?.scrollHeight ?? "?"} | Depois: scrollTop ${scroll.lastScrollState.after?.scrollTop ?? "?"} / altura ${scroll.lastScrollState.after?.scrollHeight ?? "?"}`,
      `Alvo: ${scroll.lastScrollState.before?.tag || "não localizado"} | flex-direction: ${scroll.lastScrollState.before?.flexDirection || "?"} | marcadores de mensagem: ${scroll.lastScrollState.before?.messageMarkers ?? "?"}`
    ] : [])
  ] : [];
  const lines = [
    "CURTIDORIG | DIAGNÓSTICO",
    `Resultado: ${report.outcome || "indisponível"}`,
    `Grupo: ${report.request?.groupName || "não informado"} | Período: ${report.request?.startDate || "?"} a ${report.request?.endDate || "?"}`,
    `Coleção de destino: ${report.request?.collectionName || "não informada"}`,
    `Publicações: ${summary.publicationsFound ?? report.publications?.length ?? 0} | Feed/Reels: ${summary.feedsAndReels ?? "?"} | Stories: ${summary.stories ?? "?"} | Marcos administrativos: ${summary.administrativeMilestones ?? "?"} | Sem data: ${summary.itemsWithoutDate ?? "?"}`,
    ...(report.request?.mode === "test" ? [`PLANO DE TESTE: ${summary.publicationsInspected ?? 0} itens processados | ${summary.inspectionFailures ?? 0} inspeções interrompidas | ${summary.captionUnavailable ?? 0} sem legenda legível | ${summary.storiesBlocked ?? 0} Stories bloqueadas | ${summary.plannedActions ?? 0} etapas planejadas | ${summary.unverifiedActions ?? 0} ações não verificadas | Inventário da coleção: ${summary.savedCollectionInventoryAvailable ? "confirmado" : "indisponível"}`] : []),
    "",
    "CAPTURA DE REDE",
    `Respostas: ${network.capturedResponses ?? 0} | Lidas: ${network.parsedResponses ?? 0} | Não interpretadas: ${network.unparsedResponses ?? 0}`,
    `WebSockets: ${network.websocketConnections ?? 0} conexão(ões), ${network.websocketFrames ?? 0} quadro(s), ${network.unparsedWebSocketFrames ?? 0} não interpretado(s)`,
    ...(network.websocketEndpoints?.length ? [`Canais WS: ${network.websocketEndpoints.join(", ")}`] : []),
    `IDs de mensagens distintos: ${network.distinctMessageIds ?? 0} | Objetos de compartilhamento: ${network.sharedMediaObjects ?? 0}`,
    `Campos: ID ${network.hasMessageId ? "sim" : "não"}; texto ${network.hasTextBody ? "sim" : "não"}; data/hora ${network.hasTimestampMs ? "sim" : "não"}; remetente ${network.hasSender ? "sim" : "não"}; reações ${network.hasReactionFields ? "sim" : "não"}; compartilhamentos ${network.hasShareFields ? "sim" : "não"}; URL ${network.hasPermalinkOrUrl ? "sim" : "não"}`,
    "Operações:",
    ...(operationLines.length ? operationLines : ["- Nenhuma operação identificada"]),
    ...((network.responseDetails || []).length ? ["Endpoints capturados:", ...(network.responseDetails || []).slice(0, 12).map(item => `- ${item.method || "?"} ${item.path || "?"} | ${item.status || "?"} | ${item.operation || "sem operação"} | ${item.payload?.messageLikeObjects ?? 0} mensagem(ns)`)] : []),
    ...(page.instagramLinks !== undefined ? ["", `PÁGINA: ${page.instagramLinks} links Instagram / ${page.anchors ?? "?"} links totais / ${page.messageNodes ?? "?"} nós de mensagem`] : []),
    ...scrollLines,
    ...(inspectionLines.length ? ["", "INSPEÇÃO DAS PUBLICAÇÕES:", ...inspectionLines] : []),
    ...(planLines.length ? ["", "PLANO INDIVIDUAL POR PUBLICAÇÃO:", ...planLines] : []),
    ...(errorLines.length ? ["", "ERROS/AVISOS:", ...errorLines] : []),
    "",
    `Gerado: ${report.generatedAt || new Date().toISOString()}`,
    "Sem texto privado de mensagens, cookies, tokens ou senhas."
  ];
  res.setHeader("Content-Disposition", 'attachment; filename="curtidorig-diagnostico.txt"');
  res.type("text/plain; charset=utf-8").send(lines.join("\n"));
});

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
  hasDiagnostic: Boolean(diagnosticReport),
  progress
}));
app.get("/api/results", (_req, res) => res.json({ results }));
app.get("/api/cleanup-results", (_req, res) => res.json({ results: cleanupResults, progress: cleanupProgress }));
app.get("/api/history", (_req, res) => res.type("text/csv; charset=utf-8").send(readHistory()));

app.post("/api/confirm-action", (req, res) => {
  const url = String(req.body.url ?? "");
  const messageId = String(req.body.messageId ?? "");
  const threadId = String(req.body.threadId ?? "");
  const action = String(req.body.action ?? "");
  const allowed = new Set(["saved", "savedFolderVerified", "liked", "commented", "sharedToGroup", "groupCheck"]);
  if (!url || !allowed.has(action)) return res.status(400).json({ error: "Publicação ou ação inválida." });

  const item = results.find(entry => entry.url === url && entry.messageId === messageId && entry.threadId === threadId);
  if (!item) return res.status(404).json({ error: "Publicação não encontrada nesta execução. Faça uma nova coleta." });
  if (!item.identityVerified || !item.threadId || !item.messageId) {
    return res.status(409).json({ error: "Não há vínculo comprovado com a mensagem original. A confirmação foi bloqueada." });
  }
  const current = mergeTaskState({}, item.taskState || {});
  if (action === "savedFolderVerified" && !diagnosticReport?.request?.collectionName) {
    return res.status(409).json({ error: "A coleção de destino não foi informada nesta execução." });
  }
  if (action === "savedFolderVerified" && !current.saved) {
    return res.status(409).json({ error: "Confirme primeiro que a publicação foi salva." });
  }
  if (action === "groupCheck" && !(current.liked && current.saved && current.savedFolderVerified && (current.commented || current.commentForbidden) && current.sharedToGroup)) return res.status(409).json({ error: "A reação de conclusão só pode ser registrada depois de curtir, salvar na coleção e enviar ao grupo coletivo; o comentário também precisa estar concluído, salvo proibição explícita." });
  if (current[action]) return res.json({ ok: true, taskState: current, status: item.status, unchanged: true });

  const taskState = mergeTaskState(current, { [action]: true });
  const labels = {
    saved: "salva",
    savedFolderVerified: "pasta de destino conferida",
    liked: "curtida",
    commented: "comentário publicado",
    sharedToGroup: "enviado ao grupo coletivo",
    groupCheck: "reação aplicada à mensagem original"
  };
  item.taskState = taskState;
  item.status = taskStateLabel(taskState);
  appendHistory({
    url: item.url,
    groupThreadId: item.threadId,
    messageId: item.messageId,
    caption: item.caption || "",
    comment: item.comment || "",
    status: item.status,
    groupName: diagnosticReport?.request?.groupName || item.groupName || "",
    collectionName: diagnosticReport?.request?.collectionName || "",
    sharedAt: item.sharedAt || "",
    saved: taskState.saved,
    savedFolderVerified: taskState.savedFolderVerified,
    liked: taskState.liked,
    commented: taskState.commented,
    sharedToGroup: taskState.sharedToGroup,
    commentForbidden: taskState.commentForbidden,
    groupCheck: taskState.groupCheck,
    completionEmoji: diagnosticReport?.request?.completionEmoji || "🌸",
    milestone: item.administrativeMilestones,
    detail: "Confirmação manual: " + labels[action]
  });
  if (diagnosticReport?.publications) {
    const reportItem = diagnosticReport.publications.find(entry => entry.url === url);
    if (reportItem) {
      reportItem.taskState = taskState;
      reportItem.status = item.status;
    }
  }
  logDiagnostic("INFO", "Ação confirmada manualmente", { action, url, messageId: item.messageId });
  res.json({ ok: true, taskState, status: item.status });
});


app.post("/api/cleanup", async (req, res) => {
  if (running) return res.status(409).json({ error: "Já existe uma operação em andamento." });
  const collectionName = String(req.body.collectionName ?? "").trim();
  const mode = String(req.body.mode ?? "test").toLowerCase();
  const confirmed = req.body.confirm === true;
  if (!collectionName) return res.status(400).json({ error: "Informe o nome exato da coleção dos Salvos." });
  if (!["test", "automatic"].includes(mode)) return res.status(400).json({ error: "Modo inválido. Use TESTE ou AUTOMÁTICO." });
  if (mode === "automatic" && !confirmed) return res.status(400).json({ error: "A limpeza automática exige confirmação explícita." });
  running = true; stopRequested = false; cleanupResults = [];
  cleanupProgress = { total: 0, done: 0, current: collectionName, mode, collectionName, message: "Abrindo os Salvos..." };
  res.json({ ok: true, message: mode === "test" ? "Teste iniciado: nenhuma publicação será alterada." : "Limpeza automática iniciada, item por item." });
  (async () => {
    try {
      const context = await getInstagramContext();
      const page = context.pages()[0] || await context.newPage();
      const collection = await inspectSavedCollection(page, collectionName);
      cleanupProgress.total = collection.items.length;
      cleanupProgress.message = `${collection.items.length} publicações encontradas em “${collectionName}”.`;
      for (const [index, item] of collection.items.entries()) {
        if (stopRequested) break;
        cleanupProgress.current = item.url;
        if (mode === "test") cleanupResults.push({ ...item, status: "salva na coleção — seria dessalva individualmente; teste não altera nada" });
        else {
          const result = await unsaveSavedCollectionItem(page, item.url);
          cleanupResults.push({ ...item, ...result });
          if (!result.status.startsWith("dessalvada") && !result.status.startsWith("já dessalva")) { cleanupProgress.message = "Processo interrompido por segurança: " + result.status; break; }
        }
        cleanupProgress.done = index + 1;
        cleanupProgress.message = `${cleanupProgress.done} de ${cleanupProgress.total} itens verificados.`;
      }
      if (cleanupProgress.message.startsWith("Processo interrompido por segurança:")) { /* preserva o motivo da interrupção */ } else cleanupProgress.message = stopRequested ? "Limpeza interrompida pelo usuário." : mode === "test" ? `Teste concluído: ${cleanupResults.length} itens listados. Nenhum salvamento foi alterado.` : `Limpeza finalizada: ${cleanupResults.filter(item => item.status.startsWith("dessalvada") || item.status.startsWith("já dessalva")).length} itens verificados.`;
    } catch (error) { cleanupProgress.message = error.message; }
    finally { running = false; cleanupProgress.current = ""; }
  })();
});

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
  const collectionName = String(req.body.collectionName ?? "").trim();
  const destinationGroupName = String(req.body.destinationGroupName ?? "").trim();
  const mode = String(req.body.mode ?? "test").toLowerCase();
  const completionEmoji = String(req.body.completionEmoji ?? "🌸").trim() || "🌸";
  const confirmed = req.body.confirm === true;
  const startDate = String(req.body.startDate ?? "");
  const endDate = String(req.body.endDate ?? "");
  if (!groupName) return res.status(400).json({ error: "Informe o nome exato do grupo do Instagram." });
  if (!collectionName) return res.status(400).json({ error: "Informe o nome exato da coleção semanal de destino." });
  if (!["test","automatic","manual"].includes(mode)) return res.status(400).json({ error: "Modo inválido." });
  if (mode === "automatic" && !confirmed) return res.status(400).json({ error: "A execução automática exige confirmação explícita." });
  if (mode === "automatic" && !destinationGroupName) return res.status(400).json({ error: "Informe o nome exato do grupo coletivo de envios." });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || startDate > endDate) {
    return res.status(400).json({ error: "Informe um período válido, com data inicial anterior ou igual à final." });
  }

  running = true;
  stopRequested = false;
  results = [];
  diagnosticLog = [];
  diagnosticReport = null;
  const startedAt = new Date().toISOString();
  logDiagnostic("INFO", "Coleta iniciada", { groupName, startDate, endDate, mode, destinationGroupName, collectionName });
  progress = { total: 0, done: 0, current: groupName, message: "Abrindo o Instagram..." };
  res.json({ ok: true, message: mode === "automatic" ? "Coleta e execução automática iniciadas. Cada ação será verificada." : mode === "manual" ? "Coleta iniciada em modo manual." : "Teste iniciado: nenhuma ação será executada no Instagram." });

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
      let savedCollectionUrls = null;
      let savedCollectionInventoryAvailable = false;
      if (mode === "automatic" || mode === "test") {
        progress.message = `Conferindo a coleção “${collectionName}” para validar o destino do salvamento...`;
        try {
          const savedCollection = await inspectSavedCollection(page, collectionName);
          savedCollectionUrls = new Set(savedCollection.items.map(item => new URL(item.url).pathname.replace(/\/$/, "")));
          savedCollectionInventoryAvailable = true;
          logDiagnostic("INFO", "Coleção de destino localizada e inventariada", { collectionName, existingItems: savedCollectionUrls.size, mode });
        } catch (error) {
          logDiagnostic(mode === "test" ? "WARN" : "ERROR", "Não foi possível inventariar a coleção de destino", { collectionName, mode, error: error.message });
          if (mode === "automatic") throw error;
        }
      }
      progress.total = collected.length;
      const withoutDate = collected.filter(item => item.dateUnknown).length;
      const withoutIdentity = collected.filter(item => !item.identityVerified).length;
      const usedFallback = collected.some(item => item.collectionMode === "last-300-fallback");
      const milestoneCount = new Set(collected.flatMap(item => (item.administrativeMilestones || []).map(marker => marker.text))).size;
      const network = collected[0]?.networkDiagnostics;
      const networkStatus = network
        ? `Rede Instagram: ${network.capturedResponses} respostas; ${network.messageLikeObjects} objetos de mensagem; reações ${network.hasReactionFields ? "presentes" : "não detectadas"}; compartilhamentos ${network.hasShareFields ? "presentes" : "não detectados"}.`
        : "Diagnóstico de rede indisponível.";
      progress.message = `${collected.length} links encontrados${usedFallback ? " pela varredura de recuperação" : ""}; ${withoutDate} sem data identificável; ${milestoneCount} marcos administrativos identificados; ${withoutIdentity} itens sem vínculo comprovado com mensagem. ${networkStatus} Verificando histórico...`;
      const previous = getRecentComments(200);
      logDiagnostic("INFO", "Iniciando inspeção e planejamento das publicações", { total: collected.length, mode });
      for (const item of collected) {
        if (stopRequested) break;
        const previousState = mergeTaskState(getTaskState(item.url, item.threadId, item.messageId, completionEmoji), {});
        const instructions = interpretGroupInstructions(item.messageText || "");
        if (item.contentType === "story") {
          const plan = buildExecutionPlan({ mode, collectionName, completionEmoji, taskState: previousState, instructions });
          const result = { ...item, taskState: previousState, caption: "", comment: "", plan: plan.map(action => ({...action,status:"bloqueada",reason:"Publicações do tipo Story ainda exigem fluxo específico; nenhuma ação foi executada."})), status: "Story identificada — ações automáticas indisponíveis nesta versão" };
          results.push(result);
          appendHistory({ url:item.url, groupThreadId:item.threadId, messageId:item.messageId, status:result.status, groupName, collectionName, sharedAt:item.sharedAt, saved:previousState.saved, savedFolderVerified:previousState.savedFolderVerified, liked:previousState.liked, commented:previousState.commented, sharedToGroup:previousState.sharedToGroup, groupCheck:previousState.groupCheck, completionEmoji, commentForbidden:instructions.comment==="forbidden", detail:result.status });
          progress.done++;
          continue;
        }
        try {
          const inspection = await inspectPost(page, item.url);
          const collectionKey = new URL(item.url).pathname.replace(/\/$/, "");
          const savedFolderVerified = Boolean(inspection.observedState.saved && savedCollectionInventoryAvailable && savedCollectionUrls?.has(collectionKey));
          let taskState = mergeTaskState(previousState, { ...inspection.observedState, savedFolderVerified, commentForbidden: instructions.comment === "forbidden" });
          const comment = taskState.commented || instructions.comment === "forbidden" || !inspection.caption ? "" : createComment(inspection.caption, [...previous, ...results.map(r => r.comment).filter(Boolean)]);
          const stateKnown = {
            liked: inspection.stateKnown?.liked ?? false,
            saveToCollection: Boolean(savedCollectionInventoryAvailable && inspection.stateKnown?.saved),
            commented: inspection.stateKnown?.commented ?? false
          };
          const actionLog = [];
          if (mode === "automatic" && !item.identityVerified) {
            actionLog.push({action:"all",status:"bloqueada",reason:"A publicação não está vinculada a uma mensagem original identificada; nenhuma ação foi executada."});
          } else if (mode === "automatic") {
            if (taskState.shareAttempted && !taskState.sharedToGroup) actionLog.push({action:"shareToGroup",status:"bloqueada",reason:"Houve uma tentativa anterior sem confirmação. Verifique o grupo antes de confirmar manualmente; o app não enviará novamente para evitar duplicidade."});
            const steps = [
              ["like", !taskState.liked, async () => executeLike(page,item.url), "liked"],
              ["saveToCollection", !(taskState.saved && taskState.savedFolderVerified), async () => executeSaveToCollection(page,item.url,collectionName,savedCollectionUrls), "saved"],
              ["comment", instructions.comment !== "forbidden" && !taskState.commented, async () => executeComment(page,item.url,comment), "commented"],
              ["shareToGroup", !taskState.sharedToGroup && !taskState.shareAttempted, async () => executeShareToGroup(page,item.url,destinationGroupName, async () => {
  taskState = mergeTaskState(taskState,{shareAttempted:true});
  appendHistory({url:item.url,groupThreadId:item.threadId,messageId:item.messageId,caption:inspection.caption,comment,groupName,collectionName,sharedToGroup:false,shareAttempted:true,liked:taskState.liked,saved:taskState.saved,savedFolderVerified:taskState.savedFolderVerified,commented:taskState.commented,commentForbidden:instructions.comment==="forbidden",completionEmoji,groupCheck:taskState.groupCheck,status:"envio iniciado — aguardando confirmação",detail:"Tentativa de envio registrada antes do clique final"});
}), "sharedToGroup"]
            ];
            let blocked = false;
            for (const [action,needed,run,key] of steps) {
              if (stopRequested) { actionLog.push({action,status:"interrompida pelo usuário"}); blocked=true; break; }
              if (!needed) continue;
              if (action === "comment" && !comment) { actionLog.push({action,status:"bloqueada",reason:"Comentário não passou na validação."}); blocked=true; break; }
              try {
                const outcome = await run();
                taskState = mergeTaskState(taskState, { [key]: true, ...(action==="saveToCollection"?{savedFolderVerified:true}:{}) });
                actionLog.push({action,status:outcome.status});
                appendHistory({url:item.url,groupThreadId:item.threadId,messageId:item.messageId,caption:inspection.caption,comment,groupName,collectionName,sharedAt:item.sharedAt,saved:taskState.saved,savedFolderVerified:taskState.savedFolderVerified,liked:taskState.liked,commented:taskState.commented,sharedToGroup:taskState.sharedToGroup,groupCheck:taskState.groupCheck,completionEmoji,commentForbidden:instructions.comment==="forbidden",status:taskStateLabel(taskState),detail:"Ação automática verificada: "+action});
              } catch (error) {
                actionLog.push({action,status:"bloqueada",reason:error.message});
                logDiagnostic("WARN","Ação automática interrompida",{action,url:item.url,error:error.message});
                blocked=true; break;
              }
            }
            const requiredDone = taskState.liked && taskState.saved && taskState.savedFolderVerified && (taskState.commented || instructions.comment==="forbidden") && taskState.sharedToGroup;
            if (requiredDone && !taskState.groupCheck && !stopRequested) {
              try {
                const outcome = await executeCompletionReaction(page,item,completionEmoji);
                taskState = mergeTaskState(taskState,{groupCheck:true});
                actionLog.push({action:"completionReaction",status:outcome.status});
                appendHistory({url:item.url,groupThreadId:item.threadId,messageId:item.messageId,caption:inspection.caption,comment,groupName,collectionName,sharedAt:item.sharedAt,saved:taskState.saved,savedFolderVerified:taskState.savedFolderVerified,liked:taskState.liked,commented:taskState.commented,sharedToGroup:taskState.sharedToGroup,groupCheck:true,completionEmoji,commentForbidden:instructions.comment==="forbidden",status:taskStateLabel(taskState),detail:"Reação de conclusão verificada"});
              } catch(error) {
                actionLog.push({action:"completionReaction",status:"bloqueada",reason:error.message});
                logDiagnostic("WARN","Reação à mensagem original bloqueada",{url:item.url,error:error.message});
              }
            } else if (!requiredDone) {
              actionLog.push({action:"completionReaction",status:"aguardando etapas obrigatórias"});
            }
          }
          let plan = buildExecutionPlan({ mode, collectionName, completionEmoji, taskState, comment, instructions, stateKnown });
          if (mode === "automatic") {
            plan = plan.map(entry => {
              const logged = actionLog.find(record => record.action === entry.action);
              if (logged) return { ...entry, status:logged.status, reason:logged.reason || "" };
              if (actionLog.some(record => record.action === "all" && record.status === "bloqueada")) return { ...entry, status:"bloqueada", reason:actionLog[0].reason };
              if (!entry.alreadyDone && entry.required && !entry.status.startsWith("dispensada") && entry.action !== "completionReaction") return { ...entry, status:"não executada — etapa anterior bloqueada" };
              return entry;
            });
          }
          const result = { ...item, caption:inspection.caption, comment, taskState, stateVerification:{ ...stateKnown, controlCount:inspection.observedState.controlCount || 0, controlLabels:inspection.observedState.controlLabels || "" }, plan, actionLog, inspectionDiagnostics:inspection.inspectionDiagnostics||null, status:taskStateLabel(taskState) };
          results.push(result);
          appendHistory({url:item.url,groupThreadId:item.threadId,messageId:item.messageId,caption:inspection.caption,comment,groupName,collectionName,sharedAt:item.sharedAt,saved:taskState.saved,savedFolderVerified:taskState.savedFolderVerified,liked:taskState.liked,commented:taskState.commented,sharedToGroup:taskState.sharedToGroup,groupCheck:taskState.groupCheck,completionEmoji,commentForbidden:instructions.comment==="forbidden",complete:taskState.complete,milestone:item.administrativeMilestones,detail:mode==="test"?"Simulação sem ações":"Planejamento e execução da publicação"});
        } catch (error) {
          logDiagnostic("ERROR", "Falha ao inspecionar publicação", { url:item.url,error:error.message,inspectionDiagnostics:error.inspectionDiagnostics||null });
          const blockedPlan = buildExecutionPlan({ mode, collectionName, completionEmoji, taskState:previousState, instructions })
            .map(action => ({ ...action, status:"bloqueada — inspeção não concluída", reason:error.message }));
          const result={...item,caption:"",comment:"",taskState:previousState,plan:blockedPlan,actionLog:[],inspectionDiagnostics:error.inspectionDiagnostics||null,status:"inspeção não concluída — ações não verificadas",detail:error.message};
          results.push(result);
          appendHistory({url:item.url,groupThreadId:item.threadId,messageId:item.messageId,status:"erro na análise",groupName,collectionName,sharedAt:item.sharedAt,completionEmoji,detail:error.message});
        }
        progress.done++;
      }
      const finalNetwork = results[0]?.networkDiagnostics || network;
      const finalNetworkStatus = finalNetwork
        ? ` Captura de rede: ${finalNetwork.capturedResponses} respostas, ${finalNetwork.messageLikeObjects} objetos de mensagem; reações ${finalNetwork.hasReactionFields ? "detectadas" : "não detectadas"}.`
        : "";
      const inspectionFailures = results.filter(item => item.status === "inspeção não concluída — ações não verificadas").length;
      const captionUnavailable = results.filter(item => item.inspectionDiagnostics?.captionAvailable === false).length;
      const storiesBlocked = results.filter(item => item.contentType === "story").length;
      const plannedActions = results.reduce((sum,item) => sum + (item.plan?.length || 0), 0);
      const inspectedFeedReels = results.filter(item => item.contentType !== "story" && Boolean(item.stateVerification)).length;
      const unverifiedActions = results.filter(item => item.contentType !== "story").reduce((sum,item) =>
        sum + (item.plan || []).filter(action => /^(não verificada|bloqueada)/.test(action.status)).length, 0);
      const testIncomplete = mode === "test" && (inspectionFailures > 0 || captionUnavailable > 0 || unverifiedActions > 0 || !savedCollectionInventoryAvailable);
      progress.message = mode === "test"
        ? `TESTE ${testIncomplete ? "PARCIAL" : "CONCLUÍDO"}: ${results.length}/${collected.length} publicações listadas; ${inspectionFailures} inspeções interrompidas; ${captionUnavailable} sem legenda legível; ${unverifiedActions} ações sem verificação suficiente; ${storiesBlocked} Stories bloqueadas; ${plannedActions} etapas exibidas. Nenhuma ação foi executada.`
        : mode === "manual" ? `Coleta concluída: ${results.length} itens preparados para execução manual.`
        : `Execução automática finalizada: ${results.length} itens analisados. Consulte o resultado de cada ação.`;
      logDiagnostic("INFO", "Coleta concluída", { listed: results.length, inspectionFailures, captionUnavailable, unverifiedActions, savedCollectionInventoryAvailable, networkResponses: network?.capturedResponses ?? 0 });
      diagnosticReport = {
        schemaVersion: 1,
        application: "curtidorIG",
        generatedAt: new Date().toISOString(),
        startedAt,
        finishedAt: new Date().toISOString(),
        outcome: stopRequested ? "interrompida" : testIncomplete ? "parcial" : "concluída",
        request: { groupName, collectionName, destinationGroupName, mode, completionEmoji, startDate, endDate },
        summary: {
          publicationsFound: collected.length,
          publicationsInspected: inspectedFeedReels,
          administrativeMilestones: new Set(collected.flatMap(item => (item.administrativeMilestones || []).map(marker => marker.text))).size,
          stories: collected.filter(item => item.contentType === "story").length,
          feedsAndReels: collected.filter(item => item.contentType !== "story").length,
          itemsWithoutDate: collected.filter(item => item.dateUnknown).length,
          inspectionFailures,
          captionUnavailable,
          storiesBlocked,
          plannedActions,
          unverifiedActions,
          savedCollectionInventoryAvailable
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
        pageDiagnostics: error.pageDiagnostics || null,
        scrollDiagnostics: error.scrollDiagnostics || null
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
        scrollDiagnostics: error.scrollDiagnostics || null,
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
