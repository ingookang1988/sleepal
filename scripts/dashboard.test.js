// scripts/dashboard.test.js
// 섹션 함수(순수) 단위 + 실평면 합성 스모크. 대시보드는 *합성*이므로 여기서는 그리기만 검증한다 —
// 데이터의 옳음은 각 소스 도구의 테스트(health·context-budget·work-close·lineage-tree)가 소유한다.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { tilesSection, healthSection, budgetSection, worktableSection,
  sizeSection, syncSection, effectSection, contractSection, normCard, normView,
  gatherSprint, sprintView, gatherTime, timeView,
  gatherProduct, productView, parseExitCriteria, parseLiveRows,
  esc, prose, clip, gistOf, closeDanglingMarker,
  loadSections, renderSection, buildViews, render, gatherAll, VIEWS } = require('./dashboard');

let pass = 0, fail = 0;
function check(label, cond) { if (cond) pass++; else { fail++; console.error(`FAIL ${label}`); } }

// tilesSection — 스탯 타일: 게이트 통과/실패, 잠금 카운트, 예산 초과 강조
const tileData = {
  index: [{ domain: 'A', id: '1', status: 'Verifying' }, { domain: 'B', id: '2', status: 'Draft' }],
  health: { fails: 0, warns: 1 },
  budget: { total: 100, totalCap: 4000, over: 0 },
  wos: [{ id: '1', status: 'Draft', malformed: false }],
};
const ts = tilesSection(tileData);
check('tiles: 4개', (ts.match(/class="tile"/g) || []).length === 4);
check('tiles: 게이트 통과(good)', ts.includes('통과') && ts.includes('tv good'));
check('tiles: 잠금 카운트', ts.includes('1 Verifying'));
const tsBad = tilesSection({ ...tileData, health: { fails: 2, warns: 0 }, budget: { total: 5000, totalCap: 4000, over: 1 } });
check('tiles: 게이트 실패(bad) + 예산 초과', tsBad.includes('2 실패') && tsBad.includes('초과 1'));

// healthSection — 판정 마크는 글리프+단어(색 단독 금지), FAIL 이 보인다
const hFix = {
  dims: [
    { name: 'naming gate', status: 'OK', value: '0 violations' },
    { name: 'leakage gate', status: 'FAIL', value: '1 unmarked', note: 'x.md' },
    { name: 'tier distribution', status: 'INFO', value: 'draft:0' },
  ],
  byDomain: { PLAN: 1 }, fails: 1, warns: 0, healthy: false,
};
const hs = healthSection(hFix);
check('health: FAIL 글리프+단어', hs.includes('✗ FAIL') && hs.includes('leakage gate'));
check('health: 실패 판정문', hs.includes('게이트 1건 실패'));
check('health: note 표기', hs.includes('x.md'));
const hOk = healthSection({ dims: [], byDomain: {}, fails: 0, warns: 0, healthy: true });
check('health: 통과 판정문', hOk.includes('게이트 전부 통과'));

// budgetSection — OVER 강조, 바 폭은 100% 상한
const bs = budgetSection({
  rows: [
    { name: 'project', tokens: 500, budget: 2000, status: 'OK' },
    { name: 'handoff', tokens: 3000, budget: 1500, status: 'OVER' },
  ], total: 3500, totalCap: 4000, over: 1,
});
check('budget: OVER 표기', bs.includes('OVER') && bs.includes('초과 1건'));
check('budget: 바 폭 상한 100%', bs.includes('width:100%') && !bs.includes('width:200%'));

// worktableSection — 활성만, 빈 목록 처리, frontmatter 자유 문자열 이스케이프
check('worktable: 빈 목록', worktableSection([]).includes('활성 WO 없음'));
const ws = worktableSection([
  { id: '10a-1', title: 'E6 <b>x</b>', parent: 'PRO-10', status: 'Draft', evidence: 'none — "이유"', closed_by: [], malformed: false },
  { id: '01a-1', title: '닫힌 것', parent: 'PLAN-01a', status: 'Closed', evidence: 'ok', closed_by: [], malformed: false },
]);
check('worktable: 활성만 표시(Closed 제외)', ws.includes('[WO-10a-1]') && !ws.includes('[WO-01a-1]'));
check('worktable: 제목 이스케이프', !ws.includes('<b>x</b>') && ws.includes('&lt;b&gt;'));
const wm = worktableSection([{ id: null, file: 'sprint/broken.md', malformed: true, closed_by: [] }]);
check('worktable: malformed 경고', wm.includes('frontmatter 없는 WO 1건'));

// sizeSection — 헤드룸: 초과·근접·정상 3단계, 빈 입력은 조각 없음
check('size: 빈 입력 → 조각 없음', sizeSection([], 30) === '');
const ss = sizeSection([
  { file: 'a/over.md', kb: 35 }, { file: 'a/near.md', kb: 27 }, { file: 'a/ok.md', kb: 3 },
], 30);
check('size: 초과 강조', ss.includes('bover') && ss.includes('초과 1'));
check('size: 80% 근접 계수', ss.includes('근접 1건') && ss.includes('bnear'));
check('size: 바 폭 상한 100%', ss.includes('width:100%') && !ss.includes('width:116%'));
check('size: 파일명만 표기(경로는 title)', ss.includes('>over.md<') && ss.includes('title="a/over.md"'));

