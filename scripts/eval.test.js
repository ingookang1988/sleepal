// scripts/eval.test.js
// 순수 computeScorecard·캘리브레이션 단위 + gather 스모크. 실행: node scripts/eval.test.js
const { computeScorecard, contractNonLocality, predictDeltas, gather } = require('./eval');

let pass = 0, fail = 0;
function check(label, cond) { if (cond) pass++; else { fail++; console.error(`FAIL ${label}`); } }

const budgetOK = { total: 1000, totalCap: 4000, over: 0 };
const budgetOver = { total: 5000, totalCap: 4000, over: 1 };

// 풍부한 평면: CON 있고, LSN이 PLAN 계보에 앵커됨, HISTORY 1행, 예산 OK → 결손 0
const rich = computeScorecard({
  index: [
    { domain: 'CON', id: '01' },
    { domain: 'PLAN', id: '01a' },
    { domain: 'LSN', id: '01a1' }, // 조상 01a가 PLAN으로 존재 → 앵커됨
  ],
  budget: budgetOK, historyRows: 2,
});
check('rich healthy', rich.healthy === true && rich.gaps === 0);
check('reuse OK', rich.signals.find(s => s.name === 'reuse').rating === 'OK');
check('prewarning OK(anchored)', rich.signals.find(s => s.name === 'prewarning').rating === 'OK');

// 앵커 없는 LSN(고아) → prewarning PARTIAL (결손은 아님)
const orphan = computeScorecard({
  index: [{ domain: 'CON', id: '01' }, { domain: 'LSN', id: '09z' }],
  budget: budgetOK, historyRows: 1,
});
check('orphan LSN partial', orphan.signals.find(s => s.name === 'prewarning').rating === 'PARTIAL');

// CON 없음 → reuse GAP(결손) ; 예산 초과 → contextEconomy OVER(결손)
const poor = computeScorecard({ index: [], budget: budgetOver, historyRows: 0 });
check('no CON → reuse GAP', poor.signals.find(s => s.name === 'reuse').rating === 'GAP');
check('over budget → OVER', poor.signals.find(s => s.name === 'contextEconomy').rating === 'OVER');
check('poor counts 2 gaps', poor.gaps === 2 && poor.healthy === false);
check('empty history EMPTY(not gap)', poor.signals.find(s => s.name === 'antiRegression').rating === 'EMPTY');

// --- E4 캘리브레이션 ---
// contractNonLocality: 외부 참조된 CON id 비율
check('con coeff none', contractNonLocality([], new Set()).coeff === 0);
check('con coeff half', contractNonLocality(['01', '02'], new Set(['01'])).coeff === 0.5);
check('con coeff full', contractNonLocality(['01'], new Set(['01'])).coeff === 1);

// predictDeltas: 실현델타 = 존재 × 비국소성 계수
const sc = computeScorecard({
  index: [{ domain: 'CON', id: '01' }, { domain: 'PLAN', id: '01a' }, { domain: 'LSN', id: '01a1' }],
  budget: { total: 100, totalCap: 4000, over: 0 }, historyRows: 2,
});
// 비국소 계약(coeff 1): reuse·prewarning·antiRegression 전부 1.0 예측
const full = predictDeltas(sc, 1.0);
check('prewarning coeff 1', full.rows.find(r => r.name === 'prewarning').predictedDelta === 1);
check('antiRegression coeff 1', full.rows.find(r => r.name === 'antiRegression').predictedDelta === 1);
check('reuse non-local delta 1', full.rows.find(r => r.name === 'reuse').predictedDelta === 1);
// 국소 계약(coeff 0): reuse 예측델타 0 (E1: 인라인 계약은 델타 0)
const inline = predictDeltas(sc, 0.0);
check('reuse local delta 0', inline.rows.find(r => r.name === 'reuse').predictedDelta === 0);
check('time-axis stays 1 when contract local', inline.rows.find(r => r.name === 'antiRegression').predictedDelta === 1);

// gather 스모크(현 레포)
const g = gather();
check('gather signals 4', Array.isArray(g.signals) && g.signals.length === 4);
check('gather has calibration', g.calibration && Array.isArray(g.calibration.rows) && typeof g.calibration.aggregate === 'number');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
