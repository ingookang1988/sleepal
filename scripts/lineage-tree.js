#!/usr/bin/env node
// scripts/lineage-tree.js
// 계보 트리 렌더러 — 평면 전체를 루만 계보 포레스트로 그려 자기완결 HTML 1장으로 낸다. [TOOL-24]
//
// 스파이크 판정(2026-08-18)에서 승격된 유일한 시각화다: 첫 렌더가 CLI 23세션이 못 드러낸
// 구조 사실(계수 도메인의 좌표 앨리어싱, [ADR-25])을 즉시 냈다. 값은 큰/낯선 평면에서의
// 방향 잡기 — 이 템플릿의 실사용자는 어답터 레포를 운영하는 에이전트이므로,
// 도메인 목록·status 어휘·평면 규모를 **가정하지 않는다**:
//   - 색은 검증 팔레트 8슬롯을 문서 수 내림차순으로 배정(도메인 이름 하드코딩 0), 초과는 중립
//   - status·tier 부재를 무가정 처리(fetch-eval의 101노드 적대 평면이 회귀 테스트로 고정)
//   - 상태 필터는 평면에 실존하는 status에서 도출 — status가 없는 평면엔 필터가 안 뜬다
//   - 레이아웃은 데이터 모양을 따른다: 구조 있는 노드(자식 또는 복수 문서)는 트리,
//     단독 노드는 카탈로그 그리드로 분리 — 도메인이 아니라 *모양*으로 분류
// 새 계산 금지 — zfs_index.buildIndex + zfs_util.ancestorChain + query.LOCKED 소비만.
// read-only 코어(render까지 FS 접근 0) · zero-dep(인라인 CSS/JS, CDN 0).
// 산출물은 gitignore(lineage-tree.html).
//
// 실행: node scripts/lineage-tree.js [--json] [--out <path>]
const fs = require('fs');
const path = require('path');
const { buildIndex } = require('./zfs_index');
const { ancestorChain } = require('./zfs_util');
const { LOCKED } = require('./query');

// dataviz 검증 팔레트(light 8슬롯, CVD 검증된 고정 순서). 슬롯 순서는 안전 장치라 재배열 금지 —
// 도메인 배정만 데이터(빈도)에서 도출한다. 8도메인 초과는 중립(칩이 텍스트를 지니므로 정보 손실 0).
const SLOTS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
const NEUTRAL = '#6b7280';

/** status·slug 등 frontmatter 유래 문자열 이스케이프.
 *  (id·domain은 ZFS 정규식이 문자 집합을 닫아둬 인젝션 표면이 없다 — 카드 참조.) */
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 도메인 → 색 배정(순수·결정적): 문서 수 내림차순, 동수는 알파벳. 8초과는 중립.
 *  빈도순인 이유: 이 도구는 세션 간 색 기억이 아니라 한 화면 안의 스캔이 목적이다. */
function assignColors(index) {
  const count = {};
  for (const d of index) count[d.domain] = (count[d.domain] || 0) + 1;
  const ranked = Object.keys(count).sort((a, b) => count[b] - count[a] || a.localeCompare(b));
  const map = {};
  ranked.forEach((dom, i) => { map[dom] = i < SLOTS.length ? SLOTS[i] : NEUTRAL; });
  return map;
}

/** 색인 → 계보 포레스트(순수). 부모는 **최근접 실존 조상** — 중간 세대가 비어도 계보에 붙인다.
 *  (바로 위 부모만 보면 10a 부재 시 10a-1 이 루트로 승격되는데, 그건 blast-radius 의
 *   isDescendant 판정과 어긋난다 — 트리가 평면 자신의 계보 의미론을 숨기면 안 된다.) */
function forest(index) {
  const byId = new Map();
  for (const d of index) {
    if (!byId.has(d.id)) byId.set(d.id, { id: d.id, docs: [], kids: [] });
    byId.get(d.id).docs.push(d);
  }
  const roots = [];
  for (const node of byId.values()) {
    const parentId = ancestorChain(node.id).slice(1).find(id => byId.has(id));
    if (parentId) byId.get(parentId).kids.push(node);
    else roots.push(node);
  }
  const cmp = (a, b) => a.id.localeCompare(b.id);
  roots.sort(cmp);
  for (const n of byId.values()) n.kids.sort(cmp);
  return roots;
}

