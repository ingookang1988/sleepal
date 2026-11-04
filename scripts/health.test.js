// scripts/health.test.js
// 순수 계산부(computeHealth) 단위 + gather() 스모크. 실행: node scripts/health.test.js
const { computeHealth, gather, computeEffectSurface, parseContract } = require('./health');

let pass = 0, fail = 0;
function check(label, cond) { if (cond) pass++; else { fail++; console.error(`FAIL ${label}`); } }

const index = [
  { domain: 'PLAN', id: '01' }, { domain: 'FLOW', id: '01a' },
  { domain: 'LSN', id: '01a' }, { domain: 'FLOW', id: '01b', status: 'Verifying' },
];
const defined = ['PLAN', 'FLOW', 'LSN', 'WO', 'WF', 'EVD', 'ADR', 'PRO', 'ARCH'];

// 게이트 전부 통과 + 잠금 1
const h = computeHealth({ index, domainsDefined: defined, guideCount: 5, namingViolations: 0, historyViolations: 0, leakageViolations: 0 });
check('healthy when 0 violations', h.healthy === true && h.fails === 0);
check('lock exposure WARN', h.dims.find(d => d.name === 'lock exposure').status === 'WARN');
check('domain util value', h.dims.find(d => d.name === 'domain utilization').value === '3/9 used');
check('byDomain count', h.byDomain.FLOW === 2);

// 게이트 실패 반영
const bad = computeHealth({ index, domainsDefined: defined, guideCount: 5, namingViolations: 2, historyViolations: 1, leakageViolations: 0 });
check('fails counted', bad.fails === 2 && bad.healthy === false);
check('naming FAIL', bad.dims.find(d => d.name === 'naming gate').status === 'FAIL');

// 도메인 과세분 WARN (>6 unused)
const many = computeHealth({ index, domainsDefined: [...defined, 'A', 'B', 'C', 'D', 'E', 'F'], guideCount: 1, namingViolations: 0, historyViolations: 0, leakageViolations: 0 });
check('domain util WARN when many unused', many.dims.find(d => d.name === 'domain utilization').status === 'WARN');

// 파일 크기 + 참조 차원
const sz = computeHealth({ index, domainsDefined: defined, guideCount: 5, namingViolations: 0, historyViolations: 0, leakageViolations: 0, oversize: [{ file: 'x.md', kb: 47 }], brokenRefs: 3 });
// 상한 초과는 **처방과 함께** 나와야 한다 — 해소 경로가 안 보이는 경고는 배경 소음이 된다([PRO-18] §3-4).
const sizeNote = r => r.dims.find(d => d.name === 'file size').note;
check('크기 초과: 문서는 분할 처방', sizeNote(sz).includes('ZFS 계보로 분할'), true);
const szRot = computeHealth({ index, domainsDefined: defined, guideCount: 5, namingViolations: 0, historyViolations: 0, leakageViolations: 0,
  oversize: [{ file: '.union-stack/archive_ledger.md', kb: 43, rotatable: true }] });
check('크기 초과: 행 저장소는 회전 처방', sizeNote(szRot).includes('회전(archive_ledger/)'), true);
check('처방은 파일명과 함께 나온다', sizeNote(szRot).includes('archive_ledger.md:43KB'), true);
check('file size WARN', sz.dims.find(d => d.name === 'file size').status === 'WARN');
check('ref integrity INFO', sz.dims.find(d => d.name === 'ref integrity').value.includes('3'));

