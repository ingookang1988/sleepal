#!/usr/bin/env node
// scripts/zfs-linter.js
// ZFS 네이밍 규약을 강제하는 Fail-close 게이트. CI 최상단에 배치 권장.
// 실행: node scripts/zfs-linter.js [--contract]
const path = require('path');
const { ZFS_REGEX, isValidDomain, isValidName, VALID_DOMAINS } = require('./zfs_util');
const { walkFiles } = require('./fs_walk');
const { withContract } = require('./gate-contract');
const { load: loadAdapter } = require('./adapter');

// 계약 선언([PRO-11] — [GRAM-12c] 꼴). scope의 "안 보는 것"이 LSN-13류 오독을 막는 핵심.
const CONTRACT = {
  gate: 'ZFS Naming Gate (zfs-linter)',
  input: '.union-stack/ 대상 디렉터리의 .md 파일명(면제 목록 제외)',
  predicate: '[DOMAIN]-[LUHMANN_ID]_[slug].md 형식 · 허용 도메인 · Luhmann ID의 l/o 금지',
  scope: '파일명만 본다 — 내용·frontmatter·참조 무결성(ref-linter 소관)·파일 간 결합은 보지 않음. 면제 목록은 고정분 + 어답터 설정(adapter.json zfsIgnored)의 합집합',
  outcomes: ['PASS', 'REJECT'],
  failure_mode: '위반 파일 목록 출력 후 REJECT(차단)',
};

// ZFS ID를 갖는 원자적 문서가 사는 디렉터리 (.union-stack/ 격리 구조)
const BASE = '.union-stack';
const TARGET_DIRS = [
  'plan', 'feature/flow', 'sprint', 'architecture', 'verification',
  'reference/contracts', 'reference/lessons', 'reference/domain', 'reference/tools',
  'project/roadmap', 'proposals',
].map(d => `${BASE}/${d}`);

// ZFS 규약에서 면제되는 고정 매니페스트/가이드 파일
const IGNORED = new Set([
  'README.md', '_GUIDE.md', 'DESIGN_RATIONALE.md',
  'next.md', 'prev.md', 'live.md', 'target.md', 'hold.md',
  'state.md', 'evidence.md', 'gap.md', 'HANDOFF.md', 'HISTORY.md',
]);
const IGNORED_SUFFIX = ['_GUIDE.md'];

/**
 * 면제 목록 = 고정분 ∪ 어답터 설정(순수).
 * 어답터는 고유 매니페스트(ZFS ID 를 갖지 않는 고정 파일)를 갖는 것이 정상이고, 그때 지금까지의
 * 유일한 선택지는 **이 sync 파일을 직접 고치는 것**이었다(→ 다음 --apply 가 조용히 되돌린다).
 * 설정으로 흡수해 그 포크를 0으로 만든다.
 */
function ignoredSet(root) {
  const cfg = loadAdapter(root);
  return { names: new Set([...IGNORED, ...cfg.zfsIgnored]), warnings: cfg.warnings };
}

/** 위반 목록을 반환하는 순수-ish 함수(출력·exit 없음). MCP/CLI 공유. */
function lint(root = path.resolve(__dirname, '..')) {
  const violations = [];
  const { names } = ignoredSet(root);
  const scan = relDir => walkFiles(root, relDir, rel => {
    const entry = rel.split('/').pop();
    if (!entry.endsWith('.md')) return;
    if (names.has(entry) || IGNORED_SUFFIX.some(s => entry.endsWith(s))) return;
    if (isValidName(entry)) return;
    const m = entry.match(ZFS_REGEX);
    let hint = null;
    if (m && !isValidDomain(m[1])) hint = `'${m[1]}'은 허용 도메인이 아님. 허용: ${[...VALID_DOMAINS].join(' ')}`;
    else {
      const idPart = (entry.split('_')[0] || '').replace(/^[A-Z]{2,6}-/, '');
      if (/[lo]/.test(idPart)) hint = "Luhmann ID에 'l'/'o' 금지(숫자 1/0과 혼동).";
    }
    violations.push({ file: rel, hint });
  });
  TARGET_DIRS.forEach(scan);
  return violations;
}

function run() {
  const root = path.resolve(__dirname, '..');
  ignoredSet(root).warnings.forEach(w => console.error(`[ZFS] 설정 경고: ${w}`));
  const violations = lint(root);
  if (violations.length) {
    violations.forEach(v => {
      console.error(`\n[ZFS] 규칙 위반: ${v.file}`);
      console.error(`      형식: [DOMAIN]-[LUHMANN_ID]_[slug].md`);
      if (v.hint) console.error(`      힌트: ${v.hint}`);
    });
    console.error('\nFail-close: ZFS 규약 위반 파일이 존재합니다.\n');
    return 1;
  }
  console.log('ZFS 네이밍 검사 통과.');
  return 0;
}

module.exports = { lint, run, ignoredSet, CONTRACT, TARGET_DIRS, IGNORED, IGNORED_SUFFIX };

if (require.main === module) process.exit(withContract(CONTRACT, run)());
