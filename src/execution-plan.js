const ACTIONS = ["like", "saveToCollection", "comment", "shareToGroup", "completionReaction"];

export function isValidComment(value) {
  const comment = String(value ?? "").trim();
  const words = comment.match(/[\p{L}\p{N}]+/gu) || [];
  return words.length >= 2 && /\p{Extended_Pictographic}/u.test(comment);
}

export function interpretGroupInstructions(messageText = "") {
  const text = String(messageText ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const noComment = /\b(nao comentar|nao comente|sem comentario|sem comentar|nao faca comentario|nao deixe comentario|proibido comentar|comentario proibido)\b/.test(text);
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
  destinationGroupName = "grupo de envios",
  completionEmoji = "🌸",
  mode = "test",
  instructions = {},
  stateKnown = {}
} = {}) {
  const state = {
    liked: Boolean(taskState.liked),
    commented: Boolean(taskState.commented),
    sharedToGroup: Boolean(taskState.sharedToGroup),
    shareAttempted: Boolean(taskState.shareAttempted),
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
    { action: "saveToCollection", label: `Salvar na coleção “${collectionName || "Curtido"}”`, alreadyDone: state.saved && state.savedFolderVerified, eligible: Boolean(collectionName), required: true },
    { action: "comment", label: "Comentar", alreadyDone: state.commented, eligible: policy.comment !== "forbidden" && isValidComment(comment), required: policy.comment !== "forbidden", policy: policy.comment },
    { action: "shareToGroup", label: `Enviar para o grupo coletivo “${destinationGroupName || "grupo de envios"}”`, alreadyDone: state.sharedToGroup, eligible: !state.shareAttempted || state.sharedToGroup, required: true, policy: "required" },
    { action: "completionReaction", label: `Reagir à mensagem original com ${completionEmoji}`, alreadyDone: state.groupCheck, eligible: true, required: true, requiresAllPrevious: true }
  ];
  const requiredStepsDone = plan.slice(0, 4).every(item => !item.required || item.alreadyDone);
  return plan.map((item, index) => {
    let status = "pendente";
    let reason = "";
    if (item.alreadyDone) status = "já concluída — não repetir";
    else if (item.action === "comment" && item.policy === "forbidden") status = "dispensada — pedido explícito para não comentar";
    else if (item.action === "shareToGroup" && state.shareAttempted && !state.sharedToGroup) { status = "bloqueada"; reason = "Tentativa anterior sem confirmação; verifique o grupo para evitar envio duplicado."; }
    else if (item.action === "saveToCollection" && state.saved && !state.savedFolderVerified) {
      status = "bloqueada";
      reason = "A publicação já está salva fora da coleção confirmada (ou sua inclusão não foi comprovada); não alternar o salvamento.";
    } else if (mode === "test" && !item.alreadyDone && item.action === "like" && stateKnown.liked === false) {
      status = "não verificada — controle de curtida não identificado";
      reason = "O Instagram não apresentou um controle reconhecível para confirmar se a publicação já está curtida.";
    } else if (mode === "test" && !item.alreadyDone && item.action === "saveToCollection" && stateKnown.saveToCollection === false) {
      status = "não verificada — estado da coleção indisponível";
      reason = "Não foi possível conferir o estado salvo e a presença na coleção de destino.";
    } else if (mode === "test" && !item.alreadyDone && item.action === "comment" && stateKnown.commented === false) {
      status = "não verificada — comentários do usuário não identificados";
      reason = "Não foi possível confirmar se já existe um comentário deste perfil; evite duplicidade.";
    } else if (!item.eligible) {
      status = "bloqueada";
      reason = item.action === "saveToCollection" ? "Informe a coleção obrigatória de destino." : "O comentário precisa ter pelo menos duas palavras e um emoji.";
    } else if (item.requiresAllPrevious && !requiredStepsDone) {
      status = "aguardando etapas obrigatórias";
      reason = "A reação só pode ser aplicada após concluir as ações obrigatórias e as solicitadas.";
    } else if (mode === "test") status = "simulada — nenhuma ação executada";
    else if (mode === "manual") status = "aguardando ação manual";
    else status = "pronta para execução";
    const mappedInTest = mode === "test" && status.startsWith("simulada");
    const candidateInTest = mode === "test" && !mappedInTest && !item.alreadyDone && item.eligible &&
      item.policy !== "forbidden" && !status.startsWith("bloqueada") &&
      !status.startsWith("dispensada");
    return {
      ...item,
      status,
      reason,
      sequence: index + 1,
      ...(mode === "test" ? {
        testMode: {
          mapped: mappedInTest,
          candidate: candidateInTest,
          executed: false,
          label: mappedInTest
            ? "AÇÃO APTA — seria executada no AUTOMÁTICO; não foi executada no TESTE"
            : candidateInTest
              ? "CANDIDATA — depende da confirmação do estado/pré-requisitos; não foi executada"
              : "NÃO EXECUTÁVEL — " + status
        }
      } : {})
    };
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
