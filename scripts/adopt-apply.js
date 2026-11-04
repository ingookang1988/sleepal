// scripts/adopt-apply.js
// init --adopt <repo> --plan plan.json [--apply] — 사람이 고친 매핑안([WO-29a-11] 의 dry-run 산출물)을 **대상 레포에서 그 레포의 사람이** 적용한다([PRO-29] ③(b), [WO-29a-12]).
// 끝점: 이식 직후 레포가 ① 고리(health upstream · template-update)에 바로 들어온다.
//
// 기본은 적용 계획 출력(dry-run, 쓰기 0). `--apply` 로만 쓴다. 대상의 git 작업 트리가 깨끗하지 않으면 거부한다(되돌릴 지점이 커밋 하나여야 한다).
// 적용 행: high 적용 · medium 은 행에 `"approved": true` 가 있을 때만 · low·`to: null` 은 목록만. 사람이 `to`·`proposedId` 를 고쳤으면 고친 값을 쓴다(ZFS 유효성 재검사, 무효 = 그 행 거부).
// 적용 내용: ① 하네스 배송(상류의 sync 범주 — 키트·template-update 와 같은 분류, 상류 전용 제외) ② 평면 골격(.union-stack/ 디렉터리·_GUIDE) ③ `git mv`(이력 보존) — id/dir 행
//   ④ file 행(원장·HISTORY·IDENTITY·HANDOFF)은 옮기지 않고 그 파일에 **원문 경로 링크 목록**만 남긴다(여러 문서를 한 파일에 합치는 건 사람 몫 — 자동 재작성 금지, [ADR-12])
//   ⑤ adapter.json 초안 ⑥ 정합 앵커 시딩(배송한 파일 = 상류와 동일) ⑦ 린트 1회(zfs-linter · work-close --table --write — next.md 마커도 여기서 생긴다).
// 재실행 멱등: 이미 옮긴 행(from 없음·to 있음)은 건너뛰고, 링크는 중복을 안 만들고, 배송은 같은 파일을 다시 쓰지 않는다.
// 상류 세션은 남의 레포를 쓰지 않는다([PRO-24] §5) — 실측은 scratchpad 사본에서만.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { RULES } = require('./adopt-map');
const { isValidName, parse } = require('./zfs_util');
const { walkFiles } = require('./fs_walk');

const LINK_HEADING = '## 이식 원문(원래 경로 — 사람이 옮겨 적는다)';
const IDENTITY_RE = /^\.union-stack\/project\/IDENTITY[^/]*\.md$/;
const FILE_HOMES = new Set(RULES.filter(r => r.kind === 'file' && !r.home.includes('*')).map(r => r.home));

