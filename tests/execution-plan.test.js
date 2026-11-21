import test from "node:test";
import assert from "node:assert/strict";
import { buildExecutionPlan, interpretGroupInstructions, summarizeExecutionPlan } from "../src/execution-plan.js";

test("like and collection are mandatory; optional comment is still prepared and posted", () => {
  const plan = buildExecutionPlan({ mode: "test", collectionName: "Curtido", comment: "Comentário bem estruturado aqui 🌸" });
  assert.match(plan[0].status, /^simulada/);
  assert.match(plan[1].status, /^simulada/);
  assert.match(plan[2].status, /^simulada/);
  assert.match(plan[3].status, /^opcional/);
});

test("explicit no-comment instruction always suppresses commenting", () => {
  const instructions = interpretGroupInstructions("Curtir e salvar. NÃO COMENTAR.");
  assert.equal(instructions.comment, "forbidden");
  const plan = buildExecutionPlan({ mode: "test", collectionName: "Curtido", comment: "Comentário válido 🌸", instructions });
  assert.match(plan[2].status, /^dispensada/);
});

test("requested comment and group send are included", () => {
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
  const plan = buildExecutionPlan({ mode: "test", collectionName: "Curtido", taskState: { liked: true, saved: true, savedFolderVerified: true, commented: true, groupCheck: true } });
  assert.equal(plan[0].status, "já concluída — não repetir");
  assert.equal(plan[1].status, "já concluída — não repetir");
  assert.equal(plan[2].status, "já concluída — não repetir");
  assert.equal(plan[4].status, "já concluída — não repetir");
});

test("completion flower waits for all mandatory and requested actions", () => {
  const plan = buildExecutionPlan({
    mode: "test",
    collectionName: "Curtido",
    taskState: { liked: true, saved: true, savedFolderVerified: true, commented: true },
    instructions: { comment: "required", shareToGroup: "optional" }
  });
  assert.match(plan[4].status, /^simulada/);
  assert.equal(summarizeExecutionPlan(plan).optional, 1);
});

test("missing destination collection blocks mandatory save and completion reaction", () => {
  const plan = buildExecutionPlan({ mode: "test", comment: "Comentário válido 🌸" });
  assert.equal(plan[1].status, "bloqueada");
  assert.match(plan[4].status, /^aguardando/);
});

test("comment generation must have two words and an emoji", () => {
  const invalid = buildExecutionPlan({ mode: "test", collectionName: "Curtido", comment: "Legal" });
  assert.equal(invalid[2].status, "bloqueada");
  const valid = buildExecutionPlan({ mode: "test", collectionName: "Curtido", comment: "Conteúdo muito interessante 🌸" });
  assert.match(valid[2].status, /^simulada/);
});
