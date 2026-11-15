import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { Vad } from "../web/js/vad.js";

const { window } = new JSDOM('<div id="dock" hidden></div>');
Object.assign(globalThis, { window, document: window.document });
const { dock } = await import("../web/js/dock.js");
const { app } = await import("../web/js/state.js");
const { ic, lab } = await import("../web/js/util.js");
const lv = o => ({ rms: 0.1, thr: 0.015, voice: true, spoke: true, prog: 0, vad: true, ms: 1500, ...o });
const mode = () => document.querySelector("#dock").dataset.mode;

test("Vad.progress: 0 sem fala, sobe com o silêncio e trava em 1", () => {
  const v = new Vad({ silenceMs: 1000 }); assert.equal(v.progress(0), 0);
  v.push(0.1, 0); v.push(0.1, 50); assert.equal(v.progress(50), 0);
  assert.equal(v.progress(550), 0.5); assert.equal(v.progress(5000), 1);
});

test("dock (treino): espera → ouvindo você → encerrando, conforme o nível do microfone", () => {
  app.segs = []; dock.locked = false; dock.set("wait");
  dock.level(lv({ spoke: false, voice: false })); assert.equal(mode(), "wait");
  dock.level(lv()); assert.equal(mode(), "voice");
  dock.level(lv({ voice: false, prog: 0.6 })); assert.equal(mode(), "end");
  assert.match(document.querySelector(".d-title").textContent, /Encerrando/);
});

test("dock (manual, sem VAD): Gravando vira Ouvindo você só quando há voz", () => {
  dock.set("rec"); dock.level(lv({ vad: false, voice: false })); assert.equal(mode(), "rec");
  dock.level(lv({ vad: false })); assert.equal(mode(), "voice");
});

test("dock: Player não sobrescreve gravação nem Modo Treino; idle esconde só se livre", () => {
  dock.set("wait"); dock.fromPlayer("play"); assert.equal(mode(), "wait");
  dock.locked = true; dock.hide(); dock.fromPlayer("play"); assert.equal(document.querySelector("#dock").hidden, true);
  dock.locked = false; dock.fromPlayer("play"); assert.equal(mode(), "play");
  dock.fromPlayer("idle"); assert.equal(document.querySelector("#dock").hidden, true);
});

test("dock: nível fora de gravação é ignorado (sem erro)", () => { dock.set("play"); dock.level(lv()); assert.equal(mode(), "play"); });

test("ícones: sem emoji, botão = svg + rótulo em texto puro", () => {
  const b = document.createElement("button"); lab(b, "mic", "<b>x</b>");
  assert.ok(b.querySelector("svg.i")); assert.equal(b.textContent, "<b>x</b>"); assert.match(ic("spk"), /<path/);
});
