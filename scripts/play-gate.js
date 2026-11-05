#!/usr/bin/env node
// scripts/play-gate.js — [WO-02b-1] 놀이 왕복 헤드리스 통합 게이트(증거 재현용). Playwright 가 필요하다(레포 의존성 아님).
//   실행: node scripts/play-gate.js   — serve.js 를 **프로세스 안에서** 띄우고 상류(STT·LLM)는 로컬 목으로 대체한다(실키 불필요).
//   Chromium 가짜 마이크(--use-fake-device-for-media-stream)로 실제 MediaRecorder → /api/stt → /api/chat → 얼굴까지 태운다.
//   보는 것: 왕복·표정 순서 · 대화 문맥 · sleepIntent → 하품 → SLEEP · R4 차단(누름·진행 중 응답) · R8 폴백 5경로
//   (키 없음·서버 504·클라이언트 타임아웃·오프라인·빈 STT) · 귀 스트림 빌리기(getUserMedia 동시 열기 0) · 짧은 누름 버림 · R3.
//   CI 체인(`scripts/*.test.js`)에는 들어가지 않는다 — 순수 로직은 scripts/play-core.test.js 가 CI 에서 본다.
'use strict';
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

process.chdir(path.join(__dirname, '..'));          // serve.js 의 ROOT = cwd → /app/ 경로
const { createServer } = require('./serve');

