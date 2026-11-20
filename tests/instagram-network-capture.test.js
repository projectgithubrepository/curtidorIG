import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createInstagramNetworkCapture } from "../src/instagram-network-capture.js";

test("captures GraphQL response structure without retaining message text", async () => {
  const page = new EventEmitter();
  const capture = createInstagramNetworkCapture(page);
  const response = {
    url: () => "https://www.instagram.com/api/graphql",
    status: () => 200,
    headers: () => ({ "content-type": "application/json", "content-length": "500" }),
    request: () => ({
      postDataJSON: () => ({ operationName: "IGDThreadDetailQuery" }),
      url: () => "https://www.instagram.com/api/graphql"
    }),
    json: async () => ({
      data: {
        thread: {
          items: [{
            message_id: "mid.123",
            text_body: "texto privado que não deve ser salvo",
            timestamp_ms: 123,
            sender: { id: "user-1" },
            reactions: [{ emoji: "✅" }],
            share: { url: "https://www.instagram.com/p/ABC123/" }
          }]
        }
      }
    })
  };

  page.emit("response", response);
  await capture.stop();
  const summary = capture.summary();
  const records = capture.records();
  assert.equal(summary.capturedResponses, 1);
  assert.deepEqual(summary.operations, ["IGDThreadDetailQuery"]);
  assert.equal(summary.messageLikeObjects, 1);
  assert.equal(summary.hasReactionFields, true);
  assert.equal(summary.hasShareFields, true);
  assert.equal(summary.hasMessageId, true);
  assert.equal(records.length, 1);
  assert.equal(records[0].urls[0], "https://www.instagram.com/p/ABC123");
  assert.equal(records[0].timestamp, new Date(123000).toISOString());
  assert.equal(records[0].hasReactionData, true);
  assert.equal(records[0].text, "texto privado que não deve ser salvo");
  assert.equal(JSON.stringify(summary).includes("texto privado"), false);
});

test("ignores unrelated endpoints", async () => {
  const page = new EventEmitter();
  const capture = createInstagramNetworkCapture(page);
  page.emit("response", {
    url: () => "https://www.instagram.com/api/v1/feed/",
    status: () => 200,
    headers: () => ({}),
    request: () => ({ postDataJSON: () => ({}), url: () => "https://www.instagram.com/api/v1/feed/" }),
    json: async () => ({ data: { items: [] } })
  });
  await capture.stop();
  assert.equal(capture.summary().capturedResponses, 0);
});


test("extracts nested shared-media shortcodes and relative permalinks", async () => {
  const page = new EventEmitter();
  const capture = createInstagramNetworkCapture(page);
  page.emit("response", {
    url: () => "https://www.instagram.com/api/graphql",
    status: () => 200,
    headers: () => ({ "content-type": "application/json" }),
    request: () => ({
      postDataJSON: () => ({ variables: { thread_id: "1783131735658148" } }),
      url: () => "https://www.instagram.com/api/graphql"
    }),
    json: async () => ({
      data: { thread: { items: [{
        mid: "message-2",
        timestamp_ms: 1795021200000,
        sender: { username: "member" },
        content: { share: { media: { code: "SHORTCODE9", media_type: 2, product_type: "clips" } } },
        permalink: "/p/RELATIVE9/"
      }] } }
    })
  });
  await capture.stop();
  const [record] = capture.records();
  assert.equal(record.threadId, "1783131735658148");
  assert.deepEqual(record.urls.sort(), [
    "https://www.instagram.com/p/RELATIVE9",
    "https://www.instagram.com/reel/SHORTCODE9"
  ]);
});
