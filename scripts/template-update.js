#!/usr/bin/env node
// scripts/template-update.js
// 템플릿 업데이트 도구 — 어답터 레포가 상류(union-stack 템플릿)와의 버전·파일 드리프트를
// 확인하고 방법론 파일을 갱신한다. SPIKE-fdt D5("템플릿↔인스턴스가 조용히 갈라졌다 —
// 판별할 장치가 없다")가 진단한 공백의 계측기다.
//
// 설계:
//   · 버전 원천 = CHANGELOG.md의 최신 `## [x.y.z]` 헤딩. package.json은 init.js가 어답터
//     버전(0.1.0)으로 덮어쓰므로 템플릿 버전 마커가 못 된다. CHANGELOG는 init이 보존한다.
//   · 드리프트 판별 = git blob sha 비교(로컬은 crypto로 계산, 상류는 GitHub trees API가 제공)
//     — 파일을 내려받지 않고 판별한다. CRLF 작업트리 대비 LF 정규화 후 해시.
//   · 갱신 대상 = 방법론 파일만. **.union-stack/ 콘텐츠(어답터의 실제 문서)는 절대 건드리지
//     않는다.** sync(자동 갱신 가능)와 review(규범 — 보고만, 인간이 반영 판단) 이원 분류.
//   · init --drop-template-bits로 의도적으로 제거된 파일은 재추가하지 않는다.
//   · **로컬 개조 보호(3-way)** — sync 카테고리는 "덮어써도 잃을 것이 없다"가 전제였는데 실전
//     어답터는 sync 파일에 정당한 개조를 갖는다(실측: `--apply` 가 2건을 조용히 덮어써 게이트
//     2개가 즉시 FAIL). 그래서 `로컬 vs 마지막 정합 앵커 vs 상류` 3-way 로 대조하고, 로컬이 앵커와
//     다르면 **개조로 보고 건너뛴다**(`--force` 로만 덮어씀).
//     앵커 = `.union-stack/template-sync.json` 의 상류 블롭 sha — `--apply` 가 쓴 파일에 대해
//     자동 기록하고, `init.js` 가 클론 시점(로컬 == 상류)에 시딩한다. 앵커가 없는 파일은
//     `unknown`(판별 불가)이고 이것도 건너뛴다 — 관측 불가를 통과로 위조하지 않는다([ADR-23] 문법).
//
// 종료 코드(gate-contract 의미론 재사용 — 이 도구는 게이트가 아니라 계측기):
//   0 = 최신 · 3(CLARIFY) = 업데이트 있음(비차단 정보) · 1 = 네트워크/실행 오류
//
// 실행:
//   node scripts/template-update.js              # 확인만(버전 + 드리프트 보고)
//   node scripts/template-update.js --apply      # sync 카테고리 갱신(review는 보고만)
//   node scripts/template-update.js --ref v6.1.0 # 특정 태그/브랜치 기준(기본 main)
//   node scripts/template-update.js --force     # 로컬 개조·판별 불가 파일도 덮어씀(--apply 와 함께)
//   node scripts/template-update.js --json
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { walkFiles } = require('./fs_walk');
const { OUTCOME } = require('./gate-contract');
const { TEMPLATE_BITS } = require('./init');

// 마지막 정합 앵커 매니페스트(어답터 소유 — classifyPath 가 불가침으로 분류한다).
const ANCHOR_PATH = '.union-stack/template-sync.json';

const UPSTREAM = 'ingookang1988/union-stack';
const API = `https://api.github.com/repos/${UPSTREAM}`;
const RAW = `https://raw.githubusercontent.com/${UPSTREAM}`;

// 카테고리 규칙 — 첫 매칭이 이긴다.
//   sync   : 실행 자산·이력 문서. 어답터 커스터마이즈 전제가 없어 자동 갱신 안전.
//   review : 규범·가이드. 어답터가 고쳤을 수 있고 상류 변경 = 규칙 변경이므로 인간이 diff를 보고 반영.
const SYNC_RULES = [
  /^scripts\/[^/]+\.js$/,
  /^\.github\/workflows\/harness\.yml$/,
  /^\.github\/workflows\/template-guard\.yml$/,
  /^CHANGELOG\.md$/, /^MIGRATION\.md$/, /^DESIGN_RATIONALE\.md$/,
];
const REVIEW_RULES = [
  /^AGENTS\.md$/, /^README(\.ko)?\.md$/, /^package\.json$/,
  /^\.union-stack\/.*_GUIDE\.md$/,
  /^eval\/(PROTOCOL|CALIBRATION)\.md$/,
];

/** 경로 → 'sync' | 'review' | null(템플릿 소유 아님 — 절대 안 건드림). 순수. */
function classifyPath(p) {
  if (SYNC_RULES.some(r => r.test(p))) return 'sync';
  if (REVIEW_RULES.some(r => r.test(p))) return 'review';
  return null;
}

