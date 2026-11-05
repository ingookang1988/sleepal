// main.js — 셸: 단일 루프 + 배선 (02a 소유 · 변경은 리드 경유)
// 모듈 소유권([PLAN-02] §경계 1): H = face/ · ble.js · lux.js / T = mode.js ·
// tracker.js · sound.js / 셸 = 이 파일 · index.html · sw.js.
'use strict';
import { $, clamp, log, palBus, qs, rand, smooth } from './core.js';
import { applyViewBox, blinkAmount, EYE, F, getScreenWmm, lidPath, lowLidPath, ORDER,
         setEyeState, setScreenWmm, show, STATES, VB } from './face/eyes.js';
import { BREATH, EMO, emitExpression, expression, exprTrigger, GATE, GAZE_MM, gazeTo, GL, GZ,
         normalizeExpressionTrigger } from './face/expression.js';
import { tickMouth } from './face/mouth.js';
import { FX, fxNote, setMusic, tickFx } from './face/fx.js';
import { earBanned, earOn, earStart, earStop, feedSnd, snd, tickEar } from './face/ear.js';
import { camOn, camStart, camStop, feedLux, lux, simStep } from './lux.js';
import { _feedRaw, _reset, bleStatus, connect, DEVICE_PREFIX, handleLine, NUS,
         onDisconnect, onNotify, reconnect, RX, send, TX } from './ble.js';
import { closeDev, EYE_SAFE, getDev, openDev, paintDebug, paintHud, setBuild,
         setDev, toggleDebug } from './hud.js';
// ── T 파트 등록 지점 ([PLAN-02] §경계 1 · [CON-02]) ─────────────
//  mode.js / tracker.js / sound.js 는 여기서 import 되어 palBus 로 만난다 —
//  index.html 은 건드리지 않는다. 모드 발행은 mode.js 만([CON-02] 규칙 1).
import { _machine, _modeFeed, canSee, initMode, MODE, modeCommand, modeParams, modeStart, senseQuery, senseStart } from './mode.js';
// 앱(통역사) 층 — 케어 문장 띠 [WO-01c-1]. 눈은 상태를, 이 띠는 이유를 말한다.
import { _careTick, CARE, careLine, initCare, LINES, lintLine } from './care.js';
//    import { initTracker } from './tracker.js'; initTracker(palBus);
//    import { initSound } from './sound.js';     initSound(palBus);
// H 소비자 — 보드 미연결 시 모드 → 눈 상태 유도([CON-02] 규칙 4). 구독만 하므로 import 로 충분하다.
import { _nightNow, EYE_FOR_MODE, eyeForMode, NIGHT_AFTER_S } from './face/mode-eyes.js';

