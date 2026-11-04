// scripts/section-fetch.js
// 부분 인출([PRO-28] ③ · [WO-28a-3]) — Upward Fetching 이 모은 부모 문서를 **절 단위**로 내준다.
// 회신 2곳 실측: 에이전트는 어차피 특정 절만 읽는데, 도구가 경로만 주니 40~80KB 문서를 통째로 연다(토큰 최다 지출처).
// 하는 것: ① frontmatter 를 떼고 H2 로 분할 ② 계약 절(adapter.json sections 로 해소: 목표·수용 기준·증거) + `--sections <이름,…>`(정규화 뒤 접두) 만 본문 주입
//         ③ 나머지는 "생략 N절 · ~M tok: 헤딩(~tok) …" 한 줄(목차 — 다음 인출의 좌표) ④ 절 경계 없는 문서는 머리 HEAD_BUDGET(1,500 tok)까지만.
// 하지 않는 것: 문장 생성·요약([ADR-12]) — 절 경계로만 자른다. 기본값(upward-fetch 의 경로 목록)은 바꾸지 않는다([ADR-23] 관측 먼저).
const fs = require('fs');
const path = require('path');
const { resolveSection, normalizeHeading } = require('./adapter');
const { estimateTokens } = require('./context-budget');

const HEAD_BUDGET = 1500;   // 절 없는 문서의 머리 상한 — HANDOFF·WO 와 같은 양자(세 번째 숫자를 만들지 않는다)
const OMIT_LIST_CAP = 8;    // 생략 목차에 보이는 헤딩 수 — 센서스 DIST_CAP 과 같은 규약

/** frontmatter 제거(순수) — 선두 주석·`---` 블록. */
function stripFrontmatter(txt) {
  return String(txt || '').replace(/^(?:\s|<!--[\s\S]*?-->)*---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
}

/** H2 분할(순수): {head, sections:[{heading, body, tokens}]}. ### 은 상위 절 본문에 속한다. */
function splitSections(txt) {
  const src = stripFrontmatter(txt).replace(/\r\n/g, '\n');
  const lines = src.split('\n');
  const sections = [];
  let head = [], cur = null;
  for (const line of lines) {
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m) { cur = { heading: m[1], lines: [] }; sections.push(cur); continue; }
    if (cur) cur.lines.push(line); else head.push(line);
  }
  return {
    head: head.join('\n').trim(),
    sections: sections.map(s => { const body = s.lines.join('\n').trim(); return { heading: s.heading, body, tokens: estimateTokens(`## ${s.heading}\n${body}`) }; }),
  };
}

/** 선택(순수): 계약 의미로 해소되는 절 + 추가 이름(정규화 뒤 접두). 반환 {picked, omitted}. */
function selectSections(sections, cfg, extra = []) {
  const names = (extra || []).map(normalizeHeading).filter(Boolean);
  const want = s => !!resolveSection(cfg, s.heading) || names.some(n => normalizeHeading(s.heading).startsWith(n));
  return { picked: sections.filter(want), omitted: sections.filter(s => !want(s)) };
}

/** 머리를 예산까지 줄 단위로 자른다(순수) — 문장은 만들지 않는다. */
function clipHead(head, budget) {
  if (estimateTokens(head) <= budget) return { text: head, truncated: false };
  const out = [];
  for (const line of head.split('\n')) {
    if (estimateTokens([...out, line].join('\n')) > budget) break;
    out.push(line);
  }
  return { text: out.join('\n'), truncated: true };
}

/** 한 문서의 발췌(순수): {head, truncated, picked, omitted:{count,tokens,headings}, tokens, full}. */
function excerpt(txt, { cfg = null, extra = [], headBudget = HEAD_BUDGET } = {}) {
  const { head, sections } = splitSections(txt);
  const { picked, omitted } = selectSections(sections, cfg, extra);
  const h = sections.length ? { text: head, truncated: false } : clipHead(head, headBudget);
  const omittedTokens = omitted.reduce((t, s) => t + s.tokens, 0);
  const tokens = estimateTokens(h.text) + picked.reduce((t, s) => t + s.tokens, 0);
  return {
    head: h.text, truncated: h.truncated,
    picked: picked.map(s => ({ heading: s.heading, body: s.body, tokens: s.tokens })),
    omitted: { count: omitted.length, tokens: omittedTokens, headings: omitted.slice(0, OMIT_LIST_CAP).map(s => ({ heading: s.heading, tokens: s.tokens })) },
    tokens, full: estimateTokens(String(txt || '')),
  };
}

/** 사람이 읽는 블록(순수). */
function renderExcerpt(doc, ex) {
  const out = [`--- [${doc.domain}-${doc.id}] ${doc.file}  (~${ex.tokens}/${ex.full} tok${ex.truncated ? ' · 머리 절단' : ''})`];
  if (ex.head) out.push(ex.head);
  for (const s of ex.picked) out.push(`\n## ${s.heading}\n${s.body}`);
  if (ex.omitted.count) {
    const list = ex.omitted.headings.map(h => `${h.heading}(~${h.tokens})`).join(' · ');
    out.push(`\n(생략 ${ex.omitted.count}절 · ~${ex.omitted.tokens} tok: ${list}${ex.omitted.count > ex.omitted.headings.length ? ' · …' : ''} — \`--sections <이름>\` 으로 더 인출)`);
  }
  return out.join('\n');
}

/** 색인 문서들 → 발췌 목록(루트 읽기만). 파일 없으면 건너뛴다. */
function fetchExcerpts(root, docs, { cfg = null, extra = [] } = {}) {
  const out = [];
  for (const d of docs || []) {
    let txt; try { txt = fs.readFileSync(path.join(root, d.file), 'utf8'); } catch { continue; }
    const ex = excerpt(txt, { cfg, extra });
    out.push({ domain: d.domain, id: d.id, file: d.file, head: ex.head, truncated: ex.truncated, picked: ex.picked, omitted: ex.omitted, tokens: ex.tokens, full: ex.full, text: renderExcerpt(d, ex) });
  }
  return out;
}

module.exports = { stripFrontmatter, splitSections, selectSections, clipHead, excerpt, renderExcerpt, fetchExcerpts, HEAD_BUDGET, OMIT_LIST_CAP };
