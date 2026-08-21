// scripts/context-budget.test.js
// 순수 함수(estimateTokens, computeBudget) + gather 스모크. 실행: node scripts/context-budget.test.js
const { estimateTokens, computeBudget, gather } = require('./context-budget');

let pass = 0, fail = 0;
function check(label, cond) { if (cond) pass++; else { fail++; console.error(`FAIL ${label}`); } }

// estimateTokens — 스크립트별 계수(라틴 ~4자/토큰, CJK ~1.5자/토큰)
check('latin ~ char/4', estimateTokens('aaaa') === 1 && estimateTokens('aaaaa') === 2);
check('estimate empty', estimateTokens('') === 0 && estimateTokens(null) === 0);
check('한글은 라틴보다 비싸다', estimateTokens('가나다라') > estimateTokens('aaaa'));
check('한글 4자 ≈ 3토큰', estimateTokens('가나다라') === 3);
check('한자·가나도 CJK 계수', estimateTokens('漢字') === 2 && estimateTokens('かな') === 2);
// 회귀: char/4 단일 계수는 한국어를 2~3배 과소평가했다(같은 길이 문자열 비교)
const ko = '한글문장열두글자다', en = 'abcdefghi';
check('동일 길이에서 한글 추정치가 2배 이상',
  ko.length === en.length && estimateTokens(ko) >= estimateTokens(en) * 2);

// computeBudget: 전부 예산 내
const ok = computeBudget([
  { name: 'project', tokens: 100, budget: 2000 },
  { name: 'profile', tokens: 50, budget: 800 },
], 4000);
check('within budget healthy', ok.healthy === true && ok.over === 0 && ok.total === 150);

// 섹션 초과
const overSec = computeBudget([{ name: 'project', tokens: 3000, budget: 2000 }], 4000);
check('section over flagged', overSec.over === 1 && overSec.rows[0].status === 'OVER');

// 총합 초과(섹션은 OK인데 합이 상한 초과)
const overTotal = computeBudget([
  { name: 'a', tokens: 1500, budget: 2000 },
  { name: 'b', tokens: 1500, budget: 2000 },
], 2000);
check('total over flagged', overTotal.over === 1 && overTotal.healthy === false);

// gather 스모크(현 레포)
const g = gather();
check('gather rows present', Array.isArray(g.rows) && g.rows.length === 3);
check('gather has total', typeof g.total === 'number');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
