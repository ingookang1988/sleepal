#!/usr/bin/env node
// scripts/permission-guard.js
// 권한 규율 강제 게이트 — 선언으로만 있던 권한 tier를 코드로 검사한다(git diff 기반).
//
//  Check A (항상): append-only 무결성 — Raw/append 평면에서 **항목 소멸** 금지([PRO-18]).
//                  archive_ledger(.md + 회전본) · verification/raw/ · plan/meetings/ · plan/analytics/ .
//                  지키는 불변식은 "줄이 파일에서 사라지지 않는 것"이 아니라 "**항목이 기록에서
//                  사라지지 않는 것**"이다 — 파일이 하나뿐일 때만 둘이 같았다. 그래서 사라진 실질 줄은
//                  **같은 diff 안의 다른 append-only 경로에 축자 그대로** 있어야 통과한다(보존 검사).
//                  이동=PASS · 한 줄이라도 유실=REJECT · 단순 삭제=REJECT. 우회 플래그는 없다 —
//                  가드가 조작자를 신뢰하는 대신 diff 에서 **검증**한다.
//  Check B (--strict): Schema 편집 승인 — 에이전트 작성 변경이 Schema 평면을 건드리면 ([PRO-09])
//                  커밋에 `Approved-by:` 트레일러 필수. 둘 중 하나로 충족:
//                  (a) 인간 명시 승인 = `Approved-by: <이름>`(GRANT-로 시작하지 않는 값),
//                  (b) 상시 스탬프 = `Approved-by: GRANT-id` — GRANTS.md의 그 grant가 이 경로를 커버할 때만.
//                  정책 의존이라 strict에서만(정직한 한계).
//  Check C (--strict): 신뢰도 티어 ([PRO-12]) — Check B의 **완화**이자 위계 게이트.
//                  · tier: draft 문서는 에이전트가 승인 없이 생성·편집 가능(규범 효력 0이므로).
//                  · tier 자기승격(에이전트 커밋이 reviewed/ratified 도입) → REJECT. 승격은 인간만.
//                  · Schema 신규 .md의 tier 미기입 → CLARIFY(비차단 — 질문 병기 후 진행).
//                  · 기존 문서(tier 미기입)는 ratified 간주 — 소급 표기 의무 없음, Check B 규칙 유지.
//
// 차단 정책([PRO-11]): REJECT(exit 1)만 차단. CLARIFY(exit 3)는 표면화 — CI는 실패로 처리하지 않는다.
//
// 실행:
//   node scripts/permission-guard.js              # staged diff (pre-commit)
//   node scripts/permission-guard.js --range A..B # 커밋 범위 (CI)
//   node scripts/permission-guard.js --strict     # Schema 승인 + 티어까지 검사
//   node scripts/permission-guard.js --contract   # 계약 선언(JSON) 출력
//   node scripts/permission-guard.js --allow-no-git # 검사 불가를 인간이 명시 승인(경고 후 통과)
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { OUTCOME, withContract } = require('./gate-contract');
const { readFront } = require('./zfs_index');

const CONTRACT = {
  gate: 'Permission Gate (permission-guard)',
  input: 'git diff 경로·줄수 + 범위 끝 커밋의 트레일러(Approved-by/Co-Authored-by) + 문서 frontmatter tier',
  predicate: 'P(preflight): 검사를 수행할 수 있는 상태여야 한다(git 저장소 + 제어평면이 그 안) — 아니면 통과가 아니라 REJECT · A: append-only 평면의 실질 줄 소멸 금지(같은 diff 안 다른 append-only 경로로의 축자 이동은 허용) · B(strict): Schema 편집의 승인 스탬프 · C(strict): tier 자기승격 금지, draft 자유 편집, 신규 tier 미기입 표면화',
  scope: '경로·diff·트레일러·frontmatter만 본다 — 변경 내용의 의미·품질, 코드 결합, GRANTS 행 추가의 정당성은 보지 않음. 보존 검사는 줄의 축자 일치만 본다(옮긴 자리가 적절한지·순서는 보지 않음)',
  outcomes: ['PASS', 'REJECT', 'CLARIFY'],
  failure_mode: 'REJECT: 위반 목록 출력 후 차단 · CLARIFY: 질문 표면화 후 진행(비차단)',
};

