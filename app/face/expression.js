// face/expression.js — 표정 레이어 [WO-01b-4] (파트 H 소유)
//  상태(이산·보드 소유) 위에 표정(연속·환경 구동)을 *합성*한다.
//  [CON-01] 규칙 2 — 표정은 상태 전이를 절대 유발하지 않는다.
//  ⛔ [ARCH-01] R4 — 밤에는 계산 자체를 돌리지 않는다.
'use strict';
import { smooth, clamp, palBus } from '../core.js';
import { F, EYE } from './eyes.js';

// [CON-01] 호흡 주기. 보드의 후광과 같은 숫자를 써야 몸과 얼굴이 한 몸이 된다.
export const BREATH = { AWAKE:4.0, DROWSY:5.5, ASLEEP:6.5, NIGHT:0, MORNING:4.5 };
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

// ── 이산 표정 — [CON-02] expr:trigger 소비부 [WO-01b-7] ─────────
//  연속 채널(glare)과 달리 *사건*이다: 봉투 하나가 타고 끝나면 기하는
//  픽셀 단위로 원래대로 돌아온다. kind 어휘는 serve.js PAL_SYSTEM 의
//  emotion enum(happy·curious·sad)을 그대로 쓴다 — 새 어휘를 만들면 결함.
//  [CON-01] 규칙 2 — 트리거는 상태 전이를 절대 유발하지 않는다.
export const EMO = { kind:null, t:-1, tone:1 };
const EMO_DEF = {
  happy:   { dur:1.9, atk:0.28, rel:0.70 },   // 아래꺼풀 ⌣ + 입꼬리
  curious: { dur:1.6, atk:0.18, rel:0.50 },   // 한쪽 눈 확대 + 입 'o'
  sad:     { dur:2.6, atk:0.45, rel:1.00 },   // 눈꼬리 바깥 처짐 + 입꼬리 내림
};
// 상태별 표정 게이트 — glare 의 GATE 와 별도다. 잠듦·밤은 0 (R4 이중 방어,
// [CON-02] 규칙 2: 소비자도 각자 막는다).
const EMO_GATE = { AWAKE:1, DROWSY:0.5, ASLEEP:0, NIGHT:0, MORNING:1 };
const TONE = { soft:0.6, bright:1, drowsy:0.35 };   // babbleTone 문자열도 받는다

export function exprTrigger(kind, tone) {
  if (!EMO_DEF[kind] || !EMO_GATE[F.state]) return;
  EMO.kind = kind;
  EMO.t = 0;
  EMO.tone = typeof tone === 'string' ? (TONE[tone] || 1) : (tone === undefined ? 1 : clamp(tone, 0, 1));
}
// 버스 구독 — 발행은 T 파트(babble.js 등) 몫이고 여기는 소비뿐이다.
// kind 'note' 는 fx 레이어 소유라 흘려보낸다(fx.js 가 따로 구독한다).
palBus.addEventListener('expr:trigger', function (e) {
  const d = e.detail || {};
  if (d.kind !== 'note') exprTrigger(d.kind, d.tone);
});

