// AudioController: ÚNICA porta de saída de som do app.
//
// Invariantes (spec — os testes em tests/audio.test.mjs verificam cada uma):
//   A1  No máximo UMA fonte de áudio ativa: existe um só <audio>, então sobrepor vozes é estruturalmente impossível.
//   A2  play() novo cancela o anterior, seja qual for a origem (frase, palavra, revisão, gravação do usuário).
//   A3  load() é single-flight por chave: prefetch e clique na mesma frase compartilham a MESMA Promise.
//   A4  Cancelar nunca é erro: AbortError de play() interrompido é engolido; só falhas reais viram exceção.
//   A6  paused = o usuário pausou (flag `held`), nunca "o elemento ainda não começou": o ícone ▶/⏸ não pisca ao trocar de frase.
//   A5  pause() nunca vira stop(): pausar com o play() ainda pendente mantém a posição e resume() continua.

const once = (el, ev) => new Promise((res, rej) => {
  const off = () => { el.removeEventListener(ev, ok); el.removeEventListener("error", bad); };
  const ok = () => { off(); res(); };
  const bad = () => { off(); rej(new Error("Não consegui carregar o áudio.")); };
  el.addEventListener(ev, ok); el.addEventListener("error", bad);
});

export class AudioController {
  constructor({ makeElement = () => new Audio(), schedule = cb => requestAnimationFrame(cb), unschedule = id => cancelAnimationFrame(id), maxPrefetch = 2 } = {}) {
    this.el = makeElement();
    this.el.preservesPitch = true;
    this.schedule = schedule; this.unschedule = unschedule;
    this.clips = new Map();          // chave -> Promise<clip>   (A3)
    this.queue = []; this.busy = 0; this.maxPrefetch = maxPrefetch;
    this.gen = 0;                    // geração: invalida tudo que ficou pendente (A2)
    this.url = null; this.settle = null; this.cur = null; this.raf = 0;
    this.held = false;               // true SÓ quando o usuário pausou (diferente de 'o elemento ainda não começou a tocar')
    this.onChange = null;            // chamado quando ativo/pausado muda (ícone ▶/⏸)
    this.el.addEventListener("ended", () => this._end("ended"));
  }

  get active() { return !!this.settle; }
  get paused() { return this.active && this.held; }
  get timeMs() { return this.el.currentTime * 1000; }
  get durationMs() { return (this.el.duration || 0) * 1000; }
  setRate(r) { this.el.playbackRate = r; }

  // ---- carregar (A3) ----
  load(key, loader) {
    let p = this.clips.get(key);
    if (!p) {
      p = Promise.resolve().then(loader).catch(e => { this.clips.delete(key); throw e; });
      this.clips.set(key, p);
    }
    return p;
  }
  prefetch(items) {                  // items: [{key, loader}] — baixa prioridade, no máximo maxPrefetch ao mesmo tempo
    for (const it of items) if (!this.clips.has(it.key)) this.queue.push(it);
    this._pump();
  }
  clearPrefetch() { this.queue.length = 0; }
  _pump() {
    while (this.busy < this.maxPrefetch && this.queue.length) {
      const it = this.queue.shift();
      if (this.clips.has(it.key)) continue;   // um clique já pediu: não repete
      this.busy++;
      this.load(it.key, it.loader).catch(() => {}).finally(() => { this.busy--; this._pump(); });
    }
  }

  // ---- tocar ----
  // Resolve com "ended" | "range" | "cancelled". Rejeita só em falha real (ex.: autoplay bloqueado).
  play(clip, { from = 0, to = null, rate = 1, onTick = null } = {}) {
    this.stop();                                     // A1 + A2
    this.held = false;
    const gen = this.gen, el = this.el;
    return new Promise((resolve, reject) => {
      this.settle = { resolve, reject };
      this.cur = { to, onTick };
      this.onChange?.();
      (async () => {
        if (this.url !== clip.url) { this.url = clip.url; el.src = clip.url; await once(el, "loadedmetadata"); }
        if (gen !== this.gen) return;
        el.playbackRate = rate; el.currentTime = from / 1000;
        if (this.held) { this.onChange?.(); return; }   // pausou durante a troca de clipe: fica posicionado e mudo; resume() toca
        await el.play();
        if (gen !== this.gen || this.held) return;
        this.onChange?.();
        this._watch(gen);
      })().catch(e => {
        if (gen !== this.gen) return;                  // stop() ou outro play() já assumiu: nada a fazer
        if (e.name === "AbortError") { this.onChange?.(); return; }   // pause() chegou com o play() ainda pendente: é PAUSA, não cancelamento (resume() continua)
        this._end(e, true);
      });
    });
  }
  _watch(gen) {                                       // acompanha o relógio do áudio: realce de palavra e fim de trecho
    const loop = () => {
      if (gen !== this.gen || this.el.paused) return;
      const t = this.timeMs, { to, onTick } = this.cur;
      onTick?.(t);
      if (to !== null && t >= to) { this.el.pause(); return this._end("range"); }
      this.raf = this.schedule(loop);
    };
    loop();
  }
  pause() { if (this.active && !this.held) { this.held = true; this.el.pause(); this.unschedule(this.raf); this.onChange?.(); } }
  async resume() {
    if (!this.paused) return;
    const gen = this.gen; this.held = false; this.onChange?.();
    try { await this.el.play(); }
    catch (e) { if (e.name === "AbortError" || gen !== this.gen) { this.onChange?.(); return; } throw e; }   // pausar/parar logo após retomar não é erro (A4)
    if (gen !== this.gen || this.held) return;
    this.onChange?.(); this._watch(gen);
  }
  stop() {
    this.gen++; this.unschedule(this.raf); this.el.pause();
    this._end("cancelled");
  }
  _end(result, isError = false) {
    this.unschedule(this.raf);
    const s = this.settle; this.settle = null; this.cur = null; this.held = false;
    if (s) { isError ? s.reject(result) : s.resolve(result); this.onChange?.(); }
  }
}
