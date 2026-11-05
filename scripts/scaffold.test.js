// scripts/scaffold.test.js
// 뼈대 생성기([PRO-28] ④ · [WO-28a-2]) 순수 로직 + 임시 루트 CLI. 실행: node scripts/scaffold.test.js
// 가드 먼저([ADR-40]): 채번 제안(산술·레거시) · parent 실존 · 절 이름(별칭 맵 첫 항목) · 뼈대 ≤400 tok · 발행 린트 통과 · 쓰기 거부 조건.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { proposeId, findParent, sectionNames, slugOf, renderBody, plan, run, CONTRACT, MAX_TOKENS } = require('./scaffold');
const { validateContract } = require('./gate-contract');
const { parseConfig } = require('./adapter');
const { estimateTokens } = require('./context-budget');
const { parseWo, checkIssuance } = require('./work-close');
const { lint } = require('./zfs-linter');

let pass = 0, fail = 0;
function check(label, got, exp) {
  const ok = JSON.stringify(got) === JSON.stringify(exp);
  if (ok) pass++; else { fail++; console.error(`FAIL ${label}: got ${JSON.stringify(got)}, exp ${JSON.stringify(exp)}`); }
}

check('계약 완전성', validateContract(CONTRACT).length, 0);

// --- proposeId: 산술 범위 — 부모가 글자로 끝나면 그 아래 -N, 숫자로 끝나면 계보 글자(기본 a)를 붙여 -N ---
const IDX = [
  { domain: 'PLAN', id: '01a', file: 'p' }, { domain: 'WO', id: '01a-1', file: 'w1' },
  { domain: 'PRO', id: '28', file: 'q' }, { domain: 'WO', id: '28a-1', file: 'w2' }, { domain: 'WO', id: '28a-2', file: 'w3' },
  { domain: 'PLAN', id: '30', file: 'p30' },
];
const cfg0 = parseConfig('{}');
check('글자 끝 부모: 다음 자식', proposeId(IDX, { domain: 'WO', parentId: '01a', cfg: cfg0 }), { id: '01a-2', basis: 'arithmetic' });
check('숫자 끝 부모: 계보 a 의 다음 자식', proposeId(IDX, { domain: 'WO', parentId: '28', cfg: cfg0 }), { id: '28a-3', basis: 'arithmetic' });
check('자식 없는 부모: -1', proposeId(IDX, { domain: 'WO', parentId: '30', cfg: cfg0 }), { id: '30a-1', basis: 'arithmetic' });
check('계보 글자 지정(b)', proposeId(IDX, { domain: 'WO', parentId: '28', lineage: 'b', cfg: cfg0 }), { id: '28b-1', basis: 'arithmetic' });
check('계보 글자 l·o 금지 → null', proposeId(IDX, { domain: 'WO', parentId: '28', lineage: 'l', cfg: cfg0 }), null);
// 어답터 A 실측: PLAN-66 아래 WO-66a…66t(글자 자식 계열)가 있는데 66a-1 을 제안 — 글자 계열이면 다음 글자, l·o 는 건너뛴다.
const IDX66 = [{ domain: 'PLAN', id: '66', file: 'p' }, ...['a', 'b', 'c', 'k'].map(l => ({ domain: 'WO', id: '66' + l, file: 'w' + l }))];
check('글자 자식 계열: 다음 글자(k → m, l 건너뜀)', proposeId(IDX66, { domain: 'WO', parentId: '66', cfg: cfg0 }), { id: '66m', basis: 'letter-series' });
check('글자 자식 계열: n → p(o 건너뜀)', proposeId([{ domain: 'WO', id: '66n', file: 'w' }], { domain: 'WO', parentId: '66', cfg: cfg0 }), { id: '66p', basis: 'letter-series' });
check('글자 계열 소진(z) → null(사람 결정)', proposeId([{ domain: 'WO', id: '66z', file: 'w' }], { domain: 'WO', parentId: '66', cfg: cfg0 }), null);
check('글자 자식과 -N 자식이 섞이면 -N 계열(명시 계보 우선)', proposeId([{ domain: 'WO', id: '66a', file: 'w' }, { domain: 'WO', id: '66a-2', file: 'w2' }], { domain: 'WO', parentId: '66', cfg: cfg0 }), { id: '66a-3', basis: 'arithmetic' });
// 레거시 독립 채번 구간([PRO-27] ③ arithmeticFrom 아래): 도메인 전역 최대 번호 + 1 (평면 ID 들 사이 겹침 방지)
const cfgLegacy = parseConfig('{"lineage": {"arithmeticFrom": 100}}');
check('레거시: WO 전역 최대 번호 + 1', proposeId(IDX, { domain: 'WO', parentId: '12', cfg: cfgLegacy }), { id: '29', basis: 'legacy-max' });

