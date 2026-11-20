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
  assert.equal(summary.capturedResponses, 1);
  assert.deepEqual(summary.operations, ["IGDThreadDetailQuery"]);
  assert.equal(summary.messageLikeObjects, 1);
  assert.equal(summary.hasReactionFields, true);
  assert.equal(summary.hasShareFields, true);
  assert.equal(summary.hasMessageId, true);
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
