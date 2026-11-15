import test from "node:test";
import assert from "node:assert/strict";
import { getVad, setVad, VAD_DEFAULT } from "../web/js/settings.js";
import { Recorder } from "../web/js/recorder.js";
import { sleep } from "./helpers.mjs";

const mem = (init) => { let v = init; return { getItem: () => v, setItem: (_, x) => { v = x; } }; };

test("sem nada salvo (ou storage quebrado/corrompido) usa o padrão", () => {
  assert.deepEqual(getVad(mem(null)), VAD_DEFAULT);
  assert.deepEqual(getVad(mem("{quebrado")), VAD_DEFAULT);
  assert.deepEqual(getVad({ getItem() { throw new Error("bloqueado"); } }), VAD_DEFAULT);
  assert.deepEqual(getVad(undefined), VAD_DEFAULT);
});
test("ida e volta e limites (valor absurdo não quebra a gravação)", () => {
  const s = mem(null); setVad({ thr: 0.03, silenceMs: 1500 }, s); assert.deepEqual(getVad(s), { thr: 0.03, silenceMs: 1500 });
  setVad({ thr: 99, silenceMs: -5 }, s); assert.deepEqual(getVad(s), { thr: 0.1, silenceMs: 400 });
  setVad({ thr: "abc", silenceMs: null }, s); assert.deepEqual(getVad(s), VAD_DEFAULT);
});
test("setVad não explode se o storage recusar escrita", () => { assert.doesNotThrow(() => setVad({ thr: 0.02, silenceMs: 800 }, { getItem() { return null; }, setItem() { throw new Error("cheio"); } })); });

test("o Recorder usa a configuração do VAD: limiar alto demais = ninguém falou", async () => {
  globalThis.window = { AudioContext: class { createMediaStreamSource() { return { connect() {} }; } createAnalyser() { return { fftSize: 64, getFloatTimeDomainData: b => b.fill(0.1) }; } close() {} } };
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } } });
  globalThis.MediaRecorder = class { constructor() { this.state = "inactive"; this.mimeType = "audio/webm"; } start() { this.state = "recording"; } stop() { this.state = "inactive"; setTimeout(() => { this.ondataavailable?.({ data: new Blob(["x"]) }); this.onstop?.(); }, 5); } };
  const sensivel = new Recorder({ vadCfg: () => ({ thr: 0.015, silenceMs: 99999, noSpeechMs: 300 }) }); await sensivel.open();
  const a = sensivel.record({ vad: true, maxMs: 700 }); assert.equal((await a).reason, "stop-max");        // ouviu fala (0,1 > 0,015) e ficou gravando até o limite
  const surdo = new Recorder({ vadCfg: () => ({ thr: 0.5, noSpeechMs: 300 }) }); await surdo.open();
  assert.equal((await surdo.record({ vad: true, maxMs: 2000 })).reason, "stop-nospeech");                 // 0,1 < 0,5: nunca "falou"
  sensivel.close(); surdo.close();
});