// 경로 → tier 규칙 (AGENTS.md 규칙 2와 동기화).
const SCHEMA = [
  /^\.union-stack\/project\//,
  /^\.union-stack\/architecture\//,
  /^\.union-stack\/plan\/(?!meetings\/|analytics\/)/, // plan 본체는 Schema, meetings·analytics는 append-only(아래)
  /^\.union-stack\/reference\/contracts\//,
  /^\.union-stack\/reference\/domain\//,              // 가이드상 Schema였으나 분류에서 누락됐던 것([PRO-09]에서 정합)
];

const GRANTS_FILE = '.union-stack/project/GRANTS.md';
const APPEND_ONLY = [
  /^\.union-stack\/archive_ledger\.md$/,
  /^\.union-stack\/archive_ledger\/ADR-\d+_\d+\.md$/,  // 회전본([PRO-18]) — 안 넣으면 회전이 곧 보호 이탈
  /^\.union-stack\/verification\/raw\//,
  /^\.union-stack\/plan\/meetings\//,
  /^\.union-stack\/plan\/analytics\//,
];

/**
 * 변경 경로의 권한 성격 분류(순수).
 *
 * `_GUIDE.md` 는 어느 평면에 있든 **방법론 텍스트**이지 항목 저장소가 아니므로 append-only 에서
 * 뺀다. 실측: `plan/meetings/_GUIDE.md`·`plan/analytics/_GUIDE.md` 가 오늘도 append-only 로 분류돼
 * *가이드 한 줄 고치는 것이 REJECT* 였다(잠재 결함). Schema 판정은 그대로다 — `project/_GUIDE.md`
 * 는 여전히 schema 이고 GRANT-02 가 그 편집을 다스린다.
 */
function classify(p) {
  const isGuide = /(^|\/)_GUIDE\.md$/.test(p);
  if (!isGuide && APPEND_ONLY.some(r => r.test(p))) return 'append-only';
  if (SCHEMA.some(r => r.test(p))) return 'schema';
  return 'other';
}

/**
 * 보존 검사(순수) — 사라진 실질 줄이 **같은 diff 안의 append-only 경로에 축자 그대로** 있는가.
 *
 * 반환: 대응을 못 찾은 줄 배열(빈 배열 = 이동으로 확인됨) · `null` = **판정 불가**
 * (줄 정보가 없는 호출 — 계수만 넘어온 경우). 판정 불가는 통과가 아니다: 호출부가 오늘의
 * 규칙(삭제 있으면 REJECT)으로 되돌아간다([ADR-23] "관측 불가 ≠ 통과").
 *
 * 다중집합으로 센다 — 같은 줄이 2번 사라졌는데 1번만 추가됐으면 1줄은 유실이다.
 * 자기 파일의 추가분도 풀에 넣는다: 제자리 재배열은 잃은 것이 없으므로 보존이다.
 */
function accountRemovals(changes) {
  const pool = new Map();
  let sawLines = false;
  for (const c of changes) {
    if (classify(c.path) !== 'append-only' || !Array.isArray(c.addedLines)) continue;
    sawLines = true;
    for (const l of c.addedLines) pool.set(l, (pool.get(l) || 0) + 1);
  }
  const out = new Map();
  for (const c of changes) {
    if (classify(c.path) !== 'append-only' || !c.removed) continue;
    if (!Array.isArray(c.removedLines)) { out.set(c.path, null); continue; }  // 판정 불가
    sawLines = true;
    const missing = [];
    for (const l of c.removedLines) {
      const n = pool.get(l) || 0;
      if (n > 0) pool.set(l, n - 1); else missing.push(l);
    }
    out.set(c.path, missing);
  }
  return sawLines ? out : null;
}

