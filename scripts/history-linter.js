#!/usr/bin/env node
// scripts/history-linter.js
// HISTORY 근거 강제 게이트(Fail-close). 콘텐츠 레벨 거버넌스의 첫 강제 사례.
//
// 규율(project/_GUIDE.md): "사실 + 근거는 한 쌍. 근거 없는 사실은 등재 불가."
//   근거 없는 분기점은 회귀 방지를 진보 방지로 변질시키는 '독약'이므로 차단한다.
//
// 동작: .union-stack/project/HISTORY.md 의 표를 파싱해, 분기점(사실) 칸이 채워졌는데
//   근거(왜) 칸이 비면 위반. HISTORY.md 가 없으면 no-op(히스토리는 점진 적체 → 신규 프로젝트 보호).
//
// **두 형식을 인식한다**(실측 공백): MIGRATION.md 경로로 기존 프로젝트를 이관한 어답터는 HISTORY 를
//   `### YYYY-MM-DD — 제목` + context/decision/rationale/impact 의 **헤딩형**으로 갖는 것이 자연스럽다.
//   지금까지 이 형식은 파서에 잡히지 않아 대시보드 시간축에서 **전략 분기점 0**으로 집계됐고, 린터는
//   다른 불변식(사실+근거)만 보므로 형식 불일치가 조용히 지나갔다 — "분기점을 안 쓰는 프로젝트"와
//   "형식이 다른 프로젝트"가 구분되지 않았다. 그래서:
//     · 계수(parseEntries)   — 두 형식 모두 인식한다. 조용한 0 을 없앤다.
//     · 차단(findViolations) — **표 형식만**. 표는 컬럼이 곧 계약이라 "근거 칸이 비었다"가 사실이다.
//     · 표면화(findClarifications) — 헤딩형에서 근거 절을 못 찾으면 CLARIFY(비차단). 헤딩형은 자유
//       서술이라 근거가 없다고 단정할 수 없다 — 미탐을 오탐으로 바꾸지 않고 질문으로 남긴다([PRO-07]).
//
// 실행: node scripts/history-linter.js [--contract]
const fs = require('fs');
const path = require('path');
const { withContract, OUTCOME, toShellExit } = require('./gate-contract');

const HISTORY_PATH = '.union-stack/project/HISTORY.md';

// 계약 선언([PRO-11] — [GRAM-12c] 꼴).
const CONTRACT = {
  gate: 'HISTORY Reason Gate (history-linter)',
  input: '.union-stack/project/HISTORY.md 의 분기점 표(사실·근거 컬럼) + 헤딩형 항목(### YYYY-MM-DD)',
  predicate: '표 행: 사실 칸이 채워지면 근거 칸도 비어 있지 않아야 한다 · 헤딩형: 근거 절(rationale/근거/why)이 있어야 한다',
  scope: '근거의 존재만 본다 — 근거의 등급·진위·발현점은 보지 않음(SPIKE-fdt D4, [PRO-11] 보류 항목). 차단은 표 형식만: 헤딩형은 자유 서술이라 부재를 단정하지 않고 CLARIFY 로 표면화',
  outcomes: ['PASS', 'REJECT', 'CLARIFY'],
  failure_mode: '표 행 위반 → 목록 출력 후 REJECT(차단) · 헤딩형 근거 미검출 → CLARIFY(비차단 표면화). HISTORY.md 없으면 no-op PASS',
};

// 헤더 키워드로 컬럼을 식별(위치·번역 내성).
const FACT_HEADER = /사실|분기점|fact|turning/i;
const REASON_HEADER = /근거|왜|reason|why/i;
// 빈 칸으로 간주할 플레이스홀더.
const PLACEHOLDER = /^(?:[-–—?.]+|tbd|n\/?a)$/i;

function splitCells(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map(c => c.trim());
}

function isTableRow(line) {
  return /\|/.test(line) && !/^\s*>/.test(line) && !/^\s*<!--/.test(line);
}

function isSeparatorRow(line) {
  if (!isTableRow(line)) return false;
  return splitCells(line).every(c => /^:?-+:?$/.test(c));
}

