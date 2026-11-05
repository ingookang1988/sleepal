#!/usr/bin/env node
// scripts/ship-manifest.js
// 배송 매니페스트([PRO-24] ①(c) · §9 ①) — 어답터에 가는 스크립트를 **상류가 열거**한다(화이트리스트). 나머지는 기본 로컬. [TOOL-34]
//
// 분류는 수기 목록이 아니라 **정의 지점 태그**에서 생성한다([PRO-21] `@test-asset` 문법):
//   // @ship upstream-only — <이유>   상류 자기 측정·평가 계층. 어답터에 가지 않는다(template-update 가 배송·보고에서 뺀다).
//   // @ship optional — <이유>        배송은 되지만 어답터가 끌 수 있는 것(leakage-guard·dashboard·hooks·ci·ledger 류). 정보만.
//   태그 없음                        배송(sync).
// `X.test.js` 는 `X.js` 의 분류를 따른다(상류 전용 스크립트의 테스트가 혼자 배송되면 require 가 깨진다).
// 산출: scripts/ship-manifest.json(생성 뷰 — 손으로 고치지 않는다). template-update 는 로컬·상류 매니페스트를 각각 읽는다.
//
// 실행: node scripts/ship-manifest.js            # 드리프트 검사: 0(동기화) / 3(드리프트·부재, 비차단)
//       node scripts/ship-manifest.js --write    # 매니페스트 재생성
//       node scripts/ship-manifest.js --json
const fs = require('fs');
const path = require('path');
const { withContract, OUTCOME } = require('./gate-contract');
const { isTemplateRepo } = require('./adapter');

const MANIFEST = 'scripts/ship-manifest.json';
const TAG_RE = /^\/\/\s*@ship\s+(upstream-only|optional)\b\s*(?:—|-|:)?\s*(.*)$/m;

const CONTRACT = {
  gate: 'Ship Manifest Gate (ship-manifest)',
  input: 'scripts/*.js 의 선두 @ship 태그 + 기존 scripts/ship-manifest.json',
  predicate: '생성 매니페스트 == 커밋된 매니페스트. 다르면(태그 변경·새 스크립트) CLARIFY — --write 후 커밋에 포함',
  scope: '태그와 파일 목록만 본다 — 스크립트가 실제로 어답터에서 동작하는지, 의존이 닫혀 있는지는 판정하지 않는다(어답터 팔 env 형상이 본다). 매니페스트는 상류 소유라 드리프트 검사는 템플릿 모드에서만 — 어답터에선 INFO PASS(카나리아 실측: 자기 스캔 vs 상류 파일은 늘 다르다)',
  outcomes: ['PASS', 'CLARIFY'],
  failure_mode: '드리프트·부재 → CLARIFY(3, 비차단) + --write 안내',
};

/** 파일 텍스트 → 태그(순수). {kind: 'upstream-only'|'optional'|null, reason} */
function parseTag(txt) {
  const head = String(txt || '').split(/\r?\n/).slice(0, 12).join('\n'); // 선두 주석 블록만 — 본문 문자열 속 언급은 태그가 아니다([ADR-19])
  const m = head.match(TAG_RE);
  return m ? { kind: m[1], reason: (m[2] || '').trim() } : { kind: null, reason: '' };
}

/** 파일명 목록 + 태그 맵 → 매니페스트(순수). files: ['scripts/x.js', …], tags: {rel → kind|null} */
function build(files, tags) {
  const js = files.filter(f => /^scripts\/[^/]+\.js$/.test(f)).sort();
  const kindOf = rel => {
    const base = rel.replace(/\.test\.js$/, '.js');
    return tags[base] || null; // 테스트는 본체의 분류를 따른다
  };
  const upstreamOnly = js.filter(f => kindOf(f) === 'upstream-only');
  const optional = js.filter(f => kindOf(f) === 'optional');
  const shipped = js.filter(f => kindOf(f) !== 'upstream-only');
  if (!shipped.includes(MANIFEST)) shipped.push(MANIFEST);
  return { shipped: shipped.sort(), upstreamOnly, optional };
}

