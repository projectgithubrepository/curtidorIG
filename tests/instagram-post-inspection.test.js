import test from "node:test";
import assert from "node:assert/strict";
import { interpretPostSnapshot } from "../src/instagram.js";

test("reads a post from main when Instagram does not render an article", () => {
  const result = interpretPostSnapshot({
    requestedUrl: "https://www.instagram.com/reel/ABC123",
    url: "https://www.instagram.com/reel/ABC123/",
    httpStatus: 200,
    title: "Instagram",
    mainText: "Perfil\nLegenda real do Reel\nComentários",
    bodyText: "Legenda real do Reel",
    selectors: { article: false, main: true, dialog: false },
    hasVideo: true
  });
  assert.match(result.caption, /Legenda real do Reel/);
  assert.equal(result.diagnostics.finalUrl, "https://www.instagram.com/reel/ABC123/");
});

test("classifies login redirects separately from unavailable posts", () => {
  assert.throws(() => interpretPostSnapshot({
    requestedUrl: "https://www.instagram.com/p/ABC123",
    url: "https://www.instagram.com/accounts/login/",
    httpStatus: 200,
    bodyText: "Entre para continuar",
    selectors: {}
  }), error => error.inspectionDiagnostics.reason === "login");
});

test("does not label a media-only page as private or unavailable", () => {
  assert.throws(() => interpretPostSnapshot({
    requestedUrl: "https://www.instagram.com/reel/ABC123",
    url: "https://www.instagram.com/reel/ABC123/",
    httpStatus: 200,
    bodyText: "",
    hasVideo: true,
    selectors: { video: true }
  }), error => {
    assert.equal(error.inspectionDiagnostics.reason, "media-without-readable-caption");
    assert.match(error.message, /carregou mídia/);
    return true;
  });
});

test("classifies HTTP errors with their response status", () => {
  assert.throws(() => interpretPostSnapshot({
    requestedUrl: "https://www.instagram.com/p/ABC123",
    url: "https://www.instagram.com/p/ABC123/",
    httpStatus: 404,
    bodyText: "",
    selectors: {}
  }), error => error.inspectionDiagnostics.reason === "http-error" && /404/.test(error.message));
});
