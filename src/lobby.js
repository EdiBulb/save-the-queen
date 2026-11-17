// 여왕을 지켜라 — 처음 화면, 친구와 하기, 서버 깨우는 중, 대기실, 게임 방법.
// 같이 하기일 때는 게임 서버와 웹소켓으로 연결한다.
(function () {
  const $ = (id) => document.getElementById(id);
  const ui = $('ui');
  const SCREENS = ['title', 'join', 'waking', 'lobby', 'guide'];
  const SEAT_COLOR = ['#FFC233', '#E06A55', '#7FA6DA']; // 맵의 벌집 색 (나·왼쪽 위·오른쪽 위)
  const SEAT_PLACE = ['아래', '왼쪽 위', '오른쪽 위'];
  const WAKE_EXPECT = 60; // 무료 서버가 깨어나는 데 걸리는 시간(초), 진행 막대용

  let ws = null;
  let room = null; // 서버가 알려준 방 정보
  let names = null;
  let view = null; // 서버에서 받은 게임 상태
  let playing = false;
  let afterGuide = null;
  let wanted = null; // 연결되면 보낼 요청 (방 만들기 / 들어가기)
  let waking = null; // 서버를 깨우는 중인 연결 시도

  function show(name) {
    ui.hidden = !name;
    for (const s of SCREENS) $(s).hidden = s !== name;
    if (name) ui.scrollTop = 0;
  }
  function status(msg) {
    $('status').textContent = msg || '';
  }
  function store(key, value) {
    try {
      if (value === undefined) return window.localStorage.getItem(key);
      window.localStorage.setItem(key, value);
    } catch (e) {
      /* 저장이 안 되는 환경이어도 게임은 된다 */
    }
    return null;
  }

  // ---- 게임 방법 ----
  function openGuide(then) {
    afterGuide = then || null;
    show('guide');
  }
  $('guideOk').onclick = () => {
    store('stq_guide_seen', '1');
    const next = afterGuide;
    afterGuide = null;
    if (next) next();
    else show('title');
  };
  $('howto').onclick = () => openGuide();

  // ---- 혼자 하기 ----
  function playSolo() {
    cancelWake();
    const go = () => {
      show(null);
      window.STQ.start();
    };
    if (store('stq_guide_seen')) go();
    else openGuide(go); // 처음이면 게임 방법부터
  }
  $('solo').onclick = playSolo;
  $('wakeSolo').onclick = playSolo;

  // ---- 친구와 하기 ----
  $('friends').onclick = () => {
    status(serverUrl() ? '' : '같이 하기는 게임 서버에 올린 뒤에 쓸 수 있어요.');
    show('join');
  };
  $('joinBack').onclick = () => show('title');

  function serverUrl() {
    const s = window.STQ_SERVER;
    if (!s) return null;
    if (s === 'same') return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
    return s;
  }

  // 페이지를 열자마자 잠든 서버를 깨워 둔다. 게임 방법을 읽는 사이에 깨어나도록.
  function nudgeServer() {
    const url = serverUrl();
    if (!url || window.STQ_SERVER === 'same') return; // 같은 주소면 이미 깨어 있다
    try {
      fetch(url.replace(/^ws/, 'http') + '/health', { mode: 'no-cors', cache: 'no-store' }).catch(() => {});
    } catch (e) {
      /* 깨우기에 실패해도 연결할 때 다시 시도한다 */
    }
  }

  // 서버에 연결한다. 잠들어 있으면 '벌들을 깨우는 중' 화면을 보여 주고 3초마다 다시 시도한다.
  function connect(request) {
    wanted = request;
    if (!serverUrl()) return status('같이 하기는 게임 서버에 올린 뒤에 쓸 수 있어요.');
    if (ws && ws.readyState === 1) return void send(wanted);
    if (waking) return;
    const began = Date.now();
    const attempt = { stopped: false, timer: null, sock: null };
    waking = attempt;
    let shown = false;
    // 0.8초 안에 연결되면 깨우는 화면 없이 바로 간다
    const showTimer = setTimeout(() => {
      if (attempt.stopped) return;
      shown = true;
      show('waking');
    }, 800);
    const bar = setInterval(() => {
      const n = Math.min(7, Math.floor(((Date.now() - began) / 1000 / WAKE_EXPECT) * 8));
      Array.from($('wakeBar').children).forEach((b, i) => b.classList.toggle('on', i <= n));
    }, 300);
    const finish = () => {
      attempt.stopped = true;
      clearTimeout(showTimer);
      clearTimeout(attempt.timer);
      clearInterval(bar);
      if (waking === attempt) waking = null;
    };
    attempt.finish = finish;
    const tryOnce = () => {
      if (attempt.stopped) return;
      let opened = false;
      const sock = new WebSocket(serverUrl());
      attempt.sock = sock;
      sock.onopen = () => {
        if (attempt.stopped) return sock.close();
        opened = true;
        finish();
        ws = sock;
        status('');
        send(wanted);
      };
      sock.onmessage = (ev) => onMessage(JSON.parse(ev.data));
      sock.onclose = () => {
        if (opened) return onClosed();
        if (attempt.stopped) return;
        if (Date.now() - began > 120000) {
          finish();
          show('join');
          return status('서버에 연결하지 못했어요. 잠시 뒤에 다시 해 주세요.');
        }
        attempt.timer = setTimeout(tryOnce, 3000);
      };
    };
    tryOnce();
    return shown;
  }
  function cancelWake() {
    if (!waking) return;
    const a = waking;
    a.finish();
    if (a.sock && a.sock.readyState <= 1) a.sock.close();
  }
  $('wakeCancel').onclick = () => {
    cancelWake();
    show('join');
  };

  function send(msg) {
    if (msg && ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
  }
  function myName() {
    const n = $('name').value.trim();
    store('stq_name', n);
    return n;
  }

  function onClosed() {
    ws = null;
    room = null;
    if (playing) {
      playing = false;
      window.STQ.stop();
    }
    show('join');
    status('서버와 연결이 끊겼어요.');
  }

  function onMessage(m) {
    if (m.t === 'room') {
      room = m;
      if (!playing) {
        renderLobby();
        show('lobby');
      }
    } else if (m.t === 'error') {
      show('join');
      status(m.msg);
    } else if (m.t === 'start') {
      names = m.names;
      view = window.Net.emptyView();
    } else if (m.t === 'state' && view) {
      window.Net.unpack(view, m.s);
      if (!playing) {
        // 첫 상태를 받으면 게임 화면을 연다
        playing = true;
        show(null);
        window.STQ.start({ net: { send }, seat: room.you, names, view, onExit: backToLobby });
      }
    }
  }

  function backToLobby() {
    playing = false;
    view = null;
    window.STQ.stop();
    if (room) {
      renderLobby();
      show('lobby');
    } else {
      show('title');
    }
  }

  function hexIcon(color) {
    const pts = (s) =>
      Array.from({ length: 6 }, (_, i) => {
        const a = (Math.PI / 180) * (60 * i - 30);
        return (15 + s * Math.cos(a)).toFixed(1) + ',' + (15 + s * Math.sin(a)).toFixed(1);
      }).join(' ');
    return '<svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true"><polygon points="' + pts(14) + '" fill="#3a2410"/><polygon points="' + pts(10.5) + '" fill="' + color + '"/></svg>';
  }

  function renderLobby() {
    const codeBox = $('roomCode');
    codeBox.textContent = '';
    for (const ch of room.code) {
      const s = document.createElement('span');
      s.textContent = ch;
      codeBox.appendChild(s);
    }
    const link = location.origin + location.pathname + '?room=' + room.code;
    $('link').value = link;
    const qr = $('qr');
    qr.textContent = '';
    if (window.qrcode) {
      try {
        const q = window.qrcode(0, 'M');
        q.addData(link);
        q.make();
        const img = new Image();
        img.alt = '초대 QR 코드';
        img.src = q.createDataURL(4, 8);
        qr.appendChild(img);
      } catch (e) {
        /* QR을 못 만들어도 코드와 링크로 들어올 수 있다 */
      }
    }
    const list = $('players');
    list.textContent = '';
    let people = 0;
    room.players.forEach((p, seat) => {
      const li = document.createElement('li');
      li.insertAdjacentHTML('beforeend', hexIcon(SEAT_COLOR[seat]));
      const who = document.createElement('span');
      const tag = document.createElement('span');
      tag.className = 'tag';
      if (p) {
        people++;
        who.textContent = p.name + (seat === room.you ? ' (나)' : '');
        tag.textContent = (seat === room.host ? '방장 · ' : '') + SEAT_PLACE[seat];
      } else {
        li.className = 'empty';
        who.textContent = '빈 자리';
        tag.textContent = '시작하면 AI가 채워요';
      }
      li.append(who, tag);
      list.appendChild(li);
    });
    const host = room.you === room.host;
    $('start').hidden = !host;
    const empty = 3 - people;
    $('startNote').textContent = people + '명' + (empty ? ' · 빈 자리 ' + empty + '개는 AI' : '');
    $('lobbyNote').textContent = host ? '다 모이면 게임 시작을 누르세요. 혼자여도 시작할 수 있어요.' : '방장이 시작하기를 기다리는 중이에요.';
  }

  $('create').onclick = () => connect({ t: 'create', name: myName() });
  $('enter').onclick = () => {
    const code = $('code').value.trim().toUpperCase();
    if (code.length !== 4) return status('방 코드 네 글자를 입력해 주세요.');
    connect({ t: 'join', code, name: myName() });
  };
  $('start').onclick = () => send({ t: 'start' });
  $('leave').onclick = () => {
    send({ t: 'leave' });
    room = null;
    show('join');
    status('');
  };
  $('copy').onclick = () => {
    const done = () => ($('copy').textContent = '복사됨');
    const el = $('link');
    el.select();
    try {
      navigator.clipboard.writeText(el.value).then(done, () => document.execCommand('copy') && done());
    } catch (e) {
      if (document.execCommand('copy')) done();
    }
  };

  // ---- 시작 ----
  $('name').value = store('stq_name') || '';
  nudgeServer();
  const invited = new URLSearchParams(location.search).get('room');
  if (invited) {
    // 초대 링크로 왔으면 코드를 채워서 바로 친구와 하기 화면으로
    $('code').value = invited.toUpperCase().slice(0, 4);
    show('join');
    status('방 코드가 입력됐어요. 이름을 적고 들어가기를 누르세요.');
    if (!store('stq_guide_seen')) openGuide(() => show('join'));
  } else {
    show('title');
    if (!store('stq_guide_seen')) openGuide(); // 처음 온 사람에게는 게임 방법을 먼저 보여 준다
  }
})();
