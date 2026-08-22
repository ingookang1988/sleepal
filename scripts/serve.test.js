// scripts/serve.test.js
// [WO-02a-3] /api/* 프록시 회귀 — 상류는 로컬 목으로 대체한다(실키 불필요).
// 실행: node scripts/serve.test.js
const http = require('http');
const { createServer } = require('./serve');

let pass = 0, fail = 0;
function check(label, cond) { if (cond) pass++; else { fail++; console.error(`FAIL ${label}`); } }

function listen(srv) { return new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv.address().port))); }

async function main() {
  // 목 상류 — chat 은 제공자 응답 형태, stt 는 {text}, hang 은 무응답(타임아웃 유도)
  const mock = http.createServer((req, res) => {
    req.on('data', () => {});
    req.on('end', () => {
      if (req.url === '/chat') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(
          { emotion: 'sleepy', expression: 'yawn', babbleTone: 'drowsy', sleepIntent: true, caption: '팰은 이제 졸려' },
        ) } }] }));
      } else if (req.url === '/stt') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ text: '잘 자' }));
      } else if (req.url === '/hang') {
        // 응답하지 않는다 — 프록시 쪽 타임아웃이 끊어야 한다
      } else { res.writeHead(404); res.end(); }
    });
  });
  const mockPort = await listen(mock);
  const srv = createServer();
  const port = await listen(srv);
  const base = `http://127.0.0.1:${port}`;

  process.env.PROXY_API_KEY = 'test-key';
  process.env.PROXY_CHAT_URL = `http://127.0.0.1:${mockPort}/chat`;
  process.env.PROXY_STT_URL = `http://127.0.0.1:${mockPort}/stt`;

  // chat 왕복 — 응답이 [CON-04] 형태로 고정되는가
  let r = await fetch(`${base}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: '졸려' }], persona: 'pal' }),
  });
  check('chat 200', r.status === 200);
  const chat = await r.json();
  check('chat 형태([CON-04])', chat.emotion === 'sleepy' && chat.expression === 'yawn'
    && chat.babbleTone === 'drowsy' && chat.sleepIntent === true && chat.caption === '팰은 이제 졸려');

  // stt 왕복
  r = await fetch(`${base}/api/stt`, {
    method: 'POST', headers: { 'Content-Type': 'audio/webm' }, body: Buffer.from([1, 2, 3]),
  });
  check('stt 200', r.status === 200);
  check('stt text', (await r.json()).text === '잘 자');

  // 키 미설정 → 503 {error:"no-key"} — 클라이언트 폴백 판단용([CON-04])
  const savedKey = process.env.PROXY_API_KEY; delete process.env.PROXY_API_KEY;
  const savedOpenai = process.env.OPENAI_API_KEY; delete process.env.OPENAI_API_KEY;
  r = await fetch(`${base}/api/chat`, { method: 'POST', body: '{}' });
  check('키 미설정 503 no-key', r.status === 503 && (await r.json()).error === 'no-key');
  process.env.PROXY_API_KEY = savedKey;
  if (savedOpenai) process.env.OPENAI_API_KEY = savedOpenai;

  // 잘못된 본문 → 400
  r = await fetch(`${base}/api/chat`, { method: 'POST', body: 'not json' });
  check('bad-json 400', r.status === 400);
  r = await fetch(`${base}/api/chat`, { method: 'POST', body: JSON.stringify({ messages: [{ role: 'system', content: 'x' }] }) });
  check('system 역할 주입 거부 400', r.status === 400);

  // 과대 요청 → 413([CON-04])
  r = await fetch(`${base}/api/chat`, { method: 'POST', body: 'x'.repeat(70 * 1024) });
  check('과대 413', r.status === 413);

  // 교차 출처 → 403(CORS 잠금)
  r = await fetch(`${base}/api/chat`, { method: 'POST', headers: { Origin: 'https://evil.example' }, body: '{}' });
  check('교차 출처 403', r.status === 403);
  r = await fetch(`${base}/api/chat`, { method: 'POST', headers: { Origin: `http://127.0.0.1:${port}` }, body: '{}' });
  check('같은 출처는 통과(400 — 본문 문제일 뿐)', r.status === 400);

  // POST 외 메서드 → 405
  r = await fetch(`${base}/api/chat`);
  check('GET 405', r.status === 405);

  // 상류 무응답 → 504 {error:"upstream-timeout"}
  process.env.PROXY_CHAT_URL = `http://127.0.0.1:${mockPort}/hang`;
  process.env.PROXY_TIMEOUT_MS = '200';
  r = await fetch(`${base}/api/chat`, {
    method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: 'x' }] }),
  });
  check('상류 타임아웃 504', r.status === 504 && (await r.json()).error === 'upstream-timeout');
  delete process.env.PROXY_TIMEOUT_MS;

  // 정적 서빙 회귀 없음 — 프록시가 붙어도 기존 경로는 그대로다
  r = await fetch(`${base}/package.json`);
  check('정적 200', r.status === 200);
  r = await fetch(`${base}/no-such-file`);
  check('정적 404', r.status === 404);

  if (mock.closeAllConnections) mock.closeAllConnections();
  if (srv.closeAllConnections) srv.closeAllConnections();
  mock.close(); srv.close();
  console.log(`serve.test: ${pass} pass, ${fail} fail`);
  if (fail) process.exit(1);
}

main().catch((e) => { console.error('serve.test crashed:', e.code || e.status || e.name); process.exit(1); });
