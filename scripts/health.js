#!/usr/bin/env node
// scripts/health.js
// 하네스 자가 건강진단 — "조견표의 코드화". 게이트 상태 + 구조 지표를 자동 산출한다.
// read-only·zero-dep. 실행: node scripts/health.js [--json]
// (true A/B eval은 템플릿 단독으론 불가 — 대신 *자기 준수도*를 지속 측정한다.)
const fs = require('fs');
const path = require('path');
const { VALID_DOMAINS } = require('./zfs_util');
const { buildIndex } = require('./zfs_index');
const { lint } = require('./zfs-linter');
const { findViolations: historyViolationsOf, findClarifications: historyClarificationsOf } = require('./history-linter');
// 누설 가드는 **템플릿 전용 자산**이다 — `init --drop-template-bits` 가 삭제한다(init.TEMPLATE_BITS).
// 하드 require 하면 문서화된 도입 경로를 따른 어답터에서 이 점수표가 통째로 크래시한다(실측).
let leakageGuard = null;
try { leakageGuard = require('./leakage-guard'); } catch { /* 어답터 — 게이트 해당 없음 */ }
const { walkFiles } = require('./fs_walk');
const { load: loadAdapter } = require('./adapter');
const { gather: gatherBrokenRefs } = require('./ref-linter');
const { gather: gatherBudget } = require('./context-budget');

const { contractEdges, normEnforcement, concernUsage, NORM_DOMAINS } = require('./query');
const { gather: gatherCards } = require('./tools-index');
const { extractRefs } = require('./ref-linter');
const { withContract } = require('./gate-contract');

const LOCKED = ['Verifying'];
const SIZE_CAP_KB = 30; // soft cap — 초과 시 분할/로테이션 권고

// 계약 선언([PRO-11] — [GRAM-12c] 꼴).
const CONTRACT = {
  gate: 'Health Scorecard Gate (health) — 집계',
  input: '각 게이트의 순수 함수 재호출 결과 + .union-stack/ 구조 지표(크기·참조·예산·잠금·sync·lessons·tier·effect surface·contract edges·norm enforcement)',
  predicate: '개별 게이트 FAIL 0건이면 건강. sync·lessons·tier 절은 판정 없는 관측 병치([PRO-11] §4 측도 금지)',
  scope: '자기 준수도만 잰다 — 하네스 효능(true A/B)은 eval/PROTOCOL.md 소관. 관측 절은 stale "판정"을 하지 않는다',
  outcomes: ['PASS', 'REJECT'],
  failure_mode: '게이트 FAIL 존재 시 REJECT(차단). WARN·INFO는 비차단 표면화',
};

// 동기화 관측 대상 평면([PRO-11] C3 — 최종 기입 시각과 ledger 증가분의 "병치"만, 점수 없음).
const SYNC_PLANES = [
  { name: 'gap', rel: '.union-stack/verification/derived/gap.md' },
  { name: 'state', rel: '.union-stack/verification/derived/state.md' },
  { name: 'evidence', rel: '.union-stack/verification/raw/evidence.md' },
  { name: 'live', rel: '.union-stack/feature/live.md' },
];
const { read: readLedger, isLedgerStore } = require('./ledger');
const LESSONS_DIR = '.union-stack/reference/lessons';

// 효과 표면(갭 분석 §3-C) — 비가역 외부 효과는 평면이 아니라 에이전트 설정의 문자열 allowlist가 다스린다.
// [ADR-08]의 논리는 "훅으로 *강제*하지 않는다"였지 "*관측*하지 않는다"가 아니었다. 그래서 게이트가 아니라 관측 1절이다.
const EFFECT_SETTINGS = ['.claude/settings.json', '.claude/settings.local.json'];

// 선두 HTML 주석을 건너뛰고 frontmatter 블록만 잡는다(zfs_index.readFront 와 같은 규칙).
const FRONTMATTER_RE = /^(?:\s|<!--[\s\S]*?-->)*---\r?\n([\s\S]*?)\r?\n---/;

