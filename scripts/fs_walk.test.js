// scripts/fs_walk.test.js
// 심볼릭 링크 순환 가드 + 기본 순회. 실행: node scripts/fs_walk.test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { walkFiles, collectFiles } = require('./fs_walk');

let pass = 0, fail = 0;
function check(label, cond) { if (cond) pass++; else { fail++; console.error(`FAIL ${label}`); } }

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fswalk-'));
fs.mkdirSync(path.join(root, 'a', 'b'), { recursive: true });
fs.mkdirSync(path.join(root, 'skipme'));
fs.writeFileSync(path.join(root, 'top.md'), 'x');
fs.writeFileSync(path.join(root, 'a', 'one.md'), 'x');
fs.writeFileSync(path.join(root, 'a', 'b', 'two.txt'), 'x');
fs.writeFileSync(path.join(root, 'skipme', 'ignored.md'), 'x');

// 기본 순회
const all = collectFiles(root, '').sort();
check('재귀 수집', JSON.stringify(all) === JSON.stringify(['a/b/two.txt', 'a/one.md', 'skipme/ignored.md', 'top.md'].sort()));
check('구분자는 /', all.every(p => !p.includes('\\')));

// 필터 + skipDir
check('필터', collectFiles(root, '', p => p.endsWith('.md')).length === 3);
check('skipDir', collectFiles(root, '', () => true, { skipDir: n => n === 'skipme' }).length === 3);

// 없는 디렉터리 → 조용히 빈 결과
check('없는 경로 무해', collectFiles(root, 'nope').length === 0);

// --- 핵심: 자기참조 심볼릭 링크가 있어도 죽지 않는다 ---
let linkable = true;
try { fs.symlinkSync(root, path.join(root, 'a', 'loop'), 'junction'); }
catch { linkable = false; } // Windows에서 권한 없으면 생성 불가 — 스킵
if (linkable) {
  let count = 0;
  walkFiles(root, '', () => { count++; if (count > 500) throw new Error('무한 재귀'); });
  check('순환 링크에도 종료', count === 4);
  check('링크 경유 경로 미포함', !collectFiles(root, '').some(p => p.includes('loop')));
} else {
  console.log('(심볼릭 링크 생성 권한 없음: 순환 검사 건너뜀)');
}

// 깨진 링크도 무해
try {
  fs.symlinkSync(path.join(root, 'gone.md'), path.join(root, 'dangling.md'), 'file');
  check('깨진 링크 무시', !collectFiles(root, '').some(p => p.includes('dangling')));
} catch { /* 권한 없음 */ }

fs.rmSync(root, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
