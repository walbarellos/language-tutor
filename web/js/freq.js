// Frequência das palavras (servidor, wordfreq). Faixas: até 1000 = essencial; até 3000 = alta frequência (Paul Nation: ~3000 palavras formam o núcleo do uso comum).
import { api } from "./api.js";
import { app } from "./state.js";
import { warn } from "./util.js";

export async function loadFreq() {
  const by = {};
  app.segs.forEach(s => { if (s.lang !== "pt") s.tokens.forEach(t => (by[s.lang] = by[s.lang] || new Set()).add(t.text.toLowerCase())); });
  for (const l in by) {
    try {
      const { ranks } = await api.freq(l, [...by[l]]);
      app.segs.forEach(s => {
        if (s.lang !== l) return;
        s.tokens.forEach(t => { const k = ranks[t.text.toLowerCase()] || 0; t.rank = k; t.el.classList.toggle("f1", k > 0 && k <= 1000); t.el.classList.toggle("f2", k > 1000 && k <= 3000); t.el.title = k ? "Frequência nº " + k : ""; });
      });
    } catch (e) { if (/wordfreq/.test(e.message)) warn(e); return; }
  }
}
