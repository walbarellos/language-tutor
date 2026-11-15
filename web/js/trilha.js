// Trilha por situação: cenas curtas do dia a dia, em frases completas. Dados em trilhas/<idioma>.json (tradução revisada à mão).
import { $, E, norm, warn } from "./util.js";
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
    j.situacoes.forEach(s => {
      if (s.nivel && s.nivel !== ult) { ult = s.nivel; box.append(E("h3", "Nível " + s.nivel + (s.nivel === 1 ? " · sobrevivência" : s.nivel === 2 ? " · conversa" : ""))); }
      const b = E("button", ((app.prog[app.study] || {})[s.id] ? "✓ " : "") + s.titulo, "b"); b.style.cssText = "display:block;width:100%;text-align:left;margin:6px 0";
      const sm = E("small", s.objetivo + " · " + s.linhas.length + " frases"); sm.style.display = "block"; b.append(sm);
      b.onclick = () => { $("#dTrl").close(); loadSit(s); }; box.append(b);
    });
  } catch (e) { box.textContent = ""; warn(e); }
}

export async function loadSit(s) {
  app.trainer?.stop(); app.player.stop();
  app.sit = { id: s.id, titulo: s.titulo, objetivo: s.objetivo, lang: app.study, heard: new Set() };
  const d = await sitPipeline().run({ segs: s.linhas.map(l => ({ text: l.t, lang: app.study, tr: l.p, who: l.q })) });
  setSegs(d.segs);
  const b = E("div", "", "sitb"); b.append(E("h2", app.sit.titulo), E("p", app.sit.objetivo + " Ative “Tradução” para ver o português."));
  const k = E("button", "★ Guardar todas as frases", "b");
  k.onclick = () => {
    const novos = app.segs.map(g => ({ id: "frase|" + g.lang + "|" + norm(g.text), lang: g.lang, word: g.text, lemma: "", gloss: g.tr || "", era: "", sentence: g.text, start: 0, due: Date.now(), interval: 0, ease: 2.5, reps: 0 })).filter(c => !hasCard(c.id));
    addCards(novos); k.textContent = "★ " + novos.length + " frases guardadas";
  };
  const tr = E("button", "🎯 Treinar esta situação", "b"); tr.onclick = () => app.trainer.start(0);
  const nx = E("button", "Outras situações", "b"); nx.onclick = openTrail;
  b.append(k, " ", tr, " ", nx); $("#page").prepend(b);
}