/**
 * 삭제된 줄이 *실제 엔트리*인지 판정(순수). 헤더 주석·제목·표 구분선만 제외 —
 * 데이터가 담긴 표 행은 엔트리로 센다(원장·회의록 엔트리가 표 행이므로, `^\|` 일괄 제외는 사각지대).
 * 표머리 행 편집이 걸리는 false-positive는 감수한다(Fail-close 방향 — 인간이 확인).
 */
function isSubstantiveLine(t) {
  if (!t) return false;
  if (/^<!--|-->$|^#/.test(t)) return false;   // 주석·제목
  if (/^\|[\s|:-]*\|?$/.test(t)) return false; // 표 구분선(|---|---|)·빈 표 라인
  return true;
}

/** glob(스코프) → 앵커된 정규식(순수). `**`=슬래시 포함 임의, `*`=슬래시 제외. */
function globToRe(glob) {
  const esc = String(glob).trim().replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const re = esc.replace(/\*\*/g, '\0').replace(/\*/g, '[^/]*').replace(/\0/g, '.*');
  return new RegExp('^' + re + '$');
}

/**
 * 변경 목록 + 커밋 메타 → 위반 목록(순수, git 비의존 → 테스트 용이).
 * changes: [{path, added, removed, addedLines?, removedLines?, isNew?, tier?, tierEscalated?}]
 *   · tier류는 strict 보강 필드 — 없으면 Check B만.
 *   · *Lines 는 append-only 경로의 보존 검사 재료 — 없으면 "판정 불가"라 오늘의 규칙(삭제=REJECT)으로 되돌아간다.
 * meta: {agentAuthored, approvals:[string]}  (approvals = 커밋의 Approved-by 값들)
 * opts: {strict, grants:[{id, scopeRe}]}
 * 반환 항목: {rule, path, msg, outcome: 'REJECT'|'CLARIFY'} — 차단 여부는 outcome이 정한다([PRO-11]).
 */
function findViolations(changes, meta = {}, opts = {}) {
  const v = [];
  const accounted = accountRemovals(changes);   // 보존 검사는 diff 전체를 봐야 하므로 루프 밖에서 1회
  const grants = opts.grants || [];
  const approvals = meta.approvals || [];
  const humanApproval = approvals.some(a => !/^GRANT-/i.test(a.trim())); // GRANT-가 아닌 값 = 인간 명시 승인
  const cited = approvals.filter(a => /^GRANT-/i.test(a.trim())).map(a => a.trim().toUpperCase());
  for (const c of changes) {
    const tier = classify(c.path);
    if (tier === 'append-only' && c.removed > 0) {
      const missing = accounted && accounted.get(c.path);
      if (missing === undefined || missing === null) {
        // 줄 정보 없음 → 이동 여부를 판정할 수 없다. 오늘의 규칙으로 되돌아간다(fail-close).
        v.push({ rule: 'append-only', path: c.path, outcome: 'REJECT',
          msg: `append-only 평면에서 ${c.removed}줄 삭제·수정됨(추가만 허용)` });
      } else if (missing.length) {
        v.push({ rule: 'append-only', path: c.path, outcome: 'REJECT',
          msg: `append-only 평면에서 ${missing.length}줄이 **소멸**했다(어느 append-only 경로에도 없음). `
            + `회전이라면 회전본에 축자 그대로 옮겨라. 첫 항목: ${JSON.stringify(missing[0].slice(0, 60))}` });
      }
      // missing.length === 0 → 이동으로 확인됨. 통과.
    }
    if (opts.strict && tier === 'schema' && meta.agentAuthored) {
      if (humanApproval) continue;                       // (a) 인간 명시 승인 — 승격 포함 전부 허용
      // Check C-1: tier 자기승격 — grant보다 먼저 본다. 상시 스탬프는 편집 위임이지
      // 승격 권한이 아니다([PRO-12] "승격은 인간만").
      if (c.tierEscalated) {
        v.push({ rule: 'tier-self-promotion', path: c.path, outcome: 'REJECT',
          msg: 'tier 자기승격(reviewed/ratified 도입) — 승격은 인간 명시 승인(Approved-by)으로만' });
        continue;
      }
      const covered = cited.some(id => {                 // (b) 상시 스탬프가 이 경로를 커버 + 인용됨
        const g = grants.find(x => x.id === id);
        return g && g.scopeRe.test(c.path);
      });
      if (covered) continue;
      // Check C-2: draft 완화 — 규범 효력 0인 문서는 승인 없이 생성·편집 가능([PRO-12]).
      if (c.tier === 'draft') continue;
      // Check C-3: 신규 .md의 tier 미기입 — 넛지만(CLARIFY, 비차단). 기존 문서는 ratified 간주 → Check B로.
      if (c.isNew && !c.tier && /\.md$/.test(c.path)) {
        v.push({ rule: 'tier-missing', path: c.path, outcome: 'CLARIFY',
          msg: 'Schema 신규 문서에 tier 미기입 — 위임 초안이면 `tier: draft`를 권장(비차단)' });
        continue;
      }
      const msg = cited.length
        ? `Schema를 에이전트가 변경 — 인용한 스탬프(${cited.join(',')})가 이 경로를 커버하지 않음`
        : 'Schema를 에이전트가 변경 — `Approved-by:` (인간 승인 또는 GRANT-id) 없음';
      v.push({ rule: 'schema-approval', path: c.path, outcome: 'REJECT', msg });
    }
  }
  return v;
}

// --- git 어댑터 (얇음) ---
// 인자 배열로만 호출(execFile) — git이 보고한 파일명이 셸을 거치지 않는다(명령 주입 차단).
// core.quotepath=false: non-ASCII(한글 등) 경로의 octal-quote를 끄지 않으면 경로 매칭이 조용히 실패한다.
function git(args) {
  return execFileSync('git', ['-c', 'core.quotepath=false', ...args], { encoding: 'utf8' });
}

// --- 검사 가능 상태 판정 (preflight) ---
// Fail-close(AGENTS.md 규칙 1): 검사를 *수행할 수 없는* 상태는 통과가 아니다.
// git 저장소가 아니거나 제어평면이 저장소 밖에 있으면 diff를 뜰 수 없고, 그러면
// 이 게이트는 아무것도 막지 못한 채 초록불만 켠다. 그 상태를 REJECT로 드러낸다.
// `--allow-no-git` = 인간의 명시 우회(경고 후 통과, 검사는 수행 안 함).

/**
 * 저장소 루트. git이 아니면 null.
 * 여기서만 stderr를 버린다 — "저장소가 아니다"는 이 함수가 *판정하려는 사실*이지 오류가 아니고,
 * git의 `fatal: not a git repository`가 우리 메시지 앞에 끼면 진짜 진단이 묻힌다.
 * 공용 git() 헬퍼는 그대로 둔다(다른 호출부는 stderr가 보여야 한다).
 */
function gitRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() || null;
  } catch { return null; }
}