// ── 단일 루프 — 라이브러리 0 ([PLAN-01b] 제약) ────────────────
let last = 0, rafOff = false;   // rafOff: 검사에서 루프를 손으로 밟을 때만 true
function frame(ts) {
  const t = ts / 1000;
  // ⚠ dt 는 아래를 반드시 0 에서 막아야 한다. smooth() 는 exp(-dt/tau) 이므로
  //   dt < 0 이면 계수가 1 을 넘어 **목표에서 멀어지는 방향으로 증폭**한다 —
  //   수렴이 아니라 발산이고, 몇 프레임이면 GL.now 가 200 을 넘는다.
  //   그러면 g 가 영구히 1.25 에 붙어 **눈이 다시 떠지지 않는다.**
  //   위쪽 0.1 캡은 탭 복귀 시 한 프레임이 몇 초를 건너뛰는 것을 막는다.
  const dt = last ? clamp(t - last, 0, 0.1) : 0.016;
  last = t;
  const s = STATES[F.state];
  tickEar(t, dt);                 // 귀 — 시선 목표(GZ)를 갱신한다. R4 는 스스로 지킨다
  const X = expression(t, dt);

  // ── 깜빡임 ──────────────────────────────────────────────
  if (s.blink && F.blinkT < 0 && t >= F.blinkAt) F.blinkT = 0;
  let blink = 0;
  if (F.blinkT >= 0) {
    F.blinkT += dt;
    // 무거워지는 깜빡임 — 감기는 속도가 아니라 *뜨는* 속도를 늦춘다
    let env = F.blinkEnv || s.env;
    if (!F.blinkEnv && F.state === 'DROWSY') {
      env = [env[0], env[1], 0.40 + Math.min((t - F.stateAt) / 30, 1) * 0.35];
    }
    const a = blinkAmount(F.blinkT, env);
    if (a < 0) {
      F.blinkT = -1; F.blinkEnv = null;
      F.blinkAt = s.blink ? t + rand(s.blink[0], s.blink[1]) : Infinity;
    } else blink = a;
  }

  // ── 눈 기하 ─────────────────────────────────────────────
  const h  = X ? X.h  : EYE.h;
  const cy = X ? X.cy : EYE.cy;
  const rx = Math.min(EYE.w, h) / 2;
  const top = cy - h / 2;
  // 시선(gx·gy)은 표류와 합성된다 — 두 눈이 함께 이동해야 "본다"로 읽힌다
  const ox = VB.dx + (X ? X.dx + X.gx : 0), oy = VB.dy + (X ? X.dy + X.gy : 0);

  for (let i = 0; i < 2; i++) {
    F.lidNow[i] = smooth(F.lidNow[i], F.lid[i], 0.9, dt);
    const lid = clamp(Math.max(F.lidNow[i], blink) + (X ? X.settle * 0.05 : 0), 0, 1);
    // 좌우 독립 높이 배율 — 호기심이 한쪽 눈만 키운다 [WO-01b-5]
    const hi = h * (X ? X.hMul[i] : 1);
    const topI = cy - hi / 2;
    const eye = $(i ? 'eyeR' : 'eyeL');
    eye.setAttribute('y', topI.toFixed(2));
    eye.setAttribute('height', hi.toFixed(2));
    eye.setAttribute('rx', (Math.min(EYE.w, hi) / 2).toFixed(2));
    // 눈꺼풀은 *현재* 눈 높이를 따라간다 — 찡그린 눈에 맞춰 짧아진다
    $(i ? 'lidR' : 'lidL').setAttribute('d', lidPath(EYE.cx[i], topI + lid * hi));
    // 아래꺼풀 — 기쁨이 눈 아래를 ⌣ 로 깎는다. low=0 이면 눈 아래에 숨어 있고
    // arch 도 0 에 수렴해 눈에 닿지 않는다 [WO-01b-5]
    const low = X ? X.lowLid : 0;
    $(i ? 'lidR2' : 'lidL2').setAttribute('d',
      lowLidPath(EYE.cx[i], topI + hi + 5 - low * (hi * 0.6 + 5), 4.5 * low));
    // 기울기: 왼눈 +θ, 오른눈 −θ → 두 안쪽 끝이 내려간다.
    // 감정 기울기(tiltE)는 부호가 반대라 바깥 끝이 내려간다(서운함)
    const th = (X ? X.tilt + X.tiltE : 0) * (i ? -1 : 1);
    $(i ? 'tiltR' : 'tiltL').setAttribute('transform',
      'translate(' + ox.toFixed(2) + ' ' + oy.toFixed(2) + ') rotate(' +
      th.toFixed(2) + ' ' + EYE.cx[i] + ' ' + cy.toFixed(2) + ')');
  }
  // 입·fx — 각자 R4 를 스스로 집행한다(NIGHT 이면 숨김/제거)
  tickMouth(t, dt, X);
  tickFx(t, dt);
  // 감긴 눈은 호흡으로 오르내리고, 빛이 들면 떨린다
  const sy = VB.dy + (X ? X.breath * 0.3 + X.tremor : 0);
  $('shutG').setAttribute('transform', 'translate(' + VB.dx.toFixed(2) + ' ' + sy.toFixed(2) + ')');

  // ── 계측 — 이 프레임이 실제로 그린 값 ────────────────────
  //  expression() 의 반환값은 frame() 안에서 소비되고 사라진다.
  //  HUD·계기판이 읽을 수 있게 여기 남긴다. 렌더에는 영향이 없다.
  F.X = X; F.hNow = h; F.cyNow = cy; F.blinkNow = blink;
  F.fps = dt > 0 ? smooth(F.fps || 60, 1 / dt, 0.5, dt) : F.fps;
  if (t - F.hudAt >= 0.1) { F.hudAt = t; paintHud(); }   // 10Hz — 프레임마다 그리면 레이아웃이 튄다

  if (!rafOff) requestAnimationFrame(frame);
}