/** 포레스트 → 행 목록(깊이 우선, 순수). --json 및 테스트용. */
function rows(roots) {
  const out = [];
  const walk = (n, d) => { out.push({ node: n, depth: d }); n.kids.forEach(k => walk(k, d + 1)); };
  roots.forEach(r => walk(r, 0));
  return out;
}

/** 문서 1개 → 칩+슬러그+상태 마크업(순수). */
function docSpan(d, colors) {
  const locked = LOCKED.has(d.status);
  const status = d.status
    ? `<span class="st${locked ? ' lock' : ''}">${locked ? '\u{1F512} ' : ''}${esc(d.status)}</span>`
    : '';
  return `<span class="doc" data-st="${esc(d.status || '')}" title="${esc(d.file)}">`
    + `<span class="chip" style="--c:${colors[d.domain]}">${d.domain}</span>`
    + `<span class="slug">${esc(d.slug || d.file)}</span>${status}</span>`;
}

/** 노드 1개 → 트리 마크업(순수·재귀). 자식 있으면 <details> 접기. */
function nodeHtml(node, colors) {
  const docs = `<span class="docs">${node.docs.map(d => docSpan(d, colors)).join('')}</span>`;
  if (!node.kids.length) return `<div class="row"><span class="nid">${node.id}</span>${docs}</div>`;
  return `<details open><summary><span class="nid">${node.id}</span>${docs}</summary>`
    + `<div class="kids">${node.kids.map(k => nodeHtml(k, colors)).join('')}</div></details>`;
}

/** 평면에 실존하는 status → 필터 행(순수). status가 하나도 없으면 빈 문자열(무가정). */
function filterHtml(index) {
  const count = {};
  let missing = 0;
  for (const d of index) { if (d.status) count[d.status] = (count[d.status] || 0) + 1; else missing++; }
  const sts = Object.keys(count).sort((a, b) => count[b] - count[a] || a.localeCompare(b));
  if (!sts.length) return '';
  const box = (key, label, n) =>
    `<label class="fbox"><input type="checkbox" checked data-st="${esc(key)}"> ${esc(label)} <span class="fn">${n}</span></label>`;
  return `<div class="flt">${sts.map(s => box(s, s, count[s])).join('')}${missing ? box('', '(없음)', missing) : ''}</div>`;
}

/** 색인 → 평면 뷰 본문 조각(순수). 범례+필터+트리/카탈로그 2절 — 단독 페이지와 대시보드가 공유.
 *  (로직 1벌 표면 N개 — query.js 와 같은 원칙. 조각에는 <style>/<script> 가 없다:
 *   호스트 페이지가 PLANE_CSS·FILTER_JS 를 한 번만 싣는다.) */
function planeBody(index) {
  const colors = assignColors(index);
  const roots = forest(index);
  const trees = roots.filter(n => n.kids.length || n.docs.length > 1);
  const solo = roots.filter(n => !n.kids.length && n.docs.length === 1);
  const legend = Object.entries(colors).map(([d, c]) => `<span class="chip" style="--c:${c}">${d}</span>`).join('');
  return `<div class="meta">${index.length} docs · ${roots.length} lineage nodes (${trees.length} trees · ${solo.length} solo) · ${Object.keys(colors).length} domains</div>
  <div class="legend">${legend}</div>
  ${filterHtml(index)}
<section>
  <h2>계보 트리 — 구조가 있는 노드</h2>
  ${trees.map(n => nodeHtml(n, colors)).join('\n')}
</section>
<section>
  <h2>단독 노드 — 자식·형제 문서 없음 (카탈로그)</h2>
  <div class="solo-grid">${solo.map(n => nodeHtml(n, colors)).join('\n')}</div>
</section>`;
}

/** 색인 → 자기완결 HTML(순수 — FS 접근 없음). */
function render(index, { title = 'plane' } = {}) {
  return `<!doctype html>
<meta charset="utf-8">
<title>lineage — ${esc(title)}</title>
<style>${PLANE_CSS}</style>
<header>
  <h1>${esc(title)} — 계보 트리</h1>
</header>
<div class="plane">${planeBody(index)}</div>
<script>${FILTER_JS}</script>
`;
}

