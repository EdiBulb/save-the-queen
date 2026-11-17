// 공격 A마리 vs 수비 D마리를 여러 번 붙여 본다.  node test/duel.js
const Sim = require('../src/sim.js'); const C = Sim.CONFIG;
function duel(A, D, seed) {
  let x = seed * 7919; const rand = () => (x = (x * 16807) % 2147483647) / 2147483647;
  const s = Sim.createState(rand); s.hives.forEach(h => { h.ai = null; });
  const me = s.hives[0], T = s.hives[1];
  s.bees = [];
  for (const [q, r] of [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]]) T.cells.push({ q, r, queen: false, brood: null, hp: C.CELL_HP });
  for (let i = 0; i < A; i++) Sim.newBee(s, me, 'attack', me.x, me.y);
  for (let i = 0; i < D; i++) Sim.newBee(s, T, 'defend', T.x + (rand() - .5) * 60, T.y + (rand() - .5) * 60);
  Sim.setAttack(s, 0, 1);
  for (let t = 0; t < 40 * 60; t++) { Sim.update(s, 1 / 60);
    const a = s.bees.filter(b => b.hive === 0).length, d = s.bees.filter(b => b.hive === 1).length;
    if (!a || !d) return { a, d }; }
  return { a: s.bees.filter(b => b.hive === 0).length, d: s.bees.filter(b => b.hive === 1).length };
}
for (const [A, D] of [[5, 5], [8, 8], [12, 12], [6, 5], [8, 5], [10, 5], [5, 8]]) {
  let aw = 0, dw = 0, as = 0, ds = 0; const N = 40;
  for (let i = 1; i <= N; i++) { const r = duel(A, D, i); if (r.a && !r.d) { aw++; as += r.a; } else if (r.d && !r.a) { dw++; ds += r.d; } }
  console.log(`공격 ${A} vs 수비 ${D}: 공격 승 ${aw}/${N} (평균 ${aw ? (as / aw).toFixed(1) : '-'}마리 생존), 수비 승 ${dw}/${N} (평균 ${dw ? (ds / dw).toFixed(1) : '-'}마리 생존)`);
}