/**
 * 검사를 수행할 수 있는 상태인가(순수). git 비의존 → 테스트 용이.
 * env: {gitRoot: string|null, controlPlaneInRepo: boolean}  opts: {allowNoGit: boolean}
 * @returns {{ok: boolean, code: number, reason: string|null}}
 */
function preflight(env, opts = {}) {
  const bypass = (reason) => opts.allowNoGit
    ? { ok: false, code: OUTCOME.PASS, reason: `${reason} (--allow-no-git으로 우회됨)` }
    : { ok: false, code: OUTCOME.REJECT, reason };

  if (!env.gitRoot) return bypass('git 저장소가 아니다 — staged diff를 뜰 수 없다');
  if (!env.controlPlaneInRepo) {
    return bypass(`제어평면(.union-stack/)이 저장소(${env.gitRoot}) 밖에 있다 — 변경을 추적할 수 없다`);
  }
  return { ok: true, code: OUTCOME.PASS, reason: null };
}

// append-only 위반은 *실제 엔트리*만 본다(판정은 isSubstantiveLine — 순수, 테스트됨).
// 계수가 아니라 **줄 자체**를 낸다 — 보존 검사가 축자 대조를 하려면 내용이 필요하다.
function substantiveLines(range, file, sign) {
  const args = ['diff', '--unified=0'];
  if (range) args.push(range); else args.push('--cached');
  args.push('--', file);
  let out = '';
  try { out = git(args); } catch { return []; }
  const skip = sign === '-' ? '---' : '+++';
  return out.split('\n')
    .filter(l => l.startsWith(sign) && !l.startsWith(skip))
    .map(l => l.slice(1).trim())
    .filter(isSubstantiveLine);
}

