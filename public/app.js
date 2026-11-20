const groupName = document.querySelector("#groupName");
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
    const response = await fetch("/api/start", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ groupName:groupName.value, startDate:startDate.value, endDate:endDate.value }) });
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
    const link=document.createElement("a"); link.href=item.url; link.target="_blank"; link.rel="noreferrer"; link.textContent=item.url;
    const status=document.createElement("strong"); status.textContent=item.status;
    const type=document.createElement("small"); type.textContent=item.contentType === "story" ? "Story" : "Feed / Reel";
    const stateLine=document.createElement("small");
    const task=item.taskState || { saved:false, liked:false, commented:false, groupCheck:Boolean(item.groupCheck) };
    stateLine.textContent = [`Salva: ${task.saved ? "sim" : "pendente"}`, `Curtida: ${task.liked ? "sim" : "pendente"}`, `Comentada: ${task.commented ? "sim" : "pendente"}`, `Check no grupo: ${task.groupCheck ? "sim" : "pendente"}`].join(" · ");
    const date=document.createElement("small"); date.textContent=item.sharedAt ? new Date(item.sharedAt).toLocaleString("pt-BR") : "Data não identificada";
    const markers=document.createElement("small");
    const milestoneCount=(item.administrativeMilestones || []).length;
    markers.textContent=milestoneCount ? `${milestoneCount} marco(s) administrativo(s) identificado(s) no histórico visível` : "";
    const caption=document.createElement("p"); caption.textContent=item.caption || item.detail || "";
    const comment=document.createElement("p"); comment.className="comment"; comment.textContent=item.comment ? "Comentário sugerido: "+item.comment : "";
    card.append(status,type,stateLine,date,markers,link,caption,comment); results.append(card);
  }
}
async function refresh() {
  try {
    const [sr,rr]=await Promise.all([fetch("/api/status"),fetch("/api/results")]);
    const data=await sr.json(), p=data.progress, r=await rr.json();
    state.textContent=data.running?"Coletando":(data.connected?"Instagram conectado":"Pronto"); if (p.message) message.textContent=p.message;
    counter.textContent=`${p.done} de ${p.total} publicações processadas`;
    current.textContent=p.current||""; bar.style.width=p.total?`${Math.min(100,p.done/p.total*100)}%`:"0%";
    start.disabled=data.running; stop.disabled=!data.running; render(r.results||[]);
  } catch {}
}
setInterval(refresh,1500); refresh();
