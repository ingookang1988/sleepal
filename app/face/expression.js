// face/expression.js — 표정 레이어 [WO-01b-4] (파트 H 소유)
//  상태(이산·보드 소유) 위에 표정(연속·환경 구동)을 *합성*한다.
//  [CON-01] 규칙 2 — 표정은 상태 전이를 절대 유발하지 않는다.
//  ⛔ [ARCH-01] R4 — 밤에는 계산 자체를 돌리지 않는다.
'use strict';
import { smooth, clamp, palBus, rand } from '../core.js';
import { F, EYE } from './eyes.js';
import { normalizeExpressionTrigger } from './expression-protocol.mjs';
export { normalizeExpressionTrigger } from './expression-protocol.mjs';
import { EMO_DEF, advance as emoAdvance, mix as emoMix, trigger as emoTrigger } from './emotion-core.mjs';

// [CON-01] 호흡 주기. 보드의 후광과 같은 숫자를 써야 몸과 얼굴이 한 몸이 된다.
export const BREATH = { AWAKE:4.0, DROWSY:5.5, ASLEEP:6.5, NIGHT:0, MORNING:4.5 };
// 호흡 **진폭**(눈 높이 비율) — 주기만 상태별이고 진폭이 고정이면 감긴 눈은 0.6mm 라 후광만 숨쉬는 것처럼
// 읽힌다([ANL-01b] 근인 3, [WO-01b-9]). 감긴 눈 곡선도 같은 mm 로 오르내린다(breathMm).
export const BREATH_AMP = { AWAKE:0.02, DROWSY:0.03, ASLEEP:0.035, NIGHT:0, MORNING:0.02 };
// 상태별 눈부심 응답 비율
export const GATE   = { AWAKE:1, DROWSY:1, ASLEEP:0, NIGHT:0, MORNING:0.5 };

export const GL = {
  raw:0,        // lux 에서 계산된 즉시값
  now:0,        // 화면에 반영되는 평활값
  flinch:-1,    // 움찔 경과(초). -1 = 없음
  relief:-1,    // 안도 경과(초)
  settle:0,     // 안도 뒤 가라앉음 0~1
  release:0,    // 놓아주는 창 남은 시간(초). 0 = 평소의 느린 이완
  // 불응기 2초는 **유형별**이다([ADR-117]) — 움찔이 안도를 막으면 "불 켰다
  // 바로 끈" 실제 시나리오에서 안도가 죽는다(검증 중 실측). 잡음 연발만 막는다.
  flinchAt:-9,  // 마지막 움찔 발화 시각
  reliefAt:-9,  // 마지막 안도 발화 시각
};
// 비대칭 시상수 — 이 두 숫자가 이 레이어의 핵심이다.
// 대칭이면 슬라이더로 보이고, 비대칭이어야 *반응*으로 보인다.
export const TAU_UP = 0.15, TAU_DOWN = 2.5;

// ── 놓아줌 — 빛이 실제로 진 것에 *대한 반응*으로 눈을 뜬다 ──────
//  왜 필요한가: 위 두 시상수만으로는 사건 구조가 비대칭이다. 빛이 오를 때는
//  움찔이라는 능동적 제스처가 눈을 감기지만, 빛이 질 때는 안도가 **닫는
//  것으로 시작**하고 뜨는 일은 TAU_DOWN 의 수동 감쇠에 맡겨져 있었다.
//  그래서 90% 회복에 4.3초, 99% 에 8.4초가 걸리고 "다시 안 떠진다"로 읽힌다.
//
//  고치는 방향은 TAU_DOWN 을 깎는 것이 아니다 — 그 숫자는 *배경 이완*의
//  느림이고 안도는 큐시트 30초의 핵심 표정이라 느려야 한다([WO-01b-4]).
//  대신 **안도가 발화한 동안에만** 짧은 시상수로 놓아준다. 빛이 서서히
//  질 때(안도 미발화)는 예전 그대로 2.5초로 천천히 풀린다.
//  창 길이는 안도 깜빡임 봉투 전체(0.45+0.15+0.75)와 같게 잡는다 —
//  눈꺼풀이 다시 열리는 그 순간에 찡그림도 이미 풀려 있어야 한다.
export const TAU_RELEASE = 0.4, RELEASE_T = 1.35;

