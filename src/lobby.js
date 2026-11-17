// 여왕을 지켜라 — 처음 화면, 대기실, 게임 방법. 같이 하기일 때는 게임 서버와 연결한다.
(function () {
  const $ = (id) => document.getElementById(id);
  const ui = $('ui');
  const panels = { menu: $('menu'), lobby: $('lobby'), guide: $('guide') };
  const SEAT_COLOR = ['#b8741f', '#b0432f', '#3f6fb0']; // 맵에서 벌집 테두리 색과 같다
  const SEAT_PLACE = ['아래', '왼쪽 위', '오른쪽 위'];

  let ws = null;
  let room = null; // 서버가 알려준 방 정보
  let names = null;
  let view = null; // 서버에서 받은 게임 상태
  let playing = false;
  let afterGuide = null;

  function show(name) {
    ui.hidden = !name;
    for (const k of Object.keys(panels)) panels[k].hidden = k !== name;
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
    else show(room ? 'lobby' : 'menu');
  };
  $('howto').onclick = () => openGuide();

  // ---- 혼자 하기 ----
  $('solo').onclick = () => {
    const go = () => {
      show(null);
      window.STQ.start();
    };
    if (store('stq_guide_seen')) go();
    else openGuide(go); // 처음이면 게임 방법부터
  };

  // ---- 같이 하기: 서버 연결 ----
  function serverUrl() {
    const s = window.STQ_SERVER;
    if (!s) return null;
    if (s === 'same') return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
    return s;
  }

  // 연결될 때까지 3초마다 다시 시도한다 (무료 서버는 잠들어 있다가 깨어나는 데 1분쯤 걸린다)
  function connect(onOpen) {
    const url = serverUrl();
    if (!url) return status('같이 하기는 게임 서버에 올린 뒤에 쓸 수 있어요. 지금은 혼자 하기만 돼요.');
    if (ws && ws.readyState === 1) return onOpen();
    const began = Date.now();
    setBusy(true);
    const attempt = () => {
      let opened = false;
      const sock = new WebSocket(url);
      sock.onopen = () => {
        opened = true;
        ws = sock;
        setBusy(false);
        status('');
        onOpen();
      };
      sock.onmessage = (ev) => onMessage(JSON.parse(ev.data));
      sock.onclose = () => {
        if (opened) return onClosed();
        if (Date.now() - began > 90000) {
          setBusy(false);
          return status('서버에 연결하지 못했어요. 잠시 뒤에 다시 해 주세요.');
        }
        status('서버를 깨우는 중이에요… 처음엔 1분쯤 걸릴 수 있어요.');
        setTimeout(attempt, 3000);
      };
    };
    attempt();
  }
  function setBusy(busy) {
    $('create').disabled = busy;
    $('join').disabled = busy;
  }
  function send(msg) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
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
    show('menu');
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
      show('menu');
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
      show('menu');
    }
  }

  function renderLobby() {
    $('roomCode').textContent = room.code;
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
    room.players.forEach((p, seat) => {
      const li = document.createElement('li');
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = SEAT_COLOR[seat];
      const who = document.createElement('span');
      const tag = document.createElement('span');
      tag.className = 'tag';
      if (p) {
        who.textContent = p.name + (seat === room.you ? ' (나)' : '');
        tag.textContent = (seat === room.host ? '방장 · ' : '') + SEAT_PLACE[seat];
      } else {
        li.className = 'empty';
        who.textContent = '빈 자리';
        tag.textContent = '시작하면 AI가 채워요';
      }
      li.append(dot, who, tag);
      list.appendChild(li);
    });
    const host = room.you === room.host;
    $('start').hidden = !host;
    $('lobbyNote').textContent = host ? '다 모이면 게임 시작을 누르세요. 혼자여도 시작할 수 있어요.' : '방장이 시작하기를 기다리는 중이에요.';
  }

  $('create').onclick = () => connect(() => send({ t: 'create', name: myName() }));
  $('join').onclick = () => {
    const code = $('code').value.trim().toUpperCase();
    if (code.length !== 4) return status('방 코드 네 글자를 입력해 주세요.');
    connect(() => send({ t: 'join', code, name: myName() }));
  };
  $('start').onclick = () => send({ t: 'start' });
  $('leave').onclick = () => {
    send({ t: 'leave' });
    room = null;
    show('menu');
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
  const invited = new URLSearchParams(location.search).get('room');
  if (invited) {
    $('code').value = invited.toUpperCase().slice(0, 4);
    status('방 코드가 입력됐어요. 이름을 적고 들어가기를 누르세요.');
  }
  if (!serverUrl()) {
    $('create').disabled = true;
    $('join').disabled = true;
    if (!invited) status('같이 하기는 게임 서버에 올린 뒤에 쓸 수 있어요.');
  }
  show('menu');
  if (!store('stq_guide_seen')) openGuide(); // 처음 온 사람에게는 게임 방법을 먼저 보여 준다
})();
