// play-core.mjs — 놀이 왕복의 순수 핵 [WO-02b-1] (파트 H — 02b 소유)
//  DOM·마이크·네트워크 의존 0. 배선(녹음·fetch·버스)은 play.js 가 하고, 여기는
//  "무엇을 할지"만 정한다 — 그래서 node 가 브라우저 없이 검사한다(scripts/play-core.test.js).
//
//  흐름: 길게 누름 → 녹음 → /api/stt → /api/chat → 반응([CON-04] v0.2) → 얼굴([CON-01b] expr:trigger)
//  ⛔ R4 — SLEEP 모드·잠듦·밤 상태에서는 놀이 채널 전체가 닫힌다(playBlocked).
//  ⛔ R8 — 네트워크·키·상류 어느 것이 죽어도 팰은 사전 반응 3종 중 하나로 반응한다(FALLBACKS).
//  R2 — v1 은 문장을 화면에 내지 않는다(caption 미표시, [ADR-308]). 팰의 반응은 표정뿐이다.
import { LEGACY_TONES, normalizeExpressionTrigger } from './face/expression-protocol.mjs';

// [CON-04] v0.2 반응 어휘 — serve.js VOCAB 과 같은 목록이어야 한다(play-core.test.js 가 대조한다).
export const PLAY_EXPRESSIONS = Object.freeze(['happy', 'curious', 'sad', 'thinking', 'yawn']);
export const PLAY_EMOTIONS = Object.freeze(['calm', 'happy', 'sleepy', 'curious', 'sad']);
export const PLAY_TONES = Object.freeze(['soft', 'bright', 'drowsy']);

// 상수 — 전부 실기 튜닝 대상. play.js 가 URL(?pressMs=&yawnLeadMs=…)로 덮어쓴다.
export const DEFAULTS = Object.freeze({
  pressMs: 500,          // 한 손가락을 이만큼 누르고 있어야 녹음 시작 — 몸통에 밀어 넣는 손가락은 스치고 지나간다
  minRecMs: 400,         // 이보다 짧은 녹음은 버린다(실수로 누른 것)
  maxRecMs: 8000,        // 녹음 상한 — 이보다 길면 저절로 멈추고 보낸다(413 예방, [CON-04])
  clientTimeoutMs: 8000, // 요청 1건 상한 — 서버(20s)보다 짧게: 팰이 오래 멍하니 있지 않는다
  yawnLeadMs: 2500,      // sleepIntent → 하품 뒤 이만큼 있다가 잠든다("팰이 먼저 잠든다")
  historyMax: 8,         // 대화 문맥 — 최근 8개 메시지(4왕복). 양 세기의 "몇 마리째"를 LLM 이 안다
});

// R8 사전 반응 3종 — 끊겨도 팰은 반응한다. 실패를 서운함(sad)으로 보이지 않는다:
// 오류는 사용자의 몫이 아니다([CON-04] 오류 계약 — "사용자에게 에러를 보이지 않는다").
export const FALLBACKS = Object.freeze([
  Object.freeze({ emotion: 'happy',   expression: 'happy',   babbleTone: 'bright', sleepIntent: false }),
  Object.freeze({ emotion: 'curious', expression: 'curious', babbleTone: 'soft',   sleepIntent: false }),
  Object.freeze({ emotion: 'calm',    expression: 'thinking', babbleTone: 'soft',  sleepIntent: false }),
]);
export function pickFallback(rand = Math.random) {
  const i = Math.min(FALLBACKS.length - 1, Math.max(0, Math.floor(rand() * FALLBACKS.length)));
  return FALLBACKS[i];
}

// 서버가 이미 접었지만([CON-04] v0.2) 클라이언트도 한 번 더 접는다 — 계약 밖 값이 얼굴로 가지 않는다.
// 형태 자체가 틀리면 null(→ 폴백).
export function normalizeReaction(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
  if (!PLAY_EXPRESSIONS.includes(r.expression)) return null;
  return {
    emotion: PLAY_EMOTIONS.includes(r.emotion) ? r.emotion : 'calm',
    expression: r.expression,
    babbleTone: PLAY_TONES.includes(r.babbleTone) ? r.babbleTone : 'soft',
    sleepIntent: r.sleepIntent === true,
  };
}

// 반응 → [CON-01b] expr:trigger payload. sleepIntent 면 표정은 하품으로 — 잠들기 전에 팰이 먼저 하품한다.
export function toTrigger(reaction) {
  const kind = reaction.sleepIntent ? 'yawn' : reaction.expression;
  return normalizeExpressionTrigger({ kind, tone: LEGACY_TONES[reaction.babbleTone] ?? LEGACY_TONES.soft, source: 'play' });
}

// ⛔ R4 — 놀이 채널이 닫히는 조건. 모드가 SLEEP 이거나, 눈이 잠듦·밤이면(보드 경로 포함) 닫힌다.
export function playBlocked(mode, eyeState) {
  return mode === 'SLEEP' || eyeState === 'ASLEEP' || eyeState === 'NIGHT';
}

// 마이크 계획 — 귀(WIND_DOWN 세션, [ADR-121])가 스트림을 쥐고 있으면 **빌린다**(같은 스트림에
// MediaRecorder 를 하나 더 붙인다). 아니면 녹음하는 동안만 직접 열고 즉시 반납한다.
// getUserMedia 를 둘이 동시에 열지 않는다([CON-02] 규칙 5 · [ADR-401] ④).
export function micPlan(earIsOn, earStreamLive) {
  return earIsOn && earStreamLive ? 'borrow' : 'own';
}

// 녹음 형식 — 브라우저가 지원하는 첫 형식. '' 이면 브라우저 기본값(형식은 blob.type 으로 서버에 간다).
export const MIME_PREFS = Object.freeze(['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']);
export function pickMime(isSupported) {
  if (typeof isSupported !== 'function') return '';
  for (const m of MIME_PREFS) { try { if (isSupported(m)) return m; } catch { /* 다음 후보 */ } }
  return '';
}

// 대화 문맥 — 사용자 발화 + 팰의 반응(JSON 문자열: 같은 형식을 이어 가도록)을 쌓고 최근 max 개만 남긴다.
// 폴백 반응은 쌓지 않는다(LLM 이 하지 않은 반응을 LLM 의 말로 기억시키지 않는다).
export function pushHistory(history, userText, reaction, max = DEFAULTS.historyMax) {
  const next = history.concat([
    { role: 'user', content: String(userText) },
    { role: 'assistant', content: JSON.stringify(reaction) },
  ]);
  const keep = Math.max(2, max - (max % 2));        // 왕복 단위로 자른다 — user 로 시작해야 한다
  return next.length > keep ? next.slice(next.length - keep) : next;
}

// 녹음 길이 판정 — 너무 짧으면 버린다, 길면 상한에서 끊는다(play.js 타이머가 끊는다).
export function recVerdict(durMs, p = DEFAULTS) {
  return durMs < p.minRecMs ? 'discard' : 'send';
}