// ── 이산 표정 — [CON-01b] expr:trigger 소비부 [WO-01b-5] ───────
//  연속 채널(glare)과 달리 *사건*이다: 봉투가 타고 끝나면 기하는 픽셀 단위로 원래대로
//  돌아온다. 놀이 감정은 serve.js PAL_SYSTEM 의 enum(happy·curious·sad)을 재사용하고,
//  센서 반응은 startled·relieved 로 분리한다. [CON-01] 규칙 2 — 트리거는 상태 전이를 절대 유발하지 않는다.
//  [WO-01b-7] 봉투 정의·합성은 emotion-core.mjs(순수). 슬롯이 여럿이라 새 트리거가 이전 봉투를
//  짧게 내리면서 오른다 — 얼굴이 튀지 않는다. EMO.kind/t 는 HUD·시트 호환용 거울이다.
export const EMO = { kind:null, t:-1, tone:1, source:null, slots:[] };
// 상태별 표정 게이트 — glare 의 GATE 와 별도다. 잠듦·밤은 0 (R4 이중 방어,
// [CON-02] 규칙 2: 소비자도 각자 막는다).
const EMO_GATE = { AWAKE:1, DROWSY:0.5, ASLEEP:0, NIGHT:0, MORNING:1 };
function legacyPayload(kind, tone, source) {
  return normalizeExpressionTrigger({
    kind: kind,
    tone: tone === undefined ? 1 : tone,
    source: source || 'system',
  });
}

export function exprTrigger(kind, tone, source) {
  const payload = typeof kind === 'object' ? normalizeExpressionTrigger(kind)
                                            : legacyPayload(kind, tone, source);
  if (!payload || !EMO_DEF[payload.kind] || !EMO_GATE[F.state]) return false;
  EMO.slots = emoTrigger(EMO.slots, payload.kind, payload.tone, payload.source);
  EMO.kind = payload.kind;
  EMO.t = 0;
  EMO.tone = payload.tone;
  EMO.source = payload.source;
  // startled 는 kind 기준으로 하드 블링크를 동반한다 — 원천(lux/play)에 따라 달라 보이지 않게([ANL-01b] 근인 8).
  // lux 경로는 발화 전에 이미 블링크를 걸어 두므로(F.blinkT ≥ 0) 여기서 중복되지 않는다.
  if (payload.kind === 'startled' && F.blinkT < 0) { F.blinkEnv = [0.045, 0, 0.045]; F.blinkT = 0; }
  // thinking 은 시선이 위로 간다 — 소리 시선과 같은 채널(GZ)을 쓰되 머묾을 길게. 상태 게이트는 gazeTo 가 건다.
  if (payload.kind === 'thinking') { const g = GAZE_GATE[F.state] || 0; GZ.tx = GAZE_MM * 0.35 * g; GZ.ty = -1.0 * g; GZ.hold = 1.6; }
  return true;
}

export function emitExpression(kind, tone, source) {
  const payload = typeof kind === 'object' ? normalizeExpressionTrigger(kind)
                                            : legacyPayload(kind, tone, source);
  if (!payload) return false;
  palBus.dispatchEvent(new CustomEvent('expr:trigger', { detail: payload }));
  return true;
}
// 버스 구독 — 발행은 T 파트(babble.js 등) 몫이고 여기는 소비뿐이다.
// kind 'note' 는 fx 레이어 소유라 흘려보낸다(fx.js 가 따로 구독한다).
palBus.addEventListener('expr:trigger', function (e) {
  const payload = normalizeExpressionTrigger(e.detail);
  if (payload && payload.kind !== 'note') exprTrigger(payload);
});

// ── 점진 졸림 + 꾸벅 [WO-01b-8] — [CON-02] mode:progress 의 연속 소비 ───────
//  졸림이 이진이면 5분이 보이지 않는다([ANL-01b] 근인 4). SLEEP 후보의 경과율 k(0~1)로 DROWSY 의
//  눈꺼풀·깜빡임·표류를 **연속 변조**한다 — 상태 전이는 없다([CON-01] 규칙 2). 꾸벅(nod)은 DROWSY 에서
//  천천히 더 감겼다 홱 뜨는 봉투 — 10m 에서 가장 강한 졸림 신호. ASLEEP·NIGHT 에서는 전부 무효.
export const DROWSE = { k:0, nodAt:Infinity, nodT:-1, prev:null };
palBus.addEventListener('mode:progress', function (e) {
  const d = e.detail || {};
  DROWSE.k = d.to === 'SLEEP' && d.need > 0 ? clamp(d.elapsed / d.need, 0, 1) : 0;
});
palBus.addEventListener('mode:change', function () { DROWSE.k = 0; });
// 꾸벅 봉투 — 천천히 감김(1.1s, 부드럽게) · 머묾(0.15) · 홱 뜸(0.25). 음수 = 끝.
export function nodAmt(t) {
  if (t < 1.1) { const u = t / 1.1; return u * u * (3 - 2 * u); }
  if (t < 1.25) return 1;
  if (t < 1.5) return 1 - (t - 1.25) / 0.25;
  return -1;
}
function tickNod(t, dt) {
  if (F.state !== DROWSE.prev) {           // 상태 진입 — DROWSY 면 첫 꾸벅 예약, 아니면 무효
    DROWSE.prev = F.state; DROWSE.nodT = -1;
    DROWSE.nodAt = F.state === 'DROWSY' ? t + rand(8, 16) : Infinity;
  }
  if (F.state !== 'DROWSY') return 0;
  if (DROWSE.nodT < 0 && t >= DROWSE.nodAt) DROWSE.nodT = 0;
  if (DROWSE.nodT < 0) return 0;
  DROWSE.nodT += dt;
  const a = nodAmt(DROWSE.nodT);
  if (a < 0) { DROWSE.nodT = -1; DROWSE.nodAt = t + rand(12, 20) * (1 - 0.5 * DROWSE.k); return 0; }
  return a;
}

