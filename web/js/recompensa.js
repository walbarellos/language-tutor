// Recompensas e progresso (tela). A lógica está em progresso.js; aqui só desenha.
// Princípios: regras visíveis, só ganha (nunca perde), sem som, sem surpresa; modo Completo/Discreto/Desligado.
import { $, E, ic } from "./util.js";
import { app } from "./state.js";
import { PATTERNS, patternOf, bestHeard } from "./diff.js";
import * as P from "./progresso.js";

let S = P.loadState();
export const state = () => S;
const mode = () => document.body.dataset.rw || "full";            // full | soft | off
const save = () => P.saveState(S);

export function refreshChip() {
  const b = $("#bXp"); if (!b) return;
  const L = P.level(S.xp), today = S.days[P.dayKey()] || 0, g = Math.min(1, today / S.goal);
  $("#xpLv", b).textContent = "Nv " + L.level; $(".xpbar b", b).style.width = (L.into / L.need * 100) + "%";
  $(".goal .v", b).style.strokeDashoffset = 62.8 * (1 - g); b.classList.toggle("met", today >= S.goal);
  b.title = L.into + "/" + L.need + " XP para o nível " + (L.level + 1) + " · meta do dia " + Math.min(today, S.goal) + "/" + S.goal;
}
export function markMastery() {
  app.segs.forEach(s => s.tokens.forEach(t => t.el.classList.toggle("mast", s.lang !== "pt" && P.isMastered(S, P.wid(s.lang, t.text)))));
  const m = P.mastery(S, app.segs.flatMap(s => s.tokens.map(t => ({ lang: s.lang, text: t.text })))), el = $("#mastTxt");
  if (el) el.textContent = m.total ? "Domínio do texto: " + m.n + "/" + m.total : "";
}
const key = seg => P.wid(seg.lang, seg.text);

export function onListen(i) {
  const seg = app.segs[i]; if (!seg || seg.lang === "pt") return;
  const r = P.listen(S, { key: key(seg) }); if (!r) return; save(); refreshChip();
}

// Chamado depois de cada tentativa (manual ou Treino). Devolve o bloco de recompensa (ou null no modo Desligado).
export function onAnalysis(seg, res, heardText) {
  const si = app.segs.indexOf(seg), words = seg.tokens.map((t, k) => ({ text: t.text, lang: seg.lang, frac: res.frac[k] }));
  const wl = seg.tokens.map(t => t.text), pats = [];
  if (seg.lang === "it") res.frac.forEach((f, k) => { if (f !== null && f < .85) { const p = patternOf(wl[k], bestHeard(k, wl, heardText)); if (p) pats.push(p.id); } });
  const r = P.record(S, { key: key(seg), pct: res.pct, words, pats }); save(); refreshChip(); markMastery();
  if (mode() === "off") return null;
  const box = E("div", "", "reward");
  const top = E("div", "", "rw-top"); top.append(E("b", "+" + r.gain + " XP", "rw-gain"));
  if (r.delta) top.append(E("span", "Recorde da frase: " + r.prev + "% → " + res.pct + "% (+" + r.delta + ")", "rw-delta"));
  box.append(top);
  if (mode() === "full") {
    const pr = E("div", "", "rw-parts"); r.parts.forEach(p => pr.append(E("span", p.label + " +" + p.xp, "rw-chip"))); box.append(pr);
    r.mastered.forEach(w => box.append(banner("done", "Palavra dominada: " + w)));
    if (r.lvUp) box.append(banner("star", "Nível " + r.lvUp + " alcançado"));
    r.ach.forEach(a => box.append(banner(a.icon, "Conquista: " + a.name)));
    const meta = E("div", "", "rw-meta"); meta.textContent = "Sequência: " + r.streak + " · Meta do dia: " + Math.min(r.today, S.goal) + "/" + S.goal + (r.today >= S.goal ? " (cumprida)" : ""); box.append(meta);
    const hot = P.topPatterns(S).find(([id, n]) => n >= 3 && PATTERNS[id]);
    if (hot) {
      const pat = PATTERNS[hot[0]], ins = E("div", "", "rw-pat"); ins.append(E("span", "Padrão detectado: " + pat.name + " (" + hot[1] + "×). ", "rw-pat-t"));
      const hits = []; app.segs.forEach((g, gi) => g.tokens.forEach(t => { if (g.lang === "it" && (pat.re ? pat.re.test(t.text.toLowerCase()) : false) && hits.length < 5) hits.push([gi, t]); }));
      hits.forEach(([gi, t]) => { const b = E("button", "", "b fixb"); b.innerHTML = ic("spk"); b.append(t.text); b.onclick = () => app.player.playWord(gi, t); ins.append(b); });
      box.append(ins);
    }
  } else if (r.lvUp || r.ach.length || r.mastered.length) box.append(E("div", [r.lvUp && "Nível " + r.lvUp, ...r.ach.map(a => a.name), r.mastered.length && r.mastered.length + " dominada(s)"].filter(Boolean).join(" · "), "rw-meta"));
  return box;
}
const banner = (icon, text) => { const d = E("div", "", "rw-ban"); d.innerHTML = ic(icon); d.append(text); return d; };

