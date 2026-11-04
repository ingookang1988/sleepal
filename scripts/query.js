// scripts/query.js
// plane 조회의 *순수* 핵심 로직 — CLI / MCP / skill 이 공유한다(로직 1벌, 표면 N개).
// 전부 read-only. 쓰기는 노출하지 않는다(권한 tier·permission-guard 우회 방지).
const { ancestorChain, isDescendant, parseId, isUpstreamRef } = require('./zfs_util');

// PHASE 는 [PRO-19] ②로 편입 — roadmap/_GUIDE 가 선언한 "plan·sprint 의 macro-direction parent"를
// 진입 의례가 실제로 싣게 한다(선언만 있고 수집 대상 밖이던 것이 병인).
const CONTEXT_DOMAINS = new Set(['PLAN', 'FLOW', 'CON', 'ARCH', 'MTG', 'PHASE']);
const LOCKED = new Set(['Verifying']);

const keyOf = d => `${d.domain}-${d.id}`;

/**
 * 조상 합산(순수) — [PRO-27] ③: 조상 = ID 산술 부모(레코드 `arithmetic` 가 false 가 아닐 때) ∪ frontmatter 부모 폐포(`parents`, 순환 가드).
 * 하류 실측: 한 어답터는 ID 산술 루트 0/438(계보는 `plan:` 74%), 다른 어답터는 레거시 번호대가 도메인별 독립 채번 — 산술만 보면 전자는
 * 조상이 없고 후자는 무관한 문서를 상속한다. 선언 부모는 도메인 무관(우산 WO·중간 PLAN·PRO 도 루트가 된다).
 * 반환: { chain(산술 체인), declared(선언 부모 문서들, 발견 순), ids(조상 ID 집합 — 산술 체인 ∪ 선언 부모들의 산술 체인) }
 */
function lineageAncestors(id, index, domain = null) {
  const selfDocs = index.filter(d => d.id === id && (!domain || d.domain === domain));
  const arithmetic = selfDocs.length ? selfDocs.some(d => d.arithmetic !== false) : true;
  const chain = arithmetic ? ancestorChain(id) : [id];
  const byKey = new Map(index.map(d => [keyOf(d), d]));
  const seen = new Set(selfDocs.map(keyOf));
  const declared = [];
  const queue = [...selfDocs];
  while (queue.length) {
    const d = queue.shift();
    for (const p of d.parents || []) {
      if (seen.has(p)) continue;
      seen.add(p);
      const pd = byKey.get(p);
      if (!pd) continue; // 색인 밖(오타·미작성) — 미해소는 work-close 의 parent-missing 이 묻는다
      declared.push(pd);
      queue.push(pd);
    }
  }
  const ids = new Set(chain);
  for (const p of declared) (p.arithmetic !== false ? ancestorChain(p.id) : [p.id]).forEach(x => ids.add(x));
  return { chain, declared, ids };
}

/** Upward Fetching: 부모 계보 맥락(PHASE/PLAN/FLOW/CON/ARCH/MTG + 선언 부모는 도메인 무관) + 같은 계보 LSN. */
function upwardFetch(id, index, domain = null) {
  const { chain, declared, ids } = lineageAncestors(id, index, domain);
  const declaredKeys = new Set(declared.map(keyOf));
  const context = index
    .filter(d => declaredKeys.has(keyOf(d)) || (CONTEXT_DOMAINS.has(d.domain) && ids.has(d.id)))
    .sort((a, b) => a.domain.localeCompare(b.domain) || a.id.localeCompare(b.id))
    .map(d => ({ domain: d.domain, id: d.id, file: d.file, tier: d.tier || null, via: declaredKeys.has(keyOf(d)) ? 'frontmatter' : 'arithmetic' }));
  const lessons = index
    .filter(d => d.domain === 'LSN' && ids.has(d.id))
    .map(d => ({ domain: d.domain, id: d.id, file: d.file, tier: d.tier || null }));
  return { id, chain, declared: declared.map(keyOf), context, lessons };
}

/**
 * upward-fetch 판정(순수) — [PRO-27] ③ 의 일부. 계보 맥락이 0건이면 `(없음)` + PASS 가 아니라 **CLARIFY** 다.
 * "0건 검사 = 통과"는 [PRO-22] 2-bis 와 같은 결함 클래스: 전역 일련번호 WO(산술 조상 0, 계보는 frontmatter 에만)에서
 * 도구가 조용히 빈 결과를 내고 exit 0 하던 것을 하류가 실측했다(SURVEY-02). 차단하지 않는다([ADR-23]) — 질문 한 줄.
 */
