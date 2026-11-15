// Preferências guardadas no navegador (localStorage). Tudo em try/catch: janela privada ou dados bloqueados não quebram nada.
export const VAD_DEFAULT = { thr: 0.015, silenceMs: 900 };   // volume mínimo que conta como fala · silêncio que encerra a fala
const KEY = "lt.vad";
const clamp = (v, lo, hi, def) => (Number.isFinite(+v) && v !== null && v !== "" ? Math.min(hi, Math.max(lo, +v)) : def);

export function getVad(store = globalThis.localStorage) {
  try {
    const v = JSON.parse(store.getItem(KEY)) || {};
    return { thr: clamp(v.thr, 0.003, 0.1, VAD_DEFAULT.thr), silenceMs: clamp(v.silenceMs, 400, 3000, VAD_DEFAULT.silenceMs) };
  } catch { return { ...VAD_DEFAULT }; }
}
export function setVad(v, store = globalThis.localStorage) {
  try { store.setItem(KEY, JSON.stringify(getVad({ getItem: () => JSON.stringify(v) }))); } catch { /* sem storage: vale só até recarregar */ }
}
