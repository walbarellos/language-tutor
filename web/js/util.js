// Utilidades pequenas, sem estado e sem DOM no topo do módulo (assim os testes importam sem navegador).
export const $ = (s, root = document) => root.querySelector(s);
export const norm = s => s.toLowerCase().replace(/[^\p{L}]/gu, "");
export const E = (tag, text, cls) => { const e = document.createElement(tag); if (text) e.textContent = text; if (cls) e.className = cls; return e; };
// Ícones SVG (traço, herdam a cor do texto). Sem emojis: o desenho é o mesmo em qualquer sistema.
const P = {
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  spk: '<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
  play: '<path d="M7 4l13 8-13 8V4z"/>', pause: '<path d="M8 5v14M16 5v14"/>', stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  check: '<path d="M5 12l5 5 9-10"/>', near: '<path d="M3 12c3-5 6-5 9 0s6 5 9 0"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>', dash: '<path d="M6 12h12"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><path d="M4 4l16 16"/>',
  ear: '<path d="M6 9a6 6 0 1 1 11 3c-1.5 2-3 2.5-3 5a3 3 0 0 1-5.5 1.5"/><path d="M10 9a2 2 0 0 1 4 0"/>',
  redo: '<path d="M20 12a8 8 0 1 1-3-6.2M20 4v5h-5"/>', target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/>',
  chat: '<path d="M4 5h16v11H9l-5 4V5z"/>', star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  route: '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h6a4 4 0 0 0 0-8h-4a4 4 0 0 1 0-8"/>',
  text: '<path d="M5 6h14M12 6v13M9 19h6"/>', done: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
};
export const ic = n => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${P[n] || ""}</svg>`;
export const lab = (el, n, t) => { el.innerHTML = ic(n) + "<span></span>"; el.lastChild.textContent = t; };   // botão = ícone + rótulo
export const hydrate = (root = document) => root.querySelectorAll("[data-i]").forEach(el => { if (!el.querySelector(":scope > svg.i")) el.insertAdjacentHTML("afterbegin", ic(el.dataset.i)); });
export const sleep = ms => new Promise(r => setTimeout(r, ms));

let toastTimer = 0;
export function warn(e) {
  if (e && (e.name === "AbortError")) return;        // cancelar não é erro (A4)
  const m = $("#msg"); if (!m) return console.warn(e);
  const txt = e && e.message ? e.message : String(e);
  m.textContent = /fetch|NetworkError|Unexpected/i.test(txt) ? "Servidor local não responde. Rode leitor_local.py." : txt;
  m.style.display = "block"; clearTimeout(toastTimer); toastTimer = setTimeout(() => m.style.display = "none", 5000);
}
