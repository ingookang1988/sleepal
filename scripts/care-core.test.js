'use strict';
// [WO-01c-1] 케어 문장 — 사전 문장 전수 R2·R6 린트 + 선택 규칙. 실행: node --test scripts/care-core.test.js
const assert = require('node:assert/strict');
const test = require('node:test');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const url = pathToFileURL(path.join(__dirname, '..', 'app', 'care-core.mjs')).href;

test('사전 문장 전수: 주어 팰 · 2인칭/명령형 0 · 숫자/채점 어휘 0 · 한 줄', async () => {
  const { LINES, lintLine } = await import(url);
  const bad = Object.entries(LINES).map(([k, s]) => [k, lintLine(s)]).filter(([, v]) => v.length);
  assert.deepEqual(bad, [], JSON.stringify(bad));
  assert.ok(Object.keys(LINES).length >= 5);
});

test('린트가 실제로 문다: 2인칭 · 명령형 · 숫자 · 주어', async () => {
  const { lintLine } = await import(url);
  assert.ok(lintLine('조명이 너무 밝습니다').includes('R2:subject'));
  assert.ok(lintLine('팰이 당신을 기다려요').includes('R2:second-person'));
  assert.ok(lintLine('팰에게 방을 보여 주세요').some(v => v.startsWith('R2')));
  assert.ok(lintLine('팰이 30분 늦게 잤어요').includes('R6:number-or-score'));
  assert.ok(lintLine('팰의 수면 점수가 올랐어요').includes('R6:number-or-score'));
  assert.deepEqual(lintLine('팰이 눈부셔서 눈을 못 감고 있어요'), []);
});

test('R4: NIGHT 는 문장이 존재하되 출력은 null', async () => {
  const { LINES, careLine } = await import(url);
  assert.ok(LINES.NIGHT);
  assert.equal(careLine({ eye: 'NIGHT', mode: 'SLEEP' }), null);
  assert.equal(careLine({ eye: 'NIGHT', mode: 'WAKE', night: { bright: 3, noise: 0 } }), null);
});

test('선택 규칙: 상태 5종과 이유 문장', async () => {
  const { LINES, careLine } = await import(url);
  const see = { canSee: true };
  assert.equal(careLine({ ...see, eye: 'AWAKE', mode: 'PLAY', candidate: null }), LINES.AWAKE);
  assert.equal(careLine({ ...see, eye: 'AWAKE', mode: 'PLAY', candidate: 'WIND_DOWN' }), LINES.SETTLING);
  assert.equal(careLine({ ...see, eye: 'DROWSY', mode: 'WIND_DOWN', candidate: null, dark: true, noisy: false }), LINES.DROWSY);
  assert.equal(careLine({ ...see, eye: 'DROWSY', mode: 'WIND_DOWN', candidate: 'SLEEP' }), LINES.FALLING);
  assert.equal(careLine({ ...see, eye: 'DROWSY', mode: 'WIND_DOWN', candidate: null, dark: false }), LINES.GLARE);
  assert.equal(careLine({ ...see, eye: 'DROWSY', mode: 'WIND_DOWN', candidate: null, dark: true, noisy: true }), LINES.NOISE);
  assert.equal(careLine({ ...see, eye: 'DROWSY', mode: 'WIND_DOWN', candidate: 'PLAY' }), LINES.REWAKE);
  assert.equal(careLine({ ...see, eye: 'ASLEEP', mode: 'SLEEP' }), LINES.ASLEEP);
  assert.equal(careLine({ ...see, eye: 'MORNING', mode: 'WAKE', night: { bright: 0, noise: 0 } }), LINES.NIGHT_CALM);
  assert.equal(careLine({ ...see, eye: 'MORNING', mode: 'WAKE', night: { bright: 2, noise: 0 } }), LINES.NIGHT_LIGHT);
  assert.equal(careLine({ ...see, eye: 'MORNING', mode: 'WAKE', night: { bright: 0, noise: 1 } }), LINES.NIGHT_NOISE);
  assert.equal(careLine({ ...see, eye: 'MORNING', mode: 'WAKE', night: { bright: 1, noise: 1 } }), LINES.NIGHT_BOTH);
});

test('세로 화면: 깨어 있을 때만 "가로로 눕고 싶어 해요" — 잠듦·아침·밤은 그대로', async () => {
  const { LINES, careLine } = await import(url);
  assert.equal(careLine({ portrait: true, canSee: true, eye: 'AWAKE', mode: 'PLAY' }), LINES.PORTRAIT);
  assert.equal(careLine({ portrait: true, canSee: false, eye: 'DROWSY', mode: 'WIND_DOWN' }), LINES.PORTRAIT);   // BLIND 보다 앞
  assert.equal(careLine({ portrait: true, canSee: true, eye: 'ASLEEP', mode: 'SLEEP' }), LINES.ASLEEP);
  assert.equal(careLine({ portrait: true, canSee: true, eye: 'MORNING', mode: 'WAKE' }), LINES.NIGHT_CALM);
  assert.equal(careLine({ portrait: true, eye: 'NIGHT', mode: 'SLEEP' }), null);
  assert.equal(careLine({ portrait: false, canSee: true, eye: 'AWAKE', mode: 'PLAY' }), LINES.AWAKE);
});

test('방을 못 보면(카메라·보드 없음) 밝기 문장 대신 이유를 말한다 — 잠듦·아침은 예외', async () => {
  const { LINES, careLine } = await import(url);
  assert.equal(careLine({ canSee: false, eye: 'AWAKE', mode: 'PLAY' }), LINES.BLIND);
  assert.equal(careLine({ canSee: false, eye: 'DROWSY', mode: 'WIND_DOWN', dark: false }), LINES.BLIND);
  assert.equal(careLine({ canSee: false, eye: 'ASLEEP', mode: 'SLEEP' }), LINES.ASLEEP);
  assert.equal(careLine({ canSee: false, eye: 'MORNING', mode: 'WAKE' }), LINES.NIGHT_CALM);
});
