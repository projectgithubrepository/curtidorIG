import test from "node:test";
import assert from "node:assert/strict";
import { buildExecutionPlan, summarizeExecutionPlan } from "../src/execution-plan.js";

test("dry run simulates only pending actions and never repeats completed ones", () => {
  const plan = buildExecutionPlan({
    mode: "test",
    collectionName: "Semana 47",
    comment: "Comentário contextual 🌸",
    taskState: { liked: true, sharedToGroup: true }
  });
  assert.equal(plan[0].status, "já concluída — não repetir");
  assert.equal(plan[2].status, "já concluída — não repetir");
  assert.match(plan[1].status, /^simulada/);
  assert.match(plan[3].status, /^simulada/);
  assert.equal(plan[4].status, "aguardando etapas anteriores");
  assert.equal(summarizeExecutionPlan(plan).simulated, 2);
});

test("completion flower is held until all preceding tasks are done", () => {
  const plan = buildExecutionPlan({
    mode: "test",
    collectionName: "Semana 47",
    comment: "Comentário 🌸",
    taskState: { liked: true, commented: true, sharedToGroup: true, saved: true, savedFolderVerified: true }
  });
  assert.match(plan[4].status, /^simulada/);
  assert.equal(plan[4].label, "Marcar mensagem com 🌸");
});

test("missing collection blocks saving and therefore the completion marker", () => {
  const plan = buildExecutionPlan({ mode: "test", comment: "Oi 🌸" });
  assert.equal(plan[3].status, "bloqueada");
  assert.equal(plan[4].status, "aguardando etapas anteriores");
});
