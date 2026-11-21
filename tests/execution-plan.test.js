import test from "node:test";
import assert from "node:assert/strict";
import { buildExecutionPlan, interpretGroupInstructions, summarizeExecutionPlan } from "../src/execution-plan.js";

test("like and collection are mandatory; optional comment is still prepared and posted", () => {
  const plan = buildExecutionPlan({ mode: "test", collectionName: "Curtido", comment: "Comentário bem estruturado aqui 🌸" });
  assert.match(plan[0].status, /^simulada/);
  assert.match(plan[1].status, /^simulada/);
  assert.match(plan[2].status, /^simulada/);
  assert.match(plan[3].status, /^simulada/);
  assert.equal(plan[3].testMode.mapped, true);
  assert.equal(plan[3].testMode.executed, false);
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

test("sending to the collective destination group is always mandatory", () => {
  const instructions = interpretGroupInstructions("Curtir e salvar. NÃO ENVIAR.");
  assert.equal(instructions.shareToGroup, "required");
  const plan = buildExecutionPlan({ mode: "test", collectionName: "Curtido", comment: "Comentário válido 🌸", instructions });
  assert.match(plan[3].status, /^simulada/);
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
    instructions: { comment: "required", shareToGroup: "required" }
  });
  assert.match(plan[4].status, /^aguardando/);
  assert.equal(summarizeExecutionPlan(plan).optional, 0);
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

test("uncertain previous send is blocked to prevent duplicates", () => {
  const plan = buildExecutionPlan({ mode:"automatic", collectionName:"Curtido", comment:"Comentário válido 🌸", taskState:{ shareAttempted:true } });
  assert.equal(plan[3].status, "bloqueada");
  assert.match(plan[3].reason, /envio duplicado/);
  assert.match(plan[4].status, /^aguardando/);
});


test("test mode keeps unverifiable states out of executable candidates", () => {
  const plan = buildExecutionPlan({
    mode: "test",
    collectionName: "Laranja Girls",
    comment: "Comentário contextual 🌸",
    stateKnown: { liked: false, saveToCollection: false, commented: false }
  });
  assert.equal(plan[0].testMode.mapped, false);
  assert.equal(plan[0].testMode.candidate, false);
  assert.equal(plan[0].testMode.executed, false);
  assert.match(plan[0].status, /^não verificada/);
  assert.match(plan[1].status, /^não verificada/);
  assert.match(plan[2].status, /^não verificada/);
  assert.match(plan[3].status, /^simulada/);
});

test("already-saved post outside the selected collection is blocked", () => {
  const plan = buildExecutionPlan({
    mode: "test",
    collectionName: "Laranja Girls",
    taskState: { saved: true, savedFolderVerified: false },
    comment: "Comentário contextual 🌸"
  });
  assert.equal(plan[1].status, "bloqueada");
  assert.match(plan[1].reason, /fora da coleção/);
});


test("unverified actions are not candidates or mapped executable actions", () => {
  const plan = buildExecutionPlan({
    mode: "test",
    collectionName: "Curtido",
    comment: "Comentário contextual 🌸",
    stateKnown: { liked: false, saveToCollection: false, commented: false }
  });
  assert.equal(plan[0].testMode.mapped, false);
  assert.equal(plan[1].testMode.mapped, false);
  assert.equal(plan[2].testMode.mapped, false);
  assert.equal(plan[0].testMode.candidate, false);
  assert.equal(plan[3].testMode.mapped, true);
  assert.equal(plan[3].testMode.candidate, false);
});
