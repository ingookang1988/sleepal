#!/usr/bin/env node
// scripts/union-stack-kit.js
// 부트스트랩 키트([PRO-24] ①(a) · §9 ①) — `template-update` 가 없는 어답터(손 이식)의 **사후 입장권**. 의존 0 · 단일 파일 · 어답터가 끌어온다. [TOOL-35]
//
// 한 줄:
//   curl -fsSL https://raw.githubusercontent.com/ingookang1988/union-stack/main/scripts/union-stack-kit.js -o scripts/union-stack-kit.js && node scripts/union-stack-kit.js
//   (Windows PowerShell: curl.exe 로 같은 명령. 또는 node -e "fetch(URL).then(r=>r.text()).then(t=>require('fs').writeFileSync('scripts/union-stack-kit.js',t))")
//
// 하는 일: ① 상류 매니페스트(scripts/ship-manifest.json)를 읽어 template-update 의 require 폐포 8 파일 중 **없는 것만** 가져온다(있는 파일은 건드리지 않는다 —
// 덮어쓰기는 template-update 의 3-way 보호 몫). ② 정합 앵커(.union-stack/template-sync.json)를 심는다 — 단, 로컬 파일이 상류(`--guess` 태그 = 추정 클론 지점,
// 기본 v<CHANGELOG 버전> 또는 v6.0.0 · 그리고 main)와 **바이트 동일한 파일만** 정합으로 기록한다(`clone@6.0.0(추정)` 표기). 다른 파일은 unknown 으로 남아
// `--apply` 가 건드리지 않는다 — 앵커를 전부 "정합"으로 위조하면 [ADR-29] 사고(개조 소실)가 그대로 재현된다.
// **첫 실행은 dry-run 만**(계획 출력). `--apply` 로 쓴다. `.union-stack/` 콘텐츠는 앵커 파일 외에 절대 건드리지 않는다.
//
// 실행: node scripts/union-stack-kit.js [--apply] [--ref main] [--guess v6.0.0] [--from-dir <상류 체크아웃>] [--json]
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const UPSTREAM = 'ingookang1988/union-stack';
const API = `https://api.github.com/repos/${UPSTREAM}`;
const RAW = `https://raw.githubusercontent.com/${UPSTREAM}`;
const MANIFEST = 'scripts/ship-manifest.json';
const ANCHOR = '.union-stack/template-sync.json';
// template-update.js 의 require 폐포 — 이것만 있으면 나머지는 template-update 가 3-way 보호 아래 가져온다.
const KIT_FILES = ['scripts/template-update.js', 'scripts/fs_walk.js', 'scripts/gate-contract.js', 'scripts/init.js', 'scripts/ledger.js', 'scripts/adapter.js', 'scripts/ship-manifest.js', MANIFEST];

/** git blob sha(순수) — `git hash-object` 와 동일. */
function gitBlobSha(content) {
  const buf = Buffer.from(String(content), 'utf8');
  return crypto.createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
}
/** 개행 이형 흡수(순수): 원본 + LF 정규화 + CRLF 변형 후보. */
function blobShas(content) {
  const s = String(content);
  const lf = s.replace(/\r\n/g, '\n');
  return [...new Set([gitBlobSha(s), gitBlobSha(lf), gitBlobSha(lf.replace(/\n/g, '\r\n'))])];
}

/**
 * 계획(순수). local: {path → [sha…]} (로컬에 있는 shipped 파일만) · upstream: {path → sha}(배송 대상) · guess: {path → sha}|null · kitFiles · shipped.
 * 반환: { fetch(없는 키트 파일), keep(있는 키트 파일 — 안 건드림), anchor({path → 상류 sha} — 동일 파일만), unknown(있지만 다름), missing(shipped 인데 없음, template-update 가 가져온다) }
 */
