// Dublê de <audio> e de fetch para testar sem navegador. O relógio do áudio é simulado (rápido: 1 ms real = 1 ms de áudio).
export class FakeEl extends EventTarget {
  constructor({ durationMs = 100 } = {}) {
    super(); Object.assign(this, { paused: true, currentTime: 0, duration: durationMs / 1000, playbackRate: 1, preservesPitch: false });
    this._src = ""; this.log = []; this.pending = null; this.timer = 0; this.durationMs = durationMs;
  }
  get src() { return this._src; }
  set src(v) { this._src = v; this.currentTime = 0; queueMicrotask(() => this.dispatchEvent(new Event("loadedmetadata"))); }
  play() {                                   // como o navegador: a Promise resolve depois de começar; pause() antes disso rejeita com AbortError
    this.paused = false; this.log.push("play"); clearInterval(this.timer);
    this.timer = setInterval(() => {
      if (this.paused) return;
      this.currentTime += 0.005 * this.playbackRate;
      if (this.currentTime >= this.duration) { this.paused = true; clearInterval(this.timer); this.dispatchEvent(new Event("ended")); }
    }, 5);
    return new Promise((res, rej) => { this.pending = { res, rej }; setTimeout(() => { if (this.pending) { this.pending.res(); this.pending = null; } }, 3); });
  }
  pause() {
    if (!this.paused) this.log.push("pause");
    this.paused = true; clearInterval(this.timer);
    if (this.pending) { const e = new Error("The play() request was interrupted by a call to pause()"); e.name = "AbortError"; this.pending.rej(e); this.pending = null; }
  }
}
export const sched = { schedule: cb => setTimeout(cb, 4), unschedule: id => clearTimeout(id) };
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const until = async (fn, ms = 2000) => { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) throw new Error("timeout esperando condição"); await sleep(2); } };

// Stub de fetch para /tts: devolve áudio falso com palavras; `delay(text)` permite respostas fora de ordem.
export function stubTts({ delay = () => 5 } = {}) {
  const calls = {};
  globalThis.fetch = async (url, opts) => {
    const body = opts?.body ? JSON.parse(opts.body) : {};
    if (url === "/tts") {
      calls[body.text] = (calls[body.text] || 0) + 1;
      await sleep(delay(body.text));
      let at = 0; const words = body.text.split(/\s+/).map((w, i) => { const o = { t: i * 20, d: 18, text: w }; at += w.length + 1; return o; });
      return { json: async () => ({ audio: Buffer.from("ID3fake").toString("base64"), words }) };
    }
    return { json: async () => ({}) };
  };
  return calls;
}
export const mkSeg = (text, lang = "it") => {
  let pos = 0; const tokens = [];
  for (const w of text.split(/\s+/)) { const start = text.indexOf(w, pos); tokens.push({ text: w, start }); pos = start + w.length; }
  return { text, lang, tokens };
};
export const fakeView = () => {
  const v = { sel: [], marks: [], icons: [], errors: [] };
  v.select = (i, o) => v.sel.push([i, !!o?.scroll]); v.mark = (s, k) => v.marks.push(k);
  v.playing = on => v.icons.push(on); v.error = e => v.errors.push(e);
  return v;
};
