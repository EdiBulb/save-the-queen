// 서버를 띄우고 가짜 플레이어 셋으로 방 만들기 → 입장 → 시작 → 명령 → 나가기를 확인한다.
const assert = require('assert');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const Net = require('../src/net.js'); const Sim = require('../src/sim.js');
const PORT = 3911; const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function client() { const ws = new WebSocket('ws://localhost:' + PORT); const c = { ws, room: null, view: Net.emptyView(), errors: [], started: null, states: 0, bytes: 0 };
  ws.on('message', (raw) => { const m = JSON.parse(raw); if (m.t === 'room') c.room = m; else if (m.t === 'error') c.errors.push(m.msg); else if (m.t === 'start') c.started = m; else if (m.t === 'state') { c.states++; c.bytes += raw.length; Net.unpack(c.view, m.s); } });
  c.send = (m) => ws.send(JSON.stringify(m)); c.open = new Promise((r) => ws.on('open', r)); return c; }
(async () => {
  const srv = spawn('node', ['server/server.js'], { env: Object.assign({}, process.env, { PORT }), cwd: __dirname + '/..' }); await wait(700);
  try {
    const http = require('http'); const get = (p) => new Promise((r) => http.get('http://localhost:' + PORT + p, (res) => { let d = ''; res.on('data', (x) => (d += x)); res.on('end', () => r({ code: res.statusCode, body: d })); }));
    assert.strictEqual((await get('/health')).body, 'ok'); assert((await get('/config.js')).body.includes("'same'")); assert((await get('/')).body.includes('여왕을 지켜라'));
    assert.strictEqual((await get('/server/server.js')).code, 404); assert.strictEqual((await get('/src/../package.json')).code, 404);

    const a = client(), b = client(), c = client(), d = client(); await Promise.all([a.open, b.open, c.open, d.open]);
    a.send({ t: 'create', name: '해리' }); await wait(150);
    assert(a.room && /^[A-Z]{4}$/.test(a.room.code) && a.room.you === 0 && a.room.host === 0);
    b.send({ t: 'join', code: 'ZZZZ', name: 'x' }); await wait(100); assert.strictEqual(b.errors.length, 1, 'wrong code refused');
    b.send({ t: 'join', code: a.room.code.toLowerCase(), name: '민<b>수' }); await wait(150);
    assert.strictEqual(b.room.you, 1); assert.strictEqual(a.room.players[1].name, '민b수', 'name cleaned');
    b.send({ t: 'start' }); await wait(150); assert(!a.started, 'only the host can start');
    a.send({ t: 'start' }); await wait(600);
    assert.deepStrictEqual(a.started.names, ['해리', '민b수', 'AI 3']); assert(a.states >= 3 && b.states >= 3, 'snapshots arrive');
    c.send({ t: 'join', code: a.room.code, name: '늦은이' }); await wait(150); assert.strictEqual(c.errors.length, 1, 'cannot join a running game');
    const v = a.view; assert.strictEqual(v.hives.length, 3); assert.strictEqual(v.bees.length, 12); assert.strictEqual(v.flowers.length, 4);
    assert.strictEqual(Sim.buildableSpots(v.hives[0]).length, 6, 'rules functions work on the unpacked view'); assert.strictEqual(Sim.cellCost(v.hives[0]), 10);

    // 명령: 0번이 칸을 주문하고 벌을 옮긴다. 1번은 남의 벌집을 건드릴 수 없다.
    a.send({ t: 'cmd', c: { k: 'order', q: 1, r: 0 } }); a.send({ t: 'cmd', c: { k: 'move', from: 'gather', to: 'defend' } }); a.send({ t: 'cmd', c: { k: 'drone', n: 99 } }); a.send({ t: 'cmd', c: { k: 'raid', mode: 'kidnap' } });
    b.send({ t: 'cmd', c: { k: 'order', q: 5, r: 5 } }); b.send({ t: 'cmd', c: { k: 'bogus' } }); b.send({ t: 'cmd', c: null }); b.ws.send('not json');
    await wait(400);
    const h0 = b.view.hives[0], h1 = b.view.hives[1];
    assert.strictEqual(h0.sites.length + h0.cells.length, 2, 'order applied'); assert.strictEqual(Sim.counts(b.view, 0).defend, 1, 'move applied');
    assert.strictEqual(h0.droneTarget, Sim.CONFIG.DRONE_MAX, 'drone target clamped'); assert.strictEqual(h0.raidMode, 'kidnap'); assert.strictEqual(h0.honey, 10);
    assert.strictEqual(h1.sites.length, 0, 'invalid order ignored'); assert(b.ws.readyState === 1, 'bad messages do not drop the connection');

    // 부드러운 이동: 받은 위치로 조금씩 다가간다
    const bee = a.view.bees[0]; bee.x = bee.tx + 100; Net.smooth(a.view, 0.016); assert(bee.x < bee.tx + 100 && bee.x > bee.tx);

    // 게임 중에 나가면 AI가 이어받고, 판은 계속된다
    const before = a.states; b.ws.close(); await wait(500);
    assert(a.states > before, 'game goes on'); assert(a.room.players[1].left, 'seat marked as left');
    await wait(4000); assert(a.view.hives[1].sites.length + a.view.hives[1].cells.length > 1, 'AI took over hive 1 and started building');
    console.log('snapshot size ~' + Math.round(a.bytes / a.states) + ' bytes, ' + a.states + ' states in ~5.6s');

    // 모두 나가면 방이 사라진다
    const code = a.room.code; a.ws.close(); await wait(300);
    d.send({ t: 'join', code, name: 'd' }); await wait(150); assert.strictEqual(d.errors.length, 1, 'room removed when empty');
    c.ws.close(); d.ws.close(); console.log('net ok');
  } finally { srv.kill(); }
})().catch((e) => { console.error(e); process.exit(1); });
