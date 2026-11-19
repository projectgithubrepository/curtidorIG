import { chromium } from "playwright";
import path from "node:path";

const PROFILE_DIR = path.resolve("data", "instagram-profile");

export async function openInstagram() {
  return chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1440, height: 1000 },
    locale: "pt-BR",
    args: ["--disable-blink-features=AutomationControlled"]
  });
}

export async function inspectPost(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);

  if (page.url().includes("/accounts/login")) {
    throw new Error("Faça login no Instagram na janela aberta e tente novamente.");
  }
  const caption = await page.locator("article").first().innerText({ timeout: 15000 }).catch(() => "");
  if (!caption.trim()) {
    throw new Error("Não consegui ler a publicação. Ela pode ser privada, indisponível ou exigir login.");
  }
  return caption.slice(0, 5000);
}

export async function likePost(page) {
  const unlike = page.getByRole("button", { name: /curtir|like/i });
  const alreadyLiked = page.getByRole("button", { name: /descurtir|unlike/i });
  if (await alreadyLiked.count()) return false;
  if (await unlike.count()) {
    await unlike.first().click();
    return true;
  }
  throw new Error("Não encontrei o botão de curtir.");
}

export async function commentPost(page, comment) {
  const textbox = page.locator('textarea[aria-label*="coment" i], textarea[placeholder*="coment" i], form textarea').first();
  await textbox.waitFor({ state: "visible", timeout: 10000 });
  await textbox.fill(comment);

  const publish = page.getByRole("button", { name: /publicar|postar|send/i });
  if (await publish.count()) {
    await publish.last().click();
  } else {
    await textbox.press("ControlOrMeta+Enter");
  }
  await page.waitForTimeout(1200);
}
