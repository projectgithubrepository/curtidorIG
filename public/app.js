const groupName = document.querySelector("#groupName");
const collectionUrl = document.querySelector("#collectionUrl");
const destinationGroupUrl = document.querySelector("#destinationGroupUrl");
const mode = document.querySelector("#mode");
const completionEmoji = document.querySelector("#completionEmoji");
const startDate = document.querySelector("#startDate");
const endDate = document.querySelector("#endDate");
const start = document.querySelector("#start");
const stop = document.querySelector("#stop");
const state = document.querySelector("#state");
const message = document.querySelector("#message");
const counter = document.querySelector("#counter");
const current = document.querySelector("#current");
const bar = document.querySelector("#bar");
const results = document.querySelector("#results");
const preliminaryPanel = document.querySelector("#preliminaryPanel");
const preliminaryMode = document.querySelector("#preliminaryMode");
const preliminaryIntro = document.querySelector("#preliminaryIntro");
const preliminaryMetrics = document.querySelector("#preliminaryMetrics");
let lastResultsSignature = "";

const connect = document.querySelector("#connect");
const copyDiagnostic = document.querySelector("#copyDiagnostic");
const copyDiagnosticSummary = document.querySelector("#copyDiagnosticSummary");
const diagnosticCopyStatus = document.querySelector("#diagnosticCopyStatus");
const downloadDiagnostic = document.querySelector("#downloadDiagnostic");
const downloadDiagnosticSummary = document.querySelector("#downloadDiagnosticSummary");

copyDiagnosticSummary.addEventListener("click", async () => {
  try {
    const response = await fetch("/api/diagnostic-summary");
    if (!response.ok) throw new Error("Faça uma coleta antes de copiar o resumo.");
    await navigator.clipboard.writeText(await response.text());
    diagnosticCopyStatus.textContent = "Resumo filtrado copiado. Cole o texto aqui na conversa.";
  } catch (error) {
    diagnosticCopyStatus.textContent = error.message;
  }
});

copyDiagnostic.addEventListener("click", async () => {
  try {
    const response = await fetch("/api/diagnostic-log");
    if (!response.ok) throw new Error("Faça uma coleta antes de copiar o diagnóstico.");
    await navigator.clipboard.writeText(await response.text());
    diagnosticCopyStatus.textContent = "Diagnóstico copiado. Cole o texto aqui na conversa.";
  } catch (error) {
    diagnosticCopyStatus.textContent = error.message;
  }
});

