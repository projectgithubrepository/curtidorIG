import test from "node:test";
import assert from "node:assert/strict";
import { addNetworkMessages } from "../src/instagram.js";

const url = "https://www.instagram.com/p/POST12345";
const threadId = "1783131735658148";
const options = (found, fallback) => ({
  groupThreadId: threadId,
  startDate: "2026-11-18",
  endDate: "2026-11-18",
  found,
  fallback,
  milestones: new Map()
});

test("does not discard a message with a link and identity when its timestamp is missing", () => {
  const found = new Map();
  const fallback = new Map();
  const result = addNetworkMessages([{
    messageId: "message-no-date",
    threadId,
    timestamp: "",
    urls: [url],
    text: "Pedido com publicação"
  }], options(found, fallback));
  assert.equal(result.unknownDateCandidates, 1);
  assert.equal(found.size, 0);
  assert.equal(fallback.size, 1);
  const item = [...fallback.values()][0];
  assert.equal(item.dateUnknown, true);
  assert.equal(item.url, url);
});

test("a later valid timestamp resolves an earlier unknown-date candidate", () => {
  const found = new Map();
  const fallback = new Map();
  const args = options(found, fallback);
  addNetworkMessages([{ messageId:"message-1", threadId, timestamp:"", urls:[url], text:"Pedido" }], args);
  addNetworkMessages([{
    messageId:"message-1", threadId, timestamp:"2026-11-18T14:00:00.000Z",
    urls:[url], text:"Pedido"
  }], args);
  assert.equal(fallback.size, 0);
  assert.equal(found.size, 1);
  const item = [...found.values()][0];
  assert.equal(item.dateUnknown, false);
  assert.equal(item.sharedAt, "2026-11-18T14:00:00.000Z");
});

test("a known timestamp from the visible DOM is not overwritten by an empty network timestamp", () => {
  const found = new Map([[url, {
    url, sharedAt:"2026-11-18T12:00:00.000Z", dateUnknown:false, collectionMode:"date"
  }]]);
  const fallback = new Map();
  addNetworkMessages([{
    messageId:"message-dom-date", threadId, timestamp:"", urls:[url], text:"Pedido"
  }], options(found, fallback));
  assert.equal(fallback.size, 0);
  assert.equal(found.size, 1);
  const item = [...found.values()][0];
  assert.equal(item.dateUnknown, false);
  assert.equal(item.sharedAt, "2026-11-18T12:00:00.000Z");
});
