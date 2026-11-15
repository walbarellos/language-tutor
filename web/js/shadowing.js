// Shadowing: o Whisper local transcreve o que você disse; comparar com o texto mede se você foi ENTENDIDO, não o sotaque.
import { $, E, warn } from "./util.js";
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

// 85%: tolera 1 letra errada em palavras de 7+ letras (ruído da transcrição); abaixo de 50% a palavra não foi entendida
function paint(tokens, frac) {
  tokens.forEach((t, k) => {
    t.el.classList.remove("sh-ok", "sh-mid", "sh-bad"); const f = frac[k]; if (f === null) return;
    t.el.classList.add(f >= .85 ? "sh-ok" : f >= .5 ? "sh-mid" : "sh-bad"); t.el.title = Math.round(f * 100) + "% reconhecido";
  });
}
async function score(seg, heard) {
  const ja = seg.lang === "ja"; let heardHira = null;
  if (ja) { try { heardHira = (await api.reading([heard])).reads[heard].hira; } catch {} }   // compara em hiragana: kanji vs kana não conta como erro
  const r = scoreTokens(seg.tokens, heard, { ja, heardHira }); if (r) paint(seg.tokens, r.frac); return r;
}
function resBox(seg) { if (!seg.sh) { seg.sh = E("div", "", "sh"); seg.sh.onclick = e => e.stopPropagation(); seg.el.append(seg.sh); } seg.sh.textContent = ""; return seg.sh; }

// Transcreve, pontua e mostra o resultado embaixo da frase. Devolve {pct,text} (ou null se não entendeu nada).
export async function analyze(seg, blob) {
  seg.mine = URL.createObjectURL(blob); resBox(seg).append("Analisando… (na 1ª vez o modelo é baixado, ~500 MB)");
  let text = "", res = null;
  try { text = (await api.asr(blob, seg.lang)).text.trim(); res = text ? await score(seg, text) : null; } catch (e) { warn(e); }
  const b = resBox(seg);
  b.append(E("div", res ? "Acerto: " + res.pct + "%  ·  Entendi: “" + text + "”" : text ? "Entendi: “" + text + "”" : "Não entendi nada. Tente de novo, mais perto do microfone."));
  const o = E("button", "🔊 Original", "b"); o.onclick = () => app.player.speak(seg.text, seg.lang);
  const m = E("button", "▶ Minha voz", "b"); m.onclick = () => app.player.playUrl(seg.mine);
  b.append(o, " ", m);
  return text ? { pct: res ? res.pct : null, text } : null;
}

// Botão Gravar manual: grava a frase ATIVA até você parar (ou 30 s).
export function initRecButton() {
  const btn = $("#bRec"); let on = false;
  const paintBtn = () => { btn.setAttribute("aria-pressed", on); btn.textContent = on ? "⏹ Parar" : "🎙 Gravar"; };
  btn.onclick = async () => {
    if (on) return app.recorder.stopNow("manual");
    app.trainer?.stop(); app.player.stop();
    try { await app.recorder.open(); }
    catch (e) { return warn(new Error(e.name === "NotAllowedError" ? "Microfone bloqueado: libere nas permissões do navegador." : "Microfone indisponível: " + e.message)); }
    const seg = app.segs[app.player.i]; on = true; paintBtn();
    const { blob, reason } = await app.recorder.record({ vad: false, maxMs: 30000 });
    on = false; paintBtn(); app.recorder.close();
    if (reason !== "closed") await analyze(seg, blob);
  };
}
