'use strict';
// [WO-02d-1] 모드 상태 머신 — 가상 시계 전이 시나리오 게이트(5분을 기다리지 않는다).
// 순수 핵(app/mode-core.mjs)만 검사한다. 브라우저 배선(mode.js)·눈 유도(mode-eyes.js)는
// 헤드리스 게이트가 따로 본다([WO-02d-1] 증거).

const assert = require('node:assert/strict');
const test = require('node:test');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const coreUrl = pathToFileURL(path.join(__dirname, '..', 'app', 'mode-core.mjs')).href;

// 환경을 t=from 부터 1초 간격으로 seconds 번 먹인다(from … from+seconds-1). 전이 이벤트만 모아 돌려준다.
// 후보 타이머는 **첫 관측 시각**부터 센다 — from 에서 시작한 조건은 from+need 에 전이한다.
function run(machine, env, from, seconds) {
  const changes = [];
  for (let s = 0; s < seconds; s++) {
    for (const ev of machine.feed(Object.assign({ t: from + s }, env))) if (ev.type === 'mode:change') changes.push(ev);
  }
  return changes;
}
const DARK_QUIET = { lux: 3, snd: 0.01 };
const BRIGHT_NOISY = { lux: 600, snd: 0.3 };

test('기본: PLAY 에서 시작, 어둠 1분 지속 → WIND_DOWN(lux1m)', async () => {
  const { createModeMachine } = await import(coreUrl);
  const m = createModeMachine({ t0: 0 });
  assert.equal(m.mode, 'PLAY');
  assert.deepEqual(run(m, DARK_QUIET, 0, 60), []);           // t=0..59: 경과 59초, 아직
  const ch = run(m, DARK_QUIET, 60, 1);                         // t=60: 경과 60초, 전이
  assert.equal(ch.length, 1);
  assert.equal(ch[0].to, 'WIND_DOWN'); assert.equal(ch[0].cause, 'lux1m'); assert.equal(ch[0].from, 'PLAY');
});

test('진입: WIND_DOWN 에서 어둡고 조용함 5분 지속 → SLEEP(lux+quiet5m)', async () => {
  const { createModeMachine } = await import(coreUrl);
  const m = createModeMachine({ t0: 0 });
  m.command('windDown', 0);
  assert.deepEqual(run(m, DARK_QUIET, 0, 300), []);
  const ch = run(m, DARK_QUIET, 300, 1);
  assert.equal(ch.length, 1); assert.equal(ch[0].to, 'SLEEP'); assert.equal(ch[0].cause, 'lux+quiet5m');
});

test('리셋(히스테리시스): 5분 창 안에서 조건이 한 번 깨지면 타이머가 0 부터 다시 센다', async () => {
  const { createModeMachine } = await import(coreUrl);
  const m = createModeMachine({ t0: 0 });
  m.command('windDown', 0);
  assert.deepEqual(run(m, DARK_QUIET, 0, 241), []);             // t=0..240 — 4분 어둡고 조용
  const broke = m.feed({ t: 241, lux: 3, snd: 0.5 });           // 소리 1건 — 깨짐
  assert.equal(broke[0].type, 'mode:progress'); assert.equal(broke[0].to, null);
  assert.equal(m.candidate, null);
  assert.deepEqual(run(m, DARK_QUIET, 242, 300), []);           // t=242..541 — 경과 299초, 아직
  assert.equal(run(m, DARK_QUIET, 542, 1)[0].to, 'SLEEP');      // 경과 300초 — 전이
});

test('이탈: SLEEP 에서 밝고 소리 있음 5분 지속 → WAKE(lux+noise5m) · WAKE 는 저절로 PLAY 로 가지 않는다', async () => {
  const { createModeMachine } = await import(coreUrl);
  const m = createModeMachine({ t0: 0 });
  m.command('sleep', 0);
  assert.deepEqual(run(m, BRIGHT_NOISY, 0, 300), []);
  assert.equal(run(m, BRIGHT_NOISY, 300, 1)[0].to, 'WAKE');
  assert.deepEqual(run(m, BRIGHT_NOISY, 301, 600), []);         // 밝고 시끄러워도 WAKE 유지
  assert.equal(m.mode, 'WAKE');
});

test('명령 우선: 어떤 모드에서든 명령은 즉시 전이(cause command) · 같은 모드면 무시', async () => {
  const { createModeMachine } = await import(coreUrl);
  const m = createModeMachine({ t0: 0 });
  const a = m.command('sleep', 10);
  assert.equal(a.length, 1); assert.equal(a[0].to, 'SLEEP'); assert.equal(a[0].cause, 'command'); assert.equal(a[0].t, 10);
  assert.deepEqual(m.command('sleep', 11), []);
  assert.equal(m.command('wake', 12)[0].to, 'WAKE');
  assert.equal(m.command('play', 13)[0].to, 'PLAY');            // 새 세션은 명령으로
  assert.deepEqual(m.command('nope', 14), []);
});

test('센서 부재: lux null 이면 전이 없음(추측 금지) · snd null 이면 소리 조건은 충족(조도 단독 루프)', async () => {
  const { createModeMachine } = await import(coreUrl);
  const m = createModeMachine({ t0: 0 });
  m.command('windDown', 0);
  assert.deepEqual(run(m, { lux: null, snd: 0.0 }, 0, 600), []);
  assert.equal(m.mode, 'WIND_DOWN');
  assert.equal(run(m, { lux: 3, snd: null }, 600, 301).pop().to, 'SLEEP');
  const w = createModeMachine({ t0: 0 }); w.command('sleep', 0);
  assert.equal(run(w, { lux: 600, snd: null }, 0, 301).pop().to, 'WAKE');
});

test('복귀: WIND_DOWN 에서 다시 밝아져 1분 지속 → PLAY', async () => {
  const { createModeMachine } = await import(coreUrl);
  const m = createModeMachine({ t0: 0 });
  m.command('windDown', 0);
  assert.equal(run(m, { lux: 600, snd: 0.01 }, 0, 61).pop().to, 'PLAY');
});

test('진행 이벤트: 후보·경과·필요가 HUD 용으로 나온다 · 상수는 params 로 덮인다', async () => {
  const { createModeMachine, DEFAULTS } = await import(coreUrl);
  const m = createModeMachine({ t0: 0, params: { sleepS: 10, darkLux: 100 } });
  assert.equal(m.params.sleepS, 10); assert.equal(m.params.wakeS, DEFAULTS.wakeS);
  m.command('windDown', 0);
  const p = m.feed({ t: 4, lux: 80, snd: 0.01 });               // darkLux 100 → 80 은 어둡다
  assert.equal(p[0].type, 'mode:progress'); assert.equal(p[0].to, 'SLEEP'); assert.equal(p[0].elapsed, 0); assert.equal(p[0].need, 10);
  assert.equal(m.feed({ t: 9, lux: 80, snd: 0.01 })[0].elapsed, 5);
  assert.equal(m.feed({ t: 14, lux: 80, snd: 0.01 })[0].type, 'mode:change');
});
