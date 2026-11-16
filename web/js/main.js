// Ponto de entrada: monta os módulos e liga os botões. Nenhuma regra de negócio aqui.
import { $, warn, ic, hydrate } from "./util.js";
import { dock } from "./dock.js";
import { app } from "./state.js";
import { AudioController } from "./audio.js";
import { Player } from "./player.js";
import { Trainer } from "./trainer.js";
import { Recorder } from "./recorder.js";
import { LANGS, STUDYL } from "./languages.js";
import { view, followScroll, applyEar, applyRead } from "./render.js";
import { load, fetchTr } from "./session.js";
import { initSrs } from "./srs.js";
import { analyze, initRecButton } from "./shadowing.js";
import { openTrail, markHeard } from "./trilha.js";
import { api } from "./api.js";
import { getVad, setVad } from "./settings.js";

const DEFAULT = `Nasce da questo una disputa: s’egli è meglio essere amato che temuto, o e converso.
Rispondo che si vorrebbe essere l’uno e l’altro; ma perché egli è difficile accozzarli insieme, è molto più sicuro essere temuto che amato, quando si abbia a mancare dell’uno de’ dua.`;

// ---------- montagem ----------
const audio = new AudioController();
const player = new Player({ audio, view, voiceFor: l => LANGS[l].voice, onHeard: markHeard });
const recorder = new Recorder({ vadCfg: getVad });   // lido a cada gravação: mexer nos controles vale já na próxima frase
recorder.onLevel = l => dock.level(l);                 // medidor ao vivo (painel)
recorder.onInterim = text => dock.live(text);          // texto ao vivo enquanto você fala

// Faixa do Modo Treino: passos (Ouvir, Falar, Nota) + o que fazer agora. O painel ao vivo (dock) mostra o medidor.
const coach = $("#coach"), steps = $("#steps"); let pos = "";
const MSG = {
  slow: "Ouça devagar", normal: "Ouça", speak: "Sua vez: fale a frase", analyze: "Analisando…",
  silent: "Não ouvi nada. Vamos de novo.", gap: "Repita em voz alta", nomic: "Sem microfone: modo ouvir e repetir",
  done: "Treino concluído", stopped: "Treino parado",
};
const ICO = { slow: "ear", normal: "ear", speak: "mic", gap: "mic", analyze: "clock", silent: "mic", done: "done", stopped: "stop", nomic: "mic" };
const STEP = { slow: 0, normal: 0, speak: 1, gap: 1, silent: 1, analyze: 2, result: 2 };   // qual passo acende
const DOCK = { slow: "slow", normal: "play", speak: "wait", analyze: "analyze", silent: "silent", gap: "gap" };
const say = (ico, txt) => { coach.hidden = false; $(".c-ico", coach).innerHTML = ic(ico); $(".c-txt", coach).textContent = txt; };
const trainView = {
  on(b) {
    $("#bTrain").setAttribute("aria-pressed", b); dock.locked = b; steps.hidden = !b;
    if (b) steps.querySelectorAll("li").forEach(li => li.className = ""); else dock.hide();
    coach.hidden = !b && !$(".c-txt", coach).textContent;
  },
  step(name, info = {}) {
    if (name === "sentence") { pos = "Frase " + (info.n + 1) + "/" + info.total + " · "; steps.querySelectorAll("li").forEach(li => li.className = ""); return; }
    if (name in STEP) steps.querySelectorAll("li").forEach((li, k) => { li.className = k < STEP[name] ? "done" : k === STEP[name] ? "now" : ""; });
    if (DOCK[name]) dock.set(DOCK[name], info); else dock.hide();
    if (name === "result") say(info.pass ? "check" : "redo", pos + (info.pct === null ? "Não deu para avaliar" : "Acerto " + info.pct + "% · " + (info.pass ? "aprovado" : "de novo")));
    else say(ICO[name], ([ "done", "stopped", "nomic" ].includes(name) ? "" : pos) + MSG[name]);
  },
};
const trainer = new Trainer({ player, recorder, score: analyze, view: trainView });
Object.assign(app, { audio, player, recorder, trainer });
hydrate();
followScroll(player);
initSrs(); initRecButton();
api.progress().then(j => { app.prog = j.progress || {}; }).catch(() => {});

