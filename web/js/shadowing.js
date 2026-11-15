// Shadowing: o Whisper local transcreve o que você disse; comparar com o texto mede se você foi ENTENDIDO, não o sotaque.
import { $, E, warn, ic, lab } from "./util.js";
import { dock } from "./dock.js";
import { diffWord, bestHeard, hintIt } from "./diff.js";
import { api } from "./api.js";
import { app } from "./state.js";

// Distância de edição letra a letra (puro, testável): funciona sem espaços (japonês) e tolera pequenas variações de grafia.
export function scoreTokens(tokens, heard, { ja = false, heardHira = null } = {}) {
  const nk = s => (ja ? s : s.normalize("NFD").replace(/\p{M}/gu, "")).toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");   // japonês mantém o dakuten (か ≠ が)
  const T = [], own = [];
  tokens.forEach((t, i) => { for (const c of nk(ja && t.hira ? t.hira : t.text)) { T.push(c); own.push(i); } });
  const R = [...nk(ja && heardHira ? heardHira : heard)]; if (!T.length) return null;
  const n = T.length, m = R.length, D = Array.from({ length: n + 1 }, (_, i) => { const r = new Int32Array(m + 1); r[0] = i; return r; });
  for (let j = 1; j <= m; j++) D[0][j] = j;
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) D[i][j] = Math.min(D[i - 1][j] + 1, D[i][j - 1] + 1, D[i - 1][j - 1] + (T[i - 1] === R[j - 1] ? 0 : 1));
  const ok = new Array(n).fill(false); let i = n, j = m;
  while (i > 0 && j > 0) {
    const eq = T[i - 1] === R[j - 1];
    if (D[i][j] === D[i - 1][j - 1] + (eq ? 0 : 1)) { if (eq) ok[i - 1] = true; i--; j--; } else if (D[i][j] === D[i - 1][j] + 1) i--; else j--;
  }
  const hit = new Array(tokens.length).fill(0), tot = new Array(tokens.length).fill(0);
  own.forEach((o, k) => { tot[o]++; if (ok[k]) hit[o]++; });
  return { pct: Math.round(100 * ok.filter(Boolean).length / n), frac: tokens.map((_, k) => tot[k] ? hit[k] / tot[k] : null) };
}

// 85%: tolera 1 letra errada em palavras de 7+ letras (ruído da transcrição); abaixo de 50% a palavra não foi entendida.
// Cada estado tem cor, traço do sublinhado E ícone: não depende só de cor (daltonismo).
const SH = { ok: ["sh-ok", "check", "Certo"], mid: ["sh-mid", "near", "Quase"], bad: ["sh-bad", "x", "Não entendi"] };
const kind = f => (f >= .85 ? "ok" : f >= .5 ? "mid" : "bad");
function paint(tokens, frac) {
  tokens.forEach((t, k) => {
    t.el.classList.remove("sh-ok", "sh-mid", "sh-bad"); t.el.querySelector(":scope > .sb")?.remove();
    const f = frac[k]; if (f === null) return;
    const c = SH[kind(f)]; t.el.classList.add(c[0]); t.el.title = c[2] + " · " + Math.round(f * 100) + "%";
    t.el.insertAdjacentHTML("beforeend", `<i class="sb ${c[0]}">${ic(c[1])}</i>`);
  });
}
async function score(seg, heard) {
  const ja = seg.lang === "ja"; let heardHira = null;
  if (ja) { try { heardHira = (await api.reading([heard])).reads[heard].hira; } catch {} }   // compara em hiragana: kanji vs kana não conta como erro
  const r = scoreTokens(seg.tokens, heard, { ja, heardHira }); if (r) paint(seg.tokens, r.frac); return r;
}
function resBox(seg) { if (!seg.sh) { seg.sh = E("div", "", "sh"); seg.sh.onclick = e => e.stopPropagation(); seg.el.append(seg.sh); } seg.sh.textContent = ""; return seg.sh; }

// Anel de nota (SVG) + contagem por estado + palavras para treinar + ações.
function ring(pct) {
  const C = 163.4, d = document.createElement("div"); d.className = "ring " + (pct >= 80 ? "ok" : pct >= 60 ? "mid" : "bad");
  d.innerHTML = `<svg viewBox="0 0 64 64" aria-hidden="true"><circle class="t" cx="32" cy="32" r="26"/><circle class="v" cx="32" cy="32" r="26" style="stroke-dashoffset:${C}"/></svg><b>${pct}%</b>`;
  requestAnimationFrame(() => requestAnimationFrame(() => { const v = d.querySelector(".v"); if (v) v.style.strokeDashoffset = C * (1 - pct / 100); }));
  return d;
}
function chips(frac) {
  const n = { ok: 0, mid: 0, bad: 0 }; frac.forEach(f => { if (f !== null) n[kind(f)]++; });
  const w = E("div", "", "chips");
  for (const k of ["ok", "mid", "bad"]) if (n[k]) w.insertAdjacentHTML("beforeend", `<span class="chip ${SH[k][0]}">${ic(SH[k][1])}${n[k]} ${SH[k][2].toLowerCase()}</span>`);
  return w;
}
function letters(arr) { const w = E("span", "", "ltr"); arr.forEach(x => w.append(E("span", x.c, "l-" + x.op))); return w; }
function fixList(seg, frac, heard) {
  const idx = [], si = app.segs.indexOf(seg); frac.forEach((f, k) => { if (f !== null && f < .85) idx.push(k); });
  if (!idx.length) return null;
  const w = E("div", "", "fix"), det = E("div", "", "fixd"); det.hidden = true; w.append(E("span", "Para treinar:", "fix-t"));
  const words = seg.tokens.map(t => t.text); let open = -1;
  idx.slice(0, 6).forEach(k => {
    const t = seg.tokens[k], b = E("button", "", "b fixb " + SH[kind(frac[k])][0]); lab(b, "spk", t.text);
    b.onclick = () => {
      app.player.playWord(si, t);
      if (open === k) { open = -1; det.hidden = true; return; }
      open = k; det.hidden = false; det.textContent = "";
      const h = bestHeard(k, words, heard), d = h ? diffWord(t.text, h) : null, hint = seg.lang === "it" ? hintIt(t.text, h) : "";
      const r1 = E("div", "", "fd-row"), r2 = E("div", "", "fd-row");
      r1.append(E("span", "esperado", "fd-k"), letters(d ? d.exp : [...t.text].map(c => ({ c, op: "del" }))));
      r2.append(E("span", "ouvido", "fd-k"), d ? letters(d.got) : E("span", "não apareceu", "fd-none"));
      det.append(r1, r2); if (hint) det.append(E("div", hint, "fd-hint"));
    };
    w.append(b);
  });
  w.append(det); return w;
}

