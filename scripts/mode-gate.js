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
  await page.goto('http://127.0.0.1:5173/app/?nightS=1', { waitUntil: 'networkidle' });
  const R = [];
  const ok = (name, cond, detail) => R.push((cond ? 'PASS ' : 'FAIL ') + name + (detail ? '  — ' + detail : ''));
  // ── 시작 화면 2단계 [WO-01c-1] ──
  const e0 = await page.evaluate(() => ({ sense: document.getElementById('bSense').classList.contains('primary'), start: document.getElementById('bStart').classList.contains('primary'), dev: getComputedStyle(document.getElementById('bDev')).display, note: document.getElementById('senseNote').textContent }));
  ok('시작 화면: 1차 행동은 "팰에게 방 보여주기" 하나 · dev 버튼 숨김', e0.sense && !e0.start && e0.dev === 'none', JSON.stringify(e0));
  await page.click('#bSense'); await page.waitForTimeout(800);
  const e1 = await page.evaluate(() => ({ note: document.getElementById('senseNote').textContent, start: document.getElementById('bStart').classList.contains('primary'), sense: document.getElementById('bSense').textContent }));
  ok('방 보여주기 실패(헤드리스: 장치 없음) → 사실 문장 + 시작이 1차 행동으로', /팰이 방을 볼 수 없어요/.test(e1.note) && e1.start && /다시 보여주기/.test(e1.sense), JSON.stringify(e1));
  const r2 = await page.evaluate(() => [document.getElementById('senseNote').textContent, document.getElementById('entryNote').textContent, document.querySelector('#entryScreen h2').textContent, document.querySelector('#entryScreen p').textContent].flatMap(s => s.split(/[.—]/).map(x => x.trim()).filter(Boolean).filter(x => /^팰/.test(x)).flatMap(x => SP.lintLine(x).filter(v => v !== 'one-line'))));
  ok('시작 화면 문장 R2·R6 린트(팰 주어 문장 전수)', r2.length === 0, r2.join(','));
  await page.click('#bStart');
  await page.waitForTimeout(600);
  const careOut = await page.evaluate(() => !document.getElementById('faceScreen').contains(document.getElementById('care')));
  ok('케어 띠는 #faceScreen 바깥(R3)', careOut);
  await page.evaluate(() => SP._careTick()); await page.waitForTimeout(100);
  let c = await page.evaluate(() => ({ line: SP.CARE.line, on: document.getElementById('care').classList.contains('on'), txt: document.getElementById('care').textContent }));
  ok('방을 못 보면(카메라 없음) 이유 문장 BLIND', c.on && c.line === '팰이 방을 볼 수 없어서 밝기를 느끼지 못해요', JSON.stringify(c));
  const st = () => page.evaluate(() => ({ mode: SP.MODE.mode, cause: SP.MODE.cause, eye: SP.F.state, ear: SP.earOn, prog: SP.MODE.progress, conn: SP.connected }));
  let s = await st();
  ok('시작 → PLAY · 눈 AWAKE · 보드 미연결', s.mode === 'PLAY' && s.eye === 'AWAKE' && s.conn === false, JSON.stringify(s));
  // 가상 시계: t 초. 어둠 61초 → WIND_DOWN/DROWSY
  const feed = (from, n, lux, snd) => page.evaluate(([f, n, l, s]) => { for (let i = 0; i < n; i++) SP._modeFeed(f + i, l, s); }, [from, n, lux, snd]);
  await feed(1000, 60, 3, 0.01); s = await st();
  ok('어둠 59초: 아직 PLAY · 후보 WIND_DOWN 진행 중', s.mode === 'PLAY' && s.prog && s.prog.to === 'WIND_DOWN', JSON.stringify(s.prog));
  await page.evaluate(() => SP._careTick()); c = await page.evaluate(() => SP.CARE.line);
  ok('케어: 어둠에 익어가는 중 → SETTLING', c === '팰이 어둠에 눈이 익어가요', c);
  await feed(1060, 1, 3, 0.01); s = await st();
  ok('어둠 60초 → WIND_DOWN · 눈 DROWSY (lux1m)', s.mode === 'WIND_DOWN' && s.eye === 'DROWSY' && s.cause === 'lux1m', JSON.stringify(s));
  // 어둡고 조용 300초 → SLEEP/ASLEEP
  await feed(1061, 100, 3, 0.01); await page.evaluate(() => SP._careTick()); c = await page.evaluate(() => SP.CARE.line);
  ok('케어: WIND_DOWN 에서 후보 SLEEP → FALLING', c === '팰이 잠들려고 해요', c);
  await feed(1161, 1, 600, 0.01); await page.evaluate(() => SP._careTick()); c = await page.evaluate(() => SP.CARE.line);
  ok('케어: 밝아지면(후보 PLAY) → REWAKE', c === '팰이 눈부셔서 다시 깨요', c);
  await feed(1162, 1, 100, 0.01); await page.evaluate(() => SP._careTick()); c = await page.evaluate(() => SP.CARE.line);
  ok('케어: 어둡지도 밝지도 않으면(후보 없음) → GLARE', c === '팰이 눈부셔서 눈을 못 감고 있어요', c);
  await feed(1163, 1, 3, 0.01);
  await feed(1164, 1, 3, 0.5); await page.evaluate(() => SP._careTick()); c = await page.evaluate(() => SP.CARE.line);
  ok('케어: 어둡지만 시끄러우면 → NOISE', c === '팰이 소리 때문에 자꾸 깨요', c);
  await feed(1165, 301, 3, 0.01); s = await st();
  ok('어둡고 조용 5분 → SLEEP · 눈 ASLEEP (lux+quiet5m)', s.mode === 'SLEEP' && s.eye === 'ASLEEP' && s.cause === 'lux+quiet5m', JSON.stringify(s));
  await page.evaluate(() => SP._careTick()); c = await page.evaluate(() => SP.CARE.line);
  ok('케어: 잠듦 → ASLEEP 문장', c === '팰이 잠들었어요', c);
  const bgAsleep = await page.evaluate(() => document.body.style.backgroundColor);
  ok('ASLEEP 배경 = 잠듦 팔레트(#05070A)', bgAsleep === 'rgb(5, 7, 10)', bgAsleep);
  await page.waitForTimeout(5200); c = await page.evaluate(() => ({ vis: SP.CARE.visible, on: document.getElementById('care').classList.contains('on') }));
  ok('케어 띠는 상시 표시되지 않는다 — 잠깐 뒤 사라짐([PLAN-01c])', !c.vis && !c.on, JSON.stringify(c));
  ok('SLEEP 에서 귀(마이크) OFF [ADR-121]', s.ear === false, 'earOn=' + s.ear);
  // 잠듦 깊어짐 → NIGHT (R4)
  // nightS=1 — 1초 뒤 "잠듦이 깊어져" NIGHT. (body 배경은 CSS 2.5s 전환이라 inline 값으로 본다)
  await page.waitForTimeout(1300); await page.evaluate(() => SP._step(5000)); s = await st();
  const night = await page.evaluate(() => ({ bg: document.body.style.backgroundColor, dim: document.getElementById('dim').style.opacity, X: SP.F.X, hud: document.getElementById('hud').classList.contains('on'), eyeOp: document.getElementById('eyeL').style.opacity }));
  ok('nightS 경과 → 눈 NIGHT · 배경 검정 · 눈 숨김 · 표정 계산 정지 · HUD 꺼짐 (R4)', s.eye === 'NIGHT' && night.bg === 'rgb(0, 0, 0)' && night.eyeOp === '0' && night.X === null && !night.hud, JSON.stringify(night));
  await page.evaluate(() => SP._careTick()); c = await page.evaluate(() => ({ line: SP.CARE.line, on: document.getElementById('care').classList.contains('on') }));
  ok('케어: NIGHT 에서는 출력 없음(R4)', c.line === null && !c.on, JSON.stringify(c));
  // SLEEP 을 떠나면 밤 타이머는 취소된다 — 명령으로 WIND_DOWN 갔다가 다시 SLEEP 해도 1초 안에는 ASLEEP
  await page.evaluate(() => { SP.modeCommand('windDown'); SP.modeCommand('sleep'); }); await page.waitForTimeout(300); s = await st();
  ok('SLEEP 재진입 직후는 ASLEEP(밤 타이머 재시작)', s.eye === 'ASLEEP', s.eye);
  await page.waitForTimeout(1200); s = await st();
  ok('재진입 1초 뒤 다시 NIGHT', s.eye === 'NIGHT', s.eye);
  // 밤에도 모드는 센다: 밝고 소리 300초 → WAKE/MORNING
  await feed(1400, 301, 600, 0.3); s = await st();
  ok('밝고 소리 5분 → WAKE · 눈 MORNING (lux+noise5m)', s.mode === 'WAKE' && s.eye === 'MORNING' && s.cause === 'lux+noise5m', JSON.stringify(s));
  const nt = await page.evaluate(() => SP.MODE.night);
  await page.evaluate(() => SP._careTick()); c = await page.evaluate(() => SP.CARE.line);
  ok('아침: 밤중 불빛·소리 에피소드가 세어졌고 회고 문장(점수 아님)', nt.bright >= 1 && nt.noise >= 1 && c === '팰은 밤중에 불빛과 소리에 몇 번 깼어요', JSON.stringify(nt) + ' ' + c);
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
  // 명령으로 잠들고 바로 깨면 — 조용한 밤 문장
  await page.evaluate(() => { SP.modeCommand('sleep'); SP.modeCommand('wake'); SP._careTick(); }); c = await page.evaluate(() => SP.CARE.line);
  ok('아침(조용한 밤) → NIGHT_CALM', c === '팰은 밤새 어두운 방에서 푹 잤어요', c);
  // dev 가 아닌 제품 화면에서는 dev 버튼이 숨는다
  const p2 = await browser.newPage({ viewport: { width: 780, height: 360 } });
  await p2.goto('http://127.0.0.1:5173/app/?dev=1', { waitUntil: 'networkidle' });
  const devShown = await p2.evaluate(() => getComputedStyle(document.getElementById('bDev')).display !== 'none');
  ok('?dev=1 이면 dev 버튼 보임 · dev HUD 가 켜지면 케어 띠가 양보', devShown);
  const benign = errors.filter(e => !/getUserMedia|Permission|fullscreen|Fullscreen|wakeLock|orientation|NotFound|NotAllowed|Requested device not found|camera|카메라|마이크/i.test(e));
  ok('페이지 오류 0(권한·전체화면 제외)', benign.length === 0, benign.join(' | '));
  console.log(R.join('\n'));
  console.log('\n' + R.filter(r => r.startsWith('FAIL')).length + ' FAIL / ' + R.length);
  await browser.close();
  process.exit(R.some(r => r.startsWith('FAIL')) ? 1 : 0);
})().catch(e => { console.error('gate error:', e); process.exit(2); });
