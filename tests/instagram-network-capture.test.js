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


test("captures JSON WebSocket frames and inherits the enclosing thread id", async () => {
  const page = new EventEmitter();
  const socket = new EventEmitter();
  socket.url = () => "wss://www.instagram.com/ws";
  const capture = createInstagramNetworkCapture(page);
  page.emit("websocket", socket);
  socket.emit("framereceived", JSON.stringify({
    data: {
      thread: {
        thread_id: "1783131735658148",
        items: [{
          message_id: "ws-message-1",
          timestamp_ms: 1795021200000,
          sender: { username: "member" },
          share: { url: "https://www.instagram.com/p/WSPOST123/" }
        }]
      }
    }
  }));
  await capture.stop();
  const [record] = capture.records();
  assert.equal(record.messageId, "ws-message-1");
  assert.equal(record.threadId, "1783131735658148");
  assert.deepEqual(record.urls, ["https://www.instagram.com/p/WSPOST123"]);
  assert.equal(capture.summary().websocketFrames, 1);
  assert.equal(capture.summary().parsedWebSocketFrames, 1);
  assert.equal(capture.summary().webSocketMessageLikeObjects, 1);
  assert.equal(capture.summary().messageLikeObjects, 1);
  assert.equal(capture.summary().sharedMediaObjects, 1);
  assert.equal(capture.summary().hasMessageId, true);
  assert.equal(capture.summary().hasShareFields, true);
  assert.equal(capture.summary().hasPermalinkOrUrl, true);
});


test("associates unscoped WebSocket frames with the active Direct thread", async () => {
  const page = new EventEmitter();
  page.url = () => "https://www.instagram.com/direct/t/1783131735658148";
  const socket = new EventEmitter();
  socket.url = () => "wss://www.instagram.com/ws";
  const capture = createInstagramNetworkCapture(page);
  page.emit("websocket", socket);
  socket.emit("framereceived", JSON.stringify({
    data: { items: [{
      message_id: "ws-unscoped-1",
      timestamp_ms: 1795021200000,
      sender: { username: "member" },
      share: { url: "https://www.instagram.com/p/WSUNSCOPED1/" }
    }] }
  }));
  await capture.stop();
  const [record] = capture.records();
  assert.equal(record.threadId, "1783131735658148");
  assert.deepEqual(record.urls, ["https://www.instagram.com/p/WSUNSCOPED1"]);
});

test("associates message-list response with the active Direct thread when request omits thread id", async () => {
  const page = new EventEmitter();
  page.url = () => "https://www.instagram.com/direct/t/1783131735658148";
  const capture = createInstagramNetworkCapture(page);
  page.emit("response", {
    url: () => "https://www.instagram.com/api/graphql",
    status: () => 200,
    headers: () => ({ "content-type": "application/json" }),
    request: () => ({
      postDataJSON: () => ({ operationName: "IGDMessageListOffMsysQuery", variables: {} }),
      url: () => "https://www.instagram.com/api/graphql"
    }),
    json: async () => ({
      data: { thread: { items: [{
        message_id: "mid.active-thread",
        timestamp_ms: 1795021200000,
        sender: { username: "member" },
        share: { url: "https://www.instagram.com/p/ACTIVEPOST/" }
      }] } }
    })
  });
  await capture.stop();
  const [record] = capture.records();
  assert.equal(record.threadId, "1783131735658148");
  assert.deepEqual(record.urls, ["https://www.instagram.com/p/ACTIVEPOST"]);
});

test("extracts shortcodes nested in media-share payloads without explicit media_type", async () => {
  const page = new EventEmitter();
  const capture = createInstagramNetworkCapture(page);
  page.emit("response", {
    url: () => "https://www.instagram.com/api/graphql",
    status: () => 200,
    headers: () => ({ "content-type": "application/json" }),
    request: () => ({
      postDataJSON: () => ({ operationName: "IGDMessageListOffMsysQuery", variables: { thread_id: "1783131735658148" } }),
      url: () => "https://www.instagram.com/api/graphql"
    }),
    json: async () => ({
      data: { thread: { items: [{
        message_id: "mid.nested-share",
        timestamp_ms: 1795021200000,
        sender: { username: "member" },
        content: { media_share: { media: { code: "NESTEDCODE123" } } }
      }] } }
    })
  });
  await capture.stop();
  const [record] = capture.records();
  assert.deepEqual(record.urls, ["https://www.instagram.com/p/NESTEDCODE123"]);
});