const listen = (srv) => new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv.address().port)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // ── 목 상류 — 다음 응답을 갈아끼운다. hits 는 상류가 받은 요청 기록 ──
  const M = { chat: { emotion: 'happy', expression: 'happy', babbleTone: 'bright', sleepIntent: false },
              stt: '양 한 마리', delayMs: 0, hits: [] };
  const mock = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      const body = Buffer.concat(chunks);
      M.hits.push({ url: req.url, body: req.url === '/chat' ? JSON.parse(body.toString('utf8')) : null, bytes: body.length,
                    head: req.url === '/stt' ? body.toString('latin1').slice(0, 600) : '' });
      if (M.chat === 'hang' && req.url === '/chat') return;               // 응답하지 않는다
      if (M.delayMs) await sleep(M.delayMs);
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/stt') res.end(JSON.stringify({ text: M.stt }));
      else res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(M.chat) } }] }));
    });
  });
  const mockPort = await listen(mock);
  process.env.PROXY_API_KEY = 'gate-key';
  process.env.PROXY_CHAT_URL = `http://127.0.0.1:${mockPort}/chat`;
  process.env.PROXY_STT_URL = `http://127.0.0.1:${mockPort}/stt`;
  const srv = createServer();
  const port = await listen(srv);
  const origLog = console.log; console.log = () => {};                 // serve.js 의 api: 로그 숨김

  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 591 }, hasTouch: true });
  await ctx.grantPermissions(['microphone', 'camera'], { origin: `http://127.0.0.1:${port}` });
  // getUserMedia 호출 수와 직접 연 스트림을 센다 — "동시에 열지 않는다"·"쓰고 반납"의 관측점
  await ctx.addInitScript(() => {
    window.__gum = { n: 0, audio: [] };
    const md = navigator.mediaDevices, orig = md.getUserMedia.bind(md);
    md.getUserMedia = async (c) => { const s = await orig(c); if (c && c.audio && !c.video) { window.__gum.n++; window.__gum.audio.push(s); } return s; };
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(`http://127.0.0.1:${port}/app/?yawnLeadMs=300&playTimeoutMs=1500`, { waitUntil: 'networkidle' });
  await page.click('#bStart');
  await page.waitForTimeout(800);
  await page.evaluate(() => { window.__trig = []; SP.palBus.addEventListener('expr:trigger', (e) => window.__trig.push(e.detail)); });

  const R = [];
  const ok = (name, cond, detail) => R.push((cond ? 'PASS ' : 'FAIL ') + name + (detail ? '  — ' + detail : ''));
  const st = () => page.evaluate(() => ({ phase: SP.PLAY.phase, mic: SP.PLAY.mic, turns: SP.PLAY.turns, fb: SP.PLAY.fallbacks,
    last: SP.PLAY.last, lat: SP.PLAY.lat, hist: SP.PLAY.history.length, mode: SP.MODE.mode, eye: SP.F.state, ear: SP.earOn,
    gum: window.__gum.n, trig: window.__trig.map((t) => t.kind + ':' + t.source) }));
  const clearTrig = () => page.evaluate(() => { window.__trig = []; });
  const hold = async (ms) => { await page.keyboard.down('Space'); await page.waitForTimeout(ms); await page.keyboard.up('Space'); };
  const settle = async (pred, ms = 4000) => { const t0 = Date.now(); let s; do { s = await st(); if (pred(s)) return s; await sleep(50); } while (Date.now() - t0 < ms); return s; };
  const sttHits = () => M.hits.filter((h) => h.url === '/stt').length;
  const touch = (type, n) => page.evaluate(([type, n]) => {
    const el = document.getElementById('faceScreen');
    const ts = Array.from({ length: n }, (_, i) => new Touch({ identifier: i, target: el, clientX: 100 + i * 60, clientY: 120 }));
    el.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : ts, changedTouches: ts, bubbles: true, cancelable: true }));
  }, [type, n]);

  // ── A. PLAY · 스페이스 → 왕복 1회 ──
  let s0 = await st();
  ok('준비: PLAY · AWAKE · 놀이 idle', s0.mode === 'PLAY' && s0.eye === 'AWAKE' && s0.phase === 'idle', JSON.stringify(s0));
  await clearTrig();
  await hold(900);
  let s = await settle((x) => x.turns === 1);
  const sttA = M.hits.find((h) => h.url === '/stt');
  ok('왕복 1회 성립 — STT·chat 상류 도달', s.turns === 1 && sttA && sttA.bytes > 100 && M.hits.some((h) => h.url === '/chat'), JSON.stringify({ turns: s.turns, bytes: sttA && sttA.bytes }));
  ok('녹음 형식이 STT 로 간다(webm → audio.webm)', sttA && /filename="audio\.webm"/.test(sttA.head) && /Content-Type: audio\/webm/.test(sttA.head));
  ok('표정 순서: 귀 기울임(curious) → 곰곰이(thinking) → 반응(happy) · 전부 source play', s.trig.join(',') === 'curious:play,thinking:play,happy:play', s.trig.join(','));
  ok('PLAY 에서는 마이크를 직접 연다(own) · getUserMedia 1회', s.mic === 'own' && s.gum - s0.gum === 1, 'gum Δ' + (s.gum - s0.gum));
  const ended = await page.evaluate(() => window.__gum.audio[window.__gum.audio.length - 1].getTracks().every((t) => t.readyState === 'ended'));
  ok('녹음이 끝나면 마이크 반납(트랙 ended)', ended);
  ok('지연 실측값이 남는다(stt·chat·총)', s.lat && s.lat.total >= s.lat.stt && Number.isFinite(s.lat.chat), JSON.stringify(s.lat));
  ok('사용자 발화가 chat 의 마지막 user 메시지', M.hits.filter((h) => h.url === '/chat').pop().body.messages.slice(-1)[0].content === '양 한 마리');

  // ── B. 대화 문맥 — 둘째 왕복은 앞 왕복을 안다(양 세기 "몇 마리째") ──
  M.stt = '양 두 마리'; M.chat = { emotion: 'sleepy', expression: 'yawn', babbleTone: 'drowsy', sleepIntent: false };
  await hold(900); s = await settle((x) => x.turns === 2);
  const msgs = M.hits.filter((h) => h.url === '/chat').pop().body.messages.filter((m) => m.role !== 'system');   // system 은 프록시가 붙인다
  ok('둘째 왕복: 문맥 user·assistant·user · 앞 반응은 JSON 문자열', msgs.length === 3 && msgs[0].content === '양 한 마리' && JSON.parse(msgs[1].content).expression === 'happy' && msgs[2].content === '양 두 마리', JSON.stringify(msgs));
  ok('sleepIntent 아님 → 하품만, 모드는 그대로 PLAY', s.trig.slice(-1)[0] === 'yawn:play' && s.mode === 'PLAY', s.mode);

  // ── K. 짧은 누름은 버린다 ──
  let n0 = sttHits(); await hold(120); await sleep(400); s = await st();
  ok('짧은 누름(120ms) → 버림 · 상류 요청 0', sttHits() === n0 && s.phase === 'idle' && s.turns === 2);

  // ── N. 한 손가락 길게(터치) → 왕복 · 손가락이 하나 더 닿으면 취소 ──
  M.stt = '양 세 마리'; M.chat = { emotion: 'happy', expression: 'curious', babbleTone: 'soft', sleepIntent: false };
  await touch('touchstart', 1); await page.waitForTimeout(1000); await touch('touchend', 1);
  s = await settle((x) => x.turns === 3);
  ok('한 손가락 길게 누름(0.5초 대기 + 0.5초 녹음) → 왕복', s.turns === 3 && s.last.expression === 'curious', JSON.stringify(s.last));
  n0 = sttHits();
  await touch('touchstart', 1); await page.waitForTimeout(200); await touch('touchstart', 2); await page.waitForTimeout(800); await touch('touchend', 2);
  await sleep(400); s = await st();
  ok('누르는 중 두 번째 손가락 → 취소(상류 요청 0)', sttHits() === n0 && s.phase === 'idle', s.phase);
  // 두 손가락 탭은 main.js 의 수동 상태 전환이다 — 되돌려 놓는다
  await page.evaluate(() => SP.setEyeState('AWAKE'));
  await touch('touchstart', 1); await page.waitForTimeout(250); await touch('touchend', 1); await sleep(300); s = await st();
  ok('한 손가락 짧은 탭(0.25초) → 녹음 시작 안 함', sttHits() === n0 && s.phase === 'idle' && s.gum === (await st()).gum);

  // ── R8. 폴백 5경로 — 사용자에게 오류를 보이지 않는다 ──
  const fb = async (label, setup, teardown, why) => {
    await setup(); const before = (await st()).fb; await clearTrig();
    await hold(700); const x = await settle((y) => y.fb === before + 1, 5000);
    await teardown();
    const kind = x.last && x.last.expression;
    ok('폴백 — ' + label + ' → 사전 반응(' + why + ')', x.fb === before + 1 && x.last.fallback && x.last.why === why &&
       ['happy', 'curious', 'thinking'].includes(kind) && x.trig.slice(-1)[0] === kind + ':play' && x.phase === 'idle', JSON.stringify(x.last));
  };
  await fb('키 미설정', async () => { delete process.env.PROXY_API_KEY; }, async () => { process.env.PROXY_API_KEY = 'gate-key'; }, '503');
  await fb('서버 상류 타임아웃', async () => { process.env.PROXY_TIMEOUT_MS = '200'; M.chat = 'hang'; }, async () => { delete process.env.PROXY_TIMEOUT_MS; }, '504');
  await fb('클라이언트 타임아웃(1.5초)', async () => { process.env.PROXY_TIMEOUT_MS = '10000'; M.chat = 'hang'; }, async () => { delete process.env.PROXY_TIMEOUT_MS; }, 'timeout');
  M.chat = { emotion: 'happy', expression: 'happy', babbleTone: 'bright', sleepIntent: false };
  await fb('오프라인(비행기 모드)', async () => { await ctx.setOffline(true); }, async () => { await ctx.setOffline(false); }, 'offline');
  await fb('STT 빈 문장', async () => { M.stt = '  '; }, async () => { M.stt = '양 네 마리'; }, 'empty');
  const faceTxt = await page.evaluate(() => document.getElementById('faceScreen').textContent.trim());
  ok('R3 — 폴백 뒤에도 얼굴 문자 0', faceTxt.length === 0, 'len=' + faceTxt.length);

  // ── J. WIND_DOWN — 귀 스트림을 빌린다(getUserMedia 동시 열기 0) ──
  await page.evaluate(() => SP.modeCommand('windDown'));
  s = await settle((x) => x.ear === true, 3000);
  ok('WIND_DOWN → 귀 ON', s.ear === true && s.mode === 'WIND_DOWN', JSON.stringify({ ear: s.ear, mode: s.mode }));
  const gumW = s.gum, turnsW = s.turns;
  M.stt = '양 다섯 마리'; M.chat = { emotion: 'sleepy', expression: 'happy', babbleTone: 'drowsy', sleepIntent: false };
  await hold(900); s = await settle((x) => x.turns === turnsW + 1);
  ok('WIND_DOWN 녹음은 귀 스트림을 빌린다(borrow · getUserMedia 0회)', s.mic === 'borrow' && s.gum === gumW && s.turns === turnsW + 1, JSON.stringify({ mic: s.mic, gumΔ: s.gum - gumW }));
  ok('빌린 스트림은 돌려준다 — 녹음 뒤에도 귀 ON', s.ear === true);

  // ── C. sleepIntent → 하품 → SLEEP (팰이 먼저 잠든다) ──
  await page.evaluate(() => SP.modeCommand('play')); await sleep(100);
  M.stt = '나 이제 잘게'; M.chat = { emotion: 'sleepy', expression: 'happy', babbleTone: 'drowsy', sleepIntent: true };
  await clearTrig(); const tC = (await st()).turns;
  await hold(900); s = await settle((x) => x.turns === tC + 1);
  ok('"나 이제 잘게" → sleepIntent=true · 표정은 하품', s.last.sleepIntent === true && s.trig.slice(-1)[0] === 'yawn:play' && s.mode === 'PLAY', JSON.stringify(s.last) + ' ' + s.mode);
  s = await settle((x) => x.mode === 'SLEEP', 2000);
  ok('하품 뒤(yawnLeadMs) 모드 명령으로 SLEEP · 눈 ASLEEP · 문맥 비움', s.mode === 'SLEEP' && s.eye === 'ASLEEP' && s.hist === 0, JSON.stringify({ mode: s.mode, eye: s.eye, hist: s.hist }));
  const cause = await page.evaluate(() => SP.MODE.cause);
  ok('전이 원인은 command([CON-02] 규칙 1 — 모드는 mode.js 만 발행)', cause === 'command', cause);

  // ── D. R4 — SLEEP 에서는 누름을 받지 않는다 ──
  await sleep(600);                                   // SLEEP 진입의 T 수음(mode.js)이 비동기로 마이크를 연다 — 그 뒤부터 센다
  const gumS = (await st()).gum; n0 = sttHits(); await clearTrig();
  await hold(900); await touch('touchstart', 1); await page.waitForTimeout(1000); await touch('touchend', 1); await sleep(400); s = await st();
  ok('SLEEP: 스페이스·길게 누름 → 녹음 0 · 마이크 0 · 상류 0 · 표정 0 (R4)', s.phase === 'idle' && s.gum === gumS && sttHits() === n0 && s.trig.length === 0,
     JSON.stringify({ phase: s.phase, gumΔ: s.gum - gumS, trig: s.trig }));
  await page.evaluate(() => SP._nightNow()); s = await st();
  await hold(900); await sleep(300); s = await st();
  ok('NIGHT: 스페이스 → 아무 일 없음 (R4)', s.eye === 'NIGHT' && s.phase === 'idle' && sttHits() === n0, s.eye);

  // ── L. 녹음 중 모드가 바뀌면 버린다 ──
  await page.evaluate(() => SP.modeCommand('play')); await sleep(100); n0 = sttHits();
  await page.keyboard.down('Space'); await page.waitForTimeout(600);
  const recPhase = (await st()).phase;
  // 놀이가 연 스트림의 번호 — SLEEP 진입 뒤에는 mode.js 의 T 수음이 새 스트림을 열므로 "마지막"이 아니다
  const recIdx = await page.evaluate(() => window.__gum.audio.length - 1);
  await page.evaluate(() => SP.modeCommand('sleep')); await page.waitForTimeout(100); await page.keyboard.up('Space'); await sleep(400); s = await st();
  ok('녹음 중 SLEEP → 녹음 버림 · 상류 요청 0 · 마이크 반납', recPhase === 'rec' && s.phase === 'idle' && sttHits() === n0 &&
     await page.evaluate((i) => window.__gum.audio[i].getTracks().every((t) => t.readyState === 'ended'), recIdx), recPhase + '→' + s.phase);

  // ── M. 응답 대기 중 SLEEP → 늦게 온 응답을 버린다(밤에 표정이 켜지지 않는다) ──
  await page.evaluate(() => SP.modeCommand('play')); await sleep(100);
  M.delayMs = 700; M.chat = { emotion: 'happy', expression: 'happy', babbleTone: 'bright', sleepIntent: false };
  const tM = (await st()).turns;
  await hold(800); await settle((x) => x.phase === 'send', 2000);
  await clearTrig(); await page.evaluate(() => SP.modeCommand('sleep'));
  await sleep(2500); M.delayMs = 0; s = await st();
  ok('응답 대기 중 SLEEP → 응답 버림 · 표정 0 · 왕복 수 그대로', s.turns === tM && s.trig.length === 0 && s.phase === 'idle', JSON.stringify({ turns: s.turns - tM, trig: s.trig }));

  const benign = errors.filter((e) => !/fullscreen|Fullscreen|wakeLock|orientation|net::ERR_INTERNET_DISCONNECTED|Failed to load resource/i.test(e));
  ok('페이지 오류 0(전체화면·오프라인 리소스 제외)', benign.length === 0, benign.join(' | '));

  console.log = origLog;
  console.log(R.join('\n'));
  console.log('\n' + R.filter((r) => r.startsWith('FAIL')).length + ' FAIL / ' + R.length);
  await browser.close();
  if (srv.closeAllConnections) srv.closeAllConnections();
  if (mock.closeAllConnections) mock.closeAllConnections();
  srv.close(); mock.close();
  process.exit(R.some((r) => r.startsWith('FAIL')) ? 1 : 0);
})().catch((e) => { console.error('gate error:', e); process.exit(2); });
