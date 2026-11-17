import test from "node:test";
import assert from "node:assert/strict";
import { f0Contour, contourSig, compare, endTrend, rhythm, matchWords, pauses, unclear, spanMs } from "../web/js/prosodia.js";
import { trapsOf, trapNote } from "../web/js/diff.js";

const SR = 16000;
const tone = (secs, f = t => 200) => { const x = new Float32Array(SR * secs); let ph = 0; for (let i = 0; i < x.length; i++) { ph += 2 * Math.PI * f(i / SR) / SR; x[i] = 0.5 * Math.sin(ph); } return x; };
const med = c => { const v = c.f.filter(Boolean).sort((a, b) => a - b); return v[v.length >> 1]; };

test("F0: seno de 200 Hz → ~200 Hz (sem cair uma oitava); silêncio → sem voz", () => {
  const c = f0Contour(tone(1), SR); assert.ok(Math.abs(med(c) - 200) < 6, "mediana " + med(c));
  assert.equal(f0Contour(new Float32Array(SR), SR).f.filter(Boolean).length, 0);
});
test("entonação: sobe×sobe ≈ 1; sobe×desce < 0; tom absoluto da voz não importa", () => {
  const up = contourSig(f0Contour(tone(1, t => 150 + 100 * t), SR)), up2 = contourSig(f0Contour(tone(1, t => 220 + 140 * t), SR)), down = contourSig(f0Contour(tone(1, t => 250 - 100 * t), SR));
  assert.ok(compare(up, up2) > 0.9); assert.ok(compare(up, down) < -0.5);
  assert.equal(endTrend(up), "sobe"); assert.equal(endTrend(down), "desce"); assert.equal(endTrend(contourSig(f0Contour(tone(1), SR)) || new Array(40).fill(0)), "plana");
});
test("sinal curto demais não gera curva", () => { assert.equal(contourSig({ f: [0, 0, 100, 0], hop: .02 }), null); assert.ok(spanMs({ f: [0, 100, 100, 0], hop: .02 }) === 40); });
test("ritmo: razão sua/original e rótulos", () => {
  const w = d => [{ w: "a", s: 0.2, e: 0.2 + d }];
  assert.equal(rhythm({ words: w(1), refMs: 2000 }).label, "Rápido demais");
  assert.equal(rhythm({ words: w(1.8), refMs: 2000 }).label, "No ritmo");
  assert.equal(rhythm({ words: w(2.6), refMs: 2000 }).label, "Um pouco lento");
  assert.equal(rhythm({ words: w(4), refMs: 2000 }).tone, "bad"); assert.equal(rhythm({ words: [], spanMs: 0, refMs: 2000 }), null);
  assert.equal(rhythm({ spanMs: 1900, refMs: 2000 }).label, "No ritmo");
});
test("palavras: liga na ordem, acha confiança baixa e pausa longa", () => {
  const T = [{ text: "Nasce", t0: 0, t1: 300 }, { text: "da", t0: 350, t1: 450 }, { text: "questo", t0: 500, t1: 900 }];
  const U = [{ w: "nasce", s: 0, e: .4, p: .9 }, { w: "da", s: 1.2, e: 1.3, p: .3 }, { w: "questa", s: 1.35, e: 1.8, p: .8 }];
  const m = matchWords(T, U); assert.equal(m[0], U[0]); assert.equal(m[2], U[2]);
  assert.deepEqual(unclear(T, m), [1]); assert.deepEqual(pauses(T, m).map(p => p.after), [0]);
});
test("armadilhas: che=kê (não tchê), sce, gli, dupla; nota lista até 3", () => {
  assert.equal(trapsOf("che"), "chi"); assert.equal(trapsOf("nasce"), "sc"); assert.equal(trapsOf("figlio"), "gli"); assert.equal(trapsOf("pizza"), "dupla"); assert.equal(trapsOf("amato"), null);
  assert.match(trapNote([{ text: "che" }, { text: "amato" }]), /che → .*nunca “tchê”/);
});