// ── 입장 — 전체화면 · 회전 잠금 · Wake Lock ───────────────────
let wakeLock = null;
async function enter() {
  try { await document.documentElement.requestFullscreen({ navigationUI:'hide' }); }
  catch (e) { log('전체화면 실패: ' + e.message); }
  try { await screen.orientation.lock('landscape'); }
  catch (e) { log('회전 잠금 실패: ' + e.message); }   // iOS Safari 미지원 — 죽지 않는다
  await requestWakeLock();
  show('faceScreen');
  applyViewBox();
  setEyeState('AWAKE');
  // 세션 시작 [WO-02d-1] — 사용자 제스처 안에서 조도계·마이크 권한을 묻고 PLAY 로.
  // 보드가 연결돼 있으면 카메라는 켜지 않는다(보드 LUX: 가 조도다).
  modeStart().catch(function (e) { log('모드 시작 실패: ' + e.message); });
  if (qs.get('demo') === '1') runDemo();
}
async function requestWakeLock() {
  try { wakeLock = await navigator.wakeLock.request('screen'); log('Wake Lock ON'); }
  catch (e) { log('Wake Lock 실패: ' + e.message); }
}
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'visible' && $('faceScreen').classList.contains('on')) requestWakeLock();
});

// ── 수동 전환 ──────────────────────────────────────────────────
//  데스크톱은 1~5. 폰은 두 손가락 탭 = 다음 상태, 세 손가락 = 디버그.
//  단일 탭은 전부 무시한다 — 몸통에 밀어 넣는 동안 손가락이 스친다.
addEventListener('keydown', function (e) {
  const i = '12345'.indexOf(e.key);
  if (i >= 0) setEyeState(ORDER[i]);
  else if (e.key === 'd') toggleDebug();
  else if (e.key === 'c') openCal();
  // 이산 표정·fx [WO-01b-5] — 6 기쁨 · 7 호기심 · 8 서운함 · 9 음표 · 0 음악 토글.
  // 전부 [CON-02] 버스를 태운다 — 직접 호출하면 계약 경로가 검증되지 않는다.
  else if (e.key === '6') emitTrigger('happy');
  else if (e.key === '7') emitTrigger('curious');
  else if (e.key === '8') emitTrigger('sad');
  else if (e.key === '9') emitTrigger('note');
  else if (e.key === '0') { setMusic(!FX.music); log('음악 fx ' + (FX.music ? 'ON' : 'OFF')); }
  // 시선 [WO-01b-6] — , 왼쪽 소리 · . 오른쪽 소리 · / 정면 소리 · m 마이크 토글
  else if (e.key === ',') feedSnd(0.6, -1);
  else if (e.key === '.') feedSnd(0.6, 1);
  else if (e.key === '/') feedSnd(0.6, 0);
  else if (e.key === 'm') { earOn() ? earStop() : earStart(); }
  // 모드 명령 [WO-02d-1] — q 놀이 · w 수면 환경 · e 수면 · r 기상. 전부 [CON-02] command 경로다.
  else if (e.key === 'q') modeCommand('play');
  else if (e.key === 'w') modeCommand('windDown');
  else if (e.key === 'e') modeCommand('sleep');
  else if (e.key === 'r') modeCommand('wake');
});
function emitTrigger(kind, tone) {
  emitExpression(kind, tone === undefined ? 1 : tone, 'system');
}
// ⛔ R4 — 밤에는 탭으로 아무것도 켜지지 않는다. 새벽에 폰을 더듬다 두 손가락이 스쳐 화면이 켜지면
//  이 제품이 막으려던 행동을 제품이 유발한다. 밤의 유일한 손 경로는 **두 손가락을 NIGHT_HOLD_MS 동안
//  누르는** 의도적 동작 → 기상(모드 명령). 세 손가락 디버그도 밤에는 잠긴다(데스크톱 키 d 는 dev 용).
export const NIGHT_HOLD_MS = 1500;
let nightHold = null;
function cancelNightHold() { if (nightHold) { clearTimeout(nightHold); nightHold = null; } }
$('faceScreen').addEventListener('touchstart', function (e) {
  if (F.state === 'NIGHT') {
    if (e.touches.length === 2 && !nightHold) {
      nightHold = setTimeout(function () {
        nightHold = null;
        log('밤 — 두 손가락 길게 → 기상');
        modeCommand('wake');
        if (F.state === 'NIGHT') setEyeState('MORNING');   // 보드 경로(모드 유도 비활성)에서도 손 경로는 깨운다
      }, NIGHT_HOLD_MS);
    }
    return;
  }
  cancelNightHold();
  if (e.touches.length === 2) setEyeState(ORDER[(ORDER.indexOf(F.state) + 1) % ORDER.length]);
  else if (e.touches.length === 3) toggleDebug();
}, { passive:true });
['touchend', 'touchcancel'].forEach(function (ev) { $('faceScreen').addEventListener(ev, cancelNightHold, { passive:true }); });

