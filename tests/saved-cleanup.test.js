import test from "node:test";
import assert from "node:assert/strict";
import { isInstagramSavedUrl, selectSavedCollectionHref } from "../src/instagram.js";

test("accepts only Instagram URLs inside the Saved area", () => {
  assert.equal(isInstagramSavedUrl("https://www.instagram.com/saved/"), true);
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
  ], "Laranja antigos", "https://www.instagram.com/saved/");
  assert.equal(result, "https://www.instagram.com/usuario/saved/12345/");
});

test("rejects collection-name links outside Saved instead of following unrelated URLs", () => {
  assert.throws(() => selectSavedCollectionHref([
    { text: "Laranja antigos", href: "/p/UNRELATED/" },
    { text: "Laranja antigos", href: "https://example.com/saved/123/" }
  ], "Laranja antigos", "https://www.instagram.com/saved/"), /não encontrei|Não encontrei/i);
});

test("rejects ambiguous matching collections", () => {
  assert.throws(() => selectSavedCollectionHref([
    { text: "Laranja antigos", href: "/usuario/saved/12345/" },
    { text: "Laranja antigos", href: "/usuario/saved/67890/" }
  ], "Laranja antigos", "https://www.instagram.com/saved/"), /mais de um link/i);
});

test("rejects a base page that has already redirected away from Saved", () => {
  assert.throws(() => selectSavedCollectionHref([
    { text: "Laranja antigos", href: "/usuario/saved/12345/" }
  ], "Laranja antigos", "https://www.instagram.com/accounts/login/"), /não pertence à área Salvos/i);
});
