// scripts/tool-linter.test.js
// 순수 로직(readImpl, findViolations) + 실레포 통합(gather). 실행: node scripts/tool-linter.test.js
const { readImpl, findViolations, gather } = require('./tool-linter');

let pass = 0, fail = 0;
function check(label, cond) { if (cond) pass++; else { fail++; console.error(`FAIL ${label}`); } }

// --- readImpl: frontmatter 스코핑 ---
check('선두주석+frontmatter impl 추출',
  readImpl('<!-- c -->\n---\nid: TOOL-01\nimpl: scripts/zfs-linter.js\n---\n# t\n') === 'scripts/zfs-linter.js');
check('frontmatter 없으면 null', readImpl('# 문서\nimpl: scripts/x.js\n') === null);
check('impl 필드 없으면 null', readImpl('---\nid: TOOL-01\n---\n') === null);
check('본문 impl 무시', readImpl('---\nid: X\n---\n예시:\nimpl: fake.js\n') === null);

// --- findViolations ---
check('실존 포인터 → 통과', findViolations([{ file: 'a', impl: 's/x.js', implExists: true }]).length === 0);
check('깨진 포인터 → 위반', findViolations([{ file: 'a', impl: 's/x.js', implExists: false }]).length === 1);
check('impl 누락 → 위반', findViolations([{ file: 'a', impl: null, implExists: false }]).length === 1);
check('빈 목록 → 통과', findViolations([]).length === 0);

// --- 외부 채택(adopt) impl 형식 ---
const { EXTERNAL_RE } = require('./tool-linter');
check('npx: 형식 인정', EXTERNAL_RE.test('npx:repomix'));
check('https 형식 인정', EXTERNAL_RE.test('https://github.com/upstash/context7'));
check('일반 경로는 외부 아님', EXTERNAL_RE.test('scripts/zfs-linter.js') === false);
check('npx: 빈 패키지 거부', EXTERNAL_RE.test('npx:') === false);

// --- 실레포 통합: 템플릿 모드(더미 TOOL-01 존재)에서만 픽스처 검사 ---
const cards = gather();
if (cards.length) {
  check('실레포 카드 전부 impl 실존', findViolations(cards).length === 0);
  if (cards.some(c => /TOOL-01_/.test(c.file))) {
    check('더미 TOOL-01의 impl 파싱', cards.some(c => c.impl === 'scripts/zfs-linter.js'));
  } else {
    console.log('(더미 TOOL-01 없음: 채택 인스턴스 — 픽스처 검사 건너뜀)');
  }
} else {
  console.log('(tools 평면 비어 있음: 픽스처 검사 건너뜀)');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