// syncSection — 무기입은 "지연"이 아니라 죽은 평면, 경과일은 today 주입으로 결정적
const sy = syncSection({
  planes: [{ name: 'gap', last: null }, { name: 'evidence', last: '2026-08-18' }, { name: 'old', last: '2026-06-01' }],
  ledgerEntries: 26, ledgerLast: '2026-08-18',
}, '2026-08-18');
check('sync: 무기입 별도 표시', sy.includes('무기입') && sy.includes('pill dead'));
check('sync: 당일은 "오늘"', sy.includes('오늘') && sy.includes('fresh'));
check('sync: 30일 이상은 stale', sy.includes('stale') && sy.includes('78일'));
check('sync: 무기입 카운트', sy.includes('무기입 1면'));
check('sync: 없는 입력 → 조각 없음', syncSection(null, '2026-08-18') === '');

// effectSection — byTool 텍스트를 막대로, 최대값 기준 정규화
const es2 = effectSection({ value: 'allow 92', note: 'Bash:41 WebFetch:40 Skill:2  ← .claude/settings.local.json' });
check('effect: 도구 3종 파싱', (es2.match(/class="brow"/g) || []).length === 3);
check('effect: 최대값이 100%', es2.includes('width:100%'));
check('effect: 파일 경로는 막대가 되지 않음', !es2.includes('settings.local.json<'));
check('effect: 없는 입력 → 조각 없음', effectSection(null) === '' && effectSection({ value: 'x' }) === '');

// contractSection — 그래프가 아니라 채택·무결성 표면([PRO-16] §5 계기)
check('contract: 계약 없으면 조각 없음', contractSection({ contracts: 0, byContract: [], unresolved: [] }) === '');
check('contract: null 안전', contractSection(null) === '');
const cs = contractSection({
  contracts: 3, declaring: 1, edges: 3, resolved: 2, redundant: 1,
  unresolved: [{ ref: 'FLOW-99z', from: 'CON-05', file: 'c.md' }],
  byContract: [{ id: 'CON-05', file: 'c.md', consumers: ['FLOW-07b', 'FLOW-05a', 'FLOW-99z'], resolved: ['FLOW-07b', 'FLOW-05a'], redundant: ['FLOW-05a'] }],
});
check('contract: 미해소 강조', cs.includes('미해소 1') && cs.includes('pill dead'));
check('contract: 동일계보를 무의미로 표기', cs.includes('동일계보') && cs.includes('pill aging'));
check('contract: 해소는 fresh', cs.includes('pill fresh'));
check('contract: 미선언 계약 수', cs.includes('미선언 2'));
const csEmpty = contractSection({ contracts: 2, declaring: 0, edges: 0, resolved: 0, redundant: 0, unresolved: [], byContract: [] });
check('contract: 간선 0이면 반증 조건 관측 문구', csEmpty.includes('[PRO-16] §5'));

// normView — 당위 축 전용 페이지: 등급 3분 + 절 구조 + 게이트 계약 + 인용처 + 드리프트 + concern
check('norm: 규범 없으면 안내 카드', normView({ total: 0, norms: [] }).includes('이 축은 아직 비어 있다'));
const nv = normView(
  { total: 3, gated: 1, cited: 1, isolated: 1, norms: [
    { key: 'ARCH-00', file: 'a/ARCH-00_x.md', title: 'ZFS naming', status: 'Active', tier: null, kb: 3.1,
      grade: 'gated', headings: ['Filename formula', 'Rules'],
      gates: ['scripts/leakage-guard.js'],
      gateContracts: [{ file: 'scripts/leakage-guard.js', gate: 'Leakage Gate', predicate: '마커 보유',
        scope: '마커의 존재만 본다 — 기밀을 이해하지 않는다', outcomes: ['PASS', 'REJECT'], failure_mode: '목록 출력 후 REJECT' }],
      cites: ['scripts/leakage-guard.js'], codeCites: 1, planeCites: 2, planeFiles: ['p/PRO-02_x.md'] },
    { key: 'ARCH-01', file: 'b.md', title: null, status: 'Active', tier: 'draft', kb: 0.7,
      grade: 'cited', headings: [], gates: [], gateContracts: [], cites: [], codeCites: 0, planeCites: 2, planeFiles: ['x.md'] },
    { key: 'INF-02', file: 'c.md', title: null, status: null, tier: null, kb: 1,
      grade: 'isolated', headings: [], gates: [], gateContracts: [], cites: [], codeCites: 0, planeCites: 0, planeFiles: [] },
  ] },
  { planes: [{ name: 'gap', last: null }, { name: 'state', last: null }, { name: 'evidence', last: '2026-08-19' }] },
  { tagged: 0, total: 10, byTag: {} });
check('norm: 타일 4개', (nv.match(/class="tile"/g) || []).length === 4);
check('norm: 등급 3분 라벨', nv.includes('게이트 있음') && nv.includes('인용만') && nv.includes('고립'));
check('norm: 절 구조 표기', nv.includes('Filename formula') && nv.includes('Rules'));
check('norm: 게이트 계약의 scope 를 규범 옆에', nv.includes('사각지대') && nv.includes('마커의 존재만 본다'));
check('norm: 계약 결과값', nv.includes('PASS') && nv.includes('REJECT'));
check('norm: 게이트 없으면 명시', nv.includes('판정하는 게이트 없음'));
check('norm: 인용처를 파일명으로', nv.includes('PRO-02_x.md') && nv.includes('leakage-guard.js'));
check('norm: 인용≠집행 경고', nv.includes('인용은 집행이 아니다'));
check('norm: 드리프트 무기입이면 "대조된 적 없다"', nv.includes('0건이 현실과 대조된 적 없다'));
check('norm: 드리프트는 gap·state만(evidence 제외)', nv.includes('>gap<') && !nv.includes('>evidence<'));
check('norm: concern 미사용 표기', nv.includes('사용 0'));
check('norm: title 없으면 빈 문자열로 축약', nv.includes('ARCH-01'));
const nvOk = normView(
  { total: 1, gated: 1, cited: 0, isolated: 0, norms: [{ key: 'ARCH-00', file: 'a.md', title: 't', status: 'Active', tier: null, kb: 1,
    grade: 'gated', headings: [], gates: ['g.js'], gateContracts: [], cites: ['g.js'], codeCites: 1, planeCites: 0, planeFiles: [] }] },
  { planes: [{ name: 'gap', last: '2026-08-19' }, { name: 'state', last: '2026-08-19' }] },
  { tagged: 2, total: 5, byTag: { security: 2 } });
