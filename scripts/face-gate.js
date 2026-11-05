#!/usr/bin/env node
// scripts/face-gate.js — 표정 동작 헤드리스 게이트 [WO-01b-7][WO-01b-8][WO-01b-9][WO-01b-10]. Playwright 필요(레포 의존성 아님).
//   실행: node scripts/serve.js & node scripts/face-gate.js
//   실제 app/index.html 을 SP._step 으로 결정적으로 밟으며 [ANL-01b] 의 근인이 닫혔는지 본다. CI 체인 밖 —
//   순수 핵(emotion-core)은 scripts/emotion-core.test.js 가 CI 에서 본다.
const { chromium } = require('playwright');
const DT = 16.667;
(async () => {
  const browser = await chromium.launch();
  const p = await (await browser.newContext({ viewport: { width: 780, height: 360 } })).newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.goto('http://127.0.0.1:5173/app/?nightS=99999', { waitUntil: 'networkidle' });
  await p.click('#bStart'); await p.waitForTimeout(400);
  const R = [];
  const ok = (name, cond, detail) => R.push((cond ? 'PASS ' : 'FAIL ') + name + (detail ? '  — ' + detail : ''));
  const run = (ms) => p.evaluate(([ms, DT]) => {
    const out = []; let t = window.__t || 1000;
    const rot = (id) => parseFloat((document.getElementById(id).getAttribute('transform').match(/rotate\(([-\d.]+)/) || [0, 0])[1]);
    const shutY = () => parseFloat((document.getElementById('shutG').getAttribute('transform').match(/translate\([-\d.]+ ([-\d.]+)\)/) || [0, 0])[1]);
    for (let i = 0; i < Math.round(ms / DT); i++) {
      t += DT; SP._step(t);
      const X = SP.F.X || {};
      out.push({ t: t / 1000, h: SP.F.hNow, low: X.lowLid || 0, hm: X.hMul ? X.hMul.slice() : [1, 1], tiltE: X.tiltE || 0, lidE: X.lidE || 0, head: X.head || 0,
        nod: X.nod || 0, k: X.k || 0, dx: X.dx || 0, dy: X.dy || 0, rotL: rot('tiltL'), rotR: rot('tiltR'), shutY: shutY(), lid: SP.F.lidNow[0],
        blinkT: SP.F.blinkT, emo: X.emo, slots: SP.EMO.slots.length, fx: document.getElementById('fx').childElementCount, X: !!SP.F.X });
    }
    window.__t = t; return out;
  }, [ms, DT]);
  const set = (st) => p.evaluate((s) => SP.setEyeState(s), st);
  const emit = (k, src) => p.evaluate(([k, src]) => SP.emitExpression(k, 1, src || 'play'), [k, src]);
  const p2p = (arr) => Math.max(...arr) - Math.min(...arr);

  // ── [WO-01b-7] 크로스페이드 ──
  await set('AWAKE'); await run(1500);
  await emit('happy'); await run(600);
  const b = (await run(DT))[0];
  await emit('curious'); const a = (await run(DT))[0];
  ok('겹침: happy 정점에서 curious — 아래꺼풀 한 프레임 변화 ≤ 0.1', Math.abs(a.low - b.low) <= 0.1 && b.low > 0.5, `${b.low.toFixed(2)} → ${a.low.toFixed(2)}`);
  const s7 = await run(3500);
  const idle = s7[s7.length - 1];
  ok('겹침 뒤 3.5초: 슬롯 0 · 채널 전부 0(원복)', idle.slots === 0 && idle.low === 0 && idle.hm[0] === 1 && idle.hm[1] === 1 && idle.tiltE === 0 && idle.lidE === 0 && idle.head === 0, JSON.stringify({ slots: idle.slots, low: idle.low, hm: idle.hm, head: idle.head }));
  // startled(play) 도 하드 블링크
  await run(500); const before = (await run(DT))[0];
  await emit('startled', 'play'); const after = (await run(DT))[0];
  ok('startled(play) → 하드 블링크 시작(kind 기준 통일)', before.blinkT < 0 && after.blinkT >= 0, `blinkT ${before.blinkT} → ${after.blinkT}`);
  await run(1500);
  // fx 전이 페이드
  await set('ASLEEP'); let sz = await run(9000);
  const zMax = Math.max(...sz.map(f => f.fx));
  await set('MORNING'); const sm = await run(450);
  ok('fx: ASLEEP 의 zzz 가 MORNING 전이 0.45초 안에 사라진다', zMax >= 1 && sm[sm.length - 1].fx === 0, `zMax ${zMax} → ${sm[sm.length - 1].fx}`);
  // NIGHT 폐기
  await set('AWAKE'); await run(800); await emit('happy'); await run(200); await set('NIGHT'); const sn = await run(DT * 2);
  ok('NIGHT: 슬롯 폐기 · X null(R4)', sn[1].slots === 0 && sn[1].X === false, JSON.stringify({ slots: sn[1].slots }));

  // ── [WO-01b-8] 점진 졸림·꾸벅 ──
  await set('DROWSY'); await run(1000);
  const sd = await run(20000);
  ok('DROWSY 표류 > 0(죽은 눈 아님)', p2p(sd.map(f => f.dx)) > 0.15, p2p(sd.map(f => f.dx)).toFixed(2) + 'mm');
  const sd2 = await run(25000); const all = sd.concat(sd2);
  const nodPeak = Math.max(...all.map(f => f.nod)); const atPeak = all.find(f => f.nod >= 0.99) || { lidE: 0, dy: 0 };
  ok('DROWSY 45초 안에 꾸벅 ≥ 1회 · 정점에서 윗꺼풀 +0.35 · 눈 1.5mm 가라앉음', nodPeak >= 0.99 && atPeak.lidE >= 0.3 && atPeak.dy >= 1.2, JSON.stringify({ nodPeak: nodPeak.toFixed(2), lidE: atPeak.lidE.toFixed(2), dy: atPeak.dy.toFixed(2) }));
  // mode:progress 주입 → k → 눈꺼풀
  await p.evaluate(() => SP.palBus.dispatchEvent(new CustomEvent('mode:progress', { detail: { to: 'SLEEP', elapsed: 150, need: 300 } })));
  const sk = await run(DT * 3); const fk = sk[2];
  ok('mode:progress(SLEEP 50%) → k 0.5 · 윗꺼풀 +0.1(꾸벅 없을 때)', Math.abs(fk.k - 0.5) < 0.01 && (fk.nod > 0 || Math.abs(fk.lidE - 0.1) < 0.02), JSON.stringify({ k: fk.k, lidE: fk.lidE.toFixed(2), nod: fk.nod.toFixed(2) }));
  await p.evaluate(() => SP.palBus.dispatchEvent(new CustomEvent('mode:change', { detail: { from: 'WIND_DOWN', to: 'PLAY', cause: 'command' } })));
  const sk0 = (await run(DT * 2))[1];
  ok('mode:change → k 0', sk0.k === 0);
  await set('ASLEEP'); const sa = await run(3000);
  ok('ASLEEP: 꾸벅·k 무효', sa.every(f => f.nod === 0 && f.k === 0));

  // ── [WO-01b-9] 호흡 진폭 ──
  const breath = {};
  for (const st of ['AWAKE', 'DROWSY', 'ASLEEP']) { await set(st); await run(2000); const s = await run(12000); breath[st] = st === 'ASLEEP' ? p2p(s.map(f => f.shutY)) : p2p(s.map(f => f.h)); }
  ok('호흡 p2p: AWAKE ≈1.8 · DROWSY ≈2.7 · ASLEEP 감긴 곡선 ≥ 2.5mm', Math.abs(breath.AWAKE - 1.8) < 0.4 && Math.abs(breath.DROWSY - 2.7) < 0.5 && breath.ASLEEP >= 2.5, JSON.stringify(Object.fromEntries(Object.entries(breath).map(([k, v]) => [k, v.toFixed(2)]))));

  // ── [WO-01b-10] 가독성 ──
  await set('AWAKE'); await run(1500);
  await emit('sad'); const ss = await run(2800);
  ok('sad: 윗꺼풀 처짐 lidE 최대 ≥ 0.12 · 기울기 −5°', Math.max(...ss.map(f => f.lidE)) >= 0.12 && Math.min(...ss.map(f => f.tiltE)) <= -4.5, JSON.stringify({ lidE: Math.max(...ss.map(f => f.lidE)).toFixed(2), tiltE: Math.min(...ss.map(f => f.tiltE)).toFixed(1) }));
  await emit('curious'); const sc = await run(1700);
  const pk = sc.reduce((m, f) => (f.head > m.head ? f : m), sc[0]);
  ok('curious: 두 눈 같은 방향 회전(고개 갸웃 ≥ 2°)', pk.head >= 2 && Math.sign(pk.rotL) === Math.sign(pk.rotR) && Math.abs(pk.rotL) >= 2, JSON.stringify({ head: pk.head.toFixed(1), rotL: pk.rotL, rotR: pk.rotR }));
  await emit('happy'); const sh = await run(2000);
  ok('happy: 기하 불변(윗꺼풀·고개 갸웃 0 · 아래꺼풀 0.62)', sh.every(f => f.lidE === 0 && f.head === 0) && Math.abs(Math.max(...sh.map(f => f.low)) - 0.62) < 0.02, Math.max(...sh.map(f => f.low)).toFixed(2));

  ok('페이지 오류 0', errors.length === 0, errors.join(' | '));
  console.log(R.join('\n')); console.log('\n' + R.filter(r => r.startsWith('FAIL')).length + ' FAIL / ' + R.length);
  await browser.close(); process.exit(R.some(r => r.startsWith('FAIL')) ? 1 : 0);
})().catch(e => { console.error('gate error:', e); process.exit(2); });
