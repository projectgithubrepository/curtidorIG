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
      messageIdentityVerified: true,
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
      messageIdentityVerified: true,
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
  assert.match(save.reason, /presença na coleção escolhida não foi comprovada/i);
});


test("completion reaction is not apt without the original group message identity", () => {
  const plan = buildExecutionPlan({
    ...base,
    taskState: {
      liked:true, saved:true, savedFolderVerified:true,
      commented:true, sharedToGroup:true, groupCheck:false
    },
    stateKnown: {
      liked:true, savedStateKnown:true, saved:true,
      collectionInventoryAvailable:true, collectionMembership:true,
      commented:true, destinationGroupVerified:true,
      messageIdentityVerified:false,
      reasons:{ messageIdentityVerified:"ID da mensagem original não foi capturado." }
    }
  });
  const reaction = plan.find(entry => entry.action === "completionReaction");
  assert.match(reaction.status, /^não verificada/);
  assert.match(reaction.reason, /ID da mensagem original não foi capturado/);
});

test("completion reaction is not marked apt in TESTE when its state is unknown", () => {
  const plan=buildExecutionPlan({
    ...base,
    taskState:{liked:true,saved:true,savedFolderVerified:true,commented:true,sharedToGroup:true},
    stateKnown:{liked:true,savedStateKnown:true,saved:true,collectionInventoryAvailable:true,collectionMembership:true,commented:true,destinationGroupVerified:true,messageIdentityVerified:true,groupCheckKnown:false}
  });
  assert.match(plan.find(item=>item.action==="completionReaction").status,/^não verificada/);
});