/**
 * 소스에서 게이트 계약 필드를 **정적 파싱**한다(순수 — 실행하지 않는다).
 *
 * `require()` 로 `CONTRACT` 를 읽는 방법도 있으나(gate-contract.test.js 가 그렇게 한다), 여기서는
 * *발견된* 파일을 다루므로 부작용 위험이 있다 — 어답터 레포의 스크립트가 main 가드 없이 뭔가를
 * 실행할 수 있다. read-only 불변식을 지키려고 문자열 파싱을 택했고, 그래서 **깨지기 쉽다**:
 * 파싱 실패는 필드 누락으로 조용히 축약된다(오탐보다 미탐이 안전한 표시용 데이터).
 */
function parseContract(txt) {
  const m = String(txt || '').match(/const CONTRACT\s*=\s*\{([\s\S]*?)\n\};/);
  if (!m) return null;
  const body = m[1];
  const str = k => {
    const r = body.match(new RegExp('^\\s*' + k + ':\\s*([\'"])([\\s\\S]*?)\\1\\s*,?\\s*$', 'm'));
    return r ? r[2] : null;
  };
  const arr = k => {
    const r = body.match(new RegExp('^\\s*' + k + ':\\s*\\[(.*?)\\]', 'm'));
    return r ? r[1].split(',').map(x => x.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean) : [];
  };
  const out = { gate: str('gate'), input: str('input'), predicate: str('predicate'), scope: str('scope'), failure_mode: str('failure_mode'), outcomes: arr('outcomes') };
  return out.gate || out.predicate || out.scope ? out : null;
}

/** 본문에서 가장 늦은 YYYY-MM-DD를 뽑는다(순수). 없으면 null — "무기입"으로 표기된다. */
function lastDateIn(txt) {
  const ds = String(txt || '').match(/\b20\d{2}-\d{2}-\d{2}\b/g);
  return ds && ds.length ? ds.sort().pop() : null;
}

