// Cartão "Prosódia" no resultado: ritmo, pausas, clareza das palavras e curva de entonação (você × original).
import { E, ic } from "./util.js";
import { app } from "./state.js";
import * as X from "./prosodia.js";

async function decode(blob) {
  const C = window.AudioContext || window.webkitAudioContext, c = new C();
  try { const b = await c.decodeAudioData(await blob.arrayBuffer()); return { x: b.getChannelData(0), sr: b.sampleRate }; } finally { c.close?.(); }
}
const row = (k, ...kids) => { const r = E("div", "", "pr-row"); r.append(E("span", k, "pr-k")); const v = E("div", "", "pr-v"); v.append(...kids); r.append(v); return r; };
const tag = (text, tone) => E("b", text, "pr-tag " + tone);

export async function fillProsody(box, seg, blob, words) {
  const si = app.segs.indexOf(seg), clip = await app.player.clipFor(seg);
  const [u, r] = await Promise.all([decode(blob), decode(await (await fetch(clip.url)).blob())]);
  const cu = X.f0Contour(u.x, u.sr), cr = X.f0Contour(r.x, r.sr), su = X.contourSig(cu), sr = X.contourSig(cr);
  const a = seg.tokens.find(t => t.t0 !== undefined), z = [...seg.tokens].reverse().find(t => t.t1 !== undefined);
  const rh = X.rhythm({ words, spanMs: X.spanMs(cu), refMs: a && z ? z.t1 - a.t0 : X.spanMs(cr) });
  box.textContent = ""; box.append(E("div", "Prosódia", "pr-h"));

  if (rh) {
    const m = E("div", "", "meter2"), pos = Math.max(0, Math.min(1, (rh.ratio - 0.5) / 1.1)) * 100;
    m.innerHTML = '<i class="zone"></i><i class="mk" style="left:' + pos + '%"></i>';
    const info = E("div", rh.ratio.toFixed(2).replace(".", ",") + "× do tempo do original", "pr-s");
    box.append(row("Ritmo", tag(rh.label, rh.tone), m, info));
  }
  if (su && sr) {
    const c = X.compare(su, sr), [lab, tone] = X.similarityLabel(c), eu = X.endTrend(su), er = X.endTrend(sr), mx = Math.max(...su.map(Math.abs), ...sr.map(Math.abs), 3);
    const path = s => s.map((v, k) => (k ? "L" : "M") + (k / (s.length - 1) * 300).toFixed(1) + "," + (40 - v / mx * 34).toFixed(1)).join("");
    const g = E("div", "", "curves"); g.innerHTML = '<svg viewBox="0 0 300 80" preserveAspectRatio="none" aria-label="Curva de entonação"><path class="ref" d="' + path(sr) + '"/><path class="usr" d="' + path(su) + '"/></svg><div class="lg"><span class="lr">original</span><span class="lu">você</span></div>';
    const fin = eu === er ? "Final igual: " + eu + "." : "Você termina " + (eu === "sobe" ? "subindo" : eu === "desce" ? "descendo" : "plano") + "; o original " + (er === "sobe" ? "sobe" : er === "desce" ? "desce" : "fica plano") + ".";
    box.append(row("Entonação", tag(lab + " (" + Math.round(Math.max(0, c) * 100) + "%)", tone), g, E("div", fin, "pr-s")));
  } else box.append(row("Entonação", E("span", "Pouca voz contínua para medir a curva.", "pr-s")));

  if (words?.length) {
    const m = X.matchWords(seg.tokens, words), un = X.unclear(seg.tokens, m), ps = X.pauses(seg.tokens, m), kids = [];
    un.forEach(k => { const b = E("button", "", "b fixb sh-mid"); b.innerHTML = ic("spk"); b.append(seg.tokens[k].text + " (" + Math.round(m[k].p * 100) + "%)"); b.onclick = () => app.player.playWord(si, seg.tokens[k]); kids.push(b); });
    ps.slice(0, 3).forEach(p => kids.push(E("span", "pausa de " + (p.ms / 1000).toFixed(1).replace(".", ",") + " s depois de “" + seg.tokens[p.after].text + "”", "rw-chip")));
    box.append(row("Clareza", ...(kids.length ? kids : [tag("Sem palavras pouco claras nem pausas longas", "ok")])));
  }
}
