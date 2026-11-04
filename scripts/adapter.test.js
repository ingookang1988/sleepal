// scripts/adapter.test.js
// 어답터 설정 표면 — 순수 파서 + FS 로드 + 소비처 배선(zfs-linter 면제, health 강등).
// 실행: node scripts/adapter.test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseConfig, load, isTemplateRepo, CONFIG_PATH } = require('./adapter');
const { lint, IGNORED } = require('./zfs-linter');
const { computeHealth } = require('./health');

let pass = 0, fail = 0;
function check(label, cond) { if (cond) pass++; else { fail++; console.error(`FAIL ${label}`); } }

// --- parseConfig: 정규화 + 경고 ---
const ok = parseConfig('{"private": true, "zfsIgnored": ["mechanism.md"]}');
check('private 파싱', ok.private === true);
check('zfsIgnored 파싱', JSON.stringify(ok.zfsIgnored) === '["mechanism.md"]');
check('정상 설정은 경고 0', ok.warnings.length === 0);

const bad = parseConfig('{ this is not json');
check('파싱 실패 → 기본값', bad.private === false && bad.zfsIgnored.length === 0);
check('파싱 실패 → 경고 1', bad.warnings.length === 1);

const typo = parseConfig('{"privte": true, "zfsIgnored": "mechanism.md"}');
check('알 수 없는 키 경고', typo.warnings.some(w => w.includes('privte')));
check('배열 아닌 zfsIgnored 경고', typo.warnings.some(w => w.includes('zfsIgnored')));
check('오타는 적용되지 않는다', typo.private === false && typo.zfsIgnored.length === 0);

const nonBool = parseConfig('{"private": "true"}');
check('boolean 아닌 private 경고 + 미적용', nonBool.private === false && nonBool.warnings.length === 1);

const withPath = parseConfig('{"zfsIgnored": [".union-stack/plan/mechanism.md"]}');
check('경로가 오면 basename 으로 정규화', JSON.stringify(withPath.zfsIgnored) === '["mechanism.md"]');
check('정규화는 경고를 동반', withPath.warnings.length === 1);

check('배열 최상위 → 기본값 + 경고', parseConfig('[1,2]').warnings.length === 1);

// --- load: 부재는 정상(경고 아님) ---
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'adapter-'));
fs.mkdirSync(path.join(tmp, '.union-stack'), { recursive: true });
const empty = load(tmp);
check('설정 부재 → present:false, 경고 0', empty.present === false && empty.warnings.length === 0);
fs.writeFileSync(path.join(tmp, CONFIG_PATH), '{"private": true, "zfsIgnored": ["mechanism.md"]}');
check('설정 존재 → present:true', load(tmp).present === true && load(tmp).private === true);

// --- 소비처 1: zfs-linter 면제 합산 (설정으로 sync 파일 포크가 0이 된다) ---
const planDir = path.join(tmp, '.union-stack/plan');
fs.mkdirSync(planDir, { recursive: true });
fs.writeFileSync(path.join(planDir, 'mechanism.md'), '# 어답터 고유 매니페스트\n');
fs.writeFileSync(path.join(planDir, 'not-a-zfs-name.md'), '# 규약 위반\n');
const violations = lint(tmp);
check('설정한 파일명은 면제', !violations.some(v => v.file.endsWith('mechanism.md')));
check('면제되지 않은 위반은 그대로 잡힌다', violations.some(v => v.file.endsWith('not-a-zfs-name.md')));
check('고정 면제 목록은 오염되지 않는다(설정은 합집합일 뿐)', !IGNORED.has('mechanism.md'));
fs.rmSync(path.join(tmp, CONFIG_PATH), { force: true });
check('설정을 지우면 다시 위반으로 잡힌다', lint(tmp).some(v => v.file.endsWith('mechanism.md')));
fs.rmSync(tmp, { recursive: true, force: true });

// --- 소비처 2: health 의 leakage 강등 (판정만 바뀌고 게이트 자체는 그대로) ---
const base = { index: [], domainsDefined: ['PLAN'], guideCount: 1, namingViolations: 0, historyViolations: 0 };
const leakOf = r => r.dims.find(d => d.name === 'leakage gate');
const publicRepo = computeHealth({ ...base, leakageViolations: 2 });
check('설정 없으면 누설 위반은 FAIL', leakOf(publicRepo).status === 'FAIL' && publicRepo.fails === 1);
const privateRepo = computeHealth({ ...base, leakageViolations: 2, adapter: { private: true } });
check('private 어답터는 INFO 로 강등', leakOf(privateRepo).status === 'INFO');
check('강등은 FAIL 계수에서 빠진다', privateRepo.fails === 0);
check('강등해도 실측치는 보존된다(위조 금지)', leakOf(privateRepo).value.includes('2 unmarked'));
const dropped = computeHealth({ ...base, leakageViolations: null, adapter: { private: true } });
check('가드 부재는 여전히 "해당 없음"(강등과 구분)', leakOf(dropped).value.includes('해당 없음'));
const cleanPrivate = computeHealth({ ...base, leakageViolations: 0, adapter: { private: true } });
check('private + 위반 0 도 INFO(판정 일관)', leakOf(cleanPrivate).status === 'INFO');