// 봉투 — 오르고(atk) · 머물고 · 풀린다(rel). 음수 = 끝.
function emoAmt(d, t) {
  if (t < d.atk) return t / d.atk;
  if (t < d.dur - d.rel) return 1;
  if (t < d.dur) return 1 - (t - (d.dur - d.rel)) / d.rel;
  return -1;
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
    EMO.kind = null; EMO.t = -1;      // 진행 중이던 이산 표정도 버린다
    GZ.x = 0; GZ.y = 0; GZ.tx = 0; GZ.ty = 0; GZ.hold = 0;   // 시선도
    return null;                      // 계산 자체를 돌리지 않는다
  }
  // 시선 — 머무는 동안은 홱, 풀리면 느긋하게 중앙으로
  if (GZ.hold > 0) GZ.hold = Math.max(0, GZ.hold - dt);
  else { GZ.tx = 0; GZ.ty = 0; }
  GZ.x = smooth(GZ.x, GZ.tx, GZ.hold > 0 ? 0.05 : 0.45, dt);
  GZ.y = smooth(GZ.y, GZ.ty, GZ.hold > 0 ? 0.05 : 0.45, dt);
  // 이산 표정 봉투 — 채널로만 산다. 끝나면 전부 0 으로 돌아온다.
  let eLow = 0, eHL = 1, eHR = 1, eTilt = 0, eCurve = 0, eOpen = 0, eAmt = 0;
  if (EMO.t >= 0) {
    EMO.t += dt;
    const d = EMO_DEF[EMO.kind];
    const a0 = emoAmt(d, EMO.t);
    if (a0 < 0) { EMO.kind = null; EMO.t = -1; }
    else {
      const a = a0 * EMO_GATE[F.state] * (0.55 + 0.45 * EMO.tone);
      eAmt = a;
      if (EMO.kind === 'happy') { eLow = 0.62 * a; eCurve = 1.8 * a; }
      else if (EMO.kind === 'curious') { eHL = 1 + 0.06 * a; eHR = 1 - 0.08 * a; eOpen = 0.22 * a; }
      else if (EMO.kind === 'sad') { eTilt = -5 * a; eLow = 0.12 * a; eCurve = -2.6 * a; }
    }
  }
  // 아침 포즈 [WO-01b-5] — AWAKE 와 흑백 정지 화면에서도 갈리는 상시 자세:
  // 눈이 5% 크고 아래꺼풀이 잔잔한 ⌣(0.15)로 올라와 있다. "막 일어나 기분
  // 좋은 눈". 색을 지워도([WO-02b-3] 흑백 시트) 형태가 다르다.
  if (F.state === 'MORNING') {
    eLow = Math.max(eLow, 0.15);
    eHL *= 1.05; eHR *= 1.05;
  }
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

  // 미세 표류 — 완전히 정지한 눈은 죽은 눈이다. 두 눈이 함께 움직인다.
  const drift = (F.state === 'AWAKE' ? 1 : F.state === 'MORNING' ? 0.6 : 0);
  return {
    g: g,
    h:  EYE.h * (1 - 0.62 * g) * (1 + 0.02 * breathT),
    cy: EYE.cy - 1.5 * g,
    tilt: 7 * g,                                   // 안쪽 끝을 내린다 = 찡그림
    dx: drift * 0.4 * (Math.sin(t * 0.41) * 0.6 + Math.sin(t * 0.27 + 1.3) * 0.4),
    dy: drift * 0.4 * (Math.sin(t * 0.33 + 2.1) * 0.6 + Math.sin(t * 0.19 + 0.7) * 0.4),
    settle: GL.settle,
    breath: breathT,
    // 잠듦에서는 눈을 다시 뜨지 않는다 — 미세한 떨림만 남긴다
    tremor: (F.state === 'ASLEEP' ? Math.sin(t * 17) * 0.25 * GL.now : 0),
    // ── 이산 표정 채널 [WO-01b-7] — 전부 0 이면 위와 픽셀 단위로 동일 ──
    lowLid: eLow,           // 아래꺼풀 올림 0~1 (웃는 눈 ⌣)
    hMul: [eHL, eHR],       // 좌우 독립 높이 배율 (호기심)
    tiltE: eTilt,           // 감정 기울기 — glare tilt 에 *더해진다*. 음수 = 바깥 처짐
    mCurve: eCurve,         // 입꼬리 목표 가감 (mouth.js 가 소비)
    mOpen: eOpen,           // 입 벌림 목표 (mouth.js 가 소비)
    emo: EMO.kind, emoAmt: eAmt,
    gx: GZ.x, gy: GZ.y,     // 시선 — 두 눈이 함께 이동한다 [WO-01b-6]
  };
}
