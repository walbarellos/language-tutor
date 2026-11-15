// Estado compartilhado do app (um objeto só, importado por quem precisa). Sem lógica aqui.
export const app = {
  study: "it",     // idioma de estudo atual
  segs: [],        // frases na tela
  sit: null,       // situação (trilha) aberta, ou null
  tr: false,       // tradução ligada?
  prog: {},        // progresso das trilhas
  streak: 0,       // acertos consecutivos (combo)
  xp: 0,           // pontos de experiência da sessão
  player: null, audio: null, trainer: null, recorder: null,
};
