import test from "node:test";
import assert from "node:assert/strict";
import { classifyPostControls } from "../src/instagram.js";

test("recognizes like/save labels when data-testid precedes the accessible label", () => {
  const result = classifyPostControls([
    { testId: "like_button", labels: ["like_button", "Curtir"] },
    { testId: "save_button", labels: ["save_button", "Salvar"] }
  ]);
  assert.equal(result.likedKnown, true);
  assert.equal(result.liked, false);
  assert.equal(result.savedKnown, true);
  assert.equal(result.saved, false);
});

test("recognizes already-liked and already-saved states in Portuguese and English", () => {
  const result = classifyPostControls([
    { testId: "unlike_button", labels: ["unlike_button", "Descurtir"] },
    { testId: "unsave_button", labels: ["unsave_button", "Remover dos salvos"] }
  ]);
  assert.equal(result.likedKnown, true);
  assert.equal(result.liked, true);
  assert.equal(result.savedKnown, true);
  assert.equal(result.saved, true);
});

test("normalizes accents and separators without matching incidental words", () => {
  const result = classifyPostControls([
    { labels: ["Curtir publicação"] },
    { labels: ["Salvar publicação"] },
    { labels: ["42 curtidas", "Comentários", "Enviar mensagem"] }
  ]);
  assert.equal(result.likedKnown, true);
  assert.equal(result.savedKnown, true);
  assert.equal(result.likeCandidateCount, 1);
  assert.equal(result.saveCandidateCount, 1);
});

test("keeps a state unknown when more than one control matches the same action", () => {
  const result = classifyPostControls([
    { labels: ["Curtir"] },
    { labels: ["Like"] },
    { labels: ["Salvar"] }
  ]);
  assert.equal(result.likedKnown, false);
  assert.equal(result.savedKnown, true);
  assert.equal(result.likeCandidateCount, 2);
});

test("keeps contradictory evidence on one control unknown", () => {
  const result = classifyPostControls([
    { labels: ["Curtir", "Descurtir"] },
    { labels: ["Salvar"] }
  ]);
  assert.equal(result.likedKnown, false);
  assert.equal(result.savedKnown, true);
});
