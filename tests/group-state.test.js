import test from "node:test";
import assert from "node:assert/strict";
import { mergeTaskState, taskStateLabel, parseAdministrativeMilestone, administrativeTargetsForRange } from "../src/group-state.js";

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


test("reads administrative daily targets for Feed and Stories", () => {
  const message = "✨𝘼𝙫𝙞𝙨𝙤: 𝙃𝙊𝙅𝙀 𝙉𝙊 𝙂𝙍𝙐𝙋𝙊 𝙏𝙄𝙑𝙀𝙍𝘼𝙈 𝙀𝙎𝙎𝙀 𝙏𝙊𝙏𝘼𝙇 𝘿𝙀 𝙋𝙀𝘿𝙄𝘿𝙊𝙎: 𝘿𝙖𝙩𝙖: 18/11 • 66 𝙁𝙀𝙀𝘿 • 34 𝙎𝙏𝙊𝙍𝙄𝙀𝙎 (𝙉𝙊𝙎𝙎𝙊 𝙍𝙀𝘾𝙊𝙍𝘿). 𝙇𝙚𝙢𝙗𝙧𝙚-𝙨𝙚, 𝙦𝙪𝙚 𝙣𝙖 𝙌𝙐𝙄𝙉𝙏𝘼 𝙁𝙀𝙄𝙍𝘼 𝙩𝙚𝙧𝙚𝙢𝙤𝙨 𝙖 𝙘𝙤𝙣𝙛𝙚𝙧𝙚̂𝙣𝙘𝙞𝙖 𝙙𝙤 𝙜𝙧𝙪𝙥𝙤. 𝙀́ 𝙢𝙪𝙞𝙩𝙤 𝙞𝙢𝙥𝙤𝙧𝙩𝙖𝙣𝙩𝙚 𝙦𝙪𝙚 𝙨𝙪𝙖 𝙥𝙖𝙨𝙩𝙖 𝙙𝙚 𝙨𝙖𝙡𝙫𝙤𝙨 𝙚𝙨𝙩𝙚𝙟𝙖 𝙘𝙤𝙢𝙥𝙡𝙚𝙩𝙖!";
  const milestone = parseAdministrativeMilestone(message);
  assert.equal(milestone.date, "11-18");
  assert.equal(milestone.feedCount, 66);
  assert.equal(milestone.storiesCount, 34);
  const target = administrativeTargetsForRange([milestone], "2026-11-18", "2026-11-18");
  assert.deepEqual(
    { feedCount: target.feedCount, storiesCount: target.storiesCount, totalCount: target.totalCount },
    { feedCount: 66, storiesCount: 34, totalCount: 100 }
  );
  assert.equal(administrativeTargetsForRange([milestone], "2026-11-19", "2026-11-19"), null);
});