$('dbgClose').onclick   = closeDev;
// 폰이 몸통 안에 있을 때의 조작 경로. [CON-01] RX 메시지만 쓴다.
$('dbgConnect').onclick = function () {
  reconnect().then(paintDebug).catch(function (e) { log('재연결 실패: ' + e.message); });
};
$('dbgLedOn').onclick  = function () { send('LED:255'); };
$('dbgLedOff').onclick = function () { send('LED:0'); };
$('dbgWake').onclick   = function () { send('WAKE'); };

// 이산 표정 버튼 — 디버그 화면은 얼굴을 *대체*하므로(R3) 얼굴로 돌아간 뒤
// 트리거를 쏜다. 봉투가 2초 안에 끝나기 때문에 이 순서가 아니면 안 보인다.
function fireAndShow(kind) {
  closeDev();
  setTimeout(function () { emitTrigger(kind); }, 250);
}
$('dbgHappy').onclick   = function () { fireAndShow('happy'); };
$('dbgCurious').onclick = function () { fireAndShow('curious'); };
$('dbgSad').onclick     = function () { fireAndShow('sad'); };
$('dbgNote').onclick    = function () { fireAndShow('note'); };
$('dbgMusic').onclick   = function () {
  setMusic(!FX.music);
  $('dbgMusic').textContent = FX.music ? '♪ 음악 끄기' : '♪ 음악';
  if (FX.music) closeDev();
};

// 시선 대역 [WO-01b-6] — 합성 소리(feedSnd)와 마이크. 상태 전이는 없다.
function soundAndShow(bal) {
  closeDev();
  setTimeout(function () { feedSnd(0.6, bal); }, 250);
}
// 모드 대역 [WO-02d-1] — 명령 전이(cause command). 센서 전이는 5분이 걸리므로
// 데모·검사에서는 이 버튼이 유일한 즉시 경로다. 얼굴로 돌아가 결과를 보여준다.
function modeAndShow(cmd) { closeDev(); setTimeout(function () { modeCommand(cmd); }, 250); }
$('dbgModePlay').onclick  = function () { modeAndShow('play'); };
$('dbgModeWind').onclick  = function () { modeAndShow('windDown'); };
$('dbgModeSleep').onclick = function () { modeAndShow('sleep'); };
$('dbgModeWake').onclick  = function () { modeAndShow('wake'); };
$('dbgSndL').onclick = function () { soundAndShow(-1); };
$('dbgSndC').onclick = function () { soundAndShow(0); };
$('dbgSndR').onclick = function () { soundAndShow(1); };
$('dbgEar').onclick  = function () {
  // earStart 는 비동기(권한 대화상자) — 라벨은 결과가 난 뒤에 맞춘다
  const p = earOn() ? (earStop(), Promise.resolve()) : earStart();
  Promise.resolve(p).then(function () {
    $('dbgEar').textContent = earOn() ? '귀 끄기' : '귀 (마이크)';
    paintDebug();
  });
};

