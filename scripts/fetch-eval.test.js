// scripts/fetch-eval.test.js
// E2 발견 메커니즘 측정의 순수 함수 검증 + 메트릭 변별력. 실행: node scripts/fetch-eval.test.js
const { syntheticPlane, evalFetch, sweep, EXPECTED, TARGET } = require('./fetch-eval');

let pass = 0, fail = 0;
function check(label, cond) { if (cond) pass++; else { fail++; console.error(`FAIL ${label}`); } }

// 코어 평면에서 정확 매칭
const core = evalFetch(TARGET, syntheticPlane(0), EXPECTED);
check('core precision 1', core.precision === 1);
check('core recall 1', core.recall === 1);
check('core no leak', core.leaked.length === 0);
check('core no miss', core.missed.length === 0);
check('injection = 6 relevant', core.injectionCount === 6);

// 규모 무관 bounding: 평면 키워도 주입수 불변·precision/recall 유지
const s = sweep([0, 13, 30]);
check('injection constant across scale', new Set(s.map(r => r.injectionCount)).size === 1);
check('precision/recall stay 1 at scale', s.every(r => r.precision === 1 && r.recall === 1));
check('plane actually grows', s[0].planeNodes < s[2].planeNodes);

// 혼동 형제 01a10이 끌려오지 않았다(precision 함정 명시 검증)
const fetchedHasConfusable = core.leaked.includes('PLAN-01a10') || core.leaked.includes('LSN-01a10');
check('confusable sibling excluded', !fetchedHasConfusable && core.leaked.length === 0);

// 메트릭 변별력: 잘못된 ground-truth(혼동 형제 포함)면 recall<1 이어야(메트릭이 자명하게 1이 아님)
const wrong = new Set([...EXPECTED, 'PLAN-01a10']); // 01a10을 관련으로 잘못 명세
const disc = evalFetch(TARGET, syntheticPlane(0), wrong);
check('metric discriminates (recall<1 on wrong truth)', disc.recall < 1);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
