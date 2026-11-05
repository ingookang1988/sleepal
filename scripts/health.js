#!/usr/bin/env node
// scripts/health.js
// 하네스 자가 건강진단 — "조견표의 코드화". 게이트 상태 + 구조 지표를 자동 산출한다.
// read-only·zero-dep. 실행: node scripts/health.js [--json] [--root <dir>]
//   --root <dir> : 다른 레포(어답터 평면·팔 사본)를 측정한다([PRO-27] ④). `.union-stack` 이 없으면 REJECT
//                  "측정 대상 아님" — 플래그를 무시하고 상류 자신을 측정하던 결함("0건 검사 = 통과" 클래스)의 수리.
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
const { load: loadAdapter, isTemplateRepo } = require('./adapter');
const censusRound = require('./census_round');
const { gather: gatherBrokenRefs } = require('./ref-linter');
const { gather: gatherBudget } = require('./context-budget');
const receipts = require('./receipts');
const retro = require('./retro');

const { contractEdges, normEnforcement, concernUsage, roadmapWiring, NORM_DOMAINS } = require('./query');
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
function computeHealth({ index, domainsDefined, guideCount, namingViolations, historyViolations, leakageViolations, oversize = [], brokenRefs = 0, budget = null, sync = null, lessons = null, effect = null, contracts = null, norms = null, roadmap = null, adapter = null, historyClarifications = 0, testInfra = null, receiptsInfo = null, retroInfo = null, upstream = null, census = null }) {
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
  if (roadmap) {
    // 로드맵 배선 관측([PRO-19] ②) — roadmap 은 Schema 라 에이전트가 되쓰지 못하므로, 죽지 않게
    // 하는 수단은 대필이 아니라 정체의 표면화다. 갱신은 신호를 본 인간이 한다.
    const bits = [`PHASE ${roadmap.phases}`, `활성 계보 ${roadmap.active}`];
    if (roadmap.unanchored.length) bits.push(`로드맵 무연결 ${roadmap.unanchored.length}`);
    if (roadmap.stale.length) bits.push(`무활동 PHASE ${roadmap.stale.length}`);
    dims.push({ name: 'roadmap wiring', status: 'INFO', value: bits.join(' · '),
      note: [...roadmap.unanchored.map(k => `무연결:${k}`), ...roadmap.stale.map(k => `정체:${k}`)].join(' ') });
  }
  if (testInfra) {
    // 테스트 인프라 관측([PRO-21] 3단계) — 게이트가 아니라 계기판이다. §5.5 실측(재사용 실패는
    // 의지가 아니라 가시성 문제)이 하드 게이트를 기각했으므로, 여기는 영원히 INFO 다.
    const bits = [`스위트 ${testInfra.testFiles}`,
      testInfra.catalogAssets === null ? '카탈로그 무기입' : `카탈로그 자산 ${testInfra.catalogAssets}`,
      `FLOW 케이스 ${testInfra.flowCases}${testInfra.flowCases ? `(체크 ${testInfra.flowChecked})` : ''}`];
    if (testInfra.evidenceLast) bits.push(`evidence ${testInfra.evidenceLast}`);
    dims.push({ name: 'test infra', status: 'INFO', value: bits.join(' · ') });
  }
  if (receiptsInfo) {
    // 영수증 관측([PRO-22] 단계 2) — 차단 검사별 **최신 영수증 포인터·나이**. 영수증이 끊기면 꺼진 CI 가 여기서 보인다.
    // 선언 부재는 무기입(INFO)이지 0 이 아니다([ADR-28]). 판정하지 않는다 — 나이의 임계는 어답터·사람이 정한다.
    const bits = receiptsInfo.declared
      ? [`선언 ${receiptsInfo.declared}(차단 ${receiptsInfo.blocking})`, `영수증 ${receiptsInfo.lines}줄`,
        ...receiptsInfo.latest.map(l => l.date ? `${l.name} ${l.age}d(${l.outcome}${l.targets != null && l.targets !== '-' ? ' · ' + l.targets : ''})` : `${l.name} 영수증 없음`)]
      : ['선언 무기입', `영수증 ${receiptsInfo.lines}줄`];
    dims.push({ name: 'receipts', status: 'INFO', value: bits.join(' · '), note: receiptsInfo.missing.length ? '영수증 없음: ' + receiptsInfo.missing.join(' ') : '' });
  }
  if (retroInfo) {
    // 회고 트리거([PRO-25] ① v0.2) — 등급 매핑: PRO 의 "CLARIFY" 는 health 에선 WARN(비차단 표면화, §8 ④). 넘지 않으면 INFO 로 현재 값만.
    // 에이전트가 할 일은 HANDOFF §4 에 제안 한 줄뿐이다([PRO-25] ②). 판정·GC·승격은 사람의 세션.
    const vals = retroInfo.indicators.map(i => `${i.name} ${i.value == null ? '—' : i.value}`).join(' · ');
    dims.push({ name: 'retro due', status: retroInfo.due ? 'WARN' : 'INFO',
      value: retroInfo.due ? `due — ${retroInfo.reasons.join(' · ')}` : `사유 없음 · ${vals}`,
      note: retroInfo.due ? vals + (retroInfo.delta && retroInfo.delta.length ? ' · Δ ' + retroInfo.delta.map(d => `${d.name} ${d.prev}→${d.now}`).join(' ') : '') + ' — 회고 제안은 HANDOFF §4 한 줄(node scripts/retro.js --proposal)' : '' });
  }
  if (upstream) {
    // 하류 제안 고리([PRO-29] ①(a)) — 상류 새 버전을 명령 없이 보인다. 영원히 INFO: 업데이트 유무는 결함이 아니고, 적용은 사람이 제안문을 보고 정한다([ADR-12]).
    dims.push(upstreamDim(upstream));
  }
  if (census) {
    // 상류 이탈 알림 고리의 트리거([PRO-29] ②(d), [WO-29a-6]) — 상류 자신만. 영원히 INFO: 회차를 묻는 것이지 판정이 아니다.
    dims.push(censusDim(census));
  }
  const tiers = { draft: 0, reviewed: 0, ratified: 0, untagged: 0 };
  index.forEach(d => { tiers[d.tier && tiers[d.tier] !== undefined ? d.tier : 'untagged']++; });
  dims.push({ name: 'tier distribution', status: 'INFO',
    value: `draft:${tiers.draft} reviewed:${tiers.reviewed} ratified:${tiers.ratified} untagged:${tiers.untagged}` });
  const fails = dims.filter(d => d.status === 'FAIL').length;
  const warns = dims.filter(d => d.status === 'WARN').length;
  return { dims, byDomain, fails, warns, healthy: fails === 0 };
}

