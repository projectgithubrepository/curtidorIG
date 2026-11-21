import test from "node:test";
import assert from "node:assert/strict";
import { interpretPostSnapshot } from "../src/instagram.js";

test("media-only post remains inspectable for read-only planning", () => {
  const result = interpretPostSnapshot({
    url: "https://www.instagram.com/reel/abc123",
    requestedUrl: "https://www.instagram.com/reel/abc123",
    httpStatus: 200,
    title: "Instagram",
    bodyText: "",
    articleText: "",
    mainText: "",
    dialogText: "",
    ogDescription: "",
    hasVideo: true,
    hasImage: false,
    selectors: { article: false, main: true, dialog: false }
  });
  assert.equal(result.caption, "");
  assert.equal(result.diagnostics.captionAvailable, false);
  assert.equal(result.diagnostics.reason, "media-without-readable-caption");
});

test("post with readable main text returns a caption", () => {
  const result = interpretPostSnapshot({
    url: "https://www.instagram.com/p/abc123",
    httpStatus: 200,
    title: "Instagram",
    bodyText: "Publicação de exemplo",
    articleText: "",
    mainText: "Uma legenda que pode ser analisada.",
    dialogText: "",
    ogDescription: "",
    hasVideo: false,
    hasImage: true,
    selectors: { article: false, main: true, dialog: false }
  });
  assert.equal(result.caption, "Uma legenda que pode ser analisada.");
  assert.equal(result.diagnostics.captionAvailable, true);
});
