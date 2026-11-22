import test from "node:test";
import assert from "node:assert/strict";
import { normalizeStoryControlLabel } from "../src/instagram.js";

test("normalizes exact Story confirmation labels independent of accent and whitespace", () => {
  assert.equal(normalizeStoryControlLabel("Ver story"), "ver story");
  assert.equal(normalizeStoryControlLabel("  VER   STORY  "), "ver story");
});

test("does not accept unrelated Story controls as confirmation", () => {
  assert.notEqual(normalizeStoryControlLabel("Responder story"), "ver story");
  assert.notEqual(normalizeStoryControlLabel("Enviar mensagem"), "ver story");
});
