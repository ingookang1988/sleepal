#!/usr/bin/env node
/**
 * 로컬 정적 서버 — `app/` 미리보기용.
 *
 * 존재 이유: `file://` 로 열면 스크립트가 돌지 않는 환경이 있고,
 * Web Bluetooth 는 아예 보안 컨텍스트(HTTPS 또는 localhost)를 요구한다.
 * localhost 는 보안 컨텍스트로 취급되므로 [WO-01b-1] 검증은 여기서 하고,
 * 폰 실기는 [WO-01b-2] 의 HTTPS 배포에서 한다.
 *
 *   node scripts/serve.js [포트] [루트]   기본 5173 · 루트=cwd → http://localhost:5173/app/
 *
 * Railway 는 PORT 를 주입하고 SERVE_ROOT=app 을 걸어 얼굴이 도메인 루트에서
 * 열리게 한다(무대에서 칠 URL 이 짧아야 한다). 로컬은 기본값 그대로 둔다 —
 * `app/face-sheet.html` 이 /app/ 경로를 쓰기 때문이다.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(process.cwd(), process.env.SERVE_ROOT || process.argv[3] || '.');
const PORT = Number(process.env.PORT || process.argv[2]) || 5173;
const HOST = process.env.PORT ? '0.0.0.0' : '127.0.0.1';   // 컨테이너에서는 외부 바인딩이 필요하다
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',   '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',             '.png': 'image/png',
  '.jpg': 'image/jpeg',                '.pdf': 'application/pdf',
  '.mp3': 'audio/mpeg',                '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',                 '.woff2': 'font/woff2',
};

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(ROOT, url);
  // 루트 밖으로 나가는 경로는 거부한다.
  if (!file.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }
  try {
    if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  } catch { res.writeHead(404).end('not found'); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(buf);
  });
}).listen(PORT, HOST, () => console.log(`serve: ${HOST}:${PORT}  root=${ROOT}`));
