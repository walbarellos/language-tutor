// Estado compartilhado do app (um objeto só, importado por quem precisa). Sem lógica aqui.
export const app = {
  study: "it",     // idioma de estudo atual
  segs: [],        // frases na tela
  sit: null,       // situação (trilha) aberta, ou null
  tr: true,        // tradução ligada por padrão
  prog: {},        // progresso das trilhas
  player: null, audio: null, trainer: null, recorder: null,
};
