// hud.js — 계측·dev 표면: 디버그 계기판 + 표정 HUD (02a 소유 · dev 전용)
//  디버그 화면은 얼굴을 *대체*하고(R3), HUD 는 눈 아래 띠에만 겹친다.
//  ⛔ R4 — NIGHT 에서는 devMode 와 무관하게 강제로 꺼진다.
'use strict';
import { $, clamp, logLines, now, qs, setLogHook } from './core.js';
import { F, VB, getScreenWmm, show } from './face/eyes.js';
import { GATE, GL, TAU_DOWN, TAU_RELEASE } from './face/expression.js';
import { camOn, lux } from './lux.js';
import { bleStatus, DEVICE_PREFIX } from './ble.js';

// BUILD 문자열은 index.html 에 산다([ADR-116] — deploy.js 가 거기서 grep 한다).
// 계기판·HUD 는 부팅 때 주입받는다.
let BUILD = 'dev';
export const setBuild = (b) => { BUILD = b; };

// 로그가 쌓일 때 디버그 화면이 켜져 있으면 즉시 다시 그린다(원래 log() 의 동작).
setLogHook(function () { if ($('dbgScreen').classList.contains('on')) paintDebug(); });

export function paintDebug() {
  const b = bleStatus();
  const conn = b.connected ? '연결됨 ' + b.name
             : b.normalEnd ? '정상 종료 (System OFF)' : '미연결';
  // ── 살아 있는가 — age 가 유일하게 확실한 답이다 ──────────
  const age = lux.at === null ? null : now() - lux.at;
  $('luxBig').textContent = lux.last === null ? '—' : lux.last;
  const ae = $('ageBig');
  ae.textContent = age === null ? 'age —  수신 없음'
                 : 'age ' + age.toFixed(2) + 's   n=' + lux.count + '   src=' + lux.src;
  ae.className = 'age' + (age === null || age > 1.0 ? ' stale' : '');
  $('barRaw').style.width = (GL.raw * 100).toFixed(1) + '%';
  $('barNow').style.width = (GL.now * 100).toFixed(1) + '%';
  paintSpark();

  $('dbg').textContent =
    'ble      ' + conn + '  [' + DEVICE_PREFIX + ']\n' +
    'state    ' + F.state + '   gate ' + GATE[F.state] +
      (F.state === 'NIGHT' ? '   ⛔ R4 — 표정 계산 정지' : '') + '\n' +
    'lid      ' + F.lidNow.map(function (v) { return v.toFixed(2); }).join('  ') + '\n' +
    'lux      ' + (lux.last === null ? '-' : lux.last) +
      '   med ' + (lux.med === null ? '-' : lux.med) +
      // base 가 보여야 "raw 가 왜 0 인가"가 설명된다. 카메라에서는 base 가 신호를
      // 그대로 따라오므로 lux 와 base 가 나란히 붙어 움직인다 — 그게 원인이다.
      '   base ' + (lux.baseUsed === null ? '-' : lux.baseUsed) + (lux.hold !== null ? ' (고정)' : '') +
      '   창 ' + lux.recent.length + '표본/30s\n' +
    'camera   ' + (camOn() ? 'ON  평균휘도 ' + (lux.mean === null ? '-' : lux.mean.toFixed(1)) + '/255' : 'OFF') + '\n' +
    'glare    raw ' + GL.raw.toFixed(3) + '   now ' + GL.now.toFixed(3) +
      '   움찔 ' + (GL.flinch >= 0 ? GL.flinch.toFixed(2) : '-') +
      '   안도 ' + (GL.relief >= 0 ? GL.relief.toFixed(2) : '-') +
      '   settle ' + GL.settle.toFixed(2) +
      // 놓아줌 창 안이면 이완 시상수가 2.5 가 아니라 0.4 다
      '   놓아줌 ' + (GL.release > 0 ? GL.release.toFixed(2) + ' (τ ' + TAU_RELEASE + ')' : '- (τ ' + TAU_DOWN + ')') + '\n' +
    // 표정 레이어가 이번 프레임에 실제로 그린 값. NIGHT 이면 X 가 null 이다(R4).
    'expr     ' + (F.state === 'NIGHT' ? '⛔ 정지 (R4)'
      : 'g ' + (F.X ? F.X.g : 0).toFixed(3) +
        '  h ' + F.hNow.toFixed(2) + '  cy ' + F.cyNow.toFixed(2) +
        '  tilt ' + (F.X ? F.X.tilt : 0).toFixed(1) + '°') + '\n' +
    'micro    ' + (F.state === 'NIGHT' ? '-'
      : 'drift ' + (F.X ? F.X.dx : 0).toFixed(2) + '/' + (F.X ? F.X.dy : 0).toFixed(2) +
        '  breath ' + (F.X ? F.X.breath : 0).toFixed(2) +
        '  tremor ' + (F.X ? F.X.tremor : 0).toFixed(2) +
        '  blink ' + F.blinkNow.toFixed(2)) + '\n' +
    'hud      ' + (devMode ? 'ON — 얼굴 하단 띠' : 'OFF') + '   fps ' + F.fps.toFixed(0) + '\n' +
    'screen   ' + getScreenWmm().toFixed(1) + ' mm\n' +
    'build    ' + BUILD + '\n\n' +
    logLines(10).join('\n');
}

