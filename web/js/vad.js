// Detector de fim de fala (puro, sem navegador): recebe o volume (RMS) a cada ~50 ms e diz quando parar de gravar.
// Retorna: "wait" | "speaking" | "stop-silence" (falou e calou) | "stop-nospeech" (ninguém falou) | "stop-max" (limite de tempo).
export class Vad {
  constructor({ thr = 0.015, silenceMs = 900, noSpeechMs = 4500, maxMs = 15000, minHits = 2 } = {}) {
    Object.assign(this, { thr, silenceMs, noSpeechMs, maxMs, minHits });
    this.t0 = null; this.hits = 0; this.speech = false; this.lastVoice = 0;
  }
  progress(now) { return this.speech ? Math.min(1, (now - this.lastVoice) / this.silenceMs) : 0; }   // 0..1: quanto falta para encerrar
  push(rms, now) {
    if (this.t0 === null) this.t0 = now;
    if (rms > this.thr) { this.hits++; if (this.hits >= this.minHits) { this.speech = true; this.lastVoice = now; } }   // 2 amostras seguidas: ignora estalo isolado
    else if (!this.speech) this.hits = 0;
    if (now - this.t0 > this.maxMs) return "stop-max";
    if (!this.speech) return now - this.t0 > this.noSpeechMs ? "stop-nospeech" : "wait";
    return now - this.lastVoice > this.silenceMs ? "stop-silence" : "speaking";
  }
}