/** 순수 계산: 1차 지표 → 차원별 평가 리포트. (FS 비의존 → 테스트 용이) */
function computeHealth({ index, domainsDefined, guideCount, namingViolations, historyViolations, leakageViolations, oversize = [], brokenRefs = 0, budget = null, sync = null, lessons = null, effect = null, contracts = null, norms = null, adapter = null, historyClarifications = 0 }) {
  const used = new Set(index.map(d => d.domain));
  const unused = domainsDefined.filter(d => !used.has(d));
  const locked = index.filter(d => LOCKED.includes(d.status));
  const byDomain = {};
  index.forEach(d => { byDomain[d.domain] = (byDomain[d.domain] || 0) + 1; });

  const dims = [
    { name: 'naming gate', status: namingViolations === 0 ? 'OK' : 'FAIL', value: `${namingViolations} violations` },
    // CLARIFY 분(헤딩형 항목의 근거 미검출)은 FAIL 로 세지 않는다 — 표면화이지 차단이 아니다.
    // 이 note 가 "조용한 0"의 반대편이다: 형식이 달라 계수에서 빠지는 항목이 여기서 이름을 얻는다.
    { name: 'history gate', status: historyViolations === 0 ? 'OK' : 'FAIL', value: `${historyViolations} violations`,
      note: historyClarifications ? `CLARIFY ${historyClarifications} — 헤딩형 항목의 근거 미검출(비차단)` : '' },
    // null = 게이트 해당 없음(어답터: 실콘텐츠가 정상이므로 트립와이어의 의미가 반전된다).
    // OK 로 위조하지도, FAIL 로 겁주지도 않는다 — 관측 불가와 통과는 다른 사실이다([ADR-23] 문법).
    // `adapter.private` 는 같은 반전을 **가드가 남아 있는 어답터**에도 적용한다: 비공개 실콘텐츠
    // 레포에서 "더미 표시가 없다"는 결함이 아니라 정상이다. 강등은 여기(점수표의 판정)에서만 하고
    // leakage-guard 자체는 손대지 않는다 — 지금까지 어답터가 이 sync 파일을 직접 고쳐 온 자리다.
    leakageViolations === null
      ? { name: 'leakage gate', status: 'INFO', value: '해당 없음 — 템플릿 전용 게이트' }
      : adapter && adapter.private
        ? { name: 'leakage gate', status: 'INFO', value: `${leakageViolations} unmarked — private 어답터(강등)`,
            note: 'adapter.json private:true — 공개 템플릿 보호용 게이트라 비공개 레포에선 의미가 반전됨' }
        : { name: 'leakage gate', status: leakageViolations === 0 ? 'OK' : 'FAIL', value: `${leakageViolations} unmarked` },
    { name: 'domain utilization', status: unused.length > 6 ? 'WARN' : 'OK',
      value: `${used.size}/${domainsDefined.length} used`, note: unused.length ? `unused: ${unused.join(' ')}` : '' },
    { name: 'doc/guide ratio', status: 'INFO', value: `${index.length} ZFS docs / ${guideCount} guides` },
    // 문서와 행 저장소는 성장 법칙이 다르고 처방도 다르다 — 문서는 **분할**, append-only 행
    // 저장소는 **회전**([PRO-18]). 임계값은 그대로 두고 note 가 처방을 말한다: 해소 경로가 안
    // 보이는 경고는 계기가 아니라 배경 소음이 된다.
    { name: 'file size', status: oversize.length ? 'WARN' : 'OK',
      value: `${oversize.length} > ${SIZE_CAP_KB}KB`,
      note: oversize.map(o => `${o.file}:${o.kb}KB → ${o.rotatable ? '회전(archive_ledger/)' : 'ZFS 계보로 분할'}`).join(' ') },
    { name: 'ref integrity', status: 'INFO', value: `${brokenRefs} unresolved bracket refs (advisory)` },
    { name: 'context budget', status: budget && budget.over ? 'WARN' : 'OK',
      value: budget ? `${budget.total}/${budget.totalCap} tok bootstrap` : 'n/a',
      note: budget && budget.over ? budget.rows.filter(r => r.status === 'OVER').map(r => `${r.name}:${r.tokens}>${r.budget}`).join(' ') : '' },
    { name: 'lock exposure', status: locked.length ? 'WARN' : 'OK',
      value: `${locked.length} Verifying`, note: locked.map(l => `${l.domain}-${l.id}`).join(' ') },
  ];
  // 관측 절([PRO-11]·[PRO-12]) — 전부 INFO. 판정·점수를 만들지 않는다(측도 금지, [AXIOM-27] 취지).
  if (sync) {
    dims.push({ name: 'plane sync', status: 'INFO',
      value: `ledger ${sync.ledgerEntries} entries, last ${sync.ledgerLast || '무기입'}`,
      note: sync.planes.map(p => `${p.name}:${p.last || '무기입'}`).join(' ') });
  }
  if (lessons) {
    dims.push({ name: 'lessons lifecycle', status: 'INFO',
      value: `${lessons.total} LSN`,
      note: `status없음:${lessons.unmarked} 조건부(valid_reason):${lessons.conditional}` });
  }
  if (effect) {
    dims.push({ name: 'effect surface', status: 'INFO',
      value: effect.files.length
        ? `allow ${effect.allow} · deny ${effect.deny} · ask ${effect.ask} · wildcard ${effect.wildcard}`
        : '설정 파일 없음 — 관측 불가',
      note: effect.files.length
        ? Object.entries(effect.byTool).map(([t, n]) => `${t}:${n}`).join(' ') + '  ← ' + effect.files.join(' ')
        : '' });
  }
  if (contracts) {
    // [PRO-16] 채택·무결성 관측. 반증 조건("consumers 가 실계약에 안 달리면 폐기")을 볼 계기이자,
    // 오타 소비자가 잠금 보호를 조용히 무력화하는 것을 평면 전수로 잡는 자리다.
    const bits = [`계약 ${contracts.contracts}`, `선언 ${contracts.declaring}`, `간선 ${contracts.edges}`];
    if (contracts.unresolved.length) bits.push(`미해소 ${contracts.unresolved.length}`);
    if (contracts.redundant) bits.push(`무의미(동일계보) ${contracts.redundant}`);
    dims.push({ name: 'contract edges', status: 'INFO', value: bits.join(' · '),
      note: contracts.unresolved.map(u => `${u.ref}←${u.from}`).join(' ') });
  }
  if (norms) {
    // 당위 축 관측. [PHASE-02] E3 이 "의례 자발 수행률 0%"를 실측했으므로 산문뿐인 규범은
    // 이미 참으로 증명된 위험이다. 단 **인용 ≠ 집행** — 판정이 아니라 관측이다([ADR-07] 함정).
    const bits = [`규범 ${norms.total}`, `게이트 ${norms.gated}`, `인용만 ${norms.cited}`];
    if (norms.isolated) bits.push(`고립 ${norms.isolated}`);
    dims.push({ name: 'norm enforcement', status: 'INFO', value: bits.join(' · '),
      note: norms.norms.filter(n => n.grade !== 'gated').map(n => n.key).join(' ') });
  }
  const tiers = { draft: 0, reviewed: 0, ratified: 0, untagged: 0 };
  index.forEach(d => { tiers[d.tier && tiers[d.tier] !== undefined ? d.tier : 'untagged']++; });
  dims.push({ name: 'tier distribution', status: 'INFO',
    value: `draft:${tiers.draft} reviewed:${tiers.reviewed} ratified:${tiers.ratified} untagged:${tiers.untagged}` });
  const fails = dims.filter(d => d.status === 'FAIL').length;
  const warns = dims.filter(d => d.status === 'WARN').length;
  return { dims, byDomain, fails, warns, healthy: fails === 0 };
}

