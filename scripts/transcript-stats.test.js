// scripts/transcript-stats.test.js
// 순수 로직(toolUses, isRitual, analyze) 테스트. 실행: node scripts/transcript-stats.test.js
const { toolUses, isRitual, analyze } = require('./transcript-stats');

let pass = 0, fail = 0;
function check(label, cond) { if (cond) pass++; else { fail++; console.error(`FAIL ${label}`); } }

// --- toolUses: 중첩 어디에 있든 순서대로 추출 ---
const line = { type: 'assistant', message: { content: [{ type: 'text', text: 'x' }, { type: 'tool_use', name: 'Bash', input: { command: 'ls' } }, { type: 'tool_use', name: 'Edit', input: {} }] } };
const calls = toolUses(line);
check('중첩 추출 + 순서', calls.length === 2 && calls[0].name === 'Bash' && calls[1].name === 'Edit');
check('비객체 무시', toolUses('str').length === 0);

// --- isRitual: 이름·Bash 명령·MCP·스킬 인자 ---
check('MCP 이름', isRitual({ name: 'mcp__union-stack__upward_fetch', input: {} }));
check('Bash 명령', isRitual({ name: 'Bash', input: { command: 'node scripts/upward-fetch.js WO-01a-1' } }));
check('blast-radius도 의례', isRitual({ name: 'Bash', input: { command: 'node scripts/blast-radius.js 01a' } }));
check('스킬 인자', isRitual({ name: 'Skill', input: { skill: 'upward-fetch' } }));
check('PowerShell 명령', isRitual({ name: 'PowerShell', input: { command: 'node scripts/blast-radius.js 01a' } }));
check('무관 호출 아님', isRitual({ name: 'Bash', input: { command: 'git status' } }) === false);
// 계측 오염 회귀: 문서에 의례 이름을 *쓰는* 편집은 수행이 아니다
check('Write 내용 언급은 수행 아님',
  isRitual({ name: 'Write', input: { file_path: 'a.md', content: '# blast-radius 설명\nupward-fetch 의례' } }) === false);
check('Edit 내용 언급은 수행 아님',
  isRitual({ name: 'Edit', input: { new_string: 'node scripts/upward-fetch.js' } }) === false);
check('Agent 프롬프트 언급은 수행 아님',
  isRitual({ name: 'Agent', input: { prompt: 'review upward-fetch and blast-radius' } }) === false);

// --- analyze: 의례 자발 수행률 ---
const S = (...names) => ({ calls: names.map(n => (typeof n === 'string' ? { name: n, input: {} } : n)) });
const r = analyze([
  S('Bash', { name: 'Bash', input: { command: 'node scripts/upward-fetch.js 01a' } }, 'Edit'), // 의례 후 편집 ✓
  S('Read', 'Edit'),                                                                            // 의례 없이 편집 ✗
  S('Read', 'Grep'),                                                                            // 편집 없음(분모 제외)
  S('Edit', { name: 'Bash', input: { command: 'node scripts/upward-fetch.js 01a' } }),          // 편집 *후* 의례 ✗
]);
check('세션 집계', r.sessions === 4 && r.withEdits === 3);
check('수행률 = 1/3', r.ritualBefore === 1 && r.ritualRate === 0.33);
check('도구 카운트', r.toolCounts.Edit === 3 && r.toolCounts.Read === 2 && r.toolCounts.Bash === 3);
check('편집 세션 0 → rate null', analyze([S('Read')]).ritualRate === null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
