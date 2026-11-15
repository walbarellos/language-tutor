import test from "node:test";
import assert from "node:assert/strict";
import { AudioController } from "../web/js/audio.js";
import { FakeEl, sched, sleep, until } from "./helpers.mjs";

const mk = (durationMs = 100) => { const el = new FakeEl({ durationMs }); return { el, ac: new AudioController({ makeElement: () => el, ...sched }) }; };
const clip = (n) => ({ url: "blob:" + n, words: [] });

test("A3: load() é single-flight — prefetch e clique na mesma frase compartilham UMA requisição", async () => {
  const { ac } = mk(); let calls = 0;
  const loader = async () => { calls++; await sleep(20); return clip("a"); };
  const [x, y] = await Promise.all([ac.load("k", loader), ac.load("k", loader)]);
  assert.equal(calls, 1); assert.equal(x, y);
});

test("A3: reproduz o bug original — resposta atrasada do prefetch NÃO pode trocar o clipe que está tocando", async () => {
  const { ac } = mk(); const order = [];
  const slow = async () => { await sleep(40); order.push("slow"); return clip("slow"); };
  const fast = async () => { await sleep(5); order.push("fast"); return clip("fast"); };
  ac.prefetch([{ key: "k", loader: slow }]);          // prefetch já em voo
  const c = await ac.load("k", fast);                  // clique na mesma frase: reaproveita a Promise do prefetch
  assert.deepEqual(order, ["slow"]); assert.equal(c.url, "blob:slow");
});

test("A3: falha não fica em cache (tenta de novo no próximo clique)", async () => {
  const { ac } = mk(); let n = 0;
  await assert.rejects(ac.load("k", async () => { n++; throw new Error("rede"); }));
  const c = await ac.load("k", async () => { n++; return clip("ok"); });
  assert.equal(n, 2); assert.equal(c.url, "blob:ok");
});

test("prefetch respeita o limite de concorrência e não repete chaves já pedidas", async () => {
  const { ac } = mk(); let ativos = 0, pico = 0, total = 0;
  const loader = async () => { total++; ativos++; pico = Math.max(pico, ativos); await sleep(15); ativos--; return clip("x"); };
  ac.prefetch([1, 2, 3, 4, 5].map(k => ({ key: "k" + k, loader })));
  ac.prefetch([{ key: "k1", loader }]);
  await until(() => total === 5 && ativos === 0);
  assert.equal(pico, 2); assert.equal(total, 5);
});

test("A1/A2: play novo cancela o anterior — só o último termina 'ended'", async () => {
  const { ac, el } = mk(60);
  const a = ac.play(clip("A")), b = ac.play(clip("B")), c = ac.play(clip("C"));
  assert.deepEqual(await Promise.all([a, b, c]), ["cancelled", "cancelled", "ended"]);
  assert.equal(el.src, "blob:C"); assert.equal(ac.active, false);
});

test("A2: qualquer origem cancela (frase tocando + 'Minha voz' / revisão)", async () => {
  const { ac, el } = mk(80);
  const frase = ac.play(clip("frase")); await sleep(20);
  const minha = ac.play({ url: "blob:minha-voz" });
  assert.equal(await frase, "cancelled"); assert.equal(await minha, "ended");
  assert.equal(el.src, "blob:minha-voz");
});

test("A4: stop() durante play() pendente não gera erro (AbortError é engolido)", async () => {
  const { ac } = mk(); const rej = []; const h = e => rej.push(e); process.on("unhandledRejection", h);
  const p = ac.play(clip("A")); await sleep(1); ac.stop();
  assert.equal(await p, "cancelled"); await sleep(20); process.off("unhandledRejection", h);
  assert.equal(rej.length, 0);
});

test("faixa [from,to]: toca só o trecho e resolve 'range'", async () => {
  const { ac, el } = mk(200);
  const ticks = []; const r = await ac.play(clip("A"), { from: 50, to: 90, onTick: t => ticks.push(t) });
  assert.equal(r, "range"); assert.ok(el.currentTime * 1000 >= 90 && el.currentTime * 1000 < 130, "parou perto de 90 ms");
  assert.ok(ticks.length > 0 && ticks[0] >= 50);
});