connect.addEventListener("click", async () => {
  connect.disabled = true;
  message.textContent = "Abrindo a janela do Instagram...";
  try {
    const response = await fetch("/api/connect", { method: "POST" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Não foi possível abrir o Instagram.");
    message.textContent = data.message;
    state.textContent = "Aguardando login";
  } catch (error) {
    message.textContent = error.message;
  } finally {
    connect.disabled = false;
    refresh();
  }
});

start.addEventListener("click", async () => {
  start.disabled = true;
  try {
    const confirmed = mode.value === "automatic" ? window.confirm("AUTOMÁTICO: o app poderá curtir, salvar, comentar e compartilhar publicações, além de reagir às mensagens originais. Confirme que o grupo coletivo e a coleção estão corretos. Continuar?") : false;
  if (mode.value === "automatic" && !confirmed) { start.disabled = false; return; }
  const response = await fetch("/api/start", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ groupName:groupName.value, collectionUrl:collectionUrl.value, destinationGroupUrl:destinationGroupUrl.value, mode:mode.value, completionEmoji:completionEmoji.value, confirm:confirmed, startDate:startDate.value, endDate:endDate.value }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Não foi possível iniciar.");
    message.textContent = data.message;
    state.textContent = "Coletando";
    stop.disabled = false;
  } catch (error) { message.textContent = error.message; start.disabled = false; }
});
stop.addEventListener("click", async () => { await fetch("/api/stop",{method:"POST"}); stop.disabled=true; message.textContent="Solicitando parada..."; });
function renderPreliminary(summary, request) {
  if (!summary || !request || request.mode !== "test") {
    preliminaryPanel.hidden = true;
    preliminaryMetrics.replaceChildren();
    return;
  }
  preliminaryPanel.hidden = false;
  preliminaryMode.textContent = "MODO TESTE — nenhuma ação executada";
  const coverage = summary.collectionCoverage || {};
  const scan = summary.collectionDiagnostics || {};
  const coverageText = coverage.available
    ? `Meta administrativa: Feed ${coverage.actualFeed}/${coverage.expectedFeed} (faltam ${coverage.missingFeed}, excedentes ${coverage.excessFeed}) · Stories ${coverage.actualStories}/${coverage.expectedStories} (faltam ${coverage.missingStories}, excedentes ${coverage.excessStories}) · ${coverage.matches ? "contagens conferem" : "COLETA INCOMPLETA — divergência"}.`
    : "Sem meta administrativa correspondente à data para validar a quantidade.";
  const scanText = scan.historyRounds !== undefined
    ? `Varredura: ${scan.historyRounds} rodadas · ${scan.dateBoundaryReached ? "mensagem anterior à data inicial encontrada" : scan.stableBoundaryReached ? "topo do histórico detectado" : "fim do histórico não confirmado"} · ${summary.itemsWithoutDate ?? 0} itens sem data mantidos como candidatos · ${summary.itemsWithoutIdentity ?? 0} sem vínculo com mensagem.`
    : "Diagnóstico de varredura indisponível.";
  preliminaryIntro.textContent = `${summary.publicationsFound ?? 0} itens encontrados · ${summary.publicationsInspected ?? 0} inspecionados. ${coverageText} ${scanText} Os quantitativos abaixo mostram o que o sistema avaliou; não são ações realizadas.`;
  preliminaryMetrics.replaceChildren();
  const labels = {like:"Curtidas",saveToCollection:"Salvamentos",comment:"Comentários em publicações",shareToGroup:"Envios ao grupo coletivo",completionReaction:"Reações no grupo de origem",commentStory:"Comentários em Stories",shareStoryToGroup:"Envios de Stories"};
  const totals = summary.actionTotals || {};
  const order = ["like","saveToCollection","comment","shareToGroup","completionReaction","commentStory","shareStoryToGroup"];
  for (const key of order) {
    const value = totals[key];
    if (!value) continue;
    const tile = document.createElement("article");
    tile.className = "metric-tile";
    const label = document.createElement("span");
    label.className = "metric-label";
    label.textContent = labels[key] || key;
    const number = document.createElement("strong");
    number.className = "metric-number";
    number.textContent = String(value.total ?? 0);
    const detail = document.createElement("small");
    detail.className = "metric-detail";
    detail.textContent = `${value.simulated ?? 0} aptas · ${value.candidate ?? 0} candidatas · ${value.waiting ?? 0} aguardando · ${value.dispensed ?? 0} dispensadas · ${value.done ?? 0} concluídas · ${value.blocked ?? 0} bloqueadas · ${value.unverified ?? 0} não verificadas · ${value.unclassified ?? 0} sem classificação`;
    tile.append(label, number, detail);
    preliminaryMetrics.append(tile);
  }
  const note = document.createElement("p");
  note.className = "hint";
  const destination = summary.destinationGroupVerification || {};
  note.textContent = `Coleção “${request.collectionName || "não informada"}” · ${summary.savedCollectionInventoryAvailable ? "Inventário da coleção confirmado" : "Inventário da coleção indisponível"} · Grupo coletivo “${request.destinationGroupName || "não informado"}”: ${destination.verified ? "confirmado" : destination.reason || "não verificado"}.`;
  preliminaryMetrics.append(note);
}

function render(items) {
  results.replaceChildren();
  if (!items.length) {
    const p=document.createElement("p"); p.className="muted";
    p.textContent="Nenhuma publicação listada ainda."; results.append(p); return;
  }
  for (const item of items) {
    const card=document.createElement("article"); card.className="result";
    const head=document.createElement("div");
    const status=document.createElement("strong"); status.textContent=item.status || "Pendente";
    const type=document.createElement("small");
    type.textContent=item.contentType === "story" ? "Story · fluxo público específico" : "Feed / Reel / carrossel";
    const date=document.createElement("small");
    date.textContent=item.sharedAt ? new Date(item.sharedAt).toLocaleString("pt-BR") : "Data não identificada";
    const link=document.createElement("a"); link.href=item.url; link.target="_blank"; link.rel="noreferrer"; link.textContent="Abrir publicação no Instagram";
    head.append(status,type,date,link); card.append(head);

    const details=document.createElement("details"); details.className="publication-details";
    details.open = false;
    const summary=document.createElement("summary"); summary.textContent="Ver análise completa e todas as etapas"; details.append(summary);

    const instruction=document.createElement("p");
    const policy=item.instructionSummary || {};
    const originalRequest=document.createElement("p");
    originalRequest.textContent="Pedido original no grupo: " + (item.messageText?.trim() || "texto do pedido não capturado");
    details.append(originalRequest);
    instruction.textContent="Regra identificada na mensagem do grupo: " +
      (policy.comment === "forbidden" ? "não comentar (proibição explícita)" : "comentar") +
      "; enviar ao grupo coletivo: obrigatório.";
    details.append(instruction);

    const captionTitle=document.createElement("strong"); captionTitle.textContent="Legenda / conteúdo identificado";
    const caption=document.createElement("p"); caption.textContent=item.caption?.trim() || "Sem legenda legível ou texto de conteúdo disponível.";
    details.append(captionTitle,caption);

    if (item.comment) {
      const commentTitle=document.createElement("strong"); commentTitle.textContent="Comentário preparado";
      const comment=document.createElement("p"); comment.className="comment"; comment.textContent=item.comment;
      const source=document.createElement("small"); source.textContent="Origem: " + (item.commentSource || "não informada");
      details.append(commentTitle,comment,source);
      const copyComment=document.createElement("button"); copyComment.type="button"; copyComment.className="secondary small-action";
      copyComment.textContent="Copiar comentário"; copyComment.dataset.copyComment=item.comment; details.append(copyComment);
    } else {
      const noComment=document.createElement("p"); noComment.textContent=policy.comment==="forbidden"
        ? "Comentário não preparado: a mensagem proíbe comentar."
        : "Comentário não preparado nesta inspeção.";
      details.append(noComment);
    }

    const verificationTitle=document.createElement("strong"); verificationTitle.textContent="Verificação do estado atual";
    details.append(verificationTitle);
    const verification=item.stateVerification || item.storyInspection?.stateKnown || {};
    const checks=[
      ["Curtida",verification.liked],
      ["Salvamento / coleção",verification.saveToCollection ?? verification.saved],
      ["Comentário anterior",verification.commented ?? verification.alreadyCommented]
    ];
    const checkList=document.createElement("ul");
    const verificationReasons=verification.reasons || {};
    const diagnosticState=verification.diagnostics || {};
    for (const [label,value,key] of [
      ["Curtida",verification.liked,"liked"],
      ["Salvamento no Instagram",verification.saved,"saved"],
      ["Presença na coleção escolhida",verification.collectionMembership,"saveToCollection"],
      ["Comentário anterior",verification.commented,"commented"],
      ["Grupo coletivo",verification.destinationGroupVerified,"shareToGroup"],
      ["Mensagem original do grupo",verification.messageIdentityVerified,"messageIdentityVerified"]
    ]) {
      const li=document.createElement("li");
      const known=key==="liked" ? verification.likedKnown : key==="saved" ? verification.savedKnown : key==="commented" ? verification.commentedKnown : value===true;
      li.textContent=label + ": " + (known ? ((key==="liked"||key==="saved"||key==="commented") ? (value ? "estado identificado: sim" : "estado identificado: não") : "confirmado") : "não confirmado");
      const why=verificationReasons[key] || "";
      if(why){const detail=document.createElement("small");detail.textContent=" Motivo: "+why;li.append(detail);}
      checkList.append(li);
    }
    if(diagnosticState.readError){
      const li=document.createElement("li");li.textContent="Falha ao ler controles: "+diagnosticState.readError;checkList.append(li);
    }
    if(diagnosticState.controlCount!==undefined){
      const li=document.createElement("li");li.textContent="Controles encontrados: "+diagnosticState.controlCount+" · "+(diagnosticState.controlLabels||[]).join(" | ");checkList.append(li);
    }
    if (item.storyInspection) {
      const li=document.createElement("li");
      li.textContent="Comentário público disponível no Story: " + (item.storyInspection.publicCommentAvailable ? "sim" : "não");
      checkList.append(li);
    }
    details.append(checkList);

    const actionTitle=document.createElement("strong"); actionTitle.textContent="Plano de execução — etapa por etapa";
    details.append(actionTitle);
    const actionList=document.createElement("ol");
    for (const action of (item.plan || [])) {
      const li=document.createElement("li"); li.className="planned-action";
      const label=document.createElement("strong"); label.textContent=action.label || action.action;
      const state=document.createElement("div"); state.textContent="Resultado no TESTE: " + action.status;
      li.append(label,state);
      if (action.testMode?.label) {
        const decision=document.createElement("small"); decision.textContent=action.testMode.label; li.append(decision);
      }
      if (action.reason) {
        const reason=document.createElement("p"); reason.textContent="Motivo / dependência: " + action.reason; li.append(reason);
      }
      actionList.append(li);
    }
    details.append(actionList);

    if (item.inspectionDiagnostics) {
      const diagnostic=document.createElement("small");
      diagnostic.textContent="Inspeção: " + (item.inspectionDiagnostics.reason || "concluída") +
        " · legenda: " + (item.inspectionDiagnostics.captionAvailable===false ? "não legível" : "disponível");
      details.append(diagnostic);
    }
    card.append(details);

    const task=item.taskState || {};
    const controls=document.createElement("div"); controls.className="result-actions";
    const actions=[
      ["saved","Confirmar que salvou"],
      ["savedFolderVerified","Confirmar pasta correta"],
      ["liked","Confirmar curtida"],
      ["commented","Confirmar comentário"],
      ["sharedToGroup","Confirmar envio ao grupo"],
      ["groupCheck","Confirmar reação na mensagem"]
    ];
    for (const [key,label] of actions) {
      if (task[key] || (key==="savedFolderVerified" && !task.saved)) continue;
      const button=document.createElement("button"); button.type="button"; button.className="secondary small-action";
      button.textContent=label; button.dataset.action=key; button.dataset.url=item.url;
      button.dataset.messageId=item.messageId || ""; button.dataset.threadId=item.threadId || "";
      button.disabled=!item.identityVerified; controls.append(button);
    }
    if (!item.identityVerified) {
      const warning=document.createElement("small");
      warning.textContent="Sem vínculo seguro com a mensagem original: confirmações bloqueadas."; controls.append(warning);
    }
    card.append(controls); results.append(card);
  }
}
results.addEventListener("click", async event => {
  const copyButton=event.target.closest("button[data-copy-comment]");
  if (copyButton) {
    try {
      await navigator.clipboard.writeText(copyButton.dataset.copyComment);
      copyButton.textContent="Comentário copiado";
    } catch {
      window.alert("Não foi possível acessar a área de transferência.");
    }
    return;
  }
  const button=event.target.closest("button[data-action]");
  if (!button) return;
  const labels={
    saved:"Você já salvou esta publicação no Instagram?",
    savedFolderVerified:"Você conferiu que ela está na coleção/pasta correta?",
    liked:"Você já curtiu esta publicação?",
    commented:"Você já publicou o comentário no Instagram?",
    sharedToGroup:"Você enviou esta publicação ao grupo coletivo de envios?",
    groupCheck:"Você aplicou a reação na mensagem exata do grupo?"
  };
  const action=button.dataset.action;
  if (!window.confirm(labels[action] + "\n\nA aplicação apenas registrará sua confirmação; não executará a ação no Instagram.")) return;
  button.disabled=true;
  try {
    const response=await fetch("/api/confirm-action",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:button.dataset.url,messageId:button.dataset.messageId,threadId:button.dataset.threadId,action})});
    const data=await response.json();
    if (!response.ok) throw new Error(data.error || "Não foi possível registrar a confirmação.");
    await refresh();
  } catch(error) {
    window.alert(error.message);
    button.disabled=false;
  }
});