function render(manifest) {
  return JSON.stringify({ _comment: '생성 뷰 — node scripts/ship-manifest.js --write ([PRO-24] ①(c), [TOOL-34]). 손으로 고치지 않는다.', ...manifest }, null, 2) + '\n';
}

function scan(root = path.resolve(__dirname, '..')) {
  let names = [];
  try { names = fs.readdirSync(path.join(root, 'scripts')).filter(f => f.endsWith('.js')); } catch { names = []; }
  const files = names.map(f => `scripts/${f}`);
  const tags = {};
  for (const f of files) {
    if (f.endsWith('.test.js')) continue;
    try { tags[f] = parseTag(fs.readFileSync(path.join(root, f), 'utf8')).kind; } catch { tags[f] = null; }
  }
  return build(files, tags);
}

/** 매니페스트 읽기(없으면 null — 부재는 "규칙 폴백"이지 빈 화이트리스트가 아니다). 텍스트 입력 변형은 parseManifest. */
function parseManifest(txt) {
  try {
    const j = JSON.parse(String(txt));
    if (!j || !Array.isArray(j.shipped)) return null;
    return { shipped: j.shipped.map(String), upstreamOnly: Array.isArray(j.upstreamOnly) ? j.upstreamOnly.map(String) : [], optional: Array.isArray(j.optional) ? j.optional.map(String) : [] };
  } catch { return null; }
}
function readManifest(root = path.resolve(__dirname, '..')) {
  try { return parseManifest(fs.readFileSync(path.join(root, MANIFEST), 'utf8')); } catch { return null; }
}

/** 열 0 의 무조건 `require('./x')` 만 — try 안의 조건부 require 는 부재를 감수하는 명시적 선택이라 제외. 결과는 `scripts/x.js`. */
function topLevelRequires(txt) {
  const out = [];
  const re = /^(?:(?:const|let|var)\s+(?:\{[^}\n]*\}|[\w$]+)\s*=\s*)?require\('\.\/([\w.-]+?)(?:\.js)?'\)/gm;
  const src = String(txt).replace(/\r\n/g, '\n');
  let m;
  while ((m = re.exec(src))) { const p = `scripts/${m[1]}.js`; if (!out.includes(p)) out.push(p); }
  return out;
}

/** 열 0 require 의 **심볼**(순수): [{dep, symbols}] — 구조 분해 `{ a, b: c }` 는 export 키 [a, b], 기본 require 는 null(판별 불가). 같은 모듈은 병합. */
function requireSymbols(txt) {
  const out = [];
  const re = /^(?:(?:const|let|var)\s+(?:\{([^}\n]*)\}|[\w$]+)\s*=\s*)?require\('\.\/([\w.-]+?)(?:\.js)?'\)/gm;
  const src = String(txt).replace(/\r\n/g, '\n');
  let m;
  while ((m = re.exec(src))) {
    const dep = `scripts/${m[2]}.js`;
    const syms = m[1] == null ? null : m[1].split(',').map(x => x.trim()).filter(Boolean).map(x => x.split(':')[0].trim()).filter(x => /^[\w$]+$/.test(x));
    const hit = out.find(o => o.dep === dep);
    if (!hit) out.push({ dep, symbols: syms });
    else if (syms && hit.symbols) for (const s of syms) if (!hit.symbols.includes(s)) hit.symbols.push(s);
    else if (syms && !hit.symbols) hit.symbols = syms;
  }
  return out;
}

/** 파일의 export 키(순수): `module.exports = { a, b: c, ...x }` 의 키 + `module.exports.k =`/`exports.k =`. module.exports 가 없으면 null(판별 불가). */
function exportKeys(txt) {
  const src = String(txt).replace(/\r\n/g, '\n');
  const keys = [];
  const obj = src.match(/module\.exports\s*=\s*\{([\s\S]*?)\};/);
  if (obj) for (const part of obj[1].split(',')) { const k = part.trim(); if (!k || k.startsWith('...')) continue; const name = k.split(':')[0].trim(); if (/^[\w$]+$/.test(name) && !keys.includes(name)) keys.push(name); }
  for (const m of src.matchAll(/^(?:module\.)?exports\.([\w$]+)\s*=/gm)) if (!keys.includes(m[1])) keys.push(m[1]);
  if (!obj && !keys.length) return null;
  return new Set(keys);
}

