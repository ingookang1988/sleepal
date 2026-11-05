#!/usr/bin/env node
// scripts/init.js
// 템플릿 → 실제 프로젝트 1-샷 전환(온보딩 마찰 제거). 파괴적이라 dry-run 기본 + --apply.
//
//   node scripts/init.js --name "My Project" --slug my_project        # 미리보기(dry-run)
//   node scripts/init.js --name "My Project" --slug my_project --apply # 실제 적용
//   ... --apply --drop-template-bits   # 템플릿 전용 자산(누설가드·픽스처테스트·template-guard.yml)까지 제거
//
// 하는 일: 정체성 시딩(IDENTITY) · 더미(example) 제거 · 매니페스트 초기화 · package.json 이름/버전.
// 보존: 모든 _GUIDE.md, architecture/ARCH-00(방법론), 강제 게이트 스크립트.
const fs = require('fs');
const path = require('path');
const { walkFiles } = require('./fs_walk');
const { HEAD: LEDGER_HEAD, isLedgerStore } = require('./ledger');
const { prefixUpstreamRefs } = require('./ref-linter');

const KEEP_EXACT = new Set(['.union-stack/architecture/ARCH-00_zfs_naming.md']);
const EXPLICIT_DUMMIES = new Set([
  '.union-stack/reference/contracts/CON-00_test_infra_catalog.md',
  '.union-stack/reference/contracts/CON-01_shared_types.md',
]);
const RESET_TARGETS = new Set([
  '.union-stack/feature/live.md', '.union-stack/sprint/next.md', '.union-stack/sprint/HANDOFF.md',
  '.union-stack/verification/derived/gap.md', '.union-stack/verification/derived/state.md',
  '.union-stack/verification/raw/evidence.md', '.union-stack/verification/raw/receipts.md', '.union-stack/project/HISTORY.md',
  '.union-stack/project/GRANTS.md', '.union-stack/archive_ledger.md',
]);
const TEMPLATE_BITS = [
  'scripts/leakage-guard.js', 'scripts/leakage-guard.test.js',
  'scripts/zfs_index.test.js', '.github/workflows/template-guard.yml',
];
const IDENTITY_SRC = '.union-stack/project/IDENTITY_example.md';
const IDENTITY_DST = '.union-stack/project/IDENTITY.md';

const isGuide = p => /_GUIDE\.md$/.test(p);
const isKeep = p => isGuide(p) || KEEP_EXACT.has(p);

/**
 * 순수 계획 함수: 현재 파일 목록 → 수행할 작업 목록. (FS 비의존 → 테스트 용이)
 * files: repo-상대 '/' 경로 배열. opts: {name, slug, drop, upstreamOnly}
 * upstreamOnly: 상류 ship-manifest 의 상류 전용 목록 — drop 이면 함께 지운다([WO-29a-9]). 없으면 템플릿 비트만(현행).
 */
function planOps({ name, slug, drop = false, files = [], upstreamOnly = [], cardImpl = {} }) {
  const ops = [];
  if (files.includes(IDENTITY_SRC)) ops.push({ op: 'identity', from: IDENTITY_SRC, to: IDENTITY_DST, name });
  for (const f of files) {
    if (f === IDENTITY_SRC) continue;        // identity로 처리됨
    if (RESET_TARGETS.has(f)) { ops.push({ op: 'reset', path: f }); continue; }
    if (!f.startsWith('.union-stack/')) continue;
    if (isKeep(f)) continue;                  // 가이드·ARCH-00 보존
    // 원장 회전본([PRO-18])은 **상류의 결정 기록**이다. 머리는 RESET_TARGETS 가 비우는데
    // 회전본을 두면 어답터가 상류 ADR 수십 건을 그대로 물려받는다(실측: init 후 24건 잔존).
    if (isLedgerStore(f) && f !== LEDGER_HEAD) { ops.push({ op: 'delete', path: f }); continue; }
    if (/example/i.test(path.posix.basename(f)) || EXPLICIT_DUMMIES.has(f)) {
      ops.push({ op: 'delete', path: f });    // 더미 제거
    }
  }
  ops.push({ op: 'pkg', name: slug, version: '0.1.0' });
  if (drop) for (const f of TEMPLATE_BITS) if (files.includes(f)) ops.push({ op: 'delete', path: f, templateBit: true });
  // 상류 전용 스크립트(eval·adopter-arm·adopter-census 등) — 남기면 어답터에 "지워도 된다" INFO 가 영구히 남고 census 약화 판별의 오탐 재료가 된다(B 미결 · [WO-29a-7]).
  if (drop) {
    const done = new Set(ops.filter(o => o.op === 'delete').map(o => o.path));
    for (const f of upstreamOnly) if (files.includes(f) && !done.has(f)) { ops.push({ op: 'delete', path: f, upstreamOnly: true }); done.add(f); }
    // 그 도구의 카드(impl 이 상류 전용)도 — 남기면 tool-linter 가 "impl 실존 안 함" 으로 red 다(드롭 사본 실측).
    const uo = new Set(upstreamOnly);
    for (const [card, impl] of Object.entries(cardImpl)) if (uo.has(impl) && files.includes(card) && !done.has(card)) ops.push({ op: 'delete', path: card, upstreamOnly: true });
  }
  return ops;
}

