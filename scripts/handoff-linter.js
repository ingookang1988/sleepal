#!/usr/bin/env node
// scripts/handoff-linter.js
// HANDOFF 인계 린터([PRO-13]) — **REJECT 없는 게이트**: 최대 CLARIFY(3). 세션 종료·커밋을 막지 않는다.
// 세션 종료 시점의 차단은 인계 자체를 유실시키는 최악의 마찰이므로(불완전한 HANDOFF > 없는 HANDOFF),
// 모든 판정은 표면화이고 미해소분은 다음 세션 부트스트랩에서 읽힌다.
//
// 검사(강제점은 예산 하나 — §3 결정 트리는 작성자의 필터이지 항목별 심사 서식이 아니다):
//   1. 5부 존재(요약·변경 위치·다음 작업·미결/주의·검증 상태). 빈 부는 `— 해당 없음` 명시 권장.
//   2. 토큰 예산 — context-budget의 BUDGETS.handoff(1,500 tok) 재사용. 초과 = "자르라"가 아니라
//      "[PRO-13] §3 트리로 라우팅하라"는 신호다.
// HANDOFF.md 없으면 no-op PASS(신규 프로젝트 보호 — history-linter와 동일).
//
// 실행: node scripts/handoff-linter.js [--json|--contract]
const fs = require('fs');
const path = require('path');
const { OUTCOME, withContract } = require('./gate-contract');
const { estimateTokens, budgetsFor, BUDGETS } = require('./context-budget');

const HANDOFF_PATH = '.union-stack/sprint/HANDOFF.md';

// 계약 선언([PRO-11] — [GRAM-12c] 꼴).
const CONTRACT = {
  gate: 'Handoff Gate (handoff-linter)',
  input: '.union-stack/sprint/HANDOFF.md 전문',
  predicate: `5부 존재 + 빈 부의 '— 해당 없음' 명시 + 토큰 예산 ${BUDGETS.handoff} tok 이내 + §3 다음 작업의 WO 진입점([PRO-19])`,
  scope: '구조·크기만 본다 — 항목의 라우팅 적합성(§3 트리)·ID 포인터의 유효성(WO 존재는 미확인)·내용 품질은 보지 않음',
  outcomes: ['PASS', 'CLARIFY'],
  failure_mode: 'REJECT 없음 — 어떤 판정도 커밋·세션 종료를 막지 않는다([PRO-13] §5). CLARIFY로 표면화만',
};

// 5부 식별 — 헤더 키워드(위치·번역 내성, history-linter와 같은 방식).
const PARTS = [
  { key: 'summary', label: '세션 요약', re: /요약|summary/i },
  { key: 'changed', label: '변경 위치(ID)', re: /변경|changed/i },
  { key: 'next', label: '다음 작업(진입점)', re: /다음|진입|next|entry/i },
  { key: 'open', label: '미결/주의', re: /미해결|미결|주의|open|caution|blocker/i },
  { key: 'verify', label: '검증 상태', re: /검증|verif|test/i },
];
// '— 해당 없음' 명시(SPIKE C6)는 별도 토큰 검사가 필요 없다 — 명시하면 부가 비지 않아 통과한다.

/**
 * 본문 → `## ` 절 배열(순수). frontmatter·선두 주석은 헤더가 아니므로 자연히 제외된다.
 * 분해 규칙의 정본은 이 함수 하나다 — 소비자(대시보드 제품 축이 §3 다음 작업·§4 미결을 읽는다)가
 * 자기 파서를 따로 두면 5부 규약이 두 벌이 되어 조용히 갈라진다.
 */