export function updateStreakUI() {
  const sn = $("#stkNum"), xn = $("#xpNum"), sb = $("#stkBadge");
  if (!sn || !xn) return;
  sn.textContent = (app.streak || 0) + "x";
  xn.textContent = "+" + (app.xp || 0) + " XP";
  if (sb) {
    sb.dataset.active = (app.streak || 0) > 0;
    if (app.streak >= 3) sb.classList.add("stk-hot"); else sb.classList.remove("stk-hot");
  }
}

// Transcreve, pontua e mostra o resultado embaixo da frase. Devolve {pct,text} (ou null se não entendeu nada).
export async function analyze(seg, blob) {
  seg.mine = URL.createObjectURL(blob); dock.manual("analyze");
  const wait = resBox(seg); wait.insertAdjacentHTML("beforeend", '<i class="spin"></i> '); wait.append("Analisando… (na 1ª vez o modelo é baixado, ~500 MB)");
  let text = "", res = null;
  try { text = (await api.asr(blob, seg.lang)).text.trim(); res = text ? await score(seg, text) : null; } catch (e) { warn(e); }
  if (!dock.locked) dock.hide();
  const b = resBox(seg), row = E("div", "", "res");
  if (res) {
    const tier = res.pct === 100 ? { r: "DIAMANTE", c: "tier-dia", msg: "Pronúncia impecável!" }
               : res.pct >= 90 ? { r: "OURO", c: "tier-gold", msg: "Excelente dicção e ritmo!" }
               : res.pct >= 80 ? { r: "PRATA", c: "tier-silv", msg: "Muito bem compreendido!" }
               : res.pct >= 50 ? { r: "BRONZE", c: "tier-brz", msg: "Bom caminho. Revise os pontos marcados." }
               : { r: "FOCO", c: "tier-foc", msg: "Ouça devagar e tente de novo." };
    if (res.pct >= 80) {
      app.streak = (app.streak || 0) + 1;
      app.xp = (app.xp || 0) + (res.pct === 100 ? 100 : res.pct >= 90 ? 70 : 50);
      seg.el?.classList.add("mastered");
    } else {
      app.streak = 0;
      seg.el?.classList.remove("mastered");
    }
    updateStreakUI();
    const info = E("div", "", "res-info");
    const head = E("div", "", "res-head");
    head.append(E("span", "Acerto: " + res.pct + "%"), E("span", tier.r, "tier-badge " + tier.c));
    info.append(head, E("div", tier.msg, "tier-msg"), chips(res.frac), E("div", "Entendi: “" + text + "”", "res-heard"));
    row.append(ring(res.pct), info);
  } else {
    app.streak = 0; updateStreakUI();
    row.append(E("div", text ? "Entendi: “" + text + "”" : "Não entendi nada. Tente de novo, mais perto do microfone.", "res-heard"));
  }
  b.append(row);
  const fx = res && fixList(seg, res.frac, text); if (fx) b.append(fx);
  const acts = E("div", "", "res-btns");
  const o = E("button", "", "b"); lab(o, "spk", "Original"); o.onclick = () => app.player.speak(seg.text, seg.lang);
  const m = E("button", "", "b"); lab(m, "play", "Minha voz"); m.onclick = () => app.player.playUrl(seg.mine);
  const r = E("button", "", "b"); lab(r, "redo", "Tentar de novo"); r.onclick = () => { app.player.select(app.segs.indexOf(seg)); $("#bRec").click(); };
  acts.append(o, m, r); b.append(acts);
  return text ? { pct: res ? res.pct : null, text } : null;
}

// Botão Gravar manual: grava a frase ATIVA até você parar (ou 30 s).
export function initRecButton() {
  const btn = $("#bRec"); let on = false;
  const paintBtn = () => { btn.setAttribute("aria-pressed", on); lab(btn, on ? "stop" : "mic", on ? "Parar" : "Gravar"); };
  btn.onclick = async () => {
    if (on) return app.recorder.stopNow("manual");
    app.trainer?.stop(); app.player.stop();
    try { await app.recorder.open(); }
    catch (e) { return warn(new Error(e.name === "NotAllowedError" ? "Microfone bloqueado: libere nas permissões do navegador." : "Microfone indisponível: " + e.message)); }
    const seg = app.segs[app.player.i]; on = true; paintBtn(); dock.manual("rec");
    const { blob, reason } = await app.recorder.record({ vad: false, maxMs: 30000, lang: seg?.lang || app.study });
    on = false; paintBtn(); app.recorder.close();
    if (reason !== "closed") await analyze(seg, blob); else if (!dock.locked) dock.hide();
  };
}
