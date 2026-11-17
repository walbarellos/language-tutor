// Transcrição ao vivo enquanto você fala (Web Speech API; só prévia). A nota final vem do Whisper.
// Cores provisórias: verde = bateu, âmbar = quase, vermelho = diferente. Só pinta até onde você já chegou.
import { app } from "./state.js";
import { dock } from "./dock.js";
import { scoreTokens } from "./shadowing.js";

const LANG = { it: "it-IT", en: "en-US", es: "es-ES", fr: "fr-FR", de: "de-DE", pt: "pt-BR" };
let rec = null, cur = null;
export const supported = () => !!(window.SpeechRecognition || window.webkitSpeechRecognition);
const clear = seg => seg?.tokens.forEach(t => t.el.classList.remove("lv-ok", "lv-mid", "lv-bad"));

export function paint(seg, text) {
  const heard = text.split(/\s+/).filter(Boolean).length, r = scoreTokens(seg.tokens, text, { ja: false });
  seg.tokens.forEach((t, k) => {
    t.el.classList.remove("lv-ok", "lv-mid", "lv-bad");
    const f = r && r.frac[k]; if (f === null || f === undefined || k > heard) return;
    t.el.classList.add(f >= .85 ? "lv-ok" : f >= .5 ? "lv-mid" : "lv-bad");
  });
}
export function start(seg) {
  stop(); const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR || !seg || seg.lang === "ja" || !LANG[seg.lang]) return;
  cur = seg;
  try {
    rec = new SR(); rec.lang = LANG[seg.lang]; rec.continuous = true; rec.interimResults = true;
    rec.onresult = e => { const t = [...e.results].map(r => r[0].transcript).join(" ").trim(); dock.live(t); paint(seg, t); };
    rec.onerror = () => {}; rec.start();
  } catch { rec = null; }
}
export function stop() { try { rec?.abort(); } catch {} rec = null; clear(cur); dock.live(""); cur = null; }