const cleanupCollection = document.querySelector("#cleanupCollection");
const cleanupTest = document.querySelector("#cleanupTest");
const cleanupAutomatic = document.querySelector("#cleanupAutomatic");
const cleanupStop = document.querySelector("#cleanupStop");
const cleanupMessage = document.querySelector("#cleanupMessage");
const cleanupCounter = document.querySelector("#cleanupCounter");
const cleanupResults = document.querySelector("#cleanupResults");

async function startCleanup(mode) {
  const collectionName = cleanupCollection.value.trim();
  if (!collectionName) { window.alert("Informe o nome exato da coleção."); return; }
  let confirm = false;
  if (mode === "automatic") {
    confirm = window.confirm("ATENÇÃO: cada publicação será aberta e dessalva individualmente. Isso remove o estado de salvo por completo, não apenas da coleção. A coleção e as publicações não serão apagadas. Deseja continuar?");
    if (!confirm) return;
  }
  cleanupTest.disabled = true; cleanupAutomatic.disabled = true;
  cleanupMessage.textContent = mode === "test" ? "Listando a coleção sem alterar nada..." : "Iniciando dessalvamento individual...";
  try {
    const response = await fetch("/api/cleanup", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ collectionName, mode, confirm }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Não foi possível iniciar a limpeza.");
    cleanupMessage.textContent = data.message;
    cleanupStop.disabled = false;
  } catch (error) {
    cleanupMessage.textContent = error.message;
    cleanupTest.disabled = false; cleanupAutomatic.disabled = false;
  }
}
cleanupTest.addEventListener("click", () => startCleanup("test"));
cleanupAutomatic.addEventListener("click", () => startCleanup("automatic"));
cleanupStop.addEventListener("click", async () => { await fetch("/api/stop",{method:"POST"}); cleanupStop.disabled=true; cleanupMessage.textContent="Solicitando parada..."; });

