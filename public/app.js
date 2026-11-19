const urls = document.querySelector("#urls");
const start = document.querySelector("#start");
const stop = document.querySelector("#stop");
const state = document.querySelector("#state");
const message = document.querySelector("#message");
const counter = document.querySelector("#counter");
const current = document.querySelector("#current");
const bar = document.querySelector("#bar");

start.addEventListener("click", async () => {
  const list = urls.value.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  start.disabled = true;
  try {
    const response = await fetch("/api/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls: list })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Não foi possível iniciar.");
    state.textContent = "Executando";
    stop.disabled = false;
    message.textContent = data.message;
  } catch (error) {
    message.textContent = error.message;
    start.disabled = false;
  }
});

stop.addEventListener("click", async () => {
  await fetch("/api/stop", { method: "POST" });
  stop.disabled = true;
  message.textContent = "Solicitando interrupção...";
});

async function refresh() {
  try {
    const response = await fetch("/api/status");
    const data = await response.json();
    const p = data.progress;
    state.textContent = data.running ? "Executando" : "Pronto";
    message.textContent = p.message;
    counter.textContent = `${p.done} de ${p.total} publicações`;
    current.textContent = p.current || "";
    bar.style.width = p.total ? `${Math.min(100, p.done / p.total * 100)}%` : "0%";
    start.disabled = data.running;
    stop.disabled = !data.running;
  } catch {}
}
setInterval(refresh, 1200);
refresh();