// ═══ 조도 대역 — 보드 없이 표정을 보기 위한 것 ═══════════════
//  셋 다 feedLux() 또는 GL.raw 로만 들어간다. 상태 전이는 어느 경로로도
//  일어나지 않는다([CON-01] 규칙 2).

// ① glare 슬라이더 — 상수 튜닝용. lux 체인을 건너뛰고 목표값을 직접 준다.
$('dbgGlare').oninput = function () {
  GL.raw = this.value / 100;
  $('dbgGlareV').textContent = GL.raw.toFixed(2);
  lux.src = 'slider — lux 우회';   // 이 경로는 lux 를 안 거치므로 age 는 멈춘다
};
// ② 불 켜기/끄기 — 체인 전체(기준선·움찔·안도)를 태운다
$('dbgLightOn').onclick  = function () { simStep(3, 500); };
$('dbgLightOff').onclick = function () { simStep(500, 3); };
// ③ 카메라 조도계 — R7 허용 용도만(lux.js)
$('dbgCam').onclick = function () { camOn() ? camStop() : camStart(); };
// ④ 표정 HUD — 얼굴 위 눈 아래 띠. 닫으면 얼굴로 돌아가므로 여기서 켜고 닫는다.
$('dbgHud').onclick = function () { setDev(!getDev()); paintDebug(); };
// ⑤ 기준선 고정 — 카메라 조도계를 쓸 때만 의미가 있다.
//    자동 노출이 평균 휘도를 붙들면 30초 롤링 중앙값이 신호를 그대로 따라와
//    base ≈ v 가 되고 glare 는 영원히 0 이다. 지금 중앙값에 base 를 묶으면
//    그 뒤의 변화가 raw 로 나타난다. **절대 조도가 생기는 것은 아니다** —
//    체인이 눈에 보이게 될 뿐이다. 보드 경로에서는 쓰지 않는다([ADR-103]).
$('dbgHold').onclick = function () {
  lux.hold = lux.hold === null ? (lux.med !== null ? lux.med : lux.last) : null;
  $('dbgHold').textContent = lux.hold === null ? '기준선 고정' : '기준선 풀기 (' + lux.hold + ')';
  log(lux.hold === null ? '기준선 고정 해제 — 롤링 중앙값으로' : '기준선 ' + lux.hold + ' 에 고정');
  paintDebug();
};

// ── 화면 보정 — 눈금바 100mm ──────────────────────────────────
function openCal() { show('calScreen'); paintRuler(); }
function paintRuler() {
  // 100mm 는 화면 가로의 (100 / screenWmm) 비율이다.
  $('ruler').style.width = (100 / getScreenWmm() * 100).toFixed(3) + '%';
  $('calVal').textContent = getScreenWmm().toFixed(1);
}
function bumpCal(d) { setScreenWmm(Math.max(80, Math.min(300, getScreenWmm() + d))); paintRuler(); }
$('calMinus').onclick  = function () { bumpCal(-1); };
$('calMinus5').onclick = function () { bumpCal(-0.2); };
$('calPlus5').onclick  = function () { bumpCal(0.2); };
$('calPlus').onclick   = function () { bumpCal(1); };
$('calDone').onclick   = function () {
  localStorage.setItem('sp.screenWmm', String(getScreenWmm()));
  applyViewBox();
  show($('faceScreen').dataset.seen ? 'faceScreen' : 'entryScreen');
};

