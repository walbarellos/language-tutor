// Trilha por situação: cenas curtas do dia a dia, em frases completas. Dados em trilhas/<idioma>.json (tradução revisada à mão).
import { $, E, norm, warn, lab, ic } from "./util.js";
import { api } from "./api.js";
import { app } from "./state.js";
import { STUDYL } from "./languages.js";
import { sitPipeline } from "./pipeline.js";
import { setSegs } from "./session.js";
import { addCards, hasCard } from "./srs.js";

const saveProg = () => api.saveProgress(app.prog).catch(() => {});
export function markHeard(i, isWord) {            // situação concluída = ouviu todas as frases
  const s = app.sit; if (!s || isWord) return;
  s.heard.add(i);
  if (s.heard.size === app.segs.length) { (app.prog[s.lang] = app.prog[s.lang] || {})[s.id] = true; saveProg(); }
}

export async function openTrail() {
  const box = $("#trl"); box.textContent = "Carregando…"; if (!$("#dTrl").open) $("#dTrl").showModal();
  try {
    const j = await api.trilha(app.study);
    box.textContent = ""; box.append(E("h2", "Trilha: " + STUDYL[app.study].n));
    if (!j.situacoes.length) { box.append(E("p", "Ainda não há trilha para este idioma. Crie trilhas/" + app.study + ".json usando it.json como modelo.")); return; }
    let ult = 0;
    const nomes = {
      1: "Nível 1 · Sobrevivência com Atrito",
      2: "Nível 2 · Conexão Social, Gírias & Hesitação",
      3: "Nível 3 · Debate, Filosofia & Pensamento Crítico",
      4: "Nível 4 · Registros & Expressões Idiomáticas"
    };
    j.situacoes.forEach(s => {
      if (s.nivel && s.nivel !== ult) {
        ult = s.nivel;
        box.append(E("h3", nomes[s.nivel] || ("Nível " + s.nivel)));
      }
      const b = E("button", "", "b"); if ((app.prog[app.study] || {})[s.id]) b.insertAdjacentHTML("afterbegin", ic("done")); b.append(s.titulo); b.style.cssText = "display:block;width:100%;text-align:left;margin:6px 0";
      const sm = E("small", s.objetivo + " · " + s.linhas.length + " frases"); sm.style.display = "block"; b.append(sm);
      b.onclick = () => { $("#dTrl").close(); loadSit(s); }; box.append(b);
    });
  } catch (e) { box.textContent = ""; warn(e); }
}

export async function loadSit(s) {
  app.trainer?.stop(); app.player.stop();
  app.sit = { id: s.id, titulo: s.titulo, objetivo: s.objetivo, lang: app.study, heard: new Set() };
  const d = await sitPipeline().run({ segs: s.linhas.map(l => ({ text: l.t, lang: app.study, tr: l.p, who: l.q, nuance: l.nuance })) });
  setSegs(d.segs);
  const b = E("div", "", "sitb"); b.append(E("h2", app.sit.titulo), E("p", app.sit.objetivo + " Ative “Tradução” para ver o português e nuances."));
  if (s.cultural_note) {
    const note = E("div", "", "sit-note");
    note.innerHTML = `<b>💡 Contexto Cultural:</b> ${s.cultural_note}`;
    b.append(note);
  }
  const k = E("button", "", "b"); lab(k, "star", "Guardar todas as frases");
  k.onclick = () => {
    const novos = app.segs.map(g => ({ id: "frase|" + g.lang + "|" + norm(g.text), lang: g.lang, word: g.text, lemma: "", gloss: g.tr || "", era: "", sentence: g.text, start: 0, due: Date.now(), interval: 0, ease: 2.5, reps: 0 })).filter(c => !hasCard(c.id));
    addCards(novos); lab(k, "done", novos.length + " frases guardadas");
  };
  const tr = E("button", "", "b"); lab(tr, "target", "Treinar esta situação"); tr.onclick = () => app.trainer.start(0);
  const nx = E("button", "Outras situações", "b"); nx.onclick = openTrail;
  b.append(k, " ", tr, " ", nx); $("#page").prepend(b);
}
