#!/usr/bin/env node
// scripts/eval.js
// 하네스 *레버리지* 스코어카드 + *E4 캘리브레이션*.
//   스코어카드: 하네스가 주장하는 가치의 *표면 존재*(=상한)를 구조 프록시로 잰다.
//   캘리브레이션: E1 A/B가 도출한 모델 — 실현델타 = (비국소성 계수 0..1) × 상한 — 을 코드화한다.
// read-only·zero-dep. 실행: node scripts/eval.js [--json]
//
// 정직한 한계: 모델 A/B가 아니다. 표면/비국소성 *구조 추정*이며, 실효능 검증은 eval/PROTOCOL.md·RESULTS.md.
const fs = require('fs');
const path = require('path');
const { buildIndex } = require('./zfs_index');
const { ancestorChain } = require('./zfs_util');
const { gather: gatherBudget } = require('./context-budget');
const { extractRefs } = require('./ref-linter');

// HISTORY의 사실+근거 행 수(표 본문 행만). anti-regression 커버리지 프록시.
function countHistoryRows(root) {
  try {
    const txt = fs.readFileSync(path.join(root, '.union-stack/project/HISTORY.md'), 'utf8');
    return txt.split('\n').filter(l => /^\|/.test(l) && !/^\|\s*-+/.test(l) && !/Turning point|Date\s*\|/.test(l)).length;
  } catch { return 0; }
}

/** 순수: 인덱스+예산+히스토리 → 4대 가치 신호(표면 존재 = 상한). */
function computeScorecard({ index, budget, historyRows }) {
  const contracts = index.filter(d => d.domain === 'CON');
  const lessons = index.filter(d => d.domain === 'LSN');
  const anchorIds = new Set(index.filter(d => ['PLAN', 'FLOW', 'CON', 'ARCH', 'MTG'].includes(d.domain)).map(d => d.id));
  const lessonsAnchored = lessons.filter(l => ancestorChain(l.id).some(a => anchorIds.has(a))).length;

  const signals = [
    { name: 'reuse', metric: '공유 계약 좌표화(CON)', value: contracts.length,
      rating: contracts.length >= 1 ? 'OK' : 'GAP', why: '에이전트가 재발명 대신 찾아 쓸 표면' },
    { name: 'prewarning', metric: '계보 앵커된 LSN(주입 도달)', value: `${lessonsAnchored}/${lessons.length}`,
      rating: lessons.length === 0 ? 'EMPTY' : (lessonsAnchored === lessons.length ? 'OK' : 'PARTIAL'),
      why: '앵커 없는 LSN은 Upward Fetching에 안 걸려 사문화' },
    { name: 'antiRegression', metric: 'HISTORY 사실+근거 행', value: historyRows,
      rating: historyRows >= 1 ? 'OK' : 'EMPTY', why: '폐기된 방향으로의 재진입 방지' },
    { name: 'contextEconomy', metric: '부트스트랩 토큰/상한', value: `${budget.total}/${budget.totalCap}`,
      rating: budget.over ? 'OVER' : 'OK', why: '주입이 비대해지면 하네스가 막으려던 rot를 자가유발' },
  ];
  const gaps = signals.filter(s => ['GAP', 'OVER'].includes(s.rating)).length;
  return { signals, gaps, healthy: gaps === 0 };
}

// --- E4 캘리브레이션: 실현델타 = 비국소성 계수 × 상한 ---
// 시간축 평면은 격자 정의상 *비국소*(과거 실패·전략 결정은 어떤 코드 스냅샷에도 없다) → 계수 1.0.
// contextEconomy는 지식 공급 표면이 아니라 비용 가드 → 계수 0.
const NONLOCALITY = { prewarning: 1.0, antiRegression: 1.0, contextEconomy: 0.0 };

/** CON 계약의 비국소성(0..1): 정의 파일(reference/contracts) 밖에서 참조되는 CON id 비율(순수). */
function contractNonLocality(conIds, externallyReferenced) {
  if (!conIds.length) return { coeff: 0, referenced: 0, total: 0 };
  const ref = conIds.filter(id => externallyReferenced.has(id)).length;
  return { coeff: +(ref / conIds.length).toFixed(2), referenced: ref, total: conIds.length };
}