// ── 폴백 데모 — BLE 가 죽어도 얼굴은 산다 ─────────────────────
//  무대에서 실수로 켜지지 않게 ?demo=1 뒤에 둔다.
function runDemo() {
  const seq = [['AWAKE', 20], ['DROWSY', 25], ['ASLEEP', 15], ['NIGHT', 0]];
  let acc = 0;
  for (const step of seq) {
    (function (st, at) { setTimeout(function () { setEyeState(st); }, at * 1000); })(step[0], acc);
    acc += step[1];
  }
  // 보드 없이 표정을 확인할 수 있어야 한다 — 리허설용 조도 시나리오.
  // 어두운 방(3) → 스탠드 켜짐(400) → 유지 → 다시 끔(3).
  demoLux([[0,3],[1,3],[2,3],[3,3],[4,3],[5,3],[6,400],[7,420],[8,410],[9,400],
           [10,400],[11,400],[12,3],[13,3],[14,3],
           [30,3],[31,600],[32,580],[33,3],[34,3]]);
  log('demo 모드 — 조도 시나리오 포함');
}
function demoLux(pairs) {
  for (const p of pairs) {
    (function (at, v) { setTimeout(function () { feedLux(v); }, at * 1000); })(p[0], p[1]);
  }
}

// ── 시작 화면 — 2단계 [WO-01c-1] ───────────────────────────────
//  1단계 "팰에게 방 보여주기": 사용자 제스처 안에서 카메라·마이크를 묻는다. 결과는 사실 문장으로.
//  2단계 "시작": 전체화면·회전 잠금·Wake Lock 은 또 다른 제스처가 필요하다 — 그래서 두 번 누른다.
//  두 단계를 한 탭에 몰면 전체화면 전환 직후 권한 대화상자가 겹쳐 거부되기 쉽다(UX 브리핑 1번).
function paintSense(s) {
  const note = $('senseNote'), bS = $('bSense'), bG = $('bStart');
  const cam = s.cam === true, mic = s.mic === true, asked = s.cam !== null || s.mic !== null;
  note.textContent =
    !asked        ? '팰이 아직 방을 볼 수 없어요 — 카메라로 밝기를, 마이크로 소리를 느껴요. 아무것도 저장하거나 보내지 않아요.'
    : cam && mic  ? '팰이 방을 볼 수 있고 소리도 들을 수 있어요.'
    : cam         ? '팰이 방을 볼 수 있어요 — 소리는 듣지 못해요.'
    : mic         ? '팰이 소리는 듣지만 방을 볼 수 없어요 — 밝기를 느끼지 못해요.'
    :               '팰이 방을 볼 수 없어요 — 그래도 눈은 떠요.';
  bS.textContent = !asked ? '팰에게 방 보여주기' : cam ? '팰이 방을 봐요' : '다시 보여주기';
  bS.disabled = cam;
  bS.classList.toggle('primary', !asked);
  bG.classList.toggle('primary', asked);
}
async function sense() {
  const bS = $('bSense');
  bS.disabled = true; bS.textContent = '팰이 방을 보는 중…';
  try { paintSense(await senseStart()); }
  catch (e) { log('감각 시작 실패: ' + e.message); paintSense(MODE.sensed); }
}