function fetchOutcome(r) {
  if (r.context.length) return { outcome: 'PASS', question: null };
  const parents = r.chain.slice(1);
  return {
    outcome: 'CLARIFY',
    question: `계보 맥락 0건 — ${r.id} 의 산술 조상(${parents.length ? parents.join(' → ') : '없음'})에 PHASE/PLAN/FLOW/CON/ARCH/MTG 문서가 없고 `
      + `frontmatter 부모(plan:/parent:)도 ${(r.declared || []).length ? '색인에서 해소되지 않는다' : '선언돼 있지 않다'}. `
      + '기획 없는 구현 진입인가? 부모가 있다면 frontmatter 에 parent:/plan: 으로 선언하라([PRO-27] ③).',
  };
}

/**
 * Blast Radius: 대상의 모든 자손 **+ 선언된 계약 소비자와 그 자손** + 잠금(Verifying) 여부.
 *
 * 계보 자손만 보면 계약의 영향권을 구조적으로 못 본다([PRO-16] §2-A 실측): 계약은 정의상
 * 포함관계가 *아닌* 당사자끼리 공유되므로(FE와 BE는 형제) 소비자는 늘 다른 계보에 있다.
 * 그래서 `consumers:` 로 선언된 계보 밖 간선을 합집합한다. 자손까지 포함하는 것은 보수적
 * 선택이다 — 잠금 검사는 놓치는 것보다 넓은 편이 안전하다([PRO-16] §3-2).
 * 간선은 **계약 → 소비자 한 방향만** 선언한다(양방향은 정본이 둘이 되어 드리프트).
 */
function blastRadius(id, index) {
  const row = d => ({ domain: d.domain, id: d.id, status: d.status || null, file: d.file, ...(d.viaParent ? { viaParent: d.viaParent } : {}) });
  // 산술 자손(산술이 적용되는 문서만 — 레거시 독립 채번 구간은 같은 번호여도 자손이 아니다) + 자기 자신.
  const lineage = index.filter(d => d.id === id || (d.arithmetic !== false && isDescendant(id, d.id)));
  // 선언 자식 폐포([PRO-27] ③): parents 로 이 계보의 문서를 가리키는 문서는 영향권이다(잠금 검사 포함).
  const inLineage = new Set(lineage.map(keyOf));
  for (let grew = true; grew;) {
    grew = false;
    for (const d of index) {
      if (inLineage.has(keyOf(d))) continue;
      const via = (d.parents || []).find(p => inLineage.has(p));
      if (via) { inLineage.add(keyOf(d)); lineage.push({ ...d, viaParent: via }); grew = true; }
    }
  }
  const seen = new Set(lineage.map(d => d.file));
  const viaContract = [];
  const unresolved = [];
  const external = []; // 상류 참조(up:) 소비자 — 로컬 해소 대상이 아니다([PRO-27] ①)
  for (const src of lineage) {
    for (const raw of src.consumers || []) {
      if (isUpstreamRef(raw)) { external.push({ ref: raw, from: src.file }); continue; }
      const cid = parseId(raw);
      const hit = cid ? index.filter(d => isDescendant(cid, d.id)) : [];
      if (!hit.length) { unresolved.push({ ref: raw, from: src.file }); continue; }
      for (const d of hit) {
        if (seen.has(d.file)) continue;
        seen.add(d.file);
        viaContract.push({ ...row(d), via: `${src.domain}-${src.id}` });
      }
    }
  }
  const cmp = (a, b) => a.id.localeCompare(b.id);
  const affected = [...lineage.map(row).sort(cmp), ...viaContract.sort(cmp)];
  const locked = affected.filter(d => LOCKED.has(d.status));
  return { id, affected, locked, blocked: locked.length > 0, viaContract, unresolvedConsumers: unresolved, externalConsumers: external };
}

/**
 * 계약 간선 전수 조사(순수) — [PRO-16]의 채택·무결성 관측.
 *
 * 두 가지를 낸다.
 *  ① **채택**: [PRO-16] §5가 "`consumers:`가 6개월간 실계약에 안 달리면 필드 폐기"라는 반증 조건을
 *     걸었는데 그것을 볼 계기가 없었다. 선언 문서 수·간선 수가 그 계기다.
 *  ② **무결성**: 미해소 소비자는 오타이며, 오타 하나가 잠금 Fail-close 보호를 *조용히* 무력화한다
 *     (blast-radius 는 그 계약을 콕 집어 돌려야만 보인다 — 평면 전수 조사가 없었다).
 * 판정하지 않는다 — 관측만 한다([PRO-11] §4 측도 금지).
 */
