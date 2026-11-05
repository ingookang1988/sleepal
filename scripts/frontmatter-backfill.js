#!/usr/bin/env node
// scripts/frontmatter-backfill.js
// frontmatter 백필([PRO-27] ②) — `status:` 가 없는 WO·PRO 문서를 나열하고, 추정값·출처를 병기한다. **기본은 dry-run**.
//
// 왜: 어답터 실측(SURVEY-02) — 한 어답터는 WO 99/179 에 frontmatter 가 없고, 다른 어답터는 로컬 PRO 17/17 이 YAML 없이
// 산문으로 상태를 적는다. 상류 도구(work-close·health·census·[PRO-25] 트리거)는 frontmatter `status:` 를 읽으므로 이 문서들은
// 전부 "없는 것"으로 계수된다 — 조용한 0. 상류가 어답터 문서를 고치지는 않는다([PRO-27] §5): 스크립트와 dry-run 까지가 상류 몫이고
// 적용(`--apply`)과 커밋은 어답터가 한다.
//
// 추정 순서(§3 ②): 본문 상태 표식(`Status: Done` · `**상태:** 완료`) → 종결 디렉터리(archived/ 등 → Closed) → 추정 불가는 **비움 + 보고**
// ([PRO-27] §7-2 잠정값 — 틀린 종결 표시가 빈칸보다 해롭다). 값은 **로컬 어휘 그대로** 쓴다(`Done` 을 `Closed` 로 바꾸지 않는다 —
// 읽기 시 `adapter.json statusMap` 이 매핑한다). 삽입은 `status:` **한 줄**뿐이다.
//
// 실행: node scripts/frontmatter-backfill.js [--root <dir>] [--json] [--apply]
//   dry-run : 대상 목록 + 추정값 → CLARIFY(3, 비차단). 대상 0 이면 PASS.
//   --apply : 추정값이 있는 행만 쓴다. 추정 불가 행은 남겨 보고한다.
const fs = require('fs');
const path = require('path');
const { walkFiles } = require('./fs_walk');
const { parse } = require('./zfs_util');
const { frontmatter, field } = require('./work-close');
const { withContract, OUTCOME } = require('./gate-contract');

const CONTRACT = {
  gate: 'Frontmatter Backfill Gate (frontmatter-backfill)',
  input: 'sprint/·proposals/ 의 WO·PRO 문서 — frontmatter 유무 · status 유무 · 본문 상태 표식 · 디렉터리',
  predicate: 'status: 없는 WO·PRO 문서 0건. 있으면 추정값·출처와 함께 나열(dry-run) — 적용은 --apply 로 어답터가',
  scope: '존재만 본다 — 추정값이 옳은지 판정하지 않는다. 추정 불가는 비워 보고한다(틀린 종결 표시가 더 해롭다). 로컬 어휘를 상류 enum 으로 바꾸지 않는다(statusMap 이 읽기 시 매핑). 삽입은 status: 한 줄뿐',
  outcomes: ['PASS', 'CLARIFY'],
  failure_mode: '백필 대상 목록 출력 후 CLARIFY(3) — 차단 없음. --apply 는 추정값 있는 행만 쓰고 결과를 보고',
};

const SCAN_DIRS = ['.union-stack/sprint', '.union-stack/proposals'];
const DOMAINS = new Set(['WO', 'PRO']);
// 본문 상태 표식 — 라벨(영/한) + 콜론 + 첫 토큰. 볼드·목록 머리·인용은 허용. 코드블록 안은 보지 않는다(아래에서 제거).
// 볼드는 라벨만(`**Status**: x`) 감쌀 수도, 콜론까지(`**Status:** x`) 감쌀 수도 있다 — 콜론 양쪽에서 허용.
const BODY_STATUS_RE = /^\s*(?:[-*>]\s*)?(?:\*\*)?(?:status|state|상태)(?:\*\*)?\s*[:：]\s*(?:\*\*)?\s*(?:\*\*)?([A-Za-z가-힣][\w가-힣./-]*)/im;
const CLOSED_DIR_RE = /\/(archived?|closed|done|completed?)\//i;

/** 상태 추정(순수). 반환: {hasFrontmatter, estimate|null, source: 'frontmatter'|'body'|'dir'|'none'} */
function estimateStatus(rel, txt) {
  const fm = frontmatter(txt);
  if (fm && field(fm, 'status')) return { hasFrontmatter: true, estimate: field(fm, 'status'), source: 'frontmatter' };
  const body = String(txt || '').replace(/```[\s\S]*?```/g, '');
  const m = body.match(BODY_STATUS_RE);
  if (m) return { hasFrontmatter: !!fm, estimate: m[1].replace(/\*+$/, ''), source: 'body' };
  if (CLOSED_DIR_RE.test('/' + rel)) return { hasFrontmatter: !!fm, estimate: 'Closed', source: 'dir' };
  return { hasFrontmatter: !!fm, estimate: null, source: 'none' };
}

