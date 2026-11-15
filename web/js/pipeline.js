// Pipeline: cada etapa recebe o documento e devolve o documento.
import { LANGS, NONLATIN } from "./languages.js";
import { api } from "./api.js";
import { warn } from "./util.js";
import { app } from "./state.js";

class Stage { async run(d) { return d; } }
class Split extends Stage { async run(d) { d.segs = d.raw.split(/\n+/).flatMap(l => l.split(/(?<=[.!?;:])\s+(?=[A-ZÀ-Ý"“\[])/)).map(s => s.trim()).filter(Boolean).map(text => ({ text })); return d; } }

const IT = new Set("il lo gli che non per con una questo quello come più ma egli sanza senza doppo dopo essere amato temuto nasce da disputa meglio rispondo si vorrebbe perché difficile accozzarli insieme molto sicuro quando abbia mancare dua nessuno principato è proprie arme converso del della nel sono".split(" "));
const PT = new Set("o os as que não para com uma um isso este você como mais mas está sem então palavra significa forma antiga vamos ler trecho capítulo repare escreve em vez de erro época florentina do da no na dos das é melhor".split(" "));

class Detect extends Stage {
  async run(d) {
    const auto = [], study = app.study;
    d.segs.forEach((s, i) => {
      const m = s.text.match(/^\[([a-z]{2})\]\s*/i);   // [xx] no começo da frase força o idioma
      if (m && LANGS[m[1].toLowerCase()]) { s.lang = m[1].toLowerCase(); s.text = s.text.slice(m[0].length); }
      else if (NONLATIN.has(study) && /[֐-ۿ぀-ヿ一-鿿]/.test(s.text)) s.lang = study;   // escrita própria identifica o idioma
      else auto.push(i);
    });
    if (auto.length) {
      const tx = auto.map(i => d.segs[i].text); let langs;
      try { langs = (await api.detect(tx, ["pt", study])).langs; }
      catch (e) { if (/wordfreq/.test(e.message)) warn(e); langs = this.fallback(tx, study); }
      auto.forEach((i, n) => d.segs[i].lang = langs[n]);
    }
    return d;
  }
  fallback(texts, study) {   // sem wordfreq: escrita não latina = estudo; italiano usa listas de palavras
    let prev = "pt";
    return texts.map(t => {
      if (/[^\u0000-ɏ\s\p{P}\d]/u.test(t)) return prev = study;
      if (study !== "it") return prev = "pt";
      let a = 0, b = 0;
      for (const w of (t.toLowerCase().match(/[\p{L}’']+/gu) || []).map(x => x.replace(/’/g, "'"))) { IT.has(w) && a++; PT.has(w) && b++; }
      if (/[ãõç]/i.test(t)) b += 2; if (/[èòì]/.test(t)) a += 2;
      return prev = a > b ? "it" : b > a ? "pt" : prev;
    });
  }
}
class Tokenize extends Stage { async run(d) { d.segs.forEach(s => s.tokens = LANGS[s.lang].tokenize(s.text)); return d; } }
class Annotate extends Stage { async run(d) { d.segs.forEach(s => s.tokens.forEach(t => LANGS[s.lang].annotate(t))); return d; } }
class Reading extends Stage {
  async run(d) {
    const by = {};
    d.segs.forEach(s => { if (LANGS[s.lang].reads) s.tokens.forEach(t => (by[s.lang] = by[s.lang] || new Set()).add(t.text)); });
    for (const l in by) {
      try { const { reads } = await api.reading([...by[l]]); d.segs.forEach(s => { if (s.lang === l) s.tokens.forEach(t => Object.assign(t, reads[t.text] || {})); }); }
      catch (e) { warn(e); }
    }
    return d;
  }
}
class Pipeline { constructor(...st) { this.st = st; } async run(d) { for (const s of this.st) d = await s.run(d); return d; } }

export const textPipeline = () => new Pipeline(new Split(), new Detect(), new Tokenize(), new Annotate(), new Reading());
export const sitPipeline = () => new Pipeline(new Tokenize(), new Annotate(), new Reading());   // frases da trilha já vêm prontas: pula Split/Detect