function contractEdges(index) {
  const declaring = index.filter(d => (d.consumers || []).length);
  const unresolved = [];
  const byContract = declaring.map(src => {
    const resolved = [];
    for (const raw of src.consumers) {
      const cid = parseId(raw);
      const hit = cid ? index.filter(d => isDescendant(cid, d.id)) : [];
      if (hit.length) resolved.push(raw);
      else unresolved.push({ ref: raw, from: `${src.domain}-${src.id}`, file: src.file });
    }
    // 같은 계보 소비자는 계보 산술이 이미 덮으므로 간선이 무의미하다 — 표면화해 오해를 막는다.
    const redundant = resolved.filter(raw => {
      const cid = parseId(raw);
      return cid && (isDescendant(src.id, cid) || isDescendant(cid, src.id));
    });
    return { id: `${src.domain}-${src.id}`, file: src.file, consumers: src.consumers, resolved, redundant };
  }).sort((a, b) => a.id.localeCompare(b.id));
  return {
    contracts: index.filter(d => d.domain === 'CON').length,
    declaring: declaring.length,
    edges: declaring.reduce((n, d) => n + d.consumers.length, 0),
    resolved: byContract.reduce((n, c) => n + c.resolved.length, 0),
    unresolved,
    redundant: byContract.reduce((n, c) => n + c.redundant.length, 0),
    byContract,
  };
}

// 규범 도메인 — 격자의 당위(ought) 칸. verification 의 첫 화살표(규범↔현실)의 한쪽 끝이다.
const NORM_DOMAINS = new Set(['ARCH', 'INF']);

/**
 * 규범 → 집행자 관측(순수) — 당위 축의 세부.
 *
 * 이 레포는 [PHASE-02] E3 에서 **의례 자발 수행률 0%**를 자기 데이터로 실측했다 — 산문 규칙만으론
 * 강제되지 않는다. 따라서 "어느 규범이 산문뿐인가"는 이미 참으로 증명된 위험을 가리킨다.
 *
 * ⚠ **인용 ≠ 집행.** 문자열 언급으로 추정하므로 [ADR-07]이 겪은 계측 오염과 같은 함정이 있다.
 * 그래서 판정이 아니라 관측이고, 등급도 "집행됨"이 아니라 "게이트 있음"으로 읽어야 한다.
 *
 * enforcers: [{ file, isGate, mentions: ['ARCH-00', …] }] — 호출부가 TOOL 카드의 `impl:` 경로에서
 * 읽어 넘긴다(스크립트 위치를 가정하지 않기 위해 — 카드가 실행 자산의 정본이다).
 * planeCites: { 'ARCH-00': n } — 평면 본문의 브래킷 인용 수.
 */
function normEnforcement(index, enforcers = [], planeCites = {}, docs = {}) {
  const norms = index.filter(d => NORM_DOMAINS.has(d.domain)).map(d => {
    const key = `${d.domain}-${d.id}`;
    const citedBy = enforcers.filter(e => (e.mentions || []).includes(key));
    const gates = citedBy.filter(e => e.isGate);
    // planeCites 는 {count, files} 또는 (구형) 숫자를 받는다 — 호출부 형태에 의존하지 않는다.
    const pc = planeCites[key];
    const plane = typeof pc === 'number' ? { count: pc, files: [] } : (pc || { count: 0, files: [] });
    const grade = gates.length ? 'gated' : (citedBy.length || plane.count) ? 'cited' : 'isolated';
    const doc = docs[key] || {};
    return {
      key, file: d.file, status: d.status || null, tier: d.tier || null, grade,
      title: doc.title || null, headings: doc.headings || [], kb: doc.kb || 0,
      gates: gates.map(e => e.file),
      // 집행자의 계약을 규범 옆에 둔다 — [PRO-11]의 존재 이유가 "무엇을 *안* 보는지(scope)가
      // 호출부에서 읽혀야 한다"이고, 규범 페이지가 바로 그 호출부다.
      gateContracts: gates.filter(e => e.contract).map(e => ({ file: e.file, ...e.contract })),
      cites: citedBy.map(e => e.file),
      codeCites: citedBy.length, planeCites: plane.count, planeFiles: plane.files,
    };
  }).sort((a, b) => a.key.localeCompare(b.key));
  const count = g => norms.filter(n => n.grade === g).length;
  return { norms, total: norms.length, gated: count('gated'), cited: count('cited'), isolated: count('isolated') };
}

// WO/PLAN 의 종결 상태 — roadmapWiring 이 "활성"을 거를 때 쓴다(frontmatter status 가 정본).
const TERMINAL = new Set(['Closed', 'Crystallized']);