const PLANE_CSS = `
  :root { --ink:#1a1a1a; --muted:#6b7280; --faint:#9ca3af; --line:#e5e7eb; --bg:#fff; }
  body { margin:0; background:var(--bg); color:var(--ink);
         font: 13px/1.45 ui-monospace, Consolas, monospace; }
  header { padding:18px 24px 10px; border-bottom:1px solid var(--line); }
  h1 { font-size:15px; margin:0 0 6px; font-weight:600; }
  .meta { color:var(--muted); font-size:12px; }
  .legend { margin-top:8px; display:flex; flex-wrap:wrap; gap:4px; }
  .flt { margin-top:10px; display:flex; flex-wrap:wrap; gap:4px 12px; font-size:12px; }
  .fbox { color:var(--muted); cursor:pointer; user-select:none; }
  .fbox input { accent-color:var(--ink); vertical-align:-2px; }
  .fn { color:var(--faint); font-size:11px; }
  section { padding:14px 24px; }
  h2 { font-size:11px; font-weight:600; color:var(--faint); text-transform:uppercase;
       letter-spacing:.08em; margin:0 0 8px; }
  .row, summary { display:flex; align-items:baseline; gap:8px; flex-wrap:wrap; padding:3px 0; }
  summary { cursor:pointer; list-style:none; }
  summary::before { content:'▾'; color:var(--faint); width:10px; flex:none; }
  details:not([open]) > summary::before { content:'▸'; }
  .row { padding-left:18px; }
  .kids { margin-left:14px; padding-left:12px; border-left:1px solid var(--line); }
  .nid { font-weight:700; flex:none; }
  .docs { display:flex; flex-wrap:wrap; gap:2px 14px; }
  .doc { white-space:nowrap; }
  .doc[hidden] { display:none; }
  .chip { display:inline-block; padding:0 6px; border-radius:3px; font-size:10.5px; font-weight:600;
          color:var(--c); background:color-mix(in srgb, var(--c) 12%, white);
          border:1px solid color-mix(in srgb, var(--c) 35%, white); margin-right:5px; }
  .slug { color:var(--ink); }
  .st { color:var(--faint); font-size:11px; margin-left:5px; }
  .st.lock { color:#b42318; font-weight:600; }
  .solo-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:1px 20px; }
  .solo-grid .row { padding-left:0; }
  .solo-grid .nid { font-weight:400; color:var(--muted); min-width:34px; }
  .plane > .meta, .plane > .legend, .plane > .flt { margin: 6px 24px 0; }
`;

// 상태 필터 — 어휘는 렌더 시 데이터에서 도출됐고, 여기선 체크 상태만 반영한다.
const FILTER_JS = `
(function () {
  const inputs = document.querySelectorAll('.flt input');
  if (!inputs.length) return;
  function apply() {
    const off = new Set();
    inputs.forEach(i => { if (!i.checked) off.add(i.dataset.st); });
    document.querySelectorAll('.doc').forEach(el => { el.hidden = off.has(el.dataset.st); });
    // 보이는 문서가 자신·자손 어디에도 없는 행은 통째로 숨긴다(구조 골격만 남는 것 방지).
    document.querySelectorAll('section .row, section details').forEach(el => {
      el.hidden = !el.querySelector('.doc:not([hidden])');
    });
  }
  inputs.forEach(i => i.addEventListener('change', apply));
})();
`;

module.exports = { assignColors, forest, rows, docSpan, filterHtml, planeBody, render, PLANE_CSS, FILTER_JS, SLOTS, NEUTRAL };

if (require.main === module) {
  const args = process.argv.slice(2);
  const root = path.resolve(__dirname, '..');
  const index = buildIndex(root);
  if (args.includes('--json')) { console.log(JSON.stringify(forest(index), null, 2)); process.exit(0); }
  const oi = args.indexOf('--out');
  const out = oi >= 0 && args[oi + 1] ? args[oi + 1] : path.join(root, 'lineage-tree.html');
  fs.writeFileSync(out, render(index, { title: path.basename(root) }));
  console.error(`계보 트리: ${index.length}문서 → ${out}`);
}
