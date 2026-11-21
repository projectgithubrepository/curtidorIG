import test from "node:test";
import assert from "node:assert/strict";
import { isInstagramSavedUrl, selectSavedCollectionHref } from "../src/instagram.js";

test("accepts only Instagram URLs inside the Saved area", () => {
  assert.equal(isInstagramSavedUrl("https://www.instagram.com/usuario/saved/"), false);
  assert.equal(isInstagramSavedUrl("https://www.instagram.com/example/saved/12345/"), true);
  assert.equal(isInstagramSavedUrl("https://www.instagram.com/p/ABC123/"), false);
  assert.equal(isInstagramSavedUrl("https://example.com/saved/"), false);
  assert.equal(isInstagramSavedUrl("https://www.instagram.com/accounts/login/"), false);
});

test("selects the exact named collection only when its link stays inside Saved", () => {
  const result = selectSavedCollectionHref([
    { text: "Laranja antigos", href: "/usuario/saved/12345/" },
    { text: "Perfil", href: "/usuario/" },
    { text: "Laranja antigos", href: "/p/UNRELATED/" }
  ], "Laranja antigos", "https://www.instagram.com/usuario/saved/");
  assert.equal(result, "https://www.instagram.com/usuario/saved/12345/");
});

test("rejects collection-name links outside Saved instead of following unrelated URLs", () => {
  assert.throws(() => selectSavedCollectionHref([
    { text: "Laranja antigos", href: "/p/UNRELATED/" },
    { text: "Laranja antigos", href: "https://example.com/saved/123/" }
  ], "Laranja antigos", "https://www.instagram.com/usuario/saved/"), /não encontrei|Não encontrei/i);
});

test("rejects ambiguous matching collections", () => {
  assert.throws(() => selectSavedCollectionHref([
    { text: "Laranja antigos", href: "/usuario/saved/12345/" },
    { text: "Laranja antigos", href: "/usuario/saved/67890/" }
  ], "Laranja antigos", "https://www.instagram.com/usuario/saved/"), /mais de um link/i);
});

test("rejects a base page that has already redirected away from Saved", () => {
  assert.throws(() => selectSavedCollectionHref([
    { text: "Laranja antigos", href: "/usuario/saved/12345/" }
  ], "Laranja antigos", "https://www.instagram.com/accounts/login/"), /não pertence à área Salvos/i);
});

test("matches collection links when the exact name is exposed through accessible labels or nested labels", () => {
  const result = selectSavedCollectionHref([
    { href: "/usuario/saved/collections/98765/", text: "", ariaLabel: "Laranja antigo" },
    { href: "/p/WRONG/", text: "Laranja antigo" }
  ], "Laranja antigo", "https://www.instagram.com/usuario/saved/");
  assert.equal(result, "https://www.instagram.com/usuario/saved/collections/98765/");
});

test("normalizes whitespace and accents in collection labels without relaxing exact-name matching", () => {
  const result = selectSavedCollectionHref([
    { href: "/usuario/saved/98765/", labels: ["  LARANJÁ   antigo  "] }
  ], "Laranja antigo", "https://www.instagram.com/usuario/saved/");
  assert.equal(result, "https://www.instagram.com/usuario/saved/98765/");
});

test("matches exact collection name on its own line when the card also shows a post count", () => {
  const result = selectSavedCollectionHref([
    { href: "/usuario/saved/collections/98765/", text: "Laranja antigo\n12 publicações" }
  ], "Laranja antigo", "https://www.instagram.com/usuario/saved/");
  assert.equal(result, "https://www.instagram.com/usuario/saved/collections/98765/");
});
