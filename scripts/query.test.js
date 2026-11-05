// scripts/query.test.js
// 순수 조회 로직 단위 테스트(합성 색인 — 레포 비의존). 실행: node scripts/query.test.js
const { upwardFetch, blastRadius, contractEdges, normEnforcement, concernUsage, roadmapWiring, whereToRecord } = require('./query');

let pass = 0, fail = 0;
function check(label, got, exp) {
  const ok = JSON.stringify(got) === JSON.stringify(exp);
  if (ok) pass++; else { fail++; console.error(`FAIL ${label}: got ${JSON.stringify(got)}, exp ${JSON.stringify(exp)}`); }
}

const index = [
  { domain: 'PLAN', id: '01', file: 'plan/PLAN-01_x.md' },
  { domain: 'CON', id: '01', file: 'reference/contracts/CON-01_x.md' },
  { domain: 'FLOW', id: '01a', file: 'feature/flow/FLOW-01a_x.md' },
  { domain: 'MTG', id: '01a', file: 'plan/meetings/MTG-01a_x.md' },
  { domain: 'LSN', id: '01a', file: 'reference/lessons/LSN-01a_x.md' },
  { domain: 'WO', id: '01a1', status: 'Active', file: 'sprint/WO-01a1_x.md' },
  { domain: 'FLOW', id: '01b', status: 'Verifying', file: 'feature/flow/FLOW-01b_x.md' },
];

// --- upwardFetch ---
const uf = upwardFetch('01a1', index);
check('uf chain', uf.chain, ['01a1', '01a', '01']);
check('uf context domains', uf.context.map(c => c.domain), ['CON', 'FLOW', 'MTG', 'PLAN']);
check('uf lessons', uf.lessons.map(l => l.id), ['01a']);
// PHASE 도 계보 맥락에 실린다([PRO-19] ② — roadmap 은 plan·sprint 의 macro-direction parent)
const ufPhase = upwardFetch('01a1', [...index, { domain: 'PHASE', id: '01', file: 'project/roadmap/PHASE-01_x.md' }]);
check('uf PHASE 편입', ufPhase.context.some(c => c.domain === 'PHASE' && c.id === '01'), true);

// --- roadmapWiring: 로드맵 배선 관측([PRO-19] ② — 판정 없는 표면화) ---
const rwIndex = [
  { domain: 'PHASE', id: '01', file: 'PHASE-01.md' },              // 활성 계보 01 이 내려온다
  { domain: 'PHASE', id: '02', file: 'PHASE-02.md' },              // 아무도 안 내려온다 → 정체
  { domain: 'PLAN', id: '01a', status: 'Active', file: 'PLAN-01a.md' },
  { domain: 'WO', id: '01a-1', status: 'Draft', file: 'WO-01a-1.md' },
  { domain: 'WO', id: '10a-1', status: 'Draft', file: 'WO-10a-1.md' }, // 뿌리에 PHASE 없음 → 무연결
  { domain: 'WO', id: '02a-1', status: 'Closed', file: 'WO-02a-1.md' }, // 종결 — 활성 아님(PHASE-02 를 못 살린다)
  { domain: 'FLOW', id: '01a', status: 'Active', file: 'FLOW-01a.md' }, // 작업 도메인 아님 — 계수 제외
];
const rw = roadmapWiring(rwIndex);
check('rw 계수', [rw.phases, rw.active], [2, 3]);
check('rw 무연결 작업', rw.unanchored, ['WO-10a-1']);
check('rw 정체 PHASE(종결 자손은 못 살린다)', rw.stale, ['PHASE-02']);
check('rw 빈 평면', roadmapWiring([]), { phases: 0, active: 0, unanchored: [], stale: [] });

// --- blastRadius ---
const br = blastRadius('01a', index);
check('br affected ids', br.affected.map(a => a.id).sort(), ['01a', '01a', '01a', '01a1']);
check('br not blocked', br.blocked, false);
const brLocked = blastRadius('01b', index);
check('br blocked(Live)', brLocked.blocked, true);
check('br 계약 간선 없으면 viaContract 빈 배열', br.viaContract, []);