// --- isTemplateRepo: package.json name 이 기계 판별자 ---
// ⚠ 실레포(`isTemplateRepo()`)를 단언하지 않는다 — 그 단언 자체가 어답터에서 깨지는 부류다.
const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'adapter2-'));
fs.writeFileSync(path.join(tmp2, 'package.json'), '{"name":"union-stack"}');
check('상류 이름이면 템플릿', isTemplateRepo(tmp2) === true);
fs.writeFileSync(path.join(tmp2, 'package.json'), '{"name":"lifesaju"}');
check('init 후 어답터는 템플릿 아님', isTemplateRepo(tmp2) === false);
fs.rmSync(path.join(tmp2, 'package.json'));
check('package.json 부재 → 템플릿 아님(추측 금지)', isTemplateRepo(tmp2) === false);
fs.rmSync(tmp2, { recursive: true, force: true });

// --- [PRO-27] ② statusMap · evidenceFields — 로컬 어휘를 매핑으로 읽는다(강제하지 않는다) ---
const { mapStatus, fieldAliases } = require('./adapter');
const vocab = parseConfig('{"statusMap": {"Done": "Closed", "Review": "Verifying"}, "evidenceFields": {"evidence": ["implementation_commit"], "closed_by": ["surfaces"]}}');
check('statusMap 파싱', vocab.statusMap.Done === 'Closed' && vocab.warnings.length === 0);
check('evidenceFields 파싱', JSON.stringify(vocab.evidenceFields.evidence) === '["implementation_commit"]');
check('mapStatus: 매핑 있으면 상류 어휘', mapStatus(vocab, 'Done') === 'Closed');
check('mapStatus: 매핑 없으면 그대로(강제 아님)', mapStatus(vocab, 'Active') === 'Active');
check('mapStatus: null 은 null', mapStatus(vocab, null) === null);
check('mapStatus: 산문 status 는 첫 토큰으로 매핑(Done (2026-01-01) → Closed)', mapStatus(vocab, 'Done (2026-01-01)') === 'Closed');
check('mapStatus: 첫 토큰도 없으면 그대로', mapStatus(vocab, 'Shipped v2') === 'Shipped v2');
check('fieldAliases: 상류 필드가 먼저, 별칭이 뒤', JSON.stringify(fieldAliases(vocab, 'evidence')) === '["evidence","implementation_commit"]');
check('fieldAliases: 설정 없으면 필드 하나', JSON.stringify(fieldAliases(parseConfig('{}'), 'closed_by')) === '["closed_by"]');
const vocabBad = parseConfig('{"statusMap": ["Done"], "evidenceFields": {"evidence": "x", "foo": ["y"]}}');
check('statusMap 객체 아님 → 경고 + 미적용', Object.keys(vocabBad.statusMap).length === 0 && vocabBad.warnings.some(w => w.includes('statusMap')));
check('evidenceFields 값이 배열 아님 → 경고', vocabBad.warnings.some(w => w.includes('evidence')));
check('evidenceFields 알 수 없는 상류 필드 → 경고', vocabBad.warnings.some(w => w.includes('foo')));
check('load 기본값에 statusMap·evidenceFields', (() => { const d = load(require('os').tmpdir()); return d.present === false && typeof d.statusMap === 'object' && typeof d.evidenceFields === 'object'; })());

