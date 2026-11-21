import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openInstagram, collectGroupPosts, inspectPost, inspectStory, inspectSavedCollection, inspectDestinationGroup, unsaveSavedCollectionItem, executeLike, executeSaveToCollection, executeComment, executeStoryComment, executeStoryShareToGroup, executeShareToGroup, executeCompletionReaction, getGroupShareState } from "./instagram.js";
import { createComment } from "./comments.js";
import { appendHistory, getTaskState, getRecentComments, readHistory } from "./history.js";
import { mergeTaskState, taskStateLabel, administrativeTargetsForRange } from "./group-state.js";
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
    requestText: item.messageText || "",
    contentType: item.contentType || "",
    sharedAt: item.sharedAt || "",
    dateUnknown: Boolean(item.dateUnknown),
    collectionMode: item.collectionMode || "",
    collectionDiagnostics: item.collectionDiagnostics || null,
    status: item.status || "",
    taskState: item.taskState || null,
    caption: item.caption || "",
    comment: item.comment || "",
    commentSource: item.commentSource || "",
    instructionSummary: item.instructionSummary || null,
    storyInspection: item.storyInspection ? {
      publicCommentAvailable: Boolean(item.storyInspection.publicCommentAvailable),
      publicCommentLabel: item.storyInspection.publicCommentLabel || "",
      usernameKnown: Boolean(item.storyInspection.usernameKnown),
      commentListComplete: Boolean(item.storyInspection.commentListComplete),
      expectedComments: item.storyInspection.expectedComments ?? null,
      commentRowsInspected: item.storyInspection.commentRowsInspected ?? 0,
      alreadyCommented: Boolean(item.storyInspection.alreadyCommented),
      stateKnown: item.storyInspection.stateKnown || null
    } : null,
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

