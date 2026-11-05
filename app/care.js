// care.js — 케어 문장 띠 [WO-01c-1] (앱=통역사 층, [PLAN-01c])
//  눈 아래, **입 아래** 띠 하나에 한 줄 문장만. #faceScreen 바깥의 형제라 얼굴 문자 0 이 유지된다(R3).
//  상시 표시하지 않는다([PLAN-01c]) — 문장이 바뀔 때만 SHOW_S 초 떠올랐다 사라진다.
//  ⛔ R4 — NIGHT 에서는 careLine() 이 null 이고, 띠도 즉시 사라진다(이중 방어).
//  dev HUD 가 켜져 있으면 띠를 양보한다(같은 자리).
'use strict';
import { $, clamp, palBus } from './core.js';
import { F, VB, getScreenWmm } from './face/eyes.js';
import { MODE, canSee } from './mode.js';
import { careLine, LINES, lintLine } from './care-core.mjs';
export { careLine, LINES, lintLine };

export const SHOW_S = 4.5;          // 떠 있는 시간(초)
const MOUTH_SAFE = 68;              // 입(63.5~66mm)이 닿을 수 있는 최대 y(mm) — 띠는 그 아래만

export const CARE = { line: null, shownAt: 0, visible: false };

function context() {
  const p = MODE.progress;
  return {
    eye: F.state, mode: MODE.mode, candidate: p ? p.to : null,
    canSee: canSee(),
    dark: MODE.lux === null ? null : MODE.lux < MODE.params.darkLux,
    noisy: MODE.snd === null ? null : MODE.snd > MODE.params.noiseLevel,
    night: MODE.night,
    portrait: window.innerHeight > window.innerWidth,
  };
}

function layout(el) {
  const vw = window.innerWidth, vh = window.innerHeight;
  if (!(vw > 0)) return;
  const pxPerMm = vw / getScreenWmm();
  const top = Math.min(vh - 14, (VB.dy + MOUTH_SAFE) * pxPerMm);
  const avail = Math.max(0, vh - top);
  el.style.height = avail + 'px';
  el.style.fontSize = clamp(avail * 0.5, 11, 15).toFixed(1) + 'px';
}

let timer = null, hideAt = 0;
function show(el, line) {
  CARE.line = line; CARE.shownAt = performance.now() / 1000; CARE.visible = true;
  el.textContent = line;
  layout(el);
  el.classList.add('on');
  hideAt = CARE.shownAt + SHOW_S;
}
function hide(el) { CARE.visible = false; el.classList.remove('on'); }

// 1Hz — 센서 틱(200ms)보다 느려도 된다. 문장은 사람이 읽는 속도로 바뀌면 충분하다.
function tick() {
  const el = $('care');
  if (!el) return;
  const onFace = $('faceScreen').classList.contains('on');
  const hudOn = $('hud').classList.contains('on');          // dev HUD 가 실제로 띠를 차지할 때만 양보
  const line = (onFace && !hudOn) ? careLine(context()) : null;
  // 린트를 통과한 문장만 출력한다 — LLM 이 다듬은 문장이 들어와도 같은 문이다(R2·R6)
  const ok = line && lintLine(line).length === 0 ? line : null;
  if (ok !== CARE.line) {
    if (ok) show(el, ok); else { CARE.line = null; hide(el); }
    return;
  }
  if (CARE.visible && performance.now() / 1000 >= hideAt) hide(el);
}

export function initCare() {
  if (timer) return;
  timer = setInterval(tick, 1000);
  palBus.addEventListener('mode:change', tick);     // 전이는 기다리지 않고 바로 말한다
  addEventListener('resize', function () { if (CARE.visible) layout($('care')); });
}

// 검사용 — 즉시 평가
export function _careTick() { tick(); }
