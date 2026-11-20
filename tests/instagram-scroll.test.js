import test from "node:test";
import assert from "node:assert/strict";
import { olderScrollPosition } from "../src/instagram.js";

test("moves toward older messages in a normal scroll container without going below zero", () => {
  assert.equal(olderScrollPosition(1200, 500, "column"), 700);
  assert.equal(olderScrollPosition(200, 500, "column"), 0);
});

test("moves toward older messages in a reversed container using negative scrollTop", () => {
  assert.equal(olderScrollPosition(0, 500, "column-reverse"), -500);
  assert.equal(olderScrollPosition(-500, 500, "column-reverse"), -1000);
});

test("continues negative scroll when the browser already reports a negative scrollTop", () => {
  assert.equal(olderScrollPosition(-250, 400, "column"), -650);
});