test("extracts canonical Story permalink from explicit story_share payload", async () => {
  const page = new EventEmitter();
  page.url = () => "https://www.instagram.com/direct/t/1783131735658148";
  const capture = createInstagramNetworkCapture(page);
  page.emit("response", {
    url: () => "https://www.instagram.com/api/graphql",
    status: () => 200,
    headers: () => ({ "content-type": "application/json" }),
    request: () => ({
      postDataJSON: () => ({ operationName: "IGDMessageListOffMsysQuery", variables: {} }),
      url: () => "https://www.instagram.com/api/graphql"
    }),
    json: async () => ({
      data: { thread: { items: [{
        message_id: "story-share-3",
        timestamp_ms: 1795021200000,
        sender: { username: "member" },
        content: { story_share: { media: {
          pk: "390000000000000003",
          user: { username: "story.owner" },
          product_type: "story"
        } } }
      }] } }
    })
  });
  await capture.stop();
  const [record] = capture.records();
  assert.deepEqual(record.urls, ["https://www.instagram.com/stories/story.owner/390000000000000003"]);
});

test("keeps distinct Story IDs from the same Instagram profile", async () => {
  const page = new EventEmitter();
  const capture = createInstagramNetworkCapture(page);
  page.emit("response", {
    url: () => "https://www.instagram.com/api/graphql",
    status: () => 200,
    headers: () => ({ "content-type": "application/json" }),
    request: () => ({
      postDataJSON: () => ({ operationName: "IGDMessageListOffMsysQuery", variables: { thread_id: "1783131735658148" } }),
      url: () => "https://www.instagram.com/api/graphql"
    }),
    json: async () => ({
      data: { thread: { items: [
        { message_id: "story-message-1", timestamp_ms: 1794960000000, sender: { username: "member" }, share: { url: "https://www.instagram.com/stories/member.name/390000000000000001/" } },
        { message_id: "story-message-2", timestamp_ms: 1794960100000, sender: { username: "member" }, share: { url: "https://www.instagram.com/stories/member.name/390000000000000002/" } }
      ] } }
    })
  });
  await capture.stop();
  const records = capture.records();
  assert.equal(records.length, 2);
  assert.deepEqual(records.map(item => item.urls[0]).sort(), [
    "https://www.instagram.com/stories/member.name/390000000000000001",
    "https://www.instagram.com/stories/member.name/390000000000000002"
  ]);
});


test("continues parsing network responses beyond the former 500-response ceiling", async () => {
  const page = new EventEmitter();
  const capture = createInstagramNetworkCapture(page);
  for (let index = 0; index < 520; index++) {
    page.emit("response", {
      url: () => "https://www.instagram.com/api/graphql",
      status: () => 200,
      headers: () => ({ "content-type": "application/json" }),
      request: () => ({
        postDataJSON: () => ({ operationName: "IGDMessageListOffMsysQuery", variables: { thread_id: "1783131735658148" } }),
        url: () => "https://www.instagram.com/api/graphql"
      }),
      json: async () => ({ data: { thread: { items: [] } } })
    });
  }
  await capture.stop();
  const summary = capture.summary();
  assert.equal(summary.capturedResponses, 520);
  assert.equal(summary.parsedResponses, 520);
  assert.equal(summary.responseDetails.length, 500);
  assert.equal(summary.responseDetailsTruncated, 20);
});