// gather(): 실제 레포 스모크 — 구조 정상이면 fails 0.
// 단 leakage는 *미커밋* 작업트리 콘텐츠에 좌우된다(검토 중 spike 등) — 커밋 평면 게이트만 단언.
const g = gather();
const nonLeakFails = g.dims.filter(d => d.status === 'FAIL' && d.name !== 'leakage gate').length;
// 어답터 평면의 FAIL(예: 자기 중복 ID 의 naming) 은 상류 테스트 실패가 아니다 — 그린 단언은 템플릿 모드에서만([ADR-30]).
if (require('./adapter').isTemplateRepo()) check('gather 커밋 평면 게이트 그린', nonLeakFails === 0);
else check('어답터: gather 가 전 절을 산출(판정은 어답터 몫)', g.dims.every(d => d.name && d.status));
// 상류 자신은 adopter census 차원이 하나 더 있다([WO-29a-6]) — 어답터 팔 사본(템플릿 아님)에서는 20.
check('gather dims 20 + 상류 전용 1 (관측 11절 포함 — test infra [PRO-21] · receipts [PRO-22] · retro due [PRO-25] · upstream [PRO-29] · adopter census [PRO-29] ②)',
  g.dims.length === 20 + (require('./adapter').isTemplateRepo() ? 1 : 0));
// 로드맵 배선 관측([PRO-19] ②) — 판정 없는 INFO. roadmap 은 Schema 라 표면화가 수단의 전부다.
const rDim = g.dims.find(d => d.name === 'roadmap wiring');
check('roadmap wiring 절은 INFO', rDim && rDim.status === 'INFO');
check('roadmap wiring 값에 PHASE·활성 계보', /PHASE \d+ · 활성 계보 \d+/.test(rDim.value));
check('roadmap 원자료도 함께 낸다', typeof g.roadmap.phases === 'number' && Array.isArray(g.roadmap.stale));
// 당위 축 관측 — 인용 != 집행이므로 판정 없는 INFO.
const nDim = g.dims.find(d => d.name === 'norm enforcement');
check('norm enforcement 절은 INFO', nDim.status === 'INFO');
check('norm enforcement 값에 규범·게이트', /규범 \d+ · 게이트 \d+/.test(nDim.value));
check('norms·concerns 원자료도 함께 낸다', Array.isArray(g.norms.norms) && typeof g.concerns.tagged === 'number');
// 당위 페이지의 재료 — 제목·절 구조·인용처·게이트 계약이 실제로 채워지는가.
const a00 = g.norms.norms.find(n => n.key === 'ARCH-00');
check('규범 제목·절 구조 수집', !!a00.title && a00.headings.length > 0);
check('평면 인용처가 파일 목록으로', Array.isArray(a00.planeFiles) && a00.planeFiles.length > 0);
// ARCH-00 을 인용하는 게이트는 현재 `leakage-guard` 하나뿐이고, 그것은 템플릿 전용 자산이다
// (`init --drop-template-bits`). 어답터에서 ARCH-00 이 무게이트가 되는 것은 결함이 아니라 **관측**이라,
// 계약이 하나라도 있을 때만 그 구조를 단언한다([ADR-27] 문법).
if (a00.gateContracts.length) {
  check('게이트 계약의 scope 를 정적 파싱', !!a00.gateContracts[0].scope);
} else {
  console.log('(ARCH-00 인용 게이트 없음: 어답터 — 계약 파싱 검사 건너뜀)');
}

// parseContract — 실행 없이 소스에서 계약 필드를 뽑는다(read-only 불변식).
const pc = parseContract(`const CONTRACT = {
  gate: 'X Gate (x)',
  predicate: 'p 조건',
  scope: 's 사각지대',
  outcomes: ['PASS', 'REJECT'],
  failure_mode: 'f 실패',
};`);
check('parseContract 필드 추출', pc.gate === 'X Gate (x)' && pc.scope === 's 사각지대');
check('parseContract outcomes 배열', JSON.stringify(pc.outcomes) === '["PASS","REJECT"]');
check('parseContract 없으면 null', parseContract('const X = 1;') === null);
// 계약 간선 관측([PRO-16] §5 반증 계기) — 판정 없이 채택·무결성만 병치한다.
const ceDim = g.dims.find(d => d.name === 'contract edges');
check('contract edges 절은 INFO(판정 없음)', ceDim.status === 'INFO');
check('contract edges 값에 계약·선언·간선', /계약 \d+ · 선언 \d+ · 간선 \d+/.test(ceDim.value));
check('contracts 원자료도 함께 낸다', Array.isArray(g.contracts.byContract));
check('sync 절은 INFO(판정 없음)', g.dims.find(d => d.name === 'plane sync').status === 'INFO');
check('tier 절은 INFO(관측만)', g.dims.find(d => d.name === 'tier distribution').status === 'INFO');