// --- blastRadius: 계약의 계보 밖 소비자 간선([PRO-16]) ---
// 계약은 포함관계 아닌 당사자끼리 공유되므로 소비자는 늘 다른 계보에 있다 — 트리 산술로는 안 보인다.
const cIndex = [
  { domain: 'CON', id: '05', status: 'Active', file: 'contracts/CON-05_api.md',
    consumers: ['FLOW-01a', 'FLOW-07b', 'FLOW-99z'] },        // FE · BE · 오타(미해소)
  { domain: 'FLOW', id: '01a', status: 'Active', file: 'flow/FLOW-01a_fe.md' },
  { domain: 'FLOW', id: '07b', status: 'Verifying', file: 'flow/FLOW-07b_be.md' },
  { domain: 'WO', id: '07b-1', status: 'Draft', file: 'sprint/WO-07b-1_task.md' },
  { domain: 'PLAN', id: '42', status: 'Active', file: 'plan/PLAN-42_unrelated.md' },
];
const con = blastRadius('05', cIndex);
check('계약: 소비자가 영향권에 합집합', con.affected.map(a => `${a.domain}-${a.id}`).sort(),
  ['CON-05', 'FLOW-01a', 'FLOW-07b', 'WO-07b-1']);
check('계약: 무관 계보는 안 딸려온다', con.affected.some(a => a.id === '42'), false);
check('계약: 소비자 자손까지 보수적 포함', con.viaContract.some(a => a.id === '07b-1'), true);
check('계약: 간선 출처 표기', con.viaContract.every(a => a.via === 'CON-05'), true);
check('계약: Verifying 소비자가 Fail-close 발동', con.blocked, true);
check('계약: 잠금은 소비자 쪽', con.locked.map(l => l.id), ['07b']);
check('계약: 미해소 소비자 표면화', con.unresolvedConsumers.map(u => u.ref), ['FLOW-99z']);
// 방향은 한쪽만 — 소비자에서 계약을 역으로 끌어오지 않는다(정본이 둘이면 드리프트).
check('계약: 역방향 아님', blastRadius('01a', cIndex).affected.map(a => a.domain), ['FLOW']);

// --- contractEdges: 채택·무결성 전수 조사([PRO-16] §5 반증 계기) ---
const ce = contractEdges(cIndex);
check('ce 계약 수', ce.contracts, 1);
check('ce 선언 문서·간선 수', [ce.declaring, ce.edges], [1, 3]);
check('ce 해소/미해소 분리', [ce.resolved, ce.unresolved.length], [2, 1]);
check('ce 미해소 출처 표기', ce.unresolved[0], { ref: 'FLOW-99z', from: 'CON-05', file: 'contracts/CON-05_api.md' });
// 같은 계보 소비자는 계보 산술이 이미 덮으므로 간선이 무의미하다 — 오해 방지로 표면화.
const ceDup = contractEdges([
  { domain: 'CON', id: '01', file: 'c.md', consumers: ['FLOW-01a'] },
  { domain: 'FLOW', id: '01a', file: 'f.md' },
]);
check('ce 동일계보 간선을 무의미로 표기', [ceDup.redundant, ceDup.byContract[0].redundant], [1, ['FLOW-01a']]);
check('ce 선언 없으면 0', contractEdges([{ domain: 'CON', id: '9', file: 'x.md' }]).edges, 0);
check('ce 빈 평면', contractEdges([]).contracts, 0);

// --- normEnforcement: 당위 축 집행 등급(인용 != 집행 — 관측) ---
const nIndex = [
  { domain: 'ARCH', id: '00', status: 'Active', file: 'architecture/ARCH-00_x.md' },
  { domain: 'ARCH', id: '01', status: 'Active', file: 'architecture/ARCH-01_y.md' },
  { domain: 'INF', id: '01', status: 'Active', file: 'architecture/infra/INF-01_z.md' },
  { domain: 'PLAN', id: '01', file: 'plan/PLAN-01.md' },   // 규범 아님 — 안 들어와야 한다
];
const ne = normEnforcement(nIndex,
  [{ file: 'scripts/g.js', isGate: true, mentions: ['ARCH-00'] },
   { file: 'scripts/x.js', isGate: false, mentions: ['ARCH-01'] }],
  { 'INF-01': 2 });
check('ne 규범 도메인만(ARCH·INF)', ne.total, 3);
check('ne 등급 3분', [ne.gated, ne.cited, ne.isolated], [1, 2, 0]);
check('ne 게이트 출처', ne.norms.find(n => n.key === 'ARCH-00').gates, ['scripts/g.js']);
check('ne 게이트 아닌 인용은 cited', ne.norms.find(n => n.key === 'ARCH-01').grade, 'cited');
check('ne 평면 인용만 있어도 cited', ne.norms.find(n => n.key === 'INF-01').grade, 'cited');
check('ne 아무도 안 보면 isolated', normEnforcement(nIndex).isolated, 3);
check('ne 규범 없으면 0', normEnforcement([{ domain: 'PLAN', id: '01', file: 'p.md' }]).total, 0);