check('norm: 검증됐으면 경고 없음', !nvOk.includes('대조된 적 없다') && nvOk.includes('대조 기록 있음'));
check('norm: concern 태그 집계 표기', nvOk.includes('security'));

// normCard — 개요용 요약(세부는 arch 페이지로 링크). 개요 정보를 버리지 않는 것이 요구사항.
const nc = normCard(
  { total: 2, gated: 1, cited: 1, isolated: 0, norms: [
    { key: 'ARCH-00', file: 'a.md', grade: 'gated', gates: ['scripts/g.js'], codeCites: 1, planeCites: 2 },
    { key: 'INF-01', file: 'b.md', grade: 'cited', gates: [], codeCites: 0, planeCites: 1 },
  ] },
  { planes: [{ name: 'gap', last: null }, { name: 'state', last: null }] },
  { tagged: 0, total: 5, byTag: {} });
check('normCard: 등급 요약', nc.includes('게이트 1') && nc.includes('인용만 1'));
check('normCard: arch 로 가는 자세히 링크', nc.includes('data-nav="arch"') && nc.includes('자세히'));
check('normCard: 규범 없으면 조각 없음', normCard({ total: 0, norms: [] }) === '');

// VIEWS — 축 하나 = 페이지 하나. 새 축 추가는 이 배열에 한 줄. 계보는 개요가 보유(별도 페이지 아님).
check('views: 5개 정의(개요·제품·arch·sprint·time)', VIEWS.length === 5 && VIEWS[0].id === 'overview');
check('views: 축 전부 포함', ['product', 'arch', 'sprint', 'time'].every(id => VIEWS.some(v => v.id === id)));

// sprintView — 축의 짝은 종료 의례: WO 닫힘 조건 + HANDOFF 인계 상태
check('sprint: 없는 입력 → 조각 없음', sprintView(null) === '');
const spFix = {
  wos: [
    { id: '01a-1', file: 'sprint/a.md', title: '열린 것<b>x</b>', status: 'Draft', parent: 'PLAN-01a',
      evidence: 'none — 아직', closed_by: [], malformed: false,
      closure: { issues: [{ code: 'no-trace', outcome: 'CLARIFY', msg: '흔적이 비었다' }], info: [] } },
    { id: '02b-1', file: 'sprint/b.md', title: '닫힐 수 있는 것', status: 'Verifying', parent: 'PLAN-02b',
      evidence: 'npm test 32/34', closed_by: ['.union-stack/feature/live.md'],
      malformed: false, closure: { issues: [], info: ['부모 전이 후보'] } },
    { id: null, file: 'sprint/broken.md', malformed: true, closed_by: [] },
  ],
  handoff: { session: 's-2026', date: '2026-08-19T00:00:00Z', verification: '32/34 통과',
    findings: [], tokens: 1249, budget: 1500 },
  archived: 3,
};
const sp = sprintView(spFix, '2026-08-19');
check('sprint: 타일 — 충족/활성 비율', sp.includes('1/2') && sp.includes('종료 의례 통과 가능'));
check('sprint: 잠금 타일', sp.includes('Verifying 🔒'));
check('sprint: 아카이브 계수', sp.includes('>3<'));
check('sprint: 닫힘 미충족 사유(work-close CLARIFY)', sp.includes('닫힘 미충족') && sp.includes('흔적이 비었다'));
check('sprint: 충족 WO 는 명시', sp.includes('지금 닫아도 종료 의례를 통과한다'));
check('sprint: 증거 3분 — none 은 사유 명시', sp.includes('none — 사유 명시') && sp.includes('>있음<'));
check('sprint: 상위 흔적 파일명', sp.includes('live.md'));
check('sprint: 부모 전이 참고', sp.includes('부모 전이 후보'));
check('sprint: 제목 이스케이프', !sp.includes('<b>x</b>') && sp.includes('&lt;b&gt;'));
check('sprint: malformed 카드', sp.includes('frontmatter 없음'));
check('sprint: HANDOFF 5부·토큰·검증란', sp.includes('완비') && sp.includes('1249/1500') && sp.includes('32/34 통과'));
check('sprint: HANDOFF 80% 근접 호박', sp.includes('bnear'));
const spNoHo = sprintView({ wos: [], handoff: null, archived: 0 }, '2026-08-19');
check('sprint: HANDOFF 부재는 끊긴 인계로 표시', spNoHo.includes('인계가 끊겨 있다'));

