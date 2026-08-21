// scripts/zfs_util.test.js
// 의존성 없는 순수 Node 테스트. 실행: node scripts/zfs_util.test.js
const { isValidName, isValidDomain, parse, parseId, isDescendant, ancestorChain } = require('./zfs_util');

let pass = 0, fail = 0;
function check(label, got, exp) {
  const ok = JSON.stringify(got) === JSON.stringify(exp);
  if (ok) pass++; else { fail++; console.error(`FAIL ${label}: got ${JSON.stringify(got)}, exp ${JSON.stringify(exp)}`); }
}

// --- 네이밍 검증 ---
const nameCases = [
  ['PLAN-01_example_auth.md', true],
  ['PLAN-01a_example_social.md', true],
  ['PLAN-01a1_example_oauth.md', true],
  ['WO-01a1-1_example_setup.md', true],
  ['FLOW-01a1_example_lineage.md', true],
  ['PLAN-01a1b2_example_deep.md', true],
  ['WO-01-1_root_terminal.md', true], // 숫자 루트 직속 단말
  ['PHASE-01_example_mvp.md', true],  // project/roadmap 도메인
  ['PRO-01_example_proposal.md', true], // proposals 도메인
  ['MTG-01a_example_kickoff.md', true], // plan/meetings 도메인
  ['ANL-01a_example_provider_usage.md', true], // plan/analytics 도메인
  ['INF-01_example_deploy.md', true],   // architecture/infra 도메인
  ['DOM-01_example_model.md', true],    // reference/domain 도메인
  ['PLAN-01al_typo.md', false],     // l 금지
  ['PLAN-01o_typo.md', false],      // o 금지
  ['plan-01a_lower_domain.md', false],
  ['PLAN-a1_no_digit_start.md', false],
  ['PLAN-01a1_Bad-Slug.md', false],
  ['TOOLONGDOMAIN-01a_x.md', false],
  ['PLAM-01_typo_domain.md', false],  // 도메인 오타 — 화이트리스트 차단
  ['XYZ-01_unknown_domain.md', false], // 구조는 맞으나 미등록 도메인
];
for (const [n, e] of nameCases) check(`name(${n})`, isValidName(n), e);

// --- TOOL 도메인 ([PRO-08]) ---
check('TOOL 유효', isValidName('TOOL-01_example_zfs_linter.md'), true);
check('TOOL 화이트리스트 등재', isValidDomain('TOOL'), true);
check('미등록 유사 도메인(TOOLS) 거부', isValidName('TOOLS-01_example_x.md'), false);

// --- 도메인 화이트리스트 ---
check('domain(PLAN)', isValidDomain('PLAN'), true);
check('domain(PHASE)', isValidDomain('PHASE'), true);
check('domain(PLAM)', isValidDomain('PLAM'), false);

// --- parse: 구조 분해(도메인 화이트리스트와 무관) ---
check('parse(WO file)', parse('WO-01a1-2_example_dto.md'),
  { domain: 'WO', id: '01a1-2', slug: 'example_dto' });
check('parse(invalid)', parse('not_a_zfs_name.md'), null);

// --- 자식/형제 판정 ---
const descCases = [
  ['01a1', '01a1', true],
  ['01a1', '01a1b2', true],
  ['01a1', '01a1-2', true],
  ['01a1', '01a10', false],   // 다른 숫자 노드 — 오인 차단
  ['01a', '01a1', true],
  ['01a', '01a2', true],
  ['01a', '01b1', false],     // 형제 계보
  ['01', '02', false],
  ['01', '01a', true],
  ['01', '011', false],
  ['01a', '01', false],       // 조상은 자손이 아니다(역방향)
  ['01a1', '01a', false],     // 부모는 자식의 자손이 아니다
  ['02b', '01', false],       // 비접두(다른 계보)
  ['01a', '01a1-1', true],    // 손자(단말)까지 자손
];
for (const [p, o, e] of descCases) check(`desc(${p},${o})`, isDescendant(p, o), e);

// --- 부모 체인 역산 ---
check('chain(01a1-2)', ancestorChain('01a1-2'), ['01a1-2', '01a1', '01a', '01']);
check('chain(01a1)',   ancestorChain('01a1'),   ['01a1', '01a', '01']);
check('chain(01a)',    ancestorChain('01a'),    ['01a', '01']);
check('chain(01)',     ancestorChain('01'),     ['01']);

// --- parseId ---
check('parseId(file)',     parseId('WO-01a1-2_example_dto.md'), '01a1-2');
check('parseId(raw)',      parseId('01a1'), '01a1');
check('parseId(bracket)',  parseId('WO-01a1-2'), '01a1-2'); // 슬러그 없는 DOMAIN-ID
check('parseId(phase)',    parseId('PHASE-01'), '01');
check('parseId(garbage)',  parseId('hello-world'), null);

// --- 단말 작업 접미사(-N)의 양방향 일치 회귀 ---
// 결함: 알파벳 종료 부모에서 isDescendant 가 `-` 를 자식으로 인정하지 않아,
//   ancestorChain 과 방향이 어긋났다(WO 가 blast-radius·GC·플릿 파티션에서 누락).
{
  const pairs = [
    ['01a', '01a-1', true],    // 알파벳 종료 부모 + 단말 — 이 케이스가 깨져 있었다
    ['01a', '01a-12', true],
    ['01a1', '01a1-2', true],  // 숫자 종료 부모 + 단말 — 원래 정상
    ['01', '01-1', true],
    ['01a', '01a1', true],     // 정상 레벨 하강
    ['01', '01a', true],
    ['01a1', '01a10', false],  // 형제 숫자 노드 오인 금지(원래 의도)
    ['01a', '01ab', false],    // 형제 문자 블록 오인 금지
    ['01a', '01a-', false],    // 숫자 없는 하이픈은 단말이 아니다
    ['01a', '01a-1b', false],  // 단말 뒤 잡문자 금지
  ];
  pairs.forEach(([p, c, want]) =>
    check(`isDescendant(${p}, ${c})`, isDescendant(p, c), want));

  // 양방향 일치 불변식: ancestorChain 이 부모라고 말하면 isDescendant 도 자식이라고 해야 한다.
  ['01a-1', '01a1-2', '01-1', '01a1', '01ab1-3'].forEach(id => {
    ancestorChain(id).slice(1).forEach(parent =>
      check(`양방향 일치: ${parent} ⊃ ${id}`, isDescendant(parent, id), true));
  });
}

console.log(`
${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