function readChanges(range) {
  const args = ['diff', '--numstat'];
  if (range) args.push(range); else args.push('--cached');
  let out = '';
  try { out = git(args); } catch { return null; } // git 아님/실패 → 건너뜀
  return out.split('\n').filter(Boolean).map(line => {
    const [a, r, ...rest] = line.split('\t');
    const p = rest.join('\t');
    let removed = r === '-' ? 0 : +r;
    const c = { added: a === '-' ? 0 : +a, removed, path: p };
    // append-only 경로만 줄 내용을 수집한다 — 보존 검사의 재료이고, 그 외 경로엔 쓸 데가 없다
    // (diff 2회/파일의 비용을 평상시엔 안 낸다 — Check C 보강 필드와 같은 방침).
    if (classify(p) === 'append-only') {
      c.removedLines = removed > 0 ? substantiveLines(range, p, '-') : [];
      c.addedLines = c.added > 0 ? substantiveLines(range, p, '+') : [];
      c.removed = c.removedLines.length;
    }
    return c;
  });
}

// --- Check C 보강 필드(strict에서만 조회 — diff 2회/파일의 비용을 평상시엔 안 낸다) ---
function newFileSet(range) {
  const args = ['diff', '--diff-filter=A', '--name-only'];
  if (range) args.push(range); else args.push('--cached');
  try { return new Set(git(args).split('\n').filter(Boolean)); } catch { return new Set(); }
}

// 이 변경이 tier를 reviewed/ratified로 "도입"했는가(diff의 + 줄 기준 — 기존 줄 유지와 구별).
function tierEscalatedIn(range, file) {
  const args = ['diff', '--unified=0'];
  if (range) args.push(range); else args.push('--cached');
  args.push('--', file);
  let out = '';
  try { out = git(args); } catch { return false; }
  return out.split('\n').some(l => /^\+\s*tier:\s*(reviewed|ratified)\b/i.test(l));
}

/** strict용: changes에 isNew·tier(현재 파일)·tierEscalated를 붙인다. Schema .md만. */
function enrichForTier(changes, range, root = process.cwd()) {
  const added = newFileSet(range);
  return changes.map(c => {
    if (classify(c.path) !== 'schema' || !/\.md$/.test(c.path)) return c;
    const front = readFront(path.join(root, c.path));
    return { ...c, isNew: added.has(c.path), tier: front.tier, tierEscalated: tierEscalatedIn(range, c.path) };
  });
}

