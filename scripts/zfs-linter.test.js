// scripts/zfs-linter.test.js
// ID 유일성([PRO-27] ⑤) 단위 + 상류 도그푸딩. 실행: node scripts/zfs-linter.test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { lint, findDuplicateIds } = require('./zfs-linter');

let pass = 0, fail = 0;
function check(label, cond) { if (cond) pass++; else { fail++; console.error(`FAIL ${label}`); } }

// --- findDuplicateIds(순수): 같은 도메인·같은 ID 파일 ≥2 만 중복이다 ---
// 레거시 독립 채번(하류 실측 — PLAN-36 과 PRO-36 이 서로 무관)은 중복이 **아니다**. 도메인이 다르면 다른 ID 공간이다.
const dups = findDuplicateIds([
  '.union-stack/proposals/PRO-36_a.md', '.union-stack/proposals/PRO-36_b.md',
  '.union-stack/plan/PLAN-36_c.md', '.union-stack/sprint/WO-36a-1_d.md', '.union-stack/sprint/archived/WO-36a-1_d.md',
]);
check('중복 2쌍(PRO-36 · WO-36a-1)', dups.length === 2);
check('PRO-36 쌍이 파일 2개를 든다', dups.find(d => d.key === 'PRO-36').files.length === 2);
check('같은 번호·다른 도메인은 중복 아님', !dups.some(d => d.key === 'PLAN-36'));
check('디렉터리가 달라도(archived) 같은 ID 면 중복', dups.some(d => d.key === 'WO-36a-1'));
check('중복 없으면 빈 배열', findDuplicateIds(['.union-stack/plan/PLAN-01_a.md', '.union-stack/plan/PLAN-02_b.md']).length === 0);

// --- lint(root): 임시 레포 픽스처에서 REJECT 재료(violations)로 나온다 ---
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zfs-dup-'));
try {
  for (const rel of ['.union-stack/proposals/PRO-36_a.md', '.union-stack/proposals/PRO-36_b.md', '.union-stack/plan/PLAN-36_c.md']) {
    fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true });
    fs.writeFileSync(path.join(tmp, rel), '# (예시)\n');
  }
  const v = lint(tmp);
  check('픽스처: 위반 1건(중복 그룹 단위)', v.length === 1);
  check('힌트에 중복 ID 와 파일 목록', v[0] && /중복 ID PRO-36/.test(v[0].hint) && /PRO-36_a\.md/.test(v[0].hint) && /PRO-36_b\.md/.test(v[0].hint));
  check('이름 규약 자체는 통과(중복만 잡힘)', v.every(x => /중복/.test(x.hint)));
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }

// --- 상류 자신 도그푸딩: 위반 0 — 어답터의 위반은 그 레포의 게이트가 말한다(템플릿 모드에서만, [ADR-30]) ---
if (require('./adapter').isTemplateRepo()) {
  const upstream = lint(path.resolve(__dirname, '..'));
  check('상류: 네이밍·중복 위반 0', upstream.length === 0);
} else console.log('(어답터: 상류 청결도 단언 건너뜀)');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
