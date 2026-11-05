'use strict';
// [WO-01b-7] 이산 표정 순수 핵 — 봉투·다중 슬롯 합성·페이드 연속성·원복. 실행: node --test scripts/emotion-core.test.js
const assert = require('node:assert/strict');
const test = require('node:test');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const url = pathToFileURL(path.join(__dirname, '..', 'app', 'face', 'emotion-core.mjs')).href;
const DT = 1 / 60;

test('봉투: 어택→머묾→릴리스→끝(음수)', async () => {
  const { EMO_DEF, emoAmt } = await import(url);
  const d = EMO_DEF.happy;
  assert.equal(emoAmt(d, 0), 0); assert.ok(emoAmt(d, d.atk / 2) > 0 && emoAmt(d, d.atk / 2) < 1);
  assert.equal(emoAmt(d, d.atk + 0.1), 1); assert.ok(emoAmt(d, d.dur - 0.01) > 0 && emoAmt(d, d.dur - 0.01) < 0.1);
  assert.equal(emoAmt(d, d.dur + 0.01), -1);
});

test('단일 슬롯: 끝나면 제거되고 채널 전부 0(원복)', async () => {
  const { trigger, advance, mix, ZERO } = await import(url);
  let s = trigger([], 'happy', 1, 'play');
  let peak = 0;
  for (let i = 0; i < 60 * 3; i++) { s = advance(s, DT); const m = mix(s, 1); peak = Math.max(peak, m.ch.low); }
  assert.ok(peak > 0.6, 'peak ' + peak);
  assert.deepEqual(s, []); assert.deepEqual(mix(s, 1).ch, ZERO());
});

test('크로스페이드: happy 정점에서 curious 발화 — 프레임 간 아래꺼풀 변화 ≤ 0.1, 연속', async () => {
  const { trigger, advance, mix } = await import(url);
  let s = trigger([], 'happy', 1, 'play');
  for (let i = 0; i < 40; i++) s = advance(s, DT);               // 0.67s — 정점
  let prev = mix(s, 1).ch.low; assert.ok(prev > 0.6);
  s = trigger(s, 'curious', 1, 'play');
  let maxJump = 0, minLow = 1;
  for (let i = 0; i < 60; i++) {
    s = advance(s, DT); const m = mix(s, 1);
    maxJump = Math.max(maxJump, Math.abs(m.ch.low - prev)); prev = m.ch.low; minLow = Math.min(minLow, m.ch.low);
    assert.ok(m.ch.hR <= 0 && m.ch.head >= 0);                     // curious 채널이 오르는 중
  }
  assert.ok(maxJump <= 0.1, 'maxJump ' + maxJump);
  assert.equal(minLow, 0);                                          // 결국 happy 는 사라진다
  assert.equal(mix(s, 1).kind, 'curious');
});

test('합성: 페이드 중 슬롯 + 새 슬롯의 채널은 합 · 높이 배율은 1 기준 델타 합', async () => {
  const { trigger, advance, mix } = await import(url);
  let s = trigger([], 'relieved', 1, 'lux');
  for (let i = 0; i < 30; i++) s = advance(s, DT);
  s = trigger(s, 'startled', 1, 'lux'); s = advance(s, DT * 3);
  const m = mix(s, 1);
  assert.ok(m.ch.low > 0 && m.ch.open > 0, JSON.stringify(m.ch));  // relieved 의 아래꺼풀 + startled 의 'o' 가 동시에
  assert.ok(m.ch.hL < 0.02, 'hL ' + m.ch.hL);                      // +0.02(relieved, 페이드) + (−0.14·a)(startled)
});

test('게이트·톤: gate 0 이면 채널 0 · tone 0 은 55%', async () => {
  const { trigger, advance, mix } = await import(url);
  let s = trigger([], 'happy', 0, 'play');
  for (let i = 0; i < 40; i++) s = advance(s, DT);
  assert.ok(Math.abs(mix(s, 1).ch.low - 0.62 * 0.55) < 0.02);
  assert.deepEqual(mix(s, 0).ch.low, 0);
});

test('kind 채널: sad 는 윗꺼풀 처짐, curious 는 고개 갸웃, 알 수 없는 kind 는 무시', async () => {
  const { channels, trigger } = await import(url);
  assert.ok(channels('sad', 1).lid > 0 && channels('sad', 1).tilt < 0);
  assert.ok(channels('curious', 1).head > 0 && channels('curious', 1).hL > 0 && channels('curious', 1).hR < 0);
  assert.equal(channels('happy', 1).lid, 0); assert.equal(channels('startled', 1).head, 0);
  assert.deepEqual(trigger([], 'angry', 1, 'play'), []);
});