/** 각 가치의 예측 델타 = 존재(0/1) × 비국소성 계수(순수). E1 1차 모델. */
function predictDeltas(scorecard, conCoeff) {
  const present = name => {
    const s = scorecard.signals.find(x => x.name === name);
    return s && !['GAP', 'EMPTY', 'OVER'].includes(s.rating) ? 1 : 0;
  };
  const rows = [
    { name: 'reuse', coeff: conCoeff, present: present('reuse') },
    { name: 'prewarning', coeff: NONLOCALITY.prewarning, present: present('prewarning') },
    { name: 'antiRegression', coeff: NONLOCALITY.antiRegression, present: present('antiRegression') },
  ].map(r => ({ ...r, predictedDelta: +(r.present * r.coeff).toFixed(2) }));
  return { rows, aggregate: +(rows.reduce((a, r) => a + r.predictedDelta, 0) / rows.length).toFixed(2) };
}

// 정의 파일 밖에서 참조되는 CON id 수집(구조적 비국소성 추정용).
function gatherConSpread(root) {
  const index = buildIndex(root);
  const conIds = index.filter(d => d.domain === 'CON').map(d => d.id);
  const ext = new Set();
  (function walk(dir) {
    const abs = path.join(root, dir);
    if (!fs.existsSync(abs)) return;
    for (const e of fs.readdirSync(abs)) {
      const rel = `${dir}/${e}`;
      if (fs.statSync(path.join(root, rel)).isDirectory()) { walk(rel); continue; }
      if (!e.endsWith('.md')) continue;
      if (rel.includes('reference/contracts')) continue; // 정의 파일 자신은 제외(외부 참조만)
      for (const r of extractRefs(fs.readFileSync(path.join(root, rel), 'utf8'))) {
        if (r.domain === 'CON' && conIds.includes(r.id)) ext.add(r.id);
      }
    }
  })('.union-stack');
  return { conIds, ext };
}

function gather(root = path.resolve(__dirname, '..')) {
  const scorecard = computeScorecard({
    index: buildIndex(root),
    budget: gatherBudget(root),
    historyRows: countHistoryRows(root),
  });
  const { conIds, ext } = gatherConSpread(root);
  const con = contractNonLocality(conIds, ext);
  const calibration = { contract: con, ...predictDeltas(scorecard, con.coeff) };
  return { ...scorecard, calibration };
}

function run(root) {
  const r = gather(root);
  if (process.argv.includes('--json')) { console.log(JSON.stringify(r, null, 2)); return r.gaps ? 1 : 0; }
  console.log('# union-stack 레버리지 스코어카드 (구조 프록시 — 모델 A/B 아님; 프로토콜: eval/PROTOCOL.md)\n');
  for (const s of r.signals) {
    const mark = s.rating === 'OK' ? '✓' : (s.rating === 'GAP' || s.rating === 'OVER') ? '✗' : '·';
    console.log(`  ${mark} ${s.name.padEnd(15)} ${String(s.value).padEnd(8)} ${s.rating.padEnd(8)} ${s.metric}`);
  }
  console.log('\n## E4 캘리브레이션 — 예측 실현델타 = 비국소성 계수 × 표면존재 (eval/CALIBRATION.md)');
  console.log(`  계약 비국소성: ${r.calibration.contract.referenced}/${r.calibration.contract.total} 외부참조 → 계수 ${r.calibration.contract.coeff}`);
  for (const row of r.calibration.rows) {
    console.log(`  · ${row.name.padEnd(15)} 존재 ${row.present} × 계수 ${row.coeff} → 예측델타 ${row.predictedDelta}`);
  }
  console.log(`  종합 예측 효능: ${r.calibration.aggregate}  (1.0 = 모든 비국소 가치 실현)`);
  console.log(r.healthy
    ? '\n구조 레버리지: 가치 표면 모두 가용. 예측델타가 낮으면 *국소* 지식이라 하네스 한계기여↓(E1 법칙).'
    : `\n구조 레버리지: ${r.gaps}개 구조적 결손.`);
  return r.gaps ? 1 : 0;
}

module.exports = { computeScorecard, countHistoryRows, contractNonLocality, predictDeltas, gather, NONLOCALITY };

if (require.main === module) process.exit(run());
