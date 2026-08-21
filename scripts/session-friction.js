#!/usr/bin/env node
// scripts/session-friction.js
// 의도 단위 마찰 계측기 — 세션 종료 증류 루프의 **P₁(문제) 탐지기**이자 **EE(반증) 판정 도구**.
//
// 무엇을 재는가: 사용자 발화 1건 = 의도 1건으로 보고, 다음 발화까지의 **왕복 턴·토큰·소요 시간**을 집계한다.
//   "합이 맞는 팀은 눈빛만 봐도 안다"를 조작적으로 정의하면 *의도당 왕복 비용*이고, 이 스크립트가 그 기준선을 준다.
//
// ⚠ 이 출력은 **지식이 아니라 문제 후보**다(포퍼: 귀납은 P₁을 찾는 데까지만 허용).
//   여기서 나온 패턴을 그대로 스킬로 승격하면 귀납을 추측으로 위장하는 것이며, 실측상 순손해다
//   (자가생성 스킬 −1.8pp / 자동승격 안전 후보 0-of-133). 승격은 별도 추측(TT) 제기 + 가혹한 시험(EE)을 거친다.
//
// 정직한 한계: ① 의도 버킷팅은 키워드 근사다(의미 분류 아님) — 후보 발굴용이지 측정값의 분모가 아니다.
//   ② 토큰은 트랜스크립트의 usage 실측이나, 캐시 읽기는 과금 가중치가 달라 out/in을 분리 보고한다.
//   ③ **빈도가 아니라 비용**으로 순위를 매기고, 상관된 반복을 독립 증거로 세지 않도록 *세션 단위 독립 지지도*를 함께 낸다.
// read-only·zero-dep. 실행: node scripts/session-friction.js [<transcript-dir>] [--json]
const fs = require('fs');
const os = require('os');
const path = require('path');
const { walkFiles } = require('./fs_walk');
const { toolUses } = require('./transcript-stats');

// 의도 버킷(P₁ 후보 발굴용 근사). 첫 매칭 승리 — 더 구체적인 것을 앞에 둔다.
const BUCKETS = [
  { key: 'approve', re: /^(승인|확인|ok|좋아|좋다|진행해?$)/i },
  { key: 'push/배포', re: /push|푸시|배포/i },
  { key: 'fix/수정', re: /수정|고쳐|버그|fix/i },
  { key: 'review/분석', re: /리뷰|분석|점검|검토|평가/i },
  { key: 'research/조사', re: /리서치|조사|research|트렌드/i },
  { key: 'explain/설명', re: /설명|브리핑|알려|쉽게/i },
  { key: 'propose/제안', re: /제안|추천|어떻게|어디에/i },
  { key: 'implement/구현', re: /구현|추가|만들|작성|진행/i },
];

