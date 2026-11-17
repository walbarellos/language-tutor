// Gravador de microfone. Com `vad:true` para sozinho quando você termina de falar (usado pelo Modo Treino);
// com `vad:false` grava até stopNow() (botão Gravar manual).
import { Vad } from "./vad.js";

export class Recorder {
  constructor({ vadCfg = () => ({}) } = {}) { this.vadCfg = vadCfg; this.stream = null; this.ctx = null; this.an = null; this.cur = null; this.onLevel = null; }

  async open() {                                  // pede o microfone UMA vez (dentro de um clique do usuário)
    if (this.stream) return;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC(); const src = this.ctx.createMediaStreamSource(this.stream);
    this.an = this.ctx.createAnalyser(); this.an.fftSize = 1024; src.connect(this.an);
  }
  close() {
    this.stopNow("closed");
    this.stream?.getTracks().forEach(t => t.stop()); this.ctx?.close?.(); this.stream = this.ctx = this.an = null;
  }

  // Resolve { blob, reason } — reason: stop-silence | stop-nospeech | stop-max | manual | closed
  record({ vad = true, maxMs = 15000 } = {}) {
    if (!this.stream) return Promise.reject(new Error("Microfone não aberto."));
    this.stopNow("manual");
    const { stream, an } = this;                      // capturados: close() zera this.an, mas esta gravação termina com o que tem
    return new Promise(resolve => {
      const mr = new MediaRecorder(stream), chunks = [], det = new Vad({ maxMs, ...this.vadCfg() }), buf = new Float32Array(an.fftSize);
      let reason = "manual", poll = 0;
      mr.ondataavailable = e => chunks.push(e.data);
      mr.onstop = () => { clearInterval(poll); this.cur = null; resolve({ blob: new Blob(chunks, { type: mr.mimeType }), reason }); };
      this.cur = { stop: why => { reason = why; clearInterval(poll); if (mr.state === "recording") mr.stop(); } };   // para o timer JÁ: não espera o onstop
      mr.start();
      poll = setInterval(() => {
        an.getFloatTimeDomainData(buf);
        let s = 0; for (const v of buf) s += v * v;
        const rms = Math.sqrt(s / buf.length), now = performance.now(), r = det.push(rms, now);
        this.onLevel?.({ rms, thr: det.thr, voice: rms > det.thr, spoke: det.speech, prog: vad ? det.progress(now) : 0, vad, ms: now - det.t0 });
        if (vad && r.startsWith("stop")) this.cur?.stop(r);
        else if (!vad && performance.now() - det.t0 > maxMs) this.cur?.stop("stop-max");
      }, 50);
    });
  }
  stopNow(why = "manual") { this.cur?.stop(why); }
}
