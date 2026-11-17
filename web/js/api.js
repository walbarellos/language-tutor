// Todas as chamadas ao servidor local num lugar só. Cada função devolve o JSON já validado (erro do servidor vira exceção).
const unwrap = async r => { const j = await r.json(); if (j.error) throw new Error(j.error); return j; };
const post = (url, body) => fetch(url, { method: "POST", body: JSON.stringify(body) }).then(unwrap);
const get = url => fetch(url).then(unwrap);
const q = encodeURIComponent;

export const api = {
  tts: (text, voice, rate = "+0%") => post("/tts", { text, voice, rate }),
  reading: words => post("/api/reading", { words }),
  freq: (lang, words) => post("/api/freq", { lang, words }),
  detect: (texts, cands) => post("/api/detect", { texts, cands }),
  translate: (text, src, dst = "pt-BR") => post("/translate", { text, src, dst }),
  word: (w, lang) => get(`/api/word?w=${q(w)}&lang=${lang}`),
  cognate: (w, lang) => get(`/api/cognate?w=${q(w)}&lang=${lang}`),
  cards: () => get("/api/cards"),
  saveCards: cards => post("/api/cards", { cards }),
  progress: () => get("/api/progress"),
  saveProgress: progress => post("/api/progress", { progress }),
  trilha: lang => get(`/api/trilha?lang=${lang}`),
  asr: (blob, lang) => fetch(`/api/asr?lang=${lang}`, { method: "POST", body: blob }).then(unwrap),
};
