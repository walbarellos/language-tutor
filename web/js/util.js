// Utilidades pequenas, sem estado e sem DOM no topo do módulo (assim os testes importam sem navegador).
export const $ = (s, root = document) => root.querySelector(s);
export const norm = s => s.toLowerCase().replace(/[^\p{L}]/gu, "");
export const E = (tag, text, cls) => { const e = document.createElement(tag); if (text) e.textContent = text; if (cls) e.className = cls; return e; };
export const sleep = ms => new Promise(r => setTimeout(r, ms));

let toastTimer = 0;
export function warn(e) {
  if (e && (e.name === "AbortError")) return;        // cancelar não é erro (A4)
  const m = $("#msg"); if (!m) return console.warn(e);
  const txt = e && e.message ? e.message : String(e);
  m.textContent = /fetch|NetworkError|Unexpected/i.test(txt) ? "Servidor local não responde. Rode leitor_local.py." : txt;
  m.style.display = "block"; clearTimeout(toastTimer); toastTimer = setTimeout(() => m.style.display = "none", 5000);
}