// --- [PRO-27] ③ lineage.arithmeticFrom — 레거시 독립 채번 구간은 산술 상속을 끈다 ---
const { arithmeticApplies } = require('./adapter');
const lin = parseConfig('{"lineage": {"arithmeticFrom": 36}}');
check('lineage 파싱', lin.lineage.arithmeticFrom === 36 && lin.warnings.length === 0);
check('arithmeticApplies: 경계 포함(36 이상)', arithmeticApplies(lin, '36a-1') === true && arithmeticApplies(lin, '40') === true);
check('arithmeticApplies: 아래 번호는 산술 아님', arithmeticApplies(lin, '12a-1') === false && arithmeticApplies(lin, '01') === false);
check('기본값 0 = 전부 산술', arithmeticApplies(parseConfig('{}'), '01') === true && arithmeticApplies(null, '01') === true);
const linBad = parseConfig('{"lineage": {"arithmeticFrom": "36", "foo": 1}}');
check('정수 아닌 arithmeticFrom → 경고 + 기본값', linBad.lineage.arithmeticFrom === 0 && linBad.warnings.some(w => w.includes('arithmeticFrom')));
check('알 수 없는 lineage 하위 키 → 경고', linBad.warnings.some(w => w.includes('foo')));
check('lineage 객체 아님 → 경고', parseConfig('{"lineage": 36}').warnings.some(w => w.includes('lineage')));

// --- [PRO-22] §3-1 checks[] 선언 — 닫힌 어휘(kind·cost·expected_zero_unless)와 필수 필드 ---
const { CHECK_KINDS } = require('./adapter');
const chk = parseConfig('{"checks": [{"name": "unit", "cmd": "pnpm test", "blocking": true, "kind": "동작", "cost": "push", "runs_on": ["pre-push"], "env": ["TZ=UTC"], "expected_zero_unless": "env"}, {"name": "lint", "cmd": "eslint ."}]}');
check('checks 파싱 2건 · 기본 blocking false', chk.checks.length === 2 && chk.checks[0].blocking === true && chk.checks[1].blocking === false && chk.warnings.length === 0);
check('checks 필드', chk.checks[0].kind === '동작' && chk.checks[0].cost === 'push' && chk.checks[0].expected_zero_unless === 'env' && chk.checks[0].env[0] === 'TZ=UTC');
const chkBad = parseConfig('{"checks": [{"name": "x"}, {"name": "y", "cmd": "z", "kind": "기타", "cost": "free", "expected_zero_unless": "always"}]}');
check('cmd 없는 선언은 무시 + 경고', chkBad.checks.length === 1 && chkBad.warnings.some(w => w.includes('checks[0]')));
check('닫힌 어휘 밖 값은 경고 + null', chkBad.checks[0].kind === null && chkBad.checks[0].cost === null && chkBad.checks[0].expected_zero_unless === null && chkBad.warnings.filter(w => w.includes('checks[1]')).length === 3);
check('checks 배열 아님 → 경고', parseConfig('{"checks": {}}').warnings.some(w => w.includes('checks')));
check('CHECK_KINDS 6분류', CHECK_KINDS.size === 6 && CHECK_KINDS.has('수용') && CHECK_KINDS.has('메타'));
check('load 기본값에 checks []', Array.isArray(load(require('os').tmpdir()).checks));

// --- [PRO-25] ① retro 임계 키 ---
const rc = parseConfig('{"retro": {"issuance": 20, "planeLagDays": 45, "off": ["ledger"], "bogus": 1, "staleDays": "x"}}');
check('retro 숫자 키 파싱 + off', rc.retro.issuance === 20 && rc.retro.planeLagDays === 45 && JSON.stringify(rc.retro.off) === '["ledger"]');
check('retro 알 수 없는 키·비숫자 → 경고', rc.warnings.some(w => w.includes('retro.bogus')) && rc.warnings.some(w => w.includes('retro.staleDays')) && rc.retro.staleDays === undefined);
check('retro 객체 아님 → 경고', parseConfig('{"retro": 3}').warnings.some(w => w.includes('retro')));
check('load 기본값에 retro {}', typeof load(require('os').tmpdir()).retro === 'object');

// --- [PRO-24] ①(b) localOwned 글롭 ---
const lo = parseConfig('{"localOwned": [" scripts\\\\verify.sh ", "./scripts/*-linter.js"]}');
check('localOwned 파싱 + 정규화(역슬래시·./·공백)', JSON.stringify(lo.localOwned) === '["scripts/verify.sh","scripts/*-linter.js"]' && lo.warnings.length === 0);
check('localOwned 배열 아님 → 경고 + 빈 목록', parseConfig('{"localOwned": "scripts/x"}').warnings.some(w => w.includes('localOwned')) && parseConfig('{"localOwned": "x"}').localOwned.length === 0);
check('load 기본값에 localOwned []', Array.isArray(load(require('os').tmpdir()).localOwned));