/** 순수: census 최신 회차 → 차원(항상 INFO). 마지막 회차가 STALE_DAYS 초과면 "회차 필요". */
function censusDim({ round, today }) {
  const name = 'adopter census';
  const cmd = 'node scripts/adopter-census.js --delta --write';
  if (!round) return { name, status: 'INFO', value: '회차 없음', note: `회차: ${cmd}` };
  const days = censusRound.daysSince(round.date, today);
  const n = censusRound.newCount(round);
  const base = `마지막 회차 ${round.date}(${days}일) · 신규 이탈 ${n}`;
  if (days > censusRound.STALE_DAYS) return { name, status: 'INFO', value: `${base} — 회차 필요(${censusRound.STALE_DAYS}일 초과)`, note: `회차: ${cmd} · HANDOFF 한 줄: node scripts/adopter-census.js --handoff` };
  return { name, status: 'INFO', value: base, note: n ? 'HANDOFF §4 한 줄: node scripts/adopter-census.js --handoff' : '' };
}

/** 순수: upstream 수집 결과 → 차원(항상 INFO). */
function upstreamDim(up) {
  const name = 'upstream';
  if (up.self) return { name, status: 'INFO', value: '해당 없음 — 상류 자신' };
  const last = up.last;
  const cmd = 'node scripts/template-update.js --proposal';
  if (!last || (!last.at && !last.error)) return { name, status: 'INFO', value: '확인 기록 없음', note: `확인: ${cmd}` };
  if (last.error && !last.at) return { name, status: 'INFO', value: `확인 실패(오프라인?) — ${last.error}`, note: `재시도: ${cmd}` };
  const when = last.at ? last.at.slice(0, 10) : '?';
  const err = last.error ? ` · 최근 재확인 실패(${last.error})` : '';
  // [WO-29a-4] 실행 가능 항목(auto · 새 review · ⚠)만 "업데이트 있음"을 켠다. 보존 포크·앵커 없음·HOLD·확인된 review 는 숫자로만. 구 캐시(auto 없음)는 전 표기.
  const fresh = last.auto !== undefined;
  const kept = [];
  if (last.forked) kept.push(`보존 포크 ${last.forked}`);
  if (last.unknown) kept.push(`앵커 없음 ${last.unknown}`);
  if (last.held) kept.push(`HOLD ${last.held}`);
  if (fresh && last.review) kept.push(`review ${last.review - (last.reviewNew || 0)} 확인됨`);
  if (!last.updates) {
    if (!fresh) return { name, status: 'INFO', value: `최신(${last.localVer || '?'}, 확인 ${when})${err}` };
    return { name, status: 'INFO', value: `실행할 것 없음(${last.localVer || '?'}${kept.length ? ' · ' + kept.join(' · ') : ''}, 확인 ${when})${err}` };
  }
  const bits = fresh
    ? [last.auto ? `자동 적용 ${last.auto}` : null, last.reviewNew ? `새 review ${last.reviewNew}` : null, last.migrations ? `⚠ 마이그레이션 ${last.migrations}` : null,
      last.localVer && last.upstreamVer && last.localVer !== last.upstreamVer ? `상류 ${last.upstreamVer} · 로컬 ${last.localVer}` : null].filter(Boolean)
    : [`상류 ${last.upstreamVer || '?'} · 로컬 ${last.localVer || '?'}`, `sync ${last.sync || 0}`, `review ${last.review || 0}`, last.migrations ? `⚠ 마이그레이션 ${last.migrations}` : null].filter(Boolean);
  return { name, status: 'INFO', value: `업데이트 있음 — ${bits.join(' · ')}${fresh && kept.length ? ` (그 밖 ${kept.join(' · ')})` : ''} (확인 ${when})${err}`,
    note: `제안문을 사람에게 보이고 승인 뒤 --apply(반영 없이 review 만 봤다면 --ack-review): ${cmd}` };
}

