// play.js — 놀이 왕복 v1 [WO-02b-1] (파트 H 소유 · 02b 계보)
//  길게 누름 → 녹음 → /api/stt → /api/chat → 반응 JSON([CON-04]) → palBus.
//  LLM 의 역할은 말이 아니라 **반응 결정**이다([PLAN-02] §1) — 표현(옹알이·표정)은
//  [WO-02b-2] 소비자가 palBus 의 `play:reaction` 으로 받는다([CON-02] v0.2).
//  ⛔ R1 — 이 모듈에 음성 출력 경로가 없다. ⛔ R4 — NIGHT 에서 채널 자체가 닫힌다.
//  ⛔ R8 — 네트워크·키·상류가 죽어도 팰은 반응한다(사전 반응 폴백).
'use strict';
import { $, log, palBus } from './core.js';
import { F } from './face/eyes.js';

// ── 상수 — 실측 후 튜닝(폰 실기) ──────────────────────────────
export const HOLD_MS = 500;        // 이보다 짧은 접촉은 스침이다(몸통 투입 중 오작동 방지)
export const MIN_REC_MS = 300;     // 이보다 짧은 녹음은 버린다
export const MAX_REC_MS = 15000;   // [CON-04] 413 예방 — 녹음 길이 상한
export const MAX_TURNS = 12;       // LLM 에 보내는 대화 맥락 상한(왕복 비용·창 크기)

// R8 폴백 — 서버·키·상류가 죽어도 팰은 이 셋 중 하나로 반응한다.
// 어휘는 serve.js PAL_SYSTEM 과 같은 잠정 계약([WO-02b-2] 합의 전).
export const FALLBACK = [
  { emotion:'calm',    expression:'smile', babbleTone:'soft',   sleepIntent:false },
  { emotion:'curious', expression:'blink', babbleTone:'bright', sleepIntent:false },
  { emotion:'sleepy',  expression:'yawn',  babbleTone:'drowsy', sleepIntent:false },
];

// ── 한 세션의 진실 — 계측용. 렌더는 palBus 소비자 몫 ──────────
export const PLAY = {
  recording:false, busy:false,
  history:[],            // {role:'user'|'assistant', content} — [CON-04] messages 그대로
  lastText:null,         // 마지막 STT 텍스트(계측·디버그. diary 저장은 범위 밖)
  lastReaction:null, lastLatencyMs:0, lastFallback:false,
  rounds:0, fallbacks:0,
};

let stream = null, rec = null, chunks = [], t0rec = 0;
let holdT = 0, capT = 0;

// R4 이중 방어([CON-02] 규칙 2) — 발행자를 믿지 않고 채널이 스스로 닫는다.
const gateOpen = () => F.state !== 'NIGHT';

// ── 녹음 ──────────────────────────────────────────────────────
async function startRec() {
  if (PLAY.recording || PLAY.busy || !gateOpen()) return;
  if (!navigator.mediaDevices || typeof MediaRecorder === 'undefined') {
    log('play: 녹음 미지원 브라우저'); return;
  }
  try {
    stream = stream || await navigator.mediaDevices.getUserMedia({ audio:true });
  } catch (e) { log('play: 마이크 거부 — ' + e.name); return; }
  chunks = [];
  const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
  rec = mime ? new MediaRecorder(stream, { mimeType:mime }) : new MediaRecorder(stream);
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  rec.onstop = onRecStop;
  rec.start();
  PLAY.recording = true;
  t0rec = performance.now();
  capT = setTimeout(() => stopRec(true), MAX_REC_MS);   // 상한 도달 시 자동 송신
  log('play: 녹음 시작');
}

function stopRec(sendIt) {
  clearTimeout(capT);
  if (!PLAY.recording) return;
  PLAY.recording = false;
  const dur = performance.now() - t0rec;
  rec._send = sendIt && dur >= MIN_REC_MS;
  if (!rec._send) log('play: 녹음 폐기 (' + Math.round(dur) + 'ms)');
  try { rec.stop(); } catch { /* 이미 멎었으면 그만 */ }
}

function onRecStop() {
  if (!rec._send) return;
  const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
  chunks = [];
  roundTrip(blob);
}

