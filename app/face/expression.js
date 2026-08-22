// face/expression.js — 표정 레이어 [WO-01b-4] (파트 H 소유)
//  상태(이산·보드 소유) 위에 표정(연속·환경 구동)을 *합성*한다.
//  [CON-01] 규칙 2 — 표정은 상태 전이를 절대 유발하지 않는다.
//  ⛔ [ARCH-01] R4 — 밤에는 계산 자체를 돌리지 않는다.
'use strict';
import { smooth, clamp } from '../core.js';
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

// 표정 채널 계산. ⛔ R4 게이트가 이 함수 최상단에 있다.
export function expression(t, dt) {
  if (F.state === 'NIGHT') {          // 밤에는 아무것도 하지 않는다 (R4)
    GL.now = 0; GL.flinch = -1; GL.relief = -1; GL.settle = 0; GL.release = 0;
    return null;                      // 계산 자체를 돌리지 않는다
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
  };
}