// 효과 표면 관측(갭 분석 §3-C) — 순수 계수. 도구 이름은 규칙에서 도출되어야 한다(목록 하드코딩 금지).
const es = computeEffectSurface({
  'a.json': { allow: ['Bash(git push *)', 'Bash(node x.js)', 'WebFetch(domain:example.com)'], deny: ['Bash(rm *)'], ask: [] },
  'b.json': { allow: ['PowerShell(ls)', '무형식규칙'] },
});
check('effect: allow 총계', es.allow === 5);
check('effect: deny 총계', es.deny === 1);
check('effect: wildcard 계수', es.wildcard === 1);
check('effect: 도구를 데이터에서 도출(PowerShell·WebFetch 누락 없음)',
  es.byTool.Bash === 2 && es.byTool.WebFetch === 1 && es.byTool.PowerShell === 1);
check('effect: 괄호 없는 규칙은 (무형식)', es.byTool['(무형식)'] === 1);
check('effect: 파일 2개 기록', es.files.length === 2);

// 설정 파일이 없으면 "관측 불가"로 표기 — 없는 것을 0으로 단정하지 않는다.
const noEffect = computeHealth({ index, domainsDefined: defined, guideCount: 5, namingViolations: 0, historyViolations: 0, leakageViolations: 0, effect: computeEffectSurface({}) });
check('effect: 설정 없으면 관측 불가', noEffect.dims.find(d => d.name === 'effect surface').value.includes('관측 불가'));
check('effect 절은 INFO(판정 없음)', noEffect.dims.find(d => d.name === 'effect surface').status === 'INFO');

// --- test infra 관측([PRO-21] 3단계) — 영원히 INFO, 부재와 고장을 구별 ---
const ti = computeHealth({ index, domainsDefined: defined, guideCount: 5, namingViolations: 0, historyViolations: 0, leakageViolations: 0,
  testInfra: { testFiles: 38, catalogAssets: 3, flowCases: 2, flowChecked: 1, evidenceLast: '2026-08-25' } });
const tiDim = ti.dims.find(d => d.name === 'test infra');
check('test infra: 차원 존재 + INFO', tiDim && tiDim.status === 'INFO');
check('test infra: 값 합성', tiDim.value.includes('스위트 38') && tiDim.value.includes('카탈로그 자산 3') && tiDim.value.includes('체크 1'));
const tiNull = computeHealth({ index, domainsDefined: defined, guideCount: 5, namingViolations: 0, historyViolations: 0, leakageViolations: 0,
  testInfra: { testFiles: 5, catalogAssets: null, flowCases: 0, flowChecked: 0, evidenceLast: null } });
check('test infra: 카탈로그 부재는 0이 아니라 무기입', tiNull.dims.find(d => d.name === 'test infra').value.includes('카탈로그 무기입'));
check('test infra: 미수집이면 차원 없음(구버전 소비자 호환)',
  computeHealth({ index, domainsDefined: defined, guideCount: 5, namingViolations: 0, historyViolations: 0, leakageViolations: 0 })
    .dims.every(d => d.name !== 'test infra'));

