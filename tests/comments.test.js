import test from "node:test";
import assert from "node:assert/strict";
import { createComment, getCommentLibraryStats } from "../src/comments.js";

test("gera comentário contextual para temas conhecidos", () => {
  const food = createComment("Hoje preparei uma receita de bolo de chocolate com ingredientes simples.");
  assert.match(food, /receita|sabores|ingredientes|preparo|resultado/i);
  const travel = createComment("Um fim de tarde incrível nesta praia durante a viagem.");
  assert.match(travel, /lugar|paisagem|cenário|destino|registro/i);
});

test("usa frase genérica quando não reconhece o assunto", () => {
  const result = createComment("Um pensamento aleatório de hoje.");
  assert.equal(typeof result, "string");
  assert.ok(result.length > 10);
});

test("evita repetir frases já usadas quando há alternativas", () => {
  const caption = "Receita de bolo caseiro";
  const first = createComment(caption);
  const second = createComment(caption, [first]);
  assert.notEqual(first, second);
});

test("biblioteca local contém várias categorias e frases", () => {
  const stats = getCommentLibraryStats();
  assert.ok(stats.topics >= 10);
  assert.ok(stats.totalPhrases >= 70);
});