/** 배송 파일이 상류 전용 모듈을 무조건 require 하면 어답터에서 MODULE_NOT_FOUND 다(어답터 A 실측: lineage-tree.test → fetch-eval). [{file, dep}]. */
function requireLeaks(root, manifest = scan(root)) {
  const uo = new Set(manifest.upstreamOnly);
  const leaks = [];
  for (const f of manifest.shipped) {
    if (!f.endsWith('.js')) continue;
    let txt; try { txt = fs.readFileSync(path.join(root, f), 'utf8'); } catch { continue; }
    for (const dep of topLevelRequires(txt)) if (uo.has(dep)) leaks.push({ file: f, dep });
  }
  return leaks;
}

function run(argv = process.argv.slice(2), root = path.resolve(__dirname, '..')) {
  const m = scan(root);
  const expected = render(m);
  if (argv.includes('--json')) { console.log(JSON.stringify(m, null, 2)); return OUTCOME.PASS; }
  // 어답터([ADR-30] 모드 판별): 매니페스트는 상류가 생성해 배송한다 — 어답터의 자기 스캔(로컬 스크립트·남은 상류 전용 사본)과 비교하면 영구 드리프트가 된다.
  if (!isTemplateRepo(root)) {
    const have = readManifest(root);
    console.log(`ship-manifest: 어답터 모드 — 상류 매니페스트 ${have ? `수신(배송 ${have.shipped.length} · 상류 전용 ${have.upstreamOnly.length})` : '미수신(template-update --apply 로 받는다)'} · 드리프트 검사는 상류 몫(INFO).`);
    return OUTCOME.PASS;
  }
  const abs = path.join(root, MANIFEST);
  let current = null;
  try { current = fs.readFileSync(abs, 'utf8'); } catch { current = null; }
  if (argv.includes('--write')) {
    if (current !== expected) { fs.writeFileSync(abs, expected); console.log(`ship-manifest: ${MANIFEST} 재생성 — 배송 ${m.shipped.length} · 상류 전용 ${m.upstreamOnly.length} · 선택 ${m.optional.length}.`); }
    else console.log('ship-manifest: 이미 최신.');
    return OUTCOME.PASS;
  }
  const leaks = requireLeaks(root, m);
  if (leaks.length) {
    console.error(`ship-manifest: 배송 파일이 상류 전용 모듈을 무조건 require 한다 — 어답터에서 MODULE_NOT_FOUND. try 로 감싸(조건부) 검사를 건너뛰게 하거나 모듈을 배송하라:\n${leaks.map(l => `  ${l.file} → ${l.dep}`).join('\n')}`);
    return OUTCOME.CLARIFY;
  }
  if (current == null) { console.error(`ship-manifest: ${MANIFEST} 없음 — \`node scripts/ship-manifest.js --write\` 로 생성하라.`); return OUTCOME.CLARIFY; }
  if (current.replace(/\r\n/g, '\n') !== expected) { console.error('ship-manifest: 드리프트 — 태그·파일 목록과 매니페스트가 다르다. `node scripts/ship-manifest.js --write` 후 커밋에 포함하라.'); return OUTCOME.CLARIFY; }
  console.log(`ship-manifest 통과: 배송 ${m.shipped.length} · 상류 전용 ${m.upstreamOnly.length} · 선택 ${m.optional.length}, 매니페스트 동기화됨.`);
  return OUTCOME.PASS;
}

module.exports = { MANIFEST, TAG_RE, parseTag, build, render, scan, parseManifest, readManifest, topLevelRequires, requireSymbols, exportKeys, requireLeaks, run, CONTRACT };

if (require.main === module) process.exit(withContract(CONTRACT, argv => run(argv))());
