// Diff por letra entre a palavra esperada e a que o Whisper ouviu + dica de pronúncia (italiano).
// Puro (sem DOM): testável. Italiano é quase fonético, então letras ≈ sons.
const nk = s => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

// Alinha letra a letra. exp: letras esperadas {c, op: ok|sub|del}; heard: letras ouvidas {c, op: ok|sub|ins}.
export function diffWord(expected, heard) {
  const A = [...expected.replace(/[^\p{L}\p{N}'’]/gu, "")], B = [...heard.replace(/[^\p{L}\p{N}'’]/gu, "")];
  const a = A.map(nk), b = B.map(nk), n = a.length, m = b.length;
  const D = Array.from({ length: n + 1 }, (_, i) => { const r = new Int32Array(m + 1); r[0] = i; return r; });
  for (let j = 1; j <= m; j++) D[0][j] = j;
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) D[i][j] = Math.min(D[i - 1][j] + 1, D[i][j - 1] + 1, D[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  const exp = A.map(c => ({ c, op: "ok" })), got = B.map(c => ({ c, op: "ok" }));
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && D[i][j] === D[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) { if (a[i - 1] !== b[j - 1]) { exp[i - 1].op = "sub"; got[j - 1].op = "sub"; } i--; j--; }
    else if (i > 0 && D[i][j] === D[i - 1][j] + 1) { exp[i - 1].op = "del"; i--; }
    else { got[j - 1].op = "ins"; j--; }
  }
  return { exp, got, dist: D[n][m] };
}

// Qual palavra ouvida corresponde à palavra esperada k? Menor distância, com leve preferência pela posição. null = não foi dita.
export function bestHeard(k, words, heard) {
  const hw = heard.split(/\s+/).filter(Boolean), w = nk(words[k]); if (!hw.length || !w) return null;
  let best = null, bc = Infinity;
  hw.forEach((h, j) => {
    const x = nk(h), c = diffWord(w, x).dist / Math.max(w.length, x.length, 1) + 0.08 * Math.abs(k / words.length - j / hw.length) * 10 / 10;
    if (c < bc) { bc = c; best = h; }
  });
  return bc > 0.75 ? null : best;
}

// Regras do italiano que um falante de português costuma errar: só dispara se a palavra esperada tem o padrão e o que foi ouvido não.
const RULES = [
  [/gli/, /gli/, "“gli” soa como /ʎ/, igual ao “lh” de “filho”."],
  [/gn/, /gn/, "“gn” soa como /ɲ/, igual ao “nh” de “ninho”."],
  [/sc[ie]/, /sc[ie]/, "“sc” antes de e/i soa /ʃ/, como o “ch” de “chá”."],
  [/c[ie]/, /c[ie]/, "“c” antes de e/i soa /tʃ/, como o “tch” de “tchau”."],
  [/g[ie]/, /g[ie]|gh|j/, "“g” antes de e/i soa /dʒ/, como o “dj” de “djalma”."],
  [/ch[ie]/, /ch[ie]|c[ie]/, "“ch” antes de e/i é /k/ duro, como em “queijo”."],
  [/gh[ie]/, /gh[ie]|g[ie]/, "“gh” antes de e/i é /g/ duro, como em “guerra”."],
  [/([bcdfglmnprstvz])\1/, null, "Consoante dupla: segure o som um pouco mais (geminada)."],
];
export function hintIt(expected, heard) {
  const e = expected.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase(), h = (heard || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  for (const [pat, ok, msg] of RULES) {
    if (!pat.test(e)) continue;
    if (!ok ? !(new RegExp(pat.source).test(h)) : !ok.test(h)) return msg;
  }
  const end = expected.at(-1), got = (heard || "").at(-1);
  if (heard && /[aeiouàèéìòù]/i.test(end) && end.toLowerCase() !== (got || "").toLowerCase()) return "Vogal final: em italiano ela é pronunciada com clareza (“" + end + "”).";
  return heard ? "" : "Essa palavra não apareceu na sua fala.";
}
