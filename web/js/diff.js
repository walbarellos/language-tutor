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

// Padrões do italiano que um falante de português costuma errar. Só disparam se a palavra esperada tem o padrão e o que foi ouvido não.
export const PATTERNS = {
  gli: { short: "gli: “lh” (/ʎ/), como em “filho”.", name: "gli (lh)", re: /gli/, ok: /gli/, tip: "“gli” soa como /ʎ/, igual ao “lh” de “filho”." },
  gn: { short: "gn: “nh” (/ɲ/), como em “ninho”.", name: "gn (nh)", re: /gn/, ok: /gn/, tip: "“gn” soa como /ɲ/, igual ao “nh” de “ninho”." },
  sc: { short: "sce/sci: “ch” (/ʃ/), como em “chá”.", name: "sce/sci", re: /sc[ie]/, ok: /sc[ie]/, tip: "“sc” antes de e/i soa /ʃ/, como o “ch” de “chá”." },
  ce: { short: "ce/ci: “tch” (/tʃ/), como em “tchau”.", name: "ce/ci", re: /c[ie]/, ok: /c[ie]/, tip: "“c” antes de e/i soa /tʃ/, como o “tch” de “tchau”." },
  ge: { short: "ge/gi: “dj” (/dʒ/).", name: "ge/gi", re: /g[ie]/, ok: /g[ie]|gh|j/, tip: "“g” antes de e/i soa /dʒ/, como o “dj” de “djalma”." },
  chi: { short: "che/chi: o “ch” é /k/ (“kê”, “ki”), nunca “tchê”.", name: "che/chi", re: /ch[ie]/, ok: /ch[ie]/, tip: "“ch” antes de e/i é /k/ duro, como em “queijo”." },
  ghi: { short: "ghe/ghi: o “gh” é /g/ (“guê”, “gui”).", name: "ghe/ghi", re: /gh[ie]/, ok: /gh[ie]/, tip: "“gh” antes de e/i é /g/ duro, como em “guerra”." },
  dupla: { short: "consoante dupla: segure o som.", name: "consoante dupla", re: /([bcdfglmnprstvz])\1/, ok: null, tip: "Consoante dupla: segure o som um pouco mais (geminada)." },
  vogal: { short: "vogal final: pronuncie com clareza.", name: "vogal final", re: null, ok: null, tip: "" },
};
const plain = s => (s || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
export function patternOf(expected, heard) {
  const e = plain(expected), h = plain(heard);
  for (const [id, p] of Object.entries(PATTERNS)) {
    if (!p.re || !p.re.test(e)) continue;
    if (!p.ok ? !p.re.test(h) : !p.ok.test(h)) return { id, tip: p.tip };
  }
  const end = expected.at(-1), got = (heard || "").at(-1);
  if (heard && /[aeiouàèéìòù]/i.test(end) && end.toLowerCase() !== (got || "").toLowerCase()) return { id: "vogal", tip: "Vogal final: em italiano ela é pronunciada com clareza (“" + end + "”)." };
  return null;
}
export function hintIt(expected, heard) { const p = patternOf(expected, heard); return p ? p.tip : heard ? "" : "Essa palavra não apareceu na sua fala."; }

// Armadilhas para quem fala português: a palavra tem um padrão que o português costuma errar (ex.: “che” é “kê”, não “tchê”).
export function trapsOf(word) {
  const w = plain(word);
  for (const id of ["chi", "ghi", "gli", "gn", "sc", "ce", "ge"]) if (PATTERNS[id].re.test(w)) return id;
  return PATTERNS.dupla.re.test(w) ? "dupla" : null;
}
export function trapNote(tokens) {
  const seen = new Set(), out = [];
  for (const t of tokens) { const id = trapsOf(t.text); if (id && !seen.has(id) && out.length < 3) { seen.add(id); out.push(t.text.replace(/[^\p{L}']/gu, "") + " → " + PATTERNS[id].short); } }
  return out.join("  ·  ");
}