// --- budgets · upstreamIgnored (어답터 C 실측: context-budget 포크 = handoff 2200 재캘리브레이션 · harness.yml 거부 불가) ---
const bg = parseConfig('{"budgets": {"handoff": 2200, "total": 5000, "nope": 1, "project": -1}}');
check('budgets: 알려진 키·양수만 + 경고', bg.budgets.handoff === 2200 && bg.budgets.total === 5000 && !('nope' in bg.budgets) && !('project' in bg.budgets) && bg.warnings.filter(w => w.includes('budgets')).length === 2);
check('budgets 객체 아님 → 경고 + 빈 객체', parseConfig('{"budgets": 3}').warnings.some(w => w.includes('budgets')) && Object.keys(parseConfig('{"budgets": 3}').budgets).length === 0);
const ui = parseConfig('{"upstreamIgnored": [".github/workflows/harness.yml", "./scripts/x.js "]}');
check('upstreamIgnored 파싱 + 정규화', JSON.stringify(ui.upstreamIgnored) === '[".github/workflows/harness.yml","scripts/x.js"]' && ui.warnings.length === 0);
check('upstreamIgnored 배열 아님 → 경고', parseConfig('{"upstreamIgnored": "x"}').warnings.some(w => w.includes('upstreamIgnored')));
check('load 기본값에 budgets {} · upstreamIgnored []', (() => { const l = load(require('os').tmpdir()); return l.budgets && Object.keys(l.budgets).length === 0 && Array.isArray(l.upstreamIgnored); })());

// --- [PRO-28] ① sections 별칭 맵(1:N + 접두) — 센서스 3회차: 한 의미에 표기 3~5종, `## 증거` 0건 ---
const { normalizeHeading, resolveSection, missingSections, SECTION_KEYS } = require('./adapter');
check('SECTION_KEYS = 발행 계약 3절', JSON.stringify([...SECTION_KEYS]) === JSON.stringify(['목표', '수용 기준', '증거']));
const sc = parseConfig('{"sections": {"목표": ["목적", " 목적·진입 조건 "], "수용 기준": ["수용 게이트", "완료 기준"], "증거": ["검증"], "배경": ["x"], "진행": 3}}');
check('sections: 알려진 키만 + 값 정규화 + 경고 2(알 수 없는 키 · 배열 아님)', JSON.stringify(sc.sections) === JSON.stringify({ '목표': ['목적', '목적·진입 조건'], '수용 기준': ['수용 게이트', '완료 기준'], '증거': ['검증'] }) && sc.warnings.filter(w => w.includes('sections')).length === 2);
check('sections 객체 아님 → 경고 + 빈 맵', parseConfig('{"sections": []}').warnings.some(w => w.includes('sections')) && Object.keys(parseConfig('{"sections": []}').sections).length === 0);
check('normalizeHeading: 선두 번호·공백·꼬리 콜론', normalizeHeading(' 1.  목적·진입   조건 : ') === '목적·진입 조건' && normalizeHeading('2) 수용  기준') === '수용 기준');
check('resolveSection: 맵 없음 = 상류 표기 정확·접두(현행)', resolveSection(null, '목표') === '목표' && resolveSection(null, '목표 및 범위') === '목표' && resolveSection(null, '목적') === null);
check('resolveSection: 별칭 정확 일치', resolveSection(sc, '목적') === '목표' && resolveSection(sc, '완료 기준') === '수용 기준' && resolveSection(sc, '검증') === '증거');
check('resolveSection: 별칭 접두 일치 + 번호 정규화', resolveSection(sc, '1. 목적·진입 조건') === '목표' && resolveSection(sc, '수용 게이트 (v2)') === '수용 기준');
check('resolveSection: 서사 절은 해소 안 됨(진행 기록은 증거가 아니다)', resolveSection(sc, '진행 기록') === null && resolveSection(sc, '배경') === null);
check('missingSections: 맵으로 3절 충족', JSON.stringify(missingSections(sc, '## 1. 목적\n본문\n## 완료 기준\n## 검증\n')) === '[]');
check('missingSections: 맵 없으면 상류 표기만', JSON.stringify(missingSections(null, '## 목적\n## 수용 기준\n')) === JSON.stringify(['목표', '증거']));
check('missingSections: H3 는 안 센다', JSON.stringify(missingSections(sc, '### 목표\n## 수용 기준\n## 증거\n')) === JSON.stringify(['목표']));

