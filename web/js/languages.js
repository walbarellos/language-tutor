import { norm } from "./util.js";

// Dicionário mínimo de demonstração (o produto usa Wiktionary). [forma moderna, época, sentido]
export const DICT = {sanza:["senza","arcaico","sem"],doppo:["dopo","arcaico","depois"],arebbe:["avrebbe","arcaico","teria"],egli:["egli","literário","ele"],
  converso:["e converso","latinismo","e vice-versa"],dua:["due","florentino antigo","dois"],de:["dei","arcaico","contração de di + i (dos)"],
  nasce:["nascere","moderno","nasce, surge: nasce da questo una disputa = daí surge uma disputa"],meglio:["meglio","moderno","melhor"],
  accozzarli:["accozzare","raro","juntá-los, combiná-los à força"],mancare:["mancare","moderno","faltar; mancare dell’uno = ficar sem um dos dois"],
  vorrebbe:["volere","moderno","condicional: gostaria; si vorrebbe = seria desejável"],temuto:["temere","moderno","temido"],amato:["amare","moderno","amado"],
  sicuro:["sicuro","moderno","seguro"],principato:["principato","moderno","principado"],arme:["arma","moderno","armas"],disputa:["disputa","moderno","disputa, questão"]};

export class Language {
  constructor(code, voice) { this.code = code; this.voice = voice; }
  tokenize(text) { // Intl.Segmenter serve também para japonês (sem espaços)
    return [...new Intl.Segmenter(this.code, { granularity: "word" }).segment(text)].filter(s => s.isWordLike).map(s => ({ text: s.segment, start: s.index }));
  }
  annotate(t) { return t; }
}
class Italian extends Language { annotate(t) { const e = DICT[norm(t.text)]; if (e) Object.assign(t, { lemma: e[0], era: e[1], gloss: e[2] }); return t; } }
class Portuguese extends Language {}
class Japanese extends Language { get reads() { return true; } }   // idiomas com leitura própria (furigana/romaji)

// Para somar um idioma: uma linha aqui (código wordfreq/Intl, nome, vozes; confirme com: edge-tts --list-voices)
export const STUDYL = {it:{n:"Italiano",v:[["it-IT-IsabellaNeural","Isabella"],["it-IT-ElsaNeural","Elsa"],["it-IT-DiegoNeural","Diego"]]},
  es:{n:"Español",v:[["es-ES-ElviraNeural","Elvira"],["es-ES-AlvaroNeural","Álvaro"]]},
  fr:{n:"Français",v:[["fr-FR-DeniseNeural","Denise"],["fr-FR-HenriNeural","Henri"]]},
  en:{n:"English",v:[["en-US-AriaNeural","Aria"],["en-US-GuyNeural","Guy"]]},
  de:{n:"Deutsch",v:[["de-DE-KatjaNeural","Katja"],["de-DE-ConradNeural","Conrad"]]},
  ja:{n:"日本語",v:[["ja-JP-NanamiNeural","Nanami"],["ja-JP-KeitaNeural","Keita"]]},
  he:{n:"עברית",v:[["he-IL-HilaNeural","Hila"],["he-IL-AvriNeural","Avri"]],rtl:1},
  ar:{n:"العربية",v:[["ar-SA-ZariyahNeural","Zariyah"],["ar-SA-HamedNeural","Hamed"]],rtl:1}};
export const NONLATIN = new Set(["ja", "he", "ar"]);
export const LANGS = { pt: new Portuguese("pt", "pt-BR-FranciscaNeural") };
for (const c in STUDYL) LANGS[c] = new ({ it: Italian, ja: Japanese }[c] || Language)(c, STUDYL[c].v[0][0]);
