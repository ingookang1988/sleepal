// scripts/e6-workspace.test.js
// 순수 함수(applyEdit·stripCheck·dominantEol) + 스위트 정의 무결성. 실행: node scripts/e6-workspace.test.js
const fs = require('fs');
const path = require('path');
const { applyEdit, stripCheck, dominantEol, byId } = require('./e6-workspace');
// 스위트는 상류 인스턴스 사유물 — 채택 인스턴스에는 없다. 있을 때만 무결성을 검사한다.
const SUITE_PATH = path.join(__dirname, '..', 'eval', 'e6-suite', 'defects.js');
const defects = fs.existsSync(SUITE_PATH) ? require(SUITE_PATH) : null;

let pass = 0, fail = 0;
function check(label, cond) { if (cond) pass++; else { fail++; console.error(`FAIL ${label}`); } }
function throws(label, fn) { try { fn(); fail++; console.error(`FAIL ${label} (throw 안 함)`); } catch { pass++; } }

// --- applyEdit: 1회 매칭만 허용(소스 드리프트를 조용히 넘기지 않는다) ---
check('정확 문자열 치환', applyEdit('a\nBUG\nc', { find: 'BUG', replace: 'FIX' }, 'x') === 'a\nFIX\nc');
throws('0회 → throw', () => applyEdit('abc', { find: 'ZZZ', replace: '' }, 'x'));
throws('2회 → throw', () => applyEdit('BUG BUG', { find: 'BUG', replace: '' }, 'x'));
check('replace 생략 = 삭제', applyEdit('a\nDROP\n', { find: 'DROP\n' }, 'x') === 'a\n');
// $& 같은 치환 특수문자가 그대로 들어가야 한다(정규식 경로에서 흔한 함정)
check('치환문의 $& 리터럴 보존', applyEdit('X', { findRe: /X/, replace: 'a$&b' }, 'x') === 'a$&b');
check('findRe 치환', applyEdit('n=/[가-힣]/g;', { findRe: /n=\/\[[^\]]*\]\/g;/, replace: 'n=null;' }, 'x') === 'n=null;');
throws('findRe 2회 → throw', () => applyEdit('aXa Xb', { findRe: /X/, replace: '' }, 'x'));

// --- stripCheck: check(...) 호출 하나를 통째로(여러 줄 포함) 제거 ---
const t = `check('keep', 1);
check('drop me',
  2 === 2);
check('after', 3);`;
const s = stripCheck(t, 'drop me');
check('대상 단언 제거', !s.includes('drop me'));
check('여러 줄 전체 제거', !s.includes('2 === 2'));
check('앞뒤 단언 보존', s.includes("check('keep', 1);") && s.includes("check('after', 3);"));
throws('없는 라벨 → throw', () => stripCheck(t, '존재하지 않음'));

// --- dominantEol ---
check('CRLF 우세', dominantEol('a\r\nb\r\nc\n') === '\r\n');
check('LF 우세', dominantEol('a\nb\nc\r\n') === '\n');
check('개행 없음 → LF', dominantEol('abc') === '\n');

// --- 스위트 정의 무결성(스위트가 규약을 어기면 리그가 조용히 망가진다) ---
if (defects) {
  check('과제 5건 = 팔당 총 5런', defects.length === 5);
  check('id 유일', new Set(defects.map(d => d.id)).size === 5);
  for (const d of defects) {
    check(`${d.id} 필수 필드`, !!(d.title && d.prompt && d.origin && d.testFile && d.edits.length));
    check(`${d.id} 오라클은 테스트 파일`, /\.test\.js$/.test(d.testFile));
    check(`${d.id} strip 대상이 있다`, (d.strip || []).length + (d.stripChecks || []).length > 0);
    check(`${d.id} 편집 대상은 레포 상대경로`, d.edits.every(e => !path.isAbsolute(e.file)));
    check(`${d.id} 편집은 find 또는 findRe`, d.edits.every(e => !!e.find !== !!e.findRe));
    // 발화는 증상만 — 원인·수정 커밋 해시가 들어가면 과제가 사라진다
    check(`${d.id} 발화에 출처 해시 없음`, !d.prompt.includes(d.origin));
  }
  check('byId 대소문자 무관', byId('d1') && byId('D1').id === 'D1');
  check('없는 id → undefined', byId('D9') === undefined);
} else {
  console.log('(eval/e6-suite 없음: 채택 인스턴스 — 스위트 무결성 검사 건너뜀)');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