const norm = p => String(p || '').replace(/\\/g, '/').replace(/^\.\//, '');

/** 행의 종류(순수): 행의 kind 가 우선, 없으면 proposedId → id · file 자리 → file · 그 밖 → dir. 사람이 손으로 추가한 행도 읽는다. */
function kindOf(row) {
  if (row.kind) return row.kind;
  if (row.proposedId) return 'id';
  const to = norm(row.to);
  return FILE_HOMES.has(to) || IDENTITY_RE.test(to) ? 'file' : 'dir';
}

/**
 * 적용 행 선택(순수): { apply: [행(kind·to 정규화)], skipped: [{from, reason}] }.
 *   high 적용(approved:false 면 사람 거부) · medium·그 밖은 approved:true 만 · low·to:null 제외 · .union-stack 밖 거부 ·
 *   id 행은 ZFS 유효성과 proposedId↔to 일치 재검사 · 같은 자리로 두 행이면 뒤 행 거부(file 행은 여럿이 한 파일에 모이는 게 정상).
 */
function selectRows(rows) {
  const apply = [], skipped = [], taken = new Map();
  const skip = (r, reason) => skipped.push({ from: r.from, reason });
  for (const r of rows || []) {
    if (!r.to || r.confidence === 'low') { skip(r, 'low 또는 자리 없음(to:null) — 사람이 자리를 정한다'); continue; }
    if (r.approved === false) { skip(r, 'approved:false — 사람이 거부'); continue; }
    if (r.confidence !== 'high' && r.approved !== true) { skip(r, `${r.confidence} — approved:true 가 없다`); continue; }
    const to = norm(r.to);
    if (!to.startsWith('.union-stack/') || to.split('/').includes('..')) { skip(r, `.union-stack 밖(${to})`); continue; }
    if (/[*?]/.test(to)) { skip(r, `글롭이 그대로 남은 자리(${to}) — 실제 파일 하나로 고쳐라`); continue; }
    const kind = kindOf({ ...r, to });
    if (kind === 'id') {
      const base = path.posix.basename(to);
      if (!isValidName(base)) { skip(r, `ZFS 무효 이름(${base})`); continue; }
      if (r.proposedId) {
        const p = parse(base);
        if (`${p.domain}-${p.id}` !== r.proposedId) { skip(r, `proposedId(${r.proposedId}) ≠ to 의 ID(${p.domain}-${p.id})`); continue; }
      }
    }
    if (kind !== 'file') {
      if (taken.has(to)) { skip(r, `중복 자리 — ${taken.get(to)} 가 먼저`); continue; }
      taken.set(to, r.from);
    }
    apply.push({ ...r, to, kind });
  }
  return { apply, skipped };
}

/**
 * 작업 목록(순수): id/dir → mv(from 있음·to 없음) · skip(이미 옮김: from 없음·to 있음 / from 없음) · conflict(둘 다 있음 — 덮어쓰지 않는다) ·
 * file → 자리별 link 하나에 from 을 모은다. exists(repoRel) 는 호출부가 준다(FS 비의존).
 */
function buildOps(selected, { exists }) {
  const ops = [], links = new Map();
  for (const r of selected) {
    if (r.kind === 'file') { if (!links.has(r.to)) links.set(r.to, []); links.get(r.to).push(r.from); continue; }
    const fe = exists(r.from), te = exists(r.to);
    if (!fe && te) ops.push({ op: 'skip', from: r.from, to: r.to, reason: '이미 옮김' });
    else if (!fe) ops.push({ op: 'skip', from: r.from, to: r.to, reason: '원문 없음' });
    else if (te) ops.push({ op: 'conflict', from: r.from, to: r.to, reason: '자리에 다른 파일이 있다 — 덮어쓰지 않는다' });
    else ops.push({ op: 'mv', from: r.from, to: r.to });
  }
  for (const [file, froms] of links) ops.push({ op: 'link', file, froms });
  return ops;
}

/** 링크 목록(순수): 헤딩 1회 · `- \`경로\`` 줄 · 이미 있는 경로는 다시 안 쓴다 · 본문은 손대지 않는다. 추가할 것이 없으면 원문 그대로. */
function linkSection(txt, froms) {
  const src = String(txt || '');
  const lines = src.split('\n');
  const hi = lines.indexOf(LINK_HEADING);
  let end = lines.length;
  const have = new Set();
  if (hi >= 0) {
    end = lines.findIndex((l, i) => i > hi && /^## /.test(l)); if (end < 0) end = lines.length;
    for (let i = hi + 1; i < end; i++) { const m = lines[i].match(/^- `([^`]+)`/); if (m) have.add(m[1]); }
  }
  const add = [...new Set(froms.map(norm))].filter(f => !have.has(f)).map(f => `- \`${f}\``);
  if (!add.length) return src;
  if (hi < 0) return `${src}${src.endsWith('\n') || !src ? '' : '\n'}${src ? '\n' : ''}${LINK_HEADING}\n${add.join('\n')}\n`;
  // 절 끝의 빈 줄 앞에 끼운다
  let at = end; while (at > hi + 1 && lines[at - 1].trim() === '') at--;
  lines.splice(at, 0, ...add);
  return lines.join('\n');
}

/** 배송 목록: 상류 체크아웃에서 sync 범주로 분류되는 파일(스크립트는 매니페스트 열거분만 · 상류 전용 제외 · .union-stack 콘텐츠·review 제외). */
function deliveryList(upstreamRoot) {
  const { classifyPath } = require('./template-update');   // 지연: template-update → init → (지연) adopt-apply 순환 방지
  const { readManifest } = require('./ship-manifest');
  const ctx = { manifest: readManifest(upstreamRoot), localOwned: [], upstreamIgnored: [] };
  const out = [];
  const record = rel => { if (classifyPath(rel, ctx) === 'sync') out.push(rel); };
  ['scripts', '.github/workflows', 'ci'].forEach(d => walkFiles(upstreamRoot, d, record));
  ['CHANGELOG.md', 'MIGRATION.md', 'DESIGN_RATIONALE.md', 'docker-compose.harness.yml'].forEach(f => { if (fs.existsSync(path.join(upstreamRoot, f))) record(f); });
  return out.sort();
}

const same = (a, b) => { try { return fs.readFileSync(a).equals(fs.readFileSync(b)); } catch { return false; } };
const writeIfAbsent = (abs, txt) => { if (fs.existsSync(abs)) return false; fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, txt); return true; };

/** file 자리의 바탕 — 없으면 init 의 리셋 템플릿(원장·HISTORY·HANDOFF), IDENTITY 는 최소 틀. */
function seedFor(rel) {
  if (IDENTITY_RE.test(rel)) return '<!-- [Schema/Frame] Project identity — 이식 원문 링크 아래 목록. 사람이 채운다. -->\n---\ntitle: TODO\nstatus: Active\nversion: 0.1\n---\n\n# TODO\n\n## Identity (what this project is)\nTODO\n\n## Boundary (in / out of scope)\nTODO\n\n## Domain vocabulary\nTODO\n';
  const t = require('./init').resetTemplate(rel);
  return t || '';
}

function git(cwd, ...args) { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }

/**
 * 적용(얇은 IO). plan = init --adopt --out 의 JSON(사람이 고친 것). opts: { upstreamRoot, write }.
 * 반환 { code, ops, skipped, delivered, conflicts }. code 2 = 거부(git 아님·더러운 트리). 린트 결과는 보고만(적용의 성패가 아니다).
 */
function apply(target, planJson, { upstreamRoot = path.resolve(__dirname, '..'), write = false } = {}) {
  const rows = (planJson && Array.isArray(planJson.rows)) ? planJson.rows : [];
  try { git(target, 'rev-parse', '--is-inside-work-tree'); } catch { console.error(`init --adopt --plan: ${target} 는 git 작업 트리가 아니다(이력 보존은 git mv 에 기댄다)`); return { code: 2, ops: [], skipped: [], delivered: [], conflicts: [] }; }
  if (write && git(target, 'status', '--porcelain').trim()) { console.error('init --adopt --apply: 대상의 git 작업 트리가 깨끗하지 않다 — 커밋하거나 stash 한 뒤 다시(되돌릴 지점이 커밋 하나여야 한다)'); return { code: 2, ops: [], skipped: [], delivered: [], conflicts: [] }; }

  const { apply: selected, skipped } = selectRows(rows);
  const exists = rel => fs.existsSync(path.join(target, rel));
  const ops = buildOps(selected, { exists });
  const delivery = deliveryList(upstreamRoot);
  const deliverable = delivery.filter(p => !exists(p));
  const conflicts = delivery.filter(p => exists(p) && !same(path.join(upstreamRoot, p), path.join(target, p)));
  const guides = []; walkFiles(upstreamRoot, '.union-stack', rel => { if (/_GUIDE\.md$/.test(rel) && !exists(rel)) guides.push(rel); });

  const mv = ops.filter(o => o.op === 'mv'), links = ops.filter(o => o.op === 'link'), skips = ops.filter(o => o.op === 'skip'), confl = ops.filter(o => o.op === 'conflict');
  console.log(`# union-stack 이식 적용${write ? '' : '(dry-run)'} — 행 ${rows.length} · 적용 ${selected.length}(mv ${mv.length} · 링크 자리 ${links.length} · 이미 옮김 ${skips.length}${confl.length ? ` · ⚠ 자리 충돌 ${confl.length}` : ''}) · 건너뜀 ${skipped.length}\n`);
  for (const o of mv) console.log(`  mv    ${o.from} → ${o.to}`);
  for (const o of confl) console.log(`  ⚠     ${o.from} → ${o.to}  — ${o.reason}`);
  for (const o of links) console.log(`  link  ${o.file}  ← ${o.froms.length}건 (옮기지 않음 — 원문 경로 목록만)`);
  for (const o of skips) console.log(`  ·     ${o.from}  — ${o.reason}`);
  if (skipped.length) { console.log('\n  건너뜀(사람 몫):'); for (const s of skipped) console.log(`    ${s.from}  — ${s.reason}`); }
  console.log(`\n  배송 ${deliverable.length}(이미 있음 ${delivery.length - deliverable.length}${conflicts.length ? ` · ⚠ 로컬이 다름 ${conflicts.length}: ${conflicts.slice(0, 6).join(' ')}${conflicts.length > 6 ? ' …' : ''} — 건드리지 않음, adapter.json localOwned 후보([up:WO-29a-10])` : ''}) · 골격 _GUIDE ${guides.length} · adapter.json ${exists('.union-stack/adapter.json') ? '있음(그대로)' : '초안 기록'} · 앵커 시딩 · 린트 1회`);
  if (!write) { console.log('\n(dry-run — 쓰지 않았다. 적용: 같은 명령에 --apply. 적용 뒤 `git status` 로 보고 커밋한다.)'); return { code: 0, ops, skipped, delivered: deliverable, conflicts }; }

  // ① 배송(복사 — 상류는 읽기만)
  for (const p of deliverable) { const abs = path.join(target, p); fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.copyFileSync(path.join(upstreamRoot, p), abs); }
  // ② 골격 — 상류의 모든 _GUIDE 를 같은 자리에(디렉터리가 함께 생긴다)
  for (const g of guides) { const abs = path.join(target, g); fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.copyFileSync(path.join(upstreamRoot, g), abs); }
  // ③ 옮기기 + 인덱스 스테이징(= git mv 와 같은 결과: rename 으로 잡히고 `git log --follow` 가 원 커밋에 닿는다).
  //    행마다 `git mv` 를 띄우면 Windows 에서 1행 ≈ 1초 — OSS 실측(TSC 396 행) 6분. 파일시스템 rename 뒤 `git add` 1회(경로는 stdin — 인자 길이 한계 회피).
  for (const o of mv) { fs.mkdirSync(path.dirname(path.join(target, o.to)), { recursive: true }); fs.renameSync(path.join(target, o.from), path.join(target, o.to)); }
  if (mv.length) execFileSync('git', ['add', '-A', '--pathspec-from-file=-'], { cwd: target, encoding: 'utf8', input: mv.flatMap(o => [o.from, o.to]).join('\n') + '\n', stdio: ['pipe', 'pipe', 'pipe'] });
  // ④ file 행 — 링크 목록만
  for (const o of links) {
    const abs = path.join(target, o.file);
    writeIfAbsent(abs, seedFor(o.file));
    const cur = fs.readFileSync(abs, 'utf8'), next = linkSection(cur, o.froms);
    if (next !== cur) fs.writeFileSync(abs, next);
  }
  // ⑤ adapter.json 초안 — 있으면 그대로(어답터 소유)
  const a = (planJson && planJson.adapter) || {};
  const shippedSet = new Set(delivery);
  // private:true — 누설 가드는 공개 템플릿 보호용이라 실콘텐츠 레포에서는 의미가 반전된다(OSS 실측 TSC: 적용 직후 leakage FAIL 343). 공개 템플릿을 만드는 쪽이면 사람이 끈다.
  const draft = { private: true, statusMap: a.statusMap || {}, sections: a.sections || {}, localOwned: [...new Set([...(a.localOwned || []), ...conflicts])].filter(p => !shippedSet.has(p) || conflicts.includes(p)).sort() };
  writeIfAbsent(path.join(target, '.union-stack/adapter.json'), JSON.stringify(draft, null, 2) + '\n');
  // ⑥ 정합 앵커 — 배송한 파일은 정의상 상류와 동일
  const tu = require('./template-update');
  let ver = null; try { ver = tu.parseChangelogVersion(fs.readFileSync(path.join(upstreamRoot, 'CHANGELOG.md'), 'utf8')); } catch { /* 미상 */ }
  tu.seedAnchor(target, `adopt@${ver || 'unknown'}`);
  console.log(`\n  ✓ 배송 ${deliverable.length} · _GUIDE ${guides.length} · git mv ${mv.length} · 링크 ${links.length} · adapter.json · 앵커 ${tu.ANCHOR_PATH}(adopt@${ver || 'unknown'})`);
  // ⑦ 린트 1회 — 보고만
  for (const [label, args] of [['zfs-linter', ['scripts/zfs-linter.js']], ['work-close --table --write', ['scripts/work-close.js', '--table', '--write']]]) {
    let out = '', code = 0;
    try { out = execFileSync(process.execPath, args, { cwd: target, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (e) { code = e.status == null ? 1 : e.status; out = `${e.stdout || ''}${e.stderr || ''}`; }
    const first = out.trim().split('\n').slice(0, 4).join('\n    ');
    console.log(`  ${code ? '!' : '✓'} ${label}(exit ${code}): ${first || '(출력 없음)'}`);
  }
  console.log('\n적용 완료. 다음: `git status` 로 보고 커밋 → low·건너뜀 행은 사람이 자리를 정한다 → 링크 목록의 원문을 옮겨 적는다 → `node scripts/template-update.js`(dry-run) · `node scripts/health.js`.');
  return { code: 0, ops, skipped, delivered: deliverable, conflicts };
}

module.exports = { kindOf, selectRows, buildOps, linkSection, deliveryList, apply, LINK_HEADING };