test("extracts Stories from nested XMA story media structures", async () => {
  const page = new EventEmitter();
  const capture = createInstagramNetworkCapture(page);
  page.emit("response", {
    url: () => "https://www.instagram.com/api/graphql",
    status: () => 200,
    headers: () => ({ "content-type": "application/json" }),
    request: () => ({
      postDataJSON: () => ({ operationName: "IGDMessageListOffMsysQuery", variables: { thread_id: "1783131735658148" } }),
      url: () => "https://www.instagram.com/api/graphql"
    }),
    json: async () => ({ data: { thread: { items: [{
      message_id: "story-xma-1",
      timestamp_ms: 1795021200000,
      sender: { username: "member" },
      content: { xma: { layout: { story: { media: {
        pk: "390000000000000034",
        user: { username: "story.creator" },
        product_type: "story"
      } } } } }
    }] } } })
  });
  await capture.stop();
  const [record] = capture.records();
  assert.deepEqual(record.urls, ["https://www.instagram.com/stories/story.creator/390000000000000034"]);
});

test("does not truncate more than twelve Story links in a single message", async () => {
  const page = new EventEmitter();
  const capture = createInstagramNetworkCapture(page);
  const stories = Array.from({ length: 20 }, (_, index) => ({
    story_id: String(390000000000000100n + BigInt(index)),
    user: { username: "story.creator" },
    product_type: "story"
  }));
  page.emit("response", {
    url: () => "https://www.instagram.com/api/graphql",
    status: () => 200,
    headers: () => ({ "content-type": "application/json" }),
    request: () => ({
      postDataJSON: () => ({ operationName: "IGDMessageListOffMsysQuery", variables: { thread_id: "1783131735658148" } }),
      url: () => "https://www.instagram.com/api/graphql"
    }),
    json: async () => ({ data: { thread: { items: [{
      message_id: "story-batch-20",
      timestamp_ms: 1795021200000,
      sender: { username: "member" },
      content: { story_items: stories }
    }] } } })
  });
  await capture.stop();
  assert.equal(capture.records()[0].urls.length, 20);
});

test("extracts Story identity from story_pk and user_info variants", async () => {
  const page = new EventEmitter();
  const capture = createInstagramNetworkCapture(page);
  page.emit("response", {
    url: () => "https://www.instagram.com/api/graphql", status: () => 200,
    headers: () => ({ "content-type": "application/json" }),
    request: () => ({ postDataJSON: () => ({ operationName: "IGDMessageListOffMsysQuery", variables: { thread_id: "1783131735658148" } }), url: () => "https://www.instagram.com/api/graphql" }),
    json: async () => ({ data: { thread: { items: [{ message_id: "story-identity-variant", timestamp_ms: 1795021200000, sender: { username: "member" }, content: { story_share: { media: { story_pk: "390000000000000034", user_info: { username: "story.variant" } } } } }] } } })
  });
  await capture.stop();
  assert.deepEqual(capture.records()[0].urls, ["https://www.instagram.com/stories/story.variant/390000000000000034"]);
  assert.equal(capture.summary().storyUrlsExtracted, 1);
});

test("does not misclassify a Story shortcode as a Feed permalink", async () => {
  const page = new EventEmitter();
  const capture = createInstagramNetworkCapture(page);
  page.emit("response", {
    url: () => "https://www.instagram.com/api/graphql", status: () => 200,
    headers: () => ({ "content-type": "application/json" }),
    request: () => ({ postDataJSON: () => ({ operationName: "IGDMessageListOffMsysQuery", variables: { thread_id: "1783131735658148" } }), url: () => "https://www.instagram.com/api/graphql" }),
    json: async () => ({ data: { thread: { items: [{
      message_id: "story-no-feed-fallback",
      timestamp_ms: 1795021200000,
      sender: { username: "member" },
      content: { story_share: { media: { pk: "390000000000000034", code: "STORYCODE34", user: { username: "story.creator" } } } }
    }] } } })
  });
  await capture.stop();
  assert.deepEqual(capture.records()[0].urls, ["https://www.instagram.com/stories/story.creator/390000000000000034"]);
});