// --- findParent: 도메인+ID 실존(죽은 부모·다른 도메인 동일 계보는 실존 아님) ---
check('parent 실존', findParent(IDX, 'PLAN-01a') && findParent(IDX, 'PLAN-01a').file, 'p');
check('죽은 parent → null', findParent(IDX, 'PLAN-99'), null);
check('도메인 불일치 → null', findParent(IDX, 'FLOW-01a'), null);
check('형식 아님 → null', findParent(IDX, 'nope'), null);

// --- sectionNames: 맵의 첫 별칭 또는 상류 표기([PRO-28] §7 잠정) ---
check('맵 없음 → 상류 표기', sectionNames(cfg0), ['목표', '수용 기준', '증거']);
const cfgS = parseConfig('{"sections": {"목표": ["목적·진입 조건", "목적"], "증거": ["검증"]}}');
check('맵 있음 → 첫 별칭(없는 키는 상류 표기)', sectionNames(cfgS), ['목적·진입 조건', '수용 기준', '검증']);

// --- slugOf: ZFS slug 문법([a-z][a-z0-9_]*) — 명시 slug 우선, 없으면 ASCII 제목에서, 비ASCII 제목만이면 null(묻는다) ---
check('명시 slug 정규화', slugOf('Auth-Wiring v2', ''), 'auth_wiring_v2');
check('제목에서 파생', slugOf(null, 'Payment gateway wiring'), 'payment_gateway_wiring');
check('숫자 시작 금지 → 접두', slugOf('2nd_pass', ''), 'w2nd_pass');
check('비ASCII 제목만 → null', slugOf(null, '인증 게이트웨이 배선'), null);