// timeView — 시간축 3층: LSN(사전 경고) · 원장(전술+차단) · HISTORY(전략)
check('time: 없는 입력 → 조각 없음', timeView(null) === '');
const tmFix = {
  adrs: [
    { date: '2026-08-18', id: 'ADR-23', text: '결정 하나 — 상세는 생략' },
    { date: '2026-08-18', id: 'ADR-24', text: '결정 둘' },
    { date: '2026-08-19', id: 'ADR-25', text: 'x'.repeat(100) },
  ],
  history: [
    { date: '(예시) 2026-01', fact: '더미', reason: '이유', note: '', example: true },
    { date: '2026-06-15', fact: 'v6.0 승격', reason: '법칙 확인', note: '후속 필수', example: false },
  ],
  lessons: [
    { file: 'l/LSN-01a_x.md', id: 'LSN-01a', title: '반복 함정<b>x</b>', status: 'Active', occurrences: '3', valid_reason: '아직 미강제' },
    { file: 'l/broken.md', malformed: true },
  ],
  blocks: [{ id: 'ADR-25', blocks: '분리 재제안', reopen_when: '오탐 실측 시' }],
};
const tm = timeView(tmFix, '2026-08-19');
check('time: 타일 — 전술/전략/오답/차단', tm.includes('>3<') && tm.includes('전략 분기점') && tm.includes('재제안 차단'));
check('time: 전략 타일은 예시 제외 계수', tm.includes('예시 1 별도'));
check('time: 밀도 — 날짜별 계수', tm.includes('2026-08-18') && tm.includes('3 결정 / 2 일'));
check('time: 밀도 최대값 100%', tm.includes('width:100%'));
check('time: 최근 결정 요지 절단(72자+…)', tm.includes('…'));
check('time: 차단 표식이 결정 옆에', tm.includes('⛔') && tm.includes('재개 조건: 오탐 실측 시'));
check('time: LSN 반복 횟수·유효 사유', tm.includes('반복') && tm.includes('3회') && tm.includes('아직 미강제'));
check('time: LSN 제목 이스케이프', !tm.includes('<b>x</b>') && tm.includes('&lt;b&gt;'));
check('time: malformed LSN 표시', tm.includes('frontmatter 없음'));
check('time: HISTORY 사실+근거 쌍', tm.includes('v6.0 승격') && tm.includes('왜: 법칙 확인') && tm.includes('시사점: 후속 필수'));
check('time: HISTORY 예시 행은 흐리게', tm.includes('frow dim'));

// --- prose: 평면 산문 인용 전용 미니 마크다운 ---
// 실측 증상: 제품 축 진입점 카드가 HANDOFF §3 을 마크다운 원문 그대로 노출했다
// (`> ### 🎯 **…**` 가 문자로). 관객이 PO 인 표면에서 마커는 순수한 소음이다.
const REPORTED = [
  '> ### 🎯 **인생록 Stage 1(MDWF 직렬화) 재구축** (무과금) — 이월, 변동 없음',
  'webapp `serialize-saju-traits` 경로로 … **다람쥐 판정**과 **차트 2 확장**의 선행.',
].join('\n');
const rendered = prose(REPORTED);
check('prose: 헤딩 줄은 통째로 굵고 <b> 중첩이 없다',
  rendered.includes('<b>🎯 인생록 Stage 1(MDWF 직렬화) 재구축 (무과금) — 이월, 변동 없음</b>')
  && !rendered.includes('<b><b>'));