// --- 적용 측(얇음) ---
function identityScaffold(name) {
  return `<!-- [Schema/Frame] Project identity. Fill the TODOs; this is read once at session start. -->
---
title: ${name}
status: Active
version: 0.1
---

# ${name}

## Identity (what this project is)
TODO: the problem this project solves, why it exists, the core concept.

## Boundary (in / out of scope)
TODO: what is in scope — and explicitly what is NOT.

## Domain vocabulary
TODO: project-specific terms the agent must understand precisely.
`;
}
const RESET_TEMPLATES = {
  '.union-stack/feature/live.md': '<!-- [Wiki] 라이브 제품 표면. 에이전트가 행 단위로 갱신. -->\n# Live Features\n| Feature | ZFS Ref | Status |\n|---|---|---|\n',
  '.union-stack/sprint/next.md': '<!-- [Wiki] 활성 작업대. -->\n# Sprint — Active\n| WO | ZFS Ref | State |\n|---|---|---|\n',
  '.union-stack/sprint/HANDOFF.md': '<!-- [Wiki] 세션 이어달리기. 세션을 마치는 에이전트가 덮어쓴다. -->\n# Handoff → next session\n\n## 1. Summary\n## 2. Changed locations (ID list)\n## 3. Next task (single entry point)\n## 4. Open / cautions\n## 5. Verification status\n',
  '.union-stack/verification/derived/gap.md': '<!-- [Wiki] 규범↔현실 괴리. 에이전트가 검증 후 기록. -->\n# Drift / Gap Log\n',
  '.union-stack/verification/derived/state.md': '<!-- [Wiki] 관찰된 현재 코드 구조. -->\n# Observed Structure\n',
  '.union-stack/verification/raw/evidence.md': '<!-- [Raw] 시스템만 Append. 에이전트 read-only. -->\n# Evidence Log (CI/CD 자동 기록)\n',
  '.union-stack/verification/raw/receipts.md': '<!-- [Raw] 실행 영수증 — 러너(ci.js)만 Append. 사람·에이전트 read-only. 한 줄 = 검사 1회. (예시) 줄은 꼴 안내. -->\n# Execution Receipts ([PRO-22] 영수증)\n- (예시) [2026-01-01][RCPT] sha=0000000 dirty=no scope=product name=unit exit=0 outcome=PASS targets=12 passed=12 failed=0 skipped=0 reason=- env=- dur=1ms gen=ci.js@0.0.0 cmd="pnpm test"\n',
  '.union-stack/project/HISTORY.md': '<!-- [Schema/Raw] 프로젝트 전략적 분기점. 사실+근거는 한 쌍(근거 없는 사실 등재 불가). -->\n# Project History — strategic turning points\n\n| Date | Turning point (fact) | Reason (why) | Implication |\n|---|---|---|---|\n',
  '.union-stack/archive_ledger.md': '<!-- [Raw] 결정화된 ADR 영구 원장. Append-only. 전술 결정만(전략은 HISTORY). -->\n# Architecture Decision Ledger\n',
  '.union-stack/project/GRANTS.md': '<!-- [Schema] 에이전트 Schema 편집 상시 스탬프 원장. 인간만 grant를 추가한다(자기부여 방지 — 에이전트는 인간 명시 승인이 있을 때만 이 파일 편집). 커밋에 `Approved-by: GRANT-id` 인용, `permission-guard --strict`가 스코프 커버 검증. 철회=행 삭제. [PRO-09] -->\n# Schema Edit Grants — 승인 스탬프 원장\n\n| Grant | Scope (glob) | Granted-by | Date | Rationale / 철회 |\n|---|---|---|---|---|\n',
};

/** 리셋 템플릿(순수) — 새 프로젝트에는 상류 PRO 가 없으므로 상류 ID 는 [up:ID]([WO-29a-3]). 없으면 null. */
function resetTemplate(p) { return RESET_TEMPLATES[p] == null ? null : prefixUpstreamRefs(RESET_TEMPLATES[p]); }

