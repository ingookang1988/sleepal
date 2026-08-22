// face/eyes.js — 눈 기하·상태·화면 전환 (파트 H 소유)
// 규범 [ARCH-01] R3 — 눈 영역에 문자가 없다. 도면 [DOM-01] §2.
'use strict';
import { $, log, now, rand } from '../core.js';

// ── 상태 팔레트 ────────────────────────────────────────────────
// 색은 전부 잠정치다. 이 화면은 최종적으로 *트레이싱지 뒤에서*
// 보인다. 확산지가 색을 따뜻하게 밀고 휘도를 깎으므로 진짜 튜닝은
// [WO-01d-3] 조립 이후 확산지를 통해 봐야 한다.
export const STATES = {
  AWAKE:   { bg:'#0A0D14', eye:'#EAEEF7', lid:0.00, dim:0.00, shut:false,
             blink:[3.0, 6.0], env:[0.06, 0.00, 0.06] },
  DROWSY:  { bg:'#33200A', eye:'#F3E2C2', lid:0.55, dim:0.15, shut:false,
             blink:[2.5, 4.0], env:[0.50, 0.25, 0.40] },
  ASLEEP:  { bg:'#05070A', eye:'#6E7686', lid:1.00, dim:0.35, shut:true,
             blink:null, env:null },
  NIGHT:   { bg:'#000000', eye:'#000000', lid:1.00, dim:0.60, shut:false,
             blink:null, env:null },
  MORNING: { bg:'#3B4664', eye:'#FFF6E6', lid:0.00, dim:0.00, shut:false,
             blink:[4.0, 7.0], env:[0.30, 0.10, 0.55] },
};
export const ORDER = ['AWAKE', 'DROWSY', 'ASLEEP', 'NIGHT', 'MORNING'];

// ── 얼굴 기하 (mm) — [DOM-01] §2 / [PLAN-01b] v0.2 ─────────────
export const EYE = { w:45, h:45, cy:36.5, cx:[39, 119] };
export const LID_H = 80;                     // 눈꺼풀 도형 높이(넉넉히)
export const VB = { dx:0, dy:0, hmm:73 };    // viewBox 오프셋 — 루프가 읽는다

// ── 한 프레임의 진실 ───────────────────────────────────────────
export const F = {
  state: 'AWAKE',
  lid: [0, 0],            // 상태가 정한 눈꺼풀 목표 (0 열림 ~ 1 감김)
  lidNow: [0, 0],         // 화면에 실제로 그려지는 값
  blinkAt: 0,             // 다음 깜빡임 시각(초)
  blinkT: -1,             // 진행 중인 깜빡임 경과(초). -1 = 없음
  blinkEnv: null,         // 이번 한 번만 쓸 봉투(움찔·안도가 넣는다)
  stateAt: 0,             // 상태 진입 시각 = [CON-01] 호흡 위상 0
  // ── 계측용 (렌더에 쓰이지 않는다) ──
  X: null,                // 마지막 프레임의 expression() 반환값. NIGHT 이면 null
  hNow: 0, cyNow: 0, blinkNow: 0, fps: 0, hudAt: 0,
};
export const ASYM = 1.04; // 두 눈꺼풀 높이가 정확히 같으면 기계다

let screenWmm = parseFloat(localStorage.getItem('sp.screenWmm')) || 158;
export const getScreenWmm = () => screenWmm;
export const setScreenWmm = (v) => { screenWmm = v; };

// ── 화면 전환 ──────────────────────────────────────────────────
export function show(which) {
  for (const s of ['entryScreen', 'faceScreen', 'calScreen', 'dbgScreen'])
    $(s).classList.toggle('on', s === which);
}

// ── viewBox 를 실측 화면 mm 로 맞춘다 ─────────────────────────
export function applyViewBox() {
  // 세로는 재지 않는다 — CSS 픽셀 종횡비에서 유도된다.
  // ⚠ 레이아웃 전에 불리면 innerWidth 가 0 이라 NaN 이 나온다. 그러면 SVG 속성이
  //   통째로 무효가 되어 얼굴이 사라진다 — 도면 비율(158:73)로 폴백한다.
  const vw = window.innerWidth, vh = window.innerHeight;
  const ratio = (vw > 0 && vh > 0) ? vh / vw : 73 / 158;
  const hmm = screenWmm * ratio;
  $('face').setAttribute('viewBox', '0 0 ' + screenWmm.toFixed(2) + ' ' + hmm.toFixed(2));
  // 눈은 화면 중앙 기준으로 놓는다(도면은 158x73 기준).
  // 눈의 transform 은 매 프레임 루프가 쓴다(표류·기울기와 합성해야 하므로).
  // 여기서는 오프셋만 넘겨준다.
  VB.dx = (screenWmm - 158) / 2;
  VB.dy = (hmm - 73) / 2;
  VB.hmm = hmm;
  window.__vb = VB;
}