// ---------- controles ----------
$("#bPlay").onclick = () => trainer.on ? trainer.stop() : player.toggle();
$("#bPrev").onclick = () => { trainer.stop(); player.prev(); };
$("#bNext").onclick = () => { trainer.stop(); player.next(); };
$("#sp").onchange = e => player.setSpeed(+e.target.value);
$("#bLoop").onclick = e => { player.loop = !player.loop; e.target.setAttribute("aria-pressed", player.loop); };
$("#bGap").onclick = e => { player.gap = !player.gap; e.target.setAttribute("aria-pressed", player.gap); };
$("#bTrain").onclick = () => trainer.on ? trainer.stop() : trainer.start(player.i);
$("#bTr").onclick = e => { app.tr = !app.tr; e.target.setAttribute("aria-pressed", app.tr); document.body.dataset.tr = app.tr ? "on" : "off"; if (app.tr) fetchTr(); };
$("#bFq").onclick = e => { const on = document.body.dataset.freq !== "on"; document.body.dataset.freq = on ? "on" : "off"; e.target.setAttribute("aria-pressed", on); };
$("#bEar").onclick = e => { const on = document.body.dataset.listen !== "on"; document.body.dataset.listen = on ? "on" : "off"; e.target.setAttribute("aria-pressed", on); app.segs.forEach(s => s.rev = false); applyEar(); };
const RD = ["none", "furi", "romaji"];
$("#bRd").onclick = () => { const d = document.body.dataset; d.read = RD[(RD.indexOf(d.read) + 1) % 3]; applyRead(); };
$("#bTrl").onclick = openTrail; $("#trlX").onclick = () => $("#dTrl").close();
$("#bImp").onclick = () => { $("#tx").value = app.segs.map(s => "[" + s.lang + "] " + s.text).join("\n"); $("#dImp").showModal(); };
$("#dImp").onclose = e => { if (e.target.returnValue === "ok") load($("#tx").value).catch(warn); };

// ---------- configurações ----------
$("#bSet").onclick = () => $("#dSet").showModal();
$("#vpt").onchange = e => { LANGS.pt.voice = e.target.value; };            // a chave do áudio inclui a voz: nada para invalidar
const fillVoices = () => { $("#vit").innerHTML = STUDYL[app.study].v.map(v => `<option value="${v[0]}">${v[1]}</option>`).join(""); $("#vit").value = LANGS[app.study].voice; };
$("#sl").innerHTML = Object.entries(STUDYL).map(([c, v]) => `<option value="${c}">${v.n}</option>`).join(""); $("#sl").value = app.study; fillVoices();
const SAMPLE = { ja: "[pt] Vamos ler duas frases em japonês.\n[ja] 今日は天気がいいですね。\n[pt] Quer dizer: o tempo está bom hoje, não é?\n[ja] 私は日本語を勉強しています。" };
$("#sl").onchange = e => { app.study = e.target.value; fillVoices(); $("#tx").value = SAMPLE[app.study] || ""; $("#dSet").close(); $("#dImp").showModal(); };
$("#vit").onchange = e => { LANGS[app.study].voice = e.target.value; };
// Calibração do fim de fala: menor volume = mais sensível; mais silêncio = espera mais antes de encerrar.
const vadUi = () => { const v = getVad(); $("#vthr").value = v.thr; $("#vsil").value = v.silenceMs; $("#vthrV").textContent = v.thr.toFixed(3); $("#vsilV").textContent = v.silenceMs + " ms"; };
const vadSave = () => { setVad({ thr: +$("#vthr").value, silenceMs: +$("#vsil").value }); vadUi(); };
$("#vthr").oninput = $("#vsil").oninput = vadSave; vadUi();
$("#mo").onchange = e => document.body.dataset.m = e.target.value;
$("#fs").oninput = e => document.body.style.setProperty("--fs", e.target.value);
if (matchMedia("(prefers-reduced-motion:reduce)").matches) { document.body.dataset.m = "soft"; $("#mo").value = "soft"; }

// ---------- teclado ----------
// Antes, depois de clicar num botão o foco ficava nele e os atalhos morriam (Espaço "re-clicava" o botão).
// Agora: clique de mouse/toque solta o foco; atalhos funcionam em qualquer lugar, menos em campos de texto.
document.querySelector("footer").addEventListener("click", e => { if (e.detail > 0) e.target.closest("button")?.blur(); });
$("#page").addEventListener("click", () => { if (document.activeElement?.tagName === "BUTTON") document.activeElement.blur(); }, true);
addEventListener("keydown", e => {
  const tag = e.target.tagName;
  if (/TEXTAREA|INPUT|SELECT/.test(tag) || document.querySelector("dialog[open]") || e.ctrlKey || e.metaKey || e.altKey) return;
  const sp = [...$("#sp").options].map(o => +o.value), n = sp.indexOf(player.speed), k = e.key.toLowerCase(), setSp = v => { $("#sp").value = v; player.setSpeed(v); };
  if (e.key === " " && tag !== "BUTTON") { e.preventDefault(); $("#bPlay").click(); }
  else if (e.key === "ArrowRight") { e.preventDefault(); $("#bNext").click(); }
  else if (e.key === "ArrowLeft") { e.preventDefault(); $("#bPrev").click(); }
  else if (e.key === "ArrowUp" && n < sp.length - 1) { e.preventDefault(); setSp(sp[n + 1]); }
  else if (e.key === "ArrowDown" && n > 0) { e.preventDefault(); setSp(sp[n - 1]); }
  else if (k === "l") $("#bLoop").click();
  else if (k === "t") $("#bTrain").click();
  else if (k === "r") app.segs[player.i]?.rvb?.click();
  else if (k === "g") $("#bRec").click();
});

load(DEFAULT).catch(warn);