function readMeta(range) {
  // strict 검사용 — 범위 끝 커밋의 메시지에서 트레일러를 읽는다.
  if (!range) return {}; // pre-commit 시점엔 커밋 메시지가 없음
  const tip = range.split('..').pop();
  let body = '';
  try { body = git(['log', '-1', '--format=%B', tip]); } catch { return {}; }
  return {
    agentAuthored: /co-authored-by:\s*claude/i.test(body),
    approvals: [...body.matchAll(/^\s*approved-by:\s*(.+?)\s*$/gim)].map(m => m[1]),
  };
}

// 상시 스탬프 원장(GRANTS.md, 인간 소유 Schema)에서 grant 행을 읽는다. `| GRANT-XX | <scope> | ...`.
// scope가 `.union-stack/`로 시작하는 행만 유효(더미/예시 행·헤더 배제).
function readGrants(root = process.cwd()) {
  let txt = '';
  try { txt = fs.readFileSync(path.join(root, GRANTS_FILE), 'utf8'); } catch { return []; }
  const grants = [];
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\|\s*(GRANT-\w+)\s*\|\s*([^|]+?)\s*\|/i);
    if (m && /^\.union-stack\//.test(m[2].trim())) grants.push({ id: m[1].toUpperCase(), scopeRe: globToRe(m[2]) });
  }
  return grants;
}

function run(argv = process.argv.slice(2)) {
  const strict = argv.includes('--strict');
  const ri = argv.indexOf('--range');
  const range = ri >= 0 ? argv[ri + 1] : null;
  // 검사 가능 상태 판정(fail-close — 위 preflight 주석 참조).
  const root = gitRoot();
  const pf = preflight(
    { gitRoot: root, controlPlaneInRepo: !!root && fs.existsSync(path.join(root, '.union-stack')) },
    { allowNoGit: argv.includes('--allow-no-git') }
  );
  if (!pf.ok) {
    console.error(`권한 가드: ${pf.reason}`);
    return pf.code;
  }
  let changes = readChanges(range);
  if (changes === null) {
    console.error('권한 가드: git diff 실패 — 검사 불가는 통과가 아니다(fail-close).');
    return OUTCOME.REJECT;
  }
  if (changes.length === 0) {
    console.log('권한 가드: 검사할 변경 없음 — 통과.');
    return OUTCOME.PASS;
  }
  if (strict) changes = enrichForTier(changes, range);
  const meta = readMeta(range);
  const violations = findViolations(changes, meta, { strict, grants: readGrants() });
  const rejects = violations.filter(x => x.outcome !== 'CLARIFY');
  const clarifies = violations.filter(x => x.outcome === 'CLARIFY');
  if (rejects.length) {
    console.error('\n[권한 가드] 권한 규율 위반:');
    rejects.forEach(x => console.error(`  ✗ (${x.rule}) ${x.path} — ${x.msg}`));
    clarifies.forEach(x => console.error(`  ? (${x.rule}) ${x.path} — ${x.msg}`));
    console.error('\nappend-only 평면은 추가만. Schema 편집은 `Approved-by: <이름>`(인간 승인) 또는\n`Approved-by: GRANT-id`(GRANTS.md의 상시 스탬프가 그 경로를 커버).\ntier 승격은 인간 승인만([PRO-12]). AGENTS.md 규칙 2 참조.\n');
    return OUTCOME.REJECT;
  }
  if (clarifies.length) {
    console.error('\n[권한 가드] CLARIFY — 질문 병기 후 진행(비차단, [PRO-11] 차단 정책):');
    clarifies.forEach(x => console.error(`  ? (${x.rule}) ${x.path} — ${x.msg}`));
    return OUTCOME.CLARIFY;
  }
  console.log('권한 가드 통과: append-only 무결성' + (strict ? ' + Schema 승인 + tier' : '') + ' OK.');
  return OUTCOME.PASS;
}

module.exports = { classify, findViolations, accountRemovals, isSubstantiveLine, preflight, globToRe, readGrants, enrichForTier, run, CONTRACT, SCHEMA, APPEND_ONLY };

if (require.main === module) process.exit(withContract(CONTRACT, run)());
