import test from "node:test";
import assert from "node:assert/strict";
import { createComment, getCommentLibraryStats } from "../src/comments.js";

test("gera comentários locais para legendas de temas conhecidos", () => {
  for (const caption of [
    "Hoje preparei uma receita de bolo de chocolate.",
    "Um fim de tarde nesta praia durante a viagem.",
    "Treino concluído, mais um dia de academia."
  ]) {
    const result = createComment(caption);
    assert.equal(typeof result, "string");
    assert.ok(result.length > 10);
  }
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
