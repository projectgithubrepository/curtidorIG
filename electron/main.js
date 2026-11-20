import { app, BrowserWindow, dialog } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let mainWindow;

async function waitForServer(url, attempts = 40) {
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error("O servidor local não iniciou.");
}

async function ensureChromium() {
  const browsersPath = path.join(app.getPath("userData"), "playwright-browsers");
  process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath;
  const { chromium } = await import("playwright");
  try {
    await fs.access(chromium.executablePath());
    return;
  } catch {}

  await dialog.showMessageBox({
    type: "info",
    title: "Primeira inicialização",
    message: "Preparando o navegador do curtidorIG",
    detail: "Na primeira abertura, o aplicativo precisa baixar o Chromium. Isso acontece uma única vez e pode levar alguns minutos."
  });

  const cliPath = path.join(process.resourcesPath, "app.asar.unpacked", "node_modules", "playwright", "cli.js");
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, "install", "chromium"], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", PLAYWRIGHT_BROWSERS_PATH: browsersPath },
      stdio: "inherit"
    });
    child.once("error", reject);
    child.once("exit", code => code === 0 ? resolve() : reject(new Error("Não foi possível baixar o Chromium. Verifique a conexão com a internet e abra o aplicativo novamente.")));
  });
}

async function createWindow() {
  if (app.isPackaged) {
    process.chdir(app.getPath("userData"));
    await ensureChromium();
  }
  await import("../src/server.js");
  const url = "http://127.0.0.1:4173";
  await waitForServer(url);
  mainWindow = new BrowserWindow({
    width: 1040,
    height: 820,
    minWidth: 760,
    minHeight: 620,
    title: "curtidorIG",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());
  await mainWindow.loadURL(url);
  mainWindow.on("closed", () => { mainWindow = null; });
}

app.whenReady().then(createWindow).catch(async error => {
  await dialog.showMessageBox({ type: "error", title: "curtidorIG", message: "Não foi possível iniciar o aplicativo.", detail: error.message });
  app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
