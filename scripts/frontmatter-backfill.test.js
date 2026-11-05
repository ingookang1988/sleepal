// scripts/frontmatter-backfill.test.js
// 순수 함수(estimateStatus·insertStatus) 단위 + 임시 레포에서 dry-run 무쓰기·--apply 1회. 실행: node scripts/frontmatter-backfill.test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { estimateStatus, insertStatus, plan, apply, CONTRACT } = require('./frontmatter-backfill');
const { validateContract } = require('./gate-contract');

let pass = 0, fail = 0;
function check(label, cond) { if (cond) pass++; else { fail++; console.error(`FAIL ${label}`); } }

check('계약 선언 완전', validateContract(CONTRACT).length === 0);
check('계약에 REJECT 없음(차단 안 함)', !CONTRACT.outcomes.includes('REJECT'));

// --- estimateStatus: frontmatter 있으면 대상 아님 · 본문 표식 → 디렉터리 → 비움 ---
check('frontmatter status 있으면 source=frontmatter', estimateStatus('.union-stack/sprint/WO-01_x.md', '---\nstatus: Active\n---\n# x').source === 'frontmatter');
const bodyEn = estimateStatus('.union-stack/sprint/WO-02_x.md', '# [WO-02] 작업\n\n**Status:** Done\n- 본문');
check('본문 영문 표식 → 로컬 어휘 그대로', bodyEn.estimate === 'Done' && bodyEn.source === 'body' && bodyEn.hasFrontmatter === false);
const bodyKo = estimateStatus('.union-stack/proposals/PRO-02_x.md', '# [PRO-02] 제안\n- 상태: 승인됨 (2026-01-01)');
check('본문 한글 표식', bodyKo.estimate === '승인됨' && bodyKo.source === 'body');
check('코드블록 안 표식은 무시', estimateStatus('.union-stack/sprint/WO-03_x.md', '# x\n```\nstatus: Live\n```\n').source === 'none');
check('frontmatter 는 있으나 status 없음 + 본문 표식', estimateStatus('.union-stack/sprint/WO-04_x.md', '---\nid: WO-04\n---\n# x\nStatus: Review\n').hasFrontmatter === true
  && estimateStatus('.union-stack/sprint/WO-04_x.md', '---\nid: WO-04\n---\n# x\nStatus: Review\n').estimate === 'Review');
const dir = estimateStatus('.union-stack/sprint/archived/WO-05_x.md', '# x\n- 본문뿐');
check('종결 디렉터리 → Closed(dir)', dir.estimate === 'Closed' && dir.source === 'dir');
const none = estimateStatus('.union-stack/sprint/WO-06_x.md', '# x\n- 본문뿐');
check('추정 불가는 비움(틀린 종결 표시보다 낫다)', none.estimate === null && none.source === 'none');

// --- insertStatus: 한 줄만 · 위치 · EOL 보존 ---
check('frontmatter 없음 + 선두 주석 → 주석 뒤 최소 블록', insertStatus('<!-- c -->\n# x\n', 'Done') === '<!-- c -->\n---\nstatus: Done\n---\n# x\n');
check('frontmatter 없음 → 맨 앞', insertStatus('# x\n', 'Done') === '---\nstatus: Done\n---\n# x\n');
check('frontmatter 있음 → 여는 --- 아래 한 줄', insertStatus('---\nid: WO-04\n---\n# x\n', 'Review') === '---\nstatus: Review\nid: WO-04\n---\n# x\n');
check('CRLF 보존', insertStatus('# x\r\n', 'Done') === '---\r\nstatus: Done\r\n---\r\n# x\r\n');
check('삽입 뒤 다시 추정하면 frontmatter 출처', estimateStatus('.union-stack/sprint/WO-02_x.md', insertStatus('# x\nStatus: Done\n', 'Done')).source === 'frontmatter');

// --- plan/apply: 임시 레포 — dry-run 은 쓰지 않고, apply 는 추정값 있는 행만 ---
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'backfill-'));
try {
  const w = (rel, txt) => { const abs = path.join(tmp, rel); fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, txt); };
  w('.union-stack/sprint/WO-01_has.md', '---\nstatus: Active\n---\n# (예시)\n');
  w('.union-stack/sprint/WO-02_body.md', '# (예시)\n**Status:** Done\n');
  w('.union-stack/sprint/archived/WO-03_dir.md', '# (예시)\n');
  w('.union-stack/sprint/WO-04_none.md', '# (예시)\n');
  w('.union-stack/proposals/PRO-05_prose.md', '# (예시)\n상태: Approved\n');
  w('.union-stack/sprint/HANDOFF.md', '# not a WO\n');
  const before = Object.fromEntries(['WO-02_body', 'WO-04_none'].map(n => [n, fs.readFileSync(path.join(tmp, '.union-stack/sprint', n + '.md'), 'utf8')]));
  const rows = plan(tmp);
  check('대상 4건(status 있는 1건·비ZFS 제외)', rows.length === 4);
  check('추정값: body Done · dir Closed · prose Approved · none null',
    rows.find(r => r.file.includes('WO-02')).estimate === 'Done' && rows.find(r => r.file.includes('WO-03')).estimate === 'Closed'
    && rows.find(r => r.file.includes('PRO-05')).estimate === 'Approved' && rows.find(r => r.file.includes('WO-04')).estimate === null);
  check('dry-run 은 파일을 쓰지 않는다', fs.readFileSync(path.join(tmp, '.union-stack/sprint/WO-02_body.md'), 'utf8') === before['WO-02_body']);
  const { applied, skipped } = apply(tmp, rows);
  check('apply: 추정값 있는 3건만', applied.length === 3 && skipped.length === 1 && skipped[0].file.includes('WO-04'));
  check('apply 후 재계획은 추정 불가 1건만 남는다', plan(tmp).length === 1);
  check('추정 불가 파일은 손대지 않았다', fs.readFileSync(path.join(tmp, '.union-stack/sprint/WO-04_none.md'), 'utf8') === before['WO-04_none']);
  check('삽입된 값은 로컬 어휘 그대로(Done)', /^status: Done$/m.test(fs.readFileSync(path.join(tmp, '.union-stack/sprint/WO-02_body.md'), 'utf8')));
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
