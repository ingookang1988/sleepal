'use strict';
// [WO-02b-1] 놀이 왕복 순수 핵 — 반응 정규화·폴백(R8)·차단(R4)·마이크 계획·문맥 자르기.
// 순수 핵(app/play-core.mjs)만 본다. 녹음·fetch·버스 배선은 헤드리스 게이트(scripts/play-gate.js)가 본다.

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const app = (f) => pathToFileURL(path.join(__dirname, '..', 'app', f)).href;
const load = () => import(app('play-core.mjs'));

test('반응 어휘는 serve.js VOCAB 과 같다([CON-04] v0.2 — 제공·소비 한 목록)', async () => {
  const c = await load();
  const src = fs.readFileSync(path.join(__dirname, 'serve.js'), 'utf8');
  const list = (k) => JSON.parse(src.match(new RegExp(k + ": (\\[[^\\]]*\\])"))[1].replace(/'/g, '"'));
  assert.deepEqual(list('expression'), [...c.PLAY_EXPRESSIONS]);
  assert.deepEqual(list('emotion'), [...c.PLAY_EMOTIONS]);
  assert.deepEqual(list('babbleTone'), [...c.PLAY_TONES]);
});

test('놀이 표정은 전부 얼굴이 받는 [CON-01b] kind 다', async () => {
  const c = await load();
  const { EXPRESSION_KINDS } = await import(app('face/expression-protocol.mjs'));
  for (const k of c.PLAY_EXPRESSIONS) assert.ok(EXPRESSION_KINDS.includes(k), k);
});

test('normalizeReaction — 형태가 틀리면 null, 부속 값은 기본값으로 접힌다', async () => {
  const c = await load();
  assert.equal(c.normalizeReaction(null), null);
  assert.equal(c.normalizeReaction([1]), null);
  assert.equal(c.normalizeReaction({ expression: 'smile' }), null);     // 계약 밖 표정 → 폴백 대상
  assert.deepEqual(c.normalizeReaction({ expression: 'happy', emotion: 'x', babbleTone: 'y', sleepIntent: 'true' }),
    { emotion: 'calm', expression: 'happy', babbleTone: 'soft', sleepIntent: false });
  assert.equal(c.normalizeReaction({ expression: 'yawn', sleepIntent: true }).sleepIntent, true);
});

test('toTrigger — [CON-01b] payload, source play, tone 은 LEGACY_TONES · sleepIntent 면 하품', async () => {
  const c = await load();
  assert.deepEqual(c.toTrigger({ expression: 'curious', babbleTone: 'drowsy', sleepIntent: false }),
    { kind: 'curious', tone: 0.35, source: 'play' });
  assert.deepEqual(c.toTrigger({ expression: 'happy', babbleTone: 'bright', sleepIntent: true }),
    { kind: 'yawn', tone: 1, source: 'play' });
});

test('폴백 3종 — 전부 유효한 트리거이고 sleepIntent 는 없다(R8)', async () => {
  const c = await load();
  assert.equal(c.FALLBACKS.length, 3);
  for (const f of c.FALLBACKS) {
    assert.ok(c.normalizeReaction(f));
    assert.ok(c.toTrigger(f));
    assert.equal(f.sleepIntent, false);
    assert.notEqual(f.expression, 'sad');   // 실패를 서운함으로 보이지 않는다
  }
  const seen = new Set([0, 0.34, 0.67, 0.999, 1].map((r) => c.pickFallback(() => r)));
  assert.equal(seen.size, 3);
});

test('playBlocked — SLEEP 모드 · 잠듦 · 밤에서 닫힌다(R4)', async () => {
  const c = await load();
  assert.equal(c.playBlocked('SLEEP', 'AWAKE'), true);
  assert.equal(c.playBlocked('PLAY', 'ASLEEP'), true);
  assert.equal(c.playBlocked('PLAY', 'NIGHT'), true);
  assert.equal(c.playBlocked('PLAY', 'AWAKE'), false);
  assert.equal(c.playBlocked('WIND_DOWN', 'DROWSY'), false);
  assert.equal(c.playBlocked('WAKE', 'MORNING'), false);
});

test('micPlan — 귀가 스트림을 쥐고 있으면 빌린다, 아니면 직접 연다', async () => {
  const c = await load();
  assert.equal(c.micPlan(true, true), 'borrow');
  assert.equal(c.micPlan(true, false), 'own');
  assert.equal(c.micPlan(false, false), 'own');
});

test('pickMime — 선호 순서의 첫 지원 형식 · 없으면 브라우저 기본값', async () => {
  const c = await load();
  assert.equal(c.pickMime((m) => m === 'audio/mp4'), 'audio/mp4');          // iOS Safari
  assert.equal(c.pickMime(() => true), 'audio/webm;codecs=opus');
  assert.equal(c.pickMime(() => false), '');
  assert.equal(c.pickMime(undefined), '');
  assert.equal(c.pickMime(() => { throw new Error('x'); }), '');
});

test('pushHistory — 왕복 단위로 최근 max 개 · user 로 시작', async () => {
  const c = await load();
  let h = [];
  for (let i = 1; i <= 6; i++) h = c.pushHistory(h, '양 ' + i + '마리', { expression: 'happy' }, 8);
  assert.equal(h.length, 8);
  assert.equal(h[0].role, 'user');
  assert.equal(h[0].content, '양 3마리');
  assert.equal(h[7].role, 'assistant');
  assert.deepEqual(JSON.parse(h[7].content), { expression: 'happy' });
  assert.equal(c.pushHistory([], 'x', {}, 3).length, 2);   // 홀수 max 는 내림 — 반쪽 왕복을 남기지 않는다
});

test('recVerdict — 최소 길이 미만은 버린다', async () => {
  const c = await load();
  assert.equal(c.recVerdict(100), 'discard');
  assert.equal(c.recVerdict(c.DEFAULTS.minRecMs), 'send');
});