// ── 왕복 — STT → LLM. 어떤 실패든 팰은 반응한다(R8) ───────────
async function roundTrip(blob) {
  if (PLAY.busy || !gateOpen()) return;
  PLAY.busy = true;
  const t0 = performance.now();
  try {
    const sr = await fetch('/api/stt', {
      method:'POST', headers:{ 'Content-Type': blob.type || 'audio/webm' }, body: blob,
    });
    if (!sr.ok) throw new Error('stt-' + sr.status);
    const text = String((await sr.json()).text || '').trim();
    if (!text) { emit(pickFallback(), t0, null, 'stt-empty'); return; }
    await chat(text, t0);
  } catch (e) {
    emit(pickFallback(), t0, null, e.message);
  } finally {
    PLAY.busy = false;
  }
}

// 텍스트 → 반응. 검사·데스크톱 경로이자 STT 이후의 공통 절반.
export async function sendText(text, t0) {
  if (!gateOpen()) return null;              // R4 — NIGHT 에서는 명령도 닫힌다
  t0 = t0 || performance.now();
  try { return await chat(String(text).trim(), t0); }
  catch (e) { return emit(pickFallback(), t0, null, e.message); }
}

async function chat(text, t0) {
  PLAY.lastText = text;
  PLAY.history.push({ role:'user', content:text });
  while (PLAY.history.length > MAX_TURNS) PLAY.history.shift();
  const cr = await fetch('/api/chat', {
    method:'POST', headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify({ messages: PLAY.history, persona:'pal' }),   // [CON-04]
  });
  if (!cr.ok) throw new Error('chat-' + cr.status);
  const rx = await cr.json();
  // 팰의 반응도 맥락에 남긴다 — 다음 왕복에서 LLM 이 자기 반응을 기억한다
  PLAY.history.push({ role:'assistant', content: JSON.stringify({
    emotion:rx.emotion, babbleTone:rx.babbleTone, sleepIntent:rx.sleepIntent === true }) });
  return emit(rx, t0, text, null);
}

const pickFallback = () => FALLBACK[Math.floor(Math.random() * FALLBACK.length)];

// ── 발행 — [CON-02] v0.2 `play:reaction`. 모드 전환을 직접 하지 않는다 —
//    sleepIntent 는 mode.js([WO-02d-1])가 구독해 전이 트리거로 쓴다(계약 규칙 1).
function emit(rx, t0, text, err) {
  const ms = Math.round(performance.now() - t0);
  const fallback = err !== null;
  PLAY.lastReaction = rx; PLAY.lastLatencyMs = ms; PLAY.lastFallback = fallback;
  PLAY.rounds++; if (fallback) PLAY.fallbacks++;
  palBus.dispatchEvent(new CustomEvent('play:reaction', {
    detail: { emotion:rx.emotion, expression:rx.expression, babbleTone:rx.babbleTone,
              sleepIntent:rx.sleepIntent === true, caption:rx.caption,
              fallback, latencyMs:ms, text },
  }));
  log('play: ' + (fallback ? '폴백(' + err + ') ' : '') + rx.emotion + '/' + rx.babbleTone +
      (rx.sleepIntent === true ? ' · sleepIntent' : '') + ' · ' + ms + 'ms');
  return rx;
}

// ── 입력 배선 — 얼굴 화면 길게 누름(폰) + v 키 홀드(데스크톱) ──
//  단일 탭 무시 원칙(main.js)은 유지된다 — HOLD_MS 미만 접촉은 아무것도 아니다.
//  두 번째 손가락이 오면 취소한다: 두 손가락 탭은 상태 전환 제스처다.
export function initPlay() {
  const face = $('faceScreen');
  face.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary) { clearTimeout(holdT); if (PLAY.recording) stopRec(false); return; }
    if (!gateOpen()) return;                 // R4 — 밤에는 타이머조차 걸지 않는다
    clearTimeout(holdT);
    holdT = setTimeout(startRec, HOLD_MS);
  });
  const end = (e) => {
    if (!e.isPrimary) return;
    clearTimeout(holdT);
    if (PLAY.recording) stopRec(true);
  };
  face.addEventListener('pointerup', end);
  face.addEventListener('pointercancel', (e) => {
    if (!e.isPrimary) return;
    clearTimeout(holdT);
    if (PLAY.recording) stopRec(false);
  });
  addEventListener('keydown', (e) => { if (e.key === 'v' && !e.repeat) startRec(); });
  addEventListener('keyup',   (e) => { if (e.key === 'v') stopRec(true); });
}