// --- [PRO-27] ④ --root: 측정 루트를 인자로 받고, .union-stack 이 없으면 REJECT ---
const { resolveRoot, validateRoot } = require('./health');
const fsR = require('fs'); const osR = require('os'); const pathR = require('path');
const upstreamRoot = pathR.resolve(__dirname, '..');
check('--root 없으면 상류 자신', resolveRoot([], upstreamRoot) === upstreamRoot);
check('--root <dir> 절대경로화', pathR.isAbsolute(resolveRoot(['--root', 'x'], upstreamRoot)));
check('--root 값 누락은 null(오용 표면화)', resolveRoot(['--root'], upstreamRoot) === null);
check('상류 루트는 유효', validateRoot(upstreamRoot).ok === true);
const emptyDir = fsR.mkdtempSync(pathR.join(osR.tmpdir(), 'health-root-'));
try {
  const bad = validateRoot(emptyDir);
  check('.union-stack 없는 디렉터리는 측정 대상 아님', bad.ok === false && bad.reason.includes('.union-stack'));
  check('존재하지 않는 경로도 측정 대상 아님', validateRoot(pathR.join(emptyDir, 'nope')).ok === false);
  // CLI: 플래그를 무시하고 상류 자신을 측정하던 결함(0건 검사 = 통과 클래스)의 회귀 고정.
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, ['scripts/health.js', '--root', emptyDir], { cwd: upstreamRoot, encoding: 'utf8' });
  check('CLI --root <빈 디렉터리> → exit 1(REJECT)', r.status === 1);
  check('CLI REJECT 문구 측정 대상 아님', /측정 대상 아님/.test(r.stderr + r.stdout));
} finally { fsR.rmSync(emptyDir, { recursive: true, force: true }); }

// --- [PRO-22] 단계 2 receipts 절: 차단 검사별 최신 영수증 포인터·나이 — INFO, 선언 부재는 무기입 ---
const { computeReceipts } = require('./health');
const rcpt = computeReceipts(
  [{ name: 'unit', blocking: true }, { name: 'e2e', blocking: true }, { name: 'lint', blocking: false }],
  [{ date: '2026-10-10', scope: 'product', name: 'unit', outcome: 'PASS', targets: 12 }, { date: '2026-10-14', scope: 'product', name: 'unit', outcome: 'REJECT', targets: 0 }, { date: '2026-10-15', scope: 'harness', name: 'tests', outcome: 'PASS', targets: 41 }],
  new Date('2026-10-16T12:00:00'));
check('receipts: 선언·차단·줄 수', rcpt.declared === 3 && rcpt.blocking === 2 && rcpt.lines === 3);
check('receipts: 최신 영수증(날짜 기준) + 나이', rcpt.latest.find(l => l.name === 'unit').age === 2 && rcpt.latest.find(l => l.name === 'unit').outcome === 'REJECT');
check('receipts: 영수증 없는 차단 검사는 missing', JSON.stringify(rcpt.missing) === '["e2e"]');
check('receipts: harness 줄은 제품 검사 포인터에 안 섞인다', !rcpt.latest.some(l => l.name === 'tests'));
const rcDim = computeHealth({ index, domainsDefined: defined, guideCount: 5, namingViolations: 0, historyViolations: 0, leakageViolations: 0, receiptsInfo: rcpt }).dims.find(d => d.name === 'receipts');
check('receipts 절은 INFO · 값에 포인터·나이·공백', rcDim.status === 'INFO' && /unit 2d\(REJECT · 0\)/.test(rcDim.value) && /e2e 영수증 없음/.test(rcDim.value) && rcDim.note.includes('e2e'));
const rNone = computeHealth({ index, domainsDefined: defined, guideCount: 5, namingViolations: 0, historyViolations: 0, leakageViolations: 0, receiptsInfo: computeReceipts([], []) }).dims.find(d => d.name === 'receipts');
check('선언 부재는 무기입(0 아님)', /선언 무기입/.test(rNone.value) && rNone.status === 'INFO');
check('미수집이면 절 없음(구버전 호환)', computeHealth({ index, domainsDefined: defined, guideCount: 5, namingViolations: 0, historyViolations: 0, leakageViolations: 0 }).dims.every(d => d.name !== 'receipts'));

