// 가상의 플레이어 몇 가지를 AI 2명과 붙여 본다.  node test/player.js
const Sim = require('../src/sim.js'); const C = Sim.CONFIG;
const cnt = (s, id) => Sim.counts(s, id);
const total = (c) => c.gather + c.build + c.nurse + c.defend + c.attack;
function setRoles(s, want) { // 원하는 수가 되도록 채집 벌과 주고받는다
  const c = cnt(s, 0);
  for (const r of ['build', 'nurse', 'defend', 'attack']) {
    while (c[r] < want[r] && c.gather > 1 && Sim.moveBee(s, 0, 'gather', r)) { c[r]++; c.gather--; }
    while (c[r] > want[r] && Sim.moveBee(s, 0, r, 'gather')) { c[r]--; c.gather++; }
  }
}
function build(s, max) { const me = s.hives[0]; me.droneTarget = total(cnt(s, 0)) >= 10 && Sim.flowersLeft(s) > 0 ? Math.min(C.DRONE_MAX, 4 + Math.floor(me.honey / 150) * 2) : 0; if (!me.queenAlive) { const c = me.cells.find(x => x.brood && x.brood.stage === 'larva'); if (c) Sim.chooseRoyal(me, c.q, c.r); } if (me.sites.length < max && !me.pending) { const sp = Sim.buildableSpots(me)[0]; if (sp && me.honey >= Sim.cellCost(me)) Sim.orderCell(me, sp.q, sp.r); } }
const players = {
  '칸만 짓고 수비 0': (s) => { const n = total(cnt(s, 0)); build(s, 2); setRoles(s, { build: s.hives[0].sites.length ? 1 : 0, nurse: Math.min(3, 1 + (n > 10)), defend: 0, attack: 0 }); },
  '수비 3마리 고정': (s) => { const n = total(cnt(s, 0)); build(s, 2); setRoles(s, { build: s.hives[0].sites.length ? 1 : 0, nurse: Math.min(3, 1 + (n > 10)), defend: Math.min(3, n - 3), attack: 0 }); },
  '수비 25%': (s) => { const n = total(cnt(s, 0)); build(s, 2); setRoles(s, { build: s.hives[0].sites.length ? 1 : 0, nurse: Math.min(4, 1 + Math.floor(n / 10)), defend: Math.floor(n * 0.25), attack: 0 }); },
  '수비 40%': (s) => { const n = total(cnt(s, 0)); build(s, 2); setRoles(s, { build: s.hives[0].sites.length ? 1 : 0, nurse: Math.min(4, 1 + Math.floor(n / 10)), defend: Math.floor(n * 0.4), attack: 0 }); },
};
for (const [name, play] of Object.entries(players)) {
  let lost = 0, won = 0; const dead = []; const first = []; let sample = '';
  for (let seed = 1; seed <= 20; seed++) {
    let x = seed * 7919; const rand = () => (x = (x * 16807) % 2147483647) / 2147483647;
    const s = Sim.createState(rand); let tick = 0, hit = null;
    while (!s.over && s.time < 900) { Sim.update(s, 1 / 30); if (++tick % 30 === 0) play(s);
      if (!hit && s.time - s.hives[0].lastHit < 0.1) { const raiders = s.bees.filter(b => b.hive !== 0 && b.role === 'attack' && Math.hypot(b.x - 400, b.y - 300) < 120).length; const c = cnt(s, 0); hit = { t: Math.round(s.time), raiders, def: c.defend, n: total(c) }; } }
    if (s.over === 'lose') { lost++; dead.push(Math.round(s.time)); } else if (s.over === 'win') won++;
    if (hit) first.push(hit); if (seed === 1 && hit) sample = `첫 공격 ${hit.t}초, 침입 ${hit.raiders}마리 vs 내 수비 ${hit.def}마리 (내 벌 ${hit.n}마리)`;
  }
  const avg = (a, f) => a.length ? Math.round(a.reduce((p, q) => p + f(q), 0) / a.length) : '-';
  console.log(`${name}: 20판 중 패배 ${lost}, 승리 ${won} | 평균 패배 시각 ${avg(dead, x => x)}초 | 첫 공격 평균 ${avg(first, h => h.t)}초에 침입 ${avg(first, h => h.raiders)}마리, 그때 내 벌 ${avg(first, h => h.n)}마리\n   예: ${sample}`);
}
