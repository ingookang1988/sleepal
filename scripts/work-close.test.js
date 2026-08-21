// scripts/work-close.test.js
// 순수 로직 테스트. 실행: node scripts/work-close.test.js
const {
  field, listField, parseWo, mentionsLineage, checkClosure, buildTable, inject, CONTRACT,
} = require('./work-close');
const { validateContract } = require('./gate-contract');

let pass = 0, fail = 0;
function check(label, cond) { if (cond) pass++; else { fail++; console.error(`FAIL ${label}`); } }

const WO = [
  '<!-- (예시) -->',
  '---',
  'id: WO-01a-1',
  'title: (예시) 인증 게이트웨이 배선',
  'status: Active',
  'parent: PLAN-01a',
  'evidence: "node scripts/x.test.js 12/12"',
  'closed_by:',
  '  - .union-stack/feature/live.md',
  '  - .union-stack/verification/derived/state.md',
  '---',
  '## 목표',
].join('\n');

// --- frontmatter 파싱 ---
const wo = parseWo('.union-stack/sprint/WO-01a-1_example.md', WO);
check('WO 레코드 파싱', wo && wo.id === '01a-1' && wo.status === 'Active' && wo.parent === 'PLAN-01a');
check('따옴표 벗기기', wo.evidence === 'node scripts/x.test.js 12/12');
check('블록 리스트 파싱', wo.closed_by.length === 2 && wo.closed_by[0].endsWith('live.md'));
check('인라인 리스트 파싱', listField('closed_by: [a.md, "b.md"]', 'closed_by').join(',') === 'a.md,b.md');
check('없는 필드는 null', field('id: x', 'nope') === null);
check('빈 값은 null', field('evidence:   ', 'evidence') === null);
check('WO 아닌 도메인은 null', parseWo('.union-stack/sprint/HANDOFF.md', WO) === null);
check('frontmatter 없으면 malformed', parseWo('.union-stack/sprint/WO-01a-2_x.md', '# 본문만').malformed === true);

// --- 계보 참조 판정 (흔적을 *확인 가능한 사실*로 만드는 검사) ---
check('자기 ID 참조 인식', mentionsLineage('행: [WO-01a-1] 배선 완료', '01a-1'));
check('조상 ID 참조 인식', mentionsLineage('| (예시) 로그인 | [PLAN-01a] | 운영 |', '01a-1'));
check('무관 계보는 불인식', mentionsLineage('[PLAN-02b] 다른 것', '01a-1') === false);
check('브래킷 없으면 불인식', mentionsLineage('PLAN-01a 를 산문으로만 언급', '01a-1') === false);

// --- 닫힘 점검 ---
const traces = {
  '.union-stack/feature/live.md': '| (예시) | [PLAN-01a] | 운영 |',
  '.union-stack/verification/derived/state.md': '- [WO-01a-1] 반영됨',
};
check('충족 시 이슈 0', checkClosure(wo, traces).issues.length === 0);

const noTrace = { ...wo, closed_by: [] };
check('흔적 없음 → no-trace', checkClosure(noTrace, {}).issues.some(i => i.code === 'no-trace'));

const noEv = { ...wo, evidence: null };
check('증거 없음 → no-evidence', checkClosure(noEv, traces).issues.some(i => i.code === 'no-evidence'));

const noneEv = { ...wo, evidence: 'none — 문서 수정, 실행 산출물 없음' };
check('`none — 이유`는 통과', checkClosure(noneEv, traces).issues.length === 0);

// 선언만 하고 반영 안 한 경우 — 이 검사가 흔적을 선언에서 사실로 바꾼다.
check('참조 없는 흔적 → trace-unreferenced',
  checkClosure(wo, { ...traces, '.union-stack/feature/live.md': '무관한 내용' })
    .issues.some(i => i.code === 'trace-unreferenced'));
check('읽을 수 없는 흔적 → trace-missing',
  checkClosure(wo, { '.union-stack/verification/derived/state.md': traces['.union-stack/verification/derived/state.md'] })
    .issues.some(i => i.code === 'trace-missing'));

// 형제가 전부 Closed → 부모 전이 후보(정보, 이슈 아님)
const sibs = [wo, { id: '01a-2', parent: 'PLAN-01a', status: 'Closed' }];
check('형제 전부 Closed → info', checkClosure(wo, traces, sibs).info.length === 1);
check('형제 미완이면 info 없음',
  checkClosure(wo, traces, [wo, { id: '01a-2', parent: 'PLAN-01a', status: 'Active' }]).info.length === 0);

// --- 작업대 뷰 ---
const table = buildTable([
  { id: '01a-2', title: 'B', status: 'Closed', parent: 'PLAN-01a', evidence: 'x' },
  { id: '01a-1', title: 'A', status: 'Active', parent: 'PLAN-01a', evidence: 'x' },
  { id: '01b-1', title: 'C', status: 'Draft', parent: 'PLAN-01b', evidence: 'none — 문서' },
]);
check('Closed 는 뷰에서 자동 제외', !table.includes('01a-2'));
check('활성만 id 정렬', table.indexOf('01a-1') < table.indexOf('01b-1'));
check('증거 유무 표기', table.includes('| 있음 |') && table.includes('| 해당없음 |'));
check('활성 0건이면 빈 행', buildTable([{ id: '01a-1', status: 'Closed' }]).includes('활성 WO 없음'));

// --- 주입 ---
const NX = '# t\n<!-- worktable:begin (gen) -->\nstale\n<!-- worktable:end -->\ntail';
check('블록 치환', inject(NX, table).includes('| WO |') && !inject(NX, table).includes('stale'));
check('마커 없으면 null', inject('# no markers', table) === null);
const CRLF = NX.split('\n').join('\r\n');
check('지배적 EOL 보존(CRLF)', !/(?<!\r)\n/.test(inject(CRLF, table)));

check('CONTRACT 필수 필드 완비', validateContract(CONTRACT).length === 0);

console.log(`work-close.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