// --- [PRO-25] ① retro due 절: due 면 WARN(= PRO 의 CLARIFY), 아니면 INFO 현재 값 ---
const rtDue = computeHealth({ index, domainsDefined: defined, guideCount: 5, namingViolations: 0, historyViolations: 0, leakageViolations: 0,
  retroInfo: { due: true, reasons: ['평면 지연 45≥30'], indicators: [{ name: '평면 지연', value: 45 }], delta: [{ name: '보관 부채', prev: 7, now: 2 }] } }).dims.find(d => d.name === 'retro due');
check('retro due: WARN + 사유 + Δ + 제안 안내', rtDue.status === 'WARN' && /due — 평면 지연 45≥30/.test(rtDue.value) && /Δ 보관 부채 7→2/.test(rtDue.note) && /HANDOFF §4/.test(rtDue.note));
const rtNo = computeHealth({ index, domainsDefined: defined, guideCount: 5, namingViolations: 0, historyViolations: 0, leakageViolations: 0,
  retroInfo: { due: false, reasons: [], indicators: [{ name: '원장 크기', value: 22 }], delta: [] } }).dims.find(d => d.name === 'retro due');
check('retro due: 사유 없으면 INFO 현재 값', rtNo.status === 'INFO' && /사유 없음 · 원장 크기 22/.test(rtNo.value));
check('retro 미수집이면 절 없음', computeHealth({ index, domainsDefined: defined, guideCount: 5, namingViolations: 0, historyViolations: 0, leakageViolations: 0 }).dims.every(d => d.name !== 'retro due'));
check('gatherRetro(상류): 지표 7', (() => { const { gatherRetro } = require('./health'); const r = gatherRetro(pathR.resolve(__dirname, '..')); return !!r && r.indicators.length === 7; })());