function apply(ops, root) {
  for (const o of ops) {
    if (o.op === 'identity') {
      fs.writeFileSync(path.join(root, o.to), identityScaffold(o.name));
      fs.rmSync(path.join(root, o.from), { force: true });
    } else if (o.op === 'delete') {
      fs.rmSync(path.join(root, o.path), { force: true });
    } else if (o.op === 'reset') {
      const t = resetTemplate(o.path);
      if (t) fs.writeFileSync(path.join(root, o.path), t);
    } else if (o.op === 'pkg') {
      const pp = path.join(root, 'package.json');
      const j = JSON.parse(fs.readFileSync(pp, 'utf8'));
      j.name = o.name; j.version = o.version;
      fs.writeFileSync(pp, JSON.stringify(j, null, 2) + '\n');
    }
  }
}

function listFiles(dir, root, out) {
  walkFiles(root, dir, rel => out.push(rel), { skipDir: n => n === '.git' || n === 'node_modules' });
}

/**
 * init --adopt <repo> [--out file]: union-stack 이 없는 기존 프로젝트의 이식 **매핑안**(dry-run 전용 — [PRO-29] ③(a), [WO-29a-11]).
 * 경로·헤딩만 읽어 자리·제안 ZFS ID·확신도와 adapter.json 초안을 낸다. 대상 레포에 쓰지 않는다(적용은 ③(b)).
 */
function adoptMain(argv, get) {
  const target = get('--adopt');
  if (!target || target.startsWith('--')) { console.error('사용법: node scripts/init.js --adopt <기존 프로젝트 경로> [--out plan.json] | --plan plan.json [--apply]'); return 2; }
  // --plan: 사람이 고친 매핑안의 적용([PRO-29] ③(b), [WO-29a-12]) — 기본 dry-run, --apply 로만 쓴다. 대상 레포의 사람이 그 레포 안에서 실행한다.
  const planFile = get('--plan');
  if (planFile && !planFile.startsWith('--')) {
    let j;
    try { j = JSON.parse(fs.readFileSync(path.resolve(planFile), 'utf8')); } catch (e) { console.error(`init --adopt --plan: 계획 파일을 읽을 수 없다(${planFile}) — ${e.message}`); return 2; }
    if (!j || !Array.isArray(j.rows)) { console.error(`init --adopt --plan: rows 배열이 없다(${planFile}) — init --adopt <repo> --out 의 JSON 이어야 한다`); return 2; }
    return require('./adopt-apply').apply(path.resolve(target), j, { upstreamRoot: path.resolve(__dirname, '..'), write: argv.includes('--apply') }).code;
  }
  let p;
  try { p = require('./adopt-map').plan(path.resolve(target)); } catch (e) { console.error(`init --adopt: ${e.message}`); return 2; }
  console.log(`# union-stack 이식 매핑안(dry-run) — 문서 ${p.rows.length} · high ${p.summary.high} · medium ${p.summary.medium} · low ${p.summary.low}${p.summary.invalidNames ? ` · ⚠ ZFS 무효 이름 ${p.summary.invalidNames}` : ''}\n`);
  for (const r of p.rows) console.log(`  ${r.confidence.padEnd(6)} ${r.from} → ${r.to || '(매핑 안 함)'}  — ${r.why}`);
  const a = p.adapter;
  console.log(`\n  adapter.json 초안: sections ${Object.keys(a.sections).length}절 · statusMap ${Object.keys(a.statusMap).length}값${a.unmappedStatus.length ? ` (모르는 status: ${a.unmappedStatus.join(', ')})` : ''} · localOwned ${a.localOwned.length}`);
  const out = get('--out');
  if (out && !out.startsWith('--')) { fs.writeFileSync(path.resolve(out), JSON.stringify(p, null, 2) + '\n'); console.log(`  → ${out}`); }
  console.log(`\n안을 고친 뒤(medium 행은 "approved": true · to/proposedId 수정 가능) 대상 레포의 사람이 그 레포에서 적용: node scripts/init.js --adopt <repo> --plan ${out && !out.startsWith('--') ? out : 'plan.json'} [--apply]. low 행은 사람이 자리를 정한다. 확신도 임계는 잠정값([PRO-29] §7-4).`);
  return 0;
}

