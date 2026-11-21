import test from "node:test";
import assert from "node:assert/strict";
import { buildExecutionPlan, interpretGroupInstructions, summarizeExecutionPlan } from "../src/execution-plan.js";

test("like and destination collection are mandatory; comment and group send are optional by default", () => {
  const plan = buildExecutionPlan({ mode: "test", collectionName: "Curtido" });
  assert.match(plan[0].status, /^simulada/);
  assert.match(plan[1].status, /^simulada/);
  assert.match(plan[2].status, /^opcional/);
  assert.match(plan[3].status, /^opcional/);
  assert.match(plan[4].status, /^aguardando/);
});

test("explicit no-comment instruction always suppresses commenting", () => {
  const instructions = interpretGroupInstructions("Curtir e salvar. NÃO COMENTAR.");
  assert.equal(instructions.comment, "forbidden");
  const plan = buildExecutionPlan({ mode: "test", collectionName: "Curtido", comment: "Texto pronto", instructions });
  assert.match(plan[2].status, /^dispensada/);
});

test("requested comment and group share are included", () => {
  const instructions = interpretGroupInstructions("Comentar e enviar para o grupo de destino.");
  assert.equal(instructions.comment, "required");
  assert.equal(instructions.shareToGroup, "required");
  const plan = buildExecutionPlan({ mode: "test", collectionName: "Curtido", comment: "Comentário contextual 🌸", instructions });
  assert.match(plan[2].status, /^simulada/);
  assert.match(plan[3].status, /^simulada/);
});

test("explicit no-send instruction suppresses group sharing", () => {
  const instructions = interpretGroupInstructions("Curtir, salvar, comentar e NÃO ENVIAR.");
  assert.equal(instructions.shareToGroup, "forbidden");
});

test("completed actions are never repeated", () => {
  const plan = buildExecutionPlan({
    mode: "test",
    collectionName: "Curtido",
    taskState: { liked: true, saved: true, savedFolderVerified: true, groupCheck: true }
  });
  assert.equal(plan[0].status, "já concluída — não repetir");
  assert.equal(plan[1].status, "já concluída — não repetir");
  assert.equal(plan[4].status, "já concluída — não repetir");
});

test("completion flower waits for all required actions, not optional ones", () => {
  const plan = buildExecutionPlan({
    mode: "test",
    collectionName: "Curtido",
    taskState: { liked: true, saved: true, savedFolderVerified: true },
    instructions: { comment: "optional", shareToGroup: "optional" }
  });
  assert.match(plan[4].status, /^simulada/);
  assert.equal(summarizeExecutionPlan(plan).optional, 2);
});

test("missing destination collection blocks mandatory save and completion reaction", () => {
  const plan = buildExecutionPlan({ mode: "test" });
  assert.equal(plan[1].status, "bloqueada");
  assert.match(plan[4].status, /^aguardando/);
});

test("manual mode never executes actions", () => {
  const plan = buildExecutionPlan({ mode: "manual", collectionName: "Curtido" });
  assert.match(plan[0].status, /^aguardando ação manual/);
});