test("merges Story links across incremental responses for the same Direct message", async () => {
  const page = new EventEmitter();
  page.url = () => "https://www.instagram.com/direct/t/1783131735658148";
  const capture = createInstagramNetworkCapture(page);
  const emitStoryResponse = (storyId) => page.emit("response", {
    url: () => "https://www.instagram.com/api/graphql",
    status: () => 200,
    headers: () => ({ "content-type": "application/json" }),
    request: () => ({
      postDataJSON: () => ({ operationName: "IGDMessageListOffMsysQuery", variables: {} }),
      url: () => "https://www.instagram.com/api/graphql"
    }),
    json: async () => ({ data: { thread: { items: [{
      message_id: "incremental-story-message",
      timestamp_ms: 1795021200000,
      sender: { username: "member" },
      content: { story_share_v2: { media: {
        pk: storyId,
        user: { username: "story.creator" },
        product_type: "story"
      } } }
    }] } } })
  });
  emitStoryResponse("390000000000000041");
  emitStoryResponse("390000000000000042");
  await capture.stop();
  const records = capture.records();
  assert.equal(records.length, 1);
  assert.deepEqual(records[0].urls.sort(), [
    "https://www.instagram.com/stories/story.creator/390000000000000041",
    "https://www.instagram.com/stories/story.creator/390000000000000042"
  ]);
  assert.equal(capture.summary().uniqueStoryUrls, 2);
});

test("recognizes Story media markers nested under generic XMA and versioned share keys", async () => {
  const page = new EventEmitter();
  const capture = createInstagramNetworkCapture(page);
  page.emit("response", {
    url: () => "https://www.instagram.com/api/graphql",
    status: () => 200,
    headers: () => ({ "content-type": "application/json" }),
    request: () => ({
      postDataJSON: () => ({ operationName: "IGDMessageListOffMsysQuery", variables: { thread_id: "1783131735658148" } }),
      url: () => "https://www.instagram.com/api/graphql"
    }),
    json: async () => ({ data: { thread: { items: [{
      message_id: "story-xma-versioned",
      timestamp_ms: 1795021200000,
      sender: { username: "member" },
      content: { xma: { layout: { shared_story_attachment: { media: {
        media_id: "390000000000000043_17890000000000000",
        user_info: { username: "story.creator" },
        product_type: "story",
        code: "STORYSHORTCODE43"
      } } } } }
    }] } } })
  });
  await capture.stop();
  assert.deepEqual(capture.records()[0].urls, ["https://www.instagram.com/stories/story.creator/390000000000000043"]);
});

test("extracts deeply nested Story media using additional Instagram media type markers", async () => {
  const page = new EventEmitter();
  const capture = createInstagramNetworkCapture(page);
  let media = {
    media_id: "390000000000000044_17890000000000000",
    user_info: { username: "story.deep" },
    media_product_type: "story",
    code: "DEEPCODE44"
  };
  for (let index = 0; index < 12; index++) media = { payload_layer: media };
  page.emit("response", {
    url: () => "https://www.instagram.com/api/graphql",
    status: () => 200,
    headers: () => ({ "content-type": "application/json" }),
    request: () => ({
      postDataJSON: () => ({ operationName: "IGDMessageListOffMsysQuery", variables: { thread_id: "1783131735658148" } }),
      url: () => "https://www.instagram.com/api/graphql"
    }),
    json: async () => ({ data: { thread: { items: [{
      message_id: "story-deeply-nested",
      timestamp_ms: 1795021200000,
      sender: { username: "member" },
      content: { story_attachment_v2: media }
    }] } } })
  });
  await capture.stop();
  assert.deepEqual(capture.records()[0].urls, ["https://www.instagram.com/stories/story.deep/390000000000000044"]);
});

