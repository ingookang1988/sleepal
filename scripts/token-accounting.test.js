// scripts/token-accounting.test.js
// E1-H3 순수 함수(injectionCosts, netGain) 검증. 실행: node scripts/token-accounting.test.js
const { injectionCosts, netGain, mean } = require('./token-accounting');

let pass = 0, fail = 0;
function check(label, cond) { if (cond) pass++; else { fail++; console.error(`FAIL ${label}`); } }

check('mean', mean([2, 4, 6]) === 4);

// injectionCosts: 실데이터 → on>off(주입비용 양수) + 풀링 양수
const ic = injectionCosts({ A: { on: [1200, 1300], off: [1000, 1100] } });
check('injection = on-off', ic.rows[0].injection === 200);
check('pooled positive', ic.pooledInjection === 200);

// netGain 수학: 결함률 1, rework R → breakEven=injection, expectedOff=R, net=R-injection, roi=R/injection
const ng = netGain(200, { defectRate: 1, reworkTokens: 17000 });
check('breakEven = injection/defectRate', ng.breakEvenReworkCost === 200);
check('expected off cost = rate*rework', ng.expectedOffCost === 17000);
check('net = expected - injection', ng.net === 16800);
check('roi = expected/injection', ng.roi === 85);

// 결함률 0.5면 손익분기 단가가 2배(주입을 더 자주 정당화해야)
const half = netGain(200, { defectRate: 0.5, reworkTokens: 17000 });
check('lower defect rate raises break-even', half.breakEvenReworkCost === 400);

// 현재 레포 실데이터 스모크
const real = injectionCosts();
check('real pooled injection > 0', real.pooledInjection > 0);
check('real injection modest (<1000 tok)', real.pooledInjection < 1000);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