function planKit({ local, upstream, guess = null, kitFiles = KIT_FILES, shipped = [] }) {
  const fetch = kitFiles.filter(p => !(p in local) && p in upstream);
  const keep = kitFiles.filter(p => p in local);
  const anchor = {}, unknown = [], missing = [];
  for (const p of shipped) {
    if (!(p in upstream)) continue;
    if (!(p in local)) { if (!fetch.includes(p)) missing.push(p); continue; }
    const shas = local[p];
    // 앵커는 로컬이 **실제로 같은** sha 여야 3-way 가 clean 으로 읽는다 — 추정 지점과 같은 파일에 main sha 를 적으면 localForked 오판(어답터 A 실측: 8파일 --force).
    if (shas.includes(upstream[p])) anchor[p] = upstream[p];
    else if (guess && guess[p] && shas.includes(guess[p])) anchor[p] = guess[p];
    else unknown.push(p);
  }
  for (const p of fetch) anchor[p] = upstream[p]; // 가져온 파일은 정의상 상류와 동일
  return { fetch, keep, anchor, unknown, missing, absentKit: kitFiles.filter(p => !(p in upstream)) };
}

function anchorLabel(ver) { return `clone@${ver || '?'}(추정)`; }

// --- 상류 읽기(네트워크 또는 로컬 디렉터리) ---
async function fetchText(url) {
  const r = await fetch(url, { headers: { 'user-agent': 'union-stack-kit' } });
  if (!r.ok) throw new Error(`HTTP ${r.status} — ${url}`);
  return r.text();
}
async function treeAt(ref) {
  const t = JSON.parse(await fetchText(`${API}/git/trees/${encodeURIComponent(ref)}?recursive=1`));
  const m = {};
  for (const e of t.tree || []) if (e.type === 'blob') m[e.path] = e.sha;
  return m;
}
function treeFromDir(dir) {
  const m = {};
  const walk = rel => {
    let entries = [];
    try { entries = fs.readdirSync(path.join(dir, rel), { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) { if (!['.git', 'node_modules'].includes(e.name)) walk(r); }
      else if (e.isFile() && (r.startsWith('scripts/') || r === 'CHANGELOG.md')) m[r] = gitBlobSha(fs.readFileSync(path.join(dir, r)));
    }
  };
  walk('');
  return m;
}
function parseVersion(txt) { const m = String(txt || '').match(/^##\s*\[(\d+\.\d+\.\d+)\]/m); return m ? m[1] : null; }

async function loadUpstream({ ref, guessTag, fromDir }) {
  if (fromDir) {
    const dir = path.resolve(fromDir);
    const upstream = treeFromDir(dir);
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, MANIFEST), 'utf8'));
    const version = parseVersion((() => { try { return fs.readFileSync(path.join(dir, 'CHANGELOG.md'), 'utf8'); } catch { return ''; } })());
    return { upstream, guess: null, manifest, version, read: p => fs.readFileSync(path.join(dir, p), 'utf8'), source: dir };
  }
  const [upstream, manifestTxt, changelog] = await Promise.all([treeAt(ref), fetchText(`${RAW}/${encodeURIComponent(ref)}/${MANIFEST}`), fetchText(`${RAW}/${encodeURIComponent(ref)}/CHANGELOG.md`)]);
  let guess = null;
  if (guessTag) { try { guess = await treeAt(guessTag); } catch { guess = null; } }
  return { upstream, guess, manifest: JSON.parse(manifestTxt), version: parseVersion(changelog), read: p => fetchText(`${RAW}/${encodeURIComponent(ref)}/${p}`), source: `${UPSTREAM}@${ref}`, guessTag: guess ? guessTag : null };
}

function localShipped(root, shipped) {
  const local = {};
  for (const p of shipped) {
    try { local[p] = blobShas(fs.readFileSync(path.join(root, p), 'utf8')); } catch { /* 없음 */ }
  }
  return local;
}

