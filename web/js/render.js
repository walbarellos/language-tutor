// Tela: desenha as frases e expõe a "view" que o Player usa. Nenhuma regra de reprodução mora aqui.
import { $, E, warn } from "./util.js";
import { app } from "./state.js";
import { LANGS, STUDYL } from "./languages.js";

const reduce = () => matchMedia("(prefers-reduced-motion:reduce)").matches;
let lastAuto = 0;   // quando foi o último scroll feito pelo próprio app (para não confundir com o seu)

export function renderSegs(segs, { onSeg, onWord, onReveal }) {
  const pg = $("#page"); pg.innerHTML = "";
  segs.forEach((s, i) => {
    const el = E("div", "", "seg " + (s.lang === "pt" ? "pt" : "it"));
    el.dir = (STUDYL[s.lang] || {}).rtl ? "rtl" : "ltr"; el.lang = s.lang; s.el = el;
    el.append(E("span", s.who ? s.who.toUpperCase() : s.lang === "pt" ? "PORTUGUÊS" : (STUDYL[s.lang] || { n: s.lang }).n.toUpperCase(), "tag"));
    const rb = E("button", "", "b rvb"); rb.onclick = e => { e.stopPropagation(); onReveal(s); }; s.rvb = rb; if (s.lang !== "pt") el.append(rb);
    let pos = 0;
    s.tokens.forEach(t => {
      el.append(s.text.slice(pos, t.start));
      const b = E("button", "", "w" + (t.era ? " has" : ""));
      if (LANGS[s.lang].reads) { const ru = document.createElement("ruby"); ru.append(t.text); t.rt = document.createElement("rt"); ru.append(t.rt); b.append(ru); } else b.textContent = t.text;
      t.el = b; b.onclick = e => { e.stopPropagation(); onWord(s, t, i); }; el.append(b); pos = t.start + t.text.length;
    });
    el.append(s.text.slice(pos));
    const tr = E("div", s.tr || "", "tr"); s.trEl = tr; if (s.lang !== "pt") el.append(tr);
    el.onclick = () => onSeg(i);
    pg.append(el);
  });
}

// ---- contrato com o Player ----
export const view = {
  select(i, { scroll = false } = {}) {
    app.segs.forEach((s, n) => { s.el.classList.toggle("on", n === i); n === i ? s.el.setAttribute("aria-current", "true") : s.el.removeAttribute("aria-current"); });
    if (scroll && app.segs[i]) { lastAuto = Date.now(); app.segs[i].el.scrollIntoView?.({ block: "center", behavior: reduce() ? "auto" : "smooth" }); }
  },
  mark(seg, k) { seg.tokens.forEach((t, n) => t.el.classList.toggle("now", n === k)); },
  playing(on) { const b = $("#bPlay"); if (b) { b.textContent = on ? "⏸" : "▶"; b.setAttribute("aria-label", on ? "Pausar" : "Tocar"); } },
  error: warn,
};

// A frase ativa acompanha o que você está lendo: parado, role até uma frase e o ▶ parte dela.
export function followScroll(player) {
  let t = 0;
  $("main").addEventListener("scroll", () => {
    clearTimeout(t);
    t = setTimeout(() => {
      if (player.busy || Date.now() - lastAuto < 900 || !app.segs.length) return;
      const box = $("main").getBoundingClientRect(), mid = box.top + box.height / 2;
      let best = 0, bd = Infinity;
      app.segs.forEach((s, n) => { const r = s.el.getBoundingClientRect(), d = Math.abs(r.top + r.height / 2 - mid); if (d < bd) { bd = d; best = n; } });
      if (best !== player.i) player.select(best);
    }, 120);
  });
}

// ---- modos de exibição ----
// Borrado (e não escondido) mantém o tamanho da frase. inert tira as palavras do leitor de tela e do Tab.
export function applyEar() {
  const on = document.body.dataset.listen === "on";
  app.segs.forEach(s => { if (s.lang === "pt") return; s.tokens.forEach(t => t.el.inert = on && !s.rev); s.el.classList.toggle("rev", !!s.rev); s.rvb.textContent = s.rev ? "🙈 Ocultar" : "👁 Mostrar"; });
}
export function applyRead() {
  const m = document.body.dataset.read;
  $("#bRd").hidden = !app.segs.some(s => LANGS[s.lang].reads);
  $("#bRd").textContent = "Leitura: " + { none: "nenhuma", furi: "furigana", romaji: "romaji" }[m];
  app.segs.forEach(s => s.tokens.forEach(t => { if (t.rt) t.rt.textContent = m === "furi" ? (t.kanji ? t.hira : "") : m === "romaji" ? (t.romaji || "") : ""; }));
}