// ---- painel de progresso ----
export function openProgress() {
  const box = $("#pg"); box.textContent = "";
  const L = P.level(S.xp), today = S.days[P.dayKey()] || 0;
  box.append(E("h2", "Nível " + L.level));
  const bar = E("div", "", "pbar"); bar.innerHTML = '<b style="width:' + (L.into / L.need * 100) + '%"></b>'; box.append(bar);
  box.append(E("p", L.into + "/" + L.need + " XP · regra: subir de nível custa 50 × nível. Você só ganha XP, nunca perde.", "rw-meta"));
  const stats = E("div", "", "pstats");
  [["Hoje", today + "/" + S.goal + " XP"], ["Palavras dominadas", P.masteredCount(S)], ["Melhor sequência", S.streak.best], ["Tentativas", S.attempts]].forEach(([k, v]) => { const c = E("div", "", "pstat"); c.append(E("small", k), E("b", String(v))); stats.append(c); });
  box.append(stats);
  const gl = E("label", "Meta diária (XP)"); const gi = E("input"); gi.type = "number"; gi.min = 10; gi.max = 500; gi.step = 10; gi.value = S.goal; gi.onchange = () => { S.goal = Math.max(10, Math.min(500, +gi.value || 50)); save(); refreshChip(); openProgress(); }; gl.append(gi); box.append(gl);
  box.append(E("h3", "Últimos 28 dias", "ph")); const hm = E("div", "", "heat"); P.heat(S).forEach(d => { const c = E("i", "", "h" + d.lv); c.title = d.day + ": " + d.xp + " XP"; hm.append(c); }); box.append(hm);
  const tp = P.topPatterns(S).filter(([id]) => PATTERNS[id]).slice(0, 5);
  box.append(E("h3", "Seus padrões de erro", "ph"));
  if (!tp.length) box.append(E("p", "Ainda sem dados. Grave algumas frases.", "rw-meta"));
  else { const mx = tp[0][1]; tp.forEach(([id, n]) => { const r = E("div", "", "prow"); r.append(E("span", PATTERNS[id].name), (() => { const b = E("div", "", "pbar s"); b.innerHTML = '<b style="width:' + (n / mx * 100) + '%"></b>'; return b; })(), E("span", n + "×")); box.append(r); }); }
  box.append(E("h3", "Conquistas (" + Object.keys(S.ach).length + "/" + P.ACH.length + ")", "ph"));
  const ag = E("div", "", "ach"); P.ACH.forEach(a => { const c = E("div", "", "ac" + (S.ach[a.id] ? " on" : "")); c.innerHTML = ic(a.icon); const t = E("div"); t.append(E("b", a.name), E("small", a.desc)); c.append(t); ag.append(c); }); box.append(ag);
  if (!$("#dProg").open) $("#dProg").showModal();
}
export function initRewards() {
  $("#bXp").onclick = openProgress; $("#pgX").onclick = () => $("#dProg").close();
  if (globalThis.location?.hash === "#prog") setTimeout(openProgress, 150);
  $("#rw").value = mode(); $("#rw").onchange = e => { document.body.dataset.rw = e.target.value; try { localStorage.setItem("lt.rw", e.target.value); } catch {} };
  try { const v = localStorage.getItem("lt.rw"); if (v) { document.body.dataset.rw = v; $("#rw").value = v; } } catch {}
  refreshChip();
}
