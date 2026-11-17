// 게임 서버 주소.
//   ''                              → 서버 없음 (혼자 하기만 됨)
//   'wss://내서버.onrender.com'      → 화면을 다른 곳(Cloudflare 등)에 올렸을 때 게임 서버 주소
// 게임 서버(server.js)에서 화면을 직접 받으면 이 파일 대신 서버가 'same'(같은 주소)을 내려준다.
window.STQ_SERVER = '';
