#!/usr/bin/env node
// scripts/expr-probe.js — 표정 동작 계측([ANL-01b]). Playwright 필요(레포 의존성 아님). 실행: node scripts/serve.js & node scripts/expr-probe.js
// 실제 app/index.html 을 SP._step 으로 결정적으로 밟으며 깜빡임·호흡·눈부심·이산 표정·겹침·게이트·시선·전이를 JSON 으로 낸다. CI 체인 밖.
const { chromium } = require('playwright');
const DT = 16.667;
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 780, height: 360 } })).newPage();
  await p.goto('http://127.0.0.1:5173/app/?nightS=99999', { waitUntil: 'networkidle' });
  await p.click('#bStart'); await p.waitForTimeout(400);
  // 샘플러: ms 동안 프레임을 밟고 프레임마다 읽는다
  const run = (ms, opts) => p.evaluate(([ms, DT, opts]) => {
    const out = []; let t = window.__t || 1000;
    for (let i = 0; i < Math.round(ms / DT); i++) {
      t += DT; SP._step(t);
      const X = SP.F.X || {};
      const eL = document.getElementById('eyeL'), lidL = document.getElementById('lidL');
      const mouth = document.getElementById('mouth').getAttribute('d'); const mo = document.getElementById('mouthO');
      out.push({ t: t / 1000, h: SP.F.hNow, cy: SP.F.cyNow, blink: SP.F.blinkNow, g: X.g || 0, lid: SP.F.lidNow[0],
        low: X.lowLid || 0, hm: X.hMul ? X.hMul.slice() : [1, 1], tiltE: X.tiltE || 0, tilt: X.tilt || 0, emo: X.emo, emoAmt: X.emoAmt || 0,
        gx: X.gx || 0, gy: X.gy || 0, dx: X.dx || 0, dy: X.dy || 0, breath: X.breath || 0, tremor: X.tremor || 0,
        mCurve: mouth, mOpen: parseFloat(mo.getAttribute('ry')), fx: document.getElementById('fx').childElementCount, state: SP.F.state });
      if (opts && opts.at && opts.at[i]) opts.at[i]();
    }
    window.__t = t; return out;
  }, [ms, DT, opts || null]);
  const set = (st) => p.evaluate((s) => SP.setEyeState(s), st);
  const R = {};
  // ① 상태별 유휴 60초: 깜빡임 간격·지속, 호흡/표류 진폭, 하품(입 벌림), zzz
  for (const st of ['AWAKE', 'DROWSY', 'ASLEEP', 'MORNING']) {
    await set(st); await run(500);
    const s = await run(60000);
    const blinks = []; let inB = false, start = 0;
    for (const f of s) { if (f.blink > 0.02 && !inB) { inB = true; start = f.t; } else if (f.blink <= 0.02 && inB) { inB = false; blinks.push({ at: start, dur: f.t - start }); } }
    const iv = blinks.slice(1).map((b2, i) => b2.at - blinks[i].at);
    const hs = s.map(f => f.h), amp = (Math.max(...hs) - Math.min(...hs));
    const yawns = s.filter((f, i) => i && f.mOpen > 1.5 && s[i - 1].mOpen <= 1.5).map(f => f.t.toFixed(1));
    const dxs = s.map(f => f.dx), dAmp = Math.max(...dxs) - Math.min(...dxs);
    R[st] = { blinks: blinks.length, blinkIvMin: iv.length ? Math.min(...iv).toFixed(2) : '-', blinkIvMax: iv.length ? Math.max(...iv).toFixed(2) : '-',
      blinkDurMean: blinks.length ? (blinks.reduce((a, b2) => a + b2.dur, 0) / blinks.length).toFixed(2) : '-',
      hAmpMm: amp.toFixed(2), driftAmpMm: dAmp.toFixed(2), yawnsAt: yawns, fxMax: Math.max(...s.map(f => f.fx)) };
  }
  // ② 눈부심 계단 응답 (AWAKE): 3 → 500 → 유지 3초 → 3
  await set('AWAKE'); await p.evaluate(() => { for (let i = 0; i < 12; i++) SP.feedLux(3); }); await run(500);
  const up = await run(3000, { at: { 0: null } });
  await p.evaluate(() => SP.feedLux(500)); const s1 = await run(3000);
  const gPeak = Math.max(...s1.map(f => f.g)); const gEnd = s1[s1.length - 1].g; const t90 = s1.find(f => f.g >= 0.9 * gEnd); const hMin = Math.min(...s1.map(f => f.h));
  const flinchBlink = s1.slice(0, 20).some(f => f.blink > 0.5);
  await p.evaluate(() => { SP.feedLux(500); }); await run(200);
  await p.evaluate(() => { SP.feedLux(3); }); const s2 = await run(6000);
  const g0 = s2[0].g; const t50 = s2.find(f => f.g <= 0.5 * g0), t10 = s2.find(f => f.g <= 0.1 * g0);
  const reliefBlink = s2.slice(0, 90).some(f => f.blink > 0.5); const puff = Math.max(...s2.slice(0, 60).map(f => f.mOpen));
  R.glare = { gPeak: gPeak.toFixed(3), gSteady: gEnd.toFixed(3), t90s: t90 ? (t90.t - s1[0].t).toFixed(2) : '-', hMinMm: hMin.toFixed(1), flinchHardBlink: flinchBlink,
    releaseT50s: t50 ? (t50.t - s2[0].t).toFixed(2) : '-', releaseT10s: t10 ? (t10.t - s2[0].t).toFixed(2) : '-', reliefBlink, reliefPuffRy: puff.toFixed(2) };
  // ③ 이산 표정 봉투 (AWAKE, glare 0)
  await p.evaluate(() => { SP.feedLux(3); SP.GL.raw = 0; }); await run(3000);
  R.emo = {};
  for (const k of ['happy', 'curious', 'sad', 'startled', 'relieved']) {
    await p.evaluate((kk) => SP.emitExpression(kk, 1, 'play'), k); const s = await run(3500);
    const peak = Math.max(...s.map(f => f.emoAmt)); const tPeak = s.find(f => f.emoAmt >= peak - 1e-6).t - s[0].t; const end = s.find((f, i) => i > 5 && f.emo === null);
    R.emo[k] = { peak: peak.toFixed(2), tPeakS: tPeak.toFixed(2), durS: end ? (end.t - s[0].t).toFixed(2) : '>3.5',
      lowMax: Math.max(...s.map(f => f.low)).toFixed(2), hMulL: Math.max(...s.map(f => f.hm[0])).toFixed(2), hMulR: Math.min(...s.map(f => f.hm[1])).toFixed(2),
      tiltE: (Math.abs(Math.min(...s.map(f => f.tiltE))) > Math.abs(Math.max(...s.map(f => f.tiltE))) ? Math.min(...s.map(f => f.tiltE)) : Math.max(...s.map(f => f.tiltE))).toFixed(1),
      mouthOpenRy: Math.max(...s.map(f => f.mOpen)).toFixed(2), hDeltaMm: (Math.max(...s.map(f => f.h)) - Math.min(...s.map(f => f.h))).toFixed(2) };
  }
  // ④ 표정 겹침 — happy 정점에서 curious: 프레임 간 lowLid 점프
  await p.evaluate(() => SP.emitExpression('happy', 1, 'play')); await run(600);
  const before = (await run(DT))[0];
  await p.evaluate(() => SP.emitExpression('curious', 1, 'play')); const after = (await run(DT))[0];
  R.overlap = { lowBefore: before.low.toFixed(2), lowAfterOneFrame: after.low.toFixed(2), jumpMm: (Math.abs(before.low - after.low) * 0.6 * 45).toFixed(1), hmJump: (after.hm[1] - before.hm[1]).toFixed(3) };
  await run(3000);
  // ⑤ DROWSY 게이트 — 표정 50%, 시선 30%
  await set('DROWSY'); await run(1500);
  await p.evaluate(() => SP.emitExpression('happy', 1, 'play')); const sd = await run(2500);
  await p.evaluate(() => SP.feedSnd(0.6, 1)); const sg = await run(2500);
  R.drowsyGate = { happyPeak: Math.max(...sd.map(f => f.emoAmt)).toFixed(2), lowMax: Math.max(...sd.map(f => f.low)).toFixed(2), gazePeakMm: Math.max(...sg.map(f => Math.abs(f.gx))).toFixed(2) };
  // ⑥ 시선 (AWAKE): 오른쪽 소리 → 사카드
  await set('AWAKE'); await run(1500);
  await p.evaluate(() => SP.feedSnd(0.6, 1)); const s6 = await run(3000);
  const gxPeak = Math.max(...s6.map(f => f.gx)); const tP = s6.find(f => f.gx >= 0.95 * gxPeak).t - s6[0].t; const tBack = s6.find((f, i) => f.t - s6[0].t > tP && f.gx < 0.1 * gxPeak);
  await p.evaluate(() => SP.feedSnd(0.6, 0)); const s7 = await run(2000);
  R.gaze = { peakMm: gxPeak.toFixed(2), tToPeakS: tP.toFixed(2), tBackS: tBack ? (tBack.t - s6[0].t).toFixed(2) : '-', frontGyMm: Math.min(...s7.map(f => f.gy)).toFixed(2), eyesTogether: s6.every(f => true) };
  // ⑦ 상태 전이 시간 — AWAKE→DROWSY 눈꺼풀 도달
  await set('AWAKE'); await run(2000); await set('DROWSY'); const s8 = await run(4000);
  const target = 0.55; const reach = s8.find(f => f.lid >= target * 0.95);
  R.transition = { lidReach95s: reach ? (reach.t - s8[0].t).toFixed(2) : '-', lidStart: s8[0].lid.toFixed(2), lidEnd: s8[s8.length - 1].lid.toFixed(2) };
  console.log(JSON.stringify(R, null, 1));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