/** CHANGELOG 본문 → 최신 릴리스 버전("## [x.y.z]" 첫 매칭, Unreleased 제외). 순수. */
function parseChangelogVersion(txt) {
  const m = String(txt || '').match(/^##\s*\[(\d+\.\d+\.\d+)\]/m);
  return m ? m[1] : null;
}

/** 버전 비교(숫자 세그먼트). a<b → -1, a==b → 0, a>b → 1. 순수. */
function cmpVersions(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** git blob sha1(원본 그대로). 순수. */
function gitBlobSha(content) {
  const buf = Buffer.from(String(content), 'utf8');
  return crypto.createHash('sha1')
    .update(`blob ${buf.length}\0`).update(buf).digest('hex');
}

/**
 * 로컬 해시 후보(원본 + LF 정규화, 중복 제거). 순수.
 * 개행만으로는 드리프트로 치지 않는다 — 상류 블롭이 CRLF로 커밋된 이력(예: harness.yml)과
 * autocrlf 작업트리가 만드는 가짜 변경을 양방향 모두 흡수한다(실측: 본 레포에서 발생).
 */
function gitBlobShas(content) {
  const lf = String(content).replace(/\r\n/g, '\n');
  return [...new Set([
    gitBlobSha(content),                      // 원본 그대로
    gitBlobSha(lf),                           // 상류 블롭이 LF일 때
    gitBlobSha(lf.replace(/\n/g, '\r\n')),    // 상류 블롭이 CRLF일 때(예: harness.yml 이력)
  ])];
}

/**
 * 드리프트 계획(순수): {local: {path→sha|sha[]}, upstream: {path→sha}} → 변경/신규/상류삭제 목록.
 * 로컬 값이 배열이면 후보 중 하나만 일치해도 동일로 본다(개행 이형 흡수 — gitBlobShas).
 * 신규 중 TEMPLATE_BITS(init --drop-template-bits 제거 대상)는 dropped로 분리 — 재추가 안 함.
 */
function buildPlan(local, upstream) {
  const plan = { changedSync: [], changedReview: [], newSync: [], newReview: [], removedUpstream: [], dropped: [] };
  for (const [p, sha] of Object.entries(upstream)) {
    const cat = classifyPath(p);
    if (!cat) continue;
    if (!(p in local)) {
      if (TEMPLATE_BITS.includes(p)) { plan.dropped.push(p); continue; }
      plan[cat === 'sync' ? 'newSync' : 'newReview'].push(p);
    } else if (!(Array.isArray(local[p]) ? local[p] : [local[p]]).includes(sha)) {
      plan[cat === 'sync' ? 'changedSync' : 'changedReview'].push(p);
    }
  }
  for (const p of Object.keys(local)) {
    if (classifyPath(p) && !(p in upstream)) plan.removedUpstream.push(p);
  }
  return plan;
}

/**
 * 3-way 대조(순수): 갱신 후보 경로 → {clean, modified, unknown}.
 *   clean    로컬 == 마지막 정합 앵커  → 어답터가 손대지 않았다. 덮어써도 잃을 것이 없다.
 *   modified 로컬 != 앵커             → **정당한 로컬 개조**. 덮어쓰면 소실 → 건너뛴다.
 *   unknown  앵커 없음                → 판별 불가. 통과로 위조하지 않고 역시 건너뛴다.
 * 양쪽 값 모두 개행 이형 후보 배열(gitBlobShas)일 수 있다 — 교집합이 있으면 동일로 본다.
 * (앵커를 `--apply` 가 쓰면 상류 sha 하나, `init` 이 시딩하면 로컬 후보 배열이다.)
 */
function classifySyncTargets(paths, local, anchor = {}) {
  const arr = v => (Array.isArray(v) ? v : [v]);
  const out = { clean: [], modified: [], unknown: [] };
  for (const p of paths) {
    if (!(p in local)) { out.clean.push(p); continue; }   // 상류 신규 — 로컬에 없으니 잃을 것이 없다
    if (!(p in anchor)) { out.unknown.push(p); continue; }
    const a = arr(anchor[p]);
    (arr(local[p]).some(x => a.includes(x)) ? out.clean : out.modified).push(p);
  }
  return out;
}

/** 상류 CHANGELOG에서 (from, to] 구간의 ⚠(마이그레이션 필요) 줄을 뽑는다. 순수. */
function migrationActions(changelogTxt, fromVer, toVer) {
  const out = [];
  let inRange = false;
  for (const line of String(changelogTxt || '').split(/\r?\n/)) {
    const h = line.match(/^##\s*\[([^\]]+)\]/);
    if (h) {
      const v = h[1];
      if (v === 'Unreleased') { inRange = false; continue; }
      inRange = (!toVer || cmpVersions(v, toVer) <= 0) && (!fromVer || cmpVersions(v, fromVer) > 0);
      continue;
    }
    if (inRange && line.includes('⚠')) out.push(line.trim());
  }
  return out;
}

// --- 로컬/네트워크 어댑터 (얇음) ---
function localTemplateFiles(root) {
  const out = {};
  const record = rel => {
    const cat = classifyPath(rel);
    if (!cat) return;
    try { out[rel] = gitBlobShas(fs.readFileSync(path.join(root, rel), 'utf8')); } catch { /* 바이너리/삭제 경합 무시 */ }
  };
  ['scripts', '.github/workflows', 'eval', '.union-stack'].forEach(d => walkFiles(root, d, record));
  ['AGENTS.md', 'README.md', 'README.ko.md', 'package.json', 'CHANGELOG.md', 'MIGRATION.md', 'DESIGN_RATIONALE.md']
    .forEach(f => { if (fs.existsSync(path.join(root, f))) record(f); });
  return out;
}

async function fetchText(url) {
  const r = await fetch(url, { headers: { 'user-agent': 'union-stack-template-update' } });
  if (!r.ok) throw new Error(`HTTP ${r.status} — ${url}`);
  return r.text();
}

async function fetchUpstream(ref) {
  const tree = JSON.parse(await fetchText(`${API}/git/trees/${encodeURIComponent(ref)}?recursive=1`));
  if (tree.truncated) console.error('경고: 상류 트리가 잘렸음(truncated) — 드리프트 판별이 불완전할 수 있음.');
  const shaByPath = {};
  for (const t of tree.tree || []) if (t.type === 'blob') shaByPath[t.path] = t.sha;
  return shaByPath;
}

/** 앵커 매니페스트 읽기(없으면 빈 앵커 — 부재는 "판별 불가"이지 "정합"이 아니다). */
function readAnchor(root) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(root, ANCHOR_PATH), 'utf8'));
    return (j && typeof j.blobs === 'object' && j.blobs) || {};
  } catch { return {}; }
}

