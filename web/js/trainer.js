// Modo Treino: máquina de estados que conduz a prática sozinha, frase a frase, sem você apertar nada.
//   ouvir devagar → ouvir normal → falar (grava e para sozinho) → nota → (≥ aprovação) próxima | senão tenta de novo
//
// Invariantes (spec — tests/trainer.test.mjs):
//   R1  Parar o treino (ou iniciar outra coisa) cancela TUDO: áudio, gravação e esperas; nada continua "em segundo plano".
//   R2  Sem microfone o treino não quebra: vira "ouvir + pausa para repetir" (modo mudo).
//   R3  Cada frase tem no máximo `retries` novas tentativas; depois segue em frente (não prende você).
export const CFG = { pass: 80, retries: 2, slow: 0.75, gapFactor: 1.3, pauseOk: 900, pauseBad: 1200 };

export class Trainer {
  // player: once(i,{rate}) / stop() / segs / speed / i      recorder: open/close/record/stopNow
  // score: async (seg, blob) => {pct,text}|null              view: { step(name, info), on(bool) }
  constructor({ player, recorder, score, view, cfg = {} }) {
    Object.assign(this, { player, recorder, score, view }); this.cfg = { ...CFG, ...cfg };
    this.tk = 0; this.on = false; this.mic = false; this.sleepCancel = null;
  }

  async start(from = this.player.i) {
    this.stop(true);
    const tk = ++this.tk; this.on = true; this.view.on(true);
    try { await this.recorder.open(); this.mic = true; } catch { this.mic = false; this.view.step("nomic"); }   // R2
    if (tk !== this.tk) { this.recorder.close(); return; }          // parou enquanto o navegador pedia o microfone
    for (let n = from; n < this.player.segs.length && tk === this.tk; n++) { if (!(await this._sentence(n, tk))) break; }
    if (tk === this.tk) this._finish("done");
  }
  stop(silent = false) {
    this.tk++; this.sleepCancel?.(); this.recorder.stopNow("closed"); this.player.stop();
    if (this.on) { this.on = false; this.recorder.close(); this.view.on(false); if (!silent) this.view.step("stopped"); }   // R1
  }
  _finish(step) { this.on = false; this.recorder.close(); this.view.on(false); this.view.step(step); }
  _nap(ms) { return new Promise(res => { const t = setTimeout(res, ms); this.sleepCancel = () => { clearTimeout(t); res(); }; }); }

  async _sentence(n, tk) {
    const { player, cfg } = this, seg = player.segs[n], alive = () => tk === this.tk;
    this.view.step("sentence", { n, total: player.segs.length });
    for (let tries = 0; tries <= cfg.retries; tries++) {              // R3
      if (tries === 0 && player.speed > cfg.slow) {
        this.view.step("slow");   if ((await player.once(n, { rate: cfg.slow })) === "cancelled" || !alive()) return false;
      }
      this.view.step("normal");   if ((await player.once(n, { rate: player.speed })) === "cancelled" || !alive()) return false;
      if (!this.mic) {                                                  // R2: pausa do tamanho da frase e segue
        const ms = player.audio.durationMs / player.speed * cfg.gapFactor;
        this.view.step("gap", { ms }); await this._nap(ms); return alive();
      }
      this.view.step("speak");
      let rec;
      try { rec = await this.recorder.record({ vad: true, maxMs: Math.max(35000, player.audio.durationMs * 4) }); }
      catch { this.mic = false; continue; }
      if (!alive()) return false;
      if (rec.reason === "stop-nospeech") { this.view.step("silent"); await this._nap(700); if (!alive()) return false; continue; }
      this.view.step("analyze");
      let res = null; try { res = await this.score(seg, rec.blob); } catch { /* erro já mostrado por quem pontua */ }
      if (!alive()) return false;
      this.view.step("result", { pct: res?.pct ?? null, text: res?.text ?? "", pass: !!res && res.pct >= cfg.pass });
      if (res && res.pct >= cfg.pass) { await this._nap(cfg.pauseOk); return alive(); }
      await this._nap(cfg.pauseBad); if (!alive()) return false;
    }
    return alive();
  }
}
