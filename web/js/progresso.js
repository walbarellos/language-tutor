// Progresso e recompensas (lógica pura, sem DOM: testável). Regras explícitas e previsíveis:
//  - só ganha XP, nunca perde (errar não pune: a sequência zera, o resto fica);
//  - cada bônus tem nome e valor visíveis para quem joga;
//  - "dominada" = acertou a palavra 3 vezes com ≥70% de acerto nas tentativas.
import { norm } from "./util.js";

export const need = L => 50 * L;                            // XP para ir do nível L ao L+1
export const level = xp => { let L = 1, r = xp; while (r >= need(L)) { r -= need(L); L++; } return { level: L, into: r, need: need(L) }; };
export const fresh = () => ({ v: 1, xp: 0, goal: 50, days: {}, best: {}, words: {}, patterns: {}, streak: { cur: 0, best: 0 }, ach: {}, heard: { day: "", keys: [] }, listens: 0, attempts: 0, passes: 0 });
export const dayKey = (d = new Date()) => new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
export const wid = (lang, text) => lang + "|" + norm(text);
export const isMastered = (s, id) => { const r = s.words[id]; return !!r && r.ok >= 3 && r.ok / r.tries >= 0.7; };
export const masteredCount = s => Object.keys(s.words).filter(id => isMastered(s, id)).length;

export const ACH = [
  { id: "first", name: "Primeira fala", desc: "Gravar a primeira tentativa", icon: "mic", ok: s => s.attempts >= 1 },
  { id: "pass", name: "Entendido", desc: "Passar de 80% em uma frase", icon: "check", ok: s => s.passes >= 1 },
  { id: "p95", name: "Quase nativo", desc: "Chegar a 95% em uma frase", icon: "star", ok: s => Object.values(s.best).some(v => v >= 95) },
  { id: "st5", name: "Sequência de 5", desc: "5 frases seguidas acima de 80%", icon: "target", ok: s => s.streak.best >= 5 },
  { id: "w10", name: "10 palavras dominadas", desc: "Dominar 10 palavras", icon: "done", ok: s => masteredCount(s) >= 10 },
  { id: "w50", name: "50 palavras dominadas", desc: "Dominar 50 palavras", icon: "done", ok: s => masteredCount(s) >= 50 },
  { id: "ear", name: "Ouvido treinado", desc: "Ouvir 20 frases até o fim", icon: "ear", ok: s => s.listens >= 20 },
  { id: "d3", name: "Três dias", desc: "Estudar em 3 dias diferentes", icon: "clock", ok: s => Object.keys(s.days).length >= 3 },
  { id: "lv5", name: "Nível 5", desc: "Chegar ao nível 5", icon: "star", ok: s => level(s.xp).level >= 5 },
];

function add(s, parts, day, label, xp) { if (xp > 0) { parts.push({ label, xp }); s.xp += xp; s.days[day] = (s.days[day] || 0) + xp; } }
function unlock(s, day) { const out = []; for (const a of ACH) if (!s.ach[a.id] && a.ok(s)) { s.ach[a.id] = day; out.push(a); } return out; }

// words: [{text, lang, frac|null}] · pats: ids de padrões de erro das palavras fracas
export function record(s, { key, pct, words, pats = [], day = dayKey() }) {
  const parts = [], lv0 = level(s.xp).level; s.attempts++;
  add(s, parts, day, "tentativa", 5);
  const pass = pct >= 80; if (pass) { s.passes++; add(s, parts, day, "aprovado", 10); }
  const prev = s.best[key]; let delta = null;
  if (prev !== undefined && pct > prev) { delta = pct - prev; add(s, parts, day, "novo recorde", Math.min(15, delta)); }
  if (prev === undefined || pct > prev) s.best[key] = pct;
  s.streak.cur = pass ? s.streak.cur + 1 : 0; s.streak.best = Math.max(s.streak.best, s.streak.cur);
  if (pass && s.streak.cur % 5 === 0) add(s, parts, day, "sequência de " + s.streak.cur, 10);
  const mastered = [];
  for (const w of words) {
    if (w.frac === null) continue;
    const id = wid(w.lang, w.text), r = s.words[id] || (s.words[id] = { ok: 0, tries: 0 }); r.tries++;
    if (w.frac >= 0.85) { r.ok++; if (r.ok === 3 && r.ok / r.tries >= 0.7) mastered.push(w.text); }
  }
  if (mastered.length) add(s, parts, day, mastered.length === 1 ? "palavra dominada" : mastered.length + " palavras dominadas", 5 * mastered.length);
  pats.forEach(p => { s.patterns[p] = (s.patterns[p] || 0) + 1; });
  const lv1 = level(s.xp).level;
  return { gain: parts.reduce((a, p) => a + p.xp, 0), parts, prev: prev ?? null, delta, mastered, ach: unlock(s, day), streak: s.streak.cur, lvUp: lv1 > lv0 ? lv1 : 0, today: s.days[day] || 0 };
}
// Ouvir a frase inteira vale 2 XP, uma vez por frase por dia (não dá para "farmar").
export function listen(s, { key, day = dayKey() }) {
  if (s.heard.day !== day) s.heard = { day, keys: [] };
  if (s.heard.keys.includes(key)) return null;
  s.heard.keys.push(key); s.listens++; const parts = []; add(s, parts, day, "ouviu a frase", 2);
  return { gain: 2, ach: unlock(s, day), today: s.days[day] || 0 };
}
export const mastery = (s, words) => { const ids = words.filter(w => w.lang !== "pt").map(w => wid(w.lang, w.text)); return { n: ids.filter(id => isMastered(s, id)).length, total: ids.length }; };
export const topPatterns = s => Object.entries(s.patterns).sort((a, b) => b[1] - a[1]);
export function heat(s, n = 28, now = new Date()) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = dayKey(new Date(now - i * 864e5)), x = s.days[d] || 0;
    out.push({ day: d, xp: x, lv: !x ? 0 : x < s.goal / 2 ? 1 : x < s.goal ? 2 : x < s.goal * 2 ? 3 : 4 });
  }
  return out;
}
const KEY = "lt.prog2";
export function loadState(store = globalThis.localStorage) { try { return { ...fresh(), ...(JSON.parse(store.getItem(KEY)) || {}) }; } catch { return fresh(); } }
export function saveState(s, store = globalThis.localStorage) { try { store.setItem(KEY, JSON.stringify(s)); } catch { /* sem storage: vale até recarregar */ } }