function renderCleanup(items) {
  cleanupResults.replaceChildren();
  if (!items.length) { const p=document.createElement("p"); p.className="muted"; p.textContent="Nenhum item listado ainda."; cleanupResults.append(p); return; }
  for (const item of items) {
    const card=document.createElement("article"); card.className="result";
    const title=document.createElement("strong"); title.textContent=item.contentType === "reel" ? "Reel" : "Feed / carrossel";
    const status=document.createElement("small"); status.textContent=item.status;
    const link=document.createElement("a"); link.href=item.url; link.target="_blank"; link.rel="noreferrer"; link.textContent="Abrir publicação";
    card.append(title,status,link); cleanupResults.append(card);
  }
}

async function refresh() {
  try {
    const [sr,rr,cr]=await Promise.all([fetch("/api/status"),fetch("/api/results"),fetch("/api/cleanup-results")]);
    const data=await sr.json(), p=data.progress, r=await rr.json(), cleanup=await cr.json();
    renderPreliminary(data.preliminarySummary, data.request);
    state.textContent=data.running?"Coletando":(data.connected?"Instagram conectado":"Pronto"); if (p.message) message.textContent=p.message;
    counter.textContent=`${p.done} de ${p.total} itens avaliados`;
    current.textContent=p.current||""; bar.style.width=p.total?`${Math.min(100,p.done/p.total*100)}%`:"0%";
    start.disabled=data.running; stop.disabled=!data.running;
    const resultItems=r.results||[];
    const resultSignature=JSON.stringify(resultItems);
    if(resultSignature!==lastResultsSignature){ render(resultItems); lastResultsSignature=resultSignature; }
    cleanupMessage.textContent = cleanup.progress?.message || "Nenhuma limpeza iniciada.";
    cleanupCounter.textContent = cleanup.progress ? `${cleanup.progress.done} de ${cleanup.progress.total} itens processados` : "";
    cleanupStop.disabled = !data.running || !cleanup.progress?.total;
    cleanupTest.disabled = data.running; cleanupAutomatic.disabled = data.running;
    renderCleanup(cleanup.results || []);
    copyDiagnostic.disabled = data.running || !data.hasDiagnostic;
    copyDiagnosticSummary.disabled = data.running || !data.hasDiagnostic;
    downloadDiagnostic.style.pointerEvents = copyDiagnostic.disabled ? "none" : "auto";
    downloadDiagnostic.style.opacity = copyDiagnostic.disabled ? "0.5" : "1";
    downloadDiagnosticSummary.style.pointerEvents = copyDiagnosticSummary.disabled ? "none" : "auto";
    downloadDiagnosticSummary.style.opacity = copyDiagnosticSummary.disabled ? "0.5" : "1";
  } catch {}
}
setInterval(refresh,1500); refresh();
