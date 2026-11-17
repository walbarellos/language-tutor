// Painel de feedback ao vivo: diz, com ícone, texto e medidor, o que o app faz AGORA
// (carregando, ouvindo o original, esperando você falar, ouvindo você, encerrando, analisando).
// Só desenha. Quem decide os estados é o Player (modo livre) ou o Trainer (modo treino, via `locked`).
import { $, ic } from "./util.js";
import { app } from "./state.js";

const BARS = 32, REC = new Set(["wait", "voice", "end", "rec"]);
const TXT = {
  load: ["spin", "Carregando áudio…"], play: ["spk", "Ouvindo o original"], slow: ["ear", "Ouvindo devagar"], pause: ["pause", "Pausado"],
  wait: ["mic", "Sua vez: fale a frase"], voice: ["mic", "Ouvindo você"], end: ["mic", "Terminou? Encerrando…"],
  rec: ["mic", "Gravando: toque em Parar quando acabar"], analyze: ["spin", "Comparando com o original…"],
  gap: ["chat", "Repita em voz alta"], silent: ["mic", "Não ouvi nada. Vamos de novo."],
};
const mmss = ms => { const s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };

export const dock = {
  locked: false,   // true durante o Modo Treino: só o Trainer manda no painel
  mode: "", el: null, onRec: null, noteFn: null, bars: [], hist: new Array(BARS).fill(0),

  _build() {
    const el = this.el = $("#dock"); if (!el || el.dataset.ok) return !!el; el.dataset.ok = "1";
    el.innerHTML = '<div class="d-ico"></div><div class="d-main"><div class="d-title"></div>' +
      '<div class="d-bars"></div><div class="d-live"></div><div class="d-note"></div><div class="d-track"><b></b></div></div>' +
      '<div class="d-side"><span class="d-time"></span><svg class="d-ring" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><circle class="v" cx="12" cy="12" r="10"/></svg></div>';
    for (let i = 0; i < BARS; i++) $(".d-bars", el).append(document.createElement("i"));
    this.bars = [...$(".d-bars", el).children]; return true;
  },
  set(mode, { ms = 0 } = {}) {
    if (!this._build()) return;
    const t = TXT[mode]; if (!t) return this.hide();
    const wasRec = REC.has(this.mode);
    if (wasRec && !REC.has(mode)) this.onRec?.(false);
    this.mode = mode; this.el.hidden = false; this.el.dataset.mode = mode;
    $(".d-ico", this.el).innerHTML = t[0] === "spin" ? '<i class="spin"></i>' : ic(t[0]);
    $(".d-title", this.el).textContent = t[1];
    if (REC.has(mode) && !wasRec) { this.hist.fill(0); this.t0 = performance.now(); this._bars(); $(".d-note", this.el).textContent = this.noteFn?.() || ""; this.live(""); this.onRec?.(true); }
    const tr = $(".d-track b", this.el); tr.style.transition = "none"; tr.style.width = "0";
    if (mode === "gap" && ms) { void tr.offsetWidth; tr.style.transition = `width ${ms}ms linear`; tr.style.width = "100%"; }
    $(".d-time", this.el).textContent = "";
    this._seg(mode);
  },
  live(t) { const e = this.el && $(".d-live", this.el); if (e) e.textContent = t ? "Ouvi: " + t : ""; },
  hide() { if (!this.el) return; if (REC.has(this.mode)) this.onRec?.(false); this.mode = ""; this.el.hidden = true; this._seg(""); },
  _seg(mode) {
    const st = REC.has(mode) ? "rec" : mode === "analyze" ? "ana" : mode === "play" || mode === "slow" ? "play" : "";
    app.segs.forEach((s, n) => { if (n === app.player?.i && st) s.el.dataset.st = st; else delete s.el.dataset.st; });
  },
  _bars() { this.bars.forEach((b, i) => { const v = this.hist[i]; b.style.height = 6 + v * 94 + "%"; b.style.opacity = 0.35 + v * 0.65; }); },

  // vindo do Recorder (a cada ~50 ms)
  level(l) {
    if (!this.el || !REC.has(this.mode)) return;
    this.hist.shift(); this.hist.push(Math.min(1, l.rms / (l.thr * 6))); this._bars();
    const m = !l.vad ? (l.voice ? "voice" : "rec") : !l.spoke ? "wait" : l.prog > 0.3 && !l.voice ? "end" : "voice";
    if (m !== this.mode) { this.mode = m; this.el.dataset.mode = m; $(".d-title", this.el).textContent = TXT[m][1]; }
    $(".d-time", this.el).textContent = mmss(l.ms);
    $(".d-ring .v", this.el).style.strokeDashoffset = 62.8 * (1 - l.prog);
  },
  // vindo do Player enquanto o áudio toca
  progress(ms, dur) {
    if (!this.el || (this.mode !== "play" && this.mode !== "slow")) return;
    $(".d-track b", this.el).style.width = (dur ? Math.min(100, ms / dur * 100) : 0) + "%";
    $(".d-time", this.el).textContent = mmss(ms) + " / " + mmss(dur);
  },
  // estado do Player (livre). Ignorado no Modo Treino e enquanto você grava/analisa manualmente.
  fromPlayer(state, info) {
    if (this.locked) return;
    if (state === "idle") { if (!REC.has(this.mode) && this.mode !== "analyze") this.hide(); return; }
    if (REC.has(this.mode) || this.mode === "analyze") return;
    if (state !== this.mode) this.set(state, info);
  },
  // gravação/análise manual (botão Gravar)
  manual(mode) { if (!this.locked) this.set(mode); },
};
