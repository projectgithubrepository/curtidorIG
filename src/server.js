import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openInstagram, collectGroupPosts, inspectPost } from "./instagram.js";
import { createComment } from "./comments.js";
import { appendHistory, getProcessedUrls, getRecentComments, readHistory } from "./history.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.resolve(__dirname, "../public")));

let running = false;
let stopRequested = false;
let browserContext = null;
let results = [];
let progress = { total: 0, done: 0, current: "", message: "Pronto." };

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
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(startDate) || !/^\\d{4}-\\d{2}-\\d{2}$/.test(endDate) || startDate > endDate) {
    return res.status(400).json({ error: "Informe um período válido, com data inicial anterior ou igual à final." });
  }

  running = true;
  stopRequested = false;
  results = [];
  progress = { total: 0, done: 0, current: groupName, message: "Abrindo o Instagram..." };
  res.json({ ok: true, message: "Coleta iniciada." });

  (async () => {
    try {
      const context = await getInstagramContext();
      const page = context.pages()[0] || await context.newPage();
      progress.message = "Localizando a conversa. O nome precisa corresponder exatamente.";
      const collected = await collectGroupPosts(page, { groupName, startDate, endDate, shouldStop: () => stopRequested });
      if (stopRequested) return;
      const processed = getProcessedUrls();
      progress.total = collected.length;
      progress.message = `${collected.length} publicações encontradas. Preparando comentários...`;
      const previous = getRecentComments(200);
      for (const item of collected) {
        if (stopRequested) break;
        if (processed.has(item.url)) {
          results.push({ ...item, status: "já registrada", comment: "" });
          progress.done++;
          continue;
        }
        try {
          const caption = await inspectPost(page, item.url);
          const comment = createComment(caption, [...previous, ...results.map(r => r.comment).filter(Boolean)]);
          const result = { ...item, caption, comment, status: "pronta para revisão" };
          results.push(result);
          appendHistory({ url: item.url, caption, comment, status: "coletada", groupName, sharedAt: item.sharedAt, detail: `Grupo: ${groupName}; mensagem: ${item.sharedAt}` });
          processed.add(item.url);
        } catch (error) {
          const result = { ...item, caption: "", comment: "", status: "não foi possível analisar", detail: error.message };
          results.push(result);
          appendHistory({ url: item.url, status: "erro na análise", groupName, sharedAt: item.sharedAt, detail: error.message });
        }
        progress.done++;
      }
      progress.message = `Coleta concluída: ${results.length} itens listados. Revise antes de qualquer interação no Instagram.`;
    } catch (error) {
      progress.message = error.message;
    } finally {
      // Mantém o contexto persistente aberto para preservar a sessão autenticada.
      running = false;
      progress.current = "";
      if (stopRequested) progress.message = "Coleta interrompida.";
    }
  })();
});

const port = Number(process.env.PORT || 4173);
app.listen(port, "127.0.0.1", () => console.log(`curtidorIG disponível em http://127.0.0.1:${port}`));
