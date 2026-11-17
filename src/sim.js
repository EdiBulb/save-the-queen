// 여왕을 지켜라 — 게임 규칙(시뮬레이션). 화면 그리기와 분리되어 있어 Node에서도 테스트할 수 있다.
(function (root) {
  // 밸런스 숫자는 전부 여기서 조정한다.
  const CONFIG = {
    WIDTH: 800,
    HEIGHT: 400,
    MAP_HEX: 7.5, // 맵 화면에서 칸 하나의 크기(px)
    BEE_SPEED: 90, // px/초
    START_HONEY: 20,
    START_BEES: { gather: 2, build: 1, nurse: 1 },
    CARRY: 4, // 기본 꽃밭에서 한 번에 나르는 꿀
    CARRY_BIG: 8, // 가운데 큰 꽃밭에서 한 번에 나르는 꿀
    WILT_BASIC: 360, // 기본 꽃밭이 지는 시각(초)
    WILT_CENTER: 540, // 가운데 꽃밭이 지는 시각(초)
    COLLECT_TIME: 3, // 꽃에서 꿀 모으는 시간(초)
    CELL_COST: 10, // 첫 칸을 짓는 데 드는 꿀
    CELL_COST_STEP: 2, // 칸이 하나 늘 때마다 오르는 값
    BUILD_TIME: 6, // 짓기 벌 한 마리 기준 걸리는 시간(초)
    LAY_INTERVAL: 4, // 수벌이 없을 때 여왕이 알 낳는 간격(초)
    DRONE_BOOST: 0.25, // 수벌 한 마리당 알 낳는 속도 증가 (0.25 = 25%)
    DRONE_MAX: 10, // 수벌 목표 최대치
    DRONE_NEED: 30, // 수벌 애벌레가 다 자라는 데 필요한 꿀
    DRONE_UPKEEP: 0.25, // 수벌 한 마리가 1초에 먹는 꿀
    EGG_TIME: 4,
    PUPA_TIME: 4,
    LARVA_NEED: 20, // 애벌레가 다 자라는 데 필요한 꿀
    FEED_AMOUNT: 4, // 한 번 먹일 때 쓰는 꿀
    FEED_TIME: 1.5,
    // 전투
    BEE_HP: 12,
    BEE_DPS: 3, // 초당 피해
    CELL_HP: 60,
    QUEEN_HP: 400,
    GUARD_ARMOR: 0.7, // 수비 벌이 받는 피해 배율 (집 근처라 유리하다)
    DEFEND_RADIUS: 85, // 수비 벌이 반응하는 거리(벌집 중심 기준)
    STEAL_FRAC: 0.15, // 칸 하나 부술 때 훔치는 꿀 비율
    EAT_HONEY: 5, // 애벌레를 먹으면 얻는 꿀
    LOOT_CAP: 20, // 이만큼 훔치면 집에 다녀옴
    ROYAL_COST: 30, // 새 여왕을 키우는 데 드는 꿀
    ROYAL_TIME: 15, // 새 여왕이 자라는 시간(초)
    RAID_TIME: 20, // 꽃이 남아 있는 동안 AI의 습격 한 번이 이어지는 시간(초)
    RAID_REST: 45, // 습격 뒤 다음 습격까지 쉬는 시간(초)
  };

  const ROLES = ['gather', 'build', 'nurse', 'defend', 'attack'];
  const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  const SQRT3 = Math.sqrt(3);

  // 육각형 좌표(q, r) → 화면 좌표. 뾰족한 쪽이 위.
  function hexPos(q, r, size, cx, cy) {
    return { x: cx + size * SQRT3 * (q + r / 2), y: cy + size * 1.5 * r };
  }
  function hexDist(q, r) {
    return (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
  }
  function worldPos(h, c) {
    return hexPos(c.q, c.r, CONFIG.MAP_HEX, h.x, h.y);
  }
  function at(list, q, r) {
    return list.find((c) => c.q === q && c.r === r);
  }
  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
  function newCell(q, r) {
    return { q, r, queen: q === 0 && r === 0, brood: null, hp: CONFIG.CELL_HP };
  }

  // 화면(효과음·숫자 표시)에 알려줄 일들을 쌓아 둔다
  function emit(s, type, hive, data) {
    s.events.push(Object.assign({ type, hive }, data));
  }

  function newBee(s, h, role, x, y) {
    const bee = {
      id: s.nextId++,
      hive: h.id,
      role,
      hp: CONFIG.BEE_HP,
      born: s.time, // 태어난 시각 (튀어나오는 연출용)
      state: 'idle',
      x,
      y,
      carry: 0, // 꽃에서 가져오는 꿀
      loot: 0, // 훔친 꿀
      captive: null, // 납치한 애벌레
      timer: 0,
      target: null, // 먹이는 중인 칸
      site: null, // 짓는 중인 공사 자리
      ox: (s.rand() - 0.5) * 50, // 꽃밭에서 벌마다 조금씩 다른 자리
      oy: (s.rand() - 0.5) * 50,
      wx: x,
      wy: y,
      wt: 0,
    };
    s.bees.push(bee);
    return bee;
  }

  function addHive(s, opt) {
    const h = {
      id: s.hives.length,
      x: opt.x,
      y: opt.y,
      flowerId: opt.flowerId, // 내 기본 꽃밭
      gatherAt: opt.flowerId, // 채집 벌이 가는 꽃밭
      ai: opt.ai ? { type: opt.ai, timer: 1 + opt.flowerId * 0.5, raidStart: 0, nextRaid: 0 } : null, // 'aggro' 공격형 | 'turtle' 수비형
      honey: opt.honey,
      cells: [newCell(0, 0)], // 벌집 한 칸 + 여왕으로 시작
      sites: [], // 짓는 중인 칸
      layTimer: 0,
      queenAlive: true,
      queenHp: CONFIG.QUEEN_HP,
      raidMode: 'eat', // 애벌레를 찾으면: 'eat' 먹기 | 'kidnap' 납치
      attackTarget: null, // 공격 중인 벌집 번호
      auto: !!opt.auto, // 사람이 조종하지 않는 벌집
      defeated: false,
      pending: null, // 꿀을 모으는 중인 칸 주문 {q, r}
      droneTarget: 0, // 수벌을 몇 마리까지 키울지
      drones: 0, // 지금 수벌 수 (매 틱 갱신)
      radius: 0, // 벌집이 차지하는 반경(px, 매 틱 갱신)
      starving: false, // 꿀이 없어 수벌이 굶는 중
      lastHit: -99, // 마지막으로 공격받은 시각
    };
    s.hives.push(h);
    for (const role of Object.keys(opt.bees)) {
      for (let i = 0; i < opt.bees[role]; i++) {
        newBee(s, h, role, h.x + (s.rand() - 0.5) * 60, h.y + (s.rand() - 0.5) * 60);
      }
    }
    return h;
  }

  // opts.playerAI: 플레이어 벌집도 AI가 조종 (자동 대전 테스트용)
  // opts.ai: 자리별 조종자 [0번, 1번, 2번]. null = 사람, 'aggro' | 'turtle' = AI
  // opts.multi: 여러 사람이 하는 판 (마지막 한 벌집이 남을 때 끝난다)
  function createState(rand, opts) {
    opts = opts || {};
    const s = { rand: rand || Math.random, time: 0, hives: [], bees: [], flowers: [], events: [], nextId: 1, over: null, winner: null, spectate: !!opts.playerAI, multi: !!opts.multi };
    const ais = opts.ai || [opts.playerAI || null, 'aggro', 'turtle'];
    // 세 벌집은 정삼각형 꼭짓점에, 가운데에 큰 꽃밭. 각자 기본 꽃밭은 바깥쪽으로 같은 거리.
    const spots = [
      { x: 400, y: 300, fx: 295, fy: 300, ai: ais[0] }, // 0번 = 혼자 할 때의 플레이어
      { x: 270, y: 75, fx: 165, fy: 75, ai: ais[1] },
      { x: 530, y: 75, fx: 635, fy: 75, ai: ais[2] },
    ];
    for (const p of spots) s.flowers.push({ x: p.fx, y: p.fy, big: false, wiltAt: CONFIG.WILT_BASIC });
    s.flowers.push({ x: 400, y: 150, big: true, wiltAt: CONFIG.WILT_CENTER });
    spots.forEach((p, i) =>
      addHive(s, { x: p.x, y: p.y, flowerId: i, honey: CONFIG.START_HONEY, bees: CONFIG.START_BEES, ai: p.ai, auto: !!p.ai })
    );
    return s;
  }

  function flowerAlive(s, f) {
    return s.time < f.wiltAt;
  }
  // 남은 꽃의 비율 (0~1). 화면 위 게이지용.
  function flowersLeft(s) {
    return Math.max(0, 1 - s.time / CONFIG.WILT_CENTER);
  }
  // 채집 벌이 갈 꽃밭: 고른 곳 → 내 기본 꽃밭 → 가운데 순으로, 아직 피어 있는 곳
  function gatherFlower(s, h) {
    const order = [h.gatherAt, h.flowerId, s.flowers.length - 1];
    for (const i of order) if (flowerAlive(s, s.flowers[i])) return s.flowers[i];
    return null;
  }

  // 지금 칸을 지을 수 있는 빈 자리들 (지어진 칸 바로 옆)
  function buildableSpots(h) {
    const out = [];
    for (const c of h.cells) {
      for (const [dq, dr] of DIRS) {
        const q = c.q + dq;
        const r = c.r + dr;
        if (at(h.cells, q, r) || at(h.sites, q, r) || at(out, q, r)) continue;
        out.push({ q, r });
      }
    }
    return out;
  }

  // 다음 칸을 짓는 데 드는 꿀. 벌집이 커질수록 비싸진다.
  function cellCost(h) {
    return CONFIG.CELL_COST + CONFIG.CELL_COST_STEP * (h.cells.length + h.sites.length - 1);
  }

  // 칸 짓기 주문. 결과: 'ok' | 'saving'(꿀을 모으기 시작) | 'cancel'(모으기 취소) | 'invalid'
  // 꿀이 모자라면 주문을 걸어 두고, 값이 모일 때까지 애벌레 먹이기를 멈춘다.
  function orderCell(h, q, r) {
    if (h.pending && h.pending.q === q && h.pending.r === r) {
      h.pending = null;
      return 'cancel';
    }
    if (!at(buildableSpots(h), q, r)) return 'invalid';
    const cost = cellCost(h);
    if (h.honey < cost) {
      h.pending = { q, r };
      return 'saving';
    }
    h.honey -= cost;
    h.sites.push({ q, r, progress: 0 });
    if (h.pending && !at(buildableSpots(h), h.pending.q, h.pending.r)) h.pending = null;
    return 'ok';
  }

  function updatePending(h) {
    if (!h.pending) return;
    if (!at(buildableSpots(h), h.pending.q, h.pending.r)) h.pending = null; // 옆 칸이 부서져 지을 수 없게 됨
    else if (h.honey >= cellCost(h)) {
      const p = h.pending;
      h.pending = null;
      orderCell(h, p.q, p.r);
    }
  }

  // 여왕이 죽었을 때 애벌레 하나를 새 여왕으로 키운다. 결과: 'ok' | 'honey' | 'invalid'
  function chooseRoyal(h, q, r) {
    const c = at(h.cells, q, r);
    if (h.queenAlive || !c || !c.brood || c.brood.stage !== 'larva') return 'invalid';
    if (h.cells.some((x) => x.brood && x.brood.royal)) return 'invalid';
    if (h.honey < CONFIG.ROYAL_COST) return 'honey';
    h.honey -= CONFIG.ROYAL_COST;
    c.brood.royal = true;
    c.brood.t = 0;
    return 'ok';
  }

  // 공격 명령. target = 벌집 번호, null이면 철수.
  function setAttack(s, hiveId, target) {
    const h = s.hives[hiveId];
    if (target !== null && (target === hiveId || !s.hives[target] || s.hives[target].defeated)) return false;
    h.attackTarget = target;
    if (target !== null) emit(s, 'attack', hiveId, { target });
    return true;
  }

  function stepToward(b, tx, ty, dt) {
    const dx = tx - b.x;
    const dy = ty - b.y;
    const d = Math.hypot(dx, dy);
    const step = CONFIG.BEE_SPEED * dt;
    if (d <= step) {
      b.x = tx;
      b.y = ty;
      return true;
    }
    b.x += (dx / d) * step;
    b.y += (dy / d) * step;
    return false;
  }

  function wander(s, h, b, dt) {
    b.wt -= dt;
    if (b.wt <= 0) {
      b.wt = 1 + s.rand() * 2;
      const spread = Math.max(110, h.radius * 2 + 50);
      b.wx = h.x + (s.rand() - 0.5) * spread;
      b.wy = h.y + (s.rand() - 0.5) * spread;
    }
    stepToward(b, b.wx, b.wy, dt * 0.4);
  }

  function returnHoney(s, h, b, dt) {
    if (stepToward(b, h.x, h.y, dt)) {
      h.honey += b.carry;
      emit(s, 'deposit', h.id, { amount: b.carry });
      b.carry = 0;
      b.state = 'idle';
    }
  }

  // 훔친 꿀과 납치한 애벌레를 집에 가져다 놓는다. 도착하면 true.
  function deliver(s, h, b, dt) {
    if (!stepToward(b, h.x, h.y, dt)) return false;
    h.honey += b.loot;
    if (b.loot > 0) emit(s, 'loot', h.id, { amount: b.loot });
    b.loot = 0;
    if (b.captive) {
      const free = h.cells.find((c) => !c.queen && !c.brood);
      if (free) free.brood = b.captive; // 내 일벌로 자란다
      else h.honey += CONFIG.EAT_HONEY; // 둘 칸이 없으면 먹는다
      b.captive = null;
    }
    b.state = 'idle';
    return true;
  }

  function updateGather(s, h, b, dt) {
    if (b.state === 'toHive') return returnHoney(s, h, b, dt);
    if (b.state === 'collect') {
      b.timer -= dt;
      if (b.timer <= 0) {
        b.carry = b.yield;
        b.state = 'toHive';
        emit(s, 'collect', h.id, { x: b.x, y: b.y, big: b.yield === CONFIG.CARRY_BIG });
      }
      return;
    }
    const f = gatherFlower(s, h);
    if (!f) return wander(s, h, b, dt); // 꽃이 다 졌다
    b.state = 'toFlower';
    const k = f.big ? 1.4 : 0.8;
    if (stepToward(b, f.x + b.ox * k, f.y + b.oy * k, dt)) {
      b.state = 'collect';
      b.timer = CONFIG.COLLECT_TIME;
      b.yield = f.big ? CONFIG.CARRY_BIG : CONFIG.CARRY;
    }
  }

  function updateBuild(s, h, b, dt) {
    if (b.site && !h.sites.includes(b.site)) b.site = null; // 다른 벌이 먼저 완성함
    if (!b.site) {
      if (!h.sites.length) return wander(s, h, b, dt);
      b.site = h.sites[0];
      b.state = 'toSite';
    }
    if (b.state !== 'build') {
      const p = worldPos(h, b.site);
      if (stepToward(b, p.x, p.y, dt)) b.state = 'build';
    } else {
      b.site.progress += dt;
      if (b.site.progress >= CONFIG.BUILD_TIME) {
        h.sites.splice(h.sites.indexOf(b.site), 1);
        const made = newCell(b.site.q, b.site.r);
        made.builtAt = s.time; // 완성된 시각 (통 튀는 연출용)
        h.cells.push(made);
        emit(s, 'built', h.id, { q: made.q, r: made.r });
        b.site = null;
        b.state = 'idle';
      }
    }
  }

  // 애벌레가 다 자라는 데 필요한 꿀 (수벌이 더 든다)
  function needOf(br) {
    return br.kind === 'drone' ? CONFIG.DRONE_NEED : CONFIG.LARVA_NEED;
  }
  // 지금 알 낳는 간격(초). 수벌이 많을수록 짧아진다.
  function layInterval(h) {
    return CONFIG.LAY_INTERVAL / (1 + CONFIG.DRONE_BOOST * h.drones);
  }

  function needsFood(c) {
    const br = c.brood;
    return br && br.stage === 'larva' && !br.royal && br.fed + br.pending < needOf(br);
  }

  function updateNurse(s, h, b, dt) {
    if (b.target && !h.cells.includes(b.target)) b.target = null; // 칸이 부서짐
    if (!b.target) {
      // 칸 값을 모으는 중이면 먹이기를 멈춘다
      const c = !h.pending && h.honey >= CONFIG.FEED_AMOUNT ? h.cells.find(needsFood) : null;
      if (!c) return wander(s, h, b, dt);
      h.honey -= CONFIG.FEED_AMOUNT; // 먹이를 들고 출발
      emit(s, 'feed', h.id, { amount: CONFIG.FEED_AMOUNT });
      c.brood.pending += CONFIG.FEED_AMOUNT;
      b.target = c;
      b.state = 'toLarva';
    }
    if (b.state !== 'feed') {
      const p = worldPos(h, b.target);
      if (stepToward(b, p.x, p.y, dt)) {
        b.state = 'feed';
        b.timer = CONFIG.FEED_TIME;
      }
    } else {
      b.timer -= dt;
      if (b.timer <= 0) {
        const br = b.target.brood;
        if (br && br.stage === 'larva') {
          br.pending = Math.max(0, br.pending - CONFIG.FEED_AMOUNT);
          br.fed += CONFIG.FEED_AMOUNT;
        }
        b.target = null;
        b.state = 'idle';
      }
    }
  }

  function nearest(list, from) {
    let best = null;
    let bd = Infinity;
    for (const x of list) {
      const d = dist(x, from);
      if (d < bd) {
        bd = d;
        best = x;
      }
    }
    return best;
  }

  // 상대 벌에게 다가가서 때린다
  function fight(b, foe, dt) {
    if (dist(b, foe) > 10) stepToward(b, foe.x, foe.y, dt);
    else {
      foe.hp -= CONFIG.BEE_DPS * dt * (foe.role === 'defend' ? CONFIG.GUARD_ARMOR : 1);
      foe.flash = 6; // 맞는 순간 화면에서 하얗게 번쩍이게 (그리는 쪽에서 줄여 나간다)
    }
  }

  function updateDefend(s, h, b, dt) {
    const raiders = s.bees.filter(
      (x) => x.hive !== h.id && x.role === 'attack' && x.hp > 0 && dist(x, h) < Math.max(CONFIG.DEFEND_RADIUS, h.radius + 50)
    );
    // 가장 많이 다친 침입자부터 함께 노린다 (같으면 가까운 쪽)
    let foe = null;
    for (const x of raiders) {
      if (!foe || x.hp < foe.hp - 0.01 || (Math.abs(x.hp - foe.hp) <= 0.01 && dist(x, b) < dist(foe, b))) foe = x;
    }
    if (foe) fight(b, foe, dt);
    else wander(s, h, b, dt);
  }

  function destroyCell(s, attacker, T, cell, b) {
    T.cells.splice(T.cells.indexOf(cell), 1);
    emit(s, 'cellLost', T.id, { by: attacker.id, q: cell.q, r: cell.r });
    const steal = Math.min(T.honey, Math.ceil(T.honey * CONFIG.STEAL_FRAC));
    T.honey -= steal;
    b.loot += steal;
    if (cell.brood) {
      if (attacker.raidMode === 'kidnap' && !b.captive) {
        b.captive = { stage: cell.brood.stage, kind: cell.brood.kind, t: cell.brood.t, fed: cell.brood.fed, pending: 0 };
      } else {
        b.loot += CONFIG.EAT_HONEY;
      }
    }
  }

  // 점 p에서 선분 a→b까지의 거리
  function segDist(p, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
  }

  function hitCell(s, h, T, b, t, dt) {
    if (dist(b, t) > CONFIG.MAP_HEX) return void stepToward(b, t.x, t.y, dt);
    t.c.hp -= CONFIG.BEE_DPS * dt;
    t.c.flash = 6;
    if (t.c.hp <= 0) destroyCell(s, h, T, t.c, b);
  }

  function updateAttack(s, h, b, dt) {
    const T = h.attackTarget !== null ? s.hives[h.attackTarget] : null;
    const goHome = !T || b.captive || b.loot >= CONFIG.LOOT_CAP;
    if (goHome) {
      if (b.loot > 0 || b.captive || dist(b, h) > h.radius + 50) deliver(s, h, b, dt);
      else wander(s, h, b, dt);
      return;
    }
    if (dist(b, T) > T.radius + 40) return void stepToward(b, T.x, T.y, dt);

    T.lastHit = s.time;
    // 1) 가까운 수비 벌부터 상대한다
    const guards = s.bees.filter((x) => x.hive === T.id && x.role === 'defend' && x.hp > 0 && dist(x, b) < 60);
    const foe = nearest(guards, b);
    if (foe) return fight(b, foe, dt);

    // 2) 근처의 수벌을 잡는다 (알 낳는 속도를 떨어뜨린다)
    const drone = nearest(s.bees.filter((x) => x.hive === T.id && x.role === 'drone' && x.hp > 0 && dist(x, b) < 40), b);
    if (drone) return fight(b, drone, dt);

    if (T.queenAlive) {
      // 3) 여왕을 향해 곧장 간다. 가는 길을 막는 칸만 부순다 (길 하나만 뚫으면 된다).
      if (dist(b, T) <= CONFIG.MAP_HEX * 1.9) {
        T.queenHp -= CONFIG.BEE_DPS * dt;
        T.queenFlash = 6;
        if (T.queenHp <= 0) {
          T.queenAlive = false;
          emit(s, 'queenDied', T.id, { by: h.id });
        }
        return;
      }
      const walls = [];
      for (const c of T.cells) {
        if (c.queen) continue;
        const p = worldPos(T, c);
        if (segDist(p, b, T) < CONFIG.MAP_HEX * 0.95) walls.push({ c, x: p.x, y: p.y });
      }
      const t = nearest(walls, b);
      if (t) hitCell(s, h, T, b, t, dt);
      else stepToward(b, T.x, T.y, dt);
      return;
    }

    // 4) 여왕이 죽었으면 새 여왕이 될 수 있는 알·애벌레 칸을 노린다
    const nests = T.cells
      .filter((c) => c.brood && (c.brood.stage === 'egg' || c.brood.stage === 'larva'))
      .map((c) => ({ c, ...worldPos(T, c) }));
    const t = nearest(nests, b);
    if (t) hitCell(s, h, T, b, t, dt);
  }

  function updateBrood(s, h, dt) {
    if (h.queenAlive) {
      const every = layInterval(h);
      h.layTimer = Math.min(h.layTimer + dt, every);
      if (h.layTimer >= every) {
        // 여왕과 가까운 빈 칸부터 알을 낳는다
        const free = h.cells
          .filter((c) => !c.queen && !c.brood)
          .sort((a, b) => hexDist(a.q, a.r) - hexDist(b.q, b.r))[0];
        if (free) {
          // 수벌이 목표보다 적으면 수벌 알을 낳는다
          const dronesComing = h.cells.filter((c) => c.brood && c.brood.kind === 'drone').length;
          const kind = h.drones + dronesComing < h.droneTarget ? 'drone' : 'worker';
          free.brood = { stage: 'egg', kind, t: 0, fed: 0, pending: 0 };
          h.layTimer = 0;
        }
      }
    } else if (h.auto && !h.cells.some((c) => c.brood && c.brood.royal)) {
      const c = h.cells.find((x) => x.brood && x.brood.stage === 'larva');
      if (c) chooseRoyal(h, c.q, c.r);
    }

    for (const c of h.cells) {
      const br = c.brood;
      if (!br) continue;
      if (br.stage === 'egg') {
        br.t += dt;
        if (br.t >= CONFIG.EGG_TIME) {
          br.stage = 'larva';
          br.t = 0;
        }
      } else if (br.stage === 'larva' && br.royal) {
        br.t += dt;
        if (br.t >= CONFIG.ROYAL_TIME) {
          // 새 여왕 탄생. 여왕은 항상 가운데 칸에 있다.
          c.brood = null;
          h.queenAlive = true;
          emit(s, 'newQueen', h.id);
          h.queenHp = CONFIG.QUEEN_HP;
          h.layTimer = 0;
          if (!at(h.cells, 0, 0)) h.cells.push(newCell(0, 0));
        }
      } else if (br.stage === 'larva') {
        if (br.fed >= needOf(br)) {
          br.stage = 'pupa';
          br.t = 0;
        }
      } else if (br.stage === 'pupa') {
        br.t += dt;
        if (br.t >= CONFIG.PUPA_TIME) {
          const p = worldPos(h, c);
          newBee(s, h, br.kind === 'drone' ? 'drone' : 'gather', p.x, p.y);
          emit(s, 'born', h.id);
          c.brood = null;
        }
      }
    }
  }

  // 패배: 여왕도 없고, 새 여왕으로 키울 알·애벌레도 없을 때
  function checkDefeat(s, h) {
    if (h.defeated || h.queenAlive) return;
    if (h.cells.some((c) => c.brood && (c.brood.stage === 'egg' || c.brood.stage === 'larva'))) return;
    h.defeated = true;
    emit(s, 'defeated', h.id);
    h.attackTarget = null;
    h.pending = null;
    s.bees = s.bees.filter((b) => b.hive !== h.id);
    for (const o of s.hives) if (o.attackTarget === h.id) o.attackTarget = null;
  }

  function updateBee(s, b, dt) {
    const h = s.hives[b.hive];
    if (b.role !== 'gather' && b.carry > 0) return returnHoney(s, h, b, dt); // 역할이 바뀌어도 들고 있던 꿀은 가져다 놓는다
    if (b.role !== 'attack' && (b.loot > 0 || b.captive)) return void deliver(s, h, b, dt);
    if (b.role === 'gather') updateGather(s, h, b, dt);
    else if (b.role === 'build') updateBuild(s, h, b, dt);
    else if (b.role === 'nurse') updateNurse(s, h, b, dt);
    else if (b.role === 'defend') updateDefend(s, h, b, dt);
    else if (b.role === 'drone') {
      wander(s, h, b, dt * 0.6);
      if (h.starving) b.hp -= dt; // 꿀이 떨어지면 수벌부터 굶는다
    } else updateAttack(s, h, b, dt);
  }

  // ---- AI: 단순한 규칙 몇 개. 2초마다 다시 판단한다. ----
  function updateAI(s, h, dt) {
    const ai = h.ai;
    ai.timer -= dt;
    if (ai.timer > 0) return;
    ai.timer = 2;
    const aggro = ai.type === 'aggro';
    const c = counts(s, h.id);
    const n = c.gather + c.build + c.nurse + c.defend + c.attack;
    const anyFlower = s.flowers.some((f) => flowerAlive(s, f));
    const under = s.time - h.lastHit < 3;
    h.raidMode = aggro ? 'eat' : 'kidnap';
    // 수벌: 수비형이 더 많이 키우고, 꿀이 남으면 더 늘린다. 꽃이 지면 유지비가 아까워서 그만 키운다.
    h.droneTarget = !anyFlower || n < 10 ? 0 : Math.min(CONFIG.DRONE_MAX, (aggro ? 2 : 4) + Math.floor(h.honey / 150) * 2);

    // 꽃밭: 공격형은 일찍 가운데로 나오고, 수비형은 늦게 나온다
    h.gatherAt = s.time > (aggro ? 90 : 240) ? s.flowers.length - 1 : h.flowerId;

    // 칸 짓기: 빈 칸이 없거나 꿀이 남으면 짓는다
    const free = h.cells.filter((x) => !x.queen && !x.brood).length;
    const wantMore = free <= 1 || h.honey > 60;
    if (h.sites.length < 2 && wantMore && h.honey >= cellCost(h) + (aggro ? 0 : 10)) {
      const sp = buildableSpots(h).sort((a, b) => hexDist(a.q, a.r) - hexDist(b.q, b.r))[0];
      if (sp) orderCell(h, sp.q, sp.r);
    }

    // 역할 배분
    const brood = h.cells.filter((x) => x.brood).length;
    const want = { gather: 0, build: 0, nurse: 0, defend: 0, attack: 0 };
    want.build = Math.min(h.sites.length, 2);
    want.nurse = brood ? Math.min(8, Math.ceil(brood / 4)) : 0;
    let defFrac = aggro ? 0.2 : 0.25;
    let atkFrac = aggro ? (n >= 24 ? 0.35 : 0) : n >= 60 ? 0.25 : 0;
    if (!anyFlower) {
      defFrac = 0.3; // 꽃이 지면 채집을 접고 싸운다
      atkFrac = 0.7;
    }
    if (under) {
      defFrac += 0.3; // 공격받으면 수비로 돌린다
      atkFrac = Math.min(atkFrac, 1 - defFrac);
    }
    const rest = Math.max(0, n - want.build - want.nurse);
    want.defend = Math.floor(rest * defFrac);
    want.attack = Math.floor(rest * atkFrac);
    const left = rest - want.defend - want.attack;
    if (anyFlower) want.gather = left;
    else want.attack += left;
    want.build = Math.min(want.build, n);
    want.nurse = Math.min(want.nurse, n - want.build);
    for (const to of ROLES) {
      while (c[to] < want[to]) {
        const from = ROLES.find((r) => c[r] > want[r]);
        if (!from || !moveBee(s, h.id, from, to)) break;
        c[from]--;
        c[to]++;
      }
    }

    // 공격 판단: 수비가 가장 약한 벌집을, 충분히 많을 때 친다
    if (h.attackTarget === null) {
      const others = s.hives.filter((o) => o.id !== h.id && !o.defeated);
      if (c.attack >= 3 && others.length && (!anyFlower || s.time >= ai.nextRaid)) {
        const guard = (o) => counts(s, o.id).defend;
        const T = others.sort((a, b) => guard(a) - guard(b) || a.cells.length - b.cells.length)[0];
        // 수비가 유리하니 수비 벌의 1.5배는 모아서 친다
        if (!anyFlower || c.attack >= Math.ceil(guard(T) * 1.5) + 2) {
          setAttack(s, h.id, T.id);
          ai.raidStart = s.time;
        }
      }
    } else if (anyFlower) {
      // 꽃이 남아 있는 동안은 치고 빠진다: 수비보다 적어지면 철수
      const T = s.hives[h.attackTarget];
      // 그리고 한 번에 RAID_TIME초만 털고 돌아가서 쉰다 (결판은 꽃이 진 뒤에)
      if (c.attack < Math.max(3, counts(s, T.id).defend) || s.time - ai.raidStart > CONFIG.RAID_TIME) {
        setAttack(s, h.id, null);
        ai.nextRaid = s.time + CONFIG.RAID_REST;
      }
    }
  }

  function update(s, dt) {
    if (s.over) return;
    if (s.events.length > 500) s.events.length = 0; // 아무도 안 읽으면 비운다
    s.time += dt;
    // 수벌 수를 먼저 센다 (알 낳는 속도와 수벌 목표에 쓰인다)
    for (const h of s.hives) h.drones = 0;
    for (const b of s.bees) if (b.role === 'drone') s.hives[b.hive].drones++;
    for (const h of s.hives) {
      if (h.defeated) continue;
      h.radius = CONFIG.MAP_HEX * (1 + 1.75 * Math.max(...h.cells.map((c) => hexDist(c.q, c.r))));
      updatePending(h);
      updateBrood(s, h, dt);
      if (h.ai) updateAI(s, h, dt);
    }
    for (const b of s.bees.slice()) if (b.hp > 0) updateBee(s, b, dt);

    // 죽은 벌 정리
    for (const b of s.bees) {
      if (b.hp > 0) continue;
      emit(s, 'died', b.hive);
      if (b.target && b.target.brood) b.target.brood.pending = Math.max(0, b.target.brood.pending - CONFIG.FEED_AMOUNT);
    }
    s.bees = s.bees.filter((b) => b.hp > 0);

    // 수벌 유지비
    for (const h of s.hives) {
      const eat = h.drones * CONFIG.DRONE_UPKEEP * dt;
      h.starving = eat > 0 && h.honey < eat;
      if (eat > 0 && !h.starving) {
        h.honey -= eat;
        emit(s, 'upkeep', h.id, { amount: eat });
      }
    }
    for (const h of s.hives) checkDefeat(s, h);
    const alive = s.hives.filter((h) => !h.defeated);
    if (s.spectate || s.multi) {
      if (alive.length <= 1) {
        s.over = 'done';
        s.winner = alive.length ? alive[0].id : null;
      }
    } else if (s.hives[0].defeated) s.over = 'lose';
    else if (alive.length === 1) s.over = 'win';
  }

  // 역할 from의 벌 한 마리를 역할 to로 옮긴다. 옮겼으면 true.
  function moveBee(s, hiveId, from, to) {
    if (from === to || !ROLES.includes(from) || !ROLES.includes(to)) return false; // 수벌은 역할을 바꿀 수 없다
    const h = s.hives[hiveId];
    const pool = s.bees.filter((b) => b.hive === hiveId && b.role === from);
    if (!pool.length) return false;
    // 집에 있고 한가한 벌부터 옮긴다
    const b = pool.find((x) => x.carry === 0 && !x.target && !x.site && dist(x, h) < h.radius + 50) || pool[0];
    if (b.target) {
      if (b.target.brood) b.target.brood.pending = Math.max(0, b.target.brood.pending - CONFIG.FEED_AMOUNT);
      if (b.state !== 'feed') h.honey += CONFIG.FEED_AMOUNT; // 아직 안 먹인 꿀은 돌려놓는다
      b.target = null;
    }
    b.site = null;
    b.role = to;
    b.state = 'idle';
    b.wt = 0;
    return true;
  }

  function counts(s, hiveId) {
    const c = { gather: 0, build: 0, nurse: 0, defend: 0, attack: 0, drone: 0 };
    for (const b of s.bees) if (b.hive === hiveId) c[b.role]++;
    return c;
  }

  // 벌집을 AI에게 맡기거나(type = 'aggro' | 'turtle') 사람에게 돌려준다(null). 나간 사람 자리를 AI가 이어받을 때 쓴다.
  function setAI(h, type) {
    h.ai = type ? { type, timer: 1, raidStart: 0, nextRaid: 0 } : null;
    h.auto = !!type;
  }

  // 플레이어의 명령 한 개를 적용한다. 혼자 할 때도, 서버에서도, 화면의 미리 반영에서도 이 함수 하나를 쓴다.
  // c.k: 'move' | 'order' | 'attack' | 'flower' | 'raid' | 'drone' | 'royal'
  function applyCommand(s, seat, c) {
    const h = s.hives[seat];
    if (!h || h.defeated || s.over || !c) return false;
    switch (c.k) {
      case 'move':
        return moveBee(s, seat, String(c.from), String(c.to));
      case 'order':
        return orderCell(h, c.q | 0, c.r | 0);
      case 'attack':
        return setAttack(s, seat, c.target === null || c.target === undefined ? null : c.target | 0);
      case 'flower': {
        const f = s.flowers[c.i | 0];
        if (!f || !flowerAlive(s, f)) return false;
        h.gatherAt = c.i | 0;
        return true;
      }
      case 'raid':
        h.raidMode = c.mode === 'kidnap' ? 'kidnap' : 'eat';
        return true;
      case 'drone':
        h.droneTarget = Math.min(CONFIG.DRONE_MAX, Math.max(0, c.n | 0));
        return true;
      case 'royal':
        return chooseRoyal(h, c.q | 0, c.r | 0);
      default:
        return false;
    }
  }

  const api = {
    setAI, applyCommand,
    CONFIG, ROLES, createState, update, moveBee, counts, hexPos, worldPos,
    buildableSpots, orderCell, chooseRoyal, setAttack, newBee, flowerAlive, flowersLeft, hexDist, cellCost, layInterval,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Sim = api;
})(typeof window !== 'undefined' ? window : globalThis);
