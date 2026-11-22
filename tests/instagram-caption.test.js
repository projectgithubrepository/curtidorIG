import test from "node:test";
import assert from "node:assert/strict";
import { interpretPostSnapshot } from "../src/instagram.js";

const url = "https://www.instagram.com/p/AbCdEf12345/";

test("uses only caption-specific content and never substitutes the whole main page", () => {
  const result = interpretPostSnapshot({
    url, requestedUrl: url, httpStatus: 200,
    title: "Instagram",
    bodyText: "author\nSeguindo\nCurtidas\nComentários",
    mainText: "author\nSeguindo\ncaption text\nother comments\nlikes",
    articleText: "author\ncaption text\nother comments",
    captionText: "caption text",
    hasImage: true,
    selectors: { main: true, article: true }
  });
  assert.equal(result.caption, "caption text");
  assert.equal(result.diagnostics.captionSource, "caption-specific DOM");
});

test("returns an empty caption when no caption-specific element exists", () => {
  const result = interpretPostSnapshot({
    url, requestedUrl: url, httpStatus: 200,
    title: "Instagram",
    bodyText: "author\nSeguindo\nCurtidas\nComentários",
    mainText: "author\ncomments\nlikes",
    articleText: "author\ncomments",
    ogDescription: "author · 123 likes",
    hasImage: true,
    selectors: { main: true, article: true }
  });
  assert.equal(result.caption, "");
  assert.equal(result.diagnostics.captionAvailable, false);
  assert.equal(result.diagnostics.captionSource, "not found — neutral fallback required");
});
