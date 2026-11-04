#!/usr/bin/env node
// scripts/label.js
// 파생 라벨([PRO-26] ④ v0.2) — ID 만 단독으로 나오는 자리(next.md 작업대 · list_docs)에 사람이 읽을 토큰을 붙인다: `[WO-27a-1 · prereq_upstream]`.
//
// 선언이 아니라 **파생**이다(관리 비용 0): 자기 문서의 slug 첫 1~2 토큰. 비었으면 직계 부모의 라벨. `mnemonic:` frontmatter 는 **선택적 override** 로
// 어디서나(루트·중간·우산 WO) 허용되며, 상속 경로 = frontmatter 부모(`plan:`·`parent:`) → ID 산술 조상([PRO-27] ③). 레거시 독립 채번 구간
// (`arithmetic:false`)은 산술 상속을 하지 않는다 — 냉독 반례: 무관한 문서의 숫자 루트 라벨이 **거짓 라벨**이 된다(처음 읽는 모델에게 틀린 라벨은
// 없는 것보다 해롭다). 파일명이 이미 보이는 자리(upward-fetch·blast-radius·디렉터리)에는 넣지 않는다. 유일성 강제 없음.
//
// 실행: node scripts/label.js [ID …] [--json]   (인자 없으면 전체 표 — 루트별 니모닉 표의 생성 뷰, 손표 금지)
const path = require('path');
const { buildIndex } = require('./zfs_index');
const { parseId, ancestorChain } = require('./zfs_util');

const STOP = new Set(['example', 'examples', 'dummy', 'sample', 'test', 'the', 'a', 'an', 'of']);
const MNEMONIC_RE = /^[a-z0-9][a-z0-9_-]{1,15}$/;
const keyOf = d => `${d.domain}-${d.id}`;

/** slug → 라벨 토큰(순수): stopword 를 걷고 첫 2 토큰을 `_` 로. 없으면 null. */
function slugLabel(slug) {
  const toks = String(slug || '').split('_').filter(t => t && !STOP.has(t));
  return toks.length ? toks.slice(0, 2).join('_') : null;
}

/**
 * 라벨 파생(순수). 우선순위: ① 자기 mnemonic ② 선언 부모 체인의 mnemonic(가까운 순) ③ 산술 조상의 mnemonic(arithmetic 적용 시, 가까운 순 — 같은 도메인 우선)
 * ④ 자기 slug ⑤ 직계 부모(선언 → 산술) 의 slug. 반환 {label, source}.
 */
function deriveLabel(doc, index) {
  if (!doc) return { label: null, source: null };
  // 같은 DOMAIN-ID 가 둘 이상(중복 — 린터가 REJECT 하지만 뷰는 죽지 않는다)이어도 전부 본다 — Map 의 마지막 승리로 mnemonic 을 잃지 않게.
  const groups = new Map();
  for (const d of index) { const k = keyOf(d); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(d); }
  const mn = d => (d && d.mnemonic && MNEMONIC_RE.test(d.mnemonic) ? d.mnemonic : null);
  if (mn(doc)) return { label: mn(doc), source: 'mnemonic' };
  // ② 선언 부모 폐포(BFS, 순환 가드)
  const seen = new Set([keyOf(doc)]);
  const queue = [...(doc.parents || [])];
  const declaredChain = [];
  while (queue.length) {
    const k = queue.shift();
    if (seen.has(k)) continue;
    seen.add(k);
    for (const p of groups.get(k) || []) { declaredChain.push(p); queue.push(...(p.parents || [])); }
  }
  for (const p of declaredChain) if (mn(p)) return { label: mn(p), source: `mnemonic:${keyOf(p)}` };
  // ③ 산술 조상(레거시 독립 채번 구간은 금지 — 도메인 횡단 거짓 라벨)
  const arithmetic = doc.arithmetic !== false;
  const arithAncestors = arithmetic ? ancestorChain(doc.id).slice(1) : [];
  for (const aid of arithAncestors) {
    const cands = index.filter(d => d.id === aid && d !== doc).sort((a, b) => (a.domain === doc.domain ? -1 : 0) - (b.domain === doc.domain ? -1 : 0));
    for (const c of cands) if (mn(c)) return { label: mn(c), source: `mnemonic:${keyOf(c)}` };
  }
  // ④ 자기 slug
  const own = slugLabel(doc.slug);
  if (own) return { label: own, source: 'slug' };
  // ⑤ 직계 부모 slug: 선언 부모 → 산술 부모(같은 도메인 우선)
  const direct = declaredChain[0] || (arithAncestors.length ? index.filter(d => d.id === arithAncestors[0] && d !== doc).sort((a, b) => (a.domain === doc.domain ? -1 : 0) - (b.domain === doc.domain ? -1 : 0))[0] : null);
  const ps = direct ? slugLabel(direct.slug) : null;
  return ps ? { label: ps, source: `parent:${keyOf(direct)}` } : { label: null, source: null };
}

/** 색인 전체에 라벨 부여(순수) — 뷰가 쓰는 Map(DOMAIN-ID → label). */
function labelMap(index) {
  const m = new Map();
  for (const d of index) m.set(keyOf(d), deriveLabel(d, index).label);
  return m;
}

/** 렌더(순수): `[WO-27a-1 · label]` — 라벨 없으면 `[WO-27a-1]`. */
function renderId(domain, id, label) { return label ? `[${domain}-${id} · ${label}]` : `[${domain}-${id}]`; }

function run(argv = process.argv.slice(2), root = path.resolve(__dirname, '..')) {
  const json = argv.includes('--json');
  const index = buildIndex(root);
  const ids = argv.filter(a => !a.startsWith('--'));
  let docs = index;
  if (ids.length) {
    docs = [];
    for (const a of ids) {
      const id = parseId(a);
      const dom = (a.match(/^([A-Z]{2,6})-/) || [])[1] || null;
      const hits = index.filter(d => d.id === id && (!dom || d.domain === dom));
      if (!hits.length) console.error(`label: 색인에 없음 — ${a}`);
      docs.push(...hits);
    }
  }
  const rows = docs.map(d => ({ key: keyOf(d), ...deriveLabel(d, index), file: d.file })).sort((a, b) => a.key.localeCompare(b.key));
  if (json) { console.log(JSON.stringify(rows, null, 2)); return 0; }
  console.log(`# 파생 라벨([PRO-26] ④) — ${rows.length}건 (mnemonic override ${rows.filter(r => r.source && r.source.startsWith('mnemonic')).length})\n`);
  for (const r of rows) console.log(`  ${renderId(...r.key.split(/-(.+)/).slice(0, 2), r.label).padEnd(44)} ${r.source || '—'}`);
  return 0;
}

module.exports = { slugLabel, deriveLabel, labelMap, renderId, run, STOP, MNEMONIC_RE };

if (require.main === module) process.exit(run());
