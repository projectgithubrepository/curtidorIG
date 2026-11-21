import test from "node:test";
import assert from "node:assert/strict";
import { mergeTaskState, taskStateLabel } from "../src/group-state.js";

test("a publication is complete only after all five states are confirmed", () => {
  let state = mergeTaskState({}, {});
  assert.equal(state.complete, false);
  for (const key of ["saved", "savedFolderVerified", "liked", "commented", "sharedToGroup"]) {
    state = mergeTaskState(state, { [key]: true });
    assert.equal(state.complete, false);
  }
  state = mergeTaskState(state, { groupCheck: true });
  assert.equal(state.complete, true);
  assert.equal(taskStateLabel(state), "fluxo completo — ignorar");
});

test("folder confirmation cannot substitute for saving", () => {
  const state = mergeTaskState({}, { savedFolderVerified: true });
  assert.equal(state.saved, false);
  assert.equal(state.savedFolderVerified, false);
  assert.equal(state.complete, false);
});

test("an unknown or unconfirmed state remains pending", () => {
  const state = mergeTaskState({}, { liked: true });
  assert.equal(state.liked, true);
  assert.equal(state.saved, false);
  assert.equal(state.commented, false);
  assert.match(taskStateLabel(state), /salvar/);
  assert.match(taskStateLabel(state), /enviar ao grupo coletivo/);
  assert.match(taskStateLabel(state), /reagir à mensagem original/);
});

test("explicitly forbidden comment does not block completion, but group send remains mandatory", () => {
  let state = mergeTaskState({}, { saved:true, savedFolderVerified:true, liked:true, commentForbidden:true, groupCheck:true });
  assert.equal(state.complete, false);
  state = mergeTaskState(state, { sharedToGroup:true });
  assert.equal(state.complete, true);
});
