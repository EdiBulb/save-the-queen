// 여왕을 지켜라 — 게임 서버. 방을 만들고, 방마다 게임(sim.js)을 돌리고, 상태를 1초에 10번 보낸다.
//   실행: npm install && npm start   (기본 포트 3000, Render 등에서는 PORT 환경 변수 사용)
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const Sim = require('../src/sim.js');
const Net = require('../src/net.js');

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, '..');
const TICK_MS = 33; // 게임 계산 간격
const SEND_EVERY = 3; // 계산 3번에 한 번 상태를 보낸다 (1초에 약 10번)
const SEATS = 3;
const AI_FOR_SEAT = ['turtle', 'aggro', 'turtle']; // 빈 자리나 나간 사람 자리를 맡는 AI
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json' };

// ---- 화면 파일도 같이 내려준다 (서버 하나만 올려도 게임이 되도록) ----
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/health') return void res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');
  if (url === '/config.js') {
    // 이 서버에서 화면을 받았다면 게임 서버는 '같은 주소'
    return void res.writeHead(200, { 'Content-Type': TYPES['.js'] }).end("window.STQ_SERVER = 'same';\n");
  }
  const rel = url === '/' ? 'index.html' : url.slice(1);
  const allowed = rel === 'index.html' || (rel.startsWith('src/') && !rel.includes('..'));
  const file = path.join(ROOT, rel);
  if (!allowed || !fs.existsSync(file)) return void res.writeHead(404).end('not found');
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
});

// ---- 방 ----
const rooms = new Map(); // 방 코드 → 방
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // 헷갈리는 I, O는 뺀다

function newCode() {
  for (;;) {
    let code = '';
    for (let i = 0; i < 4; i++) code += LETTERS[Math.floor(Math.random() * LETTERS.length)];
    if (!rooms.has(code)) return code;
  }
}
function send(ws, msg) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}
function cleanName(name, seat) {
  const n = String(name || '').replace(/[<>&"']/g, '').trim().slice(0, 10);
  return n || '벌집 ' + (seat + 1);
}
function roomInfo(room) {
  return {
    t: 'room', code: room.code, host: room.host, playing: !!room.state,
    players: room.seats.map((p, seat) => (p ? { seat, name: p.name, left: !p.ws } : null)),
  };
}
function broadcast(room, msg) {
  for (const p of room.seats) if (p) send(p.ws, msg);
}
function sendRoom(room) {
  room.seats.forEach((p, seat) => p && send(p.ws, Object.assign({ you: seat }, roomInfo(room))));
}

function startGame(room) {
  const ai = room.seats.map((p, seat) => (p && p.ws ? null : AI_FOR_SEAT[seat]));
  room.state = Sim.createState(Math.random, { ai, multi: true });
  room.names = room.seats.map((p, seat) => (p && p.ws ? p.name : 'AI ' + (seat + 1)));
  broadcast(room, { t: 'start', names: room.names });
  let last = Date.now();
  let n = 0;
  clearInterval(room.timer);
  room.timer = setInterval(() => {
    const now = Date.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    Sim.update(room.state, dt);
    if (++n % SEND_EVERY === 0 || room.state.over) {
      broadcast(room, { t: 'state', s: Net.pack(room.state) });
      if (room.state.over) endGame(room);
    }
  }, TICK_MS);
}

function endGame(room) {
  clearInterval(room.timer);
  room.timer = null;
  room.state = null;
  // 나간 사람 자리는 비운다 (다음 판에는 AI가 채운다)
  room.seats = room.seats.map((p) => (p && p.ws ? p : null));
  if (!room.seats[room.host]) room.host = room.seats.findIndex((p) => p);
  sendRoom(room);
}

function leave(ws) {
  const room = ws.room;
  if (!room) return;
  ws.room = null;
  const seat = room.seats.findIndex((p) => p && p.ws === ws);
  if (seat < 0) return;
  if (room.state) {
    // 게임 중에 나가면 그 벌집은 AI가 이어받는다
    room.seats[seat].ws = null;
    Sim.setAI(room.state.hives[seat], AI_FOR_SEAT[seat]);
  } else {
    room.seats[seat] = null;
  }
  if (!room.seats.some((p) => p && p.ws)) {
    clearInterval(room.timer);
    rooms.delete(room.code);
    return;
  }
  if (!room.seats[room.host] || !room.seats[room.host].ws) room.host = room.seats.findIndex((p) => p && p.ws);
  sendRoom(room);
}

const wss = new WebSocket.Server({ server, maxPayload: 4096 });
wss.on('connection', (ws) => {
  ws.alive = true;
  ws.on('pong', () => (ws.alive = true));
  ws.on('close', () => leave(ws));
  ws.on('error', () => {});
  ws.on('message', (raw) => {
    let m;
    try {
      m = JSON.parse(raw);
    } catch (e) {
      return;
    }
    if (!m || typeof m !== 'object') return;
    const room = ws.room;

    if (m.t === 'create' && !room) {
      const r = { code: newCode(), seats: new Array(SEATS).fill(null), host: 0, state: null, timer: null };
      r.seats[0] = { ws, name: cleanName(m.name, 0) };
      rooms.set(r.code, r);
      ws.room = r;
      sendRoom(r);
    } else if (m.t === 'join' && !room) {
      const r = rooms.get(String(m.code || '').toUpperCase().trim());
      if (!r) return send(ws, { t: 'error', msg: '그런 방이 없어요. 코드를 다시 확인해 주세요.' });
      if (r.state) return send(ws, { t: 'error', msg: '이미 게임을 시작한 방이에요. 판이 끝나면 다시 들어와 주세요.' });
      const seat = r.seats.findIndex((p) => !p);
      if (seat < 0) return send(ws, { t: 'error', msg: '방이 꽉 찼어요 (최대 3명).' });
      r.seats[seat] = { ws, name: cleanName(m.name, seat) };
      ws.room = r;
      sendRoom(r);
    } else if (m.t === 'start' && room && !room.state) {
      const seat = room.seats.findIndex((p) => p && p.ws === ws);
      if (seat === room.host) startGame(room);
    } else if (m.t === 'cmd' && room && room.state) {
      const seat = room.seats.findIndex((p) => p && p.ws === ws);
      if (seat >= 0) Sim.applyCommand(room.state, seat, m.c);
    } else if (m.t === 'leave') {
      leave(ws);
    }
  });
});

// 끊어진 연결 정리
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) {
      ws.terminate();
      continue;
    }
    ws.alive = false;
    ws.ping();
  }
}, 30000);

server.listen(PORT, () => console.log('여왕을 지켜라 서버가 ' + PORT + '번 포트에서 돌아가요'));
