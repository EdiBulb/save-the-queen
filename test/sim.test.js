const assert = require('assert');
const Sim = require('../src/sim.js');
let seed = 1; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const C = Sim.CONFIG;
const run = (s, sec, each) => { for (let t = 0; t < sec * 60; t++) { Sim.update(s, 1 / 60); if (each) each(t); } };
const of = (s, id, role) => s.bees.filter(b => b.hive === id && (!role || b.role === role));
const cell = (q, r, brood) => ({ q, r, queen: false, brood: brood || null, hp: C.CELL_HP });
const RING = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
// AI를 끄고, 1번 벌집을 가만히 있는 연습 상대로 만든 상태
function sandbox(attackers, mode) {
  const s = Sim.createState(rand); s.hives.forEach(h => { h.ai = null; });
  const me = s.hives[0], T = s.hives[1];
  s.hives[2].queenAlive = false; Sim.update(s, 1 / 60); assert(s.hives[2].defeated && !s.over);
  RING.forEach(([q, r]) => { me.cells.push(cell(q, r)); T.cells.push(cell(q, r)); });
  s.bees.filter(b => b.hive === 1 && b.role === 'build').forEach(b => { b.role = 'defend'; });
  for (let i = 0; i < 2; i++) Sim.newBee(s, T, 'defend', T.x, T.y);
  T.honey = 80; me.raidMode = mode || 'eat';
  for (let i = 0; i < attackers; i++) Sim.newBee(s, me, 'attack', me.x, me.y);
  run(s, 15);
  return { s, me, T };
}

// 맵: 세 벌집 사이 거리와 가운데 꽃밭까지 거리가 같다
{ const s = Sim.createState(rand); const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y); const [a, b, c] = s.hives; const mid = s.flowers[3];
  assert(Math.abs(d(a, b) - d(a, c)) < 1 && Math.abs(d(a, b) - d(b, c)) < 1, 'triangle sides');
  s.hives.forEach(h => { assert(Math.abs(d(h, mid) - d(a, mid)) < 1); assert(Math.abs(d(h, s.flowers[h.flowerId]) - 105) < 1); }); }

// 경제: 칸이 없으면 알도 없다, 칸 값은 오른다
{ const s = Sim.createState(rand); s.hives.forEach(h => { h.ai = null; }); const me = s.hives[0];
  run(s, 40); assert.strictEqual(of(s, 0).length, 4); assert.strictEqual(me.cells.length, 1);
  assert.strictEqual(Sim.orderCell(me, 2, 0), 'invalid');
  assert.strictEqual(Sim.cellCost(me), 10); assert.strictEqual(Sim.orderCell(me, 1, 0), 'ok'); assert.strictEqual(Sim.cellCost(me), 12);
  let min = Infinity;
  run(s, 150, (t) => { min = Math.min(min, me.honey); if (t % 60 === 0 && me.sites.length < 2) { const sp = Sim.buildableSpots(me)[0]; if (sp) Sim.orderCell(me, sp.q, sp.r); } });
  assert(min >= 0); assert(me.cells.length > 3 && of(s, 0).length > 6);
  console.log('economy: bees', of(s, 0).length, 'cells', me.cells.length, 'honey', Math.round(me.honey)); }

// 꽃: 고른 꽃밭으로 가고, 지면 다음 꽃밭으로, 다 지면 수입이 끊긴다
{ const s = Sim.createState(rand); s.hives.forEach(h => { h.ai = null; }); const me = s.hives[0];
  me.gatherAt = 3; run(s, 12); assert(of(s, 0, 'gather').some(b => Math.hypot(b.x - 400, b.y - 150) < 50), 'gatherers at centre');
  s.time = C.WILT_CENTER + 1; run(s, 15); const h0 = me.honey; run(s, 20); assert.strictEqual(me.honey, h0); assert.strictEqual(Sim.flowersLeft(s), 0); }

// 전투: 공격 10마리는 이기고, 2마리는 수비 5마리에게 진다
{ const { s, me, T } = sandbox(10);
  assert(of(s, 0, 'attack').every(b => Math.hypot(b.x - me.x, b.y - me.y) < 90), 'waits at home');
  assert(!Sim.setAttack(s, 0, 0) && !Sim.setAttack(s, 0, 2)); assert(Sim.setAttack(s, 0, 1));
  const h0 = me.honey; let minT = Infinity; run(s, 240, () => { minT = Math.min(minT, T.honey); });
  console.log('raid 10: over', s.over, 'at', Math.round(s.time) + 's, attackers left', of(s, 0, 'attack').length, 'honey', Math.round(h0), '->', Math.round(me.honey));
  assert(minT >= 0); assert.strictEqual(s.over, 'win'); assert(me.attackTarget === null); }
{ const { s, T } = sandbox(2); Sim.setAttack(s, 0, 1); run(s, 60);
  assert.strictEqual(of(s, 0, 'attack').length, 0); assert(T.queenAlive && T.cells.length === 7 && !s.over); }

// 납치와 철수
{ const { s, me, T } = sandbox(10, 'kidnap'); T.cells.slice(1).forEach(c => { c.brood = { stage: 'larva', t: 0, fed: 8, pending: 0 }; });
  Sim.setAttack(s, 0, 1); let cap = 0; run(s, 16, () => { cap = Math.max(cap, s.bees.filter(b => b.captive).length); });
  Sim.setAttack(s, 0, null); run(s, 30);
  assert(cap > 0); assert(me.cells.some(c => c.brood && c.brood.fed >= 8), 'captive placed in my hive');
  assert(of(s, 0, 'attack').every(b => b.loot === 0 && !b.captive && Math.hypot(b.x - me.x, b.y - me.y) < 100)); }

