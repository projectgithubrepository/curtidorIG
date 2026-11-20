const ACTIONS = ["like", "comment", "shareToGroup", "saveToCollection", "completionReaction"];

export function buildExecutionPlan({
  taskState = {},
  comment = "",
  collectionName = "",
  completionEmoji = "🌸",
  mode = "test"
} = {}) {
  const state = {
    liked: Boolean(taskState.liked),
    commented: Boolean(taskState.commented),
    sharedToGroup: Boolean(taskState.sharedToGroup),
    saved: Boolean(taskState.saved),
    savedFolderVerified: Boolean(taskState.savedFolderVerified),
    groupCheck: Boolean(taskState.groupCheck)
  };
  const plan = [
    { action: "like", label: "Curtir", alreadyDone: state.liked, eligible: true },
    { action: "comment", label: "Comentar", alreadyDone: state.commented, eligible: Boolean(comment) },
    { action: "shareToGroup", label: "Enviar no grupo", alreadyDone: state.sharedToGroup, eligible: true },
    { action: "saveToCollection", label: "Salvar na coleção", alreadyDone: state.saved && state.savedFolderVerified, eligible: Boolean(collectionName) },
    { action: "completionReaction", label: `Marcar mensagem com ${completionEmoji}`, alreadyDone: state.groupCheck, eligible: true, requiresAllPrevious: true }
  ];
  const prerequisitesDone = plan.slice(0, 4).every(item => item.alreadyDone);
  return plan.map((item, index) => {
    let status = "pendente";
    let reason = "";
    if (item.alreadyDone) status = "já concluída — não repetir";
    else if (!item.eligible) {
      status = "bloqueada";
      reason = item.action === "comment" ? "Não foi possível preparar um comentário." : "Informe a coleção de destino.";
    } else if (item.requiresAllPrevious && !prerequisitesDone) {
      status = "aguardando etapas anteriores";
      reason = "A flor só pode ser aplicada depois da conclusão das demais etapas.";
    } else if (mode === "test") status = "simulada — nenhuma ação executada";
    else if (mode === "manual") status = "aguardando ação manual";
    else status = "pronta para execução";
    return { ...item, status, reason, sequence: index + 1 };
  });
}

export function summarizeExecutionPlan(plan = []) {
  return {
    total: plan.length,
    alreadyDone: plan.filter(item => item.status.startsWith("já concluída")).length,
    simulated: plan.filter(item => item.status.startsWith("simulada")).length,
    pending: plan.filter(item => item.status === "pendente").length,
    blocked: plan.filter(item => item.status === "bloqueada").length,
    waiting: plan.filter(item => item.status === "aguardando etapas anteriores").length
  };
}

export const EXECUTION_ACTIONS = ACTIONS;