function countGuides(root) {
  let n = 0;
  walkFiles(root, '.union-stack', rel => { if (rel.endsWith('/_GUIDE.md')) n++; });
  return n;
}

function gather(root = path.resolve(__dirname, '..')) {
  const index = buildIndex(root);
  const namingViolations = lint(root).length;
  const adapter = loadAdapter(root);
  const hp = path.join(root, '.union-stack/project/HISTORY.md');
  const historyMd = fs.existsSync(hp) ? fs.readFileSync(hp, 'utf8') : '';
  const historyViolations = historyViolationsOf(historyMd).length;
  const historyClarifications = historyClarificationsOf(historyMd).length;
  const leakageViolations = leakageGuard
    ? leakageGuard.collectFiles(root)
        .filter(rel => !leakageGuard.isSanitized(rel, fs.readFileSync(path.join(root, rel), 'utf8'))).length
    : null;
  // 크기는 *전부* 수집하고 초과분만 게이트로 넘긴다. 상한 근접(append-only 원장 등)은
  // 불리언 게이트가 넘는 순간에만 말하므로, 헤드룸을 보려면 분포가 필요하다(대시보드 소비).
  const sizes = [];
  walkFiles(root, '.union-stack', rel => {
    if (!rel.endsWith('.md')) return;
    let kb = 0;
    try { kb = +(fs.statSync(path.join(root, rel)).size / 1024).toFixed(1); } catch { return; }
    sizes.push({ file: rel, kb });
  });
  sizes.sort((a, b) => b.kb - a.kb);
  const oversize = sizes.filter(s => s.kb > SIZE_CAP_KB)
    .map(s => ({ file: s.file, kb: Math.round(s.kb), rotatable: isLedgerStore(s.file) }));
  const brokenRefs = gatherBrokenRefs(root).length;
  const budget = gatherBudget(root);
  const sync = gatherSync(root);
  const contracts = contractEdges(index);
  const norms = normEnforcement(index, gatherEnforcers(root), gatherPlaneCites(root), gatherNormDocs(root, index));
  const r = computeHealth({
    index, domainsDefined: [...VALID_DOMAINS], guideCount: countGuides(root),
    namingViolations, historyViolations, historyClarifications, leakageViolations, oversize, brokenRefs, budget,
    sync, lessons: gatherLessons(root), effect: gatherEffectSurface(root), contracts, norms, adapter,
  });
  // 판정(dims) 외에 원자료도 함께 낸다 — 대시보드가 같은 수집을 두 번 하지 않도록(합성 원칙).
  return { ...r, sizes, sizeCapKb: SIZE_CAP_KB, sync, contracts, norms, adapter, concerns: concernUsage(index) };
}

