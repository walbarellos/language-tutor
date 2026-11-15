// Ponte entre "texto + voz" e o AudioController: chave estável, carregador e alinhamento palavra↔tempo.
import { api } from "./api.js";

export const clipKey = (text, voice) => voice + "|" + text;   // a velocidade NÃO entra: o navegador muda a velocidade

export const loaderFor = (text, voice) => async () => {
  const j = await api.tts(text, voice);
  const bin = atob(j.audio), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return { url: URL.createObjectURL(new Blob([u8], { type: "audio/mpeg" })), words: j.words };
};

// Alinha pela POSIÇÃO no texto, não pela igualdade das palavras: funciona mesmo quando a voz e o segmentador dividem diferente (japonês)
export function align(tokens, bw, text) {
  let pos = 0;
  for (const b of bw) {
    const at = text.indexOf(b.text, pos); if (at < 0) continue;
    pos = at + b.text.length;
    const t = tokens.find(x => at >= x.start && at < x.start + x.text.length) || tokens.find(x => x.start >= at);
    if (t && t.t0 === undefined) Object.assign(t, { t0: b.t, t1: b.t + b.d });
  }
}

// Realinha só quando a voz mudou (os tempos dependem da voz).
export function alignSeg(seg, clip, key) {
  if (seg.alignKey === key) return;
  seg.tokens.forEach(t => { delete t.t0; delete t.t1; });
  align(seg.tokens, clip.words, seg.text);
  seg.alignKey = key;
}