// --- concernUsage: [PRO-04] 오버레이 채택 ---
check('cu 미사용', concernUsage([{ domain: 'ARCH', id: '00' }]), { tagged: 0, total: 1, byTag: {} });
check('cu 태그 집계', concernUsage([
  { domain: 'ARCH', id: '00', concerns: ['security', 'observability'] },
  { domain: 'INF', id: '01', concerns: ['security'] },
]), { tagged: 2, total: 2, byTag: { security: 2, observability: 1 } });

// --- whereToRecord ---
check('route pivot→HISTORY', whereToRecord('pivot').match.destination, '.union-stack/project/HISTORY.md');
check('route lesson→lessons', whereToRecord('a repeated bug').match.destination, '.union-stack/reference/lessons/LSN-*');
check('route adr→ledger', whereToRecord('tactical decision').match.destination, '.union-stack/archive_ledger.md');
check('route unknown→null', whereToRecord('zzz').match, null);
check('route all has 6', whereToRecord('x').all.length, 6);
// 환경/크로스레포 사실은 사적 메모리로(lessons 아님) — 순서가 경계([ADR-11])
check('route env→private memory', /memory/i.test(whereToRecord('a machine-specific tooling-quirk').match.destination), true);
check('route env not lessons', /lessons/.test(whereToRecord('cross-repo environment quirk').match.destination), false);
// 레포/제품 특정 반복 실패는 여전히 lessons(환경 키워드 없으면)
check('route repo pitfall→lessons still', whereToRecord('a repeated pitfall in this feature').match.destination, '.union-stack/reference/lessons/LSN-*');

// --- [PRO-27] ① 계약 소비자의 up: 참조는 미해소가 아니라 외부(externalConsumers) ---
const brUp = blastRadius('01', [
  ...index.filter(d => d.domain !== 'CON'),
  { domain: 'CON', id: '01', file: 'reference/contracts/CON-01_x.md', consumers: ['up:FLOW-09', 'FLOW-99'] },
]);
check('외부 소비자 분류', brUp.externalConsumers.map(u => u.ref), ['up:FLOW-09']);
check('오타 소비자는 여전히 미해소', brUp.unresolvedConsumers.map(u => u.ref), ['FLOW-99']);

// --- [PRO-27] ③ 일부: 빈 upward-fetch 는 (없음)+PASS 가 아니라 CLARIFY ---
const { fetchOutcome } = require('./query');
check('맥락 있으면 PASS', fetchOutcome(upwardFetch('01a1', index)).outcome, 'PASS');
const empty = fetchOutcome(upwardFetch('345', index));
check('맥락 0건이면 CLARIFY', empty.outcome, 'CLARIFY');
check('CLARIFY 에 질문 한 줄', typeof empty.question === 'string' && empty.question.length > 0, true);

// CLI 표면 — 종료코드가 계약([PRO-11] CLARIFY=3)대로 나오는가. 상류 레포에서 실행(색인은 상류 자신).
const { spawnSync } = require('child_process');
const cliCwd = require('path').resolve(__dirname, '..');
const cli = (args) => spawnSync(process.execPath, ['scripts/upward-fetch.js', ...args], { cwd: cliCwd, encoding: 'utf8' });
const vac = cli(['WO-999']);
check('CLI: 계보 맥락 0 → exit 3(CLARIFY)', vac.status, 3);
check('CLI: CLARIFY 문구', /CLARIFY/.test(vac.stdout + vac.stderr), true);
const ext = cli(['up:PRO-27']);
check('CLI: up: 인자는 외부 참조 INFO · exit 0', ext.status, 0);
check('CLI: 외부 참조 문구', /상류 참조/.test(ext.stdout + ext.stderr), true);
const extBr = spawnSync(process.execPath, ['scripts/blast-radius.js', 'up:PRO-27'], { cwd: cliCwd, encoding: 'utf8' });
check('blast-radius CLI: up: 인자 exit 0', extBr.status, 0);

