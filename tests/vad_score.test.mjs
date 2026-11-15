import test from "node:test";
import assert from "node:assert/strict";
import { Vad } from "../web/js/vad.js";
import { scoreTokens } from "../web/js/shadowing.js";
import { SM2 } from "../web/js/srs.js";
import { mkSeg } from "./helpers.mjs";

test("VAD: espera, detecta fala e para após silêncio", () => {
  const v = new Vad({ silenceMs: 300, noSpeechMs: 1000 }); let r, t = 0;
  for (; t < 200; t += 50) r = v.push(0.001, t); assert.equal(r, "wait");
  r = v.push(0.1, t += 50); assert.equal(r, "wait", "1 amostra só não vale (estalo)"); r = v.push(0.1, t += 50); assert.equal(r, "speaking");
  for (let i = 0; i < 5; i++) r = v.push(0.001, t += 50); assert.equal(r, "speaking");
  for (let i = 0; i < 3; i++) r = v.push(0.001, t += 50); assert.equal(r, "stop-silence");
});
test("VAD: ninguém falou → stop-nospeech; limite → stop-max", () => {
  const a = new Vad({ noSpeechMs: 500 }); let r; for (let t = 0; t <= 600; t += 50) r = a.push(0, t); assert.equal(r, "stop-nospeech");
  const b = new Vad({ maxMs: 400, silenceMs: 99999 }); for (let t = 0; t <= 450; t += 50) r = b.push(0.1, t); assert.equal(r, "stop-max");
});

test("score: frase igual = 100%, tolera acento e pontuação", () => {
  const s = mkSeg("Buongiorno un caffè per favore"); const r = scoreTokens(s.tokens, "buongiorno, un caffe per favore!");
  assert.equal(r.pct, 100); assert.ok(r.frac.every(f => f === 1));
});
test("score: palavra faltando derruba só aquela palavra", () => {
  const s = mkSeg("Buongiorno un caffè per favore"); const r = scoreTokens(s.tokens, "buongiorno un per favore");
  assert.ok(r.pct < 100 && r.pct > 60); assert.equal(r.frac[2], 0); assert.equal(r.frac[0], 1);
});
test("score: sem texto reconhecido = 0%", () => { assert.equal(scoreTokens(mkSeg("Ciao a tutti").tokens, "").pct, 0); });
test("score: japonês compara em hiragana (kanji vs kana não conta como erro)", () => {
  const tokens = [{ text: "今日", hira: "きょう", start: 0 }, { text: "は", hira: "は", start: 2 }];
  assert.equal(scoreTokens(tokens, "きょうは", { ja: true, heardHira: "きょうは" }).pct, 100);
});

test("SM-2: intervalos 1 → 6 → ~15 dias; errar zera", () => {
  const s = new SM2(); let c = {}; const seq = [];
  for (let i = 0; i < 3; i++) { c = { ...c, ...s.next(c, 2) }; seq.push(c.interval); }
  assert.deepEqual(seq, [1, 6, 15]); assert.equal(s.next(c, 0).interval, 0); assert.equal(s.next(c, 0).reps, 0);
});
