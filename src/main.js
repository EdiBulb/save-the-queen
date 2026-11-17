// 여왕을 지켜라 — 화면 그리기와 입력. 규칙은 sim.js에 있다.
(function () {
  const { CONFIG, createState, update, applyCommand, counts, hexPos, buildableSpots, orderCell, chooseRoyal, setAttack, flowerAlive, flowersLeft, cellCost, layInterval } = window.Sim;
  const Sfx = window.Sfx;
  const W = CONFIG.WIDTH;
  const H = CONFIG.HEIGHT;
  let ME = 0; // 내 벌집 번호 (혼자 할 때는 0, 같이 할 때는 서버가 정해 준 자리)
  let OPTS = {}; // 이번 판의 설정: { net, seat, names, view, onExit }

  const BUTTONS = [
    { role: 'gather', label: '채집', color: 0xf2c230 },
    { role: 'build', label: '짓기', color: 0x9b6a2f },
    { role: 'nurse', label: '육아', color: 0xf08ab0 },
    { role: 'defend', label: '수비', color: 0x4a90d9 },
    { role: 'attack', label: '공격', color: 0xd94a4a },
  ];
  const ATTACK = 4;
  const BW = 112;
  const BH = 48;
  const GAP = 8;
  const BX = 12;
  const BY = H - BH - 8;
  const VIEW_BTN = { x: BX + 5 * (BW + GAP) + 8, y: BY, w: W - (BX + 5 * (BW + GAP) + 8) - 12, h: BH };
  const RAID_BTN = { x: W - 146, y: 5, w: 138, h: 22 };
  const SND_BTN = { x: W - 146 - 78, y: 5, w: 70, h: 22 };
  const HIVE_EDGE = [0xb8741f, 0xb0432f, 0x3f6fb0]; // 벌집 테두리 색 (나, 공격형, 수비형)
  const BEE_EDGE = [0x3a2410, 0xb0181a, 0x1f4fa0]; // 내 벌은 갈색, 적 벌은 빨강·파랑 테두리
  let HIVE_NAME = ['내 벌집', '공격형 AI', '수비형 AI'];
  // 벌집 화면 왼쪽의 수벌 조절판
  const DR_PANEL = { x: 10, y: 66, w: 150, h: 78 };
  const DR_MINUS = { x: 18, y: 112, w: 62, h: 26 };
  const DR_PLUS = { x: 90, y: 112, w: 62, h: 26 };
  const ROLE_COLOR = { gather: 0xf2b824, nurse: 0xf08ab0, build: 0xa8702f, defend: 0x3f7fd9, attack: 0xd9453f, drone: 0x5a4632 };
  const ROLE_TEXT = { gather: '#a67a00', nurse: '#c2507d', build: '#8a5a22', defend: '#2f66b8', attack: '#c2362f' };
  const FONT = '"Do Hyeon", system-ui, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';

  // 벌집 화면에서 칸 크기와 중심
  const HIVE_HEX = 25;
  const HIVE_CX = W / 2;
  const HIVE_CY = 184;

  // ---- 블록풍 그림: [색, x, y, 너비, 높이] 목록을 격자 위에 찍는다 ----
  const INK = 0x3a2410;
  const CREAM = 0xfff3d0;
  const WOOD = 0x6b4423;
  const WOOD_D = 0x4e3017;
  const WING = 0xd6f4f1;
  // (cx, cy)를 중심으로, 한 변이 grid칸인 그림을 size 픽셀 크기로 그린다
  function sprite(g, list, cx, cy, size, grid) {
    const k = size / grid;
    const x0 = cx - size / 2;
    const y0 = cy - size / 2;
    for (const r of list) g.fillStyle(r[0]).fillRect(x0 + r[1] * k, y0 + r[2] * k, r[3] * k, r[4] * k);
  }
  function beeRects(belt, edge, small) {
    const out = [[WING, 2, 0, 3, 3], [WING, 7, 0, 3, 3], [edge, 1, 2, 10, 8], [0xf5a623, 2, 3, 8, 6], [0xfff1c2, 2, 6, 8, 1], [belt, 2, 7, 8, 2]];
    if (small) out.push([INK, 3.5, 4, 1.5, 1.5], [INK, 7, 4, 1.5, 1.5]);
    else out.push([0xffffff, 2.8, 3.6, 2.2, 2.2], [INK, 3.9, 4.4, 1.1, 1.1], [0xffffff, 7, 3.6, 2.2, 2.2], [INK, 8.1, 4.4, 1.1, 1.1], [edge, 3, 10, 1.6, 1.2], [edge, 7.4, 10, 1.6, 1.2]);
    return out;
  }
  const flowerRects = (c) => [[c, 4, 0.5, 2, 9], [c, 0.5, 4, 9, 2], [c, 2, 2, 6, 6], [0xffe27a, 3.5, 3.5, 3, 3]];
  const SPR = {
    queen: [[0xffd23f, 3, 0, 2, 3], [0xffd23f, 7, 0, 2, 3], [0xffd23f, 11, 0, 2, 3], [0xffd23f, 3, 2, 10, 2], [0xd9453f, 7.2, 2.3, 1.6, 1.4], [INK, 1, 4, 14, 12], [0xf5a623, 1.8, 4.8, 12.4, 10.4], [0x7b4bb3, 1.8, 10, 12.4, 5.2], [0xfff1c2, 1.8, 10, 12.4, 1.2], [0xffffff, 3.4, 6, 3, 3], [INK, 4.9, 7.1, 1.5, 1.5], [0xffffff, 9.6, 6, 3, 3], [INK, 11.1, 7.1, 1.5, 1.5], [0xf7a6b8, 2.6, 9, 1.6, 1], [0xf7a6b8, 11.8, 9, 1.6, 1]],
    egg: [[INK, 3.5, 1.5, 3, 7], [0xffffff, 4, 2, 2, 6]],
    larva: [[INK, 1, 3, 8, 5], [0xfff8e1, 1.6, 3.6, 6.8, 3.8], [0xead9a8, 3.6, 3.6, 0.7, 3.8], [0xead9a8, 5.8, 3.6, 0.7, 3.8], [INK, 7, 4.4, 1, 1]],
    pupa: [[INK, 2, 1, 6, 8], [0xb5793a, 2.6, 1.6, 4.8, 6.8], [0x8e5a26, 2.6, 3.4, 4.8, 0.8], [0x8e5a26, 2.6, 5.6, 4.8, 0.8]],
    flower: flowerRects(0xf28db2),
    flowerBig: flowerRects(0xe0569a),
  };
  const DECO = [[60, 200, 0x4f9a32], [78, 212, 0x5fa83a], [722, 222, 0x4f9a32], [702, 236, 0x5fa83a], [196, 262, 0x9aa0a6], [622, 276, 0x9aa0a6], [116, 310, 0x4f9a32]];

  // 체력에 따라 초록 → 노랑 → 빨강
  function hpColor(ratio) {
    return ratio > 0.6 ? 0x4caf50 : ratio > 0.3 ? 0xf2b824 : 0xe53935;
  }
  const Q_BAR = { x: 236, y: 9, n: 8, w: 9, gap: 2, h: 14 }; // 화면 위쪽 여왕 체력 막대 (블록 8칸)

  function buttonAt(x, y) {
    for (let i = 0; i < 5; i++) {
      const bx = BX + i * (BW + GAP);
      if (x >= bx && x <= bx + BW && y >= BY - 6 && y <= BY + BH + 6) return i;
    }
    return -1;
  }
  function inRect(r, x, y) {
    return x >= r.x && x <= r.x + r.w && y >= r.y - 6 && y <= r.y + r.h + 6;
  }
  function hexPoints(x, y, size) {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 180) * (60 * i - 30);
      pts.push({ x: x + size * Math.cos(a), y: y + size * Math.sin(a) });
    }
    return pts;
  }

  // 벌 그림을 벌집(테두리 색)·역할(허리띠 색)별로 미리 만들어 둔다
  const BEE_BIG = BEE_EDGE.map((edge) => {
    const o = {};
    for (const role of Object.keys(ROLE_COLOR)) o[role] = beeRects(ROLE_COLOR[role], edge, false);
    return o;
  });
  const BEE_SMALL = BEE_EDGE.map((edge) => {
    const o = {};
    for (const role of Object.keys(ROLE_COLOR)) o[role] = beeRects(ROLE_COLOR[role], edge, true);
    return o;
  });

  class Play extends Phaser.Scene {
    create() {
      // 같이 하는 판이면 게임은 서버가 돌리고, 여기서는 받은 상태(view)를 그리기만 한다
      this.net = OPTS.net || null;
      this.sim = this.net ? OPTS.view : createState();
      this.gw = this.add.graphics().setDepth(0); // 맵·벌집 (확대·이동되는 층)
      this.g = this.add.graphics().setDepth(2); // 위쪽 정보와 역할 바 (고정된 층)
      // 화면별 확대 상태: 화면 좌표 = 세계 좌표 × z + (x, y)
      this.cam = { map: { z: 1, x: 0, y: 0 }, hive: { z: 1, x: 0, y: 0 } };
      this.parts = []; // 튀어 나가는 블록 조각들
      this.drops = []; // 벌집에서 꿀 숫자로 날아가는 꿀 방울
      this.dropAt = 0;
      this.bump = 0; // 꿀 숫자가 통 튀는 남은 시간
      this.rises = []; // 벌집 위로 떠오르는 +숫자
      this.sparks = []; // 반짝임
      this.petalAt = 0;
      this.qShown = CONFIG.QUEEN_HP; // 여왕 체력 막대에서 천천히 따라 내려오는 값 (지연 조각)
      this.qDelay = 0;
      this.qBlocks = Q_BAR.n;
      this.qShake = 0;
      this.dt = 0;
      this.pinch = null; // 두 손가락으로 확대 중
      this.touch = null; // 한 손가락으로 맵을 누르는 중 (톡 누르기 또는 끌어서 이동)
      this.drag = null;
      this.view = window.location.hash === '#hive' ? 'hive' : 'map';
      this.flash = null; // 잠깐 보여주는 안내 문구

      const text = (x, y, str, size, color) =>
        this.add.text(x, y, str, { fontFamily: FONT, fontSize: size + 'px', color: color || '#3a2410' }).setResolution(2).setDepth(3);

      this.honeyText = text(31, 7, '', 17);
      this.beeText = text(140, 7, '', 17);
      this.timeText = text(W / 2 - 40, 6, '', 19, '#fff3d0').setOrigin(0.5, 0);
      this.flowerText = text(W / 2 + 22, 6, '', 19, '#fff3d0');
      this.raidText = text(RAID_BTN.x + RAID_BTN.w / 2, RAID_BTN.y + 3, '', 14).setOrigin(0.5, 0);
      this.sndText = text(SND_BTN.x + SND_BTN.w / 2, SND_BTN.y + 3, '', 14).setOrigin(0.5, 0);
      // 꿀 숫자 아래에 뜨는 +/− 표시
      this.floatTexts = [0, 1, 2, 3, 4, 5].map(() => text(0, 0, '', 14).setDepth(4).setVisible(false));
      this.riseTexts = [0, 1, 2, 3].map(() =>
        text(0, 0, '', 17, '#ffe27a').setOrigin(0.5, 0.5).setStroke('#3a2410', 4).setDepth(1).setVisible(false)
      );
      this.floaters = [];
      this.gain = 0; // 최근 0.6초 동안 들어온 꿀
      this.spend = 0; // 최근 0.6초 동안 쓴 꿀
      this.tally = 0;
      this.wasPending = false;
      this.wilted = [];
      this.hint = text(W / 2, 38, '', 14).setOrigin(0.5, 0).setDepth(4).setBackgroundColor('rgba(255,243,208,0.92)').setPadding(8, 3);
      this.mapLabels = this.sim.hives.map((h, i) =>
        i === 0
          ? text(h.x + 78, h.y - 8, HIVE_NAME[i], 14)
          : text(h.x, h.y + 48, HIVE_NAME[i], 14).setOrigin(0.5, 0).setBackgroundColor('rgba(255,243,208,0.9)').setPadding(5, 1)
      );
      // 벌집 이름표는 맵과 함께 움직인다
      this.mapLabels.forEach((t) => {
        t.setDepth(1);
        t.wx = t.x;
        t.wy = t.y;
      });
      this.viewText = text(VIEW_BTN.x + VIEW_BTN.w / 2, BY + 11, '', 22).setOrigin(0.5, 0);
      this.droneTexts = [
        text(DR_PANEL.x + 8, DR_PANEL.y + 4, '', 16),
        text(DR_PANEL.x + 8, DR_PANEL.y + 24, '', 13, '#7a5a36'),
        text(DR_MINUS.x + DR_MINUS.w / 2, DR_MINUS.y + 2, '−', 20).setOrigin(0.5, 0),
        text(DR_PLUS.x + DR_PLUS.w / 2, DR_PLUS.y + 2, '+', 20).setOrigin(0.5, 0),
      ];
      this.btnTexts = BUTTONS.map((b, i) => {
        const x = BX + i * (BW + GAP) + 46;
        text(x, BY + 5, b.label, 16);
        return { count: text(x, BY + 21, '', 19, ROLE_TEXT[b.role]) };
      });
      this.overText = text(W / 2, 150, '', 44).setOrigin(0.5, 0).setDepth(5);
      this.overSub = text(W / 2, 210, '화면을 누르면 다시 시작해요', 16).setOrigin(0.5, 0).setDepth(5);

      this.input.on('pointerdown', (p) => this.onDown(p));
      this.input.on('pointerup', (p) => this.onUp(p));
      this.input.on('gameout', () => {
        this.drag = null;
        this.touch = null;
      });
      // 컴퓨터에서는 마우스 휠로 확대
      this.input.on('wheel', (p, over, dx, dy) => this.zoomAt(p.x, p.y, this.cam[this.view].z * (dy > 0 ? 0.88 : 1.14)));
    }

    get me() {
      return this.sim.hives[ME];
    }

    say(msg, ms) {
      this.flash = { msg, until: this.time.now + (ms || 1800) };
    }

    onDown(p) {
      Sfx.unlock();
      if (this.sim.over) {
        if (this.net) return void OPTS.onExit(); // 대기실로
        this.sim = createState();
        this.view = 'map';
        this.wilted = [];
        this.overPlayed = false;
        this.lastRaider = undefined;
        return;
      }
      if (inRect(SND_BTN, p.x, p.y)) {
        Sfx.on = !Sfx.on;
        Sfx.play('tap');
        return;
      }
      if (inRect(VIEW_BTN, p.x, p.y)) {
        this.view = this.view === 'map' ? 'hive' : 'map';
        this.parts = this.parts.filter((q) => q.hud); // 다른 화면의 조각은 지운다
        this.sparks = [];
        this.rises = [];
        Sfx.play('tap');
        return;
      }
      if (inRect(RAID_BTN, p.x, p.y)) {
        this.cmd({ k: 'raid', mode: this.me.raidMode === 'eat' ? 'kidnap' : 'eat' });
        Sfx.play('tap');
        return;
      }
      if (this.view === 'hive' && inRect(DR_PANEL, p.x, p.y)) {
        const step = inRect(DR_PLUS, p.x, p.y) ? 1 : inRect(DR_MINUS, p.x, p.y) ? -1 : 0;
        if (step) {
          this.cmd({ k: 'drone', n: this.me.droneTarget + step });
          Sfx.play('tap');
        }
        return;
      }
      const i = buttonAt(p.x, p.y);
      if (i >= 0) {
        this.drag = { from: i, over: -1, nextAt: 0 };
        Sfx.play('tap');
      } else if (p.y > 34 && p.y < BY - 6) {
        // 맵을 누름: 손을 뗄 때 거의 안 움직였으면 '누르기', 움직였으면 '이동'
        this.touch = { p, x: p.x, y: p.y, lx: p.x, ly: p.y, moved: false };
      }
    }

    // 화면 좌표 → 세계 좌표 (확대·이동을 되돌린다)
    toWorld(x, y) {
      const c = this.cam[this.view];
      return { x: (x - c.x) / c.z, y: (y - c.y) / c.z };
    }

    // 맵은 1~3배. 벌집 화면은 큰 벌집을 한눈에 보도록 0.3배까지 축소된다.
    zoomMin() {
      return this.view === 'hive' ? 0.3 : 1;
    }

    clampCam(c) {
      const pad = this.view === 'hive' ? 1400 : 0; // 벌집 화면은 칸이 화면 밖으로도 자란다
      c.z = Math.min(3, Math.max(this.zoomMin(), c.z));
      c.x = Math.min(pad * c.z, Math.max(W - (W + pad) * c.z, c.x));
      c.y = Math.min(pad * c.z, Math.max(H - (H + pad) * c.z, c.y));
    }

    // 화면의 (sx, sy) 지점을 붙잡은 채 z배로 확대
    zoomAt(sx, sy, z) {
      const c = this.cam[this.view];
      const w = this.toWorld(sx, sy);
      c.z = Math.min(3, Math.max(this.zoomMin(), z));
      c.x = sx - w.x * c.z;
      c.y = sy - w.y * c.z;
      this.clampCam(c);
    }

    handleCamera() {
      const a = this.input.pointer1;
      const b = this.input.pointer2;
      const c = this.cam[this.view];
      if (a.isDown && b.isDown) {
        // 두 손가락: 벌리면 확대, 모으면 축소, 같이 움직이면 이동
        const d = Math.max(20, Math.hypot(a.x - b.x, a.y - b.y));
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        if (this.pinch) {
          c.x += mx - this.pinch.mx;
          c.y += my - this.pinch.my;
          this.zoomAt(mx, my, (c.z * d) / this.pinch.d);
        }
        this.pinch = { d, mx, my };
        this.drag = null;
        this.touch = null;
        return;
      }
      this.pinch = null;
      // 한 손가락으로 끌면 이동 (확대했을 때만 움직일 곳이 있다)
      const t = this.touch;
      if (t && t.p.isDown) {
        if (Math.hypot(t.p.x - t.x, t.p.y - t.y) > 8) t.moved = true;
        if (t.moved) {
          c.x += t.p.x - t.lx;
          c.y += t.p.y - t.ly;
          this.clampCam(c);
        }
        t.lx = t.p.x;
        t.ly = t.p.y;
      }
    }

    // 맵에서 꽃밭을 누르면 채집 벌이 그곳으로 간다
    tapMap(x, y) {
      const s = this.sim;
      const i = s.flowers.findIndex((f) => Math.hypot(f.x - x, f.y - y) < (f.big ? 50 : 38));
      if (i < 0) return;
      const f = s.flowers[i];
      if (!flowerAlive(s, f)) return this.say('이 꽃밭은 이미 졌어요');
      this.cmd({ k: 'flower', i });
      Sfx.play('tap');
      this.say(f.big ? '채집 벌이 가운데 큰 꽃밭으로 가요' : '채집 벌이 이 꽃밭으로 가요');
    }

    // 맵에서 (x, y) 근처에 있는 벌집
    hiveAt(x, y) {
      return this.sim.hives.find((h) => !h.defeated && Math.hypot(h.x - x, h.y - y) < Math.max(52, h.radius + 16));
    }

    onUp(p) {
      const t = this.touch;
      if (t && t.p === p) {
        this.touch = null;
        if (!t.moved && !this.sim.over) {
          const w = this.toWorld(p.x, p.y);
          if (this.view === 'hive') this.tapHive(w.x, w.y);
          else this.tapMap(w.x, w.y);
        }
        return;
      }
      const d = this.drag;
      this.drag = null;
      if (!d) return;
      // 역할 버튼 위에서 손을 떼면 그 역할로 한 마리 옮긴다 (머물러서 이미 옮긴 경우는 제외)
      const to = buttonAt(p.x, p.y);
      if (to >= 0) {
        if (to !== d.from && !(d.over === to && d.auto)) this.moveOne(d.from, to);
        return;
      }
      if (d.from !== ATTACK || this.view !== 'map' || p.y >= BY - 6) return;
      const w = this.toWorld(p.x, p.y);
      const h = this.hiveAt(w.x, w.y);
      if (!h) return;
      if (h.id === ME) {
        Sfx.play('tap');
        this.cmd({ k: 'attack', target: null });
        this.say('공격 벌이 집으로 돌아와요');
      } else if (this.cmd({ k: 'attack', target: h.id })) {
        const n = counts(this.sim, ME).attack;
        this.say(n ? '공격 벌 ' + n + '마리 출발!' : '공격 벌이 없어요. 먼저 공격 역할로 벌을 옮기세요');
        Sfx.play(n ? 'attack' : 'error');
      }
    }

    tapHive(x, y) {
      const me = this.me;
      const pick = (list) => {
        let best = null;
        let bestD = HIVE_HEX;
        for (const c of list) {
          const p = hexPos(c.q, c.r, HIVE_HEX, HIVE_CX, HIVE_CY);
          const d = Math.hypot(p.x - x, p.y - y);
          if (d < bestD) {
            bestD = d;
            best = c;
          }
        }
        return best;
      };
      // 여왕이 없으면: 애벌레를 눌러 새 여왕으로
      if (!me.queenAlive) {
        const c = pick(me.cells.filter((k) => k.brood && k.brood.stage === 'larva'));
        if (c) {
          const res = this.cmd({ k: 'royal', q: c.q, r: c.r });
          if (res === 'honey') {
            this.say('꿀이 부족해요 (새 여왕에 꿀 ' + CONFIG.ROYAL_COST + ')');
            Sfx.play('error');
          } else if (res === 'ok') {
            this.say('새 여왕을 키우기 시작했어요');
            this.spend += CONFIG.ROYAL_COST;
            Sfx.play('order');
          }
          return;
        }
      }
      const sp = pick(buildableSpots(me));
      if (!sp) return;
      const cost = cellCost(me);
      const res = this.cmd({ k: 'order', q: sp.q, r: sp.r });
      if (res === 'ok') {
        this.spend += cost;
        Sfx.play('order');
      } else if (res === 'saving') {
        this.say('꿀 ' + cost + '이 모이면 지어요. 그동안 애벌레 먹이기를 멈춰요');
        Sfx.play('order');
      } else if (res === 'cancel') {
        this.say('칸 주문을 취소했어요');
        Sfx.play('tap');
      }
    }

    update(time, delta) {
      const dt = Math.min(delta, 100) / 1000;
      this.dt = dt;
      if (this.net) window.Net.smooth(this.sim, dt);
      else update(this.sim, dt);
      this.handleEvents(dt);
      this.handleDrag(time);
      this.handleCamera();
      this.draw();
    }

    // 규칙 쪽에서 일어난 일을 효과음과 꿀 +/− 표시로 바꾼다
    handleEvents(dt) {
      const s = this.sim;
      const me = this.me;
      for (const e of s.events) {
        const mine = e.hive === ME;
        if (e.type === 'deposit' && mine) {
          this.gain += e.amount;
          this.dropHoney();
          Sfx.play('deposit', 0.18);
        } else if (e.type === 'loot' && mine) {
          this.gain += e.amount;
          this.dropHoney();
          this.sparkle(ME); // 약탈 성공
          Sfx.play('loot', 0.3);
        } else if (e.type === 'collect') {
          // 가운데 큰 꽃밭에서 꿀을 딸 때 꽃잎 조각이 튄다
          if (e.big && this.view === 'map' && s.time - this.petalAt > 0.12) {
            this.petalAt = s.time;
            this.burst(e.x, e.y, 4, [0xe0569a, 0xf28db2, 0xffe27a], 4, false);
          }
        } else if (e.type === 'built') {
          // 칸 완성: 밀랍 가루가 퍼진다
          const p = this.cellPoint(e.hive, e.q, e.r);
          if (p) this.burst(p.x, p.y, 8, [0xfff1c2, 0xe8b860], p.big ? 8 : 3, false);
        } else if ((e.type === 'feed' || e.type === 'upkeep') && mine) this.spend += e.amount;
        else if (e.type === 'built' && mine) Sfx.play('built');
        else if (e.type === 'born' && mine) Sfx.play('born', 0.15);
        else if (e.type === 'died' && mine) Sfx.play('died', 0.12);
        else if (e.type === 'cellLost') {
          this.burstCell(e);
          if (mine) Sfx.play('cellLost', 0.1);
          else if (e.by === ME) Sfx.play('smash', 0.1);
        } else if (e.type === 'queenDied') {
          if (mine) Sfx.play('queenDied');
          else if (e.by === ME) Sfx.play('queenKill');
        } else if (e.type === 'newQueen') {
          this.sparkle(e.hive);
          if (mine) Sfx.play('newQueen');
        }
        else if (e.type === 'attack' && e.target === ME) {
          // 적이 나를 공격하러 출발함
          const n = counts(s, e.hive).attack;
          this.lastRaider = e.hive;
          this.say(HIVE_NAME[e.hive] + ': 벌 ' + n + '마리가 쳐들어와요! 수비 벌을 늘리세요', 3500);
          Sfx.play('alarm', 2);
        } else if (e.type === 'defeated' && !mine && !s.over) {
          this.say(HIVE_NAME[e.hive] + ' 벌집이 무너졌어요');
          Sfx.play('queenKill');
        }
      }
      s.events.length = 0;

      // 꿀을 모으던 칸 주문이 자동으로 시작됨
      if (this.wasPending && !me.pending && me.sites.length) {
        this.say('꿀이 모여서 칸을 짓기 시작했어요');
        Sfx.play('order');
      }
      this.wasPending = !!me.pending;

      // 꽃밭이 질 때
      s.flowers.forEach((f, i) => {
        if (!flowerAlive(s, f) && !this.wilted[i]) {
          this.wilted[i] = true;
          if (i === me.flowerId || f.big) {
            this.say(f.big ? '가운데 꽃밭이 졌어요. 이제 꿀은 남의 벌집에서만!' : '내 기본 꽃밭이 졌어요. 가운데 꽃밭만 남았어요');
            Sfx.play('wilt');
          }
        }
      });

      if (s.time - me.lastHit < 0.5) Sfx.play('alarm', 4);
      if (s.over && !this.overPlayed) {
        this.overPlayed = true;
        Sfx.play(this.won() ? 'win' : 'lose');
      }

      // 0.6초마다 들어온 꿀과 쓴 꿀을 모아서 한 번씩 띄운다
      this.tally += dt;
      if (this.tally >= 0.6) {
        this.tally = 0;
        if (this.gain > 0) this.rises.push({ text: '+' + Math.round(this.gain), t: 0 });
        if (this.spend >= 1) this.floaters.push({ text: '−' + Math.round(this.spend), color: '#c62828', x: 58, t: 0 });
        this.gain = 0;
        this.spend = 0;
      }
      for (const f of this.floaters) f.t += dt;
      this.floaters = this.floaters.filter((f) => f.t < 1).slice(-6);
      this.floatTexts.forEach((t, i) => {
        const f = this.floaters[i];
        t.setVisible(!!f);
        if (f) t.setText(f.text).setColor(f.color).setPosition(f.x, 36 + f.t * 16).setAlpha(1 - f.t);
      });
    }

    moveOne(from, to) {
      Sfx.play(this.cmd({ k: 'move', from: BUTTONS[from].role, to: BUTTONS[to].role }) ? 'move' : 'error');
    }

    // 지금 화면에서 벌집 hive의 (q, r) 칸이 그려지는 자리. 안 보이면 null.
    cellPoint(hive, q, r) {
      const h = this.sim.hives[hive];
      if (this.view === 'map') return hexPos(q, r, CONFIG.MAP_HEX, h.x, h.y);
      if (hive !== ME) return null;
      return Object.assign(hexPos(q, r, HIVE_HEX, HIVE_CX, HIVE_CY), { big: true });
    }

    // 지금 화면에서 내 벌집 위쪽 자리 (세계 좌표)
    hiveTop() {
      const me = this.me;
      if (this.view === 'map') return { x: me.x, y: me.y - me.radius - 14 };
      return { x: HIVE_CX, y: HIVE_CY - 60 };
    }

    // 꿀 방울 하나를 내 벌집에서 위쪽 꿀 숫자로 날린다 (0.3초에 한 번까지)
    dropHoney() {
      if (this.time.now - this.dropAt < 300) return;
      this.dropAt = this.time.now;
      const c = this.cam[this.view];
      const p = this.hiveTop();
      this.drops.push({ x0: p.x * c.z + c.x, y0: (p.y + 14) * c.z + c.y, t: 0 });
    }

    // 금빛 반짝임 3개가 차례로 빛난다
    sparkle(hive) {
      const h = this.sim.hives[hive];
      const base = hive === ME ? this.hiveTop() : this.view === 'map' ? { x: h.x, y: h.y - h.radius - 14 } : null;
      if (!base) return;
      for (let i = 0; i < 3; i++) this.sparks.push({ x: base.x + (i - 1) * 16, y: base.y + 12 - (i % 2) * 12, t: -i * 0.15 });
    }

    // 꿀 방울, 떠오르는 숫자, 반짝임을 움직이고 그린다
    drawJuice(g, gw) {
      const dt = this.dt;
      const cam = this.cam[this.view];
      // 포물선으로 날아가는 꿀 방울 (0.4초)
      for (const d of this.drops) {
        d.t += dt / 0.4;
        const k = Math.min(1, d.t);
        const x = d.x0 + (18 - d.x0) * k;
        const y = d.y0 + (16 - d.y0) * k - Math.sin(k * Math.PI) * 60;
        g.fillStyle(INK).fillRect(x - 5, y - 5, 10, 10);
        g.fillStyle(0xffc233).fillRect(x - 3.5, y - 3.5, 7, 7);
        g.fillStyle(0xfff1c2).fillRect(x - 2.5, y - 2.5, 2.5, 2.5);
        if (d.t >= 1) this.bump = 0.15; // 도착하면 숫자가 통 튄다
      }
      this.drops = this.drops.filter((d) => d.t < 1);
      this.bump = Math.max(0, this.bump - dt);
      this.honeyText.setScale(1 + 0.3 * (this.bump / 0.15));

      // 벌집 위로 떠오르는 +숫자: 125%로 커졌다가 40px 올라가며 0.7초에 사라진다
      const top = this.hiveTop();
      this.rises = this.rises.filter((r) => (r.t += dt) < 0.7).slice(-4);
      this.riseTexts.forEach((t, i) => {
        const r = this.rises[i];
        t.setVisible(!!r);
        if (!r) return;
        const k = r.t / 0.7;
        t.setText(r.text)
          .setPosition(top.x * cam.z + cam.x, (top.y - 40 * k) * cam.z + cam.y)
          .setScale(k < 0.15 ? 1 + (0.25 * k) / 0.15 : 1.25 - 0.25 * Math.min(1, (k - 0.15) / 0.2))
          .setAlpha(k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4);
      });

      // 반짝임: 십자 모양이 커졌다 작아진다
      for (const sp of this.sparks) {
        sp.t += dt;
        if (sp.t < 0) continue;
        const k = Math.sin(Math.min(1, sp.t / 0.35) * Math.PI);
        const a = 7 * k;
        gw.fillStyle(0xffffff).fillRect(sp.x - a, sp.y - 1.5, a * 2, 3).fillRect(sp.x - 1.5, sp.y - a, 3, a * 2);
        gw.fillStyle(0xffd23f).fillRect(sp.x - a * 0.6, sp.y - 1, a * 1.2, 2).fillRect(sp.x - 1, sp.y - a * 0.6, 2, a * 1.2);
      }
      this.sparks = this.sparks.filter((sp) => sp.t < 0.35);
    }

    // 블록 조각 n개를 (x, y)에서 튀긴다. hud = 고정된 층(위쪽 막대)에 그릴지
    burst(x, y, n, colors, size, hud) {
      for (let i = 0; i < n; i++) {
        this.parts.push({
          x, y, hud, s: size * (0.6 + Math.random() * 0.6), c: colors[i % colors.length],
          vx: (Math.random() - 0.5) * 160, vy: -60 - Math.random() * 120, t: 0, life: 0.5 + Math.random() * 0.3,
        });
      }
      if (this.parts.length > 160) this.parts.splice(0, this.parts.length - 160);
    }

    // 칸이 부서질 때: 지금 보고 있는 화면에 맞는 자리에서 조각이 튄다
    burstCell(e) {
      const h = this.sim.hives[e.hive];
      const colors = [HIVE_EDGE[e.hive], 0xffd76a, 0xffe9a6];
      if (this.view === 'map') {
        const p = hexPos(e.q, e.r, CONFIG.MAP_HEX, h.x, h.y);
        this.burst(p.x, p.y, 6, colors, 5, false);
      } else if (e.hive === ME) {
        const p = hexPos(e.q, e.r, HIVE_HEX, HIVE_CX, HIVE_CY);
        this.burst(p.x, p.y, 10, colors, 11, false);
      }
    }

    drawParts(g, hud) {
      for (const p of this.parts) {
        if (!!p.hud !== hud) continue;
        g.fillStyle(p.c, Math.max(0, 1 - p.t / p.life)).fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
      }
    }

    // 화면 위쪽 여왕 체력: 블록 8칸, 색 변화, 지연 조각, 잃은 블록은 튕겨 떨어진다
    drawQueenBar(g) {
      const me = this.me;
      const max = CONFIG.QUEEN_HP;
      const hp = me.queenAlive ? Math.max(0, me.queenHp) : 0;
      const dt = this.dt;
      if (hp >= this.qShown) {
        this.qShown = hp;
        this.qDelay = 0;
      } else {
        this.qDelay += dt;
        if (this.qDelay > 0.25) this.qShown = Math.max(hp, this.qShown - max * 0.6 * dt);
      }
      const B = Q_BAR;
      const per = max / B.n;
      const full = Math.ceil(hp / per - 1e-6);
      const ratio = hp / max;
      const color = hpColor(ratio);
      if (full < this.qBlocks) {
        for (let i = full; i < this.qBlocks; i++) this.burst(B.x + i * (B.w + B.gap) + B.w / 2, B.y + B.h / 2, 2, [color, 0xfff3d0], 7, true);
        this.qShake = 0.3;
      }
      this.qBlocks = full;
      this.qShake = Math.max(0, this.qShake - dt);
      const ox = this.qShake > 0 ? Math.sin(this.time.now * 0.08) * 4 * (this.qShake / 0.3) : 0;
      const blink = ratio < 0.3 && Math.floor(this.time.now / 167) % 2 === 0; // 30% 아래에서 1초에 3번 깜빡
      sprite(g, SPR.queen, B.x - 13 + ox, 16, 18, 16);
      for (let i = 0; i < B.n; i++) {
        const x = B.x + i * (B.w + B.gap) + ox;
        const f = Math.min(1, Math.max(0, (hp - i * per) / per));
        const chip = Math.min(1, Math.max(0, (this.qShown - i * per) / per));
        g.fillStyle(INK).fillRect(x - 1, B.y - 1, B.w + 2, B.h + 2);
        g.fillStyle(0x2a1a0c).fillRect(x, B.y, B.w, B.h);
        if (chip > f) g.fillStyle(0xfff3d0).fillRect(x, B.y, B.w * chip, B.h);
        if (f > 0) g.fillStyle(blink ? 0xffffff : color).fillRect(x, B.y, B.w * f, B.h);
      }
      if (!me.queenAlive && Math.floor(this.time.now / 300) % 2 === 0) {
        g.lineStyle(2, 0xe53935).strokeRect(B.x - 2, B.y - 2, B.n * (B.w + B.gap), B.h + 4);
      }
    }

    handleDrag(time) {
      const d = this.drag;
      if (!d) return;
      const p = this.input.activePointer;
      const i = buttonAt(p.x, p.y);
      if (i < 0 || i === d.from) {
        d.over = -1;
        return;
      }
      // 지나가는 버튼에서는 아무 일도 없다. 한 버튼 위에 0.5초 머물면 그때부터 연달아 옮긴다.
      if (d.over !== i) {
        d.over = i;
        d.nextAt = time + 500;
        d.auto = false;
      } else if (time >= d.nextAt) {
        d.nextAt = time + 220;
        d.auto = true;
        this.moveOne(d.from, i);
      }
    }

    // 명령 하나를 내린다. 내 화면에 바로 반영하고, 같이 하는 판이면 서버에도 보낸다.
    cmd(c) {
      const res = applyCommand(this.sim, ME, c);
      if (this.net) this.net.send({ t: 'cmd', c });
      return res;
    }

    won() {
      const s = this.sim;
      return s.over === 'win' || (s.over === 'done' && s.winner === ME);
    }

    hintText(c) {
      const me = this.me;
      if (me.defeated) return '탈락했어요. 남은 벌집의 승부를 지켜보는 중이에요';
      if (this.flash && this.time.now < this.flash.until) return this.flash.msg;
      if (!me.queenAlive) {
        if (me.cells.some((x) => x.brood && x.brood.royal)) return '새 여왕이 자라는 중이에요. 그동안 알을 낳지 못해요';
        return '여왕이 죽었어요! 벌집 화면에서 애벌레를 눌러 새 여왕으로 키우세요 (꿀 ' + CONFIG.ROYAL_COST + ')';
      }
      if (this.drag && this.drag.from === ATTACK && this.view === 'map') return '적 벌집에 놓으면 공격, 내 벌집에 놓으면 철수';
      const all = c.gather + c.build + c.nurse + c.defend + c.attack;
      if (this.sim.time > 75 && all >= 8 && c.defend < all / 5) return '수비 벌이 ' + c.defend + '마리뿐이에요. 벌 4마리 중 1마리는 수비에 두세요';
      if (me.starving) return '꿀이 떨어져서 수벌이 굶고 있어요. 수벌 목표를 줄이거나 꿀을 모으세요';
      if (me.pending) return '칸 값 모으는 중 (' + Math.floor(me.honey) + '/' + cellCost(me) + '). 애벌레 먹이기를 멈췄어요. 다시 누르면 취소';
      if (me.sites.length && c.build === 0) return '짓기 벌이 없어서 공사가 멈췄어요';
      const larva = me.cells.some((x) => x.brood && x.brood.stage === 'larva');
      if (larva && c.nurse === 0) return '육아 벌이 없어서 애벌레가 자라지 못해요';
      if (this.view === 'hive') return '빈 자리(+)를 누르면 칸을 지어요 (다음 칸 꿀 ' + cellCost(me) + ')';
      if (me.cells.length === 1 && !me.sites.length) return '‘벌집’을 눌러 칸을 지으세요. 칸이 있어야 여왕이 알을 낳아요';
      if (me.honey > 150 && me.droneTarget === 0 && flowersLeft(this.sim) > 0) return '꿀이 남아요. 벌집 화면에서 수벌을 키우면 여왕이 알을 더 빨리 낳아요';
      if (me.attackTarget !== null) return '공격 중. 공격 버튼을 내 벌집으로 끌면 돌아와요';
      if (c.attack > 0) return '공격 버튼을 적 벌집으로 끌어다 놓으면 공격 벌이 출발해요';
      if (flowersLeft(this.sim) <= 0) return '꽃이 모두 졌어요. 이제 꿀은 남의 벌집에서만 얻을 수 있어요';
      return this.sim.time < 20 ? '두 손가락을 벌리면 확대, 모으면 축소돼요' : '역할을 끌어 벌을 옮기고, 꽃밭을 눌러 채집할 곳을 골라요';
    }

    // ---------- 그리기 ----------

    // 칸 하나 (육각형). kind: 'empty' | 'queen' | 'hurt'
    drawCell(g, x, y, size, edge, kind, big) {
      const fill = kind === 'queen' ? 0xffc233 : kind === 'hurt' ? 0xe9a06b : 0xffd76a;
      g.fillStyle(edge).fillPoints(hexPoints(x, y, size), true);
      g.fillStyle(fill).fillPoints(hexPoints(x, y, size * 0.84), true);
      if (big) g.fillStyle(0xffe9a6).fillRect(x - size * 0.45, y - size * 0.5, size * 0.3, size * 0.14);
    }

    // 칸 안의 내용물(알·애벌레·번데기). big = 벌집 화면
    drawBrood(g, br, x, y, big) {
      if (!big) {
        const c = br.stage === 'egg' ? 0xffffff : br.stage === 'larva' ? (br.royal ? 0xd9c2f0 : 0xfff8e1) : 0xb5793a;
        const w = br.stage === 'egg' ? 2 : 5;
        g.fillStyle(c).fillRect(x - w / 2, y - 2.5, w, 5);
        return;
      }
      sprite(g, SPR[br.stage], x, y, 26, 10);
      if (br.kind === 'drone') {
        // 수벌이 될 알·애벌레 표시
        g.fillStyle(INK).fillRect(x + 7, y - 15, 9, 9);
        g.fillStyle(ROLE_COLOR.drone).fillRect(x + 8.5, y - 13.5, 6, 6);
      }
      if (br.stage === 'larva') {
        const f = br.royal ? br.t / CONFIG.ROYAL_TIME : br.fed / CONFIG.LARVA_NEED;
        g.lineStyle(4, br.royal ? 0x7b4bb3 : 0x3b8f3b);
        g.beginPath();
        g.arc(x, y, 17, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.02, f));
        g.strokePath();
      }
    }

    drawHive(g, h, size, cx, cy, big) {
      const edge = HIVE_EDGE[h.id];
      if (big) {
        for (const sp of buildableSpots(h)) {
          const p = hexPos(sp.q, sp.r, size, cx, cy);
          g.lineStyle(2, 0xe8b860, 0.9).strokePoints(hexPoints(p.x, p.y, size * 0.84), true);
          g.fillStyle(0xe8b860).fillRect(p.x - 6, p.y - 1.5, 12, 3).fillRect(p.x - 1.5, p.y - 6, 3, 12);
        }
        if (h.pending) {
          // 꿀을 모으는 중인 칸: 모인 만큼 차오른다
          const p = hexPos(h.pending.q, h.pending.r, size, cx, cy);
          const f = Math.min(1, h.honey / cellCost(h));
          g.fillStyle(0xffc94a, 0.35).fillPoints(hexPoints(p.x, p.y, size * 0.84), true);
          g.fillStyle(0xffc94a).fillPoints(hexPoints(p.x, p.y, size * 0.84 * Math.max(0.2, f)), true);
          g.lineStyle(3, 0xffd23f).strokePoints(hexPoints(p.x, p.y, size * 0.84), true);
        }
      }
      for (const st of h.sites) {
        const p = hexPos(st.q, st.r, size, cx, cy);
        const f = st.progress / CONFIG.BUILD_TIME;
        g.fillStyle(0xd9a441, 0.4).fillPoints(hexPoints(p.x, p.y, size * 0.84), true);
        g.fillStyle(0xd9a441).fillPoints(hexPoints(p.x, p.y, size * 0.84 * Math.max(0.15, f)), true);
        // 짓는 동안 밀랍 가루가 날린다
        if (st.progress > 0 && st.progress !== st.seen && Math.random() < this.dt * 7) this.burst(p.x, p.y, 1, [0xfff1c2, 0xe8b860], big ? 6 : 2.5, false);
        st.seen = st.progress;
      }
      for (const c of h.cells) {
        const p = hexPos(c.q, c.r, size, cx, cy);
        // 막 완성된 칸은 통 튄다
        const age = c.builtAt === undefined ? 1 : this.sim.time - c.builtAt;
        const pop = age < 0.3 ? 1 + 0.35 * Math.sin((age / 0.3) * Math.PI) : 1;
        this.drawCell(g, p.x, p.y, size * pop, edge, c.hp < CONFIG.CELL_HP ? 'hurt' : c.queen ? 'queen' : 'empty', big);
        if (c.flash > 0) {
          c.flash--; // 맞는 칸은 하얗게 번쩍인다
          g.fillStyle(0xffffff, 0.7).fillPoints(hexPoints(p.x, p.y, size * 0.84), true);
        }
        if (c.brood && !(c.queen && h.queenAlive)) this.drawBrood(g, c.brood, p.x, p.y, big);
      }
      if (h.queenAlive) sprite(g, SPR.queen, cx, cy - size * 0.1, size * 1.25, 16);
      if (h.queenAlive && h.queenFlash > 0) {
        h.queenFlash--;
        g.fillStyle(0xffffff, 0.75).fillRect(cx - size * 0.55, cy - size * 0.4, size * 1.1, size * 0.95);
      }
      // 여왕 체력 (다쳤을 때만)
      if (h.queenAlive && h.queenHp < CONFIG.QUEEN_HP) {
        const w = big ? 60 : 30;
        g.fillStyle(INK).fillRect(cx - w / 2 - 1, cy - size - 9, w + 2, 6);
        g.fillStyle(hpColor(h.queenHp / CONFIG.QUEEN_HP)).fillRect(cx - w / 2, cy - size - 8, (w * Math.max(0, h.queenHp)) / CONFIG.QUEEN_HP, 4);
      }
    }

    drawFlower(g, f, picked) {
      const s = this.sim;
      const r = f.big ? 42 : 28;
      const alive = flowerAlive(s, f);
      g.fillStyle(INK).fillRect(f.x - r - 3, f.y - r - 3, r * 2 + 6, r * 2 + 6);
      g.fillStyle(alive ? 0x5fa83a : 0xb9b28c).fillRect(f.x - r, f.y - r, r * 2, r * 2);
      if (picked && alive) g.lineStyle(3, 0xffd23f).strokeRect(f.x - r - 3, f.y - r - 3, r * 2 + 6, r * 2 + 6);
      // 질 때가 가까울수록 꽃송이가 줄어든다
      const spots = [[-0.55, -0.5], [0.25, -0.6], [0.6, -0.05], [-0.1, 0.05], [-0.6, 0.5], [0.35, 0.55], [0, -0.3], [0.6, 0.6], [-0.3, 0.62]];
      const total = f.big ? 9 : 6;
      const n = alive ? Math.max(1, Math.ceil(total * Math.min(1, (f.wiltAt - s.time) / 120))) : 0;
      const list = f.big ? SPR.flowerBig : SPR.flower;
      for (let i = 0; i < n; i++) sprite(g, list, f.x + spots[i][0] * r * 0.8, f.y + spots[i][1] * r * 0.8, f.big ? 20 : 17, 10);
    }

    drawMap(g) {
      const s = this.sim;
      const me = this.me;
      // 체크무늬 풀밭과 장식 블록
      g.fillStyle(0x7ec850).fillRect(0, 0, W, H);
      g.fillStyle(0x74be48);
      for (let y = 0; y < H; y += 50) for (let x = (y / 50) % 2 ? 50 : 0; x < W; x += 100) g.fillRect(x, y, 50, 50);
      for (const [x, y, c] of DECO) {
        g.fillStyle(INK).fillRect(x - 2, y - 2, 22, 22);
        g.fillStyle(c).fillRect(x, y, 18, 18);
        g.fillStyle(0xffffff, 0.25).fillRect(x + 3, y + 3, 5, 5);
      }

      s.flowers.forEach((f, i) => this.drawFlower(g, f, i === me.gatherAt));

      // 공격 대상 표시
      if (me.attackTarget !== null) {
        const T = s.hives[me.attackTarget];
        g.lineStyle(3, 0xd9453f, 0.95).strokeCircle(T.x, T.y, Math.max(48, T.radius + 12));
      }
      // 공격 버튼을 끄는 동안 놓을 수 있는 벌집 표시
      if (this.drag && this.drag.from === ATTACK) {
        for (const h of s.hives) if (!h.defeated) g.lineStyle(3, h.id === ME ? 0x3f7fd9 : 0xd9453f, 0.7).strokeCircle(h.x, h.y, Math.max(52, h.radius + 16));
      }

      for (const h of s.hives) if (!h.defeated) this.drawHive(g, h, CONFIG.MAP_HEX, h.x, h.y, false);

      for (const b of s.bees) {
        // 갓 태어난 벌은 칸에서 튀어 올랐다가 착지하며 한 번 더 통 튄다
        const age = s.time - b.born;
        const hop = age < 0.4 ? 16 * Math.sin((age / 0.4) * Math.PI) : age < 0.6 ? 5 * Math.sin(((age - 0.4) / 0.2) * Math.PI) : 0;
        sprite(g, BEE_SMALL[b.hive][b.role], b.x, b.y - (s.time > 1 ? hop : 0), 13, 12);
        if (b.flash > 0) {
          b.flash--; // 맞는 순간 하얗게 번쩍인다
          g.fillStyle(0xffffff, 0.8).fillRect(b.x - 5.4, b.y - 4.3, 10.8, 8.7);
        }
        if (b.carry > 0 || b.loot > 0) {
          g.fillStyle(INK).fillRect(b.x - 3, b.y + 5, 6, 6);
          g.fillStyle(0xffc233).fillRect(b.x - 2, b.y + 6, 4, 4);
        }
        if (b.captive) sprite(g, SPR.larva, b.x, b.y - 10, 10, 10);
        if (b.hp < CONFIG.BEE_HP) {
          g.fillStyle(INK).fillRect(b.x - 7, b.y - 11, 14, 4);
          g.fillStyle(hpColor(b.hp / CONFIG.BEE_HP)).fillRect(b.x - 6, b.y - 10, (12 * Math.max(0, b.hp)) / CONFIG.BEE_HP, 2);
        }
      }
    }

    drawHiveView(g) {
      const s = this.sim;
      const me = this.me;
      // 지금 보이는 범위만큼만 벌집 무늬 배경을 깐다
      const cam = this.cam.hive;
      const T = 64;
      const x0 = Math.floor(-cam.x / cam.z / T) * T;
      const y0 = Math.floor(-cam.y / cam.z / T) * T;
      const x1 = (W - cam.x) / cam.z;
      const y1 = (H - cam.y) / cam.z;
      g.fillStyle(0x8a5a1e).fillRect(x0, y0, x1 - x0 + T, y1 - y0 + T);
      g.fillStyle(0x82531a);
      for (let y = y0; y < y1; y += T) for (let x = x0 + ((y / T) % 2 ? T : 0); x < x1; x += T * 2) g.fillRect(x, y, T, T);
      this.drawHive(g, me, HIVE_HEX, HIVE_CX, HIVE_CY, true);

      // 칸에서 일하는 벌 표시 (먹이는 중, 짓는 중)
      for (const b of s.bees) {
        if (b.hive !== ME) continue;
        const where = b.state === 'feed' ? b.target : b.state === 'build' ? b.site : null;
        if (!where) continue;
        const q = hexPos(where.q, where.r, HIVE_HEX, HIVE_CX, HIVE_CY);
        sprite(g, BEE_BIG[ME][b.role], q.x + 13, q.y - 13, 18, 12);
      }
    }

    plate(g, r, fill) {
      g.fillStyle(INK).fillRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4);
      g.fillStyle(fill === undefined ? CREAM : fill).fillRect(r.x, r.y, r.w, r.h);
    }

    draw() {
      const s = this.sim;
      const me = this.me;
      const g = this.g;
      const map = this.view === 'map';
      const p = this.input.activePointer;
      g.clear();

      // 맵·벌집 층: 확대와 이동을 적용해서 그린다
      const cam = this.cam[this.view];
      const gw = this.gw;
      gw.clear();
      gw.setScale(cam.z).setPosition(cam.x, cam.y);
      for (const q of this.parts) {
        q.t += this.dt;
        q.vy += 420 * this.dt;
        q.x += q.vx * this.dt;
        q.y += q.vy * this.dt;
      }
      this.parts = this.parts.filter((q) => q.t < q.life);
      if (map) this.drawMap(gw);
      else this.drawHiveView(gw);
      this.drawParts(gw, false);
      this.drawJuice(g, gw);
      this.mapLabels.forEach((t, i) => {
        t.setVisible(map && !s.hives[i].defeated);
        t.setPosition(t.wx * cam.z + cam.x, t.wy * cam.z + cam.y);
      });

      // 위쪽 나무판
      g.fillStyle(WOOD_D).fillRect(0, 0, W, 34);
      g.fillStyle(WOOD).fillRect(0, 0, W, 31);
      this.plate(g, { x: 8, y: 5, w: 98, h: 22 });
      g.fillStyle(INK).fillRect(12, 9, 14, 14);
      g.fillStyle(0xf2b824).fillRect(14, 11, 10, 10);
      this.plate(g, { x: 116, y: 5, w: 88, h: 22 });
      sprite(g, BEE_BIG[ME].gather, 128, 16, 16, 12);
      this.drawQueenBar(g);
      this.drawParts(g, true);
      this.honeyText.setText('꿀 ' + Math.floor(me.honey));
      const c = counts(s, ME);
      this.beeText.setText('벌 ' + (c.gather + c.build + c.nurse + c.defend + c.attack + c.drone));
      const m = Math.floor(s.time / 60);
      const sec = Math.floor(s.time % 60);
      this.timeText.setText(m + ':' + String(sec).padStart(2, '0'));
      sprite(g, SPR.flower, W / 2 + 10, 16, 18, 10);
      this.flowerText.setText(Math.ceil(flowersLeft(s) * 100) + '%');

      this.plate(g, SND_BTN);
      this.sndText.setText(Sfx.on ? '소리 켬' : '소리 끔');
      this.plate(g, RAID_BTN);
      this.raidText.setText('애벌레: ' + (me.raidMode === 'eat' ? '먹기' : '납치'));

      // 벌집 화면: 수벌 조절판
      this.droneTexts.forEach((t) => t.setVisible(!map));
      if (!map) {
        this.plate(g, DR_PANEL);
        sprite(g, BEE_BIG[ME].drone, DR_PANEL.x + DR_PANEL.w - 18, DR_PANEL.y + 16, 22, 12);
        this.plate(g, DR_MINUS, 0xffe27a);
        this.plate(g, DR_PLUS, 0xffe27a);
        this.droneTexts[0].setText('수벌 ' + c.drone + ' / 목표 ' + me.droneTarget);
        this.droneTexts[1].setText(me.queenAlive ? '알 ' + layInterval(me).toFixed(1) + '초마다 낳아요' : '여왕이 없어요');
      }

      // 역할 바
      const hover = this.drag ? buttonAt(p.x, p.y) : -1;
      for (let i = 0; i < 5; i++) {
        const b = BUTTONS[i];
        const bx = BX + i * (BW + GAP);
        const active = this.drag && (this.drag.from === i || hover === i);
        g.fillStyle(INK).fillRect(bx, BY, BW, BH);
        g.fillStyle(active ? 0xffe27a : CREAM).fillRect(bx + 3, BY + 3, BW - 6, BH - 6);
        g.fillStyle(active ? 0xe8c24a : 0xe0c690).fillRect(bx + 3, BY + BH - 7, BW - 6, 4);
        sprite(g, BEE_BIG[ME][b.role], bx + 25, BY + 22, 28, 12);
        this.btnTexts[i].count.setText(String(c[b.role]));
      }

      // 화면 전환 버튼
      g.fillStyle(INK).fillRect(VIEW_BTN.x, VIEW_BTN.y, VIEW_BTN.w, VIEW_BTN.h);
      g.fillStyle(0xf5a623).fillRect(VIEW_BTN.x + 3, VIEW_BTN.y + 3, VIEW_BTN.w - 6, VIEW_BTN.h - 6);
      g.fillStyle(0xc77e12).fillRect(VIEW_BTN.x + 3, VIEW_BTN.y + VIEW_BTN.h - 7, VIEW_BTN.w - 6, 4);
      this.viewText.setText(map ? '벌집' : '맵');

      this.hint.setText(this.hintText(c));

      // 끄는 동안 선
      if (this.drag) {
        const sx = BX + this.drag.from * (BW + GAP) + BW / 2;
        g.lineStyle(4, INK, 0.9).lineBetween(sx, BY + BH / 2, p.x, p.y);
        g.lineStyle(2, 0xffd23f).lineBetween(sx, BY + BH / 2, p.x, p.y);
        sprite(g, BEE_BIG[ME][BUTTONS[this.drag.from].role], p.x, p.y - 14, 24, 12);
      }

      // 내 벌집이 공격받는 중: 화면 테두리가 빨갛게 깜빡인다
      if (s.time - me.lastHit < 1 && Math.floor(this.time.now / 250) % 2 === 0) {
        g.lineStyle(10, 0xe02020, 0.85).strokeRect(5, 5, W - 10, H - 10);
      }

      // 승패
      this.overText.setVisible(!!s.over);
      this.overSub.setVisible(!!s.over);
      if (s.over) {
        g.fillStyle(INK).fillRect(0, 116, W, 138);
        g.fillStyle(CREAM).fillRect(0, 120, W, 130);
        this.overText.setText(this.won() ? '승리!' : '패배');
        const who = this.lastRaider !== undefined ? HIVE_NAME[this.lastRaider] + '에게 ' : '';
        if (this.net) {
          const champ = s.winner === null || this.won() ? '' : HIVE_NAME[s.winner] + ' 승리 · ';
          this.overSub.setText(champ + '화면을 누르면 대기실로 돌아가요');
        } else {
          this.overSub.setText((this.won() ? '' : who + '여왕과 애벌레를 모두 잃었어요 · ') + '화면을 누르면 다시 시작해요');
        }
      }
    }
  }

  // 글꼴이 준비된 뒤에 시작한다. 못 받아와도 1.5초 뒤에는 기본 글꼴로 시작.
  const fontReady = new Promise((done) => {
    setTimeout(done, 1500);
    try {
      document.fonts.load('18px "Do Hyeon"').then(done, done);
    } catch (e) {
      done();
    }
  });

  let game = null;
  let runId = 0;
  // 메뉴(lobby.js)에서 부른다.
  //   STQ.start()                                          → 혼자 하기 (AI 2명과)
  //   STQ.start({ net, seat, names, view, onExit })        → 같이 하기 (서버가 게임을 돌린다)
  window.STQ = {
    start(opts) {
      this.stop();
      const id = ++runId;
      OPTS = opts || {};
      ME = OPTS.seat || 0;
      HIVE_NAME = OPTS.names ? OPTS.names.map((n, i) => (i === ME ? '내 벌집' : n)) : ['내 벌집', '공격형 AI', '수비형 AI'];
      fontReady.then(() => {
        if (id !== runId) return; // 그 사이에 취소됨
        game = window.__stq = new Phaser.Game({ // __stq: 디버깅할 때 콘솔에서 볼 수 있게 남겨 둔다
          type: Phaser.AUTO,
          parent: 'game',
          backgroundColor: '#7ec850',
          scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: W, height: H },
          input: { activePointers: 3 }, // 두 손가락 확대를 위해
          scene: Play,
        });
      });
    },
    stop() {
      runId++;
      if (game) game.destroy(true);
      game = window.__stq = null;
    },
  };
})();