// 최근 30초 lux — 로그 스케일. 점선은 기준선(중앙값).
function paintSpark() {
  const c = $('spark'), g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  const R = lux.recent;
  if (!R.length) return;
  const t1 = now(), t0 = t1 - 30;
  const lg = function (v) { return Math.log((v + 1)) / Math.LN10; };
  let hi = 0;
  for (const s of R) hi = Math.max(hi, lg(s.v));
  hi = Math.max(hi, 1);
  const yOf = function (v) { return c.height - 3 - (lg(v) / hi) * (c.height - 6); };

  if (lux.med !== null) {                     // 기준선
    g.strokeStyle = '#7F8BA3'; g.lineWidth = 1; g.setLineDash([3, 3]);
    g.beginPath(); g.moveTo(0, yOf(lux.med)); g.lineTo(c.width, yOf(lux.med)); g.stroke();
    g.setLineDash([]);
  }
  g.strokeStyle = '#5B8CFF'; g.lineWidth = 1.6; g.beginPath();
  for (let i = 0; i < R.length; i++) {
    const x = (R[i].t - t0) / 30 * c.width;
    const y = yOf(R[i].v);
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.stroke();
  // 최신 표본에 점 — 오른쪽 끝에서 움직이면 살아 있는 것이다
  const lastR = R[R.length - 1];
  g.fillStyle = (t1 - lastR.t > 1.0) ? '#FF7A45' : '#39D98A';
  g.beginPath(); g.arc((lastR.t - t0) / 30 * c.width, yOf(lastR.v), 3, 0, 6.284); g.fill();
}

// ── 디버그 화면 전환 — 덮지 않고 대체한다 (R3) ─────────────────
let dbgTimer = null;
export function toggleDebug() {
  const on = $('dbgScreen').classList.contains('on');
  show(on ? 'faceScreen' : 'dbgScreen');
  if (!on) { paintDebug(); dbgTimer = setInterval(paintDebug, 100); }   // 10Hz
  else { clearInterval(dbgTimer); dbgTimer = null; }
}
export function openDev() {                // dev 버튼 — 대기 화면에서 바로
  show('dbgScreen');
  paintDebug();
  clearInterval(dbgTimer);
  dbgTimer = setInterval(paintDebug, 100);
}
export function closeDev() {
  clearInterval(dbgTimer); dbgTimer = null;
  // 대기 화면에서 dev 로 들어왔으면 대기 화면으로 돌아간다
  show($('faceScreen').dataset.seen ? 'faceScreen' : 'entryScreen');
}

// ═══ dev HUD — 얼굴을 보면서 표정 레이어를 읽는다 ═══════════════
//  왜 필요한가: 디버그 화면은 얼굴을 *대체*한다(R3). 그래서 지금까지는
//  숫자를 보거나 얼굴을 보거나 둘 중 하나였고, "카메라를 켰는데 아무
//  반응이 없다"가 *경로가 죽은 것*인지 *glare 가 정말 0 인 것*인지
//  구분할 방법이 없었다. HUD 는 그 둘을 한 화면에 놓는다.
//
//  R3 — 눈 바운딩박스 *아래* 띠에만 그린다. 띠의 위 경계는 CSS 상수가
//       아니라 매번 눈 기하에서 계산한다(EYE_SAFE).
//  R4 — NIGHT 이면 devMode 와 무관하게 강제로 꺼진다.
//  기본 OFF · sessionStorage — 탭을 닫으면 사라져 무대로 새지 않는다.
export const EYE_SAFE = 61;   // 눈이 닿을 수 있는 최대 y(mm). cy 36.5 + h/2 22.95 + 표류 0.4 ≈ 59.9
let devMode = sessionStorage.getItem('sp.dev') === '1' || qs.get('dev') === '1';
export const getDev = () => devMode;

export function setDev(on) {
  devMode = !!on;
  sessionStorage.setItem('sp.dev', devMode ? '1' : '0');
  $('dbgHud').textContent = devMode ? '표정 HUD 끄기' : '표정 HUD';
  if (!devMode) $('hud').classList.remove('on');
  paintHud();
}

const f2 = function (v, d) { return (v === null || v === undefined || !isFinite(v)) ? '—' : v.toFixed(d === undefined ? 2 : d); };
const sgn = function (v) { return (v >= 0 ? '+' : '') + f2(v); };

export function paintHud() {
  const hud = $('hud');
  // ⛔ R4 — 밤에는 화면에 아무것도 띄우지 않는다. dev 도 예외가 아니다.
  const live = devMode && F.state !== 'NIGHT' && $('faceScreen').classList.contains('on');
  hud.classList.toggle('on', live);
  if (!live) return;

  // 눈 아래 띠만 차지한다 — 눈에 1px 도 닿지 않는다 (R3)
  const vw = window.innerWidth, vh = window.innerHeight;
  if (vw > 0) {
    const pxPerMm = vw / getScreenWmm();
    const top = Math.min(vh - 8, (VB.dy + EYE_SAFE) * pxPerMm);
    const avail = Math.max(0, vh - top);
    hud.style.height = avail + 'px';
    // 내용 높이 ≈ 4줄 × 1.4em + 막대줄 1.2em + 세로 패딩 6px
    hud.style.fontSize = clamp((avail - 6) / 6.8, 7, 11).toFixed(1) + 'px';
  }

  const X = F.X, age = lux.at === null ? null : now() - lux.at;
  const stale = age === null || age > 1.0;
  const held = lux.hold !== null;

  $('hudRaw').style.width = (clamp(GL.raw, 0, 1) * 100).toFixed(1) + '%';
  $('hudNow').style.width = (clamp(GL.now, 0, 1) * 100).toFixed(1) + '%';

  $('hudTxt').innerHTML =
    '<span class="hi">' + F.state + '</span> gate ' + f2(GATE[F.state]) +
      '   src ' + lux.src +
      '   <span class="' + (stale ? 'warn' : 'ok') + '">age ' +
      (age === null ? '— 수신없음' : f2(age) + 's') + ' n=' + lux.count + '</span>' +
      '   fps ' + f2(F.fps, 0) + '   b' + BUILD.slice(-3) + '\n' +
    'lux ' + (lux.last === null ? '—' : lux.last) +
      '  base ' + (lux.baseUsed === null ? '—' : lux.baseUsed) + (held ? ' <span class="warn">고정</span>' : '') +
      '  raw ' + f2(GL.raw, 3) + '  now <span class="hi">' + f2(GL.now, 3) + '</span>' +
      (camOn() ? '  cam ' + f2(lux.mean, 1) + '/255' : '') + '\n' +
    'g ' + f2(X ? X.g : 0, 3) +
      '  h <span class="hi">' + f2(F.hNow) + '</span>' +
      '  cy ' + f2(F.cyNow) +
      '  tilt ' + f2(X ? X.tilt : 0, 1) + '°' +
      '  lid ' + f2(F.lidNow[0]) + '/' + f2(F.lidNow[1]) +
      '  blk ' + f2(F.blinkNow) + '\n' +
    'drift ' + sgn(X ? X.dx : 0) + '/' + sgn(X ? X.dy : 0) +
      '  breath ' + sgn(X ? X.breath : 0) +
      '  settle ' + f2(X ? X.settle : 0) +
      '  tremor ' + sgn(X ? X.tremor : 0) +
      '  <span class="' + (GL.flinch >= 0 ? 'warn' : '') + '">움찔 ' + (GL.flinch >= 0 ? f2(GL.flinch) : '—') + '</span>' +
      '  <span class="' + (GL.relief >= 0 ? 'ok' : '') + '">안도 ' + (GL.relief >= 0 ? f2(GL.relief) : '—') + '</span>' +
      '  <span class="' + (GL.release > 0 ? 'ok' : '') + '">놓아줌 ' + (GL.release > 0 ? f2(GL.release) : '—') + '</span>';
}
