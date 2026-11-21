import test from "node:test";
import assert from "node:assert/strict";
import { isCommentStateVerified, getGroupShareState } from "../src/instagram.js";

test("an existing comment is enough to classify the comment action as completed", () => {
  assert.equal(isCommentStateVerified({ usernameKnown:true, alreadyCommented:true, commentListComplete:false }), true);
});

test("absence of a comment is trusted only after the full comment list is confirmed", () => {
  assert.equal(isCommentStateVerified({ usernameKnown:true, alreadyCommented:false, commentListComplete:false }), false);
  assert.equal(isCommentStateVerified({ usernameKnown:true, alreadyCommented:false, commentListComplete:true }), true);
  assert.equal(isCommentStateVerified({ usernameKnown:false, alreadyCommented:false, commentListComplete:true }), false);
});

test("an existing group share is detected by canonical URL, ignoring a trailing slash", () => {
  const inventory={inventoryComplete:true,sharedUrls:["https://www.instagram.com/reel/ABC123/"]};
  assert.equal(getGroupShareState("https://www.instagram.com/reel/ABC123",inventory),"already-shared");
});

test("absence from an incomplete destination history remains unknown and blocks sending", () => {
  assert.equal(getGroupShareState("https://www.instagram.com/p/ABC123",{inventoryComplete:false,sharedUrls:[]}),"unknown");
  assert.equal(getGroupShareState("https://www.instagram.com/p/ABC123",{inventoryComplete:false,sharedUrls:["https://www.instagram.com/p/ABC123/"]}),"already-shared");
  assert.equal(getGroupShareState("https://www.instagram.com/p/ABC123",{inventoryComplete:true,sharedUrls:[]}),"not-shared");
});
