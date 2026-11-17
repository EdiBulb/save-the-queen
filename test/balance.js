// 자동 대전: 플레이어 자리도 AI가 맡아서 여러 판을 돌려 본다.  node test/balance.js [aggro|turtle] [판 수]
const Sim = require('../src/sim.js');
const types = process.argv[2] ? [process.argv[2]] : ['aggro', 'turtle'];
const N = +process.argv[3] || 20;
for (const type of types) {
  const wins = [0, 0, 0, 0]; const times = []; let detail = '';
  for (let seed = 1; seed <= N; seed++) {
    let x = seed * 7919; const rand = () => (x = (x * 16807) % 2147483647) / 2147483647;
    const s = Sim.createState(rand, { playerAI: type });
    const out = [null, null, null]; const snap = []; let next = 60;
    while (!s.over && s.time < 900) { Sim.update(s, 1 / 30);
      s.hives.forEach((h, i) => { if (h.defeated && out[i] === null) out[i] = Math.round(s.time); });
      if (s.time >= next) { next += 60; snap.push(s.hives.map(h => h.defeated ? 'x' : s.bees.filter(b => b.hive === h.id).length + 'b' + Math.round(h.honey)).join(' ')); } }
    const alive = s.hives.filter(h => !h.defeated);
    if (alive.length === 1) wins[alive[0].id]++; else wins[3]++;
    times.push(Math.round(s.time));
    if (seed <= 2) detail += `  seed${seed}: out@${out.join('/')} end ${Math.round(s.time)}s\n    per minute (bees b honey): ${snap.join(' | ')}\n`;
  }
  times.sort((a, b) => a - b);
  console.log(`player=${type}: wins me/aggro/turtle/none = ${wins.join('/')}, length min/med/max = ${times[0]}/${times[N >> 1]}/${times[N - 1]}s\n${detail}`);
}
