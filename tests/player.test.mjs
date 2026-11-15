import test from "node:test";
import assert from "node:assert/strict";
import { AudioController } from "../web/js/audio.js";
import { Player } from "../web/js/player.js";
import { FakeEl, sched, sleep, until, stubTts, mkSeg, fakeView } from "./helpers.mjs";

function setup({ durationMs = 60, delay } = {}) {
  const calls = stubTts({ delay });
  const el = new FakeEl({ durationMs }), view = fakeView();
  const audio = new AudioController({ makeElement: () => el, ...sched });
  const heard = [];
  const p = new Player({ audio, view, voiceFor: () => "v", onHeard: (i, w) => heard.push([i, w]) });
  p.setSegs(["Uno due", "Tre quattro", "Cinque sei", "Sette otto"].map(t => mkSeg(t)));
  return { p, el, view, calls, audio, heard };
}

test("P1: sempre há frase ativa; ▶ parte dela e a view foi avisada", async () => {
  const { p, view, heard } = setup();
  assert.equal(p.i, 0); assert.deepEqual(view.sel[0], [0, false]);
  p.select(2); assert.equal(p.i, 2);
  p.play(p.i, { auto: false }); await until(() => heard.length === 1);
  assert.deepEqual(heard[0], [2, false]);
});

test("cliques rápidos em frases diferentes: só a última toca, sem sobreposição e sem erro", async () => {
  const { p, el, view } = setup({ delay: t => (t.startsWith("Uno") ? 60 : 5) });   // a 1ª frase responde por último
  const pend = [p.play(0, { auto: false }), p.play(1, { auto: false }), p.play(2, { auto: false })];
  await Promise.all(pend); await until(() => !p.busy);
  assert.equal(p.i, 2); assert.equal(el.src.startsWith("blob:"), true);
  assert.equal(view.errors.length, 0);
});

test("reproduz o bug do prefetch: clicar na frase que está sendo pré-carregada gera UMA requisição e UMA voz", async () => {
  const { p, calls, el } = setup({ delay: () => 40 });
  p.prefetchFrom(1, 1);                       // prefetch da frase 1 em voo
  await sleep(5);
  const done = p.play(1, { auto: false });    // clique nela
  await done; await until(() => !p.busy);
  assert.equal(calls["Tre quattro"], 1);
  assert.equal(el.log.filter(x => x === "play").length, 1);
});

test("auto-avanço: termina uma frase e começa a próxima sozinho, até o fim", async () => {
  const { p, heard } = setup({ durationMs: 30 });
  await p.play(0); await until(() => !p.busy);
  assert.deepEqual(heard.map(h => h[0]), [0, 1, 2, 3]);
});

test("auto-avanço prefetcha as próximas (sem pausa entre frases)", async () => {
  const { p, calls } = setup({ durationMs: 30 });
  const run = p.play(0); await sleep(20);
  assert.ok(calls["Tre quattro"] >= 1, "frase 2 já foi pedida enquanto a 1 toca"); await run;
});

test("loop: repete a mesma frase até parar", async () => {
  const { p, heard } = setup({ durationMs: 25 });
  p.loop = true; p.play(1); await until(() => heard.length >= 3); p.stop();
  assert.ok(heard.every(h => h[0] === 1)); assert.equal(p.busy, false);
});

test("pausa p/ repetir: espera ~ a duração da frase antes da próxima", async () => {
  const { p, heard, el } = setup({ durationMs: 60 });
  p.gap = true; const t0 = Date.now(); p.play(0);
  await until(() => heard.length === 2, 3000);
  assert.ok(Date.now() - t0 >= 60 + 55, "tocou 60 ms + esperou ~60 ms"); p.stop();
});

test("P2: stop() durante a pausa cancela a cadeia (nada toca depois)", async () => {
  const { p, heard } = setup({ durationMs: 30 });
  p.gap = true; p.play(0); await until(() => p.waiting); p.stop(); await sleep(80);
  assert.equal(heard.length, 1); assert.equal(p.busy, false);
});

test("palavra solta: toca só o trecho e NÃO avança para a próxima frase", async () => {
  const { p, heard, el } = setup({ durationMs: 200 });
  await p.play(0, { auto: false });           // alinha tokens
  const tok = p.segs[0].tokens[1];
  assert.ok(tok.t0 !== undefined);
  await p.playWord(0, tok); await until(() => !p.busy);
  assert.equal(heard.at(-1)[1], true); assert.equal(heard.filter(h => h[1] === false).length, 1);
});

test("realce de palavra acompanha o relógio do áudio", async () => {
  const { p, view } = setup({ durationMs: 120 });
  await p.play(0, { auto: false }); assert.ok(view.marks.includes(0) || view.marks.includes(1)); assert.equal(view.marks.at(-1), -1);
});

test("P3: ícone vem do estado real (ocupado → ⏸, parado → ▶)", async () => {
  const { p, view } = setup({ durationMs: 30 });
  await p.play(0, { auto: false }); assert.equal(view.icons.at(-1), false); assert.ok(view.icons.includes(true));
});

test("toggle: pausa e retoma sem recomeçar; parado, parte da frase ativa", async () => {
  const { p, el, heard } = setup({ durationMs: 120 });
  p.select(1); p.toggle(); await until(() => p.audio.active && !el.paused);
  assert.deepEqual(heard[0], [1, false]);
  p.toggle(); assert.equal(p.audio.paused, true); const t = el.currentTime; await sleep(25); assert.equal(el.currentTime, t);
  p.toggle(); await sleep(10); assert.equal(el.paused, false); p.stop();
});

test("erro de rede na geração do áudio chega na view e não trava o player", async () => {
  const { p, view } = setup();
  globalThis.fetch = async () => ({ json: async () => ({ error: "sem internet" }) });
  await p.play(0); assert.equal(view.errors.length, 1); assert.equal(p.busy, false);
});

test("speak() e playUrl() passam pelo mesmo controller: 'ouvir a frase' + 'minha voz' em sequência = 1 voz", async () => {
  const { p, el } = setup({ durationMs: 80 });
  const a = p.speak("Ciao", "it"); await sleep(15); const b = p.playUrl("blob:eu");
  await Promise.all([a, b]); assert.equal(el.src, "blob:eu"); assert.equal(p.audio.active, false);
});
