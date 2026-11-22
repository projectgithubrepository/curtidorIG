import test from "node:test";
import assert from "node:assert/strict";
import { mergeTaskState, taskStateLabel, parseAdministrativeMilestone, administrativeTargetsForRange, hasGroupCheck } from "../src/group-state.js";

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

test("unconfirmed comment attempt is preserved and explicitly marked for manual verification", () => {
  const state = mergeTaskState({}, { commentAttempted: true });
  assert.equal(state.commentAttempted, true);
  assert.equal(state.commented, false);
  assert.match(taskStateLabel(state), /verificar comentário tentado/);
});

test("message text containing the completion emoji is not evidence of an applied reaction", () => {
  assert.equal(hasGroupCheck("Pedido original com emoji 🌷 no texto"), false);
});

test("uncertain toggle attempts remain pending for manual verification", () => {
  const state = mergeTaskState({}, { likeAttempted:true, saveAttempted:true, reactionAttempted:true });
  assert.equal(state.likeAttempted, true);
  assert.equal(state.saveAttempted, true);
  assert.equal(state.reactionAttempted, true);
  const label = taskStateLabel(state);
  assert.match(label, /tentativa de curtida/);
  assert.match(label, /tentativa de salvamento/);
  assert.match(label, /tentativa de reação/);
});


test("resolves an invalid 00/00 administrative date from the timestamp of a HOJE message", () => {
  const message = "✨ Aviso: HOJE no grupo tivemos esse total de pedidos: Data: 00/00 • 37 FEED • 13 STORIES. Lembre-se da conferência e pasta de salvos.";
  const milestone = parseAdministrativeMilestone(message);
  assert.equal(milestone.date, "");
  assert.equal(milestone.todayReference, true);
  const target = administrativeTargetsForRange([
    { ...milestone, sharedAt: "2026-11-21T19:02:41.022Z" }
  ], "2026-11-21", "2026-11-21");
  assert.deepEqual({ date: target.date, feedCount: target.feedCount, storiesCount: target.storiesCount },
    { date: "2026-11-21", feedCount: 37, storiesCount: 13 });
});

test("does not apply a HOJE administrative marker outside the timestamp date", () => {
  const milestone = parseAdministrativeMilestone("Aviso HOJE: 37 FEED • 13 STORIES. Conferência da pasta de salvos.");
  assert.equal(administrativeTargetsForRange([{ ...milestone, sharedAt: "2026-11-21T19:02:41.022Z" }], "2026-11-22", "2026-11-22"), null);
});

test("a valid explicit administrative date takes precedence over HOJE timestamp", () => {
  const milestone = parseAdministrativeMilestone("Aviso HOJE: Data 20/11 • 37 FEED • 13 STORIES. Conferência da pasta de salvos.");
  const target = administrativeTargetsForRange([{ ...milestone, sharedAt: "2026-11-21T19:02:41.022Z" }], "2026-11-20", "2026-11-20");
  assert.equal(target.date, "11-20");
});


test("rejects impossible calendar dates even when no year is supplied", () => {
  const marker = parseAdministrativeMilestone("Aviso: Data 31/02 • 37 FEED • 13 STORIES. Conferência da pasta de salvos.");
  assert.equal(marker.date, "");
  assert.equal(marker.todayReference, false);
  assert.equal(administrativeTargetsForRange([marker], "2026-02-01", "2026-02-28"), null);
});
