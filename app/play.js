// play.js — 놀이 왕복 배선 [WO-02b-1] (파트 H — 02b 소유)
//  순수 핵은 play-core.mjs. 여기는 손가락·키 → 녹음 → /api/stt → /api/chat([CON-04] v0.2)
//  → 얼굴([CON-01b] expr:trigger) · sleepIntent → mode.js command('sleep')([CON-02]) 배선뿐이다.
//
//  입력 — 한 손가락 **길게 누르기**(pressMs) 동안 녹음, 떼면 보낸다. 데스크톱은 스페이스를 누르는 동안.
//   두 손가락·세 손가락은 main.js 의 기존 제스처라 손가락이 하나 더 닿으면 녹음을 버린다.
//   말소리 자동 감지는 v1 에 없다 — 귀(시선)와 겹치고 오작동이 잦다([ADR-308]).
//  마이크 — 귀가 켜져 있으면(WIND_DOWN 세션 · [ADR-121]) 그 스트림을 **빌리고**, 아니면 녹음하는
//   동안만 직접 열고 즉시 반납한다. 둘이 동시에 getUserMedia 를 열지 않는다([CON-02] 규칙 5).
//   원음은 서버(STT)로 한 번 가고 기기에 남지 않는다 — 녹음 조각은 전송 직후 버린다.
//  ⛔ R4 — SLEEP·잠듦·밤에서는 누름 자체를 받지 않고, 진행 중이던 녹음·응답도 버린다.
//  ⛔ R8 — 실패(키 없음·타임아웃·오프라인·형태 오류·STT 빈 문장)는 전부 사전 반응 3종 중 하나로.
//   사용자에게 오류를 보이지 않는다([CON-04] 오류 계약). 원인은 디버그 로그에만 남는다.
'use strict';
import { $, log, palBus, qs } from './core.js';
import { F } from './face/eyes.js';
import { emitExpression } from './face/expression.js';
import { earOn, earStream } from './face/ear.js';
import { MODE, modeCommand } from './mode.js';
import { DEFAULTS, micPlan, normalizeReaction, pickFallback, pickMime, playBlocked, pushHistory,
         recVerdict, toTrigger } from './play-core.mjs';

// 상수 덮어쓰기 — 실기 튜닝·검사용(?pressMs=500&minRecMs=400&maxRecMs=8000&playTimeoutMs=8000&yawnLeadMs=2500)
function readParams() {
  const map = { pressMs: 'pressMs', minRecMs: 'minRecMs', maxRecMs: 'maxRecMs',
                playTimeoutMs: 'clientTimeoutMs', yawnLeadMs: 'yawnLeadMs' };
  const p = Object.assign({}, DEFAULTS);
  for (const k of Object.keys(map)) {
    const v = parseFloat(qs.get(k));
    if (!Number.isNaN(v) && v >= 0) p[map[k]] = v;
  }
  return Object.freeze(p);
}
export const PLAY_PARAMS = readParams();

// ── 계측용 상태 — 디버그 화면·게이트가 읽는다. 원음·발화 원문은 여기 남기지 않는다 ──
export const PLAY = {
  phase: 'idle',      // 'idle' | 'arming' | 'rec' | 'send'
  mic: '-',           // 마지막 녹음의 마이크: 'borrow' | 'own' | '-'
  turns: 0,           // 성공한 왕복 수
  fallbacks: 0,       // 폴백 반응 수(R8)
  last: null,         // 마지막 반응 {expression, sleepIntent, fallback, why}
  lat: null,          // 마지막 왕복 지연 {stt, chat, total} ms — [WO-02b-1] 증거
  history: [],        // 대화 문맥(LLM 용) — SLEEP 진입(세션 끝)에 비운다
  seq: 0,             // 진행 중 왕복 번호 — 바뀌면 늦게 온 응답을 버린다
};
const R = { rec: null, stream: null, own: false, chunks: [], t0: 0, armT: null, maxT: null, sleepT: null };

const blocked = () => playBlocked(MODE.mode, F.state);
const ms = (a, b) => Math.round(b - a);

// ── 녹음 ───────────────────────────────────────────────────────
async function getMic() {
  const plan = micPlan(earOn(), !!earStream());
  if (plan === 'borrow') return { stream: earStream(), own: false, plan };
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: { ideal: 1 } } });
  return { stream, own: true, plan };
}
function releaseMic() {
  if (R.own && R.stream) for (const tr of R.stream.getTracks()) tr.stop();   // 빌린 스트림은 귀의 것 — 건드리지 않는다
  R.stream = null; R.own = false;
}

