// scripts/smell-linter.test.js
// 순수 로직(findSmells) + 실레포 통합(gather). 실행: node scripts/smell-linter.test.js
const { findSmells, gather, MAX_CHARS } = require('./smell-linter');

let pass = 0, fail = 0;
function check(label, cond) { if (cond) pass++; else { fail++; console.error(`FAIL ${label}`); } }

const GOOD = '---\nid: TOOL-99\ntitle: t\nkind: script\nimpl: x.js\n---\n# t\n\n## 용도\nx\n\n## 언제 쓰나\nx\n\n## 언제 쓰지 않나\nx\n\n## 호출\n```bash\nx\n```\n';

check('건전 카드 → smell 0', findSmells(GOOD).length === 0);
check('용도 절 없음', findSmells(GOOD.replace('## 용도', '## 목적')).some(s => s.code === 'no-purpose'));
check('부정 스코프 없음', findSmells(GOOD.replace('## 언제 쓰지 않나', '## 기타')).some(s => s.code === 'no-negative-scope'));
check('호출 절 없음', findSmells(GOOD.replace('## 호출', '## 사용')).some(s => s.code === 'no-invocation'));
check('kind 없음', findSmells(GOOD.replace('kind: script\n', '')).some(s => s.code === 'no-kind'));
check('비대 카드', findSmells(GOOD + 'x'.repeat(MAX_CHARS)).some(s => s.code === 'bloat'));
// 판정이 체크아웃 EOL 에 따라 갈리면 안 된다 — 상한 근처 카드가 Windows(CRLF)에서만 REJECT 됐다.
const padLines = Math.floor((MAX_CHARS - GOOD.length - 10) / 2);
const nearCap = GOOD + 'x\n'.repeat(padLines); // LF 기준 상한 10자 아래 — CRLF 면 줄수만큼 더 붙는다
const bloated = t => findSmells(t).some(s => s.code === 'bloat');
check('상한 근처 카드: LF 통과', !bloated(nearCap));
check('상한 근처 카드: CRLF 도 같은 판정(개행은 내용이 아니다)',
  bloated(nearCap.replace(/\n/g, '\r\n')) === bloated(nearCap));
check('빈 텍스트 = 다중 smell', findSmells('').length >= 3);

// --- 시나리오(kind: scenario) 추가 규율 [PRO-10] ---
const SC_FM = ['version: 1', 'status: Draft', 'activation: manual', 'entry_gate: x', 'exit_criteria: y', 'reviewed: 2026-07-25', 'evidence: []'];
const scenarioCard = (extra = [], drop = null) =>
  '---\nid: TOOL-99\ntitle: t\nkind: scenario\nimpl: a.md\n' +
  SC_FM.filter(l => !drop || !l.startsWith(drop)).concat(extra).join('\n') +
  '\n---\n# t\n\n## 용도\nx\n\n## 언제 쓰나\nx\n\n## 언제 쓰지 않나\nx\n\n## 호출\nx\n';
const BODY = { tokens: 100, text: '# s\n\n## 절차\n1. x\n\n## 종료 조건\nx\n' };

check('건전 시나리오 → smell 0', findSmells(scenarioCard(), { impl: BODY }).length === 0);
check('필수 필드 누락 감지', findSmells(scenarioCard([], 'activation'), { impl: BODY }).some(s => s.code === 'no-activation'));
check('evidence 누락 감지', findSmells(scenarioCard([], 'evidence'), { impl: BODY }).some(s => s.code === 'no-evidence'));
// 절차·종료조건은 카드가 아니라 *스킬 본문*에서 검사한다(카탈로그-only 원칙)
check('본문 절차 절 없음 감지',
  findSmells(scenarioCard(), { impl: { tokens: 10, text: '## 종료 조건\nx' } }).some(s => s.code === 'no-procedure'));
check('본문 종료조건 절 없음 감지',
  findSmells(scenarioCard(), { impl: { tokens: 10, text: '## 절차\nx' } }).some(s => s.code === 'no-exit-criteria'));
check('카드에 절차가 없어도 정상(중복 금지)', findSmells(scenarioCard(), { impl: BODY }).length === 0);
// 측정 근거가 있는 두 금지
check('roleDefinition 금지', findSmells(scenarioCard(['roleDefinition: 너는 전문가다']), { impl: BODY }).some(s => s.code === 'persona-framing'));
check('증거 없는 Active 금지',
  findSmells(scenarioCard(['status: Active'], 'status'), { impl: BODY }).some(s => s.code === 'unevidenced-active'));
check('본문 비대 감지', findSmells(scenarioCard(), { impl: { ...BODY, tokens: 5000 } }).some(s => s.code === 'scenario-bloat'));
// 비시나리오 카드는 추가 규율 미적용
check('kind: script엔 시나리오 규율 미적용',
  findSmells(GOOD, { impl: { tokens: 9999, text: '' } }).length === 0);

// --- 실레포 통합: 카탈로그 전 카드가 해부 충족 ---
const cards = gather();
if (cards.length) check('실레포 카드 전부 smell 0', cards.every(c => c.smells.length === 0));
else console.log('(tools 평면 비어 있음: 픽스처 검사 건너뜀)');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