// --- [WO-29a-1] upstream 차원([PRO-29] ①(a)) — INFO 전용, 종료 코드 불변 ---
{
  const { gatherUpstream } = require('./health');
  const base = { index, domainsDefined: defined, guideCount: 5, namingViolations: 0, historyViolations: 0, leakageViolations: 0 };
  const dimOf = up => computeHealth({ ...base, upstream: up }).dims.find(d => d.name === 'upstream');
  check('upstream 인자 없음 → 차원 없음(회귀 0)', !computeHealth(base).dims.find(d => d.name === 'upstream'));
  check('상류 자신 → INFO 해당 없음', /해당 없음/.test(dimOf({ self: true }).value) && dimOf({ self: true }).status === 'INFO');
  check('기록 없음 → INFO + 명령', dimOf({ last: null }).status === 'INFO' && /template-update/.test(dimOf({ last: null }).value + dimOf({ last: null }).note));
  const upd = dimOf({ last: { at: '2026-10-19T00:00:00Z', updates: true, localVer: '6.0.0', upstreamVer: '6.1.0', sync: 2, review: 1, held: 0, forked: 1, migrations: 1 } });
  check('업데이트 있음 → INFO + --proposal', upd.status === 'INFO' && /6\.0\.0/.test(upd.value) && /6\.1\.0/.test(upd.value) && /--proposal/.test(upd.note));
  check('최신 → INFO 최신', /최신/.test(dimOf({ last: { at: '2026-10-19T00:00:00Z', updates: false, localVer: '6.1.0', upstreamVer: '6.1.0' } }).value));
  // [WO-29a-4] 실행 가능 항목 표기 — 보존 포크·확인된 review 만이면 "업데이트 있음"이 아니다
  const idle = dimOf({ last: { at: '2026-10-19T00:00:00Z', updates: false, auto: 0, localVer: '6.0.0', upstreamVer: '6.0.0', sync: 4, forked: 2, unknown: 2, review: 27, reviewNew: 0 } });
  check('실행할 것 없음 → "업데이트 있음" 아님 · 보존 포크·앵커 없음·확인된 review 를 숫자로', !/업데이트 있음/.test(idle.value) && /실행할 것 없음/.test(idle.value) && /보존 포크 2/.test(idle.value) && /앵커 없음 2/.test(idle.value) && /review 27 확인됨/.test(idle.value));
  const act = dimOf({ last: { at: '2026-10-19T00:00:00Z', updates: true, auto: 3, reviewNew: 1, migrations: 1, localVer: '6.0.0', upstreamVer: '6.0.0', forked: 2 } });
  check('실행 가능 → 자동 적용 · 새 review · ⚠ 를 앞에', /업데이트 있음 — 자동 적용 3 · 새 review 1 · ⚠ 마이그레이션 1/.test(act.value) && /--proposal/.test(act.note));
  check('구 캐시(auto 없음)도 읽는다', /업데이트 있음/.test(dimOf({ last: { at: '2026-10-19T00:00:00Z', updates: true, sync: 2, review: 1 } }).value));
  // [WO-29a-6] adopter census 차원(상류 자신만, INFO) — 마지막 회차 7일 초과면 회차 필요
  const cdim = c => computeHealth({ ...base, census: c }).dims.find(d => d.name === 'adopter census');
  check('census 인자 없음(어답터) → 차원 없음', !computeHealth(base).dims.find(d => d.name === 'adopter census'));
  check('회차 없음 → INFO + 명령', cdim({ round: null, today: '2026-10-19' }).status === 'INFO' && /회차 없음/.test(cdim({ round: null, today: '2026-10-19' }).value) && /--delta --write/.test(cdim({ round: null, today: '2026-10-19' }).note));
  const rd = date => ({ round: { date, rows: [{ label: 'A', delta: { first: false, new: ['gate:x'], persist: [], resolved: [] } }] }, today: '2026-10-19' });
  check('6일 → 정상 표기 + 신규 수', !/회차 필요/.test(cdim(rd('2026-10-13')).value) && /신규 이탈 1/.test(cdim(rd('2026-10-13')).value));
  check('8일 → 회차 필요(INFO)', /회차 필요/.test(cdim(rd('2026-10-11')).value) && cdim(rd('2026-10-11')).status === 'INFO');
  check('census 차원은 fails·warns 불변', computeHealth({ ...base, census: rd('2026-01-01') }).warns === computeHealth(base).warns);
  check('실패 → INFO(판정 아님)', dimOf({ last: { error: 'offline', errorAt: '2026-10-19T00:00:00Z' } }).status === 'INFO');
  check('upstream 차원은 fails·warns 를 바꾸지 않는다', computeHealth({ ...base, upstream: { last: { updates: true } } }).fails === computeHealth(base).fails && computeHealth({ ...base, upstream: { last: { updates: true } } }).warns === computeHealth(base).warns);
  // gatherUpstream: 상류 자신은 갱신을 시도하지 않는다 · 어답터는 만료 시 1회 refresh(주입)
  let calls = 0;
  const osU = require('os'), fsU = require('fs');
  // 상류 판별은 package.json name 이다 — 어답터 팔 사본에서도 성립하도록 픽스처로 잰다(현 레포에 기대지 않는다).
  const tmpS = fsU.mkdtempSync(pathR.join(osU.tmpdir(), 'hus-'));
  try {
    fsU.writeFileSync(pathR.join(tmpS, 'package.json'), '{"name":"union-stack"}');
    check('gatherUpstream(상류) → self, refresh 0', gatherUpstream(tmpS, { refresh: () => { calls++; } }).self === true && calls === 0);
  } finally { fsU.rmSync(tmpS, { recursive: true, force: true }); }
  const tmpU = fsU.mkdtempSync(pathR.join(osU.tmpdir(), 'hu-'));
  try {
    fsU.mkdirSync(pathR.join(tmpU, '.union-stack'));
    check('기본은 읽기 전용 — refresh 옵션 없으면 갱신 0 · 쓰기 0', gatherUpstream(tmpU).last === null && !fsU.existsSync(pathR.join(tmpU, '.union-stack/template-sync.json')));
    check('gather(어답터) 기본 호출도 쓰기 0(census 불변식)', (() => { try { gather(tmpU); } catch { /* 빈 평면 — 다른 수집 실패는 무관 */ } return !fsU.existsSync(pathR.join(tmpU, '.union-stack/template-sync.json')); })());
    const g1 = gatherUpstream(tmpU, { refresh: () => { calls++; } });
    check('어답터·캐시 없음 → refresh 1회 · 결과 없음이면 last null', calls === 1 && g1.self === false && g1.last === null);
    fsU.writeFileSync(pathR.join(tmpU, '.union-stack/template-sync.json'), JSON.stringify({ blobs: {}, lastCheck: { at: new Date().toISOString(), updates: false } }));
    calls = 0;
    check('신선한 캐시 → refresh 0', gatherUpstream(tmpU, { refresh: () => { calls++; } }).last.updates === false && calls === 0);
    check('refresh 예외는 삼킨다(점수표 생존)', gatherUpstream(tmpU, { refresh: () => { throw new Error('x'); }, now: Date.now() + 48 * 3600e3 }).self === false);
  } finally { fsU.rmSync(tmpU, { recursive: true, force: true }); }
}