/** 평면별 최종 기입 날짜 + ledger 항목 수를 모은다(관측만 — [PRO-11] C3). */
function gatherSync(root) {
  const readIf = rel => { try { return fs.readFileSync(path.join(root, rel), 'utf8'); } catch { return ''; } };
  const planes = SYNC_PLANES.map(p => ({ name: p.name, last: lastDateIn(readIf(p.rel)) }));
  const ledgerTxt = readLedger(root);   // 머리 + 회전본([PRO-18] §3-3)
  const ledgerEntries = new Set(ledgerTxt.match(/ADR-\d+/g) || []).size;
  return { planes, ledgerEntries, ledgerLast: lastDateIn(ledgerTxt) };
}

/**
 * 권한 규칙 목록 → 효과 표면 계수(순수). entriesByFile: {경로: {allow,deny,ask}}.
 * 의미 분류(어느 규칙이 위험한가)는 하지 않는다 — 규칙 목록 자체가 평면 밖이라 등급을 매길 근거가 없다.
 * 구조만 센다: 몇 개인가 · 도구별로 몇 개인가 · 몇 개가 와일드카드(prefix 매칭이라 경계가 흐린 것)인가.
 * 도구 이름은 **규칙에서 도출**한다 — 목록을 박으면 새 효과 표면(PowerShell·WebFetch…)이 조용히 누락된다.
 */
function computeEffectSurface(entriesByFile = {}) {
  const out = { files: [], allow: 0, deny: 0, ask: 0, wildcard: 0, byTool: {} };
  for (const [file, perms] of Object.entries(entriesByFile)) {
    out.files.push(file);
    for (const k of ['allow', 'deny', 'ask']) out[k] += (perms && perms[k] ? perms[k].length : 0);
    for (const rule of (perms && perms.allow) || []) {
      const m = String(rule).match(/^([A-Za-z_][A-Za-z_0-9]*)\(/);
      const tool = m ? m[1] : '(무형식)';
      out.byTool[tool] = (out.byTool[tool] || 0) + 1;
      if (String(rule).includes('*')) out.wildcard++;
    }
  }
  out.byTool = Object.fromEntries(Object.entries(out.byTool).sort((a, b) => b[1] - a[1]));
  return out;
}

/** 에이전트 설정의 권한 목록을 읽어 계수한다(관측만 — 판정·차단 없음). */
function gatherEffectSurface(root) {
  const byFile = {};
  for (const rel of EFFECT_SETTINGS) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) continue;
    try { byFile[rel] = (JSON.parse(fs.readFileSync(abs, 'utf8')) || {}).permissions || {}; }
    catch { byFile[rel] = {}; } // 파싱 실패도 관측 결과다 — 규칙 0으로 세고 파일명은 남긴다
  }
  return computeEffectSurface(byFile);
}

/**
 * 집행자 후보 수집 — 스캔 범위를 **TOOL 카드의 `impl:` 경로에서 도출**한다.
 * `scripts/` 를 고정하지 않는 이유: 어답터 레포는 실행 자산 위치가 다르다. 카드가 그 위치의
 * 정본이며 `tool-linter` 가 실존을 보장한다(새 규약을 만들지 않는다).
 *
 * 단 **카드가 가리킨 파일만 보면 과소계상한다** — 이 레포 실측상 게이트 9종 중 5종(leakage-guard·
 * permission-guard·ref-linter·history-linter·handoff-linter)은 TOOL 카드가 없다(카드는 *재사용 자산*
 * 카탈로그이지 게이트 목록이 아니다). 그래서 카드가 가리킨 **디렉터리**까지 훑는다 — 위치는 여전히
 * 데이터에서 도출되고, 그 안의 무엇을 볼지만 가정하지 않는다.
 */
