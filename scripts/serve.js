#!/usr/bin/env node
/**
 * 로컬 정적 서버 + zero-dep API 프록시.
 *
 * 정적 서빙의 존재 이유: `file://` 로 열면 스크립트가 돌지 않는 환경이 있고,
 * Web Bluetooth 는 아예 보안 컨텍스트(HTTPS 또는 localhost)를 요구한다.
 * localhost 는 보안 컨텍스트로 취급되므로 [WO-01b-1] 검증은 여기서 하고,
 * 폰 실기는 [WO-01b-2] 의 HTTPS 배포에서 한다.
 *
 *   node scripts/serve.js [포트] [루트]   기본 5173 · 루트=cwd → http://localhost:5173/app/
 *
 * Railway 는 PORT 를 주입하고 SERVE_ROOT=app 을 걸어 얼굴이 도메인 루트에서
 * 열리게 한다(무대에서 칠 URL 이 짧아야 한다). 로컬은 기본값 그대로 둔다 —
 * `app/face-sheet.html` 이 /app/ 경로를 쓰기 때문이다.
 *
 * [WO-02a-3] `/api/*` 프록시 — 계약은 [CON-04]. 키는 여기(서버) 환경변수에만
 * 존재하고 클라이언트는 제공자를 모른다. 의존성 0 유지(Node 18+ 내장 fetch).
 * 제공자명·모델명은 응답에도 로그에도 새지 않는다([CON-04] 규칙 1) —
 * catch 에서 err.message 를 그대로 찍지 않는 것은 그 때문이다.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(process.cwd(), process.env.SERVE_ROOT || process.argv[3] || '.');
const PORT = Number(process.env.PORT || process.argv[2]) || 5173;
const HOST = process.env.PORT ? '0.0.0.0' : '127.0.0.1';   // 컨테이너에서는 외부 바인딩이 필요하다
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',   // face/expression-protocol.mjs — octet-stream 이면 모듈 로드가 통째로 죽는다

  '.css': 'text/css; charset=utf-8',   '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',             '.png': 'image/png',
  '.jpg': 'image/jpeg',                '.pdf': 'application/pdf',
  '.mp3': 'audio/mpeg',                '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',                 '.woff2': 'font/woff2',
};

// ---- 프록시 설정 — 전부 환경변수, 요청 시점에 읽는다(테스트에서 갈아끼우기 위해) ----
const API = {
  key: () => process.env.PROXY_API_KEY || process.env.OPENAI_API_KEY || '',
  chatUrl: () => process.env.PROXY_CHAT_URL || 'https://api.openai.com/v1/chat/completions',
  sttUrl: () => process.env.PROXY_STT_URL || 'https://api.openai.com/v1/audio/transcriptions',
  chatModel: () => process.env.PROXY_CHAT_MODEL || 'gpt-4o-mini',
  sttModel: () => process.env.PROXY_STT_MODEL || 'whisper-1',
  timeoutMs: () => Number(process.env.PROXY_TIMEOUT_MS) || 20000,
};
const MAX_CHAT_BYTES = 64 * 1024;        // 대화 JSON — 이보다 크면 뭔가 잘못됐다
const MAX_STT_BYTES = 8 * 1024 * 1024;   // 녹음 상한(webm/opus 약 1분)과 짝 — [CON-04] 413 행

// 어휘는 [WO-02b-2] 합의 전 잠정 — 확정되면 여기와 클라이언트가 같은 계약으로 바뀐다.
const PAL_SYSTEM = [
  '너는 "팰" — 아이의 수면 친구다. 사용자 발화에 감정으로만 반응한다.',
  '반드시 아래 키만 가진 JSON 객체 하나로만 답한다(코드펜스·설명 금지):',
  '{"emotion":"calm|happy|sleepy|curious|sad","expression":"neutral|smile|blink|yawn|surprised",',
  ' "babbleTone":"soft|bright|drowsy","sleepIntent":true|false,"caption":"선택 — 한 줄"}',
  'sleepIntent 는 아이가 잘 준비가 됐다고 판단될 때만 true.',
  'caption 을 쓸 때 주어는 팰이다(R2).',
].join('\n');

function sendJson(res, code, obj, extra) {
  res.writeHead(code, Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  }, extra));
  res.end(JSON.stringify(obj));
}

// 같은 출처만 허용([WO-02a-3] CORS 잠금). Origin 이 없는 요청(같은 출처 GET,
// curl 등 비브라우저)은 통과 — 잠그는 대상은 "다른 사이트에서 온 브라우저"다.
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const host = req.headers.host;
  return origin === `https://${host}` || origin === `http://${host}`;
}

function readBody(req, cap) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > cap) {
        req.removeAllListeners('data');
        req.removeAllListeners('end');
        reject(Object.assign(new Error('too-large'), { status: 413 }));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function upstream(url, init) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), API.timeoutMs());
  try {
    return await fetch(url, Object.assign({ signal: ctl.signal }, init));
  } catch (e) {
    // abort = 타임아웃, 그 외(연결 실패 등)도 클라이언트에게는 같은 폴백 신호다.
    throw Object.assign(new Error('upstream-timeout'), { status: 504 });
  } finally {
    clearTimeout(t);
  }
}

async function handleChat(req, res) {
  const key = API.key();
  if (!key) return sendJson(res, 503, { error: 'no-key' });
  const buf = await readBody(req, MAX_CHAT_BYTES);
  let body;
  try { body = JSON.parse(buf.toString('utf8')); } catch { return sendJson(res, 400, { error: 'bad-json' }); }
  const ok = Array.isArray(body.messages) && body.messages.length > 0 &&
    body.messages.every((m) => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant'));
  if (!ok) return sendJson(res, 400, { error: 'bad-request' });

  const r = await upstream(API.chatUrl(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: API.chatModel(),
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: PAL_SYSTEM }]
        .concat(body.messages.map((m) => ({ role: m.role, content: m.content }))),
    }),
  });
  if (!r.ok) return sendJson(res, 502, { error: 'upstream' });
  let out;
  try {
    const data = await r.json();
    out = JSON.parse(data.choices[0].message.content);
  } catch { return sendJson(res, 502, { error: 'upstream' }); }
  // 형태를 여기서 고정한다 — 상류가 무엇을 주든 [CON-04] 응답만 나간다.
  const shaped = {
    emotion: String(out.emotion || 'calm'),
    expression: String(out.expression || 'neutral'),
    babbleTone: String(out.babbleTone || 'soft'),
    sleepIntent: out.sleepIntent === true,
  };
  if (out.caption) shaped.caption = String(out.caption);
  return sendJson(res, 200, shaped);
}

async function handleStt(req, res) {
  const key = API.key();
  if (!key) return sendJson(res, 503, { error: 'no-key' });
  const buf = await readBody(req, MAX_STT_BYTES);
  if (buf.length === 0) return sendJson(res, 400, { error: 'bad-request' });
  const type = req.headers['content-type'] || 'audio/webm';

  const boundary = '----palproxy' + Math.random().toString(36).slice(2);
  const part = (s) => Buffer.from(s, 'utf8');
  const form = Buffer.concat([
    part(`--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${API.sttModel()}\r\n`),
    part(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.webm"\r\nContent-Type: ${type}\r\n\r\n`),
    buf,
    part(`\r\n--${boundary}--\r\n`),
  ]);
  const r = await upstream(API.sttUrl(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body: form,
  });
  if (!r.ok) return sendJson(res, 502, { error: 'upstream' });
  let text;
  try { text = String((await r.json()).text); } catch { return sendJson(res, 502, { error: 'upstream' }); }
  return sendJson(res, 200, { text });
}

async function handleApi(req, res, pathname) {
  if (!sameOrigin(req)) return sendJson(res, 403, { error: 'forbidden' });
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method' });
  try {
    if (pathname === '/api/chat') return await handleChat(req, res);
    if (pathname === '/api/stt') return await handleStt(req, res);
    return sendJson(res, 404, { error: 'not-found' });
  } catch (e) {
    const status = e.status || 500;
    const label = { 413: 'too-large', 504: 'upstream-timeout' }[status] || 'server';
    // e.message 는 상류 호스트명을 담을 수 있어 찍지 않는다([CON-04] 규칙 1).
    return sendJson(res, status, { error: label }, status === 413 ? { Connection: 'close' } : undefined);
  }
}

function handleStatic(req, res, pathname) {
  let file = path.join(ROOT, pathname);
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
}

function createServer() {
  return http.createServer((req, res) => {
    const pathname = decodeURIComponent(req.url.split('?')[0]);
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      const t0 = process.hrtime.bigint();
      res.on('finish', () => {
        const ms = Number(process.hrtime.bigint() - t0) / 1e6;
        console.log(`api: ${req.method} ${pathname} ${res.statusCode} ${ms.toFixed(0)}ms`);
      });
      handleApi(req, res, pathname);
      return;
    }
    handleStatic(req, res, pathname);
  });
}

if (require.main === module) {
  createServer().listen(PORT, HOST, () => console.log(`serve: ${HOST}:${PORT}  root=${ROOT}`));
}

module.exports = { createServer };
