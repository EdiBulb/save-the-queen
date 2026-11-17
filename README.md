# 여왕을 지켜라 (Save the Queen)

벌집을 키우고, 여왕을 지키고, 남의 벌집을 터는 모바일 실시간 전략 게임. 혼자서 AI 2명과 하거나, 친구와 방 코드·QR로 모여서 최대 3명이 함께 한다.

## 폴더 구조

| 파일 | 하는 일 |
|---|---|
| `index.html` | 처음 화면, 대기실, 게임 방법 |
| `config.js` | 게임 서버 주소 |
| `src/sim.js` | 게임 규칙. 브라우저와 서버가 같이 쓴다. 밸런스 숫자는 맨 위 `CONFIG` |
| `src/net.js` | 서버와 화면이 주고받는 상태의 포장과 풀기 |
| `src/main.js` | 화면 그리기와 입력 (Phaser) |
| `src/sfx.js` | 효과음 |
| `src/lobby.js` | 메뉴, 대기실, 서버 연결 |
| `server/server.js` | 게임 서버. 방마다 `sim.js`를 돌리고 상태를 1초에 10번 보낸다 |
| `test/` | 규칙 테스트, 서버 테스트, 밸런스 자동 대전 |

## 내 컴퓨터에서 실행

```bash
npm install
npm start          # http://localhost:3000
npm test           # 규칙 + 서버 테스트
node test/balance.js   # AI끼리 자동 대전
node test/player.js    # 가상 플레이어 vs AI
```

같은 와이파이의 폰에서는 `http://(컴퓨터 IP):3000`으로 들어오면 된다.

## 인터넷에 올리기

**방법 1 — 서버 하나로 (가장 간단)**

1. 이 폴더를 GitHub 저장소에 올린다.
2. Render에서 Web Service를 만들고 저장소를 연결한다. Build Command `npm install`, Start Command `npm start`.
3. Render가 준 주소로 접속하면 끝. 화면과 게임 서버가 같은 주소라 `config.js`는 손댈 필요가 없다.

무료 서버는 한동안 안 쓰면 잠들어서, 첫 접속 때 화면이 뜨기까지 1분쯤 걸린다.

**방법 2 — 화면은 Cloudflare, 게임 서버는 Render (할리갈리와 같은 구성)**

1. 위와 같이 Render에 게임 서버를 올린다.
2. `config.js`를 `window.STQ_SERVER = 'wss://(Render 주소)';`로 바꾼다.
3. Cloudflare Pages에 이 저장소를 정적 사이트로 올린다 (빌드 명령 없음, 출력 폴더는 최상위).

화면은 바로 뜨고, 방 만들기를 누를 때 "서버를 깨우는 중"이 잠깐 보인다.

## 같이 하기의 규칙

- 방장이 방을 만들면 코드 네 글자와 QR이 나온다. 친구는 코드를 입력하거나 QR·링크로 들어온다.
- 방장이 시작하면 빈 자리는 AI가 채운다.
- 게임 중에 나간 사람의 벌집은 AI가 이어받는다. 시작한 방에는 판이 끝날 때까지 새로 들어올 수 없다.
- 마지막 한 벌집이 남으면 끝나고, 모두 대기실로 돌아온다.
