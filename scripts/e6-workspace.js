#!/usr/bin/env node
// scripts/e6-workspace.js
// E6 과제 워크스페이스 빌더/검증기 — `eval/e6-suite/defects.js`의 실결함을 **히스토리 없는** 사본에
// 주입해 팔이 돌 작업 공간을 만들고, 팔 종료 후 **숨은 오라클**로 정답 여부를 판정한다.
//
// 왜 히스토리를 지우는가: 결함은 이 레포의 과거 수정 커밋에서 역산했다. 원본 히스토리를 그대로 두면
//   두 팔 모두 `git log`/`git show` 한 번으로 정답을 얻어 델타가 씻긴다(§3-bis 과제 오염 처방).
//   대신 워크스페이스는 **결함이 담긴 커밋 1개짜리** 새 저장소로 초기화한다 — git 워크플로는 그대로
//   쓸 수 있으면서(팔 간 동일 조건), 수정 이력만 없다.
//
// 정직한 한계: ① 오라클은 *이 체크아웃의* 테스트 파일이다 — 레포가 그 파일을 고치면 오라클도 바뀐다
//   (build가 찍어 주는 HEAD를 기록해 두면 드리프트를 확인할 수 있다). ② 오라클 통과는 *정답 여부*만
//   말한다 — 절차 품질은 [TOOL-18], 비용은 [TOOL-19]가 따로 잰다.
// 실행:
//   node scripts/e6-workspace.js list
//   node scripts/e6-workspace.js build  <D-id> <dest>   # 워크스페이스 생성 + 결함 주입(+발화 출력)
//   node scripts/e6-workspace.js verify <D-id> <dest>   # 팔 종료 후 숨은 오라클 실행(exit 0 = 정답)
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { walkFiles, copyTree } = require('./fs_walk');

const ROOT = path.resolve(__dirname, '..');
const SUITE = path.join(ROOT, 'eval', 'e6-suite', 'defects.js');

const defects = () => require(SUITE);
const byId = id => defects().find(d => d.id === String(id).toUpperCase());

// --- 개행 중립 편집 ---------------------------------------------------------
/** 파일의 지배적 개행(그 자체가 D2의 교훈 — LF 고정 주입은 CRLF 레포를 깨뜨린다). */
function dominantEol(txt) {
  return (txt.match(/\r\n/g) || []).length > (txt.match(/(?<!\r)\n/g) || []).length ? '\r\n' : '\n';
}

/**
 * 텍스트에 치환 적용(순수). 대상이 정확히 1회가 아니면 throw — 소스 드리프트를 조용히 넘기지 않는다.
 * spec: {find} 정확 문자열 또는 {findRe} 정규식. 정규식은 유니코드 코드포인트가 육안으로 같아도
 *   다를 수 있는 구간(CJK 범위 리터럴 등)을 피하려고 둔 탈출구다.
 */
function applyEdit(txt, spec, where) {
  const replace = spec.replace || '';
  if (spec.findRe) {
    const re = new RegExp(spec.findRe.source, spec.findRe.flags.includes('g') ? spec.findRe.flags : spec.findRe.flags + 'g');
    const n = (txt.match(re) || []).length;
    if (n !== 1) throw new Error(`${where}: findRe가 ${n}회 매칭(1회여야 함) — 소스가 드리프트했다.\n--- findRe ---\n${spec.findRe}`);
    return txt.replace(re, () => replace);
  }
  const n = txt.split(spec.find).length - 1;
  if (n !== 1) throw new Error(`${where}: find 문자열이 ${n}회 발견됨(1회여야 함) — 소스가 드리프트했다.\n--- find ---\n${spec.find.slice(0, 160)}…`);
  return txt.split(spec.find).join(replace);
}

/** `check('<label>' …);` 호출 하나를 통째로 제거(여러 줄 허용, 괄호 균형으로 끝을 찾는다). 순수. */
function stripCheck(txt, label) {
  const lines = txt.split('\n');
  const start = lines.findIndex(l => l.includes(`check('${label}'`) || l.includes(`check("${label}"`));
  if (start < 0) throw new Error(`strip 대상 단언을 못 찾음: ${label}`);
  let depth = 0, end = start;
  for (let i = start; i < lines.length; i++) {
    for (const ch of lines[i]) { if (ch === '(') depth++; else if (ch === ')') depth--; }
    end = i;
    if (depth <= 0) break;
  }
  lines.splice(start, end - start + 1);
  return lines.join('\n');
}