function gatherEnforcers(root) {
  const dirs = new Set();
  for (const card of gatherCards(root)) {
    if (!card.impl || /^https?:/.test(card.impl)) continue; // 외부 도구는 파일이 없다
    const d = path.posix.dirname(String(card.impl).split('\\').join('/'));
    if (d && d !== '.') dirs.add(d);
  }
  const out = [];
  for (const dir of dirs) {
    walkFiles(root, dir, rel => {
      if (!/\.(js|mjs|cjs)$/.test(rel) || /\.test\./.test(rel)) return;
      let txt = '';
      try { txt = fs.readFileSync(path.join(root, rel), 'utf8'); } catch { return; }
      const mentions = [...new Set((txt.match(/(?:ARCH|INF)-[0-9][0-9a-z-]*/g) || []))];
      if (!mentions.length) return;
      out.push({ file: rel, isGate: /CONTRACT\s*=\s*\{/.test(txt), mentions, contract: parseContract(txt) });
    });
  }
  return out.sort((a, b) => a.file.localeCompare(b.file));
}

/** 평면 본문의 규범 브래킷 인용 수(`ref-linter.extractRefs` 재사용 — 새 파서를 만들지 않는다). */
function gatherPlaneCites(root) {
  const cites = {};
  walkFiles(root, '.union-stack', rel => {
    if (!rel.endsWith('.md')) return;
    let txt = '';
    try { txt = fs.readFileSync(path.join(root, rel), 'utf8'); } catch { return; }
    const seen = new Set();
    for (const r of extractRefs(txt)) {
      if (!NORM_DOMAINS.has(r.domain) || seen.has(r.raw)) continue;
      seen.add(r.raw); // 한 파일이 같은 규범을 여러 번 인용해도 "인용한 파일 1개"로 센다
      const e = cites[r.raw] || (cites[r.raw] = { count: 0, files: [] });
      e.count++;
      e.files.push(rel);
    }
  });
  return cites;
}

/** 규범 문서의 제목·절 구조·크기(관측만) — "이 규범이 무엇을 말하는가"를 파일 열지 않고 보게 한다. */
function gatherNormDocs(root, index) {
  const out = {};
  for (const d of index) {
    if (!NORM_DOMAINS.has(d.domain)) continue;
    let txt = '';
    try { txt = fs.readFileSync(path.join(root, d.file), 'utf8'); } catch { continue; }
    const fm = txt.match(FRONTMATTER_RE);
    const t = fm && fm[1].match(/^[ 	]*title:[ 	]*(.+?)[ 	]*$/m);
    out[`${d.domain}-${d.id}`] = {
      title: t ? t[1].replace(/^["']|["']$/g, '') : null,
      headings: (txt.match(/^##[ 	]+.+$/gm) || []).map(h => h.replace(/^##[ 	]+/, '').trim()),
      kb: +(Buffer.byteLength(txt, 'utf8') / 1024).toFixed(1),
    };
  }
  return out;
}

/** LSN frontmatter의 status·valid_reason 표면화([PRO-11] C2 축소형 — 기존 필드를 읽기만). */
function gatherLessons(root) {
  const out = { total: 0, unmarked: 0, conditional: 0 };
  walkFiles(root, LESSONS_DIR, rel => {
    if (!rel.endsWith('.md') || rel.endsWith('_GUIDE.md')) return;
    out.total++;
    let txt = '';
    try { txt = fs.readFileSync(path.join(root, rel), 'utf8'); } catch { return; }
    const fm = txt.match(/^(?:\s|<!--[\s\S]*?-->)*---\r?\n([\s\S]*?)\r?\n---/);
    const body = fm ? fm[1] : '';
    if (!/^\s*status:/m.test(body)) out.unmarked++;
    if (/^\s*valid_reason:/m.test(body)) out.conditional++;
  });
  return out;
}

function run(root) {
  const r = gather(root);
  if (process.argv.includes('--json')) { console.log(JSON.stringify(r, null, 2)); return r.fails ? 1 : 0; }
  console.log('# union-stack health\n');
  for (const d of r.dims) {
    const mark = d.status === 'OK' ? '✓' : d.status === 'FAIL' ? '✗' : d.status === 'WARN' ? '!' : '·';
    console.log(`  ${mark} ${d.name.padEnd(20)} ${d.status.padEnd(5)} ${d.value}${d.note ? '  (' + d.note + ')' : ''}`);
  }
  console.log(`\n도메인 분포: ${Object.entries(r.byDomain).map(([k, v]) => `${k}:${v}`).join(' ')}`);
  console.log(r.healthy ? '\n건강: 게이트 전부 통과.' : `\n건강: 게이트 ${r.fails}건 실패 — 확인 필요.`);
  return r.fails ? 1 : 0;
}

module.exports = { computeHealth, gather, gatherSync, gatherLessons, computeEffectSurface, gatherEffectSurface, parseContract, lastDateIn, CONTRACT };

if (require.main === module) process.exit(withContract(CONTRACT, () => run())());
