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

// --- budgetsFor: adapter.json budgets 가 기본 예산을 덮는다(어답터 C 실측 — 포크 대신 설정) ---
const { budgetsFor, BUDGETS, TOTAL_CAP } = require('./context-budget');
const fsB = require('fs'), osB = require('os'), pathB = require('path');
const tmpB = fsB.mkdtempSync(pathB.join(osB.tmpdir(), 'cb-'));
try {
  check('설정 없음 → 기본값', JSON.stringify(budgetsFor(tmpB)) === JSON.stringify({ ...BUDGETS, total: TOTAL_CAP }));
  fsB.mkdirSync(pathB.join(tmpB, '.union-stack'));
  fsB.writeFileSync(pathB.join(tmpB, '.union-stack/adapter.json'), '{"budgets": {"handoff": 2200}}');
  const b = budgetsFor(tmpB);
  check('handoff 만 덮고 나머지 기본', b.handoff === 2200 && b.project === BUDGETS.project && b.total === TOTAL_CAP);
  fsB.mkdirSync(pathB.join(tmpB, '.union-stack/sprint'));
  fsB.writeFileSync(pathB.join(tmpB, '.union-stack/sprint/HANDOFF.md'), 'x'.repeat(8000));
  const gB = gather(tmpB);
  check('gather(root) 가 설정 예산을 쓴다(2000 tok < 2200 → OK)', gB.rows.find(r => r.name === 'handoff').budget === 2200 && gB.rows.find(r => r.name === 'handoff').status === 'OK');
} finally { fsB.rmSync(tmpB, { recursive: true, force: true }); }

// --- [WO-28a-6] AGENTS.md advisory 행 + PRO frontmatter injects: 대조([PRO-28] ⑤ 판정 2026-10-18) ---
const { parseInjects, measureAgents, gatherInjects } = require('./context-budget');
check('injects 정상', JSON.stringify(parseInjects('"+120 tok — 마커 블록 1행"')) === JSON.stringify({ tok: 120, reason: '마커 블록 1행' }));
check('injects 부호·대시 생략 허용', parseInjects('80 tok - 이유').tok === 80);
check('injects 형식 오류 → error', !!parseInjects('많이').error && !!parseInjects('"+50 tok"').error);
check('injects 빈 값 → error', !!parseInjects('').error);
const agentsTxt = 'head\n<!-- x:begin — gen -->\n' + 'a'.repeat(40) + '\n<!-- x:end -->\ntail';
const ma = measureAgents(agentsTxt);
check('AGENTS 마커 블록 분리 계측', ma.tokens === estimateTokens(agentsTxt) && ma.markers > 0 && ma.markers < ma.tokens && ma.blocks === 1);
check('AGENTS 없음 → null', measureAgents('') === null);
const tmpI = fsB.mkdtempSync(pathB.join(osB.tmpdir(), 'cbi-'));
try {
  const before = gather(tmpI);
  check('AGENTS·PRO 없음 → advisory 비어 있고 현행과 동일', before.advisory.agents === null && before.advisory.injects.declared.length === 0 && before.rows.length === 3);
  fsB.writeFileSync(pathB.join(tmpI, 'AGENTS.md'), 'x'.repeat(40000));
  fsB.mkdirSync(pathB.join(tmpI, '.union-stack/proposals'), { recursive: true });
  fsB.writeFileSync(pathB.join(tmpI, '.union-stack/proposals/PRO-01_a.md'), '---\nid: PRO-01\ninjects: "+30 tok — 블록"\n---\n# a');
  fsB.writeFileSync(pathB.join(tmpI, '.union-stack/proposals/PRO-02_b.md'), '---\nid: PRO-02\ninjects: 잔뜩\n---\n# b');
  fsB.writeFileSync(pathB.join(tmpI, '.union-stack/proposals/PRO-03_c.md'), '---\nid: PRO-03\n---\n# c');
  const gi = gather(tmpI);
  check('AGENTS 는 advisory — 총합·over 에 넣지 않는다', gi.advisory.agents.tokens === 10000 && gi.total === before.total && gi.over === before.over);
  check('injects 합산 · 필드 없음 = 신고 0', gi.advisory.injects.sum === 30 && gi.advisory.injects.declared.length === 1);
  check('injects 형식 오류 = CLARIFY', gi.advisory.injects.clarify.length === 1 && gi.advisory.injects.clarify[0].id === 'PRO-02');
  check('gatherInjects 단독', gatherInjects(tmpI).sum === 30);
} finally { fsB.rmSync(tmpI, { recursive: true, force: true }); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
