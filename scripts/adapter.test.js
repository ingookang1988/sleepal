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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
