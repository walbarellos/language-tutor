// Prosódia (lógica pura, sem DOM): ritmo, pausas, clareza e entonação (curva de altura da voz).
// Entonação = curva de F0 (autocorrelação) em semitones, comparada com a do áudio original por correlação.
import { diffWord } from "./diff.js";
const nk = s => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

export function down(x, sr, target = 16000) {
  const f = Math.max(1, Math.floor(sr / target)); if (f === 1) return { x, sr };
  const n = Math.floor(x.length / f), y = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < f; j++) s += x[i * f + j]; y[i] = s / f; }
  return { x: y, sr: sr / f };
}
// F0 por quadro (Hz; 0 = sem voz). Escolhe o MENOR lag com pico forte, para não cair uma oitava.
export function f0Contour(x0, sr0, { hop = 0.02, win = 0.04, fmin = 70, fmax = 450 } = {}) {
  const { x, sr } = down(x0, sr0), W = Math.round(win * sr), H = Math.round(hop * sr), lmin = Math.floor(sr / fmax), lmax = Math.ceil(sr / fmin);
  const E = []; let mx = 0;
  for (let i = 0; i + W + lmax + 1 <= x.length; i += H) { let e = 0; for (let j = 0; j < W; j++) e += x[i + j] * x[i + j]; E.push(e); if (e > mx) mx = e; }
  const f = E.map((e, k) => {
    if (e <= mx * 0.02) return 0;
    const i = k * H, r = new Float32Array(lmax + 2); let best = 0;
    for (let l = lmin - 1; l <= lmax + 1; l++) { let s = 0; for (let j = 0; j < W; j++) s += x[i + j] * x[i + j + l]; r[l] = s; if (l >= lmin && l <= lmax && s > best) best = s; }
    if (best / e < 0.5) return 0;
    for (let l = lmin; l <= lmax; l++) if (r[l] >= best * 0.9 && r[l] >= r[l - 1] && r[l] >= r[l + 1]) return sr / l;
    return 0;
  });
  return { f, hop };
}
export const spanMs = c => { const v = c.f.map((f, i) => (f > 0 ? i : -1)).filter(i => i >= 0); return v.length ? (v.at(-1) - v[0] + 1) * c.hop * 1000 : 0; };

// Curva normalizada: n pontos, semitones em relação à mediana e à média (compara o FORMATO, não o tom absoluto da voz).
export function contourSig(c, n = 40) {
  const v = c.f.map((f, i) => [i, f]).filter(([, f]) => f > 0); if (v.length < 6) return null;
  const med = v.map(x => x[1]).sort((a, b) => a - b)[v.length >> 1], st = v.map(([i, f]) => [i, 12 * Math.log2(f / med)]);
  const i0 = st[0][0], i1 = st.at(-1)[0], out = []; let p = 0;
  for (let k = 0; k < n; k++) {
    const t = i0 + (i1 - i0) * k / (n - 1); while (p < st.length - 2 && st[p + 1][0] < t) p++;
    const [a, fa] = st[p], [b, fb] = st[Math.min(p + 1, st.length - 1)];
    out.push(b === a ? fa : fa + (fb - fa) * Math.max(0, Math.min(1, (t - a) / (b - a))));
  }
  const m = out.reduce((x, y) => x + y, 0) / n; return out.map(y => y - m);
}
export function compare(a, b) {
  const n = Math.min(a.length, b.length); let sa = 0, sb = 0, aa = 0, bb = 0, ab = 0;
  for (let i = 0; i < n; i++) { sa += a[i]; sb += b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; ab += a[i] * b[i]; }
  const num = ab - sa * sb / n, den = Math.sqrt((aa - sa * sa / n) * (bb - sb * sb / n)); return den > 1e-9 ? num / den : 0;
}
export function endTrend(sig) {
  const q = Math.max(2, Math.floor(sig.length / 4)), m = a => a.reduce((x, y) => x + y, 0) / a.length;
  const d = m(sig.slice(-q)) - m(sig.slice(-2 * q, -q)); return d > 1.5 ? "sobe" : d < -1.5 ? "desce" : "plana";
}
export const similarityLabel = r => r >= 0.6 ? ["Parecida com o original", "ok"] : r >= 0.3 ? ["Diferente em partes", "warn"] : ["Bem diferente do original", "bad"];

// Ritmo: sua fala (do 1º ao último som) dividida pela do original. <1 = mais rápido que o original.
export function rhythm({ words, spanMs: fb, refMs }) {
  const userMs = words?.length ? (words.at(-1).e - words[0].s) * 1000 : fb;
  if (!userMs || !refMs) return null;
  const ratio = userMs / refMs;
  const [label, tone] = ratio < 0.7 ? ["Rápido demais", "bad"] : ratio < 0.88 ? ["Um pouco rápido", "warn"] : ratio <= 1.15 ? ["No ritmo", "ok"] : ratio <= 1.4 ? ["Um pouco lento", "warn"] : ["Lento demais", "bad"];
  return { ratio, label, tone, userMs, refMs };
}
// Liga cada palavra esperada à palavra ouvida (em ordem, tolerando 1 letra a cada 4). null = não achada.
export function matchWords(tokens, uw) {
  let cur = 0;
  return tokens.map(t => {
    const w = nk(t.text); if (!w) return null;
    for (let j = cur; j < Math.min(uw.length, cur + 3); j++) { const x = nk(uw[j].w); if (x && diffWord(w, x).dist <= Math.max(1, Math.floor(w.length / 4))) { cur = j + 1; return uw[j]; } }
    return null;
  });
}
export const unclear = (tokens, m, thr = 0.5) => tokens.map((t, k) => (m[k] && m[k].p < thr ? k : -1)).filter(k => k >= 0);
// Pausa longa: >450 ms entre duas palavras seguidas e pelo menos 300 ms além do original.
export function pauses(tokens, m) {
  const out = [];
  for (let k = 0; k + 1 < tokens.length; k++) {
    if (!m[k] || !m[k + 1]) continue;
    const u = (m[k + 1].s - m[k].e) * 1000, r = tokens[k + 1].t0 !== undefined && tokens[k].t1 !== undefined ? tokens[k + 1].t0 - tokens[k].t1 : 0;
    if (u > 450 && u - r > 300) out.push({ after: k, ms: Math.round(u) });
  }
  return out;
}
