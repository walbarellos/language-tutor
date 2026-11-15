import test from "node:test";
import assert from "node:assert/strict";
import { Recorder } from "../web/js/recorder.js";
import { sleep } from "./helpers.mjs";

// Dublês mínimos do navegador. O MediaRecorder falso só dispara onstop DEPOIS de um atraso (como o real): é essa janela que escondia o bug.
function fakeBrowser({ rms = 0.1, stopDelay = 30 } = {}) {
  let analyserCalls = 0;
  globalThis.window = { AudioContext: class { createMediaStreamSource() { return { connect() {} }; } createAnalyser() { const a = this; return { fftSize: 64, getFloatTimeDomainData(b) { analyserCalls++; if (a.dead) throw new TypeError("analisador usado depois do close"); b.fill(rms); } }; } close() {} } };
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } } });
  globalThis.MediaRecorder = class { constructor() { this.state = "inactive"; this.mimeType = "audio/webm"; } start() { this.state = "recording"; } stop() { this.state = "inactive"; setTimeout(() => { this.ondataavailable?.({ data: new Blob(["x"]) }); this.onstop?.(); }, stopDelay); } };
  return { calls: () => analyserCalls };
}

test("close() no meio da gravação: o timer de volume não toca no analisador depois (bug do navegador real)", async () => {
  fakeBrowser({ stopDelay: 130 }); const errs = []; const h = e => errs.push(e); process.on("uncaughtException", h);
  const r = new Recorder(); await r.open(); const rec = r.record({ vad: false, maxMs: 60000 }); await sleep(120);
  const an = r.an; r.close(); an.dead = true;               // close() zera tudo; onstop só chega 30 ms depois
  const { reason } = await rec; await sleep(60); process.off("uncaughtException", h);
  assert.equal(reason, "closed"); assert.deepEqual(errs, []);
});

test("VAD: para sozinho depois que a fala termina (motivo stop-silence)", async () => {
  fakeBrowser({ rms: 0.1 }); const r = new Recorder(); await r.open();
  const p = r.record({ vad: true, maxMs: 60000 }); await sleep(200);
  globalThis.__q = true; r.an.getFloatTimeDomainData = b => b.fill(0);     // a pessoa calou
  const { reason } = await Promise.race([p, sleep(2500).then(() => ({ reason: "TIMEOUT" }))]);
  assert.equal(reason, "stop-silence"); r.close();
});

test("record() sem microfone aberto rejeita com mensagem clara", async () => {
  fakeBrowser(); await assert.rejects(new Recorder().record(), /não aberto/);
});
