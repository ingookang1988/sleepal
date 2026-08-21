#!/usr/bin/env node
// scripts/fetch-eval.js
// E2 — 발견 메커니즘 검증. Upward Fetching이 *규모에서도* 옳은 문서만 끌어오는가?
//   precision: 끌어온 것 중 관련된 것의 비율(무관 계보·혼동 형제를 안 끌어오는가).
//   recall   : 관련된 것 중 끌어온 것의 비율(진짜 조상을 빠뜨리지 않는가).
//   bounding : 주입량이 평면 크기가 아니라 *계보 깊이*에 묶이는가(예산 준수).
// ground-truth는 *손으로 명세*(구현과 독립) — 그래야 query 로직을 자기 자신으로 검증하는 순환을 피한다.
// read-only·zero-dep. 실행: node scripts/fetch-eval.js [--json]
const { upwardFetch } = require('./query');

// --- 적대적 코어 평면: 혼동 형제(01a1 vs 01a10) + 무관 계보 B(02) ---
const CORE = [
  { domain: 'PLAN', id: '01',     file: 'PLAN-01' },     // 01a1-2의 조상 ✓
  { domain: 'MTG',  id: '01',     file: 'MTG-01' },      // 조상 ✓
  { domain: 'PLAN', id: '01a',    file: 'PLAN-01a' },    // 조상 ✓
  { domain: 'CON',  id: '01a',    file: 'CON-01a' },     // 조상 ✓(같은 id 다른 도메인)
  { domain: 'FLOW', id: '01a1',   file: 'FLOW-01a1' },   // 조상 ✓
  { domain: 'LSN',  id: '01a',    file: 'LSN-01a' },     // 같은 계보 교훈 ✓
  { domain: 'PLAN', id: '01a10',  file: 'PLAN-01a10' },  // 혼동 형제 — 조상 아님 ✗(precision 함정)
  { domain: 'LSN',  id: '01a10',  file: 'LSN-01a10' },   // 혼동 교훈 — 비계보 ✗
  { domain: 'PLAN', id: '02',     file: 'PLAN-02' },     // 무관 계보 B ✗
  { domain: 'FLOW', id: '02a',    file: 'FLOW-02a' },    // 무관 ✗
  { domain: 'LSN',  id: '02a',    file: 'LSN-02a' },     // 무관 ✗
];

// 손-명세 ground-truth: 타깃 01a1-2에 *진짜* 관련된 문서(조상 맥락 + 같은 계보 교훈).
// 구현(ancestorChain/isDescendant)을 안 쓰고 직접 적는다 — 독립 검증.
const TARGET = '01a1-2';
const EXPECTED = new Set([
  'PLAN-01', 'MTG-01', 'PLAN-01a', 'CON-01a', 'FLOW-01a1', // 조상 맥락
  'LSN-01a',                                               // 같은 계보 교훈
]); // 명시적 제외: PLAN-01a10, LSN-01a10(혼동 형제), 02* 전부(무관 계보)

/** 무관 계보로 평면을 N노드까지 패딩(규모 테스트). 코어와 절대 겹치지 않는 id(03+). */
function pad(extraLineages) {
  const out = [];
  for (let i = 0; i < extraLineages; i++) {
    const base = String(3 + i).padStart(2, '0'); // 03, 04, ...
    out.push({ domain: 'PLAN', id: base, file: `PLAN-${base}` });
    out.push({ domain: 'FLOW', id: `${base}a`, file: `FLOW-${base}a` });
    out.push({ domain: 'LSN', id: `${base}a`, file: `LSN-${base}a` });
  }
  return out;
}

function syntheticPlane(extraLineages = 0) {
  return [...CORE, ...pad(extraLineages)];
}

/** upwardFetch 결과를 ground-truth와 대조(순수). */
function evalFetch(target, index, expected) {
  const r = upwardFetch(target, index);
  const fetched = new Set([...r.context, ...r.lessons].map(d => `${d.domain}-${d.id}`));
  const hit = [...fetched].filter(x => expected.has(x)).length;
  const precision = fetched.size ? +(hit / fetched.size).toFixed(3) : 1;
  const recall = expected.size ? +(hit / expected.size).toFixed(3) : 1;
  const missed = [...expected].filter(x => !fetched.has(x));
  const leaked = [...fetched].filter(x => !expected.has(x));
  return { precision, recall, injectionCount: fetched.size, missed, leaked };
}

/** 평면 크기별 결과 산출(규모 무관 bounding 확인). */
function sweep(sizes = [0, 13, 30]) {
  return sizes.map(extra => {
    const index = syntheticPlane(extra);
    const res = evalFetch(TARGET, index, EXPECTED);
    return { planeNodes: index.length, ...res };
  });
}

function run() {
  const rows = sweep();
  if (process.argv.includes('--json')) { console.log(JSON.stringify(rows, null, 2)); }
  else {
    console.log('# union-stack fetch-eval (E2 발견 메커니즘 — 적대적 합성 평면, 손-명세 ground-truth)\n');
    console.log(`  타깃 ${TARGET} · 관련 문서 ${EXPECTED.size}개 (혼동 형제 01a10·무관 계보 02 제외)\n`);
    console.log('  평면노드  precision  recall  주입수  누락  유출');
    for (const r of rows) {
      console.log(`   ${String(r.planeNodes).padStart(5)}     ${r.precision.toFixed(2)}      ${r.recall.toFixed(2)}    ${String(r.injectionCount).padStart(4)}    ${r.missed.length}     ${r.leaked.length}`);
    }
    const bounded = new Set(rows.map(r => r.injectionCount)).size === 1;
    const clean = rows.every(r => r.precision === 1 && r.recall === 1);
    console.log(`\n  ${clean ? '✓' : '✗'} 평면이 13→${rows[rows.length - 1].planeNodes}노드로 커져도 precision·recall = 1.00 (무관·혼동 0 유출)`);
    console.log(`  ${bounded ? '✓' : '✗'} 주입수 불변(${rows[0].injectionCount}) — 평면 크기가 아니라 *계보 깊이*에 묶임(예산 준수)`);
  }
  const ok = rows.every(r => r.precision === 1 && r.recall === 1) && new Set(rows.map(r => r.injectionCount)).size === 1;
  return ok ? 0 : 1;
}

module.exports = { syntheticPlane, evalFetch, sweep, CORE, EXPECTED, TARGET };

if (require.main === module) process.exit(run());