function main(argv = process.argv.slice(2)) {
  const get = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  if (argv.includes('--adopt')) return adoptMain(argv, get);
  const name = get('--name');
  const slug = get('--slug') || (name ? name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') : null);
  const drop = argv.includes('--drop-template-bits');
  const doApply = argv.includes('--apply');
  if (!name || !slug) {
    console.error('사용법: node scripts/init.js --name "Project Name" [--slug slug] [--apply] [--drop-template-bits] [--force]');
    return 2;
  }
  const root = path.resolve(__dirname, '..');
  // 이미 init된 레포에서 재실행하면 축적된 HISTORY·원장이 더미로 리셋된다(append-only 파괴).
  // Fail-close: --force 없이는 dry-run/--apply 모두 진행하지 않는다.
  if (!fs.existsSync(path.join(root, IDENTITY_SRC)) && !argv.includes('--force')) {
    console.log('이미 init된 것으로 보임(IDENTITY_example.md 없음). 변경 없음. 재실행이 정말 필요하면 --force (매니페스트가 리셋됨).');
    return 0;
  }
  const files = []; listFiles('.union-stack', root, files);
  ['package.json', '.github/workflows/template-guard.yml',
   'scripts/leakage-guard.js', 'scripts/leakage-guard.test.js', 'scripts/zfs_index.test.js']
    .forEach(f => { if (fs.existsSync(path.join(root, f))) files.push(f); });
  let upstreamOnly = [];
  try { upstreamOnly = JSON.parse(fs.readFileSync(path.join(root, 'scripts/ship-manifest.json'), 'utf8')).upstreamOnly || []; } catch { /* 매니페스트 없음 — 템플릿 비트만 */ }
  for (const f of upstreamOnly) if (!files.includes(f) && fs.existsSync(path.join(root, f))) files.push(f);
  const cardImpl = {};
  for (const f of files) {
    if (!/^\.union-stack\/reference\/tools\/TOOL-.*\.md$/.test(f)) continue;
    try { const m = fs.readFileSync(path.join(root, f), 'utf8').match(/^impl:\s*(\S+)/m); if (m) cardImpl[f] = m[1]; } catch { /* 없음 */ }
  }
  const ops = planOps({ name, slug, drop, files, upstreamOnly, cardImpl });
  console.log(`# union-stack init — ${name} (${slug})${drop ? ' [drop-template-bits]' : ''}`);
  for (const o of ops) {
    const label = o.op === 'identity' ? `identity → ${o.to}` :
      o.op === 'pkg' ? `package.json name=${o.name} version=${o.version}` : `${o.op} ${o.path}`;
    console.log(`  ${doApply ? '✓' : '·'} ${label}`);
  }
  if (!doApply) { console.log('\n(dry-run) 적용하려면 --apply 추가. IDENTITY의 TODO를 채우고 첫 PLAN을 작성한 뒤 `npm run lint`.'); return 0; }
  apply(ops, root);
  // 드롭으로 카드가 줄면 AGENTS.md 의 tools-index 생성 블록이 낡는다 — 생성 블록이므로 여기서 다시 만든다(앵커 시딩 전에: 앵커가 새 본문을 기록하도록).
  if (drop && ops.some(o => o.upstreamOnly)) {
    try {
      const ti = require('./tools-index');
      const ap = path.join(root, 'AGENTS.md');
      const cur = fs.readFileSync(ap, 'utf8');
      const next = ti.inject(cur, ti.buildIndex(ti.gather(root)));
      if (next && next !== cur) { fs.writeFileSync(ap, next); console.log('  ✓ tools-index 재생성(드롭된 카드 반영): AGENTS.md'); }
    } catch (e) { console.error(`  ! tools-index 재생성 실패(치명적 아님 — node scripts/tools-index.js --write): ${e.message}`); }
  }
  // 정합 앵커 시딩 — 지금 이 순간 로컬 == 상류다. 이후 `template-update --apply` 는 이 앵커와
  // 대조해 **어답터가 실제로 고친 sync 파일만** 골라 보존한다(앵커가 없으면 전부 '판별 불가').
  // 지연 require: template-update 가 이 모듈의 TEMPLATE_BITS 를 쓰므로 최상단이면 순환이 된다.
  try {
    const tu = require('./template-update');
    let ver = null;
    try { ver = tu.parseChangelogVersion(fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8')); } catch { /* 없으면 미상 */ }
    tu.seedAnchor(root, `clone@${ver || 'unknown'}`);
    console.log(`  ✓ 정합 앵커 시딩: ${tu.ANCHOR_PATH}`);
  } catch (e) {
    console.error(`  ! 정합 앵커 시딩 실패(치명적 아님): ${e.message}`);
  }
  console.log('\n적용 완료. 다음: IDENTITY TODO 채우기 → 첫 PLAN 작성 → `npm run lint`.');
  return 0;
}

module.exports = { planOps, resetTemplate, main, RESET_TARGETS, TEMPLATE_BITS };

if (require.main === module) process.exit(main());
