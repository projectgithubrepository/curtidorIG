const ACTIONS = ["like", "saveToCollection", "comment", "shareToGroup", "completionReaction"];

export function isValidComment(value) {
  const comment = String(value ?? "").trim();
  const words = comment.match(/[\p{L}\p{N}]+/gu) || [];
  return words.length >= 2 && /\p{Extended_Pictographic}/u.test(comment);
}

export function interpretGroupInstructions(messageText = "") {
  const text = String(messageText ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const noComment = /\b(nao comentar|nao comente|sem comentario|proibido comentar|comentario proibido)\b/.test(text);
  const commentRequested = /\b(comentar|comente|comentario)\b/.test(text);
  return {
    comment: noComment ? "forbidden" : commentRequested ? "required" : "required",
    shareToGroup: "required",
    sourceText: String(messageText ?? "")
  };
}

export function buildExecutionPlan({
  taskState = {},
  comment = "",
  collectionName = "",
  completionEmoji = "🌸",
  mode = "test",
  instructions = {}
} = {}) {
  const state = {
    liked: Boolean(taskState.liked),
    commented: Boolean(taskState.commented),
    sharedToGroup: Boolean(taskState.sharedToGroup),
    saved: Boolean(taskState.saved),
    savedFolderVerified: Boolean(taskState.savedFolderVerified),
    groupCheck: Boolean(taskState.groupCheck)
  };
  const policy = {
    comment: instructions.comment === "forbidden" ? "forbidden" : "required",
    shareToGroup: "required"
  };
  const plan = [
    { action: "like", label: "Curtir", alreadyDone: state.liked, eligible: true, required: true },
    { action: "saveToCollection", label: \`Salvar na coleção “\${collectionName || "Curtido"}”\`, alreadyDone: state.saved && state.savedFolderVerified, eligible: Boolean(collectionName), required: true },
    { action: "comment", label: "Comentar", alreadyDone: state.commented, eligible: policy.comment !== "forbidden" && isValidComment(comment), required: policy.comment !== "forbidden", policy: policy.comment },
    { action: "shareToGroup", label: "Enviar para o grupo de destino", alreadyDone: state.sharedToGroup, eligible: true, required: true, policy: "required" },
    { action: "completionReaction", label: \`Reagir à mensagem original com \${completionEmoji}\`, alreadyDone: state.groupCheck, eligible: true, required: true, requiresAllPrevious: true }
  ];
  const requiredStepsDone = plan.slice(0, 4).every(item => !item.required || item.alreadyDone);
  return plan.map((item, index) => {
    let status = "pendente";
    let reason = "";
    if (item.alreadyDone) status = "já concluída — não repetir";
    else if (item.action === "comment" && item.policy === "forbidden") status = "dispensada — pedido explícito para não comentar";
    else if (!item.eligible) {
      status = "bloqueada";
      reason = item.action === "saveToCollection" ? "Informe a coleção obrigatória de destino." : "O comentário precisa ter pelo menos duas palavras e um emoji.";
    } else if (item.requiresAllPrevious && !requiredStepsDone) {
      status = "aguardando etapas obrigatórias";
      reason = "A reação só pode ser aplicada após concluir as ações obrigatórias e as solicitadas.";
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
    optional: plan.filter(item => item.status.startsWith("opcional") || item.status.startsWith("dispensada")).length,
    waiting: plan.filter(item => item.status.startsWith("aguardando etapas")).length
  };
}

export const EXECUTION_ACTIONS = ACTIONS;
