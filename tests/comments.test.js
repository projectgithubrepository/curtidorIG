import test from "node:test";
import assert from "node:assert/strict";
import { analyzeCaption, createComment, getCommentLibraryStats } from "../src/comments.js";

test("identifica assunto, palavras-chave e intenção", () => {
  const result=analyzeCaption("Tutorial: veja o passo a passo desta receita de bolo.");
  assert.equal(result.topic,"gastronomia");
  assert.equal(result.intent,"tutorial");
  assert.ok(result.keywords.includes("receita"));
});

test("gera comentário contextual com pelo menos duas palavras e um emoji", () => {
  for (const caption of [
    "Hoje preparei uma receita de bolo de chocolate.",
    "Um fim de tarde nesta praia durante a viagem.",
    "Treino concluído, mais um dia de academia.",
    "Consegui minha formatura, uma grande conquista!"
  ]) {
    const result=createComment(caption);
    assert.equal(typeof result,"string");
    assert.ok(result.trim().split(/\s+/).length>=2);
    assert.match(result,/\p{Extended_Pictographic}/u);
  }
});

test("usa combinação genérica quando não reconhece o assunto", () => {
  const result=createComment("Um pensamento aleatório de hoje.");
  assert.equal(typeof result,"string");
  assert.match(result,/\p{Extended_Pictographic}/u);
});

test("varia comentário quando recebe histórico de comentários usados", () => {
  const caption="Receita de bolo caseiro";
  const first=createComment(caption);
  const second=createComment(caption,[first]);
  assert.notEqual(first,second);
});

test("biblioteca oferece grande espaço combinatório", () => {
  const stats=getCommentLibraryStats();
  assert.ok(stats.topics>=15);
  assert.ok(stats.keywords>=100);
  assert.ok(stats.combinations>=1000);
});
