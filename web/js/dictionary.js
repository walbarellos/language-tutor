// Wiktionary (via servidor, com cache em disco) e cognatos.
import { api } from "./api.js";
import { norm } from "./util.js";

const WK = {}, CG = {};
export function wiki(w, l) {
  const k = l + norm(w);
  return WK[k] || (WK[k] = api.word(w, l).then(j => j.entries).catch(e => { delete WK[k]; throw e; }));
}
export function cog(w, l) {
  if (!/^[\p{Script=Latin}'’-]+$/u.test(w)) return Promise.resolve([]);
  const k = l + norm(w);
  return CG[k] || (CG[k] = api.cognate(w, l).then(j => j.similar).catch(() => { delete CG[k]; return []; }));
}
export function fill(box, entries) {
  box.textContent = "";
  const h3 = document.createElement("h3"); h3.textContent = "WIKTIONARY (INGLÊS)"; box.append(h3);
  if (!entries.length) { box.append("Sem definição no Wiktionary para esta forma."); return; }
  entries.forEach(e => {
    const b = document.createElement("b"); b.textContent = e.pos; const ol = document.createElement("ol");
    e.defs.forEach(d => { const li = document.createElement("li"); li.textContent = d; ol.append(li); });
    box.append(b, ol);
  });
}
