import test from "node:test";
import assert from "node:assert/strict";
import { parseDestinationGroupUrl } from "../src/instagram-url.js";

test("accepts the canonical Instagram group conversation URL", () => {
  const result = parseDestinationGroupUrl("https://www.instagram.com/direct/t/17890001234567890/");
  assert.equal(result.valid, true);
  assert.equal(result.threadId, "17890001234567890");
  assert.equal(result.url, "https://www.instagram.com/direct/t/17890001234567890/");
});

test("accepts Instagram host variants, optional slash, query and fragment", () => {
  for (const input of [
    "https://instagram.com/direct/t/17890001234567890",
    "https://m.instagram.com/direct/t/17890001234567890/?igsh=abc",
    "https://www.instagram.com/direct/t/17890001234567890/?__a=1#messages"
  ]) {
    assert.equal(parseDestinationGroupUrl(input).valid, true, input);
  }
});

test("normalizes tracking parameters away before navigation", () => {
  const result = parseDestinationGroupUrl("https://instagram.com/direct/t/17890001234567890/?igsh=tracking");
  assert.equal(result.url, "https://www.instagram.com/direct/t/17890001234567890/");
});

test("accepts opaque alphanumeric thread identifiers without coercing them to numbers", () => {
  const result = parseDestinationGroupUrl("https://www.instagram.com/direct/t/abc_123-X/");
  assert.equal(result.valid, true);
  assert.equal(result.threadId, "abc_123-X");
});

test("rejects unrelated domains and non-specific inbox links with a useful reason", () => {
  assert.match(parseDestinationGroupUrl("https://example.com/direct/t/123/").reason, /domínio oficial/);
  assert.match(parseDestinationGroupUrl("https://www.instagram.com/direct/inbox/").reason, /conversa específica/);
  assert.match(parseDestinationGroupUrl("not a url").reason, /URL válida/);
});

test("rejects non-HTTPS links", () => {
  assert.match(parseDestinationGroupUrl("http://www.instagram.com/direct/t/123/").reason, /HTTPS/);
});
