const groupName = document.querySelector("#groupName");
const collectionName = document.querySelector("#collectionName");
const destinationGroupName = document.querySelector("#destinationGroupName");
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

const connect = document.querySelector("#connect");
const copyDiagnostic = document.querySelector("#copyDiagnostic");
const diagnosticCopyStatus = document.querySelector("#diagnosticCopyStatus");
const downloadDiagnostic = document.querySelector("#downloadDiagnostic");

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
  const response = await fetch("/api/start", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ groupName:groupName.value, collectionName:collectionName.value, destinationGroupName:destinationGroupName.value, mode:mode.value, completionEmoji:completionEmoji.value, confirm:confirmed, startDate:startDate.value, endDate:endDate.value }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Não foi possível iniciar.");
    message.textContent = data.message;
    state.textContent = "Coletando";
    stop.disabled = false;
  } catch (error) { message.textContent = error.message; start.disabled = false; }
});
stop.addEventListener("click", async () => { await fetch("/api/stop",{method:"POST"}); stop.disabled=true; message.textContent="Solicitando parada..."; });
function render(items) {
  results.replaceChildren();
  if (!items.length) { const p=document.createElement("p"); p.className="muted"; p.textContent="Nenhuma publicação listada ainda."; results.append(p); return; }
  for (const item of items) {
    const card=document.createElement("article"); card.className="result";
    const link=document.createElement("a"); link.href=item.url; link.target="_blank"; link.rel="noreferrer"; link.textContent="Abrir publicação no Instagram";
    const status=document.createElement("strong"); status.textContent=item.status || "Pendente";
    const type=document.createElement("small"); type.textContent=item.contentType === "story" ? "Story · fluxo específico ainda não automatizado" : "Feed / Reel";
    const stateLine=document.createElement("small");
    const task=item.taskState || { saved:false, savedFolderVerified:false, liked:false, commented:false, sharedToGroup:false, groupCheck:false };
    stateLine.textContent = [`Salva: ${task.saved ? "confirmada" : "pendente"}`, `Pasta: ${task.savedFolderVerified ? "confirmada" : "pendente"}`, `Curtida: ${task.liked ? "confirmada" : "pendente"}`, `Comentário: ${task.commented ? "confirmado" : task.commentForbidden ? "dispensado pelo pedido" : "pendente"}`, `Enviado ao grupo: ${task.sharedToGroup ? "confirmado" : "pendente"}`, `Reação na mensagem: ${task.groupCheck ? "confirmada" : "pendente"}`].join(" · ");
    const date=document.createElement("small"); date.textContent=item.sharedAt ? new Date(item.sharedAt).toLocaleString("pt-BR") : "Data não identificada";
    const markers=document.createElement("small");
    const milestoneCount=(item.administrativeMilestones || []).length;
    markers.textContent=milestoneCount ? "Marcos visíveis: " + (item.administrativeMilestones || []).map(marker => `${marker.date || "data não identificada"} · ${marker.feedCount ?? "?"} Feed · ${marker.storiesCount ?? "?"} Stories`).join(" | ") : "";
    const caption=document.createElement("p"); caption.textContent=item.caption || item.detail || "";
    const comment=document.createElement("p"); comment.className="comment"; comment.textContent=item.comment ? "Comentário sugerido: "+item.comment : "";
    const actionDetails=document.createElement("div"); actionDetails.className="action-details";
    for (const action of (item.actionLog || [])) { const line=document.createElement("small"); line.textContent=`${action.action}: ${action.status}${action.reason ? " — "+action.reason : ""}`; actionDetails.append(line); }
    for (const action of (item.plan || [])) { const line=document.createElement("small"); line.textContent=`${action.label}: ${action.status}${action.reason ? " — "+action.reason : ""}`; actionDetails.append(line); }
    if (item.comment) {
      const copyComment=document.createElement("button"); copyComment.type="button"; copyComment.className="secondary small-action";
      copyComment.textContent="Copiar comentário"; copyComment.dataset.copyComment=item.comment;
      card.append(copyComment);
    }
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
      button.textContent=label; button.dataset.action=key; button.dataset.url=item.url; button.dataset.messageId=item.messageId || ""; button.dataset.threadId=item.threadId || "";
      button.disabled=!item.identityVerified;
      controls.append(button);
    }
    if (!item.identityVerified) {
      const warning=document.createElement("small"); warning.textContent="Sem vínculo seguro com a mensagem original: confirmações bloqueadas."; controls.append(warning);
    }
    card.append(status,type,stateLine,date,markers,link,caption,comment,actionDetails,controls); results.append(card);
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
    state.textContent=data.running?"Coletando":(data.connected?"Instagram conectado":"Pronto"); if (p.message) message.textContent=p.message;
    counter.textContent=`${p.done} de ${p.total} publicações processadas`;
    current.textContent=p.current||""; bar.style.width=p.total?`${Math.min(100,p.done/p.total*100)}%`:"0%";
    start.disabled=data.running; stop.disabled=!data.running; render(r.results||[]);
    cleanupMessage.textContent = cleanup.progress?.message || "Nenhuma limpeza iniciada.";
    cleanupCounter.textContent = cleanup.progress ? `${cleanup.progress.done} de ${cleanup.progress.total} itens processados` : "";
    cleanupStop.disabled = !data.running || !cleanup.progress?.total;
    cleanupTest.disabled = data.running; cleanupAutomatic.disabled = data.running;
    renderCleanup(cleanup.results || []);
    copyDiagnostic.disabled = data.running || !data.hasDiagnostic;
    downloadDiagnostic.style.pointerEvents = copyDiagnostic.disabled ? "none" : "auto";
    downloadDiagnostic.style.opacity = copyDiagnostic.disabled ? "0.5" : "1";
  } catch {}
}
setInterval(refresh,1500); refresh();
