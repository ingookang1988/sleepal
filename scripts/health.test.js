// scripts/health.test.js
// 순수 계산부(computeHealth) 단위 + gather() 스모크. 실행: node scripts/health.test.js
const { computeHealth, gather, computeEffectSurface, parseContract } = require('./health');

let pass = 0, fail = 0;
function check(label, cond) { if (cond) pass++; else { fail++; console.error(`FAIL ${label}`); } }

const index = [
  { domain: 'PLAN', id: '01' }, { domain: 'FLOW', id: '01a' },
  { domain: 'LSN', id: '01a' }, { domain: 'FLOW', id: '01b', status: 'Verifying' },
];
const defined = ['PLAN', 'FLOW', 'LSN', 'WO', 'WF', 'EVD', 'ADR', 'PRO', 'ARCH'];

// 게이트 전부 통과 + 잠금 1
const h = computeHealth({ index, domainsDefined: defined, guideCount: 5, namingViolations: 0, historyViolations: 0, leakageViolations: 0 });
check('healthy when 0 violations', h.healthy === true && h.fails === 0);
check('lock exposure WARN', h.dims.find(d => d.name === 'lock exposure').status === 'WARN');
check('domain util value', h.dims.find(d => d.name === 'domain utilization').value === '3/9 used');
check('byDomain count', h.byDomain.FLOW === 2);

// 게이트 실패 반영
const bad = computeHealth({ index, domainsDefined: defined, guideCount: 5, namingViolations: 2, historyViolations: 1, leakageViolations: 0 });
check('fails counted', bad.fails === 2 && bad.healthy === false);
check('naming FAIL', bad.dims.find(d => d.name === 'naming gate').status === 'FAIL');

// 도메인 과세분 WARN (>6 unused)
const many = computeHealth({ index, domainsDefined: [...defined, 'A', 'B', 'C', 'D', 'E', 'F'], guideCount: 1, namingViolations: 0, historyViolations: 0, leakageViolations: 0 });
check('domain util WARN when many unused', many.dims.find(d => d.name === 'domain utilization').status === 'WARN');

// 파일 크기 + 참조 차원
const sz = computeHealth({ index, domainsDefined: defined, guideCount: 5, namingViolations: 0, historyViolations: 0, leakageViolations: 0, oversize: [{ file: 'x.md', kb: 47 }], brokenRefs: 3 });
// 상한 초과는 **처방과 함께** 나와야 한다 — 해소 경로가 안 보이는 경고는 배경 소음이 된다([PRO-18] §3-4).
const sizeNote = r => r.dims.find(d => d.name === 'file size').note;
check('크기 초과: 문서는 분할 처방', sizeNote(sz).includes('ZFS 계보로 분할'), true);
const szRot = computeHealth({ index, domainsDefined: defined, guideCount: 5, namingViolations: 0, historyViolations: 0, leakageViolations: 0,
  oversize: [{ file: '.union-stack/archive_ledger.md', kb: 43, rotatable: true }] });
check('크기 초과: 행 저장소는 회전 처방', sizeNote(szRot).includes('회전(archive_ledger/)'), true);
check('처방은 파일명과 함께 나온다', sizeNote(szRot).includes('archive_ledger.md:43KB'), true);
check('file size WARN', sz.dims.find(d => d.name === 'file size').status === 'WARN');
check('ref integrity INFO', sz.dims.find(d => d.name === 'ref integrity').value.includes('3'));