function isEmptyCell(c) {
  const t = (c || '').replace(/[*_`]/g, '').trim();
  return t === '' || PLACEHOLDER.test(t);
}

// 헤딩형 항목의 머리: `### 2026-06-08 — 폴더 개명` / `## 2026-06-08` / `### 2026-06-08: 제목`
const HEADING_ENTRY = /^(#{2,6})[ \t]+(\d{4}-\d{2}-\d{2})[ \t]*(?:[—–:-][ \t]*)?(.*)$/;
const ANY_HEADING = /^(#{1,6})[ \t]+/;
// 본문에서 라벨을 집는다 — 하위 헤딩(`#### Rationale`)·목록 항목(`- **근거:** …`)·굵은 라벨 모두.
const INLINE_LABEL = /^[ \t]*(?:[-*+][ \t]*)?(?:#{1,6}[ \t]*)?\**[ \t]*([A-Za-z가-힣]+)[ \t]*\**[ \t]*[:：][ \t]*(.*)$/;
const BARE_LABEL = /^[ \t]*(?:[-*+][ \t]*)?#{1,6}[ \t]*\**[ \t]*([A-Za-z가-힣]+)[ \t]*\**[ \t]*$/;
const REASON_LABEL = /^(근거|왜|이유|reason|rationale|why)$/i;
const NOTE_LABEL = /^(시사점|고려사항|영향|impact|implication|note)$/i;
const FACT_LABEL = /^(결정|사실|분기점|decision|fact|change)$/i;

/** 라벨 값의 바깥 강조 표식만 벗긴다(`**근거:** x` 의 닫는 `**`). 안쪽 강조는 보존 — 값의 일부다. */
const trimLabelValue = v => String(v).replace(/^[*_`\s]+/, '').replace(/[*_`\s]+$/, '');

/**
 * 헤딩형 분기점 → 항목 배열(순수). 한 항목 = 날짜 헤딩부터 같은 레벨 이상의 다음 헤딩 직전까지.
 * 라벨 매칭은 **관대하게**(하위 헤딩·목록·굵은 라벨) 한다 — 이 파서의 목적은 차단이 아니라 계수이고,
 * 여기서 놓친 근거는 CLARIFY 한 줄로 끝나지만 놓친 *항목*은 "분기점 0"이라는 거짓 사실이 된다.
 */
function parseHeadingEntries(md) {
  const lines = String(md || '').split(/\r?\n/);
  const out = [];
  let cur = null;
  const finish = () => {
    if (!cur) return;
    const fields = {};
    for (let k = 0; k < cur.body.length; k++) {
      const line = cur.body[k];
      const bare = line.match(BARE_LABEL);
      if (bare) {
        const key = bare[1].toLowerCase();
        const rest = cur.body.slice(k + 1).find(l => l.trim() && !BARE_LABEL.test(l)) || '';
        if (!(key in fields)) fields[key] = trimLabelValue(rest.replace(/^[ \t]*[-*+][ \t]*/, ''));
        continue;
      }
      const inline = line.match(INLINE_LABEL);
      if (inline) { const key = inline[1].toLowerCase(); if (!(key in fields)) fields[key] = trimLabelValue(inline[2]); }
    }
    const pick = re => { const k = Object.keys(fields).find(x => re.test(x)); return k ? fields[k] : ''; };
    const fact = cur.title || pick(FACT_LABEL) || '(제목 없음)';
    out.push({
      date: cur.date, fact, reason: pick(REASON_LABEL), note: pick(NOTE_LABEL),
      example: /\(예시\)|example/i.test(cur.date + ' ' + cur.title), form: 'heading', line: cur.line,
    });
    cur = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const h = lines[i].match(HEADING_ENTRY);
    if (h) { finish(); cur = { level: h[1].length, date: h[2], title: (h[3] || '').trim(), body: [], line: i + 1 }; continue; }
    const any = lines[i].match(ANY_HEADING);
    if (any && cur && any[1].length <= cur.level) { finish(); continue; }
    if (cur) cur.body.push(lines[i]);
  }
  finish();
  return out;
}

/** 헤딩형 항목 중 근거 절을 찾지 못한 것(순수) — CLARIFY 대상. 차단하지 않는다. */
function findClarifications(md) {
  return parseHeadingEntries(md)
    .filter(e => !e.example && isEmptyCell(e.reason))
    .map(e => ({ line: e.line, fact: e.fact, date: e.date }));
}

/**
 * 분기점 표 → 항목 배열(순수) — 시간축 페이지가 소비한다.
 * findViolations 와 같은 표 인식 규칙을 쓴다(파서 정본은 이 파일 하나 — 중복 파서는 드리프트).
 * 반환: [{date, fact, reason, note, example}] — "(예시)" 행은 example: true 로 표시만 하고 거르지 않는다.
 */
function parseEntries(md) {
  const lines = String(md || '').split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length - 1; i++) {
    if (!isTableRow(lines[i]) || isSeparatorRow(lines[i])) continue;
    if (!isSeparatorRow(lines[i + 1])) continue;
    const header = splitCells(lines[i]);
    const factCol = header.findIndex(h => FACT_HEADER.test(h));
    if (factCol === -1) continue;
    const reasonCol = header.findIndex(h => REASON_HEADER.test(h));
    const dateCol = header.findIndex(h => /날짜|date/i.test(h));
    const noteCol = header.findIndex(h => /시사점|고려|note/i.test(h));
    for (let j = i + 2; j < lines.length && isTableRow(lines[j]); j++) {
      if (isSeparatorRow(lines[j])) continue;
      const row = splitCells(lines[j]);
      const fact = row[factCol] || '';
      if (isEmptyCell(fact)) continue;
      out.push({
        date: dateCol >= 0 ? (row[dateCol] || '') : '',
        fact,
        reason: reasonCol >= 0 ? (row[reasonCol] || '') : '',
        note: noteCol >= 0 ? (row[noteCol] || '') : '',
        example: /\(예시\)|example/i.test((row[dateCol] || '') + ' ' + fact),
        form: 'table', line: j + 1,
      });
    }
  }
  // 두 형식을 문서 순서로 합친다 — 소비자(대시보드 시간축)는 "이 프로젝트의 분기점 전부"를 원한다.
  return out.concat(parseHeadingEntries(md)).sort((a, b) => a.line - b.line);
}

/**
 * 마크다운에서 "사실 칸은 있는데 근거 칸이 빈" **표 행**을 찾는다 — 유일한 차단 판정.
 * 순수 함수 — FS 접근 없음. 반환: [{line, fact}] (line은 1-기준).
 * 헤딩형은 여기서 보지 않는다(자유 서술 → findClarifications 의 CLARIFY 소관).
 * (일반화 확장점: 컬럼 규칙을 인자로 빼면 lessons/proposals에도 재사용 가능.)
 */
function findViolations(md) {
  const lines = String(md || '').split(/\r?\n/);
  const violations = [];
  for (let i = 0; i < lines.length - 1; i++) {
    if (!isTableRow(lines[i]) || isSeparatorRow(lines[i])) continue;
    if (!isSeparatorRow(lines[i + 1])) continue; // 헤더는 다음 줄이 구분선
    const header = splitCells(lines[i]);
    const factCol = header.findIndex(h => FACT_HEADER.test(h));
    if (factCol === -1) continue; // 우리 표(분기점 표)가 아님 — 무시
    const reasonCol = header.findIndex(h => REASON_HEADER.test(h));
    if (reasonCol === -1) {
      violations.push({ line: i + 1, fact: '(표 양식 오류: 근거 컬럼 없음)' });
    }
    let j = i + 2;
    for (; j < lines.length && isTableRow(lines[j]); j++) {
      if (isSeparatorRow(lines[j])) continue;
      const row = splitCells(lines[j]);
      const fact = row[factCol] || '';
      if (isEmptyCell(fact)) continue; // 빈 행 — 등재 아님
      const reason = reasonCol >= 0 ? (row[reasonCol] || '') : '';
      if (reasonCol === -1 || isEmptyCell(reason)) {
        violations.push({ line: j + 1, fact: fact.replace(/[*_`]/g, '').trim() });
      }
    }
    i = j - 1; // 이 표 다음부터 계속
  }
  return violations;
}

function run(root = path.resolve(__dirname, '..')) {
  const p = path.join(root, HISTORY_PATH);
  if (!fs.existsSync(p)) {
    console.log('HISTORY 린터: HISTORY.md 없음 — 건너뜀(히스토리는 점진 적체).');
    return OUTCOME.PASS;
  }
  const md = fs.readFileSync(p, 'utf8');
  const violations = findViolations(md);
  if (violations.length) {
    console.error('\n[HISTORY] 근거 없는 분기점(독약 항목):');
    violations.forEach(v => console.error(`  ✗ L${v.line}: ${v.fact}`));
    console.error('\n각 분기점에 "왜"(근거)를 채우세요 — 근거가 있어야 회귀 재평가가 가능합니다.');
    console.error('규율: project/_GUIDE.md — 사실 + 근거는 한 쌍.\n');
    return OUTCOME.REJECT;
  }
  const clarifications = findClarifications(md);
  if (clarifications.length) {
    console.error('\n[HISTORY] 헤딩형 항목에서 근거 절을 찾지 못함(CLARIFY — 차단 아님):');
    clarifications.forEach(v => console.error(`  ? L${v.line}: ${v.date} ${v.fact}`));
    console.error('\n근거 라벨(`근거:`/`Rationale:`/`Why:`)을 항목 본문에 두면 계수·검사가 잡습니다.');
    console.error('형식 안내: MIGRATION.md §"HISTORY 형식 — 표형과 헤딩형".\n');
    return OUTCOME.CLARIFY;
  }
  console.log(`HISTORY 린터 통과: 분기점 ${parseEntries(md).filter(e => !e.example).length}건 모두 근거가 있음.`);
  return OUTCOME.PASS;
}

module.exports = { findViolations, findClarifications, parseEntries, parseHeadingEntries, run, CONTRACT, HISTORY_PATH };

// CLARIFY(3)는 차단이 아니다 — `npm run lint` 의 `&&` 사슬이 끊기지 않도록 셸 접기를 거친다([PRO-11]).
if (require.main === module) process.exit(toShellExit(withContract(CONTRACT, () => run())())); // run(root) 시그니처 — argv 전달 금지