// --- [PRO-28] ① 보강(어답터 A 2차 실측): 접두만으로는 "5. G5 완료 기준"·"검증·완료 기준"·"2. 목표와 공통 완료 기준" 이 0건 — 토큰 단위 연속 일치를 더한다 ---
const scT = parseConfig('{"sections": {"수용 기준": ["완료 기준"], "증거": ["검증"]}}');
check('토큰: 게이트명 뒤 별칭', resolveSection(scT, '5. G5 완료 기준') === '수용 기준');
check('토큰: · 결합 — 긴 별칭 우선(검증·완료 기준 → 수용 기준)', resolveSection(scT, '검증·완료 기준') === '수용 기준');
check('토큰: "목표와" 는 목표가 아니다(토큰 경계) · 뒤의 완료 기준으로 해소', resolveSection(scT, '2. 목표와 공통 완료 기준') === '수용 기준');
check('토큰: 실행 항목·수용 기준(상류 표기 토큰)', resolveSection(scT, '2. 실행 항목·수용 기준') === '수용 기준');
check('토큰 경계: 비목표 는 목표가 아니다 · 증거 없음 은 증거(접두)', resolveSection(scT, '비목표') === null && resolveSection(scT, '증거 없음') === '증거');
check('토큰: 서사 절은 여전히 null', resolveSection(scT, '진행 기록') === null && resolveSection(scT, '검증 로그') === '증거');

// --- A 재적용 실측 ③(b): 조사가 붙은 토큰("목표와 공통 완료 기준"·"목표와 범위")은 토큰 비교 때 조사를 뗀다 — 최장 별칭 규칙은 그대로 ---
check('조사 제거: 목표와 범위 → 목표', resolveSection(null, '목표와 범위') === '목표');
check('조사 제거 + 최장 별칭: 목표와 공통 완료 기준 → 수용 기준', resolveSection(scT, '2. 목표와 공통 완료 기준') === '수용 기준');
check('조사 제거: 증거는 → 증거 · 비목표는 → null(어간이 다름)', resolveSection(null, '증거는 여기') === '증거' && resolveSection(null, '비목표는') === null);

// --- 어답터 C 실측 ③: statusMap 없이도 상류 어휘로 시작하는 산문 status 는 첫 토큰으로 — 로컬 어휘(Done·Complete)는 맵 없이는 그대로 ---
check('mapStatus: 상류 어휘 머리 → 첫 토큰', mapStatus(null, 'Active — core production green') === 'Active' && mapStatus(null, 'Closed (2026-01-01)') === 'Closed');
check('mapStatus: 로컬 어휘는 맵 없이 원문', mapStatus(null, 'Done (2026-01-01)') === 'Done (2026-01-01)' && mapStatus(null, 'Complete') === 'Complete');
check('mapStatus: 맵이 있으면 맵 우선', mapStatus({ statusMap: { Active: 'Verifying' } }, 'Active — x') === 'Verifying');
// --- 어답터 C 제안 ⑥: sectionsExclude — 토큰이 겹치지만 의미가 다른 헤딩(진행 기록·비목표)을 명시적으로 밀어낸다 ---
const ex = parseConfig('{"sections": {"증거": ["진행"]}, "sectionsExclude": ["진행 기록", " 2. 비목표 "]}');
check('sectionsExclude 파싱·정규화', JSON.stringify(ex.sectionsExclude) === JSON.stringify(['진행 기록', '비목표']) && ex.warnings.length === 0);
check('제외 헤딩은 별칭에 걸려도 null(정확·접두)', resolveSection(ex, '진행 기록') === null && resolveSection(ex, '3. 진행 기록 (append-only)') === null && resolveSection(ex, '비목표') === null);
check('제외되지 않은 별칭은 그대로', resolveSection(ex, '진행') === '증거');
check('sectionsExclude 배열 아님 → 경고', parseConfig('{"sectionsExclude": "x"}').warnings.some(w => w.includes('sectionsExclude')));

// --- 어답터 C 3차 실측: 첫 토큰에 괄호·대시가 바로 붙은 status("Diagnosed(정정)"·"In-progress(TDD)"·"보류(human …)") 6건이 미매핑 — 공백 외에 ( — : 에서도 끊는다 ---
check('첫 토큰: 괄호 직결', mapStatus({ statusMap: { Diagnosed: 'Closed', '보류': 'Draft' } }, 'Diagnosed(정정)') === 'Closed' && mapStatus({ statusMap: { Diagnosed: 'Closed', '보류': 'Draft' } }, '보류(human 확인 대기)') === 'Draft');
check('첫 토큰: 상류 어휘 + 괄호 직결은 맵 없이도', mapStatus(null, 'Verifying(TDD)') === 'Verifying' && mapStatus(null, 'Active—core') === 'Active');
check('첫 토큰: 하이픈은 토큰의 일부(In-progress)', mapStatus({ statusMap: { 'In-progress': 'Active' } }, 'In-progress(TDD)') === 'Active');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