function editFile(dest, rel, fn) {
  const abs = path.join(dest, rel);
  const raw = fs.readFileSync(abs, 'utf8');
  const eol = dominantEol(raw);
  const out = fn(raw.split('\r\n').join('\n'));
  fs.writeFileSync(abs, eol === '\n' ? out : out.split('\n').join('\r\n'));
}

function git(dest, args) {
  return execFileSync('git', ['-c', 'user.name=e6-suite', '-c', 'user.email=e6@local', ...args],
    { cwd: dest, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function build(d, dest) {
  if (fs.existsSync(dest) && fs.readdirSync(dest).length) throw new Error(`대상이 비어 있지 않다: ${dest}`);
  // 레포 바깥인가 — 다른 드라이브면 relative가 절대경로로 나온다(Windows).
  const rel = path.relative(ROOT, path.resolve(dest));
  if (!rel.startsWith('..') && !path.isAbsolute(rel)) throw new Error('대상은 레포 바깥이어야 한다(사본이 원본을 오염시킨다).');
  fs.mkdirSync(dest, { recursive: true });
  const files = copyTree(ROOT, dest);

  // 결함이 *드러나려면* 있어야 하는 픽스처(증상 재현 조건). 두 팔 모두 같은 조건에서 시작한다.
  for (const f of d.files || []) {
    const abs = path.join(dest, f.path);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, f.content);
  }
  for (const e of d.edits) editFile(dest, e.file, t => applyEdit(t, e, `${d.id}:${e.file}`));
  editFile(dest, d.testFile, t => {
    for (const block of d.strip || []) t = applyEdit(t, { find: block }, `${d.id}:${d.testFile}(strip)`);
    for (const label of d.stripChecks || []) t = stripCheck(t, label);
    return t;
  });

  git(dest, ['init', '-q', '-b', 'main']);
  git(dest, ['add', '-A']);
  git(dest, ['commit', '-q', '-m', 'workspace baseline']);
  return { files, head: git(ROOT, ['rev-parse', '--short', 'HEAD']).trim() };
}

function verify(d, dest) {
  const oracleRel = `scripts/_oracle_${d.id}.test.js`;
  const abs = path.join(dest, oracleRel);
  fs.copyFileSync(path.join(ROOT, d.testFile), abs);   // 원본(비-strip) 테스트 = 숨은 오라클
  try {
    const out = execFileSync(process.execPath, [abs], { cwd: dest, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { pass: true, out };
  } catch (e) {
    return { pass: false, out: `${e.stdout || ''}${e.stderr || ''}` };
  } finally {
    fs.rmSync(abs, { force: true });
  }
}

function run(argv = process.argv.slice(2)) {
  const [cmd, id, dest] = argv;
  if (cmd === 'list') {
    console.log('# E6 과제 스위트 (히스토리 없는 워크스페이스에 주입)');
    for (const d of defects()) console.log(`  ${d.id}  ${d.title}   (역산 출처 ${d.origin} · 오라클 ${d.testFile})`);
    console.log('\n  런 1개 = 과제 1건 = 발화 1건. 팔당 총 5런(①무시나리오 / ②강제).');
    return 0;
  }
  const d = id ? byId(id) : null;
  if (!['build', 'verify'].includes(cmd) || !d || !dest) {
    console.error('사용법: node scripts/e6-workspace.js list | build <D-id> <dest> | verify <D-id> <dest>');
    return 2;
  }
  if (cmd === 'build') {
    const r = build(d, dest);
    console.log(`# ${d.id} 워크스페이스 생성: ${dest}`);
    console.log(`  파일 ${r.files}개 · 결함 주입 완료 · 커밋 1개짜리 새 저장소(수정 이력 없음) · 원본 HEAD ${r.head}`);
    console.log(`\n  이 런의 **유일한 발화**(그대로 붙여넣고, 추가 발화 금지):\n\n${d.prompt}\n`);
    console.log(`  종료 후: node scripts/e6-workspace.js verify ${d.id} ${dest}`);
    return 0;
  }
  const v = verify(d, dest);
  console.log(`# ${d.id} 오라클 — ${v.pass ? '통과(정답)' : '실패(미해결/오답)'}`);
  console.log(v.out.trim());
  return v.pass ? 0 : 1;
}

module.exports = { applyEdit, stripCheck, dominantEol, build, verify, byId };

if (require.main === module) process.exit(run());