// ── 상태 적용 ──────────────────────────────────────────────────
export function setEyeState(name) {
  if (!STATES[name] || name === F.state) return;
  const s = STATES[name];
  F.state = name;
  // 좌우 비대칭 — 반쯤 감긴 상태에서만 한쪽을 4% 더 내린다
  F.lid = (s.lid > 0 && s.lid < 1) ? [s.lid, Math.min(s.lid * ASYM, 1)] : [s.lid, s.lid];
  F.blinkT = -1;
  F.blinkEnv = null;
  F.stateAt = now();                    // [CON-01] 호흡 위상 0
  F.blinkAt = s.blink ? now() + rand(s.blink[0], s.blink[1]) : Infinity;

  document.body.style.backgroundColor = s.bg;
  $('dim').style.opacity = s.dim;
  for (const id of ['eyeL', 'eyeR']) {
    $(id).style.fill = s.eye;
    $(id).style.opacity = (s.shut || name === 'NIGHT') ? 0 : 1;
  }
  for (const id of ['shutL', 'shutR']) {
    $(id).style.stroke = s.eye;
    $(id).style.opacity = s.shut ? 1 : 0;
  }
  if (name === 'MORNING') stretch();
  log('state -> ' + name);
}

// ── 기지개 — 아침에 한 번 ──────────────────────────────────────
function stretch() {
  for (const id of ['eyeL', 'eyeR']) {
    const el = $(id);
    el.style.transformBox = 'fill-box';
    el.style.transformOrigin = 'center';
    if (el.animate) el.animate(
      [{ transform:'scaleY(1)' }, { transform:'scaleY(1.06)' }, { transform:'scaleY(1)' }],
      { duration:1200, easing:'ease-in-out' }
    );
  }
}

// ── 깜빡임 봉투 — 상태 눈꺼풀 위에 얹힌다(덮어쓰지 않는다) ────
export function blinkAmount(t, env) {
  const dn = env[0], hd = env[1], up = env[2];
  if (t < dn) return t / dn;
  if (t < dn + hd) return 1;
  if (t < dn + hd + up) return 1 - (t - dn - hd) / up;
  return -1;                                  // 끝났다는 신호
}

// 눈꺼풀 도형 — 아랫변이 곡선이다(가운데가 3mm 더 내려온다).
export function lidPath(cx, bottom) {
  const l = (cx - 30).toFixed(2), r = (cx + 30).toFixed(2), c = cx.toFixed(2);
  const top = (bottom - LID_H).toFixed(2);
  const side = (bottom - 2).toFixed(2), ctrl = (bottom + 4).toFixed(2);
  return 'M ' + l + ' ' + top + ' H ' + r + ' V ' + side +
         ' Q ' + c + ' ' + ctrl + ' ' + l + ' ' + side + ' Z';
}

// 아래꺼풀 — 위꺼풀의 거울. 윗변 가운데가 arch 만큼 *올라와* 눈 아래를
// ⌣ 로 깎는다. 웃는 눈은 위가 아니라 아래에서 만들어진다([WO-01b-5]).
// arch 는 올라온 양(0이면 평평)과 함께 준다 — 완전히 내려간 상태(top이
// 눈 바닥 아래)에서는 arch 도 0 에 수렴시켜 눈에 1px 도 닿지 않게 한다.
export function lowLidPath(cx, top, arch) {
  const l = (cx - 30).toFixed(2), r = (cx + 30).toFixed(2), c = cx.toFixed(2);
  const bottom = (top + LID_H).toFixed(2);
  const side = (top + 2).toFixed(2), ctrl = (top + 2 - arch).toFixed(2);
  return 'M ' + l + ' ' + bottom + ' H ' + r + ' V ' + side +
         ' Q ' + c + ' ' + ctrl + ' ' + l + ' ' + side + ' Z';
}