test("preserves distinct 64-bit numeric Story IDs from raw GraphQL JSON", async () => {
  const page = new EventEmitter();
  const capture = createInstagramNetworkCapture(page);
  const ids = Array.from({ length: 20 }, (_, index) => (390000000000000100n + BigInt(index)).toString());
  const items = ids.map(id => '{"story_id":' + id + ',"user":{"username":"story.numeric"},"product_type":"story"}').join(",");
  const raw = '{"data":{"thread":{"items":[{"message_id":"numeric-story-batch","timestamp_ms":1795021200000,"sender":{"username":"member"},"content":{"story_items":[' + items + ']}}]}}}';
  page.emit("response", {
    url: () => "https://www.instagram.com/api/graphql",
    status: () => 200,
    headers: () => ({ "content-type": "application/json" }),
    request: () => ({
      postDataJSON: () => ({ operationName: "IGDMessageListOffMsysQuery", variables: { thread_id: "1783131735658148" } }),
      url: () => "https://www.instagram.com/api/graphql"
    }),
    text: async () => raw
  });
  await capture.stop();
  const urls = capture.records()[0].urls;
  assert.equal(urls.length, 20);
  assert.equal(new Set(urls).size, 20);
  assert.equal(capture.summary().uniqueStoryUrls, 20);
});


test("does not confuse the Direct message id with the nested Story media id", async () => {
  const page = new EventEmitter();
  const capture = createInstagramNetworkCapture(page);
  page.emit("response", {
    url: () => "https://www.instagram.com/api/graphql",
    status: () => 200,
    headers: () => ({ "content-type": "application/json" }),
    request: () => ({
      postDataJSON: () => ({ operationName: "IGDMessageListOffMsysQuery", variables: { thread_id: "1783131735658148" } }),
      url: () => "https://www.instagram.com/api/graphql"
    }),
    text: async () => JSON.stringify({ data: { thread: { items: [{
      id: "178900000000000099",
      timestamp_ms: 1795021200000,
      sender: { username: "member" },
      content: { story_share: { media: {
        pk: "390000000000000099",
        user: { username: "story.owner" },
        product_type: "story"
      } } }
    }] } } })
  });
  await capture.stop();
  assert.deepEqual(capture.records()[0].urls, [
    "https://www.instagram.com/stories/story.owner/390000000000000099"
  ]);
});


test("extracts Story when owner and media identity are sibling objects", async () => {
  const page = new EventEmitter();
  const capture = createInstagramNetworkCapture(page);
  page.emit("response", {
    url: () => "https://www.instagram.com/api/graphql",
    status: () => 200,
    headers: () => ({ "content-type": "application/json" }),
    request: () => ({
      postDataJSON: () => ({ operationName: "IGDMessageListOffMsysQuery", variables: { thread_id: "1783131735658148" } }),
      url: () => "https://www.instagram.com/api/graphql"
    }),
    json: async () => ({ data: { thread: { items: [{
      message_id: "message-not-story-id",
      timestamp_ms: 1795021200000,
      sender: { username: "member" },
      content: { story_share: {
        user: { username: "story.owner" },
        media: { pk: "390000000000000099", product_type: "story" }
      } }
    }] } } })
  });
  await capture.stop();
  const [record] = capture.records();
  assert.deepEqual(record.urls, ["https://www.instagram.com/stories/story.owner/390000000000000099"]);
});

test("does not mistake generic message ID for a Story ID when media identity is absent", async () => {
  const page = new EventEmitter();
  const capture = createInstagramNetworkCapture(page);
  page.emit("response", {
    url: () => "https://www.instagram.com/api/graphql",
    status: () => 200,
    headers: () => ({ "content-type": "application/json" }),
    request: () => ({
      postDataJSON: () => ({ operationName: "IGDMessageListOffMsysQuery", variables: { thread_id: "1783131735658148" } }),
      url: () => "https://www.instagram.com/api/graphql"
    }),
    json: async () => ({ data: { thread: { items: [{
      message_id: "390000000000000100",
      timestamp_ms: 1795021200000,
      sender: { username: "member" },
      content: { story_share: { user: { username: "story.owner" }, media: { product_type: "story" } } }
    }] } } })
  });
  await capture.stop();
  const [record] = capture.records();
  assert.deepEqual(record.urls, []);
});