// 새 여왕, 패배
{ const s = Sim.createState(rand); s.hives.forEach(h => { h.ai = null; }); const me = s.hives[0];
  me.cells.push(cell(1, 0, { stage: 'larva', t: 0, fed: 4, pending: 0 }));
  assert.strictEqual(Sim.chooseRoyal(me, 1, 0), 'invalid'); me.queenAlive = false; me.honey = 10;
  assert.strictEqual(Sim.chooseRoyal(me, 1, 0), 'honey'); me.honey = 40; assert.strictEqual(Sim.chooseRoyal(me, 1, 0), 'ok');
  run(s, C.ROYAL_TIME - 1); assert(!me.queenAlive && !s.over); run(s, 2); assert(me.queenAlive);
  const s2 = Sim.createState(rand); s2.hives[0].queenAlive = false; run(s2, 1); assert.strictEqual(s2.over, 'lose'); }

// AI와 한 판: 아무것도 안 하는 플레이어는 진다
{ const s = Sim.createState(rand); let t = 0; while (!s.over && s.time < 900) Sim.update(s, 1 / 30);
  console.log('idle player:', s.over, 'at', Math.round(s.time) + 's'); assert.strictEqual(s.over, 'lose'); }
console.log('all ok');
// 칸 저축: 꿀이 모자라면 주문을 걸어 두고, 모일 때까지 먹이기를 멈춘다
{ const s = Sim.createState(rand); s.hives.forEach(h => { h.ai = null; }); const me = s.hives[0];
  me.cells.push(cell(1, 0, { stage: 'larva', t: 0, fed: 0, pending: 0 })); me.honey = 0;
  assert.strictEqual(Sim.orderCell(me, 0, 1), 'saving'); assert.strictEqual(Sim.orderCell(me, 0, 1), 'cancel'); assert(!me.pending);
  assert.strictEqual(Sim.orderCell(me, 0, 1), 'saving');
  let fed = 0; run(s, 60, () => { if (me.pending) fed = me.cells[1].brood.fed; });
  assert.strictEqual(fed, 0, 'no feeding while saving'); assert(!me.pending && me.cells.length + me.sites.length === 3, 'order went through');
  assert(me.cells.some(c => c.brood && c.brood.fed > 0) || of(s, 0).length > 4, 'feeding resumed'); }
console.log('saving ok');
// 수벌: 알 낳는 간격이 줄고, 꿀을 먹고, 꿀이 떨어지면 굶는다
{ const s = Sim.createState(rand); s.hives.forEach(h => { h.ai = null; }); const me = s.hives[0];
  for (const [q, r] of RING) me.cells.push(cell(q, r)); me.honey = 500; me.droneTarget = 2; Sim.moveBee(s, 0, 'build', 'nurse');
  run(s, 150); const d = of(s, 0, 'drone').length;
  assert.strictEqual(d, 2, 'two drones raised, got ' + d); assert(Math.abs(Sim.layInterval(me) - C.LAY_INTERVAL / 1.5) < 1e-9);
  assert(!Sim.moveBee(s, 0, 'drone', 'gather'), 'drones cannot change role'); assert.strictEqual(Sim.counts(s, 0).drone, 2);
  s.bees.filter(b => b.hive === 0 && b.role === 'gather').forEach(b => { b.role = 'defend'; b.carry = 0; }); me.honey = 5; s.hives[0].cells.forEach(c => { c.brood = null; }); me.queenAlive = true;
  const h0 = me.honey; run(s, 4); assert(me.honey < h0, 'upkeep eats honey'); run(s, 40);
  assert.strictEqual(of(s, 0, 'drone').length, 0, 'drones starve without honey'); }
// 칸 제한 없음 + 길만 뚫으면 여왕 공격
{ const s = Sim.createState(rand); s.hives.forEach(h => { h.ai = null; }); const me = s.hives[0], T = s.hives[1];
  for (let q = -5; q <= 5; q++) for (let r = -5; r <= 5; r++) if ((q || r) && Math.abs(q + r) <= 5) me.cells.push(cell(q, r));
  me.honey = 1e6; assert.strictEqual(Sim.orderCell(me, 6, 0), 'ok', 'no radius limit'); assert.strictEqual(Sim.orderCell(me, 8, 0), 'invalid'); me.sites.length = 0;
  for (let q = -3; q <= 3; q++) for (let r = -3; r <= 3; r++) if ((q || r) && Math.abs(q + r) <= 3) T.cells.push(cell(q, r));
  const cells0 = T.cells.length; s.bees = s.bees.filter(b => b.hive !== 1);
  for (let i = 0; i < 12; i++) Sim.newBee(s, me, 'attack', me.x, me.y); Sim.setAttack(s, 0, 1);
  let left = null; run(s, 120, () => { if (!T.queenAlive && left === null) left = T.cells.length; });
  console.log('tunnel: queen died with', left, 'of', cells0, 'cells standing');
  assert(left !== null && left > cells0 * 0.6, 'queen reachable through a tunnel'); assert(T.defeated, 'no brood, so hive falls'); }
console.log('drones and tunnel ok');
