// 게임 서버 주소.
//   ''                                   → 서버 없음 (혼자 하기만 됨)
//   'wss://save-the-queen.onrender.com'  → 화면을 Cloudflare 등에 따로 올렸을 때의 게임 서버
// 게임 서버(server.js)에서 화면을 직접 받으면 이 파일 대신 서버가 'same'(같은 주소)을 내려준다.
window.STQ_SERVER = 'wss://save-the-queen.onrender.com';
