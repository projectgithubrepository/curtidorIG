import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openInstagram, inspectPost, likePost, commentPost } from "./instagram.js";
import { createComment } from "./comments.js";
import { appendHistory, getProcessedUrls, readHistory } from "./history.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.resolve(__dirname, "../public")));

let running = false;
let stopRequested = false;
let browserContext = null;
let progress = { total: 0, done: 0, current: "", message: "Pronto." };

app.get("/api/status", (_req, res) => res.json({ running, progress }));
app.get("/api/history", (_req, res) => res.type("text/csv; charset=utf-8").send(readHistory()));

app.post("/api/stop", (_req, res) => {
  stopRequested = true;
  res.json({ ok: true, message: "A execução será interrompida após a publicação atual." });
});

app.post("/api/start", async (req, res) => {
  if (running) return res.status(409).json({ error: "Já existe uma execução em andamento." });
  const urls = [...new Set((req.body.urls || []).map((u) => String(u).trim()).filter(Boolean))];
  if (!urls.length) return res.status(400).json({ error: "Cole pelo menos uma URL." });
  if (urls.some((url) => !/^https?:\/\/(www\.)?instagram\.com\/(p|reel|tv)\//i.test(url))) {
    return res.status(400).json({ error: "Use URLs de publicações ou Reels do Instagram." });
  }
  const max = Math.max(1, Math.min(10, Number(process.env.MAX_POSTS_PER_RUN || 10)));
  if (urls.length > max) return res.status(400).json({ error: `Limite desta versão: ${max} publicações por execução.` });

  running = true;
  stopRequested = false;
  progress = { total: urls.length, done: 0, current: "", message: "Iniciando navegador..." };
  res.json({ ok: true, message: "Fila iniciada." });

  (async () => {
    try {
      browserContext = await openInstagram();
      const page = browserContext.pages()[0] || await browserContext.newPage();
      const processed = getProcessedUrls();
      for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        if (stopRequested) break;
        progress.current = url;
        progress.message = `Analisando publicação ${i + 1} de ${urls.length}`;
        if (processed.has(url)) {
          appendHistory({ url, status: "ignorada", detail: "URL já consta no histórico." });
          progress.done++;
          continue;
        }

        try {
          const caption = await inspectPost(page, url);
          const comment = await createComment(caption);
          progress.message = "Publicando interação...";
          const liked = await likePost(page);
          await commentPost(page, comment);
          appendHistory({ url, caption, liked, comment, status: "concluído" });
          processed.add(url);
        } catch (error) {
          appendHistory({ url, status: "erro", detail: error.message });
          progress.message = error.message;
          if (/login|bloque|desafio|captcha|checkpoint/i.test(error.message)) break;
        }
        progress.done++;
        if (i < urls.length - 1 && !stopRequested) {
          const delay = Math.max(60, Number(process.env.MIN_DELAY_SECONDS || 60));
          progress.message = `Aguardando ${delay}s antes da próxima publicação.`;
          await new Promise((resolve) => setTimeout(resolve, delay * 1000));
        }
      }
    } catch (error) {
      progress.message = error.message;
    } finally {
      if (browserContext) await browserContext.close().catch(() => {});
      browserContext = null;
      running = false;
      progress.current = "";
      if (stopRequested) progress.message = "Execução interrompida.";
      else if (progress.done >= progress.total) progress.message = "Fila finalizada.";
    }
  })();
});

const port = Number(process.env.PORT || 4173);
app.listen(port, "127.0.0.1", () => {
  console.log(`curtidorIG disponível em http://127.0.0.1:${port}`);
});
