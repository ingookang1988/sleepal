// scripts/label.test.js
// 파생 라벨([PRO-26] ④ v0.2) 순수 로직: slug 토큰 · mnemonic override · 선언/산술 상속 · 레거시 횡단 금지 · 부모 폴백 · 렌더. 실행: node scripts/label.test.js
const { slugLabel, deriveLabel, labelMap, renderId } = require('./label');

let pass = 0, fail = 0;
function check(label, got, exp) {
  const ok = JSON.stringify(got) === JSON.stringify(exp);
  if (ok) pass++; else { fail++; console.error(`FAIL ${label}: got ${JSON.stringify(got)}, exp ${JSON.stringify(exp)}`); }
}

check('slug 첫 2 토큰', slugLabel('prereq_upstream_tools'), 'prereq_upstream');
check('stopword(example) 제거', slugLabel('example_auth_wiring'), 'auth_wiring');
check('토큰 1개면 1개', slugLabel('retro'), 'retro');
check('전부 stopword 면 null', slugLabel('example_dummy'), null);

const index = [
  { domain: 'PLAN', id: '01', slug: 'example_auth', file: 'PLAN-01', mnemonic: 'auth' },
  { domain: 'WO', id: '01a-1', slug: 'example_auth_wiring', file: 'WO-01a-1' },
  { domain: 'WO', id: '01b-2', slug: 'example', file: 'WO-01b-2' },
  { domain: 'PRO', id: '27', slug: 'cross_repo_prerequisites', file: 'PRO-27' },
  { domain: 'WO', id: '27a-1', slug: 'prereq_upstream_tools', file: 'WO-27a-1', parents: ['PRO-27'] },
  { domain: 'PLAN', id: '12', slug: 'unrelated_legacy', file: 'PLAN-12', mnemonic: 'wrongroot' },
  { domain: 'PRO', id: '36', slug: 'independent_numbering', file: 'PRO-36', mnemonic: 'indep' },
  { domain: 'WO', id: '12a-1', slug: 'legacy_task', file: 'WO-12a-1', parents: ['PRO-36'], arithmetic: false },
  { domain: 'WO', id: '12b-1', slug: 'example', file: 'WO-12b-1', arithmetic: false },
  { domain: 'WO', id: '12c-1', slug: 'other_task', file: 'WO-12c-1' },
  { domain: 'PLAN', id: '07', slug: 'serial_parent', file: 'PLAN-07' },
  { domain: 'WO', id: '345', slug: 'example', file: 'WO-345', parents: ['PLAN-07'] },
  { domain: 'WO', id: 'a1', slug: 'x', file: 'a', parents: ['WO-b2'] }, { domain: 'WO', id: 'b2', slug: 'y', file: 'b', parents: ['WO-a1'] },
];
const by = (dom, id) => index.find(d => d.domain === dom && d.id === id);
check('자기 mnemonic 이 최우선', deriveLabel(by('PLAN', '01'), index), { label: 'auth', source: 'mnemonic' });
check('산술 조상의 mnemonic 상속', deriveLabel(by('WO', '01a-1'), index), { label: 'auth', source: 'mnemonic:PLAN-01' });
check('선언 부모 체인의 mnemonic 상속', deriveLabel(by('WO', '12a-1'), index), { label: 'indep', source: 'mnemonic:PRO-36' });
check('레거시(arithmetic:false): 산술 조상의 mnemonic 을 상속하지 않는다(거짓 라벨 금지) → 자기 slug', deriveLabel(by('WO', '12b-1'), index).label, null);
check('산술 적용 문서는 PLAN-12 의 mnemonic 을 상속', deriveLabel(by('WO', '12c-1'), index), { label: 'wrongroot', source: 'mnemonic:PLAN-12' });
check('mnemonic 없으면 자기 slug 2 토큰', deriveLabel(by('WO', '27a-1'), index), { label: 'prereq_upstream', source: 'slug' });
check('slug 비면 직계 부모(선언) slug', deriveLabel(by('WO', '345'), index), { label: 'serial_parent', source: 'parent:PLAN-07' });
check('slug 비면 산술 부모 slug(같은 도메인 우선 없음 → PLAN)', deriveLabel(by('WO', '01b-2'), index).source, 'mnemonic:PLAN-01');
check('순환 선언은 안전', deriveLabel(by('WO', 'a1'), index), { label: 'x', source: 'slug' });
check('mnemonic 형식 위반(대문자·공백)은 무시', deriveLabel({ domain: 'WO', id: '9', slug: 'fine_slug', mnemonic: 'Bad Name' }, []), { label: 'fine_slug', source: 'slug' });
check('labelMap 전수', labelMap(index).get('WO-27a-1'), 'prereq_upstream');
check('렌더', [renderId('WO', '27a-1', 'prereq_upstream'), renderId('WO', '27a-1', null)], ['[WO-27a-1 · prereq_upstream]', '[WO-27a-1]']);
check('null 문서', deriveLabel(null, index), { label: null, source: null });
// 중복 ID(같은 DOMAIN-ID 파일 2개 — 어답터 실측)여도 mnemonic 을 잃지 않는다(Map 마지막 승리 회귀).
const dupIndex = [...index, { domain: 'PRO', id: '36', slug: 'independent_numbering_dup', file: 'PRO-36 dup' }];
check('중복 ID 중 하나에만 mnemonic 이 있어도 상속', deriveLabel(dupIndex.find(d => d.id === '12a-1'), dupIndex), { label: 'indep', source: 'mnemonic:PRO-36' });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
