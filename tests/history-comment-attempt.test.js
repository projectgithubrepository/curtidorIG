import test from "node:test";
import assert from "node:assert/strict";
import { appendHistory, getTaskState, getPendingUrlAttempts } from "../src/history.js";

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
  assert.equal(getPendingUrlAttempts(url).commentAttempted, true);
  assert.equal(getPendingUrlAttempts(url).likeAttempted, true);
  assert.equal(getPendingUrlAttempts(url).saveAttempted, true);
  assert.equal(getPendingUrlAttempts(url).shareAttempted, true);
});

test("a pending attempt on one source message protects the same URL in another message", () => {
  const url = "https://www.instagram.com/p/DUPLICATEURLATTEMPT";
  appendHistory({
    url, groupThreadId:"1783000000000002", messageId:"source-message-a",
    commentAttempted:true, likeAttempted:true, saveAttempted:true, shareAttempted:true,
    status:"tentativas iniciadas sem confirmação"
  });
  const pending=getPendingUrlAttempts(url);
  assert.deepEqual(pending,{likeAttempted:true,saveAttempted:true,commentAttempted:true,shareAttempted:true});
  appendHistory({
    url, groupThreadId:"1783000000000002", messageId:"source-message-b",
    liked:true, saved:true, savedFolderVerified:true, commented:true, sharedToGroup:true,
    status:"ações confirmadas em outra ocorrência"
  });
  assert.deepEqual(getPendingUrlAttempts(url),{likeAttempted:false,saveAttempted:false,commentAttempted:false,shareAttempted:false});
});