export async function playStart() {
  if (PLAY.phase !== 'idle' && PLAY.phase !== 'arming') return false;
  if (blocked()) { PLAY.phase = 'idle'; return false; }
  PLAY.phase = 'rec';
  const seq = ++PLAY.seq;
  let mic;
  try {
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices) throw new Error('no-recorder');
    mic = await getMic();
  } catch (e) {
    // 마이크가 없거나 거부됐다 — 팰은 그래도 반응한다(R8). 원인은 로그에만.
    log('놀이: 마이크 없음 (' + (e.name || e.message) + ') — 사전 반응');
    PLAY.phase = 'idle';
    react(pickFallback(), { fallback: true, why: 'mic' });
    return false;
  }
  if (seq !== PLAY.seq || PLAY.phase !== 'rec' || blocked()) {           // 기다리는 사이 취소됐다
    R.stream = mic.stream; R.own = mic.own; releaseMic();
    return false;
  }
  R.stream = mic.stream; R.own = mic.own; PLAY.mic = mic.plan;
  const mime = pickMime(MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported.bind(MediaRecorder));
  R.chunks = [];
  try { R.rec = new MediaRecorder(R.stream, mime ? { mimeType: mime } : undefined); }
  catch (e) { log('놀이: 녹음기 실패 (' + e.name + ') — 사전 반응'); releaseMic(); PLAY.phase = 'idle'; react(pickFallback(), { fallback: true, why: 'recorder' }); return false; }
  R.rec.ondataavailable = function (ev) { if (ev.data && ev.data.size) R.chunks.push(ev.data); };
  R.rec.start();
  R.t0 = performance.now();
  R.maxT = setTimeout(function () { log('놀이: 녹음 상한 — 보낸다'); playStop(); }, PLAY_PARAMS.maxRecMs);
  emitExpression('curious', 0.7, 'play');         // 팰이 귀를 기울인다
  log('놀이: 녹음 시작 (' + mic.plan + (mime ? ' · ' + mime : '') + ')');
  return true;
}

// 손을 뗐다 — 녹음을 멈추고 보낸다(짧으면 버린다).
export function playStop() {
  if (PLAY.phase === 'arming') { clearTimeout(R.armT); R.armT = null; PLAY.phase = 'idle'; return; }
  if (PLAY.phase !== 'rec' || !R.rec) { if (PLAY.phase === 'rec') PLAY.phase = 'idle'; return; }
  clearTimeout(R.maxT); R.maxT = null;
  const rec = R.rec, seq = PLAY.seq, dur = performance.now() - R.t0;
  R.rec = null;
  rec.onstop = function () {
    const type = (rec.mimeType || 'audio/webm');
    const blob = new Blob(R.chunks, { type });
    R.chunks = [];
    releaseMic();
    if (seq !== PLAY.seq) return;                 // 그 사이 취소(모드 전환 등)
    if (recVerdict(dur, PLAY_PARAMS) === 'discard' || blob.size === 0) {
      log('놀이: 너무 짧아 버림 (' + Math.round(dur) + 'ms)');
      PLAY.phase = 'idle';
      return;
    }
    send(blob, seq);
  };
  try { rec.stop(); } catch { rec.onstop(); }
}

// 버린다 — 손가락이 하나 더 닿았거나, 모드가 바뀌었거나, 밤이 됐다. 늦게 오는 응답도 버린다.
export function playCancel(why) {
  clearTimeout(R.armT); clearTimeout(R.maxT); R.armT = null; R.maxT = null;
  const was = PLAY.phase;
  PLAY.seq++;
  if (R.rec) { const rec = R.rec; R.rec = null; rec.onstop = null; try { rec.stop(); } catch { /* 이미 멈춤 */ } }
  R.chunks = [];
  releaseMic();
  PLAY.phase = 'idle';
  if (was !== 'idle' && why) log('놀이: 취소 — ' + why);
}

// ── 왕복 ───────────────────────────────────────────────────────
async function post(url, body, type) {
  const ctl = new AbortController();
  const t = setTimeout(function () { ctl.abort(); }, PLAY_PARAMS.clientTimeoutMs);
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': type }, body, signal: ctl.signal, cache: 'no-store' });
    if (!r.ok) throw Object.assign(new Error('http'), { why: String(r.status) });
    return await r.json();
  } catch (e) {
    throw Object.assign(e, { why: e.why || (e.name === 'AbortError' ? 'timeout' : 'offline') });
  } finally { clearTimeout(t); }
}

