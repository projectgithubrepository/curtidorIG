import test from "node:test";
import assert from "node:assert/strict";
import { isInstagramSavedUrl, isInstagramSavedCollectionUrl, selectSavedCollectionHref } from "../src/instagram.js";

test("the generic /saved route is not a collection", () => {
  assert.equal(isInstagramSavedUrl("https://www.instagram.com/saved/"), true);
  assert.equal(isInstagramSavedCollectionUrl("https://www.instagram.com/saved/"), false);
  assert.equal(isInstagramSavedCollectionUrl("https://www.instagram.com/saved/collections/"), false);
});

test("only a collection-specific Saved route is accepted", () => {
  assert.equal(isInstagramSavedCollectionUrl("https://www.instagram.com/saved/collections/179123456789/"), true);
  assert.equal(isInstagramSavedCollectionUrl("https://www.instagram.com/saved/collection/179123456789/"), true);
  assert.equal(isInstagramSavedCollectionUrl("https://www.instagram.com/p/ABC123/"), false);
  assert.equal(isInstagramSavedCollectionUrl("https://example.com/saved/collections/123/"), false);
});

test("a label pointing to the generic /saved page is rejected", () => {
  assert.throws(() => selectSavedCollectionHref([
    { href: "/saved/", text: "Laranja antigo" }
  ], "Laranja antigo", "https://www.instagram.com/saved/"), /Não encontrei um link inequívoco/);
});

test("an exact collection label and identified collection URL are accepted", () => {
  assert.equal(selectSavedCollectionHref([
    { href: "/saved/collections/179123456789/", text: "Laranja antigo" }
  ], "Laranja antigo", "https://www.instagram.com/saved/"),
  "https://www.instagram.com/saved/collections/179123456789/");
});