// --- renderBody: 뼈대 ≤ MAX_TOKENS · 발행 계약 통과(맵 유무 모두) ---
const body = renderBody({ domain: 'WO', id: '01a-2', title: 'Payment wiring', parent: 'PLAN-01a', sections: sectionNames(cfg0) });
check('뼈대 토큰 상한', estimateTokens(body) <= MAX_TOKENS, true);
check('상한 상수는 400([PRO-28] ④)', MAX_TOKENS, 400);
check('frontmatter 필수 필드(빈 값 포함)', ['id: WO-01a-2', 'status: Draft', 'parent: PLAN-01a', 'evidence: "none —', 'closed_by: []'].every(s => body.includes(s)), true);
const rec = parseWo('.union-stack/sprint/WO-01a-2_payment_wiring.md', body, cfg0);
check('발행 린트: 3절 충족 + parent 실존·계보 일치 → 이슈 0', checkIssuance(rec, IDX), []);
const bodyS = renderBody({ domain: 'WO', id: '28a-3', title: 'x', parent: 'PRO-28', sections: sectionNames(cfgS) });
check('별칭 표기 뼈대도 맵으로 3절 충족', parseWo('.union-stack/sprint/WO-28a-3_x.md', bodyS, cfgS).missingSections, []);
check('별칭 표기 뼈대는 맵 없이는 목표 누락(어답터 표기를 쓴 것이 맞다 — 증거는 frontmatter evidence 로 충족)', parseWo('.union-stack/sprint/WO-28a-3_x.md', bodyS, cfg0).missingSections, ['목표']);
check('본문에 원문 마커 짝 깨짐 없음', (body.match(/`/g) || []).length % 2, 0);

// --- 임시 루트: plan → dry-run 무쓰기 → --write 생성 → 네이밍 통과 → 재실행 거부 → 죽은 parent 거부 ---
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-'));
try {
  const w = (rel, txt) => { fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true }); fs.writeFileSync(path.join(tmp, rel), txt); };
  w('.union-stack/plan/PLAN-01a_payments.md', '---\nstatus: Active\n---\n# p\n');
  w('.union-stack/sprint/WO-01a-1_first.md', '---\nid: WO-01a-1\nstatus: Closed\nparent: PLAN-01a\n---\n## 목표\n## 수용 기준\n## 증거\n');
  w('.union-stack/adapter.json', '{"private": true}');
  const p = plan(tmp, { domain: 'WO', parent: 'PLAN-01a', title: 'Refund flow', write: false });
  check('plan: id·파일·본문', [p.ok, p.id, p.file], [true, '01a-2', '.union-stack/sprint/WO-01a-2_refund_flow.md']);
  check('dry-run 은 쓰지 않는다', fs.existsSync(path.join(tmp, p.file)), false);
  const silent = fn => { const c = console.log, e = console.error; console.log = () => {}; console.error = () => {}; try { return fn(); } finally { console.log = c; console.error = e; } };
  check('CLI dry-run → PASS(0) · 무쓰기', [silent(() => run(['WO', '--parent', 'PLAN-01a', '--title', 'Refund flow'], tmp)), fs.existsSync(path.join(tmp, p.file))], [0, false]);
  check('CLI --write → PASS(0) · 파일 생성', [silent(() => run(['WO', '--parent', 'PLAN-01a', '--title', 'Refund flow', '--write'], tmp)), fs.existsSync(path.join(tmp, p.file))], [0, true]);
  check('생성 파일은 ZFS 네이밍 통과', lint(tmp).filter(v => v.file && v.file.includes('WO-01a-2')).length, 0);
  check('생성 파일: 발행 린트 이슈 0', checkIssuance(parseWo(p.file, fs.readFileSync(path.join(tmp, p.file), 'utf8'), cfg0), [{ domain: 'PLAN', id: '01a', file: 'x' }]), []);
  check('다음 호출은 다음 번호(01a-3)', plan(tmp, { domain: 'WO', parent: 'PLAN-01a', title: 'Chargeback', write: false }).id, '01a-3');
  check('같은 파일 재작성 거부 → CLARIFY(3)', silent(() => run(['WO', '--parent', 'PLAN-01a', '--title', 'Refund flow', '--id', '01a-2', '--write'], tmp)), 3);
  check('죽은 parent → CLARIFY(3) · 무쓰기', [silent(() => run(['WO', '--parent', 'PLAN-77', '--title', 'Ghost', '--write'], tmp)), fs.existsSync(path.join(tmp, '.union-stack/sprint/WO-77a-1_ghost.md'))], [3, false]);
  check('비ASCII 제목 + slug 없음 → CLARIFY(3)', silent(() => run(['WO', '--parent', 'PLAN-01a', '--title', '환불 흐름'], tmp)), 3);
  check('비ASCII 제목 + --slug → PASS', silent(() => run(['WO', '--parent', 'PLAN-01a', '--title', '환불 흐름', '--slug', 'refund_flow_ko'], tmp)), 0);
  check('WO 외 도메인은 미지원 CLARIFY(3)', silent(() => run(['PLAN', '--parent', 'PLAN-01a', '--title', 'x'], tmp)), 3);
  check('--json 은 계획을 기계 판독으로', (() => { let out = ''; const c = console.log; console.log = s => { out += s; }; try { run(['WO', '--parent', 'PLAN-01a', '--title', 'J', '--json'], tmp); } finally { console.log = c; } return JSON.parse(out).id; })(), '01a-3');
  const cli = spawnSync(process.execPath, [path.resolve(__dirname, 'scaffold.js'), '--contract'], { encoding: 'utf8' });
  check('CLI --contract 출력', cli.status === 0 && /scaffold/.test(cli.stdout), true);
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }

// 상류 자신: PRO-28 아래 다음 번호는 28a-N 이고 기존과 겹치지 않는다(템플릿 모드에서만 — 어답터 평면엔 PRO-28 이 없다).
if (require('./adapter').isTemplateRepo()) {
  const up = plan(path.resolve(__dirname, '..'), { domain: 'WO', parent: 'PRO-28', title: 'probe', write: false });
  check('상류: PRO-28 다음 자식 제안 + 기존 ID 와 안 겹침', up.ok && /^28a-\d+$/.test(up.id) && !fs.existsSync(path.join(__dirname, '..', up.file)), true);
}

// --- [WO-29a-3] 어답터 뼈대의 상류 ID 는 up: 접두(C 실측 — 머리글 [PRO-15] 가 어답터 ref-linter --strict 를 깬다) ---
{
  const args = { domain: 'WO', id: '01a-2', title: 'x', parent: 'PLAN-01a', sections: sectionNames(cfg0) };
  const up = renderBody(args), ad = renderBody({ ...args, adopter: true });
  check('renderBody 기본(상류) = ([PRO-15])', up.includes('([PRO-15])'), true);
  check('renderBody adopter:true = [up:PRO-15]', ad.includes('[up:PRO-15]') && !ad.includes('([PRO-15])'), true);
  check('어답터 뼈대도 로컬 ID(parent·자기)는 접두 없음', ad.includes('parent: PLAN-01a') && ad.includes('# [WO-01a-2]'), true);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