/**
 * upstream 수집 — 캐시(template-sync.json lastCheck)를 읽는다. `opts.refresh` 가 있을 때만, 만료·부재면 그것을 1회 돌린다.
 * **기본은 읽기 전용**: census([TOOL-30])·대시보드·테스트가 gather 를 부르므로 어답터에 쓰기·네트워크 0. 갱신은 health CLI 가 자기 레포에서만 켠다.
 * health 는 동기라 자식 프로세스로(타임아웃 상한). 상류 자신은 대조하지 않는다. 고장은 삼킨다(점수표 생존 — [ADR-28]).
 * opts.refresh: true = 자식 프로세스(template-update --refresh-cache) · 함수 = 주입 · 없음 = 갱신 안 함. opts.now 는 시계 주입.
 */
function gatherUpstream(root, opts = {}) {
  if (isTemplateRepo(root)) return { self: true };
  let tu = null;
  try { tu = require('./template-update'); } catch { /* 어답터가 이 스크립트를 뺐다 */ }
  const read = () => {
    if (tu) return tu.readLastCheck(root);
    try { return JSON.parse(fs.readFileSync(path.join(root, '.union-stack/template-sync.json'), 'utf8')).lastCheck || null; } catch { return null; }
  };
  const now = opts.now || Date.now();
  let last = read();
  const fresh = tu ? tu.isFresh(last, now) : !!last;
  if (!fresh && opts.refresh) {
    const refresh = typeof opts.refresh === 'function' ? opts.refresh : (() => {
      const script = path.join(root, 'scripts', 'template-update.js');
      if (!fs.existsSync(script)) return;
      require('child_process').spawnSync(process.execPath, [script, '--refresh-cache'], { cwd: root, timeout: UPSTREAM_TIMEOUT_MS, stdio: 'ignore' });
    });
    try { refresh(); } catch { /* 네트워크·실행 실패는 INFO 로 남는다 */ }
    last = read();
  }
  return { self: false, last };
}
const UPSTREAM_TIMEOUT_MS = 15000;

function countGuides(root) {
  let n = 0;
  walkFiles(root, '.union-stack', rel => { if (rel.endsWith('/_GUIDE.md')) n++; });
  return n;
}