// --- [WO-29a-8] 누설 게이트 해당 여부 = 측정 대상 레포가 그 게이트를 갖는가(census 6회차 A 오탐 — 상류 모듈이 가드 없는 어답터를 판정) ---
{
  const fsL = require('fs'), osL = require('os');
  const mk = withGuard => {
    const t = fsL.mkdtempSync(pathR.join(osL.tmpdir(), 'hl-'));
    fsL.mkdirSync(pathR.join(t, '.union-stack/plan'), { recursive: true });
    fsL.writeFileSync(pathR.join(t, '.union-stack/plan/PLAN-01_real.md'), '---\nstatus: Draft\n---\n# 실제 결제 연동 계획\n');
    fsL.mkdirSync(pathR.join(t, 'scripts'));
    if (withGuard) fsL.writeFileSync(pathR.join(t, 'scripts/leakage-guard.js'), '// guard present\n');
    return t;
  };
  const noG = mk(false), withG = mk(true);
  try {
    const lg = r => r.dims.find(d => d.name === 'leakage gate');
    const a = gather(noG), b = gather(withG);
    check('가드 없는 측정 대상 → INFO 해당 없음 · fails 에 안 셈', lg(a).status === 'INFO' && /해당 없음/.test(lg(a).value) && !a.dims.some(d => d.name === 'leakage gate' && d.status === 'FAIL'));
    // 판정 모듈은 health 자신의 것이다 — 이 레포에 가드가 없으면(팔 env 형상) 판정할 수 없어 해당 없음이 맞다.
    const selfHas = fsL.existsSync(pathR.join(__dirname, 'leakage-guard.js'));
    check('가드 있는 측정 대상 → 현행 판정(미표시 파일 = FAIL · 판정 모듈 없으면 해당 없음)', selfHas ? lg(b).status === 'FAIL' : lg(b).status === 'INFO');
  } finally { fsL.rmSync(noG, { recursive: true, force: true }); fsL.rmSync(withG, { recursive: true, force: true }); }
  // 이 레포에 가드가 있으면 판정 차원, 없으면(어답터 팔 env 형상 — 템플릿 비트 제거) 해당 없음. 현 레포에 기대지 않는다.
  const hasG = fsL.existsSync(pathR.join(__dirname, 'leakage-guard.js'));
  const selfL = gather().dims.find(d => d.name === 'leakage gate');
  check('현 레포 → 가드 유무대로(있으면 판정 · 없으면 해당 없음)', hasG ? ['OK', 'FAIL'].includes(selfL.status) : (selfL.status === 'INFO' && /해당 없음/.test(selfL.value)));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
