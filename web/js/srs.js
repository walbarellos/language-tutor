// Cartões guardados + revisão espaçada. Scheduler é o contrato; SM2 é a 1ª implementação (FSRS entra depois como outra subclasse).
import { $, E, norm, warn } from "./util.js";
import { api } from "./api.js";
import { app } from "./state.js";

export class Scheduler { next(c, q) { throw new Error("implementar"); } }
export class SM2 extends Scheduler { // q: 0 errei, 1 difícil, 2 bom, 3 fácil
  next(c, q) {
    let { ease = 2.5, interval = 0, reps = 0 } = c;   // 2.5 = facilidade inicial padrão do SuperMemo-2
    if (q === 0) { reps = 0; interval = 0; ease = Math.max(1.3, ease - .2); }   // 1.3 = piso do SM-2
    else { reps++; interval = reps === 1 ? 1 : reps === 2 ? 6 : Math.round(interval * ease * (q === 1 ? .8 : q === 3 ? 1.3 : 1)); ease = Math.max(1.3, ease + (q === 1 ? -.15 : q === 3 ? .15 : 0)); }
    return { ease, interval, reps };
  }
}
const SCH = new SM2();
export let CARDS = [];
let Q = [], RV = false;
export const dueList = () => CARDS.filter(c => c.due <= Date.now()).sort((a, b) => a.due - b.due);
export const count = () => { $("#bRev").textContent = "Revisar (" + dueList().length + ")"; };
export const saveCards = () => api.saveCards(CARDS).catch(warn);
export const addCards = list => { CARDS.push(...list); saveCards(); count(); };
export const hasCard = id => CARDS.some(c => c.id === id);

export function saveBtn(seg, t) {
  const id = seg.lang + "|" + norm(t.text), b = E("button", "", "b"), on = () => hasCard(id);
  const paint = () => { b.textContent = on() ? "★ Guardada" : "☆ Guardar para revisar"; b.setAttribute("aria-pressed", on()); };
  b.onclick = () => {
    if (on()) { CARDS = CARDS.filter(c => c.id !== id); saveCards(); count(); }
    else addCards([{ id, lang: seg.lang, word: t.text, lemma: t.lemma || (t.kanji ? t.hira : ""), gloss: t.gloss || "", era: t.era || "", sentence: seg.text, start: t.start, due: Date.now(), interval: 0, ease: 2.5, reps: 0 }]);
    paint();
  };
  paint(); return b;
}

const fmt = n => n === 0 ? "10 min" : n + " d";
function grade(q) { const c = Q.shift(), n = SCH.next(c, q); Object.assign(c, n); c.due = Date.now() + (n.interval === 0 ? 6e5 : n.interval * 864e5); if (n.interval === 0) Q.push(c); saveCards(); count(); rvShow(false); }
function rvShow(back) {
  RV = back; const r = $("#rv"); r.textContent = "";
  if (!Q.length) { r.append(E("p", "Nada para revisar agora. Guarde palavras clicando nelas no texto.")); const x = E("button", "Exportar para o Anki (.tsv)", "b"); x.onclick = exportTsv; r.append(x); return; }
  const c = Q[0]; r.append(E("p", Q.length + " para revisar", "tag"));
  const p = E("p", "", "sent"); p.append(c.sentence.slice(0, c.start), E("mark", c.word), c.sentence.slice(c.start + c.word.length)); r.append(p);
  const h = E("button", "🔊 Ouvir a frase", "b"); h.onclick = () => app.player.speak(c.sentence, c.lang); r.append(h);
  if (!back) { const m = E("button", "Mostrar resposta", "b"); m.onclick = () => rvShow(true); m.autofocus = true; r.append(" ", m); return; }
  r.append(E("h2", c.lemma || c.word)); if (c.era) r.append(E("span", c.era, "era")); r.append(E("p", c.gloss || "Sem sentido salvo: veja o dicionário no painel da palavra."));
  const g = E("div", "", "grades");
  ["Errei", "Difícil", "Bom", "Fácil"].forEach((nm, q) => { const b = E("button", (q + 1) + " " + nm, "b"); b.append(E("small", fmt(SCH.next(c, q).interval))); b.onclick = () => grade(q); g.append(b); });
  r.append(g); g.children[2].focus();   // foco em "Bom", a resposta mais comum
}
function exportTsv() {
  const t = x => String(x).replace(/[\t\n]/g, " ");
  const rows = CARDS.map(c => t(c.sentence) + "\t" + t(c.word + " → " + (c.lemma || c.word) + (c.gloss ? ": " + c.gloss : "")));
  const a = E("a"); a.href = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/tab-separated-values" })); a.download = "palavras-anki.tsv"; a.click();
}
export function initSrs() {
  api.cards().then(j => { CARDS = j.cards || []; count(); }).catch(() => {});
  $("#bRev").onclick = () => { app.trainer?.stop(); app.player.stop(); Q = dueList(); $("#dRev").showModal(); rvShow(false); };
  $("#rvX").onclick = () => $("#dRev").close();
  addEventListener("keydown", e => { if (RV && $("#dRev").open && "1234".includes(e.key)) grade(+e.key - 1); });   // no documento: o foco se perde quando a tela é redesenhada
}
