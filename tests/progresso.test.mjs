import test from "node:test";
import assert from "node:assert/strict";
import { fresh, level, record, listen, isMastered, wid, heat, ACH } from "../web/js/progresso.js";

const W = (fr, lang = "it") => fr.map((f, i) => ({ text: ["alfa", "beta", "gama"][i], lang, frac: f }));
const R = (s, pct, fr = [1, 1], extra = {}) => record(s, { key: "it|x", pct, words: W(fr), day: "2026-11-15", ...extra });

test("nível: 50×nível XP por degrau, só sobe", () => {
  assert.deepEqual(level(0), { level: 1, into: 0, need: 50 });
  assert.deepEqual(level(50), { level: 2, into: 0, need: 100 }); assert.equal(level(150).level, 3);
});
test("1ª tentativa: tentativa +5 e aprovado +10; não há recorde sem baseline", () => {
  const s = fresh(), r = R(s, 86); assert.equal(r.gain, 15); assert.equal(r.delta, null); assert.equal(s.best["it|x"], 86);
});
test("recorde: bônus = melhora em pontos (máx. 15); piorar não perde XP", () => {
  const s = fresh(); R(s, 60); const xp = s.xp, r = R(s, 90); assert.equal(r.delta, 30); assert.ok(r.parts.some(p => p.label === "novo recorde" && p.xp === 15));
  const before = s.xp; R(s, 40); assert.ok(s.xp > before && s.xp > xp); assert.equal(s.best["it|x"], 90);
});
test("sequência: errar zera a sequência, mas guarda a melhor; bônus a cada 5", () => {
  const s = fresh(); for (let i = 0; i < 5; i++) R(s, 90); assert.equal(s.streak.cur, 5);
  assert.ok(s.xp >= 5 * 15 + 10); R(s, 50); assert.equal(s.streak.cur, 0); assert.equal(s.streak.best, 5);
});
test("palavra dominada: 3 acertos com ≥70%; avisa uma vez", () => {
  const s = fresh(), got = []; for (let i = 0; i < 4; i++) got.push(...R(s, 90, [1, 0]).mastered);
  assert.deepEqual(got, ["alfa"]); assert.ok(isMastered(s, wid("it", "alfa"))); assert.ok(!isMastered(s, wid("it", "beta")));
});
test("ouvir vale 2 XP uma vez por frase por dia", () => {
  const s = fresh(); assert.equal(listen(s, { key: "a", day: "d1" }).gain, 2); assert.equal(listen(s, { key: "a", day: "d1" }), null);
  assert.equal(listen(s, { key: "a", day: "d2" }).gain, 2); assert.equal(s.listens, 2);
});
test("conquistas desbloqueiam uma vez; heatmap tem 28 dias e classifica pela meta", () => {
  const s = fresh(), r = R(s, 96); const ids = r.ach.map(a => a.id); assert.ok(ids.includes("first") && ids.includes("pass") && ids.includes("p95"));
  assert.equal(R(s, 96).ach.length, 0); assert.equal(ACH.length, new Set(ACH.map(a => a.id)).size);
  const h = heat(s, 28, new Date("2026-11-15T12:00:00")); assert.equal(h.length, 28); assert.ok(h.at(-1).lv >= 1);
});