async function main(argv = process.argv.slice(2)) {
  const root = process.cwd();
  const json = argv.includes('--json');
  const apply = argv.includes('--apply');
  const opt = k => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null; };
  if (!fs.existsSync(path.join(root, '.union-stack'))) { console.error('kit: 여기엔 .union-stack/ 이 없다 — 어답터 레포 루트에서 실행하라(상류 자체에는 필요 없다).'); return 3; }
  const localVer = parseVersion((() => { try { return fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8'); } catch { return ''; } })());
  const ref = opt('--ref') || 'main';
  const guessTag = opt('--guess') || `v${localVer || '6.0.0'}`;
  let up;
  try { up = await loadUpstream({ ref, guessTag, fromDir: opt('--from-dir') }); }
  catch (e) { console.error(`kit: 상류 조회 실패 — ${e.message}\n(네트워크/레이트리밋 확인. 오프라인이면 --from-dir <상류 체크아웃>)`); return 1; }
  const shipped = Array.isArray(up.manifest.shipped) ? up.manifest.shipped : [];
  const local = localShipped(root, shipped);
  const plan = planKit({ local, upstream: up.upstream, guess: up.guess, shipped });
  const anchorExists = fs.existsSync(path.join(root, ANCHOR));
  const label = anchorLabel(up.version);
  const out = { source: up.source, ref, guess: up.guessTag || null, upstreamVersion: up.version, localVersion: localVer, hasTemplateUpdate: fs.existsSync(path.join(root, 'scripts/template-update.js')), anchorExists, plan, applied: false };
  if (json && !apply) { console.log(JSON.stringify(out, null, 2)); return 0; }
  if (!json) {
    console.log(`# union-stack 키트 (${up.source}${up.guessTag ? ` · 추정 클론 지점 ${up.guessTag}` : ''})\n`);
    console.log(`  로컬 버전 ${localVer || '판별 불가'} · 상류 버전 ${up.version || '?'} · template-update ${out.hasTemplateUpdate ? '있음' : '없음'} · 앵커 ${anchorExists ? '있음(그대로 둠)' : '없음(심는다)'}`);
    const list = (label, arr) => { if (arr.length) { console.log(`\n  ${label}:`); arr.forEach(p => console.log(`    · ${p}`)); } };
    list('가져올 키트 파일(없는 것만)', plan.fetch);
    list('있는 키트 파일(건드리지 않음)', plan.keep);
    console.log(`\n  정합 앵커 후보 ${Object.keys(plan.anchor).length}건(상류와 바이트 동일한 파일만) · 판별 불가(unknown — 로컬이 다름) ${plan.unknown.length}건 · 아직 없는 배송 파일 ${plan.missing.length}건(template-update 가 가져온다)`);
    if (plan.unknown.length) console.log(`    unknown: ${plan.unknown.slice(0, 12).join(' ')}${plan.unknown.length > 12 ? ' …' : ''}`);
    if (plan.absentKit.length) console.log(`  ⚠ 상류에 없는 키트 파일: ${plan.absentKit.join(' ')}`);
  }
  if (!apply) {
    if (!json) console.log(`\n(dry-run — 쓰지 않았다. 적용: node scripts/union-stack-kit.js --apply${opt('--from-dir') ? ' --from-dir ' + opt('--from-dir') : ''})`);
    return 0;
  }
  for (const p of plan.fetch) {
    const txt = await up.read(p);
    fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true });
    fs.writeFileSync(path.join(root, p), txt);
    if (!json) console.log(`  ✓ 가져옴: ${p}`);
  }
  if (!anchorExists) {
    fs.mkdirSync(path.dirname(path.join(root, ANCHOR)), { recursive: true });
    fs.writeFileSync(path.join(root, ANCHOR), JSON.stringify({ upstream: UPSTREAM, ref: label, blobs: plan.anchor }, null, 2) + '\n');
    if (!json) console.log(`  ✓ 앵커 ${ANCHOR} — ${label} · 정합 ${Object.keys(plan.anchor).length}건(동일 파일만; 나머지는 unknown 으로 보호)`);
  } else if (!json) console.log(`  · 앵커가 이미 있어 그대로 둔다(${ANCHOR})`);
  out.applied = true;
  if (json) { console.log(JSON.stringify(out, null, 2)); return 0; }
  console.log(`\n다음: node scripts/template-update.js            # dry-run 보고(localForked·상류 전용 사본·review)\n      node scripts/template-update.js --apply    # clean 만 갱신 · 개조는 --force <경로> 로 파일별 결정`);
  return 0;
}

module.exports = { gitBlobSha, blobShas, planKit, anchorLabel, treeFromDir, parseVersion, KIT_FILES, MANIFEST, ANCHOR, UPSTREAM };

if (require.main === module) main().then(c => process.exit(c), e => { console.error(e); process.exit(1); });
