import test from "node:test";
import assert from "node:assert/strict";
import { Trainer } from "../web/js/trainer.js";
import { sleep } from "./helpers.mjs";

const CFG = { pauseOk: 1, pauseBad: 1, gapFactor: 1, retries: 2 };
function setup({ scores = [90], mic = true, nSegs = 2, recorder = {} } = {}) {
  const log = [], steps = [];
  const player = {
    segs: Array.from({ length: nSegs }, (_, i) => ({ id: i })), speed: 1, i: 0, audio: { durationMs: 10 },
    once: async (n, o) => { log.push(["once", n, o.rate]); await sleep(1); return "ended"; }, stop() { log.push(["pstop"]); },
  };
  const rec = {
    open: async () => { if (!mic) throw new Error("negado"); log.push(["open"]); }, close: () => log.push(["close"]), stopNow: () => {},
    record: async () => { log.push(["record"]); return { blob: {}, reason: "stop-silence" }; }, ...recorder,
  };
  let k = 0; const score = async () => { const pct = scores[Math.min(k++, scores.length - 1)]; log.push(["score", pct]); return pct === null ? null : { pct, text: "x" }; };
  const view = { on: b => log.push(["on", b]), step: (n, i) => steps.push(n) };
  return { tr: new Trainer({ player, recorder: rec, score, view, cfg: CFG }), log, steps, player };
}
const kinds = (log, k) => log.filter(x => x[0] === k);

test("fluxo feliz: devagar → normal → falar → nota ≥ 80 → próxima frase", async () => {
  const { tr, log, steps } = setup({ scores: [90, 95] });
  await tr.start(0);
  assert.deepEqual(kinds(log, "once").map(x => x[1] + "@" + x[2]), ["0@0.75", "0@1", "1@0.75", "1@1"]);
  assert.equal(kinds(log, "record").length, 2); assert.equal(steps.at(-1), "done"); assert.equal(tr.on, false);
});

test("nota baixa: repete a frase (sem 'devagar' de novo) e só avança ao passar", async () => {
  const { tr, log } = setup({ scores: [50, 90, 90], nSegs: 2 });
  await tr.start(0);
  assert.deepEqual(kinds(log, "once").slice(0, 3).map(x => x[1] + "@" + x[2]), ["0@0.75", "0@1", "0@1"]);
  assert.equal(kinds(log, "record").length, 3);
});

test("R3: esgotou as tentativas → segue em frente, não prende você", async () => {
  const { tr, log } = setup({ scores: [10], nSegs: 2 });
  await tr.start(0);
  assert.equal(kinds(log, "record").length, 6);               // (1 + 2 retries) × 2 frases
  assert.equal(kinds(log, "once").filter(x => x[1] === 1).length > 0, true);
});

test("R2: sem microfone vira 'ouvir + pausa' e nunca chama record()", async () => {
  const { tr, log, steps } = setup({ mic: false });
  await tr.start(0);
  assert.equal(kinds(log, "record").length, 0); assert.ok(steps.includes("nomic") && steps.includes("gap")); assert.equal(steps.at(-1), "done");
});

test("silêncio (ninguém falou) conta como tentativa e tenta de novo", async () => {
  let n = 0;
  const { tr, log, steps } = setup({ nSegs: 1, scores: [90], recorder: { record: async () => { n++; return n === 1 ? { blob: {}, reason: "stop-nospeech" } : { blob: {}, reason: "stop-silence" }; } } });
  await tr.start(0); assert.ok(steps.includes("silent")); assert.equal(n, 2);
});

test("R1: stop() no meio da gravação cancela tudo — nada toca depois e o microfone fecha", async () => {
  let resolve; const { tr, log } = setup({ recorder: { record: () => new Promise(r => { resolve = r; log.push(["record"]); }), stopNow: why => resolve?.({ blob: {}, reason: why }) } });
  const run = tr.start(0); await sleep(30);
  assert.equal(tr.on, true); tr.stop(); await run;
  const antes = log.length; await sleep(40);
  assert.equal(log.length, antes, "nada novo depois do stop"); assert.equal(tr.on, false); assert.ok(kinds(log, "close").length >= 1);
  assert.equal(kinds(log, "score").length, 0);
});

test("R1: stop() durante uma pausa também cancela", async () => {
  const { tr, log } = setup({ scores: [10], recorder: {} });
  tr.cfg.pauseBad = 500; const run = tr.start(0); await sleep(40); tr.stop(); await run;
  const n = kinds(log, "once").length; await sleep(40); assert.equal(kinds(log, "once").length, n);
});

test("start() de novo reinicia limpo (não deixa duas cadeias rodando)", async () => {
  const { tr, log } = setup({ nSegs: 3, scores: [90] });
  const a = tr.start(0); await sleep(5); const b = tr.start(2); await Promise.all([a, b]);
  assert.equal(kinds(log, "once").some(x => x[1] === 2), true);
});
