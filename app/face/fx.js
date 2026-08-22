// face/fx.js — 떠다니는 도상: 잠듦 zzz · 음표 [WO-01b-5] (파트 H 소유)
//  ⚠ R3 해석([ADR-119]) — zzz 는 읽는 텍스트가 아니라 만화 도상(수면 기호)이고,
//    <text> 가 아니라 <path>/<use> 로만 그린다. 눈 영역과의 교차 0 은 시트가 지킨다.
//    zzz 는 오른눈 오른쪽 여백(x≥143), 음표는 두 눈 사이 회랑(x 66~92)에서만 산다.
//  ⛔ R4 — NIGHT 진입 즉시 전부 제거하고 스폰하지 않는다.
'use strict';
import { $, clamp, palBus, rand } from '../core.js';
import { F, STATES, VB } from './eyes.js';

const NS = 'http://www.w3.org/2000/svg';
export const FX = { alive: [], music: false, nextZ: 0, nextNote: 0 };
const LIFE = { z: 4.5, note: 3.6 };

function spawn(kind, x, y) {
  const el = document.createElementNS(NS, 'use');
  el.setAttribute('href', kind === 'z' ? '#fxZ' : '#fxN');
  const col = STATES[F.state].eye;
  el.setAttribute('stroke', col);
  el.setAttribute('fill', col);
  el.setAttribute('opacity', '0');
  $('fx').appendChild(el);
  FX.alive.push({ el: el, kind: kind, x: x, y: y, t: 0, ph: rand(0, 6.28), spin: rand(-12, 12) });
}

// 음표 1개 — 지금은 디버그·데모 경로뿐이고, 음악 재생([WO-02c-1])이 붙으면
// 사운드 파트가 [CON-02] expr:trigger {kind:'note'} 로 이 함수를 때린다.
export function fxNote() {
  if (F.state === 'NIGHT') return;                       // ⛔ R4
  spawn('note', 79 + rand(-9, 9), 61);
}
export function setMusic(on) { FX.music = !!on; }
palBus.addEventListener('expr:trigger', function (e) {
  if (e.detail && e.detail.kind === 'note') fxNote();
});

export function tickFx(t, dt) {
  if (F.state === 'NIGHT') {                             // ⛔ R4 — 즉시 전부 제거
    if (FX.alive.length) {
      for (const p of FX.alive) p.el.remove();
      FX.alive.length = 0;
    }
    return;
  }
  // 잠듦 — zzz 가 오른눈 오른쪽에서 피어오른다. 동시 3개까지.
  if (F.state === 'ASLEEP' && t >= FX.nextZ) {
    FX.nextZ = t + rand(2.6, 4.2);
    let nz = 0;
    for (const p of FX.alive) if (p.kind === 'z') nz++;
    if (nz < 3) spawn('z', 145 + rand(-1.5, 1.5), 15 + rand(-1, 1));
  }
  // 음악 재생 중 — 음표가 두 눈 사이 회랑을 타고 오른다
  if (FX.music && t >= FX.nextNote) {
    FX.nextNote = t + rand(0.9, 1.7);
    fxNote();
  }
  for (let i = FX.alive.length - 1; i >= 0; i--) {
    const p = FX.alive[i];
    p.t += dt;
    const u = p.t / LIFE[p.kind];
    if (u >= 1) { p.el.remove(); FX.alive.splice(i, 1); continue; }
    const rise = p.kind === 'z' ? 11 : 46;               // z 는 살짝, 음표는 회랑 관통
    const sway = Math.sin(p.t * 1.7 + p.ph) * (p.kind === 'z' ? 1.2 : 2.4);
    const drift = p.kind === 'z' ? 4 * u : 0;            // z 는 오른쪽으로 흘러간다
    const op = clamp(Math.min(u / 0.15, (1 - u) / 0.3), 0, 1) * (p.kind === 'z' ? 0.55 : 0.8);
    const sc = p.kind === 'z' ? 0.8 + 0.5 * u : 0.9 + 0.15 * Math.sin(p.t * 3 + p.ph);
    p.el.setAttribute('opacity', op.toFixed(3));
    p.el.setAttribute('transform', 'translate(' + (VB.dx + p.x + sway + drift).toFixed(2) + ' ' +
      (VB.dy + p.y - rise * u).toFixed(2) + ') scale(' + sc.toFixed(2) + ') rotate(' + (p.spin * u).toFixed(1) + ')');
  }
}
