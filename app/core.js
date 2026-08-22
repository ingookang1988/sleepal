// core.js — 셸 공용(02a 소유). 어디에도 의존하지 않는 최하층.
// 파트 경계는 파일 경계다([PLAN-02] §경계 1) — H·T 는 이 파일을 읽기만 한다.
'use strict';

export const $ = (id) => document.getElementById(id);
export const qs = new URLSearchParams(location.search);

export const smooth = (cur, tgt, tau, dt) => tgt + (cur - tgt) * Math.exp(-dt / tau);
export const rand = (a, b) => a + Math.random() * (b - a);
export const now = () => performance.now() / 1000;
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

// [CON-02] 런타임 모드 이벤트 버스 — T 파트(mode.js)가 발행하고 표정·사운드·
// 트래커가 구독한다. 모드는 mode.js 만 발행한다(계약 규칙 1).
export const palBus = new EventTarget();

// ── 로그 — 콘솔이 아니라 디버그 화면에만 (R3·R6) ─────────────────
//  디버그 화면 리페인트는 hud 가 훅으로 건다 — core 가 hud 를 알면 순환이 된다.
const LOG = [];
let onLog = null;
export const setLogHook = (fn) => { onLog = fn; };
export function log(msg) {
  LOG.push(new Date().toTimeString().slice(0, 8) + '  ' + msg);
  if (LOG.length > 40) LOG.shift();
  if (onLog) onLog();
}
export const logLines = (n) => LOG.slice(-n);