check('prose: 행두 인용은 스타일로 옮긴다(마커 소멸)', rendered.includes('<span class="q">') && !rendered.includes('&gt; ###'));
check('prose: 인라인 코드 → <code>', rendered.includes('<code>serialize-saju-traits</code>'));
check('prose: 본문 볼드 → <b>', rendered.includes('<b>다람쥐 판정</b>') && rendered.includes('<b>차트 2 확장</b>'));
check('prose: 마크다운 마커가 원문으로 남지 않는다', !/\*\*|`|^#|&gt; /m.test(rendered.replace(/<[^>]*>/g, '')));
check('prose: 개행 → <br>', rendered.includes('<br>'));

// 안전: 이스케이프가 먼저다 — 살아남는 태그는 prose 가 만든 것뿐이다.
check('prose: HTML 주입 차단', prose('<script>alert(1)</script>') === '&lt;script&gt;alert(1)&lt;/script&gt;');
check('prose: 속성 깨짐 방지(따옴표 이스케이프)', prose('a"b').includes('&quot;'));
check('prose: 코드 스팬 안의 마커는 보존', prose('`**리터럴**`') === '<code>**리터럴**</code>');
// 이해 못 하는 문법은 원문 그대로 — 오렌더보다 원문 노출이 낫다(기존 성질 보존).
check('prose: 짝 없는 볼드는 원문 유지', prose('열고 **안 닫음') === '열고 **안 닫음');
check('prose: 이탤릭·링크 문법은 손대지 않는다', prose('*i* 와 [PLAN-01a] 와 [t](u)') === '*i* 와 [PLAN-01a] 와 [t](u)');
check('prose: 빈 입력·null 은 빈 문자열', prose('') === '' && prose(null) === '' && prose(undefined) === '');
check('prose: 마커 없는 산문은 esc 와 같다', prose('평범한 한 줄') === esc('평범한 한 줄'));

// 절단이 깨뜨린 마커는 **닫는다**(떼어내지 않는다) — 내용을 지우지 않으면서 폴백 노출을 막는다.
check('closeDanglingMarker: 짝 맞으면 그대로', closeDanglingMarker('`a` **b**') === '`a` **b**');
check('closeDanglingMarker: 짝 없는 볼드를 닫는다', closeDanglingMarker('앞 **강조') === '앞 **강조**');
check('closeDanglingMarker: 짝 없는 코드도 닫는다', closeDanglingMarker('앞 `코드') === '앞 `코드`');
check('clip: 상한 이하면 그대로', clip('짧다', 10) === '짧다');
check('clip: 짝이 맞으면 그대로 자른다', clip('`ok` 이어지는 긴 문장', 8).startsWith('`ok`'));
// 회귀: 여는 마커가 맨 앞이면 "경계까지 물러나기"는 텍스트를 통째로 지웠다(빈 문자열 + 말줄임).
check('clip: 여는 마커가 맨 앞이어도 내용이 남는다',
  clip('**강조가 문장 전체를 감싼 아주 긴 제목**', 12) === '**강조가 문장 전체를**…');
check('clip: 잘린 코드 스팬은 닫혀서 코드로 읽힌다',
  prose(clip('앞 `long-code-span` 뒤', 10)).includes('<code>'));
check('절단 + prose 조합에 원문 마커가 남지 않는다',
  !/\*\*|`/.test(prose(clip('앞 `long-code-span` 뒤', 10)).replace(/<[^>]*>/g, '')));

// gistOf: 절단은 **두 번** 일어난다 — 구분자와 길이. 자른 쪽이 자기가 깨뜨린 마커를 수습한다.
// 회귀(어답터 실측): 관례가 `**제목 — 부제**` 면 구분자 절단만으로 여는 `**` 가 남고,
// 조각이 상한보다 짧아 길이 절단이 손댈 기회조차 없었다 — 원장 요지 15건이 원문 노출됐다.
const SPLIT_BOLD = '**상류 union-stack 이슈 5건 게시 — 어답터↔템플릿 경계 분리(설정·앵커·확장점).**';
check('gistOf: 구분자 절단이 깨뜨린 볼드를 닫는다', gistOf(SPLIT_BOLD, 80) === '**상류 union-stack 이슈 5건 게시**');
check('gistOf: 그 결과에 원문 마커가 없다',
  !/\*\*|`/.test(prose(gistOf(SPLIT_BOLD, 80)).replace(/<[^>]*>/g, '')));
check('gistOf: 상류 관례(`**제목** — 부제`)도 그대로 동작', gistOf('**제목** — 부제', 80) === '**제목**');
check('gistOf: 구분자가 없으면 길이 절단만', gistOf('구분자 없는 아주 긴 한 줄짜리 요약문', 8).endsWith('…'));
// 자르지 않았으면 손대지 않는다 — 원문의 짝 없는 마커는 작성자의 것이다(prose 안전 폴백 소관).
check('gistOf: 안 자르면 원문 유지', gistOf('짝 없는 **마커가 원문에 있음', 80) === '짝 없는 **마커가 원문에 있음');

// --- 제품 축(이슈 #5) — PO 의 네 질문. 어답터 무가정: 평면 데이터만 소비한다 ---
// parseExitCriteria: 기준은 **키워드로 시작하는 줄**만. 본문의 단순 언급까지 세면 진행률이 부푼다.
const phaseFix = [
  '# [PHASE-09] 예시 단계',
  '> 인용문에 exit gate 라는 말이 있어도 기준이 아니다.',
  '### E1 — 첫 워크스트림 ✅',
  '- Exit: 반증 가능한 효능 표.',
  '### E2 — 둘째 워크스트림',
  '- Exit: 100노드 평면 precision ≥ 임계.',
  '### E3 — 셋째',
  '- 승격 게이트: 핵심 플로우 E2E 통과.',
  '## 진행 상태',
  '- **[E3] ✅ 완료** — 별도 절에 적힌 완료 표식도 읽는다.',
  '- 네 워크스트림 전부 exit gate 충족이라고 *서술*만 한 줄은 기준이 아니다.',
].join('\n');
const ex = parseExitCriteria(phaseFix);
check('exit: 기준 3건만(인용문·서술 언급 제외)', ex.length === 3);
check('exit: 헤딩 ✅ 가 충족을 준다', ex[0].done === true);
check('exit: 미표식은 미충족', ex[1].done === false);
check('exit: 진행 상태 절의 토큰 완료 표식도 읽는다', ex[2].done === true);
check('exit: 라벨은 벗겨진다', ex[0].text === '반증 가능한 효능 표.');
check('exit: 빈 문서 → 0건(기준 없음은 달성이 아니다)', parseExitCriteria('').length === 0);

// parseLiveRows: 헤더·구분선 제외, 더미 표시
const liveRows = parseLiveRows('| Feature | ZFS Ref | Status |\n|---|---|---|\n| (예시) 로그인 | [PLAN-01a] | (더미) |\n| 결제 | [PLAN-02] | Live |');
check('live: 데이터 행만 2건', liveRows.length === 2);
check('live: 예시 표시', [liveRows[0].example, liveRows[1].example].join() === 'true,false');
check('live: 컬럼 매핑', liveRows[1].feature === '결제' && liveRows[1].ref === '[PLAN-02]' && liveRows[1].status === 'Live');
// 헤더 판정은 어휘가 아니라 **다음 줄이 구분선**이다. 회귀(어답터 실측): 존별 표 13개의
// 한국어 헤더가 하나도 안 걸러져 배송 계수가 109 → 122 로 부풀었다(표시가 아니라 숫자가 틀림).
const multiTable = [
  '## 존 A', '| 기능 | ZFS Ref | 상태 |', '|---|---|---|', '| 관광지 | [PLAN-02a] (`/attractions`) | Live |',
  '', '## 존 B', '| 기능 | ZFS Ref | 상태 |', '|---|---|---|', '| 결제 | [PLAN-03] | Live |',
].join('\n');
const multi = parseLiveRows(multiTable);
check('live: 표가 여럿이어도 헤더는 전부 걸러진다', multi.length === 2);
check('live: 한국어 헤더도 걸러진다', !multi.some(r => r.feature === '기능'));
check('live: 두 번째 표의 데이터도 잡힌다', multi.map(r => r.feature).join() === '관광지,결제');
check('live: 구분선 없는 표는 헤더를 못 알아본다(마크다운 계약)', parseLiveRows('| a | b |').length === 1);

const prodFix = {
  phases: [
    { key: 'PHASE-01', file: 'p1', status: 'Crystallized', title: '지난 단계', exits: [{ text: 'a', done: true }], example: false },
    { key: 'PHASE-02', file: 'p2', status: 'Active', title: '현재 단계<b>x</b>', exits: [{ text: 'b', done: false }, { text: 'c', done: true }], example: false },
  ],
  live: [{ feature: '결제', ref: '[PLAN-02]', status: 'Live', example: false }],
  plans: [{ domain: 'PLAN', id: '02', slug: 'payment', status: 'Active' }],
  now: [{ id: '02a-1', title: '결제 배선', status: 'Active', parent: 'PLAN-02' }],
  next: [{ id: '02a-2', title: '정산', status: 'Draft', parent: 'PLAN-02' }],
  verifying: [{ id: '02a-3', title: '검증 중', status: 'Verifying', parent: 'PLAN-02' }],
  shipped: [{ id: 'ADR-07', date: '2026-08-01', text: '결제 벤더 교체 — 정산 주기' }],
  locked: [{ domain: 'WO', id: '02a-3', slug: 'verify', status: 'Verifying' }],
  entry: '→ 정산 배선부터',
  cautions: '- 벤더 API 레이트리밋 미확인',
  debts: [{ name: 'file size', status: 'WARN', value: '1 > 30KB', note: 'ledger:31KB' }],
  archived: 4,
};
prodFix.current = prodFix.phases[1];
prodFix.latest = prodFix.phases[1];
const pv = productView(prodFix, '2026-08-20');
check('product: 타일 4개', (pv.match(/class="tile"/g) || []).length === 4);
check('product: 현재 단계 타일', pv.includes('PHASE-02') && pv.includes('현재 단계'));
check('product: 로드맵 진행 = exit 충족/전체', pv.includes('2/3'));
check('product: Now/Next/검증 대기 보드', pv.includes('Now — 진행 중') && pv.includes('Next — 대기') && pv.includes('Verifying(잠금)'));
check('product: WO 가 보드에 뜬다', pv.includes('[WO-02a-1]') && pv.includes('[WO-02a-2]') && pv.includes('[WO-02a-3]'));
check('product: 단일 진입점은 HANDOFF §3', pv.includes('정산 배선부터'));
check('product: 최근 배송 = 원장 + live', pv.includes('ADR-07') && pv.includes('결제'));
// live 는 표의 세 열이 전부 평면 산문이다 — 열마다 처리가 달라선 안 된다(같은 행에서 한 열만
// 마커가 렌더되고 다른 열은 원문으로 남던 실측 결함).
const pvLive = productView({ ...prodFix,
  live: [{ feature: '관광지 `목록`', ref: '[PLAN-02a] (`/attractions`)', status: '**Live**', example: false }],
}, '2026-08-20');
check('product: live 세 열이 모두 렌더된다',
  (pvLive.match(/<code>/g) || []).length >= 2 && pvLive.includes('<b>Live</b>'));
check('product: 리스크 = 잠금 + 게이트 부채 + HANDOFF §4',
  pv.includes('\u{1F512}') && pv.includes('file size') && pv.includes('레이트리밋'));
check('product: PLAN 롤업', pv.includes('PLAN-02') && pv.includes('payment'));
check('product: 자유 문자열 이스케이프', !pv.includes('<b>x</b>') && pv.includes('&lt;b&gt;'));
// 진입점·주의사항·exit 기준은 평면 산문이라 prose 를 거친다(마커 노출 0).
const pvMd = productView({ ...prodFix,
  entry: '> ### 🎯 **다음 작업** — `foo.js` 배선',
  cautions: '- **레이트리밋** 미확인',
  phases: [{ key: 'PHASE-01', file: 'p', status: 'Active', title: '단계', example: false,
    exits: [{ text: '`eval/RESULTS.md` v2 제출', done: false }] }],
}, '2026-08-20');
check('product: 진입점 마커가 렌더된다',
  pvMd.includes('<code>foo.js</code>') && pvMd.includes('<span class="q">') && !pvMd.includes('&gt; ###'));
check('product: 주의사항·exit 기준도 동일', pvMd.includes('<b>레이트리밋</b>') && pvMd.includes('<code>eval/RESULTS.md</code>'));
// 무가정: 평면이 텅 빈 어답터에서도 렌더된다(설정 요구 0, 예외 0).
const empty = productView({ phases: [], current: null, latest: null, live: [], plans: [], now: [], next: [],
  verifying: [], shipped: [], locked: [], entry: '', cautions: '', debts: [], archived: 0 }, '2026-08-20');
check('product: 빈 평면도 렌더', empty.includes('PHASE 문서 없음') && !empty.includes('undefined'));
check('product: 진입점 부재를 사실로 적는다', empty.includes('HANDOFF §3 비어 있음'));
check('product: time 과 달리 null 이면 빈 문자열', productView(null, '2026-08-20') === '');

// --- 어답터 섹션 컴포지션 확장점(이슈 #4) — sync 파일 포크 0 ---
const secTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dashsec-'));
const secFile = path.join(secTmp, 'dashboard.local.js');
fs.writeFileSync(secFile, `module.exports = [
  { id: 'kpi', title: '제품 KPI', axis: 'product', render: d => '<div class="meta">docs ' + d.index.length + '</div>' },
  { id: 'boom', title: '터지는 섹션', axis: 'overview', render: () => { throw new Error('의도된 실패'); } },
  { id: 'ops', title: '운영', axis: 'ops', axisLabel: '운영축', render: () => '<div class="meta">ops</div>' },
];
`);
const secs = loadSections(secTmp, 'dashboard.local.js');
check('sections: 3건 로드', secs.length === 3);
check('sections: axis 기본값은 overview', loadSections(secTmp, './dashboard.local.js')[0].axis === 'product');
let loadFailed = false;
try { loadSections(secTmp, 'no-such-file.js'); } catch { loadFailed = true; }
check('sections: 없는 경로는 throw(조용한 무시 금지)', loadFailed);
check('sections: 카드 껍데기는 호스트가 씌운다',
  renderSection(secs[0], { index: [1, 2] }).startsWith('<section class="card" id="kpi"><h2>제품 KPI</h2>'));
check('sections: 실패한 섹션은 그 카드만 오류(전체 불사)',
  renderSection(secs[1], {}).includes('섹션 렌더 실패') && renderSection(secs[1], {}).includes('의도된 실패'));
check('sections: 새 axis 는 축을 하나 만든다',
  buildViews(secs).map(v => v.id).join() === VIEWS.map(v => v.id).join() + ',ops');
check('sections: 기존 축 순서는 불변', buildViews(secs).slice(0, VIEWS.length).map(v => v.id).join() === VIEWS.map(v => v.id).join());
check('sections: 섹션 없으면 기본 축 그대로', buildViews([]).length === VIEWS.length);
fs.rmSync(secTmp, { recursive: true, force: true });

// render — 실평면 합성 스모크
const data = gatherAll();
const html = render(data, { title: 'real' });
// 항상 있는 6절. `effect`는 **환경 의존**이라 여기 넣지 않는다 — 근거는 아래 조건부 단언.
// 개요는 기존 대시보드 정보를 전부 유지한다(요약 카드·계보 트리 포함) — 축 페이지는 *추가* 진입.
// 슬라이스는 **뷰 div**에 고정한다 — `data-view=` 단독으로는 라우터 CSS 규칙이 먼저 잡혀 빈 구간이 된다.
const ovHtml = html.slice(html.indexOf('class="view" data-view="overview"'),
  html.indexOf('class="view" data-view="arch"'));
// 섹션은 **원자료가 있으면 그린다 / 없으면 조용히 빠진다**가 계약이다(effect surface 와 같은 꼴).
// 그래서 "8개 다 있다"가 아니라 "있어야 할 것만 정확히 있다"를 단언한다 — 신선한 어답터는
// 계약 0·규범 0 이 정상이고, 거기서 빈 카드를 그리는 쪽이 오히려 결함이다.
const OV_SECTIONS = [
  ['id="health"', true],
  ['id="budget"', true],
  ['id="wo"', true],
  ['id="sync"', !!data.health.sync],
  ['id="size"', data.health.sizes.length > 0],
  ['id="contract"', data.health.contracts.contracts > 0],
  ['id="norm"', data.health.norms.total > 0],
  ['id="plane"', true],
];
check('합성: 개요 섹션은 원자료 유무를 따른다',
  OV_SECTIONS.every(([sel, want]) => ovHtml.includes(sel) === want));
check('합성: 항상 있는 4섹션', ['id="health"', 'id="budget"', 'id="wo"', 'id="plane"'].every(s => ovHtml.includes(s)));
check('합성: 개요가 계보 트리 보유', ovHtml.includes('계보 트리 — 구조가 있는 노드') && ovHtml.includes('class="flt"'));
check('합성: 개요 당위 카드에서 arch 진입 링크', ovHtml.includes('data-nav="arch"'));
// 뷰 라우팅 — **CSS가 정본이고 JS는 해시 북마크만** (스크립트를 실행하지 않는 뷰어 대비).
check('라우팅: 뷰 = VIEWS + data-nav = 나브 + 카드 링크 3',
  (html.match(/class="view"/g) || []).length === VIEWS.length
  && (html.match(/data-nav="/g) || []).length === VIEWS.length + 3);
check('합성: 시간축 뷰가 실원장을 잡는다', html.includes('data-view="time"') && html.includes('결정 밀도'));
check('합성: 신선도 카드에서 time 진입 링크', ovHtml.includes('data-nav="time"'));
check('합성: 스프린트 뷰가 실 WO·HANDOFF 를 잡는다',
  html.includes('data-view="sprint"') && html.includes('HANDOFF — 세션 이어달리기'));
check('합성: 작업대 카드에서 sprint 진입 링크', ovHtml.includes('data-nav="sprint"'));
// 성패 판정: **스크립트 0으로 축 전환이 성립한다.** 라디오 4개(첫 뷰만 checked) + 축마다
// `:checked ~ main` 규칙 + 진입점 전부가 라벨이어야 한다. 하나라도 빠지면 미리보기 패널에서 갇힌다.
check('라우팅: 무JS — 라디오 4개, 개요만 checked',
  (html.match(/class="vsel" type="radio" name="v" id="v-[a-z]+"/g) || []).length === VIEWS.length
  && (html.match(/ checked>/g) || []).length === 1
  && html.includes('id="v-overview" checked>'));
check('라우팅: 무JS — 축마다 :checked 전환 규칙',
  VIEWS.every(v => html.includes(`#v-${v.id}:checked ~ main .view[data-view="${v.id}"] { display:block; }`)
    && html.includes(`#v-${v.id}:checked ~ nav label[for="v-${v.id}"]`)));
check('라우팅: 무JS — 라디오가 nav·main 앞(형제 선택자 성립)',
  html.indexOf('id="v-overview"') < html.indexOf('<nav>')
  && html.indexOf('id="v-time"') < html.indexOf('<main>'));
check('라우팅: 진입점 전부 라벨(앵커 0 — JS 없이도 눌린다)',
  (html.match(/<label [^>]*for="v-[a-z]+"/g) || []).length === VIEWS.length + 3
  && !/<a [^>]*data-nav=/.test(html));
check('라우팅: JS는 해시 북마크만(전환 로직 아님)',
  html.includes('history.replaceState') && html.includes("addEventListener('hashchange'")
  && !html.includes("addEventListener('click'"));
check('합성: 당위 뷰가 실규범을 잡는다', html.includes('ARCH-00') && html.includes('verification 첫 화살표'));
check('합성: 계약 절이 health 원자료를 소비',
  html.includes('계약 간선 — 계보 밖 소비자') === (data.health.contracts.contracts > 0));
// effect surface 는 gitignore 된 .claude/settings*.json 에서 온다 — CI 체크아웃엔 없다.
// 따라서 "있으면 그린다 / 없으면 조용히 빠진다"가 계약이고, 둘 다 단언한다(무가정 원칙의 연장).
const effDim = data.health.dims.find(d => d.name === 'effect surface');
const hasSettings = !!(effDim && effDim.note);
check('합성: effect 절은 설정 유무를 따른다', html.includes('id="effect"') === hasSettings);
check('합성: 설정 없으면 health 가 "관측 불가"로 적는다',
  hasSettings || effDim.value.includes('관측 불가'));
// 크기 절은 상위 N건만 그린다 — 특정 파일명(원장)을 박으면 그 파일이 상위권 밖인 레포에서 깨진다.
// 계약은 "가장 큰 파일이 거기 있다"이다.
check('합성: 크기 헤드룸이 최대 파일을 잡는다',
  !data.health.sizes.length || html.includes(data.health.sizes[0].file));
check('합성: 신선도 pill', html.includes('class="pills"') && html.includes('evidence'));
check('합성: health 차원 등장', html.includes('naming gate') && html.includes('effect surface'));
// WO-10a-1 은 상류 인스턴스의 픽스처 — 채택 인스턴스 평면에는 없을 수 있다.
if (JSON.stringify(data.sprint && data.sprint.wos || []).includes('WO-10a-1')) {
  check('합성: 활성 WO 등장', html.includes('[WO-10a-1]'));
} else {
  console.log('(WO-10a-1 없음: 채택 인스턴스 — 픽스처 검사 건너뜀)');
}

check('합성: undefined 누출 0', !html.includes('undefined'));
check('합성: 자기완결(외부 참조 0)', html.startsWith('<!doctype html>') && !/src=|href="(?!#)/.test(html));
check('합성: 결정성(같은 입력 → 같은 출력)', render(data, { title: 'real' }) === html);

// 합성 — 본문(속성 제외)에 마크다운 마커가 원문으로 남지 않는다. 이슈 #6 의 회귀 고정.
const bodyText = html.slice(html.indexOf('<main>')).replace(/title="[^"]*"/g, '').replace(/<[^>]*>/g, '');
check('합성: 렌더 본문에 원문 마크다운 마커 0', !/\*\*|`/.test(bodyText));

// 합성 — 제품 축이 실평면에서 렌더되고, 어답터 섹션이 축에 얹힌다
check('합성: 제품 축 페이지가 있다',
  html.includes('data-view="product"') && html.includes('로드맵 진행률 — PHASE exit 기준'));
check('합성: 제품 축은 수집을 새로 하지 않는다(파생만)', !!data.product && Array.isArray(data.product.phases));
const withSecs = render(data, { title: 'real', sections: [
  { id: 'kpi', title: '제품 KPI', axis: 'product', render: () => '<div class="meta">kpi</div>' },
  { id: 'ops', title: '운영', axis: 'ops', axisLabel: '운영축', render: () => '<div class="meta">ops</div>' },
] });
check('합성: 어답터 섹션이 기존 축에 덧붙는다',
  withSecs.slice(withSecs.indexOf('class="view" data-view="product"'), withSecs.indexOf('class="view" data-view="arch"')).includes('id="kpi"'));
check('합성: 새 축은 나브·라디오·CSS 규칙을 함께 얻는다',
  withSecs.includes('id="v-ops"') && withSecs.includes('운영축')
  && withSecs.includes('#v-ops:checked ~ main .view[data-view="ops"] { display:block; }'));
check('합성: 어답터 섹션은 기본 축을 건드리지 않는다',
  withSecs.replace(/\n<section class="card" id="(kpi|ops)">[\s\S]*?<\/section>/g, '')
    .includes('data-view="overview"'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
