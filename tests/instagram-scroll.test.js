import test from "node:test";
import assert from "node:assert/strict";
import { olderScrollPosition, didScrollTowardOlderMessages, didReachHistoryStart } from "../src/instagram.js";

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

test("does not treat scrollHeight or message-marker growth as scroll progress", () => {
  const before = { found: true, scrollTop: 500, scrollHeight: 2400, messageMarkers: 12 };
  const after = { found: true, scrollTop: 500, scrollHeight: 3200, messageMarkers: 28 };
  assert.equal(didScrollTowardOlderMessages(before, after), false);
});

test("counts only movement toward older messages as progress", () => {
  assert.equal(didScrollTowardOlderMessages({ found: true, scrollTop: 500 }, { found: true, scrollTop: 300 }), true);
  assert.equal(didScrollTowardOlderMessages({ found: true, scrollTop: 300 }, { found: true, scrollTop: 500 }), false);
  assert.equal(didScrollTowardOlderMessages({ found: false, scrollTop: 500 }, { found: true, scrollTop: 300 }), false);
});


test("does not declare history complete when the selected container starts at the top without moving", () => {
  const top = { found: true, scrollTop: 0, scrollHeight: 2400, clientHeight: 800, flexDirection: "column" };
  assert.equal(didReachHistoryStart(top, false), false);
  assert.equal(didReachHistoryStart(top, true), true);
});
