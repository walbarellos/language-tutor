// Carregar conteúdo na tela (texto colado ou situação da trilha) e buscar traduções.
import { app } from "./state.js";
import { api } from "./api.js";
import { warn } from "./util.js";
import { textPipeline } from "./pipeline.js";
import { renderSegs, applyRead, applyEar } from "./render.js";
import { loadFreq } from "./freq.js";
import { showWord } from "./wordpanel.js";
import { markMastery } from "./recompensa.js";
import { trapsOf } from "./diff.js";
function markTraps(segs) { segs.forEach(s => s.lang === "it" && s.tokens.forEach(t => { const id = trapsOf(t.text); if (id) t.el.dataset.trap = id; })); }

const handlers = {
  onSeg: i => { app.trainer?.stop(); app.player.play(i); },
  onWord: (seg, t, i) => { app.trainer?.stop(); showWord(seg, t, i); },
  onReveal: s => { s.rev = !s.rev; applyEar(); },
};
export function setSegs(segs) {
  app.segs = segs; renderSegs(segs, handlers); app.player.setSegs(segs);
  applyRead(); applyEar(); loadFreq(); markMastery(); markTraps(segs);
}
export async function load(text) {
  app.trainer?.stop(); app.player.stop(); app.sit = null;
  const d = await textPipeline().run({ raw: text });
  d.segs.forEach(s => {
    if (s.text.startsWith("Nasce da questo")) {
      s.tr = "Surge disso uma disputa: se é melhor ser amado do que temido, ou o inverso.";
      s.nuance = "“S’egli è meglio” significa “se é melhor”. “O e converso” significa “ou o contrário”.";
    } else if (s.text.startsWith("Rispondo che")) {
      s.tr = "Respondo que se desejaria ser um e outro; mas porque é difícil conciliá-los, é muito mais seguro ser temido do que amado, quando falte um dos dois.";
      s.nuance = "“Accozzarli insieme” significa “juntá-los / conciliá-los”. “Mancare dell’uno de’ dua” é o florentino clássico para “faltar um dos dois”.";
    }
  });
  setSegs(d.segs); if (app.tr) fetchTr();
}
export async function fetchTr() {
  for (const s of app.segs) {
    if (!app.tr) return; if (s.lang === "pt" || s.tr) continue;
    try { s.tr = (await api.translate(s.text, s.lang)).text; s.trEl.textContent = s.tr; }
    catch (e) { warn(e); return; }   // para no primeiro erro: não adianta insistir sem internet
  }
}
