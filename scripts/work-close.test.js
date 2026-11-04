// scripts/work-close.test.js
// 순수 로직 테스트. 실행: node scripts/work-close.test.js
const {
  field, listField, parseWo, mentionsLineage, checkClosure, checkIssuance, buildTable, inject, CONTRACT,
  run,
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
// #8 회귀: 후보 목록은 사실상 규범으로 읽힌다 — feature/flow/ 가 빠지면 E2E 경로를
// 바꾼 WO 가 FLOW-* 되쓰기에서 멀어진다(하류 실측: 어트랙션 스트리밍 WO 5건).
check('#8: 후보에 feature/flow/ 포함',
  checkClosure(noTrace, {}).issues.find(i => i.code === 'no-trace').msg.includes('.union-stack/feature/flow/'));
check('#8: FLOW 흔적 지정 시 정상 통과', checkClosure(
  { ...wo, closed_by: ['.union-stack/feature/flow/FLOW-01a_example_lineage.md'] },
  { '.union-stack/feature/flow/FLOW-01a_example_lineage.md': '| UI | x | [WO-01a-1] 반영 |' },
).issues.length === 0);

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

// 계보에 PHASE 가 있으면 exit criteria 검토 후보(정보 — 강제 아님, [PRO-19] ②)
check('계보 PHASE → info', checkClosure(wo, traces, [], [{ id: '01' }]).info.some(i => i.includes('[PHASE-01]')));
check('PHASE 없으면 info 없음', checkClosure(wo, traces, [], []).info.length === 0);

// --- 발행 점검 ([PRO-19] ① — 종료 의례의 상류 대칭) ---
const IDX = [{ domain: 'PLAN', id: '01a', file: 'p.md' }, { domain: 'PRO', id: '10', file: 'q.md' }];
// 픽스처 WO 는 `## 목표`만 있다 → '수용 기준'이 걸린다. '증거'는 frontmatter evidence: 가 있어 충족([PRO-28] ① — 절 불요).
check('필수 절 누락 검출(증거는 frontmatter 로 충족)', (() => {
  const i = checkIssuance(wo, IDX).find(x => x.code === 'anatomy-missing');
  return i && i.msg.includes('수용 기준') && !i.msg.includes('## 증거');
})());
const FULL_WO = parseWo('.union-stack/sprint/WO-01a-1_x.md', WO + '\n## 수용 기준\n- x\n## 증거\n- y');
check('3절 완비 + 실존 parent → 이슈 0', checkIssuance(FULL_WO, IDX).length === 0);
check('parent 미기입 → no-parent', checkIssuance({ ...FULL_WO, parent: null }, IDX).some(i => i.code === 'no-parent'));
check('죽은 parent → parent-missing', checkIssuance(FULL_WO, [{ domain: 'PRO', id: '10', file: 'q.md' }]).some(i => i.code === 'parent-missing'));
// 도메인까지 맞아야 실존 — 다른 도메인의 동일 계보(FLOW-01a)가 죽은 부모(PLAN-01a)를 가리면 안 된다.
check('도메인 불일치는 실존 아님', checkIssuance(FULL_WO, [{ domain: 'FLOW', id: '01a', file: 'f.md' }]).some(i => i.code === 'parent-missing'));
// 계보 불일치(승인 §7-⑤ 포함): PLAN-02 는 01a-1 의 조상이 아니다 — 파티션([PRO-05]) 오분할 방지.
check('계보 절단 → lineage-break', checkIssuance({ ...FULL_WO, parent: 'PLAN-02' }, [{ domain: 'PLAN', id: '02', file: 'p2.md' }])
  .some(i => i.code === 'lineage-break'));
// 계보 밖 도메인이라도 계보가 이어지면 통과(현행 관례: WO-10a-1 의 parent PRO-10)
check('PRO 부모라도 계보 일치면 통과', checkIssuance({ ...FULL_WO, id: '10a-1', parent: 'PRO-10' }, IDX).length === 0);
check('frontmatter 없으면 no-frontmatter', checkIssuance(parseWo('.union-stack/sprint/WO-01a-2_x.md', '# 본문만'), IDX)
  .some(i => i.code === 'no-frontmatter'));

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

// --- [PRO-27] ② parseWo 가 statusMap·evidenceFields 로 로컬 어휘·별칭을 읽는다 ---
const { parseConfig: parseAdapter } = require('./adapter');
const vocabCfg = parseAdapter('{"statusMap": {"Done": "Closed"}, "evidenceFields": {"evidence": ["implementation_commit"], "closed_by": ["surfaces"]}}');
const LOCAL_WO = ['---', 'id: WO-40', 'status: Done', 'parent: PLAN-01', 'implementation_commit: "abc123"', 'surfaces: [.union-stack/feature/live.md]', '---', '## 목표', '## 수용 기준', '## 증거'].join('\n');
const lw = parseWo('.union-stack/sprint/WO-40_x.md', LOCAL_WO, vocabCfg);
check('statusMap: Done → Closed', lw.status === 'Closed');
check('rawStatus 보존', lw.rawStatus === 'Done');
check('evidence 별칭(implementation_commit)', lw.evidence === 'abc123');
check('closed_by 별칭(surfaces)', lw.closed_by.length === 1 && lw.closed_by[0].includes('live.md'));
check('매핑 없이 읽으면 로컬 어휘·별칭 미인식(상류 기본)', parseWo('.union-stack/sprint/WO-40_x.md', LOCAL_WO).status === 'Done' && parseWo('.union-stack/sprint/WO-40_x.md', LOCAL_WO).evidence === null);
check('상류 필드가 있으면 상류 필드 우선', parseWo('.union-stack/sprint/WO-40_x.md', LOCAL_WO.replace('parent: PLAN-01', 'parent: PLAN-01\nevidence: "real"'), vocabCfg).evidence === 'real');
check('Closed 로 매핑된 WO 는 작업대에서 빠진다', !buildTable([lw]).includes('WO-40'));

// --- [PRO-27] ③ 산술이 적용되지 않는 구간에선 lineage-break 를 묻지 않는다(frontmatter 계보가 정본) ---
const serialWo = parseWo('.union-stack/sprint/WO-345_x.md', ['---', 'id: WO-345', 'status: Active', 'parent: PLAN-07', 'evidence: "x"', 'closed_by: []', '---', '## 목표', '## 수용 기준', '## 증거'].join('\n'));
const serialIdx = [{ domain: 'PLAN', id: '07', file: 'p' }, { domain: 'WO', id: '345', file: 'w', arithmetic: false }];
check('arithmetic:false → lineage-break 없음', !checkIssuance(serialWo, serialIdx).some(i => i.code === 'lineage-break'));
check('arithmetic 적용이면 여전히 lineage-break', checkIssuance(serialWo, [{ domain: 'PLAN', id: '07', file: 'p' }, { domain: 'WO', id: '345', file: 'w', arithmetic: true }]).some(i => i.code === 'lineage-break'));

// --- [PRO-22] 단계 2 영수증 인용 — 선언 검사가 있는 레포에서 실값 evidence 는 rcpt: 를 인용한다(소급 없음: n/a 허용) ---
const rcptCtx = { declared: true, receipts: [{ date: '2026-10-16', scope: 'product', name: 'unit', sha: 'abc1234', outcome: 'PASS' }] };
const evWo = ev => ({ ...FULL_WO, evidence: ev, closed_by: ['.union-stack/feature/live.md'] });
const rcTraces = { '.union-stack/feature/live.md': '[WO-01a-1] 반영' };
check('인용 없음 → no-receipt CLARIFY', checkClosure(evWo('테스트 12/12'), rcTraces, [], [], rcptCtx).issues.some(i => i.code === 'no-receipt'));
check('rcpt:n/a → 통과', !checkClosure(evWo('rcpt:n/a — 소급 없음'), rcTraces, [], [], rcptCtx).issues.length);
check('실재하는 영수증 인용 → 통과', !checkClosure(evWo('스위트 녹색 rcpt:unit@abc1234'), rcTraces, [], [], rcptCtx).issues.length);
check('없는 영수증 인용 → receipt-missing(수기 인용 의심)', checkClosure(evWo('rcpt:unit@deadbee'), rcTraces, [], [], rcptCtx).issues.some(i => i.code === 'receipt-missing'));
check('none — 이유 는 인용 면제', !checkClosure(evWo('none — 문서 작업'), rcTraces, [], [], rcptCtx).issues.length);
check('선언 없는 레포는 묻지 않는다', !checkClosure(evWo('테스트 12/12'), rcTraces, [], [], { declared: false, receipts: [] }).issues.length && !checkClosure(evWo('테스트 12/12'), rcTraces, [], []).issues.length);

// --- [PRO-26] ④ 작업대 행의 파생 라벨 — label 있으면 `[WO-id · label]`, 없으면 기존 꼴 ---
check('라벨 있는 레코드', buildTable([{ ...FULL_WO, status: 'Active', label: 'auth_wiring' }]).includes('| [WO-01a-1 · auth_wiring] |'));
check('라벨 없는 레코드는 기존 꼴', buildTable([{ ...FULL_WO, status: 'Active' }]).includes('| [WO-01a-1] |'));

// --- [PRO-28] ② 발행 린트가 sections 별칭 맵을 읽는다 — 매칭 실패는 CLARIFY(현행 anatomy-missing), REJECT 아님 ---
const { parseConfig: parseCfgS } = require('./adapter');
const cfgS = parseCfgS('{"sections": {"목표": ["목적·진입 조건"], "수용 기준": ["완료 기준"], "증거": ["검증"]}}');
const ALIAS_WO = ['---', 'id: WO-50', 'status: Active', 'parent: PLAN-01a', 'closed_by: []', '---', '## 1. 목적·진입 조건', '## 완료 기준', '## 검증'].join('\n');
check('별칭 맵: 어답터 표기 3절 → 누락 0', parseWo('.union-stack/sprint/WO-50_x.md', ALIAS_WO, cfgS).missingSections.length === 0);
check('맵 없음: 같은 문서는 3절 누락(현행 유지)', parseWo('.union-stack/sprint/WO-50_x.md', ALIAS_WO, null).missingSections.length === 3);
// 증거는 절이 없어도 frontmatter evidence: 로 충족([PRO-28] ① — 회신 2곳 일치: `## 증거` 0건, 증거는 frontmatter)
const EV_WO = ['---', 'id: WO-51', 'status: Active', 'parent: PLAN-01a', 'evidence: "npm test 3/3"', 'closed_by: []', '---', '## 목표', '## 수용 기준'].join('\n');
check('frontmatter evidence 가 있으면 증거 절 누락 아님', JSON.stringify(parseWo('.union-stack/sprint/WO-51_x.md', EV_WO, null).missingSections) === '[]');
check('evidence 도 절도 없으면 증거 누락', JSON.stringify(parseWo('.union-stack/sprint/WO-51_x.md', EV_WO.replace('evidence: "npm test 3/3"\n', ''), null).missingSections) === '["증거"]');
check('발행 점검: 별칭 맵 WO 는 anatomy 이슈 0', !checkIssuance(parseWo('.union-stack/sprint/WO-50_x.md', ALIAS_WO, cfgS), [{ domain: 'PLAN', id: '01a', file: 'p.md' }]).some(i => i.code === 'anatomy-missing'));
check('발행 점검: 맵 없는 어답터 표기는 anatomy-missing(CLARIFY) + 맵 안내', (() => { const i = checkIssuance(parseWo('.union-stack/sprint/WO-50_x.md', ALIAS_WO, null), [{ domain: 'PLAN', id: '01a', file: 'p.md' }]).find(x => x.code === 'anatomy-missing'); return i && /sections/.test(i.msg); })());

// --- 어답터 C 실측 ①: 손 이식 어답터엔 next.md 가 없다 — --table 이 ENOENT 로 죽었다. 검사는 CLARIFY, --write 는 마커 블록을 가진 뷰를 만든다. ---
const fsN = require('fs'), osN = require('os'), pathN = require('path');
const nTmp = fsN.mkdtempSync(pathN.join(osN.tmpdir(), 'wc-next-'));
try {
  fsN.mkdirSync(pathN.join(nTmp, '.union-stack/sprint'), { recursive: true });
  fsN.writeFileSync(pathN.join(nTmp, '.union-stack/sprint/WO-01a-1_x.md'), '---\nid: WO-01a-1\nstatus: Active\nparent: PLAN-01a\nevidence: "x"\nclosed_by: []\n---\n## 목표\n## 수용 기준\n## 증거\n');
  const hush = fn => { const c = console.log, e = console.error; console.log = () => {}; console.error = () => {}; try { return fn(); } finally { console.log = c; console.error = e; } };
  check('next.md 없음: --table 은 CLARIFY(3), 크래시 아님', hush(() => run(['--table'], nTmp)), 3);
  check('next.md 없음: --table --write 는 뷰를 만든다(PASS)', hush(() => run(['--table', '--write'], nTmp)), 0);
  const made = fsN.readFileSync(pathN.join(nTmp, '.union-stack/sprint/next.md'), 'utf8');
  check('만든 뷰: 마커 블록 + 표 + WO 행', made.includes('<!-- worktable:begin') && made.includes('<!-- worktable:end -->') && made.includes('[WO-01a-1'), true);
  check('만든 뒤 재검사 PASS', hush(() => run(['--table'], nTmp)), 0);
  // [WO-29a-3] 어답터에 쓰는 생성 파일의 상류 ID 는 up: 접두 — 로컬 PRO-15 가 없는 어답터의 ref-linter --strict Fail-close(C 실측)
  check('만든 뷰(어답터): 상류 ID 는 [up:PRO-15]', made.includes('[up:PRO-15]') && !made.includes('([PRO-15])'), true);
  check('만든 뷰: 로컬 해소 대상 참조 0(ref-linter extractRefs)', require('./ref-linter').extractRefs(made).filter(r => !r.external && r.domain === 'PRO').length === 0);
} finally { fsN.rmSync(nTmp, { recursive: true, force: true }); }

// --- 어답터 C 실측 ③: 상류 어휘 머리의 산문 status("Active — core production green…")는 첫 토큰으로 읽는다 — ACTIVE 정확 일치가 440 중 2 로 집계됐다. ---
check('산문 status 의 첫 토큰이 상류 어휘면 그 토큰', parseWo('.union-stack/sprint/WO-60_x.md', ['---', 'id: WO-60', 'status: Active — core production green (2026-10)', 'parent: PLAN-01a', '---', '## 목표'].join('\n')).status, 'Active');
check('rawStatus 는 원문 보존', parseWo('.union-stack/sprint/WO-60_x.md', ['---', 'id: WO-60', 'status: Active — core production green (2026-10)', 'parent: PLAN-01a', '---', '## 목표'].join('\n')).rawStatus, 'Active — core production green (2026-10)');

console.log(`work-close.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