test("pause/resume mantém a posição e termina normalmente", async () => {
  const { ac, el } = mk(120); const p = ac.play(clip("A")); await sleep(30);
  ac.pause(); assert.equal(ac.paused, true); const t = el.currentTime; await sleep(30); assert.equal(el.currentTime, t);
  await ac.resume(); assert.equal(await p, "ended");
});

test("falha real de play() (ex.: autoplay bloqueado) rejeita — e não é confundida com cancelamento", async () => {
  const { ac, el } = mk(); el.play = () => Promise.reject(Object.assign(new Error("bloqueado"), { name: "NotAllowedError" }));
  await assert.rejects(ac.play(clip("A")), /bloqueado/); assert.equal(ac.active, false);
});

test("onChange avisa o ícone quando começa, pausa e termina", async () => {
  const { ac } = mk(40); const seen = []; ac.onChange = () => seen.push(ac.active && !ac.paused);
  await ac.play(clip("A")); assert.equal(seen.at(-1), false); assert.ok(seen.includes(true));
});

test("A5: pause() com o play() ainda pendente é PAUSA (não cancela) e resume() termina 'ended'", async () => {
  const { ac, el } = mk(80); const p = ac.play(clip("A"));
  await until(() => !el.paused);                 // play() chamado, ainda não resolveu (janela de poucos ms)
  assert.ok(el.pending, "play() ainda pendente: é a janela que o bug exigia");
  ac.pause(); await sleep(15);
  assert.equal(ac.active, true, "continua ativo"); assert.equal(ac.paused, true);
  await ac.resume(); assert.equal(await p, "ended");
});

test("A4: pausar logo depois de retomar não gera rejeição não tratada", async () => {
  const { ac } = mk(200); const rej = []; const h = e => rej.push(e); process.on("unhandledRejection", h);
  const p = ac.play(clip("A")); await sleep(30); ac.pause();
  const r = ac.resume(); ac.pause();               // play() do resume ainda pendente quando o pause chega
  await r; await sleep(20); process.off("unhandledRejection", h);
  assert.equal(rej.length, 0); assert.equal(ac.paused, true);
  ac.stop(); assert.equal(await p, "cancelled");
});

test("A6: trocar de frase com o áudio pausado NÃO reporta 'pausado' durante a troca de clipe (ícone não pisca ▶)", async () => {
  const { ac } = mk(150); const a = ac.play(clip("A")); await sleep(30); ac.pause(); assert.equal(ac.paused, true);
  const seen = []; ac.onChange = () => seen.push(ac.paused);
  const b = ac.play(clip("B"));                      // src novo: espera loadedmetadata antes de tocar
  assert.equal(ac.paused, false, "já no início da nova reprodução");
  assert.equal(await a, "cancelled"); assert.equal(await b, "ended"); assert.ok(!seen.includes(true), "nunca reportou pausado: " + seen);
});

test("A6: pause() durante a troca de clipe é respeitado — fica mudo e posicionado; resume() toca até o fim", async () => {
  const { ac, el } = mk(100); const a = ac.play(clip("A")); await sleep(20); ac.stop(); await a;
  const b = ac.play(clip("B"), { from: 30 }); ac.pause();       // ainda esperando loadedmetadata
  await sleep(40); assert.equal(ac.paused, true); assert.equal(el.paused, true, "nada tocou"); assert.equal(Math.round(el.currentTime * 1000), 30);
  await ac.resume(); assert.equal(await b, "ended");
});

test("A6: depois de resume() o ícone volta a 'tocando' e pause() de novo funciona", async () => {
  const { ac } = mk(200); const p = ac.play(clip("A")); await sleep(30);
  ac.pause(); assert.equal(ac.paused, true); await ac.resume(); assert.equal(ac.paused, false);
  ac.pause(); assert.equal(ac.paused, true); ac.stop(); assert.equal(await p, "cancelled"); assert.equal(ac.paused, false);
});
