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
//   node scripts/template-update.js --proposal   # 사람용 제안문(stdout, 파일 쓰기 0 — [PRO-29] ①(b))
//   node scripts/template-update.js --ack-review   # review 변화를 "봤다"로 기록(반영 없이 알림만 끈다 — 상류에서 다시 바뀌면 다시 알림)
//   node scripts/template-update.js --refresh-cache  # 확인 캐시만 갱신(health 가 24h 만료 시 부른다) — 요약 JSON 1줄
//   node scripts/template-update.js --force     # 로컬 개조·판별 불가 파일도 덮어씀(--apply 와 함께)
//   node scripts/template-update.js --json
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { walkFiles } = require('./fs_walk');
const { OUTCOME } = require('./gate-contract');
const { TEMPLATE_BITS } = require('./init');
const { load: loadAdapter, isTemplateRepo } = require('./adapter');
const { readManifest, parseManifest, requireSymbols, exportKeys, MANIFEST: SHIP_MANIFEST } = require('./ship-manifest');

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
  // 배송 매니페스트([TOOL-34]) — 자신이 sync 여야 어답터가 다음 화이트리스트를 받는다.
  /^scripts\/ship-manifest\.json$/,
  /^\.github\/workflows\/harness\.yml$/,
  /^\.github\/workflows\/template-guard\.yml$/,
  // 하네스 컨테이너([TOOL-27]). **이름이 어답터의 앱 파일과 겹치지 않는 것**이 sync 안전의 전제다 —
  // 루트 `Dockerfile`·`docker-compose.yml` 이었다면 이 규칙이 남의 배포를 덮어썼다([ADR-46]).
  /^ci\/Dockerfile$/, /^docker-compose\.harness\.yml$/,
  /^CHANGELOG\.md$/, /^MIGRATION\.md$/, /^DESIGN_RATIONALE\.md$/,
];
const REVIEW_RULES = [
  /^AGENTS\.md$/, /^README(\.ko)?\.md$/, /^package\.json$/,
  /^\.union-stack\/.*_GUIDE\.md$/,
  /^eval\/(PROTOCOL|CALIBRATION)\.md$/,
];