function gather(root = path.resolve(__dirname, '..'), opts = {}) {
  const index = buildIndex(root);
  const namingViolations = lint(root).length;
  const adapter = loadAdapter(root);
  const hp = path.join(root, '.union-stack/project/HISTORY.md');
  const historyMd = fs.existsSync(hp) ? fs.readFileSync(hp, 'utf8') : '';
  const historyViolations = historyViolationsOf(historyMd).length;
  const historyClarifications = historyClarificationsOf(historyMd).length;
  // 해당 여부는 **측정 대상**이 그 게이트를 갖는가로 정한다([WO-29a-8] — census 가 상류 health 를 root 로 돌릴 때 상류 모듈이
  // 가드를 뺀 어답터를 판정했다: 6회차 A 오탐). 판정 자체는 상류 모듈로 한다(가드가 있는 레포).
  const targetHasGuard = fs.existsSync(path.join(root, 'scripts', 'leakage-guard.js'));
  const leakageViolations = leakageGuard && targetHasGuard
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
  const roadmap = roadmapWiring(index);
  const r = computeHealth({
    index, domainsDefined: [...VALID_DOMAINS], guideCount: countGuides(root),
    namingViolations, historyViolations, historyClarifications, leakageViolations, oversize, brokenRefs, budget,
    sync, lessons: gatherLessons(root), effect: gatherEffectSurface(root), contracts, norms, roadmap, adapter,
    testInfra: gatherTestInfra(root), receiptsInfo: gatherReceipts(root, adapter), retroInfo: gatherRetro(root),
    upstream: gatherUpstream(root, { refresh: !!opts.upstreamRefresh }),
    census: isTemplateRepo(root) ? { round: censusRound.latestRound(root), today: opts.today || new Date().toISOString().slice(0, 10) } : null,
  });
  // 판정(dims) 외에 원자료도 함께 낸다 — 대시보드가 같은 수집을 두 번 하지 않도록(합성 원칙).
  return { ...r, sizes, sizeCapKb: SIZE_CAP_KB, sync, contracts, norms, roadmap, adapter, concerns: concernUsage(index) };
}

/** 회고 트리거 수집([PRO-25] ①) — retro.gather 의 얇은 래퍼. 고장은 null 로(점수표가 통째로 죽지 않게 — [ADR-28]). */
function gatherRetro(root) {
  try { const r = retro.gather(root); return { due: r.due, reasons: r.reasons, indicators: r.indicators, delta: r.delta }; } catch { return null; }
}

/** 영수증 관측 수집([PRO-22] 단계 2) — 선언(adapter.checks)과 receipts.md 를 대조. 순수 계산은 computeReceipts. */
function computeReceipts(checks, recs, today = new Date()) {
  const latest = receipts.latestByName(recs, 'product');
  const blocking = (checks || []).filter(c => c.blocking);
  const rows = blocking.map(c => {
    const r = latest.get(c.name);
    return r ? { name: c.name, date: r.date, age: receipts.ageDays(r.date, today), outcome: r.outcome, targets: r.targets == null ? null : r.targets } : { name: c.name, date: null, age: null, outcome: null, targets: null };
  });
  return { declared: (checks || []).length, blocking: blocking.length, lines: recs.length, latest: rows, missing: rows.filter(r => !r.date).map(r => r.name) };
}
function gatherReceipts(root, adapter) {
  let recs = [];
  try { recs = receipts.parseReceipts(receipts.read(root) || ''); } catch { recs = []; }
  return computeReceipts((adapter && adapter.checks) || [], recs);
}

/**
 * 테스트 인프라 관측([PRO-21] 3단계, 순수 수집). 소프트 의존([ADR-28]) — 카탈로그 부재
 * (어답터 미작성)는 null 로, 층 3 평면 부재는 0 으로 낸다. 고장과 부재를 구별한다.
 */