/** 앵커 갱신 — 쓴 파일의 **상류** sha 를 기록한다(로컬 sha 가 아니다: 앵커는 "상류의 어느 지점"이다). */
function writeAnchor(root, ref, upstreamMap, writtenPaths) {
  const blobs = readAnchor(root);
  for (const p of writtenPaths) if (upstreamMap[p]) blobs[p] = upstreamMap[p];
  writeAnchorRaw(root, ref, blobs);
}

/**
 * 클론 직후 앵커 시딩 — 그 시점의 로컬 == 상류이므로 **로컬 해시가 곧 정합 앵커**다.
 * `init.js` 가 호출한다(네트워크 없이 성립하는 유일한 앵커 지점). 이게 없으면 첫 `--apply` 에서
 * 전 파일이 `unknown` 이 되어 아무것도 갱신되지 않는다 — 신규 어답터에게 그건 부당한 마찰이다.
 */
function seedAnchor(root, ref = 'clone') {
  writeAnchorRaw(root, ref, localTemplateFiles(root));
}

function writeAnchorRaw(root, ref, blobs) {
  const abs = path.join(root, ANCHOR_PATH);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify({ upstream: UPSTREAM, ref, blobs }, null, 2) + '\n');
}

async function applyPlan(root, ref, targets, upstreamMap) {
  for (const p of targets) {
    const txt = await fetchText(`${RAW}/${encodeURIComponent(ref)}/${p}`);
    const abs = path.join(root, p);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, txt);
    console.log(`  ✓ 갱신: ${p}`);
  }
  if (targets.length) writeAnchor(root, ref, upstreamMap, targets);
  return targets.length;
}