async function send(blob, seq) {
  PLAY.phase = 'send';
  emitExpression('thinking', 0.8, 'play');        // 팰이 곰곰이 — 왕복 동안의 표정
  const t0 = performance.now();
  let tStt = t0, text = '', reaction = null, why = null;
  try {
    const s = await post('/api/stt', blob, blob.type || 'audio/webm');
    tStt = performance.now();
    text = typeof s.text === 'string' ? s.text.trim() : '';
    if (!text) throw Object.assign(new Error('empty'), { why: 'empty' });
    if (seq !== PLAY.seq) return;
    const messages = PLAY.history.concat([{ role: 'user', content: text }]);
    const c = await post('/api/chat', JSON.stringify({ messages, persona: 'pal' }), 'application/json');
    reaction = normalizeReaction(c);
    if (!reaction) why = 'shape';
  } catch (e) { why = e.why || 'error'; }
  if (seq !== PLAY.seq) return;                   // 취소된 왕복 — 응답을 버린다
  PLAY.phase = 'idle';
  if (blocked()) { log('놀이: 응답 도착했지만 밤 — 버림 (R4)'); return; }
  const t1 = performance.now();
  if (!reaction) {
    log('놀이: 실패 ' + why + ' — 사전 반응 (R8)');
    react(pickFallback(), { fallback: true, why });
    return;
  }
  PLAY.lat = { stt: ms(t0, tStt), chat: ms(tStt, t1), total: ms(t0, t1) };
  PLAY.turns++;
  PLAY.history = pushHistory(PLAY.history, text, reaction, PLAY_PARAMS.historyMax);
  // 발화 원문은 디버그 로그(기기 안)에만 — 증거("나 이제 잘게 → sleepIntent=true")를 실기에서 보기 위해서다.
  log('놀이: "' + text.slice(0, 40) + '" → ' + reaction.expression + ' · ' + reaction.babbleTone +
      (reaction.sleepIntent ? ' · sleepIntent=true' : '') +
      '  (stt ' + PLAY.lat.stt + 'ms · chat ' + PLAY.lat.chat + 'ms · 총 ' + PLAY.lat.total + 'ms)');
  react(reaction, { fallback: false });
}

// 반응 → 얼굴. sleepIntent 면 팰이 먼저 하품하고, yawnLeadMs 뒤 잠든다(모드 명령 — [CON-02] 규칙 1 그대로).
function react(reaction, meta) {
  if (blocked()) return;
  const trig = toTrigger(reaction);
  if (trig) emitExpression(trig);
  PLAY.last = { expression: trig ? trig.kind : null, sleepIntent: reaction.sleepIntent, fallback: !!meta.fallback, why: meta.why || null };
  if (meta.fallback) PLAY.fallbacks++;
  if (reaction.sleepIntent && !meta.fallback) {
    clearTimeout(R.sleepT);
    R.sleepT = setTimeout(function () {
      R.sleepT = null;
      if (MODE.mode === 'SLEEP') return;
      log('놀이: sleepIntent — 팰이 잠든다');
      modeCommand('sleep');
    }, PLAY_PARAMS.yawnLeadMs);
  }
}

// ── 입력 ───────────────────────────────────────────────────────
function onTouchStart(e) {
  if (e.touches.length !== 1) { if (PLAY.phase === 'arming' || PLAY.phase === 'rec') playCancel('손가락 ' + e.touches.length + '개'); return; }
  if (PLAY.phase !== 'idle' || blocked()) return;
  PLAY.phase = 'arming';
  R.armT = setTimeout(function () { R.armT = null; if (PLAY.phase === 'arming') playStart(); }, PLAY_PARAMS.pressMs);
}
function onTouchEnd(e) {
  if (e.touches && e.touches.length > 0) return;   // 아직 손가락이 남아 있다
  if (PLAY.phase === 'arming' || PLAY.phase === 'rec') playStop();
}
function isSpace(e) { return e.code === 'Space' || e.key === ' '; }

let inited = false;
export function initPlay(bus) {
  if (inited) return;
  inited = true;
  const face = $('faceScreen');
  face.addEventListener('touchstart', onTouchStart, { passive: true });
  face.addEventListener('touchend', onTouchEnd, { passive: true });
  face.addEventListener('touchcancel', function () { playCancel('touchcancel'); }, { passive: true });
  addEventListener('keydown', function (e) {
    if (!isSpace(e) || !face.classList.contains('on')) return;
    e.preventDefault();
    if (!e.repeat && PLAY.phase === 'idle') playStart();
  });
  addEventListener('keyup', function (e) {
    if (isSpace(e) && PLAY.phase === 'rec') { e.preventDefault(); playStop(); }
  });
  // 모드가 바뀌면 녹음 중인 것은 버린다 — 귀가 WIND_DOWN 진입에서 마이크를 새로 열기 전에 내 것을 놓는다.
  // SLEEP 이면 진행 중 왕복과 예약된 잠듦까지 전부 버리고, 대화 문맥을 비운다(세션 끝 · R4).
  (bus || palBus).addEventListener('mode:change', function (e) {
    const to = e.detail && e.detail.to;
    if (PLAY.phase === 'arming' || PLAY.phase === 'rec') playCancel('모드 ' + to);
    if (to === 'SLEEP') {
      if (PLAY.phase === 'send') playCancel('잠듦');
      clearTimeout(R.sleepT); R.sleepT = null;
      PLAY.history = [];
    }
  });
}