// 발화가 아닌 잡음(중단 표식·로컬 커맨드 출력·시스템 주입)을 제외.
const NOISE_RE = /^(\[Request interrupted|<local-command|<command-name|<system-reminder|Caveat:)/;

function bucketOf(text) {
  const t = String(text || '').trim();
  for (const b of BUCKETS) if (b.re.test(t)) return b.key;
  return 'other';
}

/**
 * 정규화 이벤트 배열 → 의도 세그먼트(순수, FS 비의존).
 * events: [{kind:'user'|'assistant', text?, usage?, ts?, sidechain?, session}]
 *   — 사용자 발화에서 다음 사용자 발화 직전까지가 한 세그먼트.
 */
function segment(events) {
  const segs = [];
  let cur = null;
  const close = () => { if (cur) segs.push(cur); };
  for (const e of events) {
    if (e.kind === 'user') {
      close();
      cur = { utterance: e.text, bucket: bucketOf(e.text), session: e.session,
        turns: 0, subTurns: 0, toolCalls: 0, outTok: 0, inTok: 0, tools: [], startTs: e.ts, endTs: e.ts };
      continue;
    }
    // 세션 경계 가드: 다른 세션의 어시스턴트 이벤트는 이 의도에 얹지 않는다. 한 디렉터리에
    // 세션이 여럿이면(A/B 팔의 런 5개) walk 순서에 따라 다른 런의 비용이 앞 런의 마지막 의도로
    // 흘러들어간다 — 실측에서 잡힌 귀속 오류다.
    if (!cur || e.kind !== 'assistant' || e.session !== cur.session) continue;
    if (e.sidechain) cur.subTurns++; else cur.turns++;
    if (e.tools) cur.tools.push(...e.tools);
    cur.toolCalls += e.toolCalls || 0;
    if (e.usage) { cur.outTok += e.usage.output_tokens || 0; cur.inTok += e.usage.input_tokens || 0; }
    if (e.ts) cur.endTs = e.ts;
  }
  close();
  return segs.map(s => ({ ...s, durationMs: (s.startTs && s.endTs) ? (Date.parse(s.endTs) - Date.parse(s.startTs)) : null }));
}

/**
 * 절차 동형성(순수): 같은 버킷의 의도들이 *같은 도구 시퀀스*를 밟는가 = 흡수(자동화) 가능성.
 * 비용만으로는 마찰과 본질 작업량을 구분할 수 없다 — 리뷰는 원래 비싸다. 반복되면서 *동형*일 때만
 * 절차로 흡수할 수 있다. 도구 이름 집합의 평균 쌍별 Jaccard(0~1). 세그먼트 1개면 null(판정 불가).
 */
function homogeneity(segList, cap = 30) {
  const sets = segList.slice(0, cap).map(s => new Set(s.tools || []));
  const usable = sets.filter(s => s.size);            // 도구를 안 쓴 세그먼트는 판정 불가 → 제외
  if (usable.length < 2) return { value: null, n: usable.length };
  let sum = 0, pairs = 0;
  for (let i = 0; i < usable.length; i++) for (let j = i + 1; j < usable.length; j++) {
    const a = usable[i], b = usable[j];
    let inter = 0; for (const t of a) if (b.has(t)) inter++;
    sum += inter / (a.size + b.size - inter); pairs++;
  }
  // n을 함께 반환한다 — 1.00(n=4)와 1.00(n=12)는 전혀 다른 증거다(표본 없는 확신 금지).
  return { value: pairs ? +(sum / pairs).toFixed(2) : null, n: usable.length };
}

/**
 * 세그먼트 → 버킷별 집계(순수). **비용 순 정렬**, 그리고 상관 반복을 독립 증거로 세지 않도록
 * `independent` = 서로 다른 세션 수를 함께 낸다(원시 빈도만 보면 오승격한다).
 */
function aggregate(segs) {
  const by = new Map();
  for (const s of segs) {
    const b = by.get(s.bucket) || { bucket: s.bucket, count: 0, sessions: new Set(), turns: 0, subTurns: 0, outTok: 0, toolCalls: 0, worst: null, segs: [] };
    b.count++; b.sessions.add(s.session); b.turns += s.turns; b.subTurns += s.subTurns;
    b.outTok += s.outTok; b.toolCalls += s.toolCalls; b.segs.push(s);
    if (!b.worst || s.outTok > b.worst.outTok) b.worst = s;
    by.set(s.bucket, b);
  }
  return [...by.values()]
    .map(b => ({
      bucket: b.bucket, count: b.count, independent: b.sessions.size,
      turns: b.turns, subTurns: b.subTurns, toolCalls: b.toolCalls, outTok: b.outTok,
      avgTurns: +(b.turns / b.count).toFixed(1), avgOutTok: Math.round(b.outTok / b.count),
      homogeneity: homogeneity(b.segs).value, homogeneityN: homogeneity(b.segs).n,
      worstUtterance: b.worst ? b.worst.utterance.slice(0, 60) : null,
    }))
    .sort((x, y) => y.outTok - x.outTok); // 비용 순 — 빈도 순이 아니다
}

/** 전체 기준선(순수). 승격 전후 비교의 분모. */
function baseline(segs) {
  if (!segs.length) return { intents: 0 };
  const n = segs.length, sum = k => segs.reduce((a, s) => a + (s[k] || 0), 0);
  const med = k => { const v = segs.map(s => s[k] || 0).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
  return {
    intents: n, sessions: new Set(segs.map(s => s.session)).size,
    turnsPerIntent: +(sum('turns') / n).toFixed(2), medianTurns: med('turns'),
    outTokPerIntent: Math.round(sum('outTok') / n), medianOutTok: med('outTok'),
    toolCallsPerIntent: +(sum('toolCalls') / n).toFixed(1),
    subagentTurns: sum('subTurns'),
  };
}

// --- 어댑터(얇음) ---
/** 전사 파일 경로 → 소속 세션 id(순수). 서브에이전트 전사는 부모 세션에 귀속시킨다. */
function sessionOf(rel) {
  const parts = rel.split(/[\\/]/);
  const i = parts.indexOf('subagents');
  return i > 0 ? parts[i - 1] : path.basename(rel, '.jsonl');
}

function readEvents(dir) {
  const files = [];
  walkFiles(dir, '', rel => { if (rel.endsWith('.jsonl')) files.push(rel); });
  const events = [];
  for (const rel of files) {
    const f = path.join(dir, rel);
    // 서브에이전트 전사(`<sid>/subagents/agent-*.jsonl`)는 *부모 세션의 비용*이다. 파일명을 세션으로
    // 삼으면 별개 세션이 되고, walk 순서에 따라 그 토큰이 엉뚱한 의도에 얹힌다. 부모 sid로 귀속시킨 뒤
    // 아래에서 **시간순**으로 정렬해, 실제로 열려 있던 의도에 붙인다.
    const session = sessionOf(rel);
    for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      let o; try { o = JSON.parse(line); } catch { continue; }
      const m = o.message;
      if (o.type === 'user' && m && m.role === 'user' && !o.isSidechain) {
        const c = typeof m.content === 'string' ? m.content
          : Array.isArray(m.content) ? m.content.filter(x => x.type === 'text').map(x => x.text).join(' ') : '';
        const text = (c || '').replace(/\s+/g, ' ').trim();
        if (!text || NOISE_RE.test(text)) continue;           // 도구 결과·주입은 발화가 아니다
        events.push({ kind: 'user', text, ts: o.timestamp, session });
      } else if (o.type === 'assistant' && m) {
        const calls = toolUses(m);
        events.push({ kind: 'assistant', usage: m.usage, ts: o.timestamp, session,
          sidechain: !!o.isSidechain, toolCalls: calls.length, tools: calls.map(c => c.name) });
      }
    }
  }
  // 세션별로 묶고 세션 안에서는 시간순(타임스탬프 없으면 읽은 순서)으로 안정 정렬.
  return events
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (a.e.session < b.e.session ? -1 : a.e.session > b.e.session ? 1
      : (Date.parse(a.e.ts) || 0) - (Date.parse(b.e.ts) || 0) || a.i - b.i))
    .map(x => x.e);
}

