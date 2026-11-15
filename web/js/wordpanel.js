// Painel lateral da palavra: significado, frequência, cognatos, Wiktionary e "ouvir de novo".
import { E, lab } from "./util.js";
import { app } from "./state.js";
import { saveBtn } from "./srs.js";
import { wiki, cog, fill } from "./dictionary.js";

export function showWord(seg, t, i) {
  const p = document.querySelector("#pw"); p.innerHTML = "";
  const h = document.createElement("h2"); h.textContent = t.text; p.append(h);
  const d = document.createElement("div");
  if (t.era) { p.append(E("span", t.era, "era")); d.textContent = "Forma moderna: " + t.lemma + ". Sentido: " + t.gloss + "."; }
  else d.textContent = seg.lang !== "pt" ? "Sem entrada no dicionário do protótipo." : "Palavra em português.";
  p.append(d);
  if (seg.lang !== "pt") p.append(saveBtn(seg, t));
  if (seg.lang === "ja" && t.hira) p.append(E("p", "Leitura: " + t.hira + " (" + t.romaji + ")"));
  if (seg.lang !== "pt") {
    if (t.rank !== undefined) p.append(E("p", t.rank ? "Frequência: nº " + t.rank + (t.rank <= 1000 ? " (essencial)" : t.rank <= 3000 ? " (alta frequência)" : "") : "Frequência: fora das 50 mil mais comuns"));
    cog(t.text, seg.lang).then(c => { if (c.length) p.append(E("p", "Parece com: " + c.map(z => z.word + " (" + z.lang + ")").join(", ") + ". Pode ser falso amigo, confira.")); }).catch(() => {});
    const box = E("div", "Buscando no Wiktionary…", "wk"); p.append(box);
    wiki(t.text, seg.lang).then(r => fill(box, r)).catch(() => { box.textContent = "Wiktionary indisponível agora (precisa de internet na primeira consulta)."; });
  }
  const again = E("button", "", "b"); lab(again, "spk", "Ouvir de novo"); again.onclick = () => app.player.playWord(i, t); p.append(again);
  app.player.playWord(i, t);   // toca a palavra e devolve ao fluxo: a frase ativa passa a ser esta
}
