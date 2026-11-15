// Smoke test do app inteiro (main.js) num DOM simulado: pega erro de import/fiação que os testes unitários não veem.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { JSDOM } from "jsdom";
import { FakeEl, sleep, until } from "./helpers.mjs";

const html = fs.readFileSync(new URL("../web/index.html", import.meta.url), "utf8").replace(/<script[\s\S]*?<\/script>/, "").replace(/<link[^>]*>/, "");
const dom = new JSDOM(html, { pretendToBeVisual: true, url: "http://localhost:8765/" });
const { window } = dom;
Object.assign(globalThis, { window, document: window.document, matchMedia: () => ({ matches: false }), addEventListener: window.addEventListener.bind(window),
  KeyboardEvent: window.KeyboardEvent, Audio: class extends FakeEl {}, requestAnimationFrame: cb => setTimeout(cb, 4), cancelAnimationFrame: clearTimeout });
Object.defineProperty(globalThis, "navigator", { value: { mediaDevices: { getUserMedia: () => Promise.reject(Object.assign(new Error("negado"), { name: "NotAllowedError" })) } }, configurable: true });
window.HTMLElement.prototype.scrollIntoView = function () {};
window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
window.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };

const req = []; 
globalThis.fetch = async (url, opts) => {
  const body = opts?.body && typeof opts.body === "string" ? JSON.parse(opts.body) : {}; req.push([url.split("?")[0], body.text]);
  const j = o => ({ json: async () => o });
  if (url === "/tts") { await sleep(8); return j({ audio: Buffer.from("ID3").toString("base64"), words: body.text.split(/\s+/).map((w, i) => ({ t: i * 15, d: 12, text: w })) }); }
  if (url === "/api/detect") return j({ langs: body.texts.map(() => "it") });
  if (url === "/api/freq") return j({ ranks: {} });
  if (url === "/api/cards") return j({ cards: [] });
  if (url === "/api/progress") return j({ progress: {} });
  if (url.startsWith("/api/word")) return j({ entries: [] });
  if (url.startsWith("/api/cognate")) return j({ similar: [] });
  if (url === "/api/trilha?lang=it") return j({ situacoes: [{ id: "cafe", titulo: "Pedir um café", objetivo: "Pedir.", nivel: 1, linhas: [{ q: "Você", t: "Un caffè per favore", p: "Um café" }, { q: "Barista", t: "Certo grazie", p: "Claro" }] }] });
  return j({});
};
const $ = s => document.querySelector(s);
const click = el => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }));
const key = (k, target = document.body) => target.dispatchEvent(new window.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
const errs = []; process.on("unhandledRejection", e => errs.push(e));

await import("../web/js/main.js");
const { app } = await import("../web/js/state.js");
await until(() => app.segs.length === 2);

test("o app sobe: 2 frases na tela e a primeira já é a frase ativa", () => {
  assert.equal(document.querySelectorAll(".seg").length, 2);
  assert.ok(document.querySelectorAll(".seg")[0].classList.contains("on"));
  assert.equal(app.player.i, 0);
});

test("▶ toca a frase ativa e avança sozinho até a última; ícone volta a ▶", async () => {
  click($("#bPlay")); await until(() => $("#bPlay").dataset.playing === "true");
  await until(() => $("#bPlay").dataset.playing === "false", 4000);
  assert.ok(req.filter(r => r[0] === "/tts").length >= 2);
});

test("clicar numa frase a seleciona e toca (sem ter que 'selecionar antes')", async () => {
  click(document.querySelectorAll(".seg")[1]); await until(() => app.player.i === 1);
  assert.ok(document.querySelectorAll(".seg")[1].classList.contains("on")); assert.ok(!document.querySelectorAll(".seg")[0].classList.contains("on"));
  await until(() => !app.player.busy, 4000);
});

test("duplo clique frenético: uma requisição por frase e nenhum erro", async () => {
  req.length = 0; const segs = [...document.querySelectorAll(".seg")];
  for (let i = 0; i < 6; i++) click(segs[i % 2]);
  await until(() => !app.player.busy, 4000);
  assert.ok(req.filter(r => r[0] === "/tts").length <= 2, JSON.stringify(req.filter(r => r[0] === "/tts")));   // cache + single-flight
  assert.equal(errs.length, 0);
});

test("clicar numa palavra abre o painel e a frase vira a ativa", async () => {
  const w = document.querySelectorAll(".seg")[1].querySelector(".w"); click(w);
  await until(() => $("#pw h2")); assert.equal($("#pw h2").textContent, w.textContent); assert.equal(app.player.i, 1);
  await until(() => !app.player.busy, 4000);
});

test("atalhos: Espaço (fora de botão) toca/pausa; Setas navegam; T liga o treino", async () => {
  app.player.select(0); key(" "); await until(() => app.audio.active && !app.audio.paused);   // espera tocar de verdade (carregando, Espaço cancela)
  key(" "); await sleep(20); assert.equal(app.audio.paused, true);
  key(" "); await sleep(20); assert.equal(app.audio.paused, false); app.player.stop();
  key(" "); await until(() => app.player.loading || app.audio.active); key(" "); await sleep(20);
  assert.equal(app.player.busy, false, "Espaço durante o carregamento cancela");
  key("ArrowRight"); await until(() => app.player.i === 1); app.player.stop();
});

test("clique de mouse num botão do rodapé solta o foco (atalhos não morrem)", () => {
  const b = $("#bLoop"); b.focus(); click(b); assert.notEqual(document.activeElement, b);
});

test("Modo Treino sem microfone: ouve, pede para repetir e conclui sem travar", async () => {
  app.player.select(0); click($("#bTrain"));
  await until(() => app.trainer.on); await until(() => /Repita em voz alta/.test($("#coach").textContent), 4000);
  assert.equal($("#bTrain").getAttribute("aria-pressed"), "true");
  click($("#bTrain")); await until(() => !app.trainer.on);
  assert.equal(app.player.busy, false); assert.equal($("#bTrain").getAttribute("aria-pressed"), "false");
});

test("trilha: abre a situação e o botão 'Treinar esta situação' existe", async () => {
  click($("#bTrl")); await until(() => document.querySelector("#trl button"));
  click(document.querySelector("#trl button")); await until(() => document.querySelector(".sitb"));
  assert.ok([...document.querySelectorAll(".sitb button")].some(b => /Treinar/.test(b.textContent)));
  assert.equal(document.querySelectorAll(".seg").length, 2);
});

test("nenhuma rejeição não tratada em todo o fluxo", () => assert.equal(errs.length, 0, errs.map(String).join("; ")));

test.after(() => { app.player.stop(); app.trainer.stop(true); window.close(); });
