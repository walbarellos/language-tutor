import test from "node:test";
import assert from "node:assert/strict";
import { diffWord, bestHeard, hintIt } from "../web/js/diff.js";

const ops = a => a.map(x => x.op).join(",");
test("diff: igual → tudo ok; acento não conta como erro", () => {
  assert.equal(ops(diffWord("è", "e").exp), "ok");
  assert.equal(ops(diffWord("questo", "questo").exp), "ok,ok,ok,ok,ok,ok");
});
test("diff: troca marca sub nos dois lados; falta marca del; sobra marca ins", () => {
  const s = diffWord("questo", "questa"); assert.equal(s.exp[5].op, "sub"); assert.equal(s.got[5].op, "sub");
  const d = diffWord("nasce", "nasi"); assert.ok(d.exp.some(x => x.op === "del" || x.op === "sub"));
  assert.ok(diffWord("che", "chee").got.some(x => x.op === "ins"));
});
test("bestHeard: acha a palavra parecida; null se não foi dita", () => {
  const w = ["Nasce", "da", "questo"]; assert.equal(bestHeard(2, w, "nasi da questa"), "questa");
  assert.equal(bestHeard(0, w, "xyzzy qqq"), null);
});
test("dica do italiano: gli, gn, sc, ce, geminada, vogal final", () => {
  assert.match(hintIt("figlio", "fillo"), /ʎ/); assert.match(hintIt("gnocchi", "nocchi"), /ɲ/);
  assert.match(hintIt("nasce", "nasi"), /ʃ/); assert.match(hintIt("cena", "sena"), /tʃ/);
  assert.match(hintIt("pizza", "piza"), /dupla/); assert.match(hintIt("questo", "questa"), /Vogal final/);
  assert.equal(hintIt("amato", "amato"), ""); assert.match(hintIt("amato", null), /não apareceu/);
});
