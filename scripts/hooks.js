// scripts/hooks.js
// 작업 진입 의례의 *런타임 강제* 순수 로직 — CLI 게이트(사후)와 달리 에이전트가 행동하기 *직전*에 작동한다.
// 두 결정 함수만 담는다(전부 순수 → hooks.test.js 로 검증). FS·stdin 접근은 얇은 어댑터(hook-*.js)에.
//
//  decideEdit  : 파일을 편집/생성하기 직전(PreToolUse) — Schema 읽기전용·Blast-Radius 잠금을 검사.
//  extractWorkId: 사용자 프롬프트에서 ZFS 작업 ID를 뽑아 UserPromptSubmit 컨텍스트 주입 트리거.
//
// 설계 근거: AGENTS.md 규칙 1·2는 "의례 수행 자체는 런타임 훅 없이는 완전 강제 불가"를 정직한 한계로 남겼다.
//   이 모듈이 그 간극을 닫는다 — 선언(게이트는 커밋·CI)에서 *사전 차단*(편집 직전)으로.
const path = require('path');
const { parseId, isValidDomain } = require('./zfs_util');
const { classify } = require('./permission-guard');
const { blastRadius } = require('./query');

// 편집 경로를 레포-상대 '/' 경로로 정규화. 절대경로(훅 입력)·상대경로 모두 허용.
function toRel(file, root) {
  if (!file) return '';
  let rel = path.isAbsolute(file) ? path.relative(root, file) : file;
  return rel.split(path.sep).join('/');
}

/**
 * 편집/생성 직전 결정(순수). mode: 'off' | 'warn' | 'enforce'.
 *  - Schema tier 편집      → enforce에서 차단, warn에서 경고(에이전트는 Schema read-only).
 *  - Blast-Radius 잠금     → mode≠off 면 항상 차단(Verifying 자손은 Fail-close 불변식).
 * 반환: { block, issues:[{kind, block, msg}] }
 */
function decideEdit(file, index, mode = 'warn', root = process.cwd()) {
  if (mode === 'off') return { block: false, issues: [] };
  const rel = toRel(file, root);
  const issues = [];

  if (classify(rel) === 'schema') {
    issues.push({
      kind: 'schema',
      block: mode === 'enforce',
      msg: `Schema-tier 파일은 에이전트 read-only (AGENTS.md 규칙 2): ${rel}. ` +
        `하네스 규칙 변경은 .union-stack/proposals/ 로, 인간 승인 후 반영.`,
    });
  }

  // 파일명이 ZFS 노드일 때만 blast-radius 검사 — 도메인 화이트리스트 대조 없이는
  // UTF-8_notes.md 같은 일반 파일명의 `UTF`-`8`이 노드 ID로 오인된다(parseId는 구조만 본다).
  const base = path.basename(rel);
  const dm = base.match(/^([A-Z]{2,6})-/);
  const id = dm && isValidDomain(dm[1]) ? parseId(base) : null;
  if (id) {
    const br = blastRadius(id, index);
    if (br.blocked) {
      issues.push({
        kind: 'lock',
        block: true, // 잠금은 mode와 무관하게 차단(이미 blast-radius.js가 Fail-close하는 불변식)
        msg: `Blast-Radius(${id})에 잠금 노드 존재: ` +
          br.locked.map(l => `${l.domain}-${l.id}(${l.status})`).join(', ') +
          ` — 변경 보류, 인간 확인 필요 (node scripts/blast-radius.js ${id}).`,
      });
    }
  }

  return { block: issues.some(i => i.block), issues };
}

// 프롬프트에서 첫 *유효 도메인* ZFS 작업 ID(브래킷/플레인 모두) 추출. 없으면 null.
// 도메인을 VALID_DOMAINS와 대조하지 않으면 UTF-8→`8`, SHA-256→`256` 같은
// 기술 토큰이 컨텍스트 주입 트리거가 된다. 무효 도메인은 건너뛰고 다음 후보를 본다.
const WORKID_RE = /\b([A-Z]{2,6})-([0-9][0-9a-z-]*)\b/g;
function extractWorkId(prompt) {
  for (const m of String(prompt || '').matchAll(WORKID_RE)) {
    if (!isValidDomain(m[1])) continue;
    const id = parseId(`${m[1]}-${m[2]}`);
    if (id) return id;
  }
  return null;
}

module.exports = { decideEdit, extractWorkId, toRel };