/** 글롭 → 정규식(순수): `**` 는 경로 구간 횡단, `*` 는 구간 안, `?` 는 한 글자. '/' 구분자. */
function matchGlob(glob, p) {
  const g = String(glob || '').replace(/\\/g, '/').replace(/^\.\//, '');
  const re = '^' + g.split('**').map(part => part.split('*').map(seg => seg.replace(/[.+^$(){}|[\]\\]/g, '\\$&').replace(/\?/g, '[^/]')).join('[^/]*')).join('.*') + '$';
  return new RegExp(re).test(p);
}

/**
 * 경로 → 'sync' | 'review' | null(템플릿 소유 아님 — 절대 안 건드림). 순수.
 * ctx([PRO-24] ①(b)(c), 없으면 규칙 폴백 = 구버전 동작):
 *   manifest   — 배송 화이트리스트(scripts/ship-manifest.json). 매니페스트가 있으면 **스크립트는 열거된 것만 sync**, 상류 전용은 null, 나머지는 기본 로컬(null).
 *   localOwned — 어답터 고유 파일 글롭 → null. 단 매니페스트가 열거한 파일과 겹치면 **sync 우선**(상류 파일을 글롭으로 끊어 버리는 사고 방지 — 경고는 호출부).
 */
function classifyPath(p, ctx = null) {
  // upstreamIgnored(어답터 실측: Actions 폐기 레포의 harness.yml) — 거부는 배송보다 우선. 배송·보고 어디에도 안 뜬다.
  if (ctx && Array.isArray(ctx.upstreamIgnored) && ctx.upstreamIgnored.some(g => matchGlob(g, p))) return null;
  const m = ctx && ctx.manifest;
  const owned = !!(ctx && Array.isArray(ctx.localOwned) && ctx.localOwned.some(g => matchGlob(g, p)));
  if (m && /^scripts\/[^/]+\.(js|json)$/.test(p)) {
    if ((m.upstreamOnly || []).includes(p)) return null;
    // shipped 가 null 이면 "화이트리스트 없음 + 상류 전용만 안다"(상류가 구버전이라 매니페스트가 없을 때 로컬 매니페스트로 보강) → 규칙 폴백.
    if (Array.isArray(m.shipped)) return m.shipped.includes(p) ? 'sync' : null; // 열거된 파일 — 글롭이 겹쳐도 sync 우선
  }
  if (owned) return null;
  if (SYNC_RULES.some(r => r.test(p))) return 'sync';
  if (REVIEW_RULES.some(r => r.test(p))) return 'review';
  return null;
}

/** localOwned 글롭이 매니페스트의 배송 파일을 덮는 충돌(순수) — sync 가 이기지만 어답터에게 알린다. */
function ownedConflicts(manifest, localOwned = []) {
  if (!manifest) return [];
  return manifest.shipped.filter(p => localOwned.some(g => matchGlob(g, p)));
}

/**
 * --force 의 적용 대상(순수). force === true 면 전부(개조·판별불가 포함), 경로 배열이면 **그 파일만** 보호를 풀고 나머지 개조는 보존한다.
 * 카나리아 실측: 어답터 B 의 localForked 7건 중 1건(dashboard)만 상류를 받고 싶었는데 전부-아니면-전무였다.
 */
function forceTargets(guard, force = false) {
  const protectedAll = [...guard.modified, ...guard.unknown];
  if (force === true) return { targets: [...guard.clean, ...protectedAll], skipped: [], unmatched: [] };
  if (Array.isArray(force)) {
    const set = new Set(force);
    return { targets: [...guard.clean, ...protectedAll.filter(p => set.has(p))], skipped: protectedAll.filter(p => !set.has(p)), unmatched: force.filter(p => !protectedAll.includes(p)) };
  }
  return { targets: guard.clean, skipped: protectedAll, unmatched: [] };
}

/** 로컬 ctx: 로컬 매니페스트 + adapter.json localOwned. 부재는 규칙 폴백. */
function localCtx(root) {
  const cfg = loadAdapter(root);
  const manifest = readManifest(root);
  // 상류 전용 스크립트의 **남은 로컬 사본**은 분류 맵(null 이라 빠짐)이 아니라 파일시스템에서 센다.
  const presentUpstreamOnly = manifest ? manifest.upstreamOnly.filter(p => fs.existsSync(path.join(root, p))) : [];
  return { manifest, localOwned: cfg.localOwned || [], upstreamIgnored: cfg.upstreamIgnored || [], presentUpstreamOnly };
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
function buildPlan(local, upstream, ctx = {}) {
  const plan = { changedSync: [], changedReview: [], newSync: [], newReview: [], removedUpstream: [], dropped: [], upstreamOnlyLocal: [] };
  const upCtx = ctx.upstream || null, loCtx = ctx.local || null;
  // 상류 전용 스크립트의 로컬 사본([PRO-24] ①(c)): 배송·갱신에서 빠지며, 남은 사본은 INFO 로만 알린다(어답터가 지운다).
  const uo = new Set([...((upCtx && upCtx.manifest && upCtx.manifest.upstreamOnly) || []), ...((loCtx && loCtx.manifest && loCtx.manifest.upstreamOnly) || [])]);
  for (const [p, sha] of Object.entries(upstream)) {
    const cat = classifyPath(p, upCtx);
    if (!cat) continue;
    if (!(p in local)) {
      if (TEMPLATE_BITS.includes(p)) { plan.dropped.push(p); continue; }
      plan[cat === 'sync' ? 'newSync' : 'newReview'].push(p);
    } else if (!(Array.isArray(local[p]) ? local[p] : [local[p]]).includes(sha)) {
      plan[cat === 'sync' ? 'changedSync' : 'changedReview'].push(p);
    }
  }
  // 어답터가 만든 하위 디렉터리(상류에 그 디렉터리의 파일이 하나도 없음)의 _GUIDE 류는 템플릿 소유가 아니다 — "사라진 파일" 오보(어답터 A 실측: plan/research/_GUIDE.md).
  const upDirs = new Set(Object.keys(upstream).map(p => p.slice(0, p.lastIndexOf('/'))));
  for (const p of Object.keys(local)) {
    if (uo.has(p)) { plan.upstreamOnlyLocal.push(p); continue; }
    if (classifyPath(p, loCtx) && !(p in upstream) && upDirs.has(p.slice(0, p.lastIndexOf('/')))) plan.removedUpstream.push(p);
  }
  for (const p of (loCtx && loCtx.presentUpstreamOnly) || []) if (!plan.upstreamOnlyLocal.includes(p)) plan.upstreamOnlyLocal.push(p);
  plan.upstreamOnlyLocal.sort();
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
/**
 * 부분 갱신의 의존 불일치(어답터 A 실측: dashboard.js 는 갱신됐는데 그것이 require 하는 handoff-linter.js 는 앵커 없음으로 보존돼
 * `handoffPart is not a function`). 갱신 대상 target 이 require 하는 파일이 보류 목록 pending — 변경됐지만 보존돼 갱신 보류 — 에 있으면 경고 [{file, dep}].
 * 로컬 본문의 require 를 본다(dry-run 에 상류 본문은 없다) — 신규 파일(로컬 부재)은 건너뛴다. 순수: readFn(path) → 텍스트 | null.
 */
/** 로컬 sha(후보 배열 가능)가 상류와 같은 경로(순수) — 이미 동기화된 파일. 의존 불일치 검사의 상시 대상(A 실측: 지난 회차 갱신분은 target 이 아니라 영구 무음이었다). */
function syncedPaths(local, upstream) {
  return Object.keys(local).filter(p => p in upstream && (Array.isArray(local[p]) ? local[p] : [local[p]]).includes(upstream[p]));
}

function staleDeps(readFn, targets, pending) {
  const pend = new Set(pending.filter(p => !targets.includes(p)));
  const out = [];
  const keyCache = new Map();
  const keysOf = dep => { if (!keyCache.has(dep)) { const t = readFn(dep); keyCache.set(dep, t == null ? null : exportKeys(t)); } return keyCache.get(dep); };
  for (const t of targets) {
    const txt = readFn(t);
    if (txt == null) continue;
    for (const { dep, symbols } of requireSymbols(txt)) {
      if (!pend.has(dep)) continue;
      // 심볼 수준(어답터 A 3차 실측: 경로만 보면 41쌍, 실제 불일치 1쌍) — 둘 다 알 때만 판정, 아니면 null(판별 불가)
      const keys = keysOf(dep);
      const missing = symbols && keys ? symbols.filter(s => !keys.has(s)) : null;
      out.push({ file: t, dep, missing });
    }
  }
  return out;
}

/**
 * --apply 보류(순수, 어답터 C 제안): 심볼 불일치(missing.length>0)가 있는 갱신 대상은 받으면 로드 크래시다 — 보존 파일을 --force 로 함께 갱신할 때만 간다.
 * 반환 {targets, held:[stale 항목]}. force === true 면 보류 없음.
 */
function holdTargets(targets, stale, force = false) {
  if (force === true) return { targets: [...targets], held: [] };
  const forced = new Set(Array.isArray(force) ? force : []);
  const held = (stale || []).filter(s => targets.includes(s.file) && s.missing && s.missing.length && !forced.has(s.dep));
  const heldFiles = new Set(held.map(h => h.file));
  return { targets: targets.filter(t => !heldFiles.has(t)), held };
}

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
function localTemplateFiles(root, ctx = localCtx(root)) {
  const out = {};
  const record = rel => {
    const cat = classifyPath(rel, ctx);
    if (!cat) return;
    try { out[rel] = gitBlobShas(fs.readFileSync(path.join(root, rel), 'utf8')); } catch { /* 바이너리/삭제 경합 무시 */ }
  };
  // ci/ 와 루트 컨테이너 파일도 걷는다 — 빠뜨리면 로컬에 있어도 매 dry-run "신규 sync" 로 재등장하고 --apply 마다 다시 쓴다(어답터 A 실측).
  ['scripts', '.github/workflows', 'eval', '.union-stack', 'ci'].forEach(d => walkFiles(root, d, record));
  ['AGENTS.md', 'README.md', 'README.ko.md', 'package.json', 'CHANGELOG.md', 'MIGRATION.md', 'DESIGN_RATIONALE.md', 'docker-compose.harness.yml']
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

function readSyncFile(root) {
  try { return JSON.parse(fs.readFileSync(path.join(root, ANCHOR_PATH), 'utf8')) || {}; } catch { return {}; }
}

function writeSyncFile(root, obj) {
  const abs = path.join(root, ANCHOR_PATH);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(obj, null, 2) + '\n');
}

function writeAnchorRaw(root, ref, blobs) {
  // 확인 캐시(lastCheck)·본 review(reviewSeen)는 앵커와 같은 파일의 별도 키다 — 앵커를 다시 써도 지우지 않는다.
  const { upstream: _u, ref: _r, blobs: _b, ...rest } = readSyncFile(root);
  writeSyncFile(root, { upstream: UPSTREAM, ref, blobs, ...rest });
}

// --- 확인 캐시 · 제안문([PRO-29] ①(a)(b), [WO-29a-1]) ---
// health 는 동기·네트워크 없음이라 이 캐시를 읽는다. 24h 안이면 재조회하지 않는다(실패 시각도 센다 — 오프라인 폭주 방지).
const CHECK_TTL_MS = 24 * 3600 * 1000;
const PROPOSAL_ITEMS_CAP = 15; // 버전별 항목 상한 — 제안문은 결정 재료지 CHANGELOG 사본이 아니다

/** 순수: 확인 결과 → 캐시 요약. updates = 버전이 뒤처졌거나 sync/review 드리프트가 있다. */
/**
 * updates = **실행 가능 항목이 있을 때만**([WO-29a-4] — 5회차 실측: 3곳 모두 실행할 것 없이 상시 "업데이트 있음"):
 *   자동 적용 대상(sync − 분기 − 앵커 없음 − HOLD) > 0 · 아직 안 본 review 변화 > 0 · ⚠ 마이그레이션 > 0 · 릴리스 버전 뒤처짐.
 * 보존 포크·앵커 없음·HOLD·이미 본 review 는 숫자로만 남는다(INFO). "본" = reviewSeen(path → 상류 sha, --apply·--ack-review 가 기록).
 */
function checkSummary({ ref, localVer, upstreamVer, plan, guard, held = [], migrations = [], upstreamMap = {}, reviewSeen = {} }, now = Date.now()) {
  const syncPaths = [...plan.changedSync, ...plan.newSync];
  const reviewPaths = [...plan.changedReview, ...plan.newReview];
  const skip = new Set([...guard.modified, ...guard.unknown, ...held.map(h => h.file)]);
  const auto = syncPaths.filter(p => !skip.has(p)).length;
  const reviewNew = reviewPaths.filter(p => !upstreamMap[p] || reviewSeen[p] !== upstreamMap[p]).length;
  const behind = !!(localVer && upstreamVer && cmpVersions(localVer, upstreamVer) < 0);
  return {
    at: new Date(now).toISOString(), ref, localVer: localVer || null, upstreamVer: upstreamVer || null,
    updates: behind || auto > 0 || reviewNew > 0 || migrations.length > 0,
    auto, sync: syncPaths.length, review: reviewPaths.length, reviewNew, held: held.length,
    forked: guard.modified.length, unknown: guard.unknown.length, migrations: migrations.length,
  };
}

/** 순수: 이번 확인의 review 경로 → 상류 sha("본 것"으로 기록할 값). */
function reviewSeenFrom(plan, upstreamMap) {
  const out = {};
  for (const p of [...plan.changedReview, ...plan.newReview]) if (upstreamMap[p]) out[p] = upstreamMap[p];
  return out;
}

function readReviewSeen(root) { const r = readSyncFile(root).reviewSeen; return r && typeof r === 'object' ? r : {}; }

/** 본 review 기록 — 앵커·lastCheck 보존. 사람이 보고서를 본 시점(--apply·--ack-review)에만 부른다. */
function writeReviewSeen(root, seen) {
  const prev = readSyncFile(root);
  writeSyncFile(root, { ...prev, reviewSeen: { ...(prev.reviewSeen || {}), ...seen } });
}

function readLastCheck(root) { return readSyncFile(root).lastCheck || null; }

/** 성공 요약은 통째로 교체, 실패({error})는 직전 성공 요약 위에 error·errorAt 만 얹는다. 앵커 키는 보존. */
function writeLastCheck(root, summary) {
  const prev = readSyncFile(root);
  const lastCheck = summary.error
    ? { ...(prev.lastCheck || {}), error: summary.error, errorAt: summary.at }
    : summary;
  writeSyncFile(root, { ...prev, lastCheck });
}

/** 순수: 마지막 시도(성공 at · 실패 errorAt 중 늦은 쪽)가 TTL 안인가. */
function isFresh(last, now = Date.now(), ttl = CHECK_TTL_MS) {
  if (!last) return false;
  const t = Math.max(Date.parse(last.at || 0) || 0, Date.parse(last.errorAt || 0) || 0);
  return t > 0 && now - t < ttl;
}

/**
 * 순수: CHANGELOG 에서 (fromVer, toVer] 구간 — 버전별 항목 머리(굵은 글씨, 없으면 첫 줄 — 다음 줄로 이어지면 …).
 * Unreleased 는 기본 제외, `includeUnreleased` 면 포함(상류는 릴리스 헤딩 없이 main 에 쌓는다 — 같은 버전이어도 파일은 바뀐다).
 */
function changelogSince(txt, fromVer, toVer, { includeUnreleased = false } = {}) {
  const out = [];
  let cur = null;
  for (const line of String(txt || '').split(/\r?\n/)) {
    const h = line.match(/^##\s*\[([^\]]+)\]/);
    if (h) {
      const v = h[1];
      const inRange = v === 'Unreleased' ? includeUnreleased : (!toVer || cmpVersions(v, toVer) <= 0) && (!fromVer || cmpVersions(v, fromVer) > 0);
      cur = inRange ? { ver: v, items: [] } : null;
      if (cur) out.push(cur);
      continue;
    }
    const item = cur && line.match(/^-\s+(.*)$/);
    if (item) {
      const bold = item[1].match(/\*\*(.+?)\*\*/);
      cur.items.push((bold ? bold[1] : item[1]).trim());
      cur.open = !bold;
    } else if (cur && cur.open && /^\s+\S/.test(line)) {
      // 굵은 머리 없는 항목이 다음 줄로 이어진다 — 첫 줄만 싣고 잘렸음을 표시한다.
      const i = cur.items.length - 1;
      if (!cur.items[i].endsWith('…')) cur.items[i] += '…';
      cur.open = false;
    } else if (cur) cur.open = false;
  }
  out.forEach(o => delete o.open);
  return out;
}

/** 순수: 사람에게 보일 제안문. 적용은 사람 승인 뒤([ADR-12]) — 이 문서는 결정 재료다. */
function renderProposal({ localVer, upstreamVer, changelog, plan, guard, held = [], migrations = [] }) {
  const sync = [...plan.changedSync, ...plan.newSync];
  const review = [...plan.changedReview, ...plan.newReview];
  const behind = localVer && upstreamVer && cmpVersions(localVer, upstreamVer) < 0;
  if (!behind && !sync.length && !review.length) return `union-stack 상류 업데이트 없음 — 최신(${localVer || '?'}).\n`;
  const L = [`# union-stack 업데이트 제안 — ${localVer || '?'} → ${upstreamVer || '?'}`, ''];
  const since = changelogSince(changelog, localVer, upstreamVer, { includeUnreleased: sync.length + review.length > 0 });
  if (since.length) {
    L.push('## 무엇이 바뀌었나(상류 CHANGELOG)');
    for (const s of since) {
      L.push(s.ver === 'Unreleased' ? '- **미릴리스(상류 main — 일부는 이미 받았을 수 있다)**' : `- **${s.ver}**`);
      s.items.slice(0, PROPOSAL_ITEMS_CAP).forEach(i => L.push(`  - ${i}`));
      if (s.items.length > PROPOSAL_ITEMS_CAP) L.push(`  - … 외 ${s.items.length - PROPOSAL_ITEMS_CAP}건(상류 CHANGELOG.md)`);
    }
    L.push('');
  }
  if (migrations.length) {
    L.push('## ⚠ 마이그레이션 필요(적용 전 확인)');
    migrations.forEach(m => L.push(`  ${m}`));
    L.push('  → 절차: MIGRATION.md §"Upgrading from an older union-stack"', '');
  }
  const heldSet = new Set(held.map(h => h.file));
  const auto = sync.filter(p => !guard.modified.includes(p) && !guard.unknown.includes(p) && !heldSet.has(p));
  L.push(`## 적용하면 생기는 일`);
  L.push(`- 자동 갱신(sync) ${auto.length}건${auto.length ? ': ' + auto.join(' ') : ''}`);
  if (guard.modified.length) L.push(`- 건너뜀 — 로컬 분기(localForked, 개조 보존) ${guard.modified.length}건: ${guard.modified.join(' ')}`);
  if (guard.unknown.length) L.push(`- 건너뜀 — 앵커 없음(판별 불가) ${guard.unknown.length}건: ${guard.unknown.join(' ')}`);
  if (held.length) L.push(`- 보류(HOLD — 받으면 로드 크래시) ${held.length}건: ${held.map(h => `${h.file} → ${h.dep}${h.missing ? ` (${h.missing.join(', ')})` : ''}`).join(' · ')}`);
  if (review.length) L.push(`- 사람이 diff 를 보고 반영(review — 자동 적용 안 됨) ${review.length}건: ${review.join(' ')}`);
  if (!auto.length && guard.unknown.length) L.push(`- ⚠ 지금 \`--apply\` 는 아무 파일도 바꾸지 않는다(전부 앵커 없음). 개조가 없다고 확신하면 \`--apply --force\`, 아니면 키트([TOOL-35])로 동일 파일만 앵커를 심는다.`);
  L.push('', '## 결정', '- 승인하면: `node scripts/template-update.js --apply` → `node scripts/health.js` · 테스트.',
    '- 적용하지 않고 review 변화만 봤다면: `node scripts/template-update.js --ack-review` — 같은 변화는 다시 알리지 않는다(상류에서 또 바뀌면 다시 알린다).',
    '- 이 제안문은 결정 재료다. 에이전트는 사람의 승인 없이 `--apply` 하지 않는다.');
  return L.join('\n') + '\n';
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
  // --seed [ref]: 사람이 "지금 로컬 == 상류"를 **명시적으로** 단언할 때만 전 파일 앵커를 심는다([PRO-24] ①(a)). 키트는 이것을 쓰지 않는다(동일 파일만 기록).
  const si = argv.indexOf('--seed');
  if (si >= 0) {
    const ref = argv[si + 1] && !argv[si + 1].startsWith('--') ? argv[si + 1] : 'manual';
    seedAnchor(root, ref);
    const n = Object.keys(readAnchor(root)).length;
    console.log(`앵커 시딩: ${ANCHOR_PATH} ← 로컬 ${n}건을 \`${ref}\` 정합으로 기록. ⚠ 로컬 개조가 있었다면 그것도 "정합"이 됐다 — 다음 --apply 가 덮어쓴다. 확신이 없으면 키트([TOOL-35])가 동일 파일만 기록한다.`);
    return OUTCOME.PASS;
  }
  const apply = argv.includes('--apply');
  // --force [경로,경로] — 값이 없으면 전부, 있으면 그 파일만 보호 해제([TOOL-21]).
  const fi = argv.indexOf('--force');
  const force = fi < 0 ? false : (argv[fi + 1] && !argv[fi + 1].startsWith('--') ? argv[fi + 1].split(',').map(x => x.trim()).filter(Boolean) : true);
  const json = argv.includes('--json');
  const proposal = argv.includes('--proposal');
  const refreshCache = argv.includes('--refresh-cache');
  // 캐시는 어답터 것이다 — 상류 자신(템플릿 레포)에는 template-sync.json 을 만들지 않는다. --proposal 은 파일 쓰기 0.
  const cacheOk = !isTemplateRepo(root) && !proposal;
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
    if (cacheOk) { try { writeLastCheck(root, { at: new Date().toISOString(), error: e.message }); } catch { /* 캐시 실패는 무시 */ } }
    if (refreshCache) { console.log(JSON.stringify({ error: e.message })); return OUTCOME.REJECT; }
    console.error(`상류 조회 실패: ${e.message}\n(네트워크/레이트리밋 확인. 오프라인이면 이 도구는 판단 불가 — 추측하지 않는다.)`);
    return OUTCOME.REJECT;
  }
  const upstreamVer = parseChangelogVersion(upstreamChangelog);
  // 배송 ctx([PRO-24] ①): 로컬·상류 매니페스트를 각각 읽는다 — 옛 로컬 매니페스트로 상류 신규를 거르지 않게. 상류 매니페스트 부재(구버전 상류)는 규칙 폴백.
  const lo = localCtx(root);
  let upManifest = null;
  if (upstreamMap[SHIP_MANIFEST]) { try { upManifest = parseManifest(await fetchText(`${RAW}/${encodeURIComponent(ref)}/${SHIP_MANIFEST}`)); } catch { upManifest = null; } }
  // 상류에 매니페스트가 없으면(구버전 상류) 로컬 매니페스트의 상류 전용 목록만 보강해 "상류 신규"로 둔갑하는 것을 막는다(실측: 로컬이 앞선 상류 개발 레포).
  const upCtxManifest = upManifest || (lo.manifest ? { shipped: null, upstreamOnly: lo.manifest.upstreamOnly, optional: [] } : null);
  const ctx = { local: lo, upstream: { manifest: upCtxManifest, localOwned: lo.localOwned, upstreamIgnored: lo.upstreamIgnored } };
  const conflicts = ownedConflicts(upManifest || lo.manifest, lo.localOwned);
  const localFiles = localTemplateFiles(root, lo);
  const plan = buildPlan(localFiles, upstreamMap, ctx);
  const guard = classifySyncTargets([...plan.changedSync, ...plan.newSync], localFiles, readAnchor(root));
  const drift = plan.changedSync.length + plan.changedReview.length + plan.newSync.length + plan.newReview.length;
  const migrations = migrationActions(upstreamChangelog, localVer, upstreamVer);
  const ft = forceTargets(guard, force);
  // 검사 대상 = 이번 런 갱신 대상 + 이미 동기화된 파일(A 실측: 지난 회차에 갱신된 dashboard → 보존 handoff-linter 의 실재 불일치가 다시는 경고되지 않았다).
  const stale = staleDeps(p => { try { return fs.readFileSync(path.join(root, p), 'utf8'); } catch { return null; } }, [...new Set([...ft.targets, ...syncedPaths(localFiles, upstreamMap)])], ft.skipped);

  const held = holdTargets(ft.targets, stale, force).held;
  const summary = checkSummary({ ref, localVer, upstreamVer, plan, guard, held, migrations, upstreamMap, reviewSeen: readReviewSeen(root) });
  // --ack-review: "review 변화를 봤다, 반영은 안 한다" — 다음 확인부터 이 상류 sha 의 review 는 알리지 않는다(상류에서 또 바뀌면 다시 알린다).
  if (argv.includes('--ack-review') && !isTemplateRepo(root)) {
    writeReviewSeen(root, reviewSeenFrom(plan, upstreamMap));
    const acked = checkSummary({ ref, localVer, upstreamVer, plan, guard, held, migrations, upstreamMap, reviewSeen: readReviewSeen(root) });
    try { writeLastCheck(root, acked); } catch { /* 캐시 실패는 무시 */ }
    console.log(`review ${summary.reviewNew}건을 본 것으로 기록(${ANCHOR_PATH} reviewSeen) — 상류에서 다시 바뀌면 다시 알린다. updates=${acked.updates}`);
    return acked.updates ? OUTCOME.CLARIFY : OUTCOME.PASS;
  }
  if (cacheOk) { try { writeLastCheck(root, summary); } catch { /* 캐시 실패는 무시 */ } }
  if (refreshCache) { console.log(JSON.stringify(summary)); return summary.updates ? OUTCOME.CLARIFY : OUTCOME.PASS; }
  if (proposal) { process.stdout.write(renderProposal({ localVer, upstreamVer, changelog: upstreamChangelog, plan, guard, held, migrations })); return summary.updates ? OUTCOME.CLARIFY : OUTCOME.PASS; }
  if (json) {
    console.log(JSON.stringify({ ref, localVer, upstreamVer, plan, guard, staleDeps: stale, migrations, localOwned: lo.localOwned, upstreamIgnored: lo.upstreamIgnored, ownedConflicts: conflicts, shipManifest: !!upManifest, applied: false }, null, 2));
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
  list('상류 전용 스크립트의 로컬 사본(배송 제외 — 지워도 된다, [TOOL-34])', plan.upstreamOnlyLocal);
  if (lo.localOwned.length) console.log(`\n  localOwned 글롭 ${lo.localOwned.length}건 적용(어답터 고유 파일 — 보고·갱신 제외)${upManifest ? '' : ' · 상류 매니페스트 없음(규칙 폴백)'}`);
  if (lo.upstreamIgnored.length) {
    const ignoredScripts = Object.keys(upstreamMap).filter(p => /^scripts\//.test(p) && lo.upstreamIgnored.some(g => matchGlob(g, p)));
    console.log(`\n  upstreamIgnored 글롭 ${lo.upstreamIgnored.length}건 적용(상류 파일 거부 — 배송·보고 제외)${ignoredScripts.length ? ` · ⚠ 스크립트 ${ignoredScripts.length}건 거부 — 게이트 약화일 수 있다(ci 체인은 없는 단계를 건너뛴다): ${ignoredScripts.join(' ')}` : ''}`);
  }
  if (conflicts.length) {
    console.log('\n  ⚠ localOwned 글롭이 상류 배송 파일과 겹친다 — sync 가 우선한다(글롭을 좁혀라):');
    conflicts.forEach(p => console.log(`    ! ${p}`));
  }
  if (guard.modified.length) {
    console.log('\n  ⚠ 로컬 분기(localForked) — 동명 파일이 상류와 갈라졌다. 덮어쓰면 소실(--apply 가 건너뜀):');
    guard.modified.forEach(p => console.log(`    ! ${p}`));
    console.log('    → 개조를 유지하려면 설정으로 흡수하라(MIGRATION.md §"Adopter configuration").');
  }
  if (guard.unknown.length) {
    console.log('\n  ? 정합 앵커 없음 — 로컬 개조 여부 판별 불가(--apply 가 건너뜀):');
    guard.unknown.forEach(p => console.log(`    ? ${p}`));
    console.log(`    → 개조가 없다고 확신하면 \`--apply --force\`. 한 번 적용하면 ${ANCHOR_PATH} 가 앵커를 기록해`);
    console.log('      다음부터는 개조만 골라 건너뛴다.');
  }
  if (stale.length) {
    const bad = stale.filter(s => s.missing && s.missing.length), unknown = stale.filter(s => s.missing == null);
    if (bad.length) {
      console.log('\n  ⚠ 의존 불일치 — 갱신된 파일이 보존(갱신 보류) 파일에서 **없는 심볼**을 require 한다(실측: dashboard ↔ handoff-linter):');
      bad.forEach(s => console.log(`    ! ${s.file} → ${s.dep} (없는 심볼: ${s.missing.join(', ')})`));
      console.log('    → 함께 갱신하려면 `--apply --force <보존 파일>` · 개조를 지키려면 그 파일의 개조를 상류 인터페이스에 맞춰라.');
    }
    console.log(`\n  보존 파일에 의존하는 갱신 파일 ${stale.length}쌍 — 심볼 불일치 ${bad.length} · 판별 불가 ${unknown.length}(기본 require 또는 exports 없음)`);
  }
  if (plan.dropped.length) console.log(`\n  (drop-template-bits 제거분 ${plan.dropped.length}건은 재추가하지 않음)`);
  if (migrations.length) {
    console.log('\n  ⚠ 마이그레이션 필요 항목(상류 CHANGELOG):');
    migrations.forEach(l => console.log(`    ${l}`));
    console.log('    → 적용 절차: MIGRATION.md §"Upgrading from an older union-stack"');
  }

  if (!drift) { console.log('\n최신 상태 — 드리프트 없음.'); return OUTCOME.PASS; }
  if (apply) {
    const { skipped, unmatched } = ft;
    const hold = holdTargets(ft.targets, stale, force);
    const targets = hold.targets;
    if (hold.held.length) {
      console.log('\n  ⏸ 보류(HOLD) — 보존 파일에 없는 심볼을 require 하는 갱신은 받으면 로드 크래시다. 보존 파일을 `--force <경로>` 로 함께 갱신하거나 포크를 상류 인터페이스에 맞춰라:');
      hold.held.forEach(h => console.log(`    ⏸ ${h.file} → ${h.dep} (없는 심볼: ${h.missing.join(', ')})`));
    }
    console.log(`\n적용(sync만 — review·.union-stack 콘텐츠는 건드리지 않음)${force === true ? ' [--force: 개조 보호 전부 해제]' : Array.isArray(force) ? ` [--force: ${force.length}건만 보호 해제]` : ''}:`);
    if (unmatched.length) console.log(`  (--force 대상이 아님 — 개조·판별불가 목록에 없음: ${unmatched.join(' ')})`);
    if (!targets.length) console.log('  (갱신 대상 없음)');
    const n = await applyPlan(root, ref, targets, upstreamMap);
    // 사람이 보고서를 보고 승인해 적용했다 — 이번 review 변화는 "본 것"이다(반영은 사람이 diff 로). 다음 확인은 새 변화만 알린다.
    if (!isTemplateRepo(root)) { try { writeReviewSeen(root, reviewSeenFrom(plan, upstreamMap)); } catch { /* 캐시 실패는 무시 */ } }
    if (skipped.length) console.log(`\n보존(덮어쓰지 않음) ${skipped.length}건: ${skipped.join(' ')}`);
    console.log(`\n${n}개 파일 갱신. 검증: node scripts/health.js && 테스트 실행. review ${plan.changedReview.length + plan.newReview.length}건은 수동 반영.`);
    return OUTCOME.CLARIFY;
  }
  console.log('\n갱신하려면: node scripts/template-update.js --apply  (sync만 자동, review는 보고만)');
  return OUTCOME.CLARIFY;
}

module.exports = { classifyPath, matchGlob, ownedConflicts, localCtx, forceTargets, parseChangelogVersion, cmpVersions, gitBlobSha, gitBlobShas, buildPlan, classifySyncTargets, staleDeps, syncedPaths, holdTargets, readAnchor, writeAnchor, seedAnchor, checkSummary, reviewSeenFrom, readReviewSeen, writeReviewSeen, readLastCheck, writeLastCheck, isFresh, changelogSince, renderProposal, CHECK_TTL_MS, localTemplateFiles, migrationActions, UPSTREAM, ANCHOR_PATH, SHIP_MANIFEST };

if (require.main === module) main().then(c => process.exit(c), e => { console.error(e); process.exit(OUTCOME.REJECT); });
