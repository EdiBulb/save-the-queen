// 여왕을 지켜라 — 서버와 화면이 주고받는 상태의 포장(pack)과 풀기(unpack). 서버(Node)와 브라우저가 같이 쓴다.
(function (root) {
  const ROLE_LIST = ['gather', 'build', 'nurse', 'defend', 'attack', 'drone'];
  const STAGES = ['egg', 'larva', 'pupa'];
  const r1 = (v) => Math.round(v * 10) / 10;

  // 서버: 게임 상태 → 보낼 꾸러미. 보내고 나면 '맞았다' 표시와 사건 목록을 비운다.
  function pack(s) {
    const snap = {
      t: r1(s.time),
      o: s.over,
      w: s.winner,
      f: s.flowers.map((f) => [f.x, f.y, f.big ? 1 : 0, f.wiltAt]),
      h: s.hives.map((h) => ({
        x: h.x, y: h.y, fl: h.flowerId, g: h.gatherAt, hn: r1(h.honey),
        c: h.cells.map((c) => [
          c.q, c.r, Math.round(c.hp), c.flash > 0 ? 1 : 0, c.builtAt === undefined ? -1 : r1(c.builtAt),
          c.brood ? [STAGES.indexOf(c.brood.stage), c.brood.kind === 'drone' ? 1 : 0, c.brood.fed, r1(c.brood.t), c.brood.royal ? 1 : 0] : 0,
        ]),
        s: h.sites.map((st) => [st.q, st.r, r1(st.progress)]),
        p: h.pending ? [h.pending.q, h.pending.r] : 0,
        qa: h.queenAlive ? 1 : 0, qh: Math.round(h.queenHp), qf: h.queenFlash > 0 ? 1 : 0,
        rm: h.raidMode, at: h.attackTarget, dt: h.droneTarget, dr: h.drones,
        rad: r1(h.radius), st: h.starving ? 1 : 0, df: h.defeated ? 1 : 0, lh: r1(h.lastHit),
      })),
      b: s.bees.map((b) => {
        const where = b.state === 'feed' ? b.target : b.state === 'build' ? b.site : null;
        const flags = (b.carry > 0 ? 1 : 0) | (b.loot > 0 ? 2 : 0) | (b.captive ? 4 : 0) | (b.flash > 0 ? 8 : 0) | (b.state === 'feed' ? 16 : 0) | (b.state === 'build' ? 32 : 0);
        const a = [b.id, b.hive, ROLE_LIST.indexOf(b.role), Math.round(b.x), Math.round(b.y), r1(b.hp), flags, r1(b.born)];
        if (where) a.push(where.q, where.r);
        return a;
      }),
      e: s.events.slice(),
    };
    for (const h of s.hives) {
      h.queenFlash = 0;
      for (const c of h.cells) c.flash = 0;
    }
    for (const b of s.bees) b.flash = 0;
    s.events.length = 0;
    return snap;
  }

  // 화면: 아직 아무것도 받지 못했을 때의 빈 상태
  function emptyView() {
    return { time: 0, over: null, winner: null, hives: [], bees: [], flowers: [], events: [], ready: false, _bees: new Map() };
  }

  // 화면: 받은 꾸러미를 화면이 그리는 모양의 상태로 푼다. 벌의 위치는 부드럽게 이어지도록 목표(tx, ty)로만 넣는다.
  function unpack(view, snap) {
    view.time = snap.t;
    view.over = snap.o;
    view.winner = snap.w;
    view.ready = true;
    view.flowers = snap.f.map((f) => ({ x: f[0], y: f[1], big: !!f[2], wiltAt: f[3] }));
    view.hives = snap.h.map((h, id) => ({
      id, x: h.x, y: h.y, flowerId: h.fl, gatherAt: h.g, honey: h.hn,
      cells: h.c.map((c) => ({
        q: c[0], r: c[1], queen: c[0] === 0 && c[1] === 0, hp: c[2], flash: c[3] ? 6 : 0,
        builtAt: c[4] < 0 ? undefined : c[4],
        brood: c[5] ? { stage: STAGES[c[5][0]], kind: c[5][1] ? 'drone' : 'worker', fed: c[5][2], pending: 0, t: c[5][3], royal: !!c[5][4] } : null,
      })),
      sites: h.s.map((st) => ({ q: st[0], r: st[1], progress: st[2] })),
      pending: h.p ? { q: h.p[0], r: h.p[1] } : null,
      queenAlive: !!h.qa, queenHp: h.qh, queenFlash: h.qf ? 6 : 0,
      raidMode: h.rm, attackTarget: h.at, droneTarget: h.dt, drones: h.dr,
      radius: h.rad, starving: !!h.st, defeated: !!h.df, lastHit: h.lh,
    }));
    const seen = new Set();
    for (const a of snap.b) {
      const id = a[0];
      seen.add(id);
      let b = view._bees.get(id);
      if (!b) {
        b = { id, x: a[3], y: a[4], flash: 0 };
        view._bees.set(id, b);
      }
      b.hive = a[1];
      b.role = ROLE_LIST[a[2]];
      b.tx = a[3];
      b.ty = a[4];
      b.hp = a[5];
      const fl = a[6];
      b.carry = fl & 1 ? 1 : 0;
      b.loot = fl & 2 ? 1 : 0;
      b.captive = fl & 4 ? true : null;
      if (fl & 8) b.flash = 6;
      b.state = fl & 16 ? 'feed' : fl & 32 ? 'build' : '';
      b.born = a[7];
      const where = a.length > 8 ? { q: a[8], r: a[9] } : null;
      b.target = b.state === 'feed' ? where : null;
      b.site = b.state === 'build' ? where : null;
    }
    for (const id of view._bees.keys()) if (!seen.has(id)) view._bees.delete(id);
    view.bees = Array.from(view._bees.values());
    for (const e of snap.e) view.events.push(e);
  }

  // 화면: 매 프레임, 벌을 목표 위치 쪽으로 부드럽게 옮기고 시계를 흘려 보낸다
  function smooth(view, dt) {
    if (!view.over) view.time += dt;
    const k = Math.min(1, dt * 12);
    for (const b of view.bees) {
      b.x += (b.tx - b.x) * k;
      b.y += (b.ty - b.y) * k;
    }
  }

  const api = { pack, emptyView, unpack, smooth };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Net = api;
})(typeof window !== 'undefined' ? window : globalThis);