app.get("/api/diagnostic-summary", (_req, res) => {
  if (!diagnosticReport) return res.status(404).type("text/plain; charset=utf-8").send("Ainda não há diagnóstico. Execute uma coleta primeiro.");

  const report = diagnosticReport;
  const summary = report.summary || {};
  const network = report.networkDiagnostics || {};
  const coverage = summary.collectionCoverage || {};
  const scan = report.collectionDiagnostics || {};
  const operations = (network.operationDetails || []).slice(0, 5).map(item =>
    `- ${item.operation}: ${item.responses || 0} respostas / ${item.messageLikeObjects || 0} mensagens / ${item.sharedMediaObjects || 0} compartilhamentos / ${item.storyUrls || 0} URLs de Stories`
  );
  const warnings = (report.log || []).filter(item => item.level === "ERROR" || item.level === "WARN").slice(-4)
    .map(item => `- ${item.level}: ${item.message}`);
  const lines = [
    "CURTIDORIG | RESUMO TÉCNICO FILTRADO",
    `Resultado: ${report.outcome || "indisponível"} | Modo: ${report.request?.mode || "?"}`,
    `Grupo: ${report.request?.groupName || "?"} | Período: ${report.request?.startDate || "?"} a ${report.request?.endDate || "?"}`,
    `Itens: ${summary.publicationsFound ?? report.publications?.length ?? 0} encontrados | ${summary.publicationsInspected ?? 0} inspecionados | Feed/Reels: ${summary.feedsAndReels ?? "?"} | Stories: ${summary.stories ?? "?"}`,
    ...(coverage.available ? [`Referência administrativa: Feed ${coverage.actualFeed}/${coverage.expectedFeed} | Stories ${coverage.actualStories}/${coverage.expectedStories} | ${coverage.matches ? "CONFERE" : "DIVERGÊNCIA"}`] : ["Referência administrativa: indisponível"]),
    `Varredura: ${scan.historyRounds ?? "?"} rodadas | avanço: ${scan.scrollProgressRounds ?? "?"} | topo: ${scan.stableBoundaryReached ? "sim" : "não"} | marco temporal: ${scan.dateBoundaryReached ? "sim" : "não"} | travada: ${scan.historyStalled ? "sim" : "não"}`,
    `Rede: ${network.capturedResponses ?? 0} respostas / ${network.parsedResponses ?? 0} interpretadas / ${network.unparsedResponses ?? 0} não interpretadas`,
    `Direct: ${network.websocketConnections ?? 0} WebSockets / ${network.websocketFrames ?? 0} quadros | IDs de mensagens: ${network.distinctMessageIds ?? 0}`,
    `Stories extraídas da rede: ${network.storyUrlsExtracted ?? 0} ocorrências / ${network.uniqueStoryUrls ?? 0} URLs únicas (WebSocket: ${network.webSocketStoryUrls ?? 0}) | objetos compartilhados: ${network.sharedMediaObjects ?? 0}`,
    ...(scan.storyNetwork ? [
      `Reconciliação de Stories: ${scan.storyNetwork.uniqueNetworkStoryUrls ?? 0} URLs únicas observadas | ${scan.storyNetwork.acceptedInDateRange ?? 0} aceitas na data | ${scan.storyNetwork.pendingDateVerification ?? 0} aguardando data | ${scan.storyNetwork.rejectedOtherThread ?? 0} outra conversa | ${scan.storyNetwork.rejectedWithoutThread ?? 0} sem conversa | ${scan.storyNetwork.rejectedWithoutMessageId ?? 0} sem ID de mensagem | ${scan.storyNetwork.rejectedAdministrativeMessage ?? 0} administrativas | ${scan.storyNetwork.rejectedOutsideDateRange ?? 0} fora do período | ${scan.storyNetwork.finalStoryItems ?? 0} itens finais (${scan.storyNetwork.finalUniqueStoryUrls ?? 0} URLs únicas) | ${scan.storyNetwork.acceptedNetworkUrlsMissingFromFinal ?? 0} aceitas ausentes da lista final`
    ] : ["Reconciliação de Stories: contadores por etapa indisponíveis"]),
    "Operações de rede:",
    ...(operations.length ? operations : ["- Nenhuma identificada"]),
    `Coleção de destino "${report.request?.collectionName || "?"}": ${summary.savedCollectionInventoryAvailable ? "inventariada" : "NÃO localizada/inventariada"}`,
    ...(summary.savedCollectionInventoryError ? [`Falha da coleção: ${String(summary.savedCollectionInventoryError).replace(/\s+/g, " ").slice(0, 350)}`] : []),
    `Grupo coletivo: ${summary.destinationGroupVerification?.verified ? "confirmado" : "não confirmado"}${summary.destinationGroupVerification?.reason ? " — " + String(summary.destinationGroupVerification.reason).replace(/\s+/g, " ").slice(0, 300) : ""}`,
    `Plano: ${summary.plannedActions ?? 0} etapas | aptas: ${summary.mappedActions ?? 0} | candidatas: ${summary.candidateActions ?? 0} | aguardando: ${summary.waitingActions ?? 0} | já concluídas: ${summary.alreadyDoneActions ?? 0} | dispensadas: ${summary.dispensedActions ?? 0} | bloqueadas: ${summary.blockedActions ?? 0} | não verificadas: ${summary.unverifiedActions ?? 0} | sem classificação: ${summary.unclassifiedActions ?? 0} | inspeções interrompidas: ${summary.inspectionFailures ?? 0}`,
    ...(warnings.length ? ["Avisos relevantes:", ...warnings] : ["Avisos relevantes: nenhum"]),
    `Gerado: ${report.generatedAt || "?"}`,
    "Resumo filtrado: sem URLs individuais, legendas, textos de mensagens, payloads, cookies, tokens ou senhas."
  ];
  res.setHeader("Content-Disposition", 'attachment; filename="curtidorig-resumo-filtrado.txt"');
  res.type("text/plain; charset=utf-8").send(lines.join("\n"));
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
  const planLines = (report.publications || []).map((item,index) => {
    const actions = (item.plan || []).map(action =>
      `  ${action.sequence || "?"}. ${action.label || action.action}: ${action.status}${action.testMode?.label ? " — " + action.testMode.label : ""}${action.reason ? " | Motivo: " + action.reason : ""}`
    );
    return [
      `ITEM ${index+1} | ${item.contentType || "publicação"} | ${item.url || "URL não informada"}`,
      `Status: ${item.status || "sem status"} | Identidade da mensagem: ${item.identityVerified ? "confirmada" : "não confirmada"}`,
      `Regra: comentário ${item.instructionSummary?.comment === "forbidden" ? "proibido" : "obrigatório"}; envio ao grupo coletivo obrigatório`,
      `Legenda/conteúdo: ${item.caption?.trim() ? "texto legível disponível" : "não disponível"}`,
      `Comentário preparado: ${item.comment ? "sim" : "não"} | Origem: ${item.commentSource || "não informada"}`,
      `Pedido original no grupo: ${item.requestText?.trim() ? "texto capturado (omitido do diagnóstico)" : "não capturado"}`,
      `Estado atual: curtida=${item.stateVerification?.likedKnown ? (item.stateVerification.liked ? "sim" : "não") : "não verificado"}; coleção=${item.stateVerification?.savedKnown ? (item.stateVerification.saved ? "sim" : "não") : "não verificada"}; comentário anterior=${item.stateVerification?.commentedKnown ? (item.stateVerification.commented ? "sim" : "não") : "não verificado"}`,
      ...actions
    ].join("\n");
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
    ...(summary.destinationGroupVerification ? [`GRUPO COLETIVO: ${summary.destinationGroupVerification.verified ? "confirmado" : "não confirmado"} — ${summary.destinationGroupVerification.reason}`] : []),
    `Publicações: ${summary.publicationsFound ?? report.publications?.length ?? 0} | Feed/Reels: ${summary.feedsAndReels ?? "?"} | Stories: ${summary.stories ?? "?"} | Marcos administrativos: ${summary.administrativeMilestones ?? "?"} | Sem data: ${summary.itemsWithoutDate ?? "?"} | Sem identidade: ${summary.itemsWithoutIdentity ?? "?"}`,
    ...(summary.collectionCoverage?.available ? [`COBERTURA DA DATA: Feed ${summary.collectionCoverage.actualFeed}/${summary.collectionCoverage.expectedFeed} (faltam ${summary.collectionCoverage.missingFeed}, excedentes ${summary.collectionCoverage.excessFeed}); Stories ${summary.collectionCoverage.actualStories}/${summary.collectionCoverage.expectedStories} (faltam ${summary.collectionCoverage.missingStories}, excedentes ${summary.collectionCoverage.excessStories}); total ${summary.collectionCoverage.actualTotal}/${summary.collectionCoverage.expectedTotal}; ${summary.collectionCoverage.matches ? "contagens conferem" : "DIVERGÊNCIA — coleta incompleta ou excedente"}`] : []),
    ...(summary.collectionDiagnostics ? [`VARREDURA: ${summary.collectionDiagnostics.historyRounds} rodadas; limite por data=${summary.collectionDiagnostics.dateBoundaryReached ? "sim" : "não"}; rolagem travada=${summary.collectionDiagnostics.historyStalled ? "sim" : "não"}; limite estável=${summary.collectionDiagnostics.stableBoundaryReached ? "sim" : "não"}; data mais antiga=${summary.collectionDiagnostics.oldestVisibleDate || "não identificada"}; contêiner encontrado=${summary.collectionDiagnostics.scrollTargetFound ? "sim" : "não"}`] : []),
    ...(report.request?.mode === "test" ? ["", "RESUMO PRELIMINAR — AÇÕES POR TIPO", ...(Object.entries(summary.actionTotals || {}).map(([key,value]) => `- ${({like:"Curtidas",saveToCollection:"Salvamentos na coleção",comment:"Comentários",shareToGroup:"Envios ao grupo coletivo",completionReaction:"Reações na mensagem original",commentStory:"Comentários públicos em Stories",shareStoryToGroup:"Envios de Stories ao grupo coletivo"})[key] || key}: ${value.total} previstas | ${value.simulated} simuladas aptas | ${value.unverified} não verificadas | ${value.blocked} bloqueadas | ${value.done} já concluídas`)), "", `PLANO DE TESTE: ${summary.publicationsInspected ?? 0} itens processados | ${summary.inspectionFailures ?? 0} inspeções interrompidas | ${summary.captionUnavailable ?? 0} sem legenda legível | ${summary.storiesBlocked ?? 0} Stories com etapas bloqueadas/não verificadas | ${summary.mappedActions ?? 0} ações simuladas/aptas, mas NÃO EXECUTADAS | ${summary.candidateActions ?? 0} candidatas aguardando verificação/pré-requisitos | ${summary.alreadyDoneActions ?? 0} já concluídas | ${summary.blockedActions ?? 0} bloqueadas | ${summary.unverifiedActions ?? 0} estados não verificados | ${summary.plannedActions ?? 0} etapas no plano | Inventário da coleção: ${summary.savedCollectionInventoryAvailable ? "confirmado" : "indisponível"}`] : []),
    "",
    "CAPTURA DE REDE",
    `Respostas: ${network.capturedResponses ?? 0} | Lidas: ${network.parsedResponses ?? 0} | Não interpretadas: ${network.unparsedResponses ?? 0}`,
    `WebSockets: ${network.websocketConnections ?? 0} conexão(ões), ${network.websocketFrames ?? 0} quadro(s), ${network.unparsedWebSocketFrames ?? 0} não interpretado(s)`,
    ...(network.websocketEndpoints?.length ? [`Canais WS: ${network.websocketEndpoints.join(", ")}`] : []),
    `IDs de mensagens distintos: ${network.distinctMessageIds ?? 0} | Objetos de compartilhamento: ${network.sharedMediaObjects ?? 0} | URLs de Stories extraídas da rede: ${network.storyUrlsExtracted ?? 0} (WebSocket: ${network.webSocketStoryUrls ?? 0})`,
    `Campos: ID ${network.hasMessageId ? "sim" : "não"}; texto ${network.hasTextBody ? "sim" : "não"}; data/hora ${network.hasTimestampMs ? "sim" : "não"}; remetente ${network.hasSender ? "sim" : "não"}; reações ${network.hasReactionFields ? "sim" : "não"}; compartilhamentos ${network.hasShareFields ? "sim" : "não"}; URL ${network.hasPermalinkOrUrl ? "sim" : "não"}`,
    "Operações:",
    ...(operationLines.length ? operationLines : ["- Nenhuma operação identificada"]),
    ...((network.responseDetails || []).length ? ["Endpoints capturados:", ...(network.responseDetails || []).slice(0, 12).map(item => `- ${item.method || "?"} ${item.path || "?"} | ${item.status || "?"} | ${item.operation || "sem operação"} | ${item.payload?.messageLikeObjects ?? 0} mensagem(ns)`)] : []),
    ...(page.instagramLinks !== undefined ? ["", `PÁGINA: ${page.instagramLinks} links Instagram / ${page.anchors ?? "?"} links totais / ${page.messageNodes ?? "?"} nós de mensagem`] : []),
    ...scrollLines,
    ...(inspectionLines.length ? ["", "INSPEÇÃO DAS PUBLICAÇÕES:", ...inspectionLines] : []),
    ...(planLines.length ? ["", "RELATÓRIO DETALHADO — CADA PUBLICAÇÃO E CADA ETAPA:", ...planLines] : []),
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
  progress,
  preliminarySummary: diagnosticReport?.summary || null,
  request: diagnosticReport?.request || null
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
  let collectionName = "";
  const collectionUrl = String(req.body.collectionUrl ?? "").trim();
  let destinationGroupName = "";
  const destinationGroupUrl = String(req.body.destinationGroupUrl ?? "").trim();
  const mode = String(req.body.mode ?? "test").toLowerCase();
  const completionEmoji = String(req.body.completionEmoji ?? "🌸").trim() || "🌸";
  const confirmed = req.body.confirm === true;
  const startDate = String(req.body.startDate ?? "");
  const endDate = String(req.body.endDate ?? "");
  if (!groupName) return res.status(400).json({ error: "Informe o nome exato do grupo do Instagram." });
  if (!collectionUrl) return res.status(400).json({ error: "Informe a URL direta da coleção de Salvos." });
  if (!/^https:\/\/www\.instagram\.com\/[^/]+\/saved\/[^/]+\/\d+\/?(?:[?#].*)?$/i.test(collectionUrl)) return res.status(400).json({ error: "URL da coleção inválida. Use a URL específica da pasta em /usuario/saved/slug/ID/." });
  if (!["test","automatic","manual"].includes(mode)) return res.status(400).json({ error: "Modo inválido." });
  if (mode === "automatic" && !confirmed) return res.status(400).json({ error: "A execução automática exige confirmação explícita." });
  if (mode === "test" || mode === "automatic") {
    if (!destinationGroupUrl) return res.status(400).json({ error: "Informe a URL direta da conversa do grupo coletivo (https://www.instagram.com/direct/t/ID/)." });
    if (!/^https:\/\/www\.instagram\.com\/direct\/t\/\d+\/?(?:[?#].*)?$/i.test(destinationGroupUrl)) return res.status(400).json({ error: "URL do grupo inválida. Informe a URL direta do Instagram no formato https://www.instagram.com/direct/t/ID/." });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || startDate > endDate) {
    return res.status(400).json({ error: "Informe um período válido, com data inicial anterior ou igual à final." });
  }

  running = true;
  stopRequested = false;
  results = [];
  diagnosticLog = [];
  diagnosticReport = null;
  const startedAt = new Date().toISOString();
  logDiagnostic("INFO", "Coleta iniciada", { groupName, startDate, endDate, mode, destinationGroupUrl, collectionUrl });
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
        networkResponses: collected[0]?.networkDiagnostics?.capturedResponses ?? 0,
        storyCollection: collected[0]?.collectionDiagnostics?.storyNetwork || null
      });
      let savedCollectionUrls = null;
      let savedCollectionInventoryAvailable = false;
      let savedCollectionInventoryError = "";
      if (mode === "automatic" || mode === "test") {
        progress.message = `Conferindo a coleção “${collectionName}” para validar o destino do salvamento...`;
        try {
          const savedCollection = await inspectSavedCollection(page, collectionUrl);
          collectionName = savedCollection.collectionName;
          savedCollectionUrls = new Set(savedCollection.items.map(item => new URL(item.url).pathname.replace(/\/$/, "")));
          savedCollectionInventoryAvailable = true;
          savedCollectionInventoryError = "";
          logDiagnostic("INFO", "Coleção de destino localizada e inventariada", { collectionName, collectionUrl: savedCollection.collectionUrl, collectionId: savedCollection.collectionId, existingItems: savedCollectionUrls.size, mode });
        } catch (error) {
          savedCollectionInventoryError = error.message || String(error);
          logDiagnostic(mode === "test" ? "WARN" : "ERROR", "Não foi possível inventariar a coleção de destino", { collectionName, mode, error: savedCollectionInventoryError });
          if (mode === "automatic") throw error;
        }
      }
      let destinationGroupVerification = { verified:false, reason:"Grupo coletivo não verificado nesta execução.", threadId:"" };
      if (mode === "test" || mode === "automatic") {
        try {
          destinationGroupVerification = await inspectDestinationGroup(page, destinationGroupUrl);
          destinationGroupName = destinationGroupVerification.groupName || "";
          logDiagnostic(destinationGroupVerification.verified ? "INFO" : "WARN", "Verificação do grupo coletivo", destinationGroupVerification);
        } catch (error) {
          destinationGroupVerification = { verified:false, reason:"Falha ao verificar grupo coletivo: " + error.message, threadId:"" };
          logDiagnostic("WARN", "Falha ao verificar grupo coletivo", { error:error.message });
        }
      }
      progress.total = collected.length;
      const withoutDate = collected.filter(item => item.dateUnknown).length;
      const withoutIdentity = collected.filter(item => !item.identityVerified).length;
      const administrativeMilestones = collected.flatMap(item => item.administrativeMilestones || []);
      const administrativeTarget = administrativeTargetsForRange(administrativeMilestones, startDate, endDate);
      const actualFeedForDate = collected.filter(item => !item.dateUnknown && item.contentType !== "story").length;
      const actualStoriesForDate = collected.filter(item => !item.dateUnknown && item.contentType === "story").length;
      const collectionCoverage = administrativeTarget ? {
        available: true,
        targetDate: administrativeTarget.date,
        expectedFeed: administrativeTarget.feedCount,
        expectedStories: administrativeTarget.storiesCount,
        expectedTotal: administrativeTarget.totalCount,
        actualFeed: actualFeedForDate,
        actualStories: actualStoriesForDate,
        actualTotal: actualFeedForDate + actualStoriesForDate,
        missingFeed: administrativeTarget.feedCount == null ? null : Math.max(0, administrativeTarget.feedCount - actualFeedForDate),
        missingStories: administrativeTarget.storiesCount == null ? null : Math.max(0, administrativeTarget.storiesCount - actualStoriesForDate),
        excessFeed: administrativeTarget.feedCount == null ? null : Math.max(0, actualFeedForDate - administrativeTarget.feedCount),
        excessStories: administrativeTarget.storiesCount == null ? null : Math.max(0, actualStoriesForDate - administrativeTarget.storiesCount),
        matches: (administrativeTarget.feedCount == null || actualFeedForDate === administrativeTarget.feedCount) &&
          (administrativeTarget.storiesCount == null || actualStoriesForDate === administrativeTarget.storiesCount)
      } : { available: false };
      const collectionDiagnostics = collected[0]?.collectionDiagnostics || null;
      const collectionScanComplete = Boolean(collectionDiagnostics?.stableBoundaryReached &&
        (collectionDiagnostics?.dateBoundaryReached || collectionDiagnostics?.scrollTargetFound) &&
        !collectionDiagnostics?.stoppedByUser);
      const collectionIncomplete = !collectionScanComplete || withoutDate > 0 || withoutIdentity > 0 ||
        (collectionCoverage.available && !collectionCoverage.matches);
      const executionPreflightIncomplete = collectionIncomplete || !destinationGroupVerification.verified || !destinationGroupVerification.sharedInventoryComplete;
      if (mode === "automatic" && executionPreflightIncomplete) {
        const reasons = [];
        if (!collectionScanComplete) reasons.push("o limite do histórico não foi confirmado");
        if (withoutDate > 0) reasons.push(`${withoutDate} itens estão sem data verificável`);
        if (withoutIdentity > 0) reasons.push(`${withoutIdentity} itens não têm vínculo com a mensagem original`);
        if (!destinationGroupVerification.verified || !destinationGroupVerification.sharedInventoryComplete) reasons.push(destinationGroupVerification.reason);
        if (collectionCoverage.available && !collectionCoverage.matches) {
          reasons.push(`meta administrativa divergente: Feed ${actualFeedForDate}/${collectionCoverage.expectedFeed}, Stories ${actualStoriesForDate}/${collectionCoverage.expectedStories}`);
        }
        throw Object.assign(new Error("Execução automática cancelada antes de qualquer ação: coleta incompleta — " + reasons.join("; ") + "."), {
          collectionCoverage, collectionDiagnostics, networkDiagnostics: collected[0]?.networkDiagnostics || null,
          administrativeTarget, destinationGroupVerification, collectionIncomplete, executionPreflightIncomplete, itemsWithoutDate: withoutDate, itemsWithoutIdentity: withoutIdentity
        });
      }
      const milestoneCount = new Set(collected.flatMap(item => (item.administrativeMilestones || []).map(marker => marker.text))).size;
      const network = collected[0]?.networkDiagnostics;
      const networkStatus = network
        ? `Rede Instagram: ${network.capturedResponses} respostas; ${network.messageLikeObjects} objetos de mensagem; reações ${network.hasReactionFields ? "presentes" : "não detectadas"}; compartilhamentos ${network.hasShareFields ? "presentes" : "não detectados"}.`
        : "Diagnóstico de rede indisponível.";
      progress.message = `${collected.length} links encontrados; ${withoutDate} sem data identificável; ${milestoneCount} marcos administrativos identificados; ${withoutIdentity} itens sem vínculo comprovado com mensagem. ${networkStatus} Verificando histórico...`;
      const previous = getRecentComments(200);
      logDiagnostic("INFO", "Iniciando inspeção e planejamento das publicações", { total: collected.length, mode });
      for (const item of collected) {
        if (stopRequested) break;
        const groupShareState = getGroupShareState(item.url, destinationGroupVerification);
        const alreadyInDestinationGroup = groupShareState === "already-shared";
        const historicalState = getTaskState(item.url, item.threadId, item.messageId, completionEmoji);
        // O CSV é uma trilha histórica/proteção de tentativas, não prova do
        // estado atual no Instagram. Somente a inspeção da sessão atual ou o
        // inventário atual do destino pode marcar uma ação como concluída.
        const previousState = {
          liked:false, saved:false, savedFolderVerified:false, commented:false,
          sharedToGroup:alreadyInDestinationGroup,
          shareAttempted:Boolean(historicalState.shareAttempted && !alreadyInDestinationGroup),
          commentForbidden:false, groupCheck:false, reactionEmoji:"", complete:false
        };
        const instructions = interpretGroupInstructions(item.messageText || "");
        if (item.dateUnknown) {
          const reason = "A mensagem e o link foram extraídos, mas o Instagram não forneceu um timestamp válido. O item foi mantido como candidato, porém não pode ser atribuído com segurança ao período selecionado nem executado.";
          const unknownPlan = item.contentType === "story"
            ? [
                { action:"commentStory", label:"Comentar publicamente no próprio Story", required:instructions.comment!=="forbidden", status:instructions.comment==="forbidden"?"dispensada — pedido explícito para não comentar":"não verificada — data do pedido não identificada", reason },
                { action:"shareStoryToGroup", label:"Enviar o Story ao grupo coletivo", required:true, status:"não verificada — data do pedido não identificada", reason },
                { action:"completionReaction", label:"Reagir à mensagem original", required:true, status:"não verificada — data do pedido não identificada", reason }
              ]
            : buildExecutionPlan({ mode, collectionName, destinationGroupName, completionEmoji, taskState:previousState, instructions })
                .map(action => action.alreadyDone ? action : { ...action, status:"não verificada — data do pedido não identificada", reason });
          const result = {
            ...item, taskState:previousState, caption:"", comment:"", commentSource:"",
            instructionSummary:{comment:instructions.comment,shareToGroup:instructions.shareToGroup},
            plan:unknownPlan, actionLog:[],
            status:"candidato fora da cobertura confirmada — data desconhecida",
            detail:reason
          };
          results.push(result);
          appendHistory({url:item.url,groupThreadId:item.threadId,messageId:item.messageId,groupName,collectionName,status:result.status,detail:reason});
          progress.done++;
          continue;
        }
        if (item.contentType === "story") {
          try {
            const story = await inspectStory(page, item.url);
            const commentForbidden = instructions.comment === "forbidden";
            const commentAlreadyDone = Boolean(story.alreadyCommented);
            const shareState = getGroupShareState(item.url, destinationGroupVerification);
            const shareAlreadyDone = shareState === "already-shared";
            let taskState = mergeTaskState(previousState, {
              commented: commentAlreadyDone,
              commentForbidden,
              sharedToGroup: shareAlreadyDone
            });
            const comment = commentForbidden || taskState.commented
              ? "" : createComment(story.bodyText || "", [...previous, ...results.map(r => r.comment).filter(Boolean)]);
            const actionLog = [];

            if (mode === "automatic") {
              if (commentForbidden) {
                actionLog.push({action:"commentStory",status:"dispensada — pedido explícito para não comentar"});
              } else if (!taskState.commented) {
                if (!story.publicCommentAvailable) {
                  actionLog.push({action:"commentStory",status:"bloqueada",reason:"Comentários públicos indisponíveis; nenhuma resposta privada/DM será enviada."});
                } else if (story.stateKnown?.alreadyCommented !== true || !item.identityVerified) {
                  actionLog.push({action:"commentStory",status:"bloqueada",reason:"Não foi possível confirmar a identidade do perfil, a lista de comentários ou a mensagem original."});
                } else {
                  const outcome = await executeStoryComment(page,item.url,comment);
                  taskState = mergeTaskState(taskState,{commented:true});
                  actionLog.push({action:"commentStory",status:outcome.status});
                }
              } else actionLog.push({action:"commentStory",status:"já concluída — não repetir"});

              if (!taskState.sharedToGroup) {
                if (taskState.shareAttempted) {
                  actionLog.push({action:"shareStoryToGroup",status:"bloqueada",reason:"Já existe uma tentativa anterior sem confirmação. Verifique manualmente o grupo antes de qualquer novo envio."});
                } else if (shareState !== "not-shared" || !destinationGroupVerification.verified || !destinationGroupVerification.sharedInventoryComplete) {
                  actionLog.push({action:"shareStoryToGroup",status:"bloqueada",reason:destinationGroupVerification.reason || "O histórico do grupo coletivo não foi conferido integralmente; envio bloqueado para evitar duplicidade."});
                } else if (!item.identityVerified) {
                  actionLog.push({action:"shareStoryToGroup",status:"bloqueada",reason:"Story sem vínculo confirmado com a mensagem original."});
                } else {
                  const outcome = await executeStoryShareToGroup(
                    page,item.url,destinationGroupName,destinationGroupUrl,
                    async () => {
                      taskState = mergeTaskState(taskState,{shareAttempted:true});
                      appendHistory({url:item.url,groupThreadId:item.threadId,messageId:item.messageId,caption:story.bodyText||"",comment,groupName,collectionName,sharedAt:item.sharedAt,commented:taskState.commented,commentForbidden,sharedToGroup:false,shareAttempted:true,completionEmoji,status:"envio de Story iniciado — aguardando confirmação",detail:"Tentativa de compartilhamento de Story registrada antes do envio"});
                    },
                    destinationGroupVerification
                  );
                  taskState = mergeTaskState(taskState,{sharedToGroup:true,shareAttempted:true});
                  actionLog.push({action:"shareStoryToGroup",status:outcome.status});
                }
              } else actionLog.push({action:"shareStoryToGroup",status:"já concluída — não repetir"});

              const requiredStoryStepsDone = (taskState.commented || commentForbidden) && taskState.sharedToGroup;
              if (requiredStoryStepsDone && !taskState.groupCheck && item.identityVerified && !stopRequested) {
                try {
                  const outcome = await executeCompletionReaction(page,item,completionEmoji);
                  taskState = mergeTaskState(taskState,{groupCheck:true});
                  actionLog.push({action:"completionReaction",status:outcome.status});
                } catch (error) {
                  actionLog.push({action:"completionReaction",status:"bloqueada",reason:error.message});
                }
              }
            }

            const commentStatus = commentForbidden ? "dispensada — pedido explícito para não comentar" :
              taskState.commented ? "já concluída — não repetir" :
              !story.publicCommentAvailable ? "bloqueada — comentários públicos indisponíveis neste Story" :
              story.stateKnown?.alreadyCommented !== true ? "não verificada — não foi possível confirmar comentários anteriores" :
              mode === "test" ? "simulada — nenhuma ação executada" :
              actionLog.find(entry=>entry.action==="commentStory")?.status || "aguardando ação manual";
            const shareStatus = taskState.sharedToGroup ? "já concluída — não repetir" :
              !item.identityVerified ? "não verificada — mensagem original não identificada" :
              taskState.shareAttempted ? "bloqueada — tentativa anterior sem confirmação" :
              shareState === "unknown" || !destinationGroupVerification.verified || !destinationGroupVerification.sharedInventoryComplete
                ? "não verificada — grupo coletivo ou inventário não confirmado"
                : mode === "test" ? "simulada — nenhuma ação executada"
                : actionLog.find(entry=>entry.action==="shareStoryToGroup")?.status || "aguardando ação manual";
            const storyRequiredDone = (taskState.commented || commentForbidden) && taskState.sharedToGroup;
            const reactionStatus = taskState.groupCheck ? "já concluída — não repetir" :
              !item.identityVerified ? "não verificada — mensagem original não identificada" :
              storyRequiredDone ? (mode==="test" ? "simulada — nenhuma ação executada" : actionLog.find(entry=>entry.action==="completionReaction")?.status || "pronta para execução")
              : "aguardando etapas obrigatórias";
            const storyPlan = [
              {action:"commentStory",label:"Comentar publicamente no próprio Story",required:!commentForbidden,status:commentStatus,reason:commentForbidden?"Pedido original proíbe comentário.":!story.publicCommentAvailable?"O recurso de comentário público não está disponível; não enviar resposta privada.":story.stateKnown?.alreadyCommented!==true?"Não foi possível comprovar a identidade do perfil e a integralidade dos comentários.":""},
              {action:"shareStoryToGroup",label:`Enviar o Story ao grupo coletivo “${destinationGroupName || "grupo de envios"}”`,required:true,status:shareStatus,reason:shareState==="unknown"||!destinationGroupVerification.verified||!destinationGroupVerification.sharedInventoryComplete?destinationGroupVerification.reason||"Inventário do destino não confirmado.":""},
              {action:"completionReaction",label:`Reagir à mensagem original com ${completionEmoji}`,required:true,status:reactionStatus,reason:!item.identityVerified?"ID da mensagem original não confirmado.":!storyRequiredDone?"A reação só ocorre após comentário (ou proibição explícita) e envio ao grupo coletivo.":""}
            ].map((entry,index)=>{
              const mapped=mode==="test"&&entry.status.startsWith("simulada");
              const candidate=mode==="test"&&entry.status.startsWith("candidata");
              return {...entry,sequence:index+1,...(mode==="test"?{testMode:{mapped,candidate,executed:false,label:mapped?"AÇÃO APTA — seria executada no AUTOMÁTICO; não foi executada no TESTE":candidate?"CANDIDATA — depende de pré-requisitos":"NÃO EXECUTÁVEL — "+entry.status}}:{})};
            });
            const result={...item,taskState,caption:story.bodyText||"",comment,commentSource:commentForbidden?"dispensado — pedido explícito para não comentar":story.bodyText?.trim()?"texto do Story":"fallback sem texto legível",instructionSummary:{comment:instructions.comment,shareToGroup:"required"},storyInspection:story,stateVerification:{commented:story.alreadyCommented,commentedKnown:story.stateKnown?.alreadyCommented===true,destinationGroupVerified:destinationGroupVerification.verified&&destinationGroupVerification.sharedInventoryComplete,destinationGroupReason:destinationGroupVerification.reason,messageIdentityVerified:Boolean(item.identityVerified&&item.threadId&&item.messageId),reasons:{commented:!story.stateKnown?.alreadyCommented?"Perfil ou lista integral de comentários não confirmado.":story.alreadyCommented?"Comentário do perfil já encontrado.":"Lista de comentários conferida; comentário do perfil não encontrado.",shareToGroup:destinationGroupVerification.reason,messageIdentityVerified:item.identityVerified?"Mensagem de origem identificada.":"ID da mensagem original não confirmado."}},plan:storyPlan,actionLog,status:taskState.sharedToGroup?"Story enviado ou já localizado no grupo coletivo":taskState.commented?"Story comentado publicamente ou já concluído":"Story analisado — etapas pendentes ou bloqueadas"};
            results.push(result);
            appendHistory({url:item.url,groupThreadId:item.threadId,messageId:item.messageId,caption:story.bodyText||"",comment,groupName,collectionName,sharedAt:item.sharedAt,commented:taskState.commented,commentForbidden,sharedToGroup:taskState.sharedToGroup,shareAttempted:taskState.shareAttempted,groupCheck:taskState.groupCheck,completionEmoji,status:result.status,detail:"Inspeção, comentário público, envio ao grupo e reação do Story"});
          } catch(error) {
            const result={...item,taskState:previousState,caption:"",comment:"",plan:[
              {action:"commentStory",label:"Comentar publicamente no próprio Story",required:instructions.comment!=="forbidden",status:"bloqueada — inspeção não concluída",reason:error.message},
              {action:"shareStoryToGroup",label:"Enviar o Story ao grupo coletivo",required:true,status:"bloqueada — inspeção não concluída",reason:error.message},
              {action:"completionReaction",label:"Reagir à mensagem original",required:true,status:"aguardando etapas obrigatórias",reason:"As etapas do Story não foram concluídas."}
            ],actionLog:[],status:"Story não pôde ser inspecionado"};
            results.push(result);
            logDiagnostic("WARN","Falha ao inspecionar Story",{url:item.url,error:error.message});
          }
          progress.done++;
          continue;
        }
        try {
          const inspection = await inspectPost(page, item.url);
          const collectionKey = new URL(item.url).pathname.replace(/\/$/, "");
          const savedFolderVerified = Boolean(inspection.observedState.saved && savedCollectionInventoryAvailable && savedCollectionUrls?.has(collectionKey));
          let taskState = mergeTaskState(previousState, { ...inspection.observedState, savedFolderVerified, commentForbidden: instructions.comment === "forbidden" });
          const comment = taskState.commented || instructions.comment === "forbidden" ? "" : createComment(inspection.caption, [...previous, ...results.map(r => r.comment).filter(Boolean)]);
          const commentSource = inspection.caption?.trim() ? "legenda" : "fallback sem legenda";
          const stateKnown = {
            liked: inspection.stateKnown?.liked === true,
            savedStateKnown: inspection.stateKnown?.saved === true,
            saved: inspection.observedState.saved === true,
            collectionMembership: Boolean(savedCollectionInventoryAvailable && savedCollectionUrls?.has(collectionKey)),
            collectionInventoryAvailable: Boolean(savedCollectionInventoryAvailable),
            commented: inspection.stateKnown?.commented === true,
            destinationGroupVerified: destinationGroupVerification.verified && destinationGroupVerification.sharedInventoryComplete,
            messageIdentityVerified: Boolean(item.identityVerified && item.threadId && item.messageId),
            reasons: {
              liked: inspection.stateKnown?.liked
                ? "Controle identificado; estado atual: " + (inspection.observedState.liked ? "já curtida" : "não curtida") + "."
                : "Controle de curtida não reconhecido. Controles encontrados: " + (inspection.observedState.controlLabels || "nenhum") + ".",
              saveToCollection: !inspection.stateKnown?.saved
                ? "Controle Salvar/Remover dos salvos não reconhecido. Controles encontrados: " + (inspection.observedState.controlLabels || "nenhum") + "."
                : !savedCollectionInventoryAvailable
                  ? "Botão Salvar identificado (" + (inspection.observedState.saved ? "salva" : "não salva") + "), mas o inventário da coleção “" + collectionName + "” não foi carregado; a pasta correta não pode ser confirmada."
                  : !savedCollectionUrls?.has(collectionKey)
                    ? "Inventário carregado, mas esta publicação não consta na coleção “" + collectionName + "”."
                    : !inspection.observedState.saved
                      ? "A coleção contém esta publicação, mas o botão Salvar indica estado não salvo; há divergência e nenhuma alteração deve ser feita."
                      : "Estado salvo e presença na coleção confirmados.",
              commented: inspection.stateKnown?.commented
                ? (inspection.inspectionDiagnostics?.stateVerification?.identifiedUsername
                  ? "Perfil @" + inspection.inspectionDiagnostics.stateVerification.identifiedUsername + " identificado; " + (inspection.observedState.commented ? "comentário encontrado entre os comentários visíveis." : "nenhum comentário correspondente encontrado entre os comentários visíveis; conteúdo não carregado pode não ter sido examinado.")
                  : "Perfil identificado; comentários visíveis examinados.")
                : (inspection.inspectionDiagnostics?.stateVerification?.commentInspectionReason || "Perfil do usuário não identificado; não foi possível verificar comentários anteriores."),
              shareToGroup: destinationGroupVerification.reason,
              messageIdentityVerified: item.identityVerified && item.threadId && item.messageId ? "ID e conversa de origem confirmados." : "ID da mensagem original ou ID da conversa não foi capturado; a reação não pode ser vinculada ao pedido correto."
            }
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
              ["shareToGroup", !taskState.sharedToGroup && !taskState.shareAttempted, async () => executeShareToGroup(
                page, item.url, destinationGroupName,
                async () => {
                  taskState = mergeTaskState(taskState,{shareAttempted:true});
                  appendHistory({url:item.url,groupThreadId:item.threadId,messageId:item.messageId,caption:inspection.caption,comment,groupName,collectionName,sharedToGroup:false,shareAttempted:true,liked:taskState.liked,saved:taskState.saved,savedFolderVerified:taskState.savedFolderVerified,commented:taskState.commented,commentForbidden:instructions.comment==="forbidden",completionEmoji,groupCheck:taskState.groupCheck,status:"envio iniciado — aguardando confirmação",detail:"Tentativa de envio registrada antes do clique final"});
                },
                destinationGroupVerification
              ), "sharedToGroup"]
            ];
            let blocked = false;
            for (const [action,needed,run,key] of steps) {
              if (stopRequested) { actionLog.push({action,status:"interrompida pelo usuário"}); blocked=true; break; }
              if (!needed) continue;
              const verificationFailure =
                action === "like" && !stateKnown.liked ? (stateKnown.reasons?.liked || "Estado da curtida não identificado.") :
                action === "saveToCollection" && (!stateKnown.savedStateKnown || !savedCollectionInventoryAvailable || (stateKnown.collectionMembership === true && stateKnown.saved === false)) ? (stateKnown.reasons?.saveToCollection || "Estado do salvamento ou inventário da coleção não confirmado.") :
                action === "comment" && !stateKnown.commented ? (stateKnown.reasons?.commented || "Não foi possível confirmar se o perfil já comentou.") :
                action === "shareToGroup" && !stateKnown.destinationGroupVerified ? (stateKnown.reasons?.shareToGroup || "Grupo coletivo não verificado.") : "";
              if (verificationFailure) {
                actionLog.push({action,status:"bloqueada — estado atual não verificado",reason:verificationFailure});
                blocked=true;
                break;
              }
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
          let plan = buildExecutionPlan({ mode, collectionName, destinationGroupName, completionEmoji, taskState, comment, instructions, stateKnown });
          if (mode === "automatic") {
            plan = plan.map(entry => {
              const logged = actionLog.find(record => record.action === entry.action);
              if (logged) return { ...entry, status:logged.status, reason:logged.reason || "" };
              if (actionLog.some(record => record.action === "all" && record.status === "bloqueada")) return { ...entry, status:"bloqueada", reason:actionLog[0].reason };
              if (!entry.alreadyDone && entry.required && !entry.status.startsWith("dispensada") && entry.action !== "completionReaction") return { ...entry, status:"não executada — etapa anterior bloqueada" };
              return entry;
            });
          }
          const result = { ...item, caption:inspection.caption, comment, taskState, commentSource, instructionSummary:{comment:instructions.comment,shareToGroup:instructions.shareToGroup}, stateVerification:{
            liked:inspection.observedState.liked, likedKnown:Boolean(inspection.stateKnown?.liked),
            saved:inspection.observedState.saved, savedKnown:Boolean(inspection.stateKnown?.saved),
            collectionMembershipKnown:Boolean(savedCollectionInventoryAvailable), collectionMembership:stateKnown.collectionMembership,
            commented:inspection.observedState.commented, commentedKnown:Boolean(inspection.stateKnown?.commented),
            destinationGroupVerified:stateKnown.destinationGroupVerified, destinationGroupReason:destinationGroupVerification.reason,
            messageIdentityVerified:stateKnown.messageIdentityVerified, reasons:stateKnown.reasons,
            controlCount:inspection.observedState.controlCount || 0, controlLabels:inspection.observedState.controlLabels || "",
            diagnostics:inspection.inspectionDiagnostics?.stateVerification || null
          }, plan, actionLog, inspectionDiagnostics:inspection.inspectionDiagnostics||null, status:taskStateLabel(taskState) };
          results.push(result);
          appendHistory({url:item.url,groupThreadId:item.threadId,messageId:item.messageId,caption:inspection.caption,comment,groupName,collectionName,sharedAt:item.sharedAt,saved:taskState.saved,savedFolderVerified:taskState.savedFolderVerified,liked:taskState.liked,commented:taskState.commented,sharedToGroup:taskState.sharedToGroup,groupCheck:taskState.groupCheck,completionEmoji,commentForbidden:instructions.comment==="forbidden",complete:taskState.complete,milestone:item.administrativeMilestones,detail:mode==="test"?"Simulação sem ações":"Planejamento e execução da publicação"});
        } catch (error) {
          logDiagnostic("ERROR", "Falha ao inspecionar publicação", { url:item.url,error:error.message,inspectionDiagnostics:error.inspectionDiagnostics||null });
          const blockedPlan = buildExecutionPlan({ mode, collectionName, destinationGroupName, completionEmoji, taskState:previousState, instructions })
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
      const inspectionFailures = results.filter(item =>
        item.contentType === "story" ? !item.storyInspection :
        item.status === "inspeção não concluída — ações não verificadas"
      ).length;
      const captionUnavailable = results.filter(item => item.inspectionDiagnostics?.captionAvailable === false).length;
      const storiesBlocked = results.filter(item => item.contentType === "story" && (item.plan || []).some(action => /^(bloqueada|não verificada)/.test(action.status))).length;
      const actionLabels = {
        like: "curtidas", saveToCollection: "salvamentos na coleção", comment: "comentários",
        shareToGroup: "envios ao grupo coletivo", completionReaction: "reações na mensagem original",
        commentStory: "comentários públicos em Stories", shareStoryToGroup: "envios de Stories ao grupo coletivo"
      };
      const actionTotals = {};
      for (const item of results) for (const action of (item.plan || [])) {
        const key = action.action;
        if (!actionTotals[key]) actionTotals[key] = { total: 0, simulated: 0, unverified: 0, blocked: 0, done: 0, candidate: 0, dispensed: 0, waiting: 0, unclassified: 0 };
        const bucket = actionTotals[key];
        bucket.total++;
        if (/^simulada/.test(action.status)) bucket.simulated++;
        else if (/^não verificada/.test(action.status)) bucket.unverified++;
        else if (/^bloqueada/.test(action.status)) bucket.blocked++;
        else if (/^já concluída/.test(action.status)) bucket.done++;
        else if (/^dispensada/.test(action.status)) bucket.dispensed++;
        else if (/^aguardando/.test(action.status)) bucket.waiting++;
        else if (action.testMode?.candidate) bucket.candidate++;
        else bucket.unclassified++;
      }
      const preliminaryLines = Object.entries(actionTotals).map(([key,value]) =>
        `- ${actionLabels[key] || key}: ${value.total} previstas | ${value.simulated} aptas no TESTE | ${value.candidate} candidatas | ${value.waiting} aguardando etapas | ${value.dispensed} dispensadas | ${value.unverified} não verificadas | ${value.blocked} bloqueadas | ${value.done} já concluídas | ${value.unclassified} sem classificação`
      );
      const plannedActions = results.reduce((sum,item) => sum + (item.plan?.length || 0), 0);
      const mappedActions = results.reduce((sum,item) => sum + (item.plan || []).filter(action => action.testMode?.mapped).length, 0);
      const candidateActions = results.reduce((sum,item) => sum + (item.plan || []).filter(action => action.testMode?.candidate).length, 0);
      const inspectedFeedReels = results.filter(item => item.contentType !== "story" ? Boolean(item.stateVerification) : Boolean(item.storyInspection)).length;
      const alreadyDoneActions = results.reduce((sum,item) => sum + (item.plan || []).filter(action => /^já concluída/.test(action.status)).length, 0);
      const simulatedActions = results.reduce((sum,item) => sum + (item.plan || []).filter(action => /^simulada/.test(action.status)).length, 0);
      const blockedActions = results.reduce((sum,item) => sum + (item.plan || []).filter(action => /^bloqueada/.test(action.status)).length, 0);
      const unverifiedActions = results.reduce((sum,item) => sum + (item.plan || []).filter(action => /^não verificada/.test(action.status)).length, 0);
      const waitingActions = results.reduce((sum,item) => sum + (item.plan || []).filter(action => /^aguardando/.test(action.status)).length, 0);
      const dispensedActions = results.reduce((sum,item) => sum + (item.plan || []).filter(action => /^dispensada/.test(action.status)).length, 0);
      const unclassifiedActions = results.reduce((sum,item) => sum + (item.plan || []).filter(action =>
        !/^(simulada|não verificada|bloqueada|já concluída|dispensada|aguardando|candidata)/.test(action.status)
      ).length, 0);
      const testIncomplete = mode === "test" && (inspectionFailures > 0 || captionUnavailable > 0 || unverifiedActions > 0 || blockedActions > 0 || storiesBlocked > 0 || unclassifiedActions > 0 || !savedCollectionInventoryAvailable || collectionIncomplete);
      progress.message = mode === "test"
        ? `TESTE ${testIncomplete ? "PARCIAL" : "CONCLUÍDO"}: ${inspectedFeedReels}/${collected.length} itens analisados; ${collectionCoverage.available ? `cobertura da administração: Feed ${actualFeedForDate}/${collectionCoverage.expectedFeed}, Stories ${actualStoriesForDate}/${collectionCoverage.expectedStories}; ` : ""}${withoutDate} candidatos sem data incluídos; ${withoutIdentity} sem identidade; ${mappedActions} ações simuladas e aptas à execução automática, mas NÃO EXECUTADAS; ${candidateActions} candidatas; ${waitingActions} aguardando etapas; ${alreadyDoneActions} já concluídas; ${dispensedActions} dispensadas; ${blockedActions} bloqueadas; ${unverifiedActions} não verificadas; ${unclassifiedActions} sem classificação; ${storiesBlocked} Stories com etapas bloqueadas ou não verificadas; ${inspectionFailures} inspeções interrompidas; ${captionUnavailable} sem legenda legível; ${plannedActions} etapas no plano. Nenhuma ação foi executada.`
        : mode === "manual" ? `Coleta ${collectionIncomplete ? "PARCIAL" : "concluída"}: ${results.length} itens preparados para execução manual; ${withoutDate} sem data e ${withoutIdentity} sem identidade.`
        : `Execução automática finalizada: ${results.length} itens analisados. Consulte o resultado de cada ação.`;
      logDiagnostic("INFO", "Coleta concluída", { listed: results.length, inspectionFailures, captionUnavailable, unverifiedActions, savedCollectionInventoryAvailable, networkResponses: network?.capturedResponses ?? 0 });
      diagnosticReport = {
        schemaVersion: 1,
        application: "curtidorIG",
        generatedAt: new Date().toISOString(),
        startedAt,
        finishedAt: new Date().toISOString(),
        outcome: stopRequested ? "interrompida" : (testIncomplete || collectionIncomplete) ? "parcial" : "concluída",
        request: { groupName, collectionName, collectionUrl, destinationGroupName, destinationGroupUrl, mode, completionEmoji, startDate, endDate },
        summary: {
          publicationsFound: collected.length,
          publicationsInspected: inspectedFeedReels,
          administrativeMilestones: new Set(administrativeMilestones.map(marker => marker.text)).size,
          administrativeTarget,
          destinationGroupVerification,
          executionPreflightIncomplete,
          collectionCoverage,
          collectionDiagnostics,
          collectionScanComplete,
          collectionIncomplete,
          stories: collected.filter(item => item.contentType === "story").length,
          feedsAndReels: collected.filter(item => item.contentType !== "story").length,
          itemsWithoutDate: collected.filter(item => item.dateUnknown).length,
          itemsWithoutIdentity: withoutIdentity,
          inspectionFailures,
          captionUnavailable,
          storiesBlocked,
          plannedActions,
          actionTotals,
          mappedActions,
          candidateActions,
          alreadyDoneActions,
          simulatedActions,
          waitingActions,
          dispensedActions,
          blockedActions,
          unverifiedActions,
          unclassifiedActions,
          savedCollectionInventoryAvailable,
          savedCollectionInventoryError: savedCollectionInventoryError || null
        },
        networkDiagnostics: collected[0]?.networkDiagnostics || null,
        collectionDiagnostics,
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
        outcome: error.collectionIncomplete || error.executionPreflightIncomplete ? "parcial" : "erro",
        request: { groupName, collectionName, destinationGroupName, mode, startDate, endDate },
        summary: {
          publicationsFound: results.length,
          publicationsInspected: results.length,
          administrativeTarget: error.administrativeTarget || null,
          destinationGroupVerification: error.destinationGroupVerification || null,
          collectionCoverage: error.collectionCoverage || null,
          collectionDiagnostics: error.collectionDiagnostics || null,
          collectionIncomplete: Boolean(error.collectionIncomplete),
          executionPreflightIncomplete: Boolean(error.executionPreflightIncomplete),
          itemsWithoutDate: error.itemsWithoutDate ?? 0,
          itemsWithoutIdentity: error.itemsWithoutIdentity ?? 0
        },
        networkDiagnostics: error.networkDiagnostics || results[0]?.networkDiagnostics || null,
        collectionDiagnostics: error.collectionDiagnostics || null,
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