function parseSections(text) {
  const sections = [];
  let cur = null;
  for (const l of String(text || '').split(/\r?\n/)) {
    const h = l.match(/^##\s+(.+)/);
    if (h) { cur = { header: h[1], body: [] }; sections.push(cur); }
    else if (cur) cur.body.push(l);
  }
  return sections;
}

/**
 * 절 → 5부 배정(순수). `{key: section|null}`.
 *
 * 키워드 단독 매칭은 오배정한다(실측): §2 "변경 위치 (ID 목록 — Upward Fetching **진입점**)" 이
 * `next` 의 `/진입/` 에 먼저 걸려 §3 자리를 차지한다. 존재 여부만 보던 때는 드러나지 않았지만
 * 본문을 꺼내 쓰는 순간 틀린 절을 준다. 그래서 **문서 순서 그리디**로 배정한다 — 절을 순서대로
 * 훑으며 아직 배정되지 않은 첫 PART 에 준다. 5부는 순서가 규약이므로 이게 곧 규약의 이행이다.
 */
function assignParts(sections) {
  const out = Object.fromEntries(PARTS.map(p => [p.key, null]));
  for (const sec of sections) {
    const p = PARTS.find(x => out[x.key] === null && x.re.test(sec.header));
    if (p) out[p.key] = sec;
  }
  return out;
}

/** 5부 키(PARTS.key) → 그 부의 본문 텍스트(순수). 없으면 빈 문자열. */
function partBody(text, key) {
  const sec = assignParts(parseSections(text))[key];
  return sec ? sec.body.join('\n').trim() : '';
}

/** 순수 분석: 본문 → {findings, tokens, budget}. findings는 전부 CLARIFY급. */
function analyze(text, budget = BUDGETS.handoff, { upstream = null, census = null } = {}) {
  const findings = [];
  const tokens = estimateTokens(text);
  if (tokens > budget) {
    findings.push({ rule: 'budget', msg:
      `예산 초과 ${tokens}/${budget} tok — 자르지 말고 [PRO-13] §3 트리로 라우팅하라(결정→ledger, 반복 함정→lessons, 재도출 가능→버림)` });
  }
  const assigned = assignParts(parseSections(text));
  for (const p of PARTS) {
    const sec = assigned[p.key];
    if (!sec) {
      findings.push({ rule: 'part-missing', msg: `5부 누락: "${p.label}" — 없으면 '— 해당 없음'을 명시한 부라도 남겨라` });
      continue;
    }
    const body = sec.body.join('\n').trim();
    if (!body) {
      findings.push({ rule: 'part-empty', msg: `"${p.label}" 부가 비어 있음 — 미기입인지 해당없음인지 구별 불가. '— 해당 없음' 명시 권장` });
    }
  }
  // §3 진입점([PRO-19] ③): 다음 작업은 WO ID(브래킷) 또는 명시적 '— 해당 없음'이어야 한다.
  // prose 이월은 [PRO-13] §4-4 의 승격 경로(HANDOFF 체류 → WO 고정)를 타야 한다 — [WO-10a-1]이 선례.
  // 실측 병인: prose 진입점이 5세션을 침묵으로 이월하며 "3세션 생존 = 오라우팅" 기준을 넘겼다.
  const nextSec = assigned.next;
  if (nextSec) {
    const body = nextSec.body.join('\n').trim();
    if (body && !/—\s*해당\s*없음/.test(body) && !/\[WO-[0-9][0-9a-z-]*\]/.test(body)) {
      findings.push({ rule: 'next-entrypoint', msg:
        '다음 작업이 WO 를 가리키지 않는다 — 이월 중인 prose 라면 WO 로 승격해 진입점을 [WO-*] 로 적어라([PRO-13] §4-4 · [PRO-19])' });
    }
  }
  // 하류 제안 고리([PRO-29] ①(c)): 상류 업데이트가 있다(health upstream 캐시)는데 다음 세션 진입점(§3)·미해결(§4)에 그 말이 없으면
  // 제안이 사람에게 닿지 않은 채 세션이 끝난다. 적용하라는 게 아니라 "사람에게 보였는가"를 묻는다 — 보류도 언급이면 충분하다.
  if (upstream && upstream.updates) {
    const carry = [assigned.next, assigned.open].filter(Boolean).map(s => s.body.join('\n')).join('\n');
    if (!UPSTREAM_MENTION.test(carry)) {
      findings.push({ rule: 'upstream-unrelayed', msg:
        `상류 업데이트 있음(${upstream.localVer || '?'} → ${upstream.upstreamVer || '?'}) — §3 또는 §4 에 언급이 없다. \`node scripts/template-update.js --proposal\` 을 사람에게 보이고 결정(적용·보류)을 적어라([PRO-29] ①)` });
    }
  }
  // 상류 이탈 알림([PRO-29] ②(d)): 최신 census 회차에 신규 이탈이 있는데 §3·§4 에 언급이 없으면 — 상류 세션이 그것을 사람에게 넘기지 않은 채 끝난다.
  if (census && newCountOf(census) > 0) {
    const carry = [assigned.next, assigned.open].filter(Boolean).map(s => s.body.join('\n')).join('\n');
    if (!CENSUS_MENTION.test(carry)) {
      findings.push({ rule: 'adopter-deviation-unrelayed', msg:
        `어답터 이탈 신규 ${newCountOf(census)}건(census ${census.date}) — §3 또는 §4 에 언급이 없다. \`node scripts/adopter-census.js --handoff\` 한 줄을 §4 에 붙이고 조치는 사람에게([PRO-29] ②)` });
    }
  }
  return { findings, tokens, budget };
}
const CENSUS_MENTION = /어답터 이탈|adopter-census|census/i;
const newCountOf = round => round.rows.reduce((n, r) => n + (r.delta ? r.delta.new.length : 0), 0);
const UPSTREAM_MENTION = /template-update|--proposal|업데이트 제안|상류 업데이트|upstream/i;

/** 최신 census 회차 — 상류 자신만(어답터 = null). census_round 가 없으면(구 배송) null. */
function readCensus(root) {
  try {
    if (!require('./adapter').isTemplateRepo(root)) return null;
    return require('./census_round').latestRound(root);
  } catch { return null; }
}

/** 상류 확인 캐시(template-sync.json lastCheck) — 네트워크 0. 상류 자신·캐시 없음·template-update 부재 = null(침묵). */
function readUpstream(root) {
  try {
    if (require('./adapter').isTemplateRepo(root)) return null;
    return require('./template-update').readLastCheck(root);
  } catch { return null; }
}

function run(argv = process.argv.slice(2)) {
  const root = path.resolve(__dirname, '..');
  const p = path.join(root, HANDOFF_PATH);
  if (!fs.existsSync(p)) {
    console.log('HANDOFF 린터: HANDOFF.md 없음 — 건너뜀(신규 프로젝트 보호).');
    return OUTCOME.PASS;
  }
  const r = analyze(fs.readFileSync(p, 'utf8'), budgetsFor(root).handoff, { upstream: readUpstream(root), census: readCensus(root) }); // adapter.json budgets.handoff 가 있으면 그 값([ADR-29])
  if (argv.includes('--json')) { console.log(JSON.stringify(r, null, 2)); return r.findings.length ? OUTCOME.CLARIFY : OUTCOME.PASS; }
  if (r.findings.length) {
    console.error(`\n[HANDOFF 린터] CLARIFY — 표면화만, 차단하지 않는다([PRO-13]):`);
    r.findings.forEach(f => console.error(`  ? (${f.rule}) ${f.msg}`));
    console.error('');
    return OUTCOME.CLARIFY;
  }
  console.log(`HANDOFF 린터 통과: 5부 완비 · ${r.tokens}/${r.budget} tok.`);
  return OUTCOME.PASS;
}

module.exports = { readUpstream, readCensus, UPSTREAM_MENTION, CENSUS_MENTION, analyze, parseSections, assignParts, partBody, run, CONTRACT, PARTS, HANDOFF_PATH };

if (require.main === module) process.exit(withContract(CONTRACT, run)());