// ── 시선 — 소리 나는 쪽을 본다 [WO-01b-6] ──────────────────────
//  사카드: 홱 가서(τ 0.05) 잠깐 머물고, 느긋하게 돌아온다(τ 0.45).
//  두 시상수의 비대칭이 여기서도 핵심이다 — 대칭이면 슬라이더처럼 미끄러진다.
//  방향을 모르면(모노 마이크 · 균형 0) 정면을 살짝 올려다본다 — "누구지?".
export const GZ = { x:0, y:0, tx:0, ty:0, hold:0 };
const GAZE_GATE = { AWAKE:1, DROWSY:0.3, ASLEEP:0, NIGHT:0, MORNING:0.6 };
export const GAZE_MM = 3.0;               // 최대 이동(mm) — 좌우 여백 16.5 안
export function gazeTo(dir) {             // dir -1(왼) ~ +1(오른), 0 = 정면
  const g = GAZE_GATE[F.state];
  if (!g) return;                          // 잠듦·밤 무시 (R4 이중 방어)
  const d = clamp(dir, -1, 1);
  GZ.tx = GAZE_MM * d * g;
  GZ.ty = (Math.abs(d) < 0.05 ? -0.6 : -0.2) * g;
  GZ.hold = 0.9 + 0.4 * Math.abs(d);
}

