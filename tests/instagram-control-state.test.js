import test from "node:test";
import assert from "node:assert/strict";
import { classifyPostControls, isCommentStateVerified } from "../src/instagram.js";

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

test("does not infer an unsaved state from generic like_button/save_button identifiers alone", () => {
  const result = classifyPostControls([
    { testId: "like_button", labels: ["like_button"] },
    { testId: "save_button", labels: ["save_button"] }
  ]);
  assert.equal(result.likedKnown, false);
  assert.equal(result.savedKnown, false);
});

test("accepts explicit state-specific test IDs when accessible labels are absent", () => {
  const result = classifyPostControls([
    { testId: "unlike_button", labels: ["unlike_button"] },
    { testId: "unsave_button", labels: ["unsave_button"] }
  ]);
  assert.equal(result.likedKnown, true);
  assert.equal(result.liked, true);
  assert.equal(result.savedKnown, true);
  assert.equal(result.saved, true);
});

test("verifies a prior comment from a positive author match even when the list is partial", () => {
  assert.equal(isCommentStateVerified({ usernameKnown: true, alreadyCommented: true, commentListComplete: false }), true);
});

test("does not treat a partial comment list without a positive author match as verified", () => {
  assert.equal(isCommentStateVerified({ usernameKnown: true, alreadyCommented: false, commentListComplete: false }), false);
  assert.equal(isCommentStateVerified({ usernameKnown: false, alreadyCommented: true, commentListComplete: true }), false);
});


test("recognizes accessible labels that include the button role suffix", () => {
  const result = classifyPostControls([
    { labels: ["Curtir, botão"] },
    { labels: ["Salvar, botão"] }
  ]);
  assert.equal(result.likedKnown, true);
  assert.equal(result.liked, false);
  assert.equal(result.savedKnown, true);
  assert.equal(result.saved, false);
});

test("recognizes English accessible labels with button suffix", () => {
  const result = classifyPostControls([
    { labels: ["Unlike, button"] },
    { labels: ["Remove from saved, button"] }
  ]);
  assert.equal(result.likedKnown, true);
  assert.equal(result.liked, true);
  assert.equal(result.savedKnown, true);
  assert.equal(result.saved, true);
});


test("uses explicit aria-pressed state for generic Instagram like/save toggles", () => {
  const result = classifyPostControls([
    { testId: "like_button", labels: ["like_button"], ariaPressed: "true" },
    { testId: "save_button", labels: ["save_button"], ariaPressed: "false" }
  ]);
  assert.equal(result.likedKnown, true);
  assert.equal(result.liked, true);
  assert.equal(result.savedKnown, true);
  assert.equal(result.saved, false);
});

test("does not use aria-pressed from unrelated controls", () => {
  const result = classifyPostControls([
    { testId: "follow_button", labels: ["Follow"], ariaPressed: "true" },
    { testId: "like_button", labels: ["like_button"], ariaPressed: "mixed" },
    { testId: "save_button", labels: ["save_button"], ariaPressed: "" }
  ]);
  assert.equal(result.likedKnown, false);
  assert.equal(result.savedKnown, false);
});