async function main(argv = process.argv.slice(2)) {
  const root = path.resolve(__dirname, '..');
  const apply = argv.includes('--apply');
  const force = argv.includes('--force');
  const json = argv.includes('--json');
  const ri = argv.indexOf('--ref');
  const ref = ri >= 0 ? argv[ri + 1] : 'main';

  const localChangelog = fs.existsSync(path.join(root, 'CHANGELOG.md'))
    ? fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8') : '';
  const localVer = parseChangelogVersion(localChangelog);

  let upstreamChangelog, upstreamMap;
  try {
    [upstreamChangelog, upstreamMap] = await Promise.all([
      fetchText(`${RAW}/${encodeURIComponent(ref)}/CHANGELOG.md`),
      fetchUpstream(ref),
    ]);
  } catch (e) {
    console.error(`상류 조회 실패: ${e.message}\n(네트워크/레이트리밋 확인. 오프라인이면 이 도구는 판단 불가 — 추측하지 않는다.)`);
    return OUTCOME.REJECT;
  }
  const upstreamVer = parseChangelogVersion(upstreamChangelog);
  const localFiles = localTemplateFiles(root);
  const plan = buildPlan(localFiles, upstreamMap);
  const guard = classifySyncTargets([...plan.changedSync, ...plan.newSync], localFiles, readAnchor(root));
  const drift = plan.changedSync.length + plan.changedReview.length + plan.newSync.length + plan.newReview.length;
  const migrations = migrationActions(upstreamChangelog, localVer, upstreamVer);

  if (json) {
    console.log(JSON.stringify({ ref, localVer, upstreamVer, plan, guard, migrations, applied: false }, null, 2));
    return drift ? OUTCOME.CLARIFY : OUTCOME.PASS;
  }

  console.log(`# union-stack 템플릿 업데이트 확인 (상류: ${UPSTREAM}@${ref})\n`);
  console.log(`  로컬 버전   : ${localVer || '판별 불가(CHANGELOG.md 없음/헤딩 없음)'}`);
  console.log(`  상류 버전   : ${upstreamVer || '판별 불가'}`);
  if (localVer && upstreamVer) {
    const c = cmpVersions(localVer, upstreamVer);
    console.log(`  버전 판정   : ${c === 0 ? '동일' : c < 0 ? '업데이트 있음 ↑' : '로컬이 앞섬(포크 개발 중?)'}`);
  }
  const list = (label, arr) => { if (arr.length) { console.log(`\n  ${label}:`); arr.forEach(p => console.log(`    · ${p}`)); } };
  list('변경된 sync 파일(자동 갱신 가능)', plan.changedSync);
  list('상류 신규 sync 파일', plan.newSync);
  list('변경된 review 파일(규범 — diff를 보고 인간이 반영)', plan.changedReview);
  list('상류 신규 review 파일', plan.newReview);
  list('상류에서 사라진 파일(수동 정리 검토)', plan.removedUpstream);
  if (guard.modified.length) {
    console.log('\n  ⚠ 로컬 개조 감지 — 덮어쓰면 소실(--apply 가 건너뜀):');
    guard.modified.forEach(p => console.log(`    ! ${p}`));
    console.log('    → 개조를 유지하려면 설정으로 흡수하라(MIGRATION.md §"Adopter configuration").');
  }
  if (guard.unknown.length) {
    console.log('\n  ? 정합 앵커 없음 — 로컬 개조 여부 판별 불가(--apply 가 건너뜀):');
    guard.unknown.forEach(p => console.log(`    ? ${p}`));
    console.log(`    → 개조가 없다고 확신하면 \`--apply --force\`. 한 번 적용하면 ${ANCHOR_PATH} 가 앵커를 기록해`);
    console.log('      다음부터는 개조만 골라 건너뛴다.');
  }
  if (plan.dropped.length) console.log(`\n  (drop-template-bits 제거분 ${plan.dropped.length}건은 재추가하지 않음)`);
  if (migrations.length) {
    console.log('\n  ⚠ 마이그레이션 필요 항목(상류 CHANGELOG):');
    migrations.forEach(l => console.log(`    ${l}`));
    console.log('    → 적용 절차: MIGRATION.md §"Upgrading from an older union-stack"');
  }

  if (!drift) { console.log('\n최신 상태 — 드리프트 없음.'); return OUTCOME.PASS; }
  if (apply) {
    const targets = force ? [...guard.clean, ...guard.modified, ...guard.unknown] : guard.clean;
    const skipped = force ? [] : [...guard.modified, ...guard.unknown];
    console.log(`\n적용(sync만 — review·.union-stack 콘텐츠는 건드리지 않음)${force ? ' [--force: 개조 보호 해제]' : ''}:`);
    if (!targets.length) console.log('  (갱신 대상 없음)');
    const n = await applyPlan(root, ref, targets, upstreamMap);
    if (skipped.length) console.log(`\n보존(덮어쓰지 않음) ${skipped.length}건: ${skipped.join(' ')}`);
    console.log(`\n${n}개 파일 갱신. 검증: node scripts/health.js && 테스트 실행. review ${plan.changedReview.length + plan.newReview.length}건은 수동 반영.`);
    return OUTCOME.CLARIFY;
  }
  console.log('\n갱신하려면: node scripts/template-update.js --apply  (sync만 자동, review는 보고만)');
  return OUTCOME.CLARIFY;
}

module.exports = { classifyPath, parseChangelogVersion, cmpVersions, gitBlobSha, gitBlobShas, buildPlan, classifySyncTargets, readAnchor, writeAnchor, seedAnchor, localTemplateFiles, migrationActions, UPSTREAM, ANCHOR_PATH };

if (require.main === module) main().then(c => process.exit(c), e => { console.error(e); process.exit(OUTCOME.REJECT); });
