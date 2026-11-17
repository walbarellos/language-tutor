// Player: decide O QUE tocar (frase ativa, próxima, repetição, pausa p/ repetir). Quem toca é o AudioController.
//
// Invariantes (spec — tests/player.test.mjs):
//   P1  Sempre existe uma frase ativa (this.i) e ela é visível: o ▶ parte dela, nunca de uma frase "invisível".
//   P2  Qualquer ação nova (clique, próxima, ▶) cancela a cadeia anterior (loop, auto-avanço, pausa) via token.
//   P3  O ícone ▶/⏸ vem do estado real (áudio ativo OU esperando OU carregando), nunca de um flag solto.
import { clipKey, loaderFor, alignSeg } from "./clips.js";

export class Player {
  // view: { select(i,{scroll}), mark(seg,k), playing(bool), error(e) }   voiceFor: lang -> voz
  constructor({ audio, view, voiceFor, onHeard = null }) {
    Object.assign(this, { audio, view, voiceFor, onHeard });
    this.segs = []; this.i = 0; this.speed = 1; this.loop = false; this.gap = false;
    this.token = 0; this.k = -1; this.waiting = false; this.loading = false; this.timer = 0; this.waitDone = null;
    audio.onChange = () => this._ui();
  }

  setSegs(segs) { this.stop(); this.audio.clearPrefetch(); this.segs = segs; this.i = 0; this.select(0, { scroll: false }); this.prefetchFrom(0); }
  select(i, { scroll = false } = {}) { this.i = Math.max(0, Math.min(this.segs.length - 1, i)); this.view.select(this.i, { scroll }); }
  setSpeed(s) { this.speed = Number(s); this.audio.setRate(1); this.prefetchFrom(this.i); }
  get busy() { return this.audio.active || this.waiting || this.loading; }
  _ui() {
    this.view.playing(this.busy && !this.audio.paused);
    const st = this.waiting ? "gap" : this.loading ? "load" : this.audio.active ? (this.audio.paused ? "pause" : "play") : "idle";
    this.view.status?.(st, st === "gap" ? { ms: this.audio.durationMs / this.speed } : {});   // painel ao vivo (opcional)
  }

  async clipFor(seg, rate = this.speed) {
    const voice = this.voiceFor(seg.lang), key = clipKey(seg.text, voice, rate);
    const clip = await this.audio.load(key, loaderFor(seg.text, voice, rate));   // single-flight (A3)
    alignSeg(seg, clip, key);
    return clip;
  }
  prefetchFrom(i, n = 3, rate = this.speed) {
    this.audio.prefetch(this.segs.slice(i, i + n).map(s => {
      const v = this.voiceFor(s.lang); return { key: clipKey(s.text, v, rate), loader: loaderFor(s.text, v, rate) };
    }));
  }

  // Toca UMA vez. Devolve { r: "ended"|"range"|"cancelled", tk }.  `word` = token cuja faixa [t0,t1] será tocada.
  async _once(i, { rate = this.speed, word = null } = {}) {
    const tk = ++this.token;                         // P2
    clearTimeout(this.timer); this._cancelWait(); this.audio.stop();
    this.k = -1; this.select(i, { scroll: true });
    const seg = this.segs[i];
    this.loading = true; this._ui();
    let clip;
    try { clip = await this.clipFor(seg, rate); }
    catch (e) { if (tk === this.token) { this.loading = false; this._ui(); this.view.error(e); } return { r: "cancelled", tk }; }
    if (tk !== this.token) return { r: "cancelled", tk };
    this.loading = false;
    const range = word && word.t0 !== undefined ? { t0: word.t0, t1: word.t1 } : null;
    this.onHeard?.(i, !!range);
    this.prefetchFrom(i + 1, 3, this.speed);
    try {
      const r = await this.audio.play(clip, {
        from: range ? range.t0 : 0, to: range ? range.t1 : null, rate: 1,
        onTick: t => this._tick(seg, t),
      });
      if (tk === this.token) this.view.mark(seg, -1);
      return { r, tk, ranged: !!range, wordMissed: !!word && !range };
    } catch (e) { if (tk === this.token) { this._ui(); this.view.error(e); } return { r: "cancelled", tk }; }
  }
  _tick(seg, t) {
    let k = -1; seg.tokens.forEach((x, n) => { if (x.t0 !== undefined && x.t0 <= t) k = n; });
    if (k !== this.k) { this.k = k; this.view.mark(seg, k); }
    this.view.progress?.(t, this.audio.durationMs);
  }

  // Toca uma vez e devolve só o resultado (usado pelo Trainer).
  async once(i, opts) { return (await this._once(i, opts)).r; }

  // Toca e CONTINUA: repete (loop), faz pausa p/ repetir e avança sozinho (auto).
  async play(i = this.i, { word = null, auto = true } = {}) {
    const { r, tk, ranged, wordMissed } = await this._once(i, { word });
    if (r === "cancelled" || tk !== this.token) return;
    if (ranged) return this._ui();                   // palavra solta: toca e para
    const seg = this.segs[i], go = auto && !wordMissed;
    if (this.gap && go) {                            // pausa = tempo da própria frase, para repetir em voz alta
      this.waiting = true; this._ui();
      await new Promise(res => { this.waitDone = res; this.timer = setTimeout(res, this.audio.durationMs / this.speed); });
      this.waiting = false; this.waitDone = null;
      if (tk !== this.token) return;
    }
    if (this.loop) return this.play(i, { auto });
    if (go && i + 1 < this.segs.length) return this.play(i + 1, { auto: true });
    this._ui();
  }
  // Fala um texto avulso (revisão de cartas, "Original" do shadowing) e a sua própria gravação: tudo passa pelo mesmo controller (A1/A2).
  async speak(text, lang, rate = this.speed) {
    this.stop(); const voice = this.voiceFor(lang);
    try { const clip = await this.audio.load(clipKey(text, voice, rate), loaderFor(text, voice, rate)); return await this.audio.play(clip, { rate: 1 }); }
    catch (e) { this.view.error(e); }
  }
  async playUrl(url) { this.stop(); try { return await this.audio.play({ url }, { rate: 1 }); } catch (e) { this.view.error(e); } }
  playWord(i, token) { return this.play(i, { word: token, auto: false }); }

  async toggle() {
    try {
      if (this.waiting || this.loading) return this.stop();
      if (this.audio.active) return this.audio.paused ? await this.audio.resume() : this.audio.pause();
      return await this.play(this.i);                // P1: parte da frase ativa
    } catch (e) { this.view.error(e); }              // nada escapa como "unhandled rejection" do onclick
  }
  next() { return this.play(Math.min(this.segs.length - 1, this.i + 1)); }
  prev() { return this.play(Math.max(0, this.i - 1)); }
  stop() {
    this.token++; clearTimeout(this.timer); this._cancelWait(); this.waiting = false; this.loading = false;
    this.audio.stop(); const s = this.segs[this.i]; if (s) this.view.mark(s, -1); this.k = -1; this._ui();
  }
  _cancelWait() { if (this.waitDone) { this.waitDone(); this.waitDone = null; } }
}
