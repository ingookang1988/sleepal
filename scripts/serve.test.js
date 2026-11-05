// scripts/serve.test.js
// [WO-02a-3] /api/* 프록시 회귀 — 상류는 로컬 목으로 대체한다(실키 불필요).
// 실행: node scripts/serve.test.js
const http = require('http');
const { createServer } = require('./serve');

let pass = 0, fail = 0;
function check(label, cond, detail) { if (cond) pass++; else { fail++; console.error(`FAIL ${label}${detail ? '  — ' + detail : ''}`); } }

function listen(srv) { return new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv.address().port))); }

async function main() {
  // 목 상류 — chat 은 제공자 응답 형태, stt 는 {text}, hang 은 무응답(타임아웃 유도)
  // chatReply 를 갈아끼워 상류가 계약 밖 값을 줄 때를 흉내낸다 · lastStt/lastChat 은 상류가 받은 본문
  let chatReply = { emotion: 'sleepy', expression: 'yawn', babbleTone: 'drowsy', sleepIntent: true, caption: '팰은 이제 졸려' };
  let lastStt = null, lastChat = null;
  const mock = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      if (req.url === '/chat') {
        lastChat = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(chatReply) } }] }));
      } else if (req.url === '/stt') {
        lastStt = Buffer.concat(chunks).toString('latin1');
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

  // [CON-04] v0.2 — 시스템 프롬프트: 표정 어휘가 얼굴([CON-01b]) 것이고, 사용자를 아동으로 두지 않는다
  const sys = lastChat.messages[0];
  check('system 프롬프트가 맨 앞', sys.role === 'system' && lastChat.messages[1].content === '졸려');
  check('프롬프트 표정 어휘 = happy|curious|sad|thinking|yawn', /"expression":"happy\|curious\|sad\|thinking\|yawn"/.test(sys.content));
  check('프롬프트에 "아이" 없음(아동 타깃 스코프 밖)', !/아이/.test(sys.content));
  check('프롬프트에 양 세기 · sleepIntent 기준', /양 세기/.test(sys.content) && /나 이제 잘게/.test(sys.content));

  // 상류가 계약 밖 값을 주면 기본값으로 접힌다(얼굴이 모르는 kind 가 나가지 않는다)
  chatReply = { emotion: 'angry', expression: 'smile', babbleTone: 'loud', sleepIntent: 'yes', caption: 3 };
  r = await fetch(`${base}/api/chat`, { method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: 'x' }] }) });
  const folded = await r.json();
  check('계약 밖 값 → 기본값(calm·curious·soft·false·caption 없음)', r.status === 200 && folded.emotion === 'calm'
    && folded.expression === 'curious' && folded.babbleTone === 'soft' && folded.sleepIntent === false && !('caption' in folded), JSON.stringify(folded));
  chatReply = [1, 2];
  r = await fetch(`${base}/api/chat`, { method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: 'x' }] }) });
  check('상류 JSON 이 객체가 아니면 502', r.status === 502);

  // stt 왕복
  r = await fetch(`${base}/api/stt`, {
    method: 'POST', headers: { 'Content-Type': 'audio/webm;codecs=opus' }, body: Buffer.from([1, 2, 3]),
  });
  check('stt 200', r.status === 200);
  check('stt text', (await r.json()).text === '잘 자');
  check('stt webm → filename audio.webm · 언어 힌트 ko', /filename="audio\.webm"/.test(lastStt) && /name="language"\r\n\r\nko\r\n/.test(lastStt));
  // iOS Safari 의 MediaRecorder 는 mp4 — 확장자가 webm 이면 제공자가 형식을 잘못 판별한다
  r = await fetch(`${base}/api/stt`, { method: 'POST', headers: { 'Content-Type': 'audio/mp4' }, body: Buffer.from([1, 2, 3]) });
  check('stt mp4 → filename audio.mp4 · Content-Type audio/mp4', r.status === 200 && /filename="audio\.mp4"\r\nContent-Type: audio\/mp4\r\n/.test(lastStt));
  // 목록 밖 Content-Type 은 multipart 헤더로 새지 않는다(헤더 주입 차단)
  r = await fetch(`${base}/api/stt`, { method: 'POST', headers: { 'Content-Type': 'text/x-evil; a=b' }, body: Buffer.from([1, 2, 3]) });
  check('stt 목록 밖 형식 → audio/webm 으로 접음', r.status === 200 && !/x-evil/.test(lastStt) && /Content-Type: audio\/webm\r\n/.test(lastStt));
  process.env.PROXY_STT_LANG = '';
  await fetch(`${base}/api/stt`, { method: 'POST', headers: { 'Content-Type': 'audio/webm' }, body: Buffer.from([1]) });
  check('PROXY_STT_LANG="" → 언어 필드 생략', !/name="language"/.test(lastStt));
  delete process.env.PROXY_STT_LANG;

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
  // .mjs 는 ES 모듈 — text/javascript 가 아니면 브라우저가 모듈 로드를 거부해 얼굴이 통째로 안 뜬다
  // (face/expression-protocol.mjs 도입 뒤 실측: 헤드리스에서 SP 미정의 · [WO-02d-1] 게이트가 잡았다)
  r = await fetch(`${base}/app/face/expression-protocol.mjs`);
  check('.mjs 는 text/javascript', r.status === 200 && /^text\/javascript/.test(r.headers.get('content-type') || ''), r.headers.get('content-type'));

  if (mock.closeAllConnections) mock.closeAllConnections();
  if (srv.closeAllConnections) srv.closeAllConnections();
  mock.close(); srv.close();
  console.log(`serve.test: ${pass} pass, ${fail} fail`);
  if (fail) process.exit(1);
}

main().catch((e) => { console.error('serve.test crashed:', e.code || e.status || e.name); process.exit(1); });
