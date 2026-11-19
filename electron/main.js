import { app, BrowserWindow, dialog } from "electron";
import path from "node:path";
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

async function createWindow() {
  if (app.isPackaged) {
    process.chdir(app.getPath("userData"));
    process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(process.resourcesPath, "playwright-browsers");
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