/** `status:` 한 줄 삽입(순수). frontmatter 가 있으면 여는 --- 바로 아래, 없으면 선두 주석 뒤에 최소 블록을 만든다. EOL 보존. */
function insertStatus(txt, status) {
  const s = String(txt || '');
  const eol = (s.match(/\r\n/g) || []).length > (s.match(/(?<!\r)\n/g) || []).length ? '\r\n' : '\n';
  const fmMatch = s.match(/^(?:\s|<!--[\s\S]*?-->)*---\r?\n([\s\S]*?)\r?\n---/);
  if (fmMatch) {
    const openRel = fmMatch[0].search(/---\r?\n/);
    const lineEnd = openRel + fmMatch[0].slice(openRel).match(/---\r?\n/)[0].length;
    return s.slice(0, lineEnd) + `status: ${status}${eol}` + s.slice(lineEnd);
  }
  const lead = s.match(/^\s*<!--[\s\S]*?-->[ \t]*\r?\n/);
  const at = lead ? lead[0].length : 0;
  return s.slice(0, at) + `---${eol}status: ${status}${eol}---${eol}` + s.slice(at);
}

/** 대상 수집(읽기 전용). 반환: [{file, domain, hasFrontmatter, estimate, source}] — status 가 이미 있는 문서는 빠진다. */
function plan(root = path.resolve(__dirname, '..')) {
  const rows = [];
  for (const dir of SCAN_DIRS) {
    walkFiles(root, dir, rel => {
      if (!rel.endsWith('.md')) return;
      const p = parse(rel.split('/').pop());
      if (!p || !DOMAINS.has(p.domain)) return;
      let txt = '';
      try { txt = fs.readFileSync(path.join(root, rel), 'utf8'); } catch { return; }
      const e = estimateStatus(rel, txt);
      if (e.source === 'frontmatter') return;
      rows.push({ file: rel, domain: p.domain, hasFrontmatter: e.hasFrontmatter, estimate: e.estimate, source: e.source });
    });
  }
  return rows.sort((a, b) => a.file.localeCompare(b.file));
}

/** 적용(쓰기). 추정값 있는 행만. 반환: {applied: [...], skipped: [...]} */
function apply(root, rows) {
  const applied = [], skipped = [];
  for (const r of rows) {
    if (!r.estimate) { skipped.push(r); continue; }
    const abs = path.join(root, r.file);
    fs.writeFileSync(abs, insertStatus(fs.readFileSync(abs, 'utf8'), r.estimate));
    applied.push(r);
  }
  return { applied, skipped };
}

function resolveRoot(argv, dflt) {
  const i = argv.indexOf('--root');
  if (i < 0) return dflt;
  const v = argv[i + 1];
  return v && !v.startsWith('--') ? path.resolve(v) : null;
}

function run(argv = process.argv.slice(2)) {
  const root = resolveRoot(argv, path.resolve(__dirname, '..'));
  if (!root) { console.error('frontmatter-backfill: --root <dir> 의 값이 없다.'); return OUTCOME.CLARIFY; }
  if (!fs.existsSync(path.join(root, '.union-stack'))) { console.error(`frontmatter-backfill: ${root}: .union-stack 없음 — 대상 아님.`); return OUTCOME.CLARIFY; }
  const rows = plan(root);
  const json = argv.includes('--json');
  if (argv.includes('--apply')) {
    const { applied, skipped } = apply(root, rows);
    if (json) { console.log(JSON.stringify({ root, applied, skipped }, null, 2)); return skipped.length ? OUTCOME.CLARIFY : OUTCOME.PASS; }
    console.log(`frontmatter-backfill: ${applied.length}건에 status: 삽입(로컬 어휘 그대로 — 매핑은 adapter.json statusMap).`);
    applied.forEach(r => console.log(`  + ${r.file}  status: ${r.estimate}  (${r.source})`));
    if (skipped.length) {
      console.error(`\n추정 불가 ${skipped.length}건 — 비워 둔다(사람이 채운다):`);
      skipped.forEach(r => console.error(`  ? ${r.file}`));
      return OUTCOME.CLARIFY;
    }
    return OUTCOME.PASS;
  }
  if (json) { console.log(JSON.stringify({ root, rows }, null, 2)); return rows.length ? OUTCOME.CLARIFY : OUTCOME.PASS; }
  if (!rows.length) { console.log('frontmatter-backfill 통과: status: 없는 WO·PRO 문서 0건.'); return OUTCOME.PASS; }
  console.error(`\n[frontmatter-backfill] status: 없는 WO·PRO 문서 ${rows.length}건 (dry-run — 파일을 쓰지 않았다):`);
  rows.forEach(r => console.error(`  ? ${r.file}  →  ${r.estimate ? `status: ${r.estimate}` : '(추정 불가 — 비움)'}  [${r.source}${r.hasFrontmatter ? '' : ' · frontmatter 없음'}]`));
  console.error('\n적용은 어답터 몫: node scripts/frontmatter-backfill.js --apply  (추정값 있는 행만 · status: 한 줄만 삽입)');
  return OUTCOME.CLARIFY;
}

module.exports = { estimateStatus, insertStatus, plan, apply, resolveRoot, run, CONTRACT, SCAN_DIRS, BODY_STATUS_RE };

if (require.main === module) process.exit(withContract(CONTRACT, argv => run(argv))());
