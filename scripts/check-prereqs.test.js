// scripts/check-prereqs.test.js
// 순수 로직(checkArtifacts, checkLineage) + 실레포 통합(gather). 실행: node scripts/check-prereqs.test.js
const { checkArtifacts, checkLineage, gather } = require('./check-prereqs');

let pass = 0, fail = 0;
function check(label, cond) { if (cond) pass++; else { fail++; console.error(`FAIL ${label}`); } }

const GOOD_HANDOFF = '# H\n## 1. 요약\nx\n## 2. 변경\nx\n## 3. 다음\nx\n## 4. 미해결\nx\n## 5. 검증\nx\n';

// --- checkArtifacts ---
check('정상 → 위반 0', checkArtifacts({ identityExists: true, handoffTxt: GOOD_HANDOFF }).length === 0);
check('IDENTITY 부재 → 위반', checkArtifacts({ identityExists: false, handoffTxt: GOOD_HANDOFF }).some(v => v.code === 'identity'));
check('HANDOFF 부재 → 위반', checkArtifacts({ identityExists: true, handoffTxt: null }).some(v => v.code === 'handoff'));
check('HANDOFF 5부 결핍 → 위반', checkArtifacts({ identityExists: true, handoffTxt: '# H\n## 1. 요약\n## 2. 변경\n' })
  .some(v => v.code === 'handoff-parts'));

// --- checkLineage ---
check('전거 있음 → 통과', checkLineage({ id: '01a', context: [{ domain: 'PLAN' }], lessons: [] }).length === 0);
check('전거 0 → 위반', checkLineage({ id: '99z', context: [], lessons: [] }).some(v => v.code === 'lineage'));
check('ID 없음(null) → 검사 생략', checkLineage(null).length === 0);

// --- 실레포 통합: 템플릿엔 IDENTITY_example + HANDOFF 5부가 있어야 함 ---
const g = gather();
check('실레포 부트스트랩 산출물 OK', checkArtifacts(g).length === 0);
// 계보 전거 검사는 그 계보가 **이 레포에 실재할 때만** 뜻이 있다. 템플릿의 더미 계보(01a)는
// init 이 지우는 것이 정상 사용이라, ID를 박아 두면 어답터에서 구조적으로 실패한다.
const g2 = gather(undefined, '01a');
if (g2.fetch && (g2.fetch.context.length || g2.fetch.lessons.length)) {
  check('실레포 01a 계보 전거 존재(템플릿 더미)', checkLineage(g2.fetch).length === 0);
} else {
  console.log('(01a 계보 없음: 어답터 — 더미 계보 검사 건너뜀)');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