// gather(): 실제 레포 스모크 — 구조 정상이면 fails 0.
// 단 leakage는 *미커밋* 작업트리 콘텐츠에 좌우된다(검토 중 spike 등) — 커밋 평면 게이트만 단언.
const g = gather();
const nonLeakFails = g.dims.filter(d => d.status === 'FAIL' && d.name !== 'leakage gate').length;
check('gather 커밋 평면 게이트 그린', nonLeakFails === 0);
check('gather dims 15 (관측 6절 포함)', g.dims.length === 15);
// 당위 축 관측 — 인용 != 집행이므로 판정 없는 INFO.
const nDim = g.dims.find(d => d.name === 'norm enforcement');
check('norm enforcement 절은 INFO', nDim.status === 'INFO');
check('norm enforcement 값에 규범·게이트', /규범 \d+ · 게이트 \d+/.test(nDim.value));
check('norms·concerns 원자료도 함께 낸다', Array.isArray(g.norms.norms) && typeof g.concerns.tagged === 'number');
// 당위 페이지의 재료 — 제목·절 구조·인용처·게이트 계약이 실제로 채워지는가.
const a00 = g.norms.norms.find(n => n.key === 'ARCH-00');
check('규범 제목·절 구조 수집', !!a00.title && a00.headings.length > 0);
check('평면 인용처가 파일 목록으로', Array.isArray(a00.planeFiles) && a00.planeFiles.length > 0);
// ARCH-00 을 인용하는 게이트는 현재 `leakage-guard` 하나뿐이고, 그것은 템플릿 전용 자산이다
// (`init --drop-template-bits`). 어답터에서 ARCH-00 이 무게이트가 되는 것은 결함이 아니라 **관측**이라,
// 계약이 하나라도 있을 때만 그 구조를 단언한다([ADR-27] 문법).
if (a00.gateContracts.length) {
  check('게이트 계약의 scope 를 정적 파싱', !!a00.gateContracts[0].scope);
} else {
  console.log('(ARCH-00 인용 게이트 없음: 어답터 — 계약 파싱 검사 건너뜀)');
}

// parseContract — 실행 없이 소스에서 계약 필드를 뽑는다(read-only 불변식).
const pc = parseContract(`const CONTRACT = {
  gate: 'X Gate (x)',
  predicate: 'p 조건',
  scope: 's 사각지대',
  outcomes: ['PASS', 'REJECT'],
  failure_mode: 'f 실패',
};`);
check('parseContract 필드 추출', pc.gate === 'X Gate (x)' && pc.scope === 's 사각지대');
check('parseContract outcomes 배열', JSON.stringify(pc.outcomes) === '["PASS","REJECT"]');
check('parseContract 없으면 null', parseContract('const X = 1;') === null);
// 계약 간선 관측([PRO-16] §5 반증 계기) — 판정 없이 채택·무결성만 병치한다.
const ceDim = g.dims.find(d => d.name === 'contract edges');
check('contract edges 절은 INFO(판정 없음)', ceDim.status === 'INFO');
check('contract edges 값에 계약·선언·간선', /계약 \d+ · 선언 \d+ · 간선 \d+/.test(ceDim.value));
check('contracts 원자료도 함께 낸다', Array.isArray(g.contracts.byContract));
check('sync 절은 INFO(판정 없음)', g.dims.find(d => d.name === 'plane sync').status === 'INFO');
check('tier 절은 INFO(관측만)', g.dims.find(d => d.name === 'tier distribution').status === 'INFO');

// 효과 표면 관측(갭 분석 §3-C) — 순수 계수. 도구 이름은 규칙에서 도출되어야 한다(목록 하드코딩 금지).
const es = computeEffectSurface({
  'a.json': { allow: ['Bash(git push *)', 'Bash(node x.js)', 'WebFetch(domain:example.com)'], deny: ['Bash(rm *)'], ask: [] },
  'b.json': { allow: ['PowerShell(ls)', '무형식규칙'] },
});
check('effect: allow 총계', es.allow === 5);
check('effect: deny 총계', es.deny === 1);
check('effect: wildcard 계수', es.wildcard === 1);
check('effect: 도구를 데이터에서 도출(PowerShell·WebFetch 누락 없음)',
  es.byTool.Bash === 2 && es.byTool.WebFetch === 1 && es.byTool.PowerShell === 1);
check('effect: 괄호 없는 규칙은 (무형식)', es.byTool['(무형식)'] === 1);
check('effect: 파일 2개 기록', es.files.length === 2);

// 설정 파일이 없으면 "관측 불가"로 표기 — 없는 것을 0으로 단정하지 않는다.
const noEffect = computeHealth({ index, domainsDefined: defined, guideCount: 5, namingViolations: 0, historyViolations: 0, leakageViolations: 0, effect: computeEffectSurface({}) });
check('effect: 설정 없으면 관측 불가', noEffect.dims.find(d => d.name === 'effect surface').value.includes('관측 불가'));
check('effect 절은 INFO(판정 없음)', noEffect.dims.find(d => d.name === 'effect surface').status === 'INFO');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
