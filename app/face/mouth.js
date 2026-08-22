// face/mouth.js — 입 렌더 [WO-01b-7] (파트 H 소유)
//  입은 표정의 *보조* 기관이다 — 10m 신호는 여전히 눈꺼풀이고([PLAN-01b] 목표),
//  입은 근거리(놀이·손에 든 상태)의 디테일이다.
//  R1 — 말하는 입모양(viseme)을 만들지 않는다: 이 파일의 입은 곡선 1개와
//       타원(하품·"후—") 1개뿐이고, 음소를 흉내내는 형태 변화가 없다.
//  ⛔ R4 — NIGHT 이면 계산 없이 숨긴다.
'use strict';
import { $, clamp, rand, smooth } from '../core.js';
import { F, STATES, VB } from './eyes.js';
import { GL } from './expression.js';

// 기하(mm) — 눈 최저점 59.9 + 여유. 곡선 끝점 y 63.5 · 하품 타원 중심 65.
// 화면 하단(73)까지: 하품 최대 ry 4 → 바닥 69. dev HUD 띠(EYE_SAFE 61 이하)와
// 겹치지만 HUD 는 dev 전용 오버레이라 무대에는 없다.
export const MOUTH = { cx: 79, y: 63.5, oy: 65 };
const M_STATE = {
  AWAKE:   { curve: 1.8, w: 20, op: 0.85 },
  DROWSY:  { curve: 0.8, w: 16, op: 0.65 },
  ASLEEP:  { curve: 0.6, w: 12, op: 0.28 },   // 옅게 — 감긴 눈 ⌣ 두 개와 겹치는 소음을 줄인다
  NIGHT:   { curve: 0,   w: 12, op: 0 },
  MORNING: { curve: 2.2, w: 20, op: 0.85 },
};

// 프레임 사이에 남는 것 — 하품 예약·봉투, 안도 "후—", 평활값
export const MM = {
  prev: null,
  yawnAt: Infinity, yawnT: -1,     // 하품 — 졸림에서 주기적으로, 아침에 한 번
  puffT: -1, reliefOn: false,      // 안도의 "후—" (relief 발화 엣지에서 한 번)
  curveNow: 0, wNow: 18, opNow: 0, openNow: 0,
};

// 하품 봉투 — 벌리고(0.7) · 머물고(0.5) · 다물고(0.8). 음수 = 끝.
function yawnAmt(t) {
  if (t < 0.7) return t / 0.7;
  if (t < 1.2) return 1;
  if (t < 2.0) return 1 - (t - 1.2) / 0.8;
  return -1;
}

export function tickMouth(t, dt, X) {
  const st = F.state;
  const path = $('mouth'), oval = $('mouthO');
  if (st === 'NIGHT' || !X) {                 // ⛔ R4 — 계산 없이 숨긴다
    path.setAttribute('opacity', '0');
    oval.setAttribute('opacity', '0');
    MM.yawnT = -1; MM.puffT = -1; MM.prev = st; MM.opNow = 0;
    return;
  }
  const P = M_STATE[st];

  // 상태 진입 — 하품 예약. 졸림은 주기적으로, 아침은 기지개와 함께 한 번.
  if (st !== MM.prev) {
    MM.prev = st;
    MM.yawnT = -1;
    MM.yawnAt = st === 'DROWSY' ? t + rand(6, 12)
              : st === 'MORNING' ? t + 0.6 : Infinity;
  }

  // 하품 진행
  let open = 0;
  if (MM.yawnT < 0 && t >= MM.yawnAt) MM.yawnT = 0;
  if (MM.yawnT >= 0) {
    MM.yawnT += dt;
    const a = yawnAmt(MM.yawnT);
    if (a < 0) {
      MM.yawnT = -1;
      MM.yawnAt = st === 'DROWSY' ? t + rand(14, 22) : Infinity;
    } else open = a;
  }
  // 안도의 "후—" — relief 발화 순간에 한 번, 작게 벌렸다 다문다
  if (GL.relief >= 0 && !MM.reliefOn) MM.puffT = 0;
  MM.reliefOn = GL.relief >= 0;
  if (MM.puffT >= 0) {
    MM.puffT += dt;
    if (MM.puffT > 0.6) MM.puffT = -1;
    else open = Math.max(open, 0.35 * Math.sin(Math.PI * MM.puffT / 0.6));
  }
  open = Math.max(open, X.mOpen);             // 호기심의 작은 'o'

  // 곡선 목표 — 상태 기본 + 감정(mCurve) − 눈부심(찡그릴 때 입도 다물린다)
  const g1 = clamp(X.g, 0, 1);
  MM.curveNow = smooth(MM.curveNow, P.curve + X.mCurve - 1.2 * g1, 0.35, dt);
  MM.wNow = smooth(MM.wNow, P.w * (1 - 0.25 * g1), 0.35, dt);
  MM.opNow = smooth(MM.opNow, P.op, 0.8, dt);
  MM.openNow = smooth(MM.openNow, open, 0.09, dt);

  // 렌더 — 곡선 입(닫힘)과 타원 입(벌림)을 크로스페이드.
  // 입은 표류(drift)를 절반만 따라간다 — 눈과 같은 얼굴에 붙어 있되 뻣뻣하지 않게.
  $('mouthG').setAttribute('transform', 'translate(' +
    (VB.dx + X.dx * 0.5).toFixed(2) + ' ' + (VB.dy + X.dy * 0.5).toFixed(2) + ')');
  const w = MM.wNow * (1 + 0.01 * X.breath);
  const l = (MOUTH.cx - w / 2).toFixed(2), r = (MOUTH.cx + w / 2).toFixed(2);
  path.setAttribute('d', 'M ' + l + ' ' + MOUTH.y + ' Q ' + MOUTH.cx + ' ' +
    (MOUTH.y + 2 * MM.curveNow).toFixed(2) + ' ' + r + ' ' + MOUTH.y);
  path.setAttribute('opacity', (MM.opNow * (1 - 0.9 * MM.openNow)).toFixed(3));
  path.style.stroke = STATES[st].eye;
  oval.setAttribute('cx', MOUTH.cx);
  oval.setAttribute('cy', MOUTH.oy);
  oval.setAttribute('rx', (2.2 + 1.3 * MM.openNow).toFixed(2));
  oval.setAttribute('ry', (4 * MM.openNow).toFixed(2));
  oval.setAttribute('opacity', (MM.opNow * MM.openNow).toFixed(3));
  oval.style.fill = STATES[st].eye;
}