function run(argv = process.argv.slice(2)) {
  const json = argv.includes('--json');
  const dir = argv.find(a => !a.startsWith('--')) || path.join(os.homedir(), '.claude', 'projects');
  const segs = segment(readEvents(dir));
  const base = baseline(segs), agg = aggregate(segs);
  if (json) { console.log(JSON.stringify({ baseline: base, buckets: agg }, null, 2)); return 0; }
  console.log(`# session-friction — ${dir}`);
  if (!segs.length) { console.log('  의도 세그먼트 없음 — 디렉터리를 확인하라.'); return 0; }
  console.log(`\n## 기준선 (의도 ${base.intents}건 / 세션 ${base.sessions}개)`);
  console.log(`  의도당 왕복 턴   평균 ${base.turnsPerIntent}  (중앙값 ${base.medianTurns})`);
  console.log(`  의도당 출력 토큰 평균 ${base.outTokPerIntent}  (중앙값 ${base.medianOutTok})`);
  console.log(`  의도당 도구 호출 평균 ${base.toolCallsPerIntent}   서브에이전트 턴 합계 ${base.subagentTurns}`);
  console.log('\n## P₁ 후보 — **비용 순**(빈도 순 아님). indep=서로 다른 세션 수, 동형성=도구 시퀀스 일치도');
  console.log('  bucket           건수 indep  평균턴  평균출력tok  총출력tok  동형성(표본)');
  for (const b of agg) {
    console.log(`  ${b.bucket.padEnd(16)} ${String(b.count).padStart(4)} ${String(b.independent).padStart(5)} ` +
      `${String(b.avgTurns).padStart(7)} ${String(b.avgOutTok).padStart(12)} ${String(b.outTok).padStart(10)}` +
      `  ${(b.homogeneity === null ? 'n/a' : b.homogeneity.toFixed(2)).padStart(6)} (n=${b.homogeneityN})`);
  }
  console.log('\n  ⚠ 이것은 *문제 후보*이지 지식이 아니다 — 승격하려면 별도 추측(TT) + 가혹한 시험(EE)을 거쳐야 한다.');
  console.log('    독립 지지도(indep)가 낮으면 상관된 반복일 뿐이다(오승격의 주원인).');
  console.log('    **비용↑ + 동형성↑ + indep≥2** 인 버킷만이 절차로 흡수할 가치가 있다 —');
  console.log('    비용이 높아도 동형성이 낮으면 매번 다른 일을 한 것(본질 작업량)이지 마찰이 아니다.');
  return 0;
}

module.exports = { segment, aggregate, baseline, bucketOf, BUCKETS, readEvents, sessionOf };

if (require.main === module) process.exit(run());
