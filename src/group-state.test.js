import test from "node:test";
import assert from "node:assert/strict";
import { isAdministrativeMessage, parseAdministrativeMilestone, mergeTaskState, taskStateLabel, hasGroupCheck } from "./group-state.js";

const notice = "Aviso, hoje no grupo tiveram esse total de pedidos. Data 18 do 11, 66 feed, nosso recorde 34 stories, nosso recorde. Lembre-se que na quinta-feira teremos conferência do grupo, é muito importante que sua pasta de salvos esteja completa. Sempre que atualizar, deixe um check nas publicações aqui no grupo.";

test("recognizes administrative group notices and extracts date and counts", () => {
  assert.equal(isAdministrativeMessage(notice), true);
  assert.deepEqual(
    (({ date, feedCount, storiesCount }) => ({ date, feedCount, storiesCount }))(parseAdministrativeMilestone(notice)),
    { date: "11-18", feedCount: 66, storiesCount: 34 }
  );
});

test("completion state is monotonic and never clears a completed action", () => {
  const previous = { saved: true, savedFolderVerified: true, liked: true, commented: false, sharedToGroup: true, groupCheck: true };
  const next = mergeTaskState(previous, { commented: true, liked: false });
  assert.deepEqual(next, { saved: true, savedFolderVerified: true, liked: true, commented: true, sharedToGroup: true, commentForbidden: false, groupCheck: true, complete: true });
  assert.match(taskStateLabel(next), /fluxo completo/);
});

test("ordinary shared-post text is not treated as an administrative notice", () => {
  assert.equal(isAdministrativeMessage("Olha essa publicação nova, gostei muito!"), false);
});


test("emoji in message text never counts as a reaction on the exact group message", () => {
  assert.equal(hasGroupCheck("Publicação concluída ✅"), false);
  assert.equal(hasGroupCheck({ reactions: [{ emoji: "✅" }] }), false);
});
