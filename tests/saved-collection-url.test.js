import test from "node:test";
import assert from "node:assert/strict";
import {
  buildInstagramSavedUrl,
  extractInstagramUsernameFromProfileHref,
  isInstagramSavedUrl,
  isInstagramSavedCollectionUrl,
  selectSavedCollectionHref
} from "../src/instagram.js";

test("builds the Saved route from the authenticated profile username, not a hardcoded account", () => {
  assert.equal(extractInstagramUsernameFromProfileHref("/marianatomaz.psi/"), "marianatomaz.psi");
  assert.equal(buildInstagramSavedUrl("marianatomaz.psi"), "https://www.instagram.com/marianatomaz.psi/saved/");
  assert.equal(buildInstagramSavedUrl("another.account"), "https://www.instagram.com/another.account/saved/");
});

test("recognizes /{username}/saved/ and rejects generic or unrelated routes", () => {
  assert.equal(isInstagramSavedUrl("https://www.instagram.com/marianatomaz.psi/saved/"), true);
  assert.equal(isInstagramSavedUrl("https://www.instagram.com/saved/"), false);
  assert.equal(isInstagramSavedUrl("https://www.instagram.com/explore/"), false);
  assert.equal(isInstagramSavedUrl("https://example.com/marianatomaz.psi/saved/"), false);
});

test("collection matching stays within the authenticated profile Saved page", () => {
  const base = "https://www.instagram.com/marianatomaz.psi/saved/";
  assert.equal(isInstagramSavedCollectionUrl(base, base), true);
  assert.equal(isInstagramSavedCollectionUrl("https://www.instagram.com/otheruser/saved/", base), false);
  assert.equal(isInstagramSavedCollectionUrl("https://www.instagram.com/p/ABC123/", base), false);
});

test("requires the exact collection label on a Saved link", () => {
  const base = "https://www.instagram.com/marianatomaz.psi/saved/";
  assert.equal(selectSavedCollectionHref([
    { href: "/marianatomaz.psi/saved/", text: "Laranja antigo" }
  ], "Laranja antigo", base), base);
  assert.throws(() => selectSavedCollectionHref([
    { href: "/otheruser/saved/", text: "Laranja antigo" }
  ], "Laranja antigo", base), /Não encontrei um link inequívoco/);
});
