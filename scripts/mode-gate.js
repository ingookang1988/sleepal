#!/usr/bin/env node
// scripts/mode-gate.js — [WO-02d-1] 헤드리스 통합 게이트(증거 재현용). 레포 의존성이 아닌 Playwright 가 필요하다.
//   준비: npx playwright install chromium  (또는 전역 playwright)  ·  실행: node scripts/serve.js & node scripts/mode-gate.js
//   실제 app/index.html 을 띄우고 SP._modeFeed(가상 시계)로 모드 전이 → 눈 상태 유도·R4·히스테리시스·센서 부재·R3 를 본다.
//   CI 체인(`scripts/*.test.js`)에는 들어가지 않는다 — 5분 전이의 순수 로직은 scripts/mode-core.test.js 가 CI 에서 본다.
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 591 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('http://127.0.0.1:5173/app/?dev=1&nightS=1', { waitUntil: 'networkidle' });
  await page.click('#bStart');
  await page.waitForTimeout(600);
  const R = [];
  const ok = (name, cond, detail) => R.push((cond ? 'PASS ' : 'FAIL ') + name + (detail ? '  — ' + detail : ''));
  const st = () => page.evaluate(() => ({ mode: SP.MODE.mode, cause: SP.MODE.cause, eye: SP.F.state, ear: SP.earOn, prog: SP.MODE.progress, conn: SP.connected }));
  let s = await st();
  ok('시작 → PLAY · 눈 AWAKE · 보드 미연결', s.mode === 'PLAY' && s.eye === 'AWAKE' && s.conn === false, JSON.stringify(s));
  // 가상 시계: t 초. 어둠 61초 → WIND_DOWN/DROWSY
  const feed = (from, n, lux, snd) => page.evaluate(([f, n, l, s]) => { for (let i = 0; i < n; i++) SP._modeFeed(f + i, l, s); }, [from, n, lux, snd]);
  await feed(1000, 60, 3, 0.01); s = await st();
  ok('어둠 59초: 아직 PLAY · 후보 WIND_DOWN 진행 중', s.mode === 'PLAY' && s.prog && s.prog.to === 'WIND_DOWN', JSON.stringify(s.prog));
  await feed(1060, 1, 3, 0.01); s = await st();
  ok('어둠 60초 → WIND_DOWN · 눈 DROWSY (lux1m)', s.mode === 'WIND_DOWN' && s.eye === 'DROWSY' && s.cause === 'lux1m', JSON.stringify(s));
  // 어둡고 조용 300초 → SLEEP/ASLEEP
  await feed(1061, 301, 3, 0.01); s = await st();
  ok('어둡고 조용 5분 → SLEEP · 눈 ASLEEP (lux+quiet5m)', s.mode === 'SLEEP' && s.eye === 'ASLEEP' && s.cause === 'lux+quiet5m', JSON.stringify(s));
  const bgAsleep = await page.evaluate(() => document.body.style.backgroundColor);
  ok('ASLEEP 배경 = 잠듦 팔레트(#05070A)', bgAsleep === 'rgb(5, 7, 10)', bgAsleep);
  ok('SLEEP 에서 귀(마이크) OFF [ADR-121]', s.ear === false, 'earOn=' + s.ear);
  // 잠듦 깊어짐 → NIGHT (R4)
  // nightS=1 — 1초 뒤 "잠듦이 깊어져" NIGHT. (body 배경은 CSS 2.5s 전환이라 inline 값으로 본다)
  await page.waitForTimeout(1300); await page.evaluate(() => SP._step(5000)); s = await st();
  const night = await page.evaluate(() => ({ bg: document.body.style.backgroundColor, dim: document.getElementById('dim').style.opacity, X: SP.F.X, hud: document.getElementById('hud').classList.contains('on'), eyeOp: document.getElementById('eyeL').style.opacity }));
  ok('nightS 경과 → 눈 NIGHT · 배경 검정 · 눈 숨김 · 표정 계산 정지 · HUD 꺼짐 (R4)', s.eye === 'NIGHT' && night.bg === 'rgb(0, 0, 0)' && night.eyeOp === '0' && night.X === null && !night.hud, JSON.stringify(night));
  // SLEEP 을 떠나면 밤 타이머는 취소된다 — 명령으로 WIND_DOWN 갔다가 다시 SLEEP 해도 1초 안에는 ASLEEP
  await page.evaluate(() => { SP.modeCommand('windDown'); SP.modeCommand('sleep'); }); await page.waitForTimeout(300); s = await st();
  ok('SLEEP 재진입 직후는 ASLEEP(밤 타이머 재시작)', s.eye === 'ASLEEP', s.eye);
  await page.waitForTimeout(1200); s = await st();
  ok('재진입 1초 뒤 다시 NIGHT', s.eye === 'NIGHT', s.eye);
  // 밤에도 모드는 센다: 밝고 소리 300초 → WAKE/MORNING
  await feed(1400, 301, 600, 0.3); s = await st();
  ok('밝고 소리 5분 → WAKE · 눈 MORNING (lux+noise5m)', s.mode === 'WAKE' && s.eye === 'MORNING' && s.cause === 'lux+noise5m', JSON.stringify(s));
  await feed(1701, 600, 600, 0.3); s = await st();
  ok('WAKE 는 저절로 PLAY 로 가지 않는다', s.mode === 'WAKE', s.mode);
  await page.evaluate(() => SP.modeCommand('play')); s = await st();
  ok('명령 play → PLAY · 눈 AWAKE (command)', s.mode === 'PLAY' && s.eye === 'AWAKE' && s.cause === 'command', JSON.stringify(s));
  // 히스테리시스 리셋
  await feed(3000, 50, 3, 0.01); await feed(3050, 1, 600, 0.01); await feed(3051, 59, 3, 0.01); s = await st();
  ok('어둠 50초 + 밝음 1초 + 어둠 59초 → 리셋돼 아직 PLAY', s.mode === 'PLAY', JSON.stringify(s.prog));
  // 센서 부재
  await page.evaluate(() => SP.modeCommand('windDown')); await feed(4000, 600, null, 0.01); s = await st();
  ok('lux null 10분: 전이 없음(추측 금지)', s.mode === 'WIND_DOWN', s.mode);
  await feed(4600, 301, 3, null); s = await st();
  ok('snd null + 어둠 5분: 조도 단독으로 SLEEP', s.mode === 'SLEEP' && s.eye === 'ASLEEP', JSON.stringify(s));
  // R3 — 얼굴 문자 0
  const faceTxt = await page.evaluate(() => document.getElementById('faceScreen').textContent.trim());
  ok('R3 얼굴 문자 0', faceTxt.length === 0, 'len=' + faceTxt.length);
  // 키 경로
  await page.keyboard.press('r'); s = await st();
  ok('키 r → WAKE', s.mode === 'WAKE' && s.eye === 'MORNING', s.mode);
  const benign = errors.filter(e => !/getUserMedia|Permission|fullscreen|Fullscreen|wakeLock|orientation|NotFound|NotAllowed|Requested device not found|camera|카메라|마이크/i.test(e));
  ok('페이지 오류 0(권한·전체화면 제외)', benign.length === 0, benign.join(' | '));
  console.log(R.join('\n'));
  console.log('\n' + R.filter(r => r.startsWith('FAIL')).length + ' FAIL / ' + R.length);
  await browser.close();
  process.exit(R.some(r => r.startsWith('FAIL')) ? 1 : 0);
})().catch(e => { console.error('gate error:', e); process.exit(2); });