// ── 시작 ───────────────────────────────────────────────────────
export function boot(build) {
  setBuild(build);
  $('bSense').onclick   = sense;
  $('bStart').onclick   = function () { $('faceScreen').dataset.seen = '1'; enter(); };
  $('bCal').onclick     = openCal;
  $('bConnect').onclick = connect;
  $('bDev').onclick     = openDev;
  // dev 는 무대·제품 화면에 보이지 않는다 — ?dev=1 이나 이전 토글(세션)이 있을 때만
  $('bDev').style.display = getDev() ? '' : 'none';
  if (!navigator.bluetooth) {
    $('entryNote').textContent = '이 브라우저에서는 팰의 몸(후광)과 연결할 수 없어요 — 눈은 그대로 떠요.';
  }
  paintSense(MODE.sensed);
  senseQuery().then(paintSense).catch(function () {});
  addEventListener('resize', function () {
    if ($('faceScreen').classList.contains('on')) applyViewBox();
  });
  applyViewBox();
  paintRuler();
  setDev(getDev());       // 버튼 라벨 동기화. 기본 OFF — ?dev=1 이나 이전 토글이 있을 때만 ON
  initMode(palBus);       // [WO-02d-1] 모드 머신 — 200ms 타이머, rAF 와 독립(밤에도 센다)
  initCare();             // [WO-01c-1] 케어 문장 띠 — 1Hz, 문장이 바뀔 때만 잠깐
  requestAnimationFrame(frame);

  // 검증 훅 — 콘솔/헤드리스에서 호출한다 (R3 게이트 등)
  window.SP = {
    F: F, STATES: STATES, ORDER: ORDER,
    setEyeState: setEyeState, handleLine: handleLine, feedLux: feedLux,
    lux: lux, applyViewBox: applyViewBox, show: show,
    connect: connect, send: send, onNotify: onNotify, onDisconnect: onDisconnect,
    GL: GL, GATE: GATE, BREATH: BREATH, expression: expression, VB: VB,
    // [WO-01b-5] 이산 표정·입·fx — 시트 게이트가 읽는다
    EMO: EMO, emitExpression: emitExpression, exprTrigger: exprTrigger,
    normalizeExpressionTrigger: normalizeExpressionTrigger,
    FX: FX, fxNote: fxNote, setMusic: setMusic,
    // [WO-01b-6] 시선·귀 (+[ADR-121] 마이크 생애 정책)
    GZ: GZ, GAZE_MM: GAZE_MM, gazeTo: gazeTo, feedSnd: feedSnd, snd: snd,
    earStart: earStart, earStop: earStop, earBanned: earBanned,
    get earOn() { return earOn(); },
    // 계측 — HUD 검사가 읽는다
    paintHud: paintHud, setDev: setDev, EYE_SAFE: EYE_SAFE,
    get devMode() { return getDev(); },
    NUS: NUS, RX: RX, TX: TX, DEVICE_PREFIX: DEVICE_PREFIX,
    get screenWmm() { return getScreenWmm(); },
    get connected() { return bleStatus().connected; },
    get normalEnd() { return bleStatus().normalEnd; },
    get retries() { return bleStatus().retries; },
    // [CON-02] 버스 — 발행자 mode.js([WO-02d-1]) · 소비자 face/mode-eyes.js·ear.js·expression.js
    palBus: palBus,
    MODE: MODE, modeParams: modeParams, modeCommand: modeCommand, modeStart: modeStart,
    EYE_FOR_MODE: EYE_FOR_MODE, eyeForMode: eyeForMode, NIGHT_AFTER_S: NIGHT_AFTER_S,
    // 검사용 — 가상 시계로 핵에 먹인다 · 밤 타이머를 지금 적용한다
    _modeFeed: _modeFeed, _machine: _machine, _nightNow: _nightNow,
    // [WO-01c-1] 케어 문장 — 시트·게이트가 읽는다
    CARE: CARE, LINES: LINES, careLine: careLine, lintLine: lintLine, canSee: canSee,
    senseStart: senseStart, _careTick: _careTick,
    NIGHT_HOLD_MS: NIGHT_HOLD_MS,
    // 검사용 — 배관을 태우지 않고 라인 스트림만 흉내낸다
    _feedRaw: _feedRaw,
    // 검사용 — rAF 없이 루프를 결정적으로 밟는다(반응 곡선 측정)
    _step: function (ms) { rafOff = true; frame(ms); },
    _reset: _reset,
  };
}