// 표정 채널 계산. ⛔ R4 게이트가 이 함수 최상단에 있다.
export function expression(t, dt) {
  if (F.state === 'NIGHT') {          // 밤에는 아무것도 하지 않는다 (R4)
    GL.now = 0; GL.flinch = -1; GL.relief = -1; GL.settle = 0; GL.release = 0;
    EMO.kind = null; EMO.t = -1; EMO.source = null; EMO.slots = []; // 진행 중이던 이산 표정도 버린다
    GZ.x = 0; GZ.y = 0; GZ.tx = 0; GZ.ty = 0; GZ.hold = 0;   // 시선도
    DROWSE.nodT = -1; DROWSE.prev = 'NIGHT';                  // 꾸벅도
    return null;                      // 계산 자체를 돌리지 않는다
  }
  // 시선 — 머무는 동안은 홱, 풀리면 느긋하게 중앙으로
  if (GZ.hold > 0) GZ.hold = Math.max(0, GZ.hold - dt);
  else { GZ.tx = 0; GZ.ty = 0; }
  GZ.x = smooth(GZ.x, GZ.tx, GZ.hold > 0 ? 0.05 : 0.45, dt);
  GZ.y = smooth(GZ.y, GZ.ty, GZ.hold > 0 ? 0.05 : 0.45, dt);
  // 이산 표정 — 다중 슬롯 합성(emotion-core). 채널로만 살고, 전부 끝나면 0 으로 돌아온다.
  EMO.slots = emoAdvance(EMO.slots, dt);
  const M = emoMix(EMO.slots, EMO_GATE[F.state]);
  EMO.kind = M.kind; EMO.source = M.source; EMO.t = M.kind ? EMO.t + dt : -1;
  const eLow = M.ch.low, eHL = 1 + M.ch.hL, eHR = 1 + M.ch.hR, eTilt = M.ch.tilt, eCurve = M.ch.curve,
        eOpen = M.ch.open, eAmt = M.amt, eLid = M.ch.lid, eHead = M.ch.head;
  // 점진 졸림·꾸벅 [WO-01b-8] — DROWSY 에서만 값이 있다
  const nod = tickNod(t, dt);
  const k = F.state === 'DROWSY' ? DROWSE.k : 0;
  // 눈부심 — 비대칭 평활. 올라갈 때는 즉각, 내려올 때는 천천히.
  // 단, 안도가 연 창 안에서는 *놓아주는* 짧은 시상수를 쓴다 — 빛이 진 것에
  // 대한 반응으로 눈이 다시 떠져야 하기 때문이다. 창 밖의 이완은 예전 그대로다.
  const gate = GATE[F.state];
  if (GL.release > 0) GL.release = Math.max(0, GL.release - dt);
  const tauFall = GL.release > 0 ? TAU_RELEASE : TAU_DOWN;
  GL.now = smooth(GL.now, GL.raw, GL.raw > GL.now ? TAU_UP : tauFall, dt);

  // 움찔 — 정상치보다 과하게 찡그렸다가 정착한다
  let over = 0;
  if (GL.flinch >= 0) {
    GL.flinch += dt;
    if (GL.flinch > 0.8) GL.flinch = -1;
    else over = 0.25 * Math.exp(-GL.flinch / 0.25);
  }
  // 안도 — 눈이 5% 가라앉는다
  if (GL.relief >= 0) { GL.relief += dt; GL.settle = 1; if (GL.relief > 0.3) GL.relief = -1; }
  GL.settle = smooth(GL.settle, 0, 6.0, dt);

  const g = clamp((GL.now + over) * gate, 0, 1.25);
  const breathT = BREATH[F.state] ? Math.sin(2 * Math.PI * (t - F.stateAt) / BREATH[F.state]) : 0;
  const amp = BREATH_AMP[F.state] || 0;

  // 미세 표류 — 완전히 정지한 눈은 죽은 눈이다. 두 눈이 함께 움직인다.
  // DROWSY 도 표류한다(0.3, 졸릴수록 줄어든다) — 반쯤 감긴 채 정지하면 그게 죽은 눈이다([ANL-01b] 근인 2).
  const drift = (F.state === 'AWAKE' ? 1 : F.state === 'MORNING' ? 0.6 : F.state === 'DROWSY' ? 0.3 * (1 - 0.5 * k) : 0);
  return {
    g: g,
    h:  EYE.h * (1 - 0.62 * g) * (1 + amp * breathT),
    cy: EYE.cy - 1.5 * g,
    tilt: 7 * g,                                   // 안쪽 끝을 내린다 = 찡그림
    dx: drift * 0.4 * (Math.sin(t * 0.41) * 0.6 + Math.sin(t * 0.27 + 1.3) * 0.4),
    dy: drift * 0.4 * (Math.sin(t * 0.33 + 2.1) * 0.6 + Math.sin(t * 0.19 + 0.7) * 0.4) + 1.5 * nod,
    settle: GL.settle,
    breath: breathT,
    breathMm: EYE.h * amp * breathT,               // 감긴 눈 곡선도 같은 mm 로 오르내린다 [WO-01b-9]
    // 졸림 연속 변조 [WO-01b-8] — 윗꺼풀 추가 처짐(점진 k + 꾸벅) · 감정 윗꺼풀(sad)도 여기에 합쳐진다
    lidE: clamp(0.2 * k + 0.35 * nod + eLid, 0, 1),
    nod: nod, k: k,
    head: eHead,            // 두 눈 공통 기울기(°, 고개 갸웃 — curious) [WO-01b-10]
    // 잠듦에서는 눈을 다시 뜨지 않는다 — 미세한 떨림만 남긴다
    tremor: (F.state === 'ASLEEP' ? Math.sin(t * 17) * 0.25 * GL.now : 0),
    // ── 이산 표정 채널 [WO-01b-5] — 전부 0 이면 위와 픽셀 단위로 동일 ──
    lowLid: eLow,           // 아래꺼풀 올림 0~1 (웃는 눈 ⌣)
    hMul: [eHL, eHR],       // 좌우 독립 높이 배율 (호기심)
    tiltE: eTilt,           // 감정 기울기 — glare tilt 에 *더해진다*. 음수 = 바깥 처짐
    mCurve: eCurve,         // 입꼬리 목표 가감 (mouth.js 가 소비)
    mOpen: eOpen,           // 입 벌림 목표 (mouth.js 가 소비)
    emo: EMO.kind, emoAmt: eAmt, emoSource: EMO.source,
    gx: GZ.x, gy: GZ.y,     // 시선 — 두 눈이 함께 이동한다 [WO-01b-6]
  };
}
