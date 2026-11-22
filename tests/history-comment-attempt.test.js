import test from "node:test";
import assert from "node:assert/strict";
import { appendHistory, getTaskState } from "../src/history.js";

test("an unconfirmed comment attempt is persisted and prevents automatic retry after reload", () => {
  const url = "https://www.instagram.com/p/COMMENTATTEMPTREGRESSION";
  const groupThreadId = "1783000000000001";
  const messageId = "comment-attempt-regression-1";
  appendHistory({
    url, groupThreadId, messageId,
    comment: "Comentário de teste 🌷",
    commentAttempted: true,
    likeAttempted: true,
    saveAttempted: true,
    reactionAttempted: true,
    commented: false,
    status: "tentativa de comentário iniciada — aguardando confirmação"
  });
  const state = getTaskState(url, groupThreadId, messageId, "🌷");
  assert.equal(state.commentAttempted, true);
  assert.equal(state.commented, false);
  assert.equal(state.likeAttempted, true);
  assert.equal(state.saveAttempted, true);
  assert.equal(state.reactionAttempted, true);
});
