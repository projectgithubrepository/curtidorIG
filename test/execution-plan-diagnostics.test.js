import test from "node:test";
import assert from "node:assert/strict";
import { buildExecutionPlan } from "../src/execution-plan.js";

const base = {
  mode: "test",
  collectionName: "Laranja antigo",
  destinationGroupName: "TESTEHOJE",
  comment: "Conteúdo muito interessante 😊",
  instructions: { comment: "required", shareToGroup: "required" }
};

test("TESTE explica cada estado desconhecido e não chama ação de apta", () => {
  const plan = buildExecutionPlan({
    ...base,
    stateKnown: {
      liked: false,
      savedStateKnown: false,
      saved: false,
      collectionInventoryAvailable: false,
      collectionMembership: false,
      commented: false,
      destinationGroupVerified: false,
      reasons: {
        liked: "Botão Curtir não localizado.",
        saveToCollection: "Inventário da coleção não carregou.",
        commented: "Perfil do usuário não identificado.",
        shareToGroup: "Grupo coletivo não foi localizado."
      }
    }
  });
  for (const action of ["like", "saveToCollection", "comment", "shareToGroup"]) {
    const item = plan.find(entry => entry.action === action);
    assert.match(item.status, /^não verificada/);
    assert.ok(item.reason.length > 10);
    assert.equal(item.testMode.mapped, false);
  }
  assert.match(plan.find(entry => entry.action === "completionReaction").status, /^aguardando/);
});

test("TESTE só considera aptos os estados conhecidos e a coleção validada", () => {
  const plan = buildExecutionPlan({
    ...base,
    stateKnown: {
      liked: true,
      savedStateKnown: true,
      saved: false,
      collectionInventoryAvailable: true,
      collectionMembership: false,
      commented: true,
      destinationGroupVerified: false,
      reasons: { shareToGroup: "Destino não validado." }
    }
  });
  assert.match(plan.find(entry => entry.action === "like").status, /^simulada/);
  assert.match(plan.find(entry => entry.action === "saveToCollection").status, /^simulada/);
  assert.match(plan.find(entry => entry.action === "comment").status, /^simulada/);
  assert.match(plan.find(entry => entry.action === "shareToGroup").status, /^não verificada/);
  assert.match(plan.find(entry => entry.action === "completionReaction").status, /^aguardando/);
});

test("salvamento já existente exige confirmação da coleção exata", () => {
  const plan = buildExecutionPlan({
    ...base,
    stateKnown: {
      liked: true,
      savedStateKnown: true,
      saved: true,
      collectionInventoryAvailable: true,
      collectionMembership: false,
      commented: true,
      destinationGroupVerified: true
    },
    taskState: { saved: true }
  });
  const save = plan.find(entry => entry.action === "saveToCollection");
  assert.match(save.status, /^bloqueada/);
  assert.match(save.reason, /coleção confirmada|inclusão não foi comprovada/i);
});