// --- [PRO-27] ③ 조상 = 산술 ∪ frontmatter 부모 ---
const linIndex = [
  { domain: 'PHASE', id: '01', file: 'PHASE-01.md' },
  { domain: 'PLAN', id: '07', file: 'PLAN-07.md', parents: ['PHASE-01'] },
  { domain: 'PLAN', id: '12', file: 'PLAN-12.md' },
  { domain: 'PRO', id: '36', file: 'PRO-36.md' },
  { domain: 'LSN', id: '07', file: 'LSN-07.md' },
  { domain: 'WO', id: '345', status: 'Active', file: 'WO-345.md', parents: ['PLAN-07'] },
  { domain: 'WO', id: '12a-1', status: 'Verifying', file: 'WO-12a-1.md', parents: ['PRO-36'], arithmetic: false },
  { domain: 'WO', id: '12b-1', status: 'Active', file: 'WO-12b-1.md' },
];
const ufS = upwardFetch('345', linIndex);
check('선언 부모(plan:)가 맥락에', ufS.context.map(c => `${c.domain}-${c.id}`), ['PHASE-01', 'PLAN-07']);
check('선언 부모는 via:frontmatter', ufS.context.find(c => c.id === '07').via, 'frontmatter');
check('선언 부모의 조상(PHASE)까지 폐포', ufS.context.some(c => c.domain === 'PHASE'), true);
check('선언 목록 노출(폐포 순)', ufS.declared, ['PLAN-07', 'PHASE-01']);
check('LSN 은 합산 조상 기준', ufS.lessons.map(l => l.id), ['07']);
check('맥락 있으니 PASS', fetchOutcome(ufS).outcome, 'PASS');
const ufL = upwardFetch('12a-1', linIndex);
check('산술 차단(arithmetic:false): 무관한 PLAN-12 상속 안 함', ufL.context.some(c => c.domain === 'PLAN' && c.id === '12'), false);
check('산술 차단이어도 선언 부모(PRO-36, 도메인 무관)는 싣는다', ufL.context.map(c => `${c.domain}-${c.id}`), ['PRO-36']);
check('산술 차단 시 chain 은 자기 자신뿐', ufL.chain, ['12a-1']);
check('산술 적용 WO 는 기존대로 PLAN-12 상속', upwardFetch('12b-1', linIndex).context.map(c => `${c.domain}-${c.id}`), ['PLAN-12']);
check('순환 가드', upwardFetch('a1', [{ domain: 'WO', id: 'a1', file: 'a', parents: ['WO-b2'] }, { domain: 'WO', id: 'b2', file: 'b', parents: ['WO-a1'] }]).context.map(c => c.id), ['b2']);
// blastRadius: 선언 부모로 이 계보를 가리키는 문서가 영향권(잠금 포함)
const brS = blastRadius('07', linIndex);
check('선언 자식이 영향권에(같은 ID 의 LSN 은 기존대로 산술 자손)', brS.affected.map(a => `${a.domain}-${a.id}`), ['PLAN-07', 'LSN-07', 'WO-345']);
check('선언 자식은 viaParent 표식', brS.affected.find(a => a.id === '345').viaParent, 'PLAN-07');
check('선언 자식의 잠금이 차단한다', blastRadius('36', linIndex).blocked, true);
check('산술 차단 문서는 산술 자손으로 안 잡힌다', blastRadius('12', linIndex).affected.map(a => a.id), ['12', '12b-1']);
// roadmapWiring: PHASE 도달에 선언 부모 사용
const rwS = roadmapWiring(linIndex);
check('plan: 으로 PHASE 에 닿은 WO 는 unanchored 아님', rwS.unanchored.includes('WO-345'), false);
check('PHASE-01 은 stale 아님(선언 경로로 활성 계보가 내려온다)', rwS.stale, []);
// CLI: 상류 PRO-부모 WO 가 더는 CLARIFY 가 아니다 — 상류 픽스처(PRO-27·WO-27a-2) 의존이라 템플릿 모드에서만([ADR-30]; 카나리아 어답터에서 거짓 실패 실측).
if (require('./adapter').isTemplateRepo()) {
  const realUf = cli(['WO-27a-2']);
  check('CLI: upward-fetch WO-27a-2 → exit 0', realUf.status, 0);
  check('CLI: PRO-27 이 frontmatter 부모로 실린다', /\[PRO-27\].*frontmatter/.test(realUf.stdout), true);
} else console.log('(어답터: 상류 픽스처 CLI 검사 건너뜀)');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
