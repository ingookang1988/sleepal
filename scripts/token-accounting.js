#!/usr/bin/env node
// scripts/token-accounting.js
// E1-H3 — 토큰 순이득. 하네스는 *품질*(효능 델타)뿐 아니라 *토큰*으로도 이득인가?
//   on-arm 비용 = 주입 토큰(하네스 맥락 선주입, 측정됨).
//   off-arm 비용 = 틀린 산출물을 *탐지+수정*하는 재작업(+탈출 시 사고). on이 못 내는 비용.
//   순이득 = (off 기대 재작업비용) − (on 주입비용). 손익분기 재작업비용 = 주입비용 / off결함률.
// read-only·zero-dep. 실행: node scripts/token-accounting.js [--json]
//
// 정직한 한계: 주입비용은 *측정*(E1 subagent_tokens), 재작업비용은 *모델*(보수적 1회 재생성 기준).

// E1 설계-리뷰 1턴 토큰(subagent_tokens). on은 주입된 하네스 맥락(LSN/HISTORY/CON)을 포함한다.
const MEASURED = {
  T1v2: { on: [17145, 17150, 17139, 17328, 17323], off: [16914, 16956, 16911, 17007, 16911] }, // region-pin(4회차)
  T3v2: { on: [17190, 17186, 17176, 17179, 17118], off: [16973, 17052, 17058, 17003, 17065] }, // zeta 회귀(4회차)
  T4:   { on: [17113, 17127, 17119],               off: [17012, 17072, 17012] },                // 비국소 계약(2회차)
  T1p:  { on: [17239], off: [16836] }, // 파일럿(1회차)
  T2p:  { on: [17110], off: [16834] },
  T3p:  { on: [16863], off: [16566] },
};

// off-arm이 비국소 태스크에서 틀린 산출물을 낸 비율(E1 실측: 전부 결함 → 1.0).
const OFF_DEFECT_RATE = 1.0;
// 보수적 재작업 단가: 결함 1건을 탐지+재생성하는 데 드는 토큰 ≈ 생성 1턴(여기선 ~17k). 실제론 리뷰·재테스트로 더 큼.
const REWORK_TOKENS = 17000;

const mean = a => a.reduce((x, y) => x + y, 0) / a.length;

/** 태스크별 주입비용(on평균 − off평균) + 풀링 평균(순수). */
function injectionCosts(data = MEASURED) {
  const rows = Object.entries(data).map(([task, d]) => ({
    task, on: Math.round(mean(d.on)), off: Math.round(mean(d.off)), injection: Math.round(mean(d.on) - mean(d.off)),
  }));
  const pooledOn = mean(rows.flatMap(r => data[r.task].on));
  const pooledOff = mean(rows.flatMap(r => data[r.task].off));
  return { rows, pooledInjection: Math.round(pooledOn - pooledOff) };
}

/** 손익분기·ROI(순수). breakEven = 주입비용/결함률; ROI = 기대재작업 / 주입비용. */
function netGain(injection, { defectRate = OFF_DEFECT_RATE, reworkTokens = REWORK_TOKENS } = {}) {
  const breakEvenReworkCost = Math.round(injection / defectRate); // off결함이 이만큼만 들어도 본전
  const expectedOffCost = defectRate * reworkTokens;
  const net = Math.round(expectedOffCost - injection);
  const roi = +(expectedOffCost / injection).toFixed(1);
  return { injection, breakEvenReworkCost, expectedOffCost, net, roi, defectRate, reworkTokens };
}

function run() {
  const ic = injectionCosts();
  const ng = netGain(ic.pooledInjection);
  if (process.argv.includes('--json')) { console.log(JSON.stringify({ injectionCosts: ic, netGain: ng }, null, 2)); return 0; }
  console.log('# union-stack token accounting (E1-H3 — 토큰 순이득)\n');
  console.log('  태스크   on평균   off평균   주입비용(on−off)');
  for (const r of ic.rows) console.log(`  ${r.task.padEnd(6)} ${String(r.on).padStart(6)}  ${String(r.off).padStart(7)}   ${String(r.injection).padStart(6)}`);
  console.log(`\n  풀링 주입비용 ≈ ${ic.pooledInjection} tok/태스크 (측정값 — 하네스 맥락 블록)`);
  console.log('\n  순이득 모델 (off 결함률 ' + ng.defectRate + ', 재작업 단가 ' + ng.reworkTokens + ' tok = 보수적 1회 재생성):');
  console.log(`  · 손익분기: off 결함이 평균 ${ng.breakEvenReworkCost} tok만 들어도 하네스가 본전`);
  console.log(`  · 기대 off 재작업비용 ${ng.expectedOffCost} tok  vs  on 주입 ${ng.injection} tok  →  순이득 +${ng.net} tok/태스크`);
  console.log(`  · 토큰 ROI ≈ ${ng.roi}×  (E1 실측 off 결함률 100% ≫ 손익분기 ${(100 * ng.injection / ng.reworkTokens).toFixed(1)}%)`);
  console.log('\n  결론: 주입비용은 1회 재생성의 ~' + (100 * ng.injection / ng.reworkTokens).toFixed(1) + '%. off는 비국소 태스크에서 100% 결함 →');
  console.log('  품질뿐 아니라 *토큰*으로도 하네스가 순이득(탈출한 결함의 사고비용은 미포함 — 더 보수적).');
  return 0;
}

module.exports = { injectionCosts, netGain, mean, MEASURED, OFF_DEFECT_RATE, REWORK_TOKENS };

if (require.main === module) process.exit(run());