/**
 * 로드맵 배선 관측(순수) — [PRO-19] ②. 판정·점수 없음([PRO-11] §4 측도 금지).
 * roadmap/_GUIDE 는 PHASE 를 plan·sprint 의 macro-direction parent 로 선언하지만 그 부모 관계를
 * 보는 계기가 없었다(sprint/ 전체에 PHASE 언급 0건 실측). 양방향 정체를 표면화한다:
 *   unanchored — 활성 PLAN/WO/WF 인데 계보 뿌리에 PHASE 가 없다(마일스톤 밖의 작업).
 *   stale     — 어떤 활성 계보도 내려오지 않는 PHASE(정체 중이거나 종료 처리 누락).
 * 쓰기는 강제하지 않는다 — roadmap 은 Schema(인간 소유)라 갱신은 신호를 본 인간의 몫.
 */
function roadmapWiring(index) {
  const phases = index.filter(d => d.domain === 'PHASE');
  const active = index.filter(d => ['PLAN', 'WO', 'WF'].includes(d.domain) && !TERMINAL.has(d.status));
  const key = d => `${d.domain}-${d.id}`;
  // PHASE 도달 = 합산 조상([PRO-27] ③) — 산술로도, plan:/parent: 선언으로도 닿으면 배선된 것이다.
  const reach = w => lineageAncestors(w.id, index, w.domain).ids;
  const reached = new Map(active.map(w => [key(w), reach(w)]));
  const unanchored = active.filter(w => !phases.some(p => reached.get(key(w)).has(p.id))).map(key);
  const stale = phases.filter(p => !active.some(w => reached.get(key(w)).has(p.id))).map(key);
  return { phases: phases.length, active: active.length, unanchored, stale };
}

/** `concern:` 오버레이 채택 관측(순수) — [PRO-04]가 승인했으나 사용 실태를 볼 계기가 없었다. */
function concernUsage(index) {
  const byTag = {};
  let tagged = 0;
  for (const d of index) {
    const tags = d.concerns || [];
    if (!tags.length) continue;
    tagged++;
    for (const t of tags) byTag[t] = (byTag[t] || 0) + 1;
  }
  return { tagged, total: index.length, byTag };
}

// 과거·결정 라우팅(P1-A 결정 트리). find()가 첫 매칭을 반환하므로 *더 구체적인* 분기가 앞선다.
const ROUTES = [
  { keys: ['ephemeral', 'session', 'progress', 'handoff', 'relay'], destination: '.union-stack/sprint/HANDOFF.md', tier: 'Wiki (volatile)', note: '다음 세션이 이어받을 휘발성 진행' },
  // 환경·머신·크로스레포 사실은 lessons *앞*에 둔다 — 둘 다 "failure/repeat"를 포함하므로 순서가 경계다([ADR-11]).
  { keys: ['environment', 'machine', 'tooling-quirk', 'toolquirk', 'cross-repo', 'crossrepo', 'preference', 'workflow-quirk'], destination: 'agent-platform cross-session memory (예: Claude Code MEMORY.md — 비커밋·사용자 전역)', tier: 'Private (off-plane)', note: '환경/크로스레포 반복 사실·선호 → 사적 메모리. 커밋 평면 아님(누설 방지). 레포 특정이면 lessons로.' },
  { keys: ['failure', 'repeat', 'pitfall', 'lesson', 'bug', 'mistake'], destination: '.union-stack/reference/lessons/LSN-*', tier: 'Wiki', note: '같은 계보 2~3회 반복 실패 → 사전경고. 단 *레포/제품* 특정만 — 환경 특정은 위 사적 메모리로.' },
  { keys: ['proposal', 'rule', 'harness', 'process'], destination: '.union-stack/proposals/PRO-*', tier: 'Proposal', note: '하네스 규칙/프로세스 변경 제안' },
  { keys: ['decision', 'adr', 'tactical'], destination: '.union-stack/archive_ledger.md', tier: 'Raw (append-only)', note: '전술적 결정(작업/ZFS 단위)' },
  { keys: ['pivot', 'strategic', 'turning', 'direction', 'dependency', 'history'], destination: '.union-stack/project/HISTORY.md', tier: 'Schema/Raw', note: '전략적 분기점(사실+근거)' },
];

/** where_to_record: kind 키워드 → 목적지. 매칭 + 전체 표 반환. */
function whereToRecord(kind) {
  const k = String(kind || '').toLowerCase();
  const r = ROUTES.find(route => route.keys.some(key => k.includes(key)));
  const strip = ({ keys, ...rest }) => rest;
  return { kind, match: r ? strip(r) : null, all: ROUTES.map(strip) };
}

module.exports = { upwardFetch, lineageAncestors, fetchOutcome, blastRadius, contractEdges, normEnforcement, concernUsage, roadmapWiring, whereToRecord, CONTEXT_DOMAINS, LOCKED, NORM_DOMAINS };