function gatherTestInfra(root) {
  let testFiles = 0;
  try { testFiles = fs.readdirSync(path.join(root, 'scripts')).filter(f => f.endsWith('.test.js')).length; } catch {}
  let catalogAssets = null;
  try {
    const tc = require('./test-catalog');
    if (fs.existsSync(path.join(root, tc.CATALOG))) catalogAssets = tc.gather(root).length;
  } catch {} // test-catalog 스크립트 부재(구버전 형상) — 무기입이 정직한 값이다
  let flowCases = 0, flowChecked = 0;
  try {
    walkFiles(root, '.union-stack/feature/flow', rel => {
      if (!rel.endsWith('.md') || rel.endsWith('_GUIDE.md')) return;
      const txt = fs.readFileSync(path.join(root, rel), 'utf8');
      flowCases += (txt.match(/^\s*- \[[ xX]\]/gm) || []).length;
      flowChecked += (txt.match(/^\s*- \[[xX]\]/gm) || []).length;
    });
  } catch {}
  let evidenceLast = null;
  try { evidenceLast = lastDateIn(fs.readFileSync(path.join(root, '.union-stack/verification/raw/evidence.md'), 'utf8')); } catch {}
  return { testFiles, catalogAssets, flowCases, flowChecked, evidenceLast };
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
      if (r.external) continue; // 상류 참조(up:)는 로컬 인용이 아니다([PRO-27] ①)
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

/** `--root <dir>` 해석(순수). 없으면 dflt, 값이 비면 null(오용을 조용히 기본값으로 접지 않는다). */
function resolveRoot(argv, dflt) {
  const i = argv.indexOf('--root');
  if (i < 0) return dflt;
  const v = argv[i + 1];
  if (!v || v.startsWith('--')) return null;
  return path.resolve(v);
}

/** 측정 루트 검증 — `.union-stack` 디렉터리가 있어야 측정 대상이다. 없으면 REJECT 재료(엉뚱한 루트 측정 금지). */
function validateRoot(root) {
  if (!root || !fs.existsSync(root)) return { ok: false, reason: `${root}: 경로가 없다 — 측정 대상 아님(.union-stack 없음)` };
  const us = path.join(root, '.union-stack');
  let isDir = false;
  try { isDir = fs.statSync(us).isDirectory(); } catch { /* 없음 */ }
  if (!isDir) return { ok: false, reason: `${root}: .union-stack 디렉터리가 없다 — 측정 대상 아님` };
  return { ok: true, reason: null };
}

function run(argv = process.argv.slice(2)) {
  const dflt = path.resolve(__dirname, '..');
  const root = resolveRoot(argv, dflt);
  if (root === null) { console.error('health: --root <dir> 의 값이 없다.'); return 1; }
  const v = validateRoot(root);
  if (!v.ok) { console.error(`health: REJECT — ${v.reason}`); return 1; }
  const external = root !== dflt;
  // 상류 확인 캐시 갱신은 자기 레포에서만([PRO-29] ①(a)) — `--root` 로 남의 레포를 잴 때는 쓰기·네트워크 0.
  const r = gather(root, { upstreamRefresh: !external && !argv.includes('--offline') });
  if (argv.includes('--json')) { console.log(JSON.stringify({ root, ...r }, null, 2)); return r.fails ? 1 : 0; }
  console.log('# union-stack health\n');
  if (external) {
    // 어답터 평면: 로컬 도메인·설정은 판정이 아니라 INFO([PRO-27] ④ — 상류 enum 을 강제하지 않는다).
    console.log(`  측정 루트: ${root}  (--root — 어답터 평면)`);
    console.log(`  · 어답터 설정 adapter.json: ${r.adapter && r.adapter.present ? '있음' : '없음'}${r.adapter && r.adapter.private ? ' · private' : ''} — INFO\n`);
  }
  for (const d of r.dims) {
    const mark = d.status === 'OK' ? '✓' : d.status === 'FAIL' ? '✗' : d.status === 'WARN' ? '!' : '·';
    console.log(`  ${mark} ${d.name.padEnd(20)} ${d.status.padEnd(5)} ${d.value}${d.note ? '  (' + d.note + ')' : ''}`);
  }
  console.log(`\n도메인 분포: ${Object.entries(r.byDomain).map(([k, v]) => `${k}:${v}`).join(' ')}`);
  console.log(r.healthy ? '\n건강: 게이트 전부 통과.' : `\n건강: 게이트 ${r.fails}건 실패 — 확인 필요.`);
  return r.fails ? 1 : 0;
}

module.exports = { gatherUpstream, upstreamDim, censusDim, computeHealth, gather, gatherSync, gatherLessons, gatherTestInfra, computeReceipts, gatherReceipts, gatherRetro, computeEffectSurface, gatherEffectSurface, parseContract, lastDateIn, resolveRoot, validateRoot, CONTRACT };

if (require.main === module) process.exit(withContract(CONTRACT, argv => run(argv))());
