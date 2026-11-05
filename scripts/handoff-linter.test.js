// scripts/handoff-linter.test.js
// 순수 함수(analyze) 단위 + 실제 HANDOFF.md 통합. 실행: node scripts/handoff-linter.test.js
const { analyze, parseSections, partBody, run } = require('./handoff-linter');
const { OUTCOME } = require('./gate-contract');

let pass = 0, fail = 0;
function check(label, got, exp) {
  const ok = JSON.stringify(got) === JSON.stringify(exp);
  if (ok) pass++; else { fail++; console.error(`FAIL ${label}: got ${JSON.stringify(got)}, exp ${JSON.stringify(exp)}`); }
}

const FULL = `---
session_id: x
---
# Handoff
## 1. 세션 요약
- 했다
## 2. 변경 위치 (ID)
- [WO-01a]
## 3. 다음 작업
- [WO-01a-2]부터
## 4. 미해결 / 주의
— 해당 없음
## 5. 검증 상태
- 테스트 그린
`;

// 5부 완비 → 무발견
check('완비 → 0 findings', analyze(FULL).findings.length, 0);

// '— 해당 없음' 명시는 유효한 정직 기입(SPIKE C6) — 빈 부 판정을 받지 않는다
check('해당없음 명시 부 통과', analyze(FULL).findings.filter(f => f.rule === 'part-empty').length, 0);

// 부 누락 → part-missing (검증 상태 부를 삭제)
const missing = FULL.replace(/## 5\. 검증 상태[\s\S]*$/, '');
check('부 누락 검출', analyze(missing).findings.map(f => f.rule), ['part-missing']);

// 부는 있으나 비어 있음 → part-empty
const empty = FULL.replace('— 해당 없음\n', '');
check('빈 부 검출', analyze(empty).findings.map(f => f.rule), ['part-empty']);

// 예산 초과 → budget (한글 장문 — 1,500 tok 초과 확실)
const bloated = FULL + '## 붙임\n' + '기록할 가치가 없는 과정 서사가 길게 이어진다 '.repeat(200);
check('예산 초과 검출', analyze(bloated).findings.some(f => f.rule === 'budget'), true);

// 헤더 키워드 내성: 영문 헤더도 5부로 인식
const en = FULL
  .replace('1. 세션 요약', 'Summary').replace('2. 변경 위치 (ID)', 'Changed IDs')
  .replace('3. 다음 작업', 'Next entry').replace('4. 미해결 / 주의', 'Open / caution')
  .replace('5. 검증 상태', 'Verification');
check('영문 헤더 인식', analyze(en).findings.length, 0);

// 결과는 PASS 또는 CLARIFY뿐 — REJECT 없음([PRO-13] §5)
check('빈 본문도 CLARIFY까지만(분석은 findings일 뿐)', analyze('').findings.length > 0, true);

// --- 5부 배정: 키워드 단독 매칭의 오배정을 문서 순서 그리디가 막는다 ---
// 실측: §2 "변경 위치 (ID 목록 — Upward Fetching **진입점**)" 이 `next` 의 /진입/ 에 먼저 걸려
// §3 자리를 차지했다. 존재 여부만 볼 때는 안 드러나지만 본문을 꺼내 쓰면 틀린 절을 준다.
const AMBIG = [
  '## 1. 세션 요약', '요약 본문',
  '## 2. 변경 위치 (ID 목록 — Upward Fetching 진입점)', '변경 본문',
  '## 3. 다음 작업 (단일 진입점)', '다음 본문',
  '## 4. 미해결 / 주의', '주의 본문',
  '## 5. 검증 상태', '검증 본문',
].join('\n');
check('§3 은 세 번째 절이다(§2 의 "진입점"에 뺏기지 않는다)', partBody(AMBIG, 'next'), '다음 본문');
check('§2 는 변경 위치', partBody(AMBIG, 'changed'), '변경 본문');
check('§4 는 미결/주의', partBody(AMBIG, 'open'), '주의 본문');
check('모호 헤더에서도 5부 완비로 인식', analyze(AMBIG).findings.filter(f => f.rule.startsWith('part')).length, 0);

// --- §3 진입점([PRO-19] ③): 다음 작업은 [WO-*] 또는 명시적 '— 해당 없음' ---
// 실측 병인: prose 진입점이 5세션을 침묵으로 이월했다([PRO-13] "3세션 생존 = 오라우팅" 초과).
check('prose 진입점 → next-entrypoint', analyze(AMBIG).findings.map(f => f.rule), ['next-entrypoint']);
check('WO 진입점은 통과', analyze(FULL).findings.filter(f => f.rule === 'next-entrypoint').length, 0);
const noNext = FULL.replace('- [WO-01a-2]부터', '— 해당 없음');
check("'— 해당 없음' 진입점도 통과", analyze(noNext).findings.filter(f => f.rule === 'next-entrypoint').length, 0);
// 빈 §3 은 part-empty 소관 — 이중 판정하지 않는다(같은 사실에 발견 둘이면 소음).
const emptyNext = FULL.replace('- [WO-01a-2]부터\n', '');
check('빈 §3 은 part-empty 만', analyze(emptyNext).findings.map(f => f.rule), ['part-empty']);
check('없는 부는 빈 문자열(예외 아님)', partBody('# 제목만', 'next'), '');
check('parseSections: `## ` 절만', parseSections('# 제목\n## A\n본문\n### B\n하위').length, 1);

// --- 통합: 현재 레포 HANDOFF.md — 차단값(1)은 어떤 경우에도 안 나온다 ---
const code = run([]);
check('현재 레포: PASS 또는 CLARIFY', [OUTCOME.PASS, OUTCOME.CLARIFY].includes(code), true);
check('REJECT 불가 게이트', code === OUTCOME.REJECT, false);

// --- 예산 인자: analyze(text, budget) — 어답터가 adapter.json budgets.handoff 로 재캘리브레이션하면 같은 본문이 통과한다(어답터 C 실측) ---
check('예산 인자 주입: 넉넉하면 budget 소견 없음', analyze(bloated, 100000).findings.some(f => f.rule === 'budget'), false);
check('예산 인자 주입: 보고되는 budget 값', analyze(bloated, 100000).budget, 100000);

// --- [WO-29a-2] upstream 연결([PRO-29] ①(c)) — 업데이트 제안이 사람에게 닿았는지 세션 종료 의례가 묻는다 ---
{
  const UP = { updates: true, localVer: '6.0.0', upstreamVer: '6.1.0' };
  const rules = (t, up) => analyze(t, 100000, { upstream: up }).findings.map(f => f.rule);
  check('업데이트 있음 + 언급 없음 → upstream-unrelayed', rules(FULL, UP).includes('upstream-unrelayed'), true);
  const relayed3 = FULL.replace('## 3. 다음 작업', '## 3. 다음 작업\n- 상류 업데이트 제안(template-update --proposal)을 사람에게 보임 — 승인 대기');
  check('§3 에 언급 → 통과', rules(relayed3, UP).includes('upstream-unrelayed'), false);
  const relayed4 = FULL.replace(/(## 4\.[^\n]*\n)/, '$1- upstream 업데이트 있음 — 사람이 보류 결정\n');
  check('§4 에 언급 → 통과', rules(relayed4, UP).includes('upstream-unrelayed'), false);
  check('§1 요약에만 언급 → 여전히 CLARIFY(다음 세션 진입점에 있어야 한다)', rules(FULL.replace('- 했다', '- 했다 · template-update 봄'), UP).includes('upstream-unrelayed'), true);
  check('최신 → 침묵', rules(FULL, { updates: false }).includes('upstream-unrelayed'), false);
  check('캐시 없음 → 침묵', rules(FULL, null).includes('upstream-unrelayed'), false);
  check('옵션 없음(기존 호출) → 침묵(회귀 0)', analyze(FULL).findings.map(f => f.rule).includes('upstream-unrelayed'), false);
  check('메시지에 --proposal 안내', analyze(FULL, 100000, { upstream: UP }).findings.find(f => f.rule === 'upstream-unrelayed').msg.includes('--proposal'), true);
}

// --- [WO-29a-6] 상류 HANDOFF: 신규 어답터 이탈을 §3·§4 에 언급했는가([PRO-29] ②(d)) ---
{
  const R = n => ({ date: '2026-10-19', rows: [{ label: 'A', delta: { first: false, new: Array.from({ length: n }, (_, i) => `gate:g${i}`), persist: [], resolved: [] } }] });
  const rules = (t, c) => analyze(t, 100000, { census: c }).findings.map(f => f.rule);
  check('신규 이탈 있음 + 언급 없음 → adopter-deviation-unrelayed', rules(FULL, R(2)).includes('adopter-deviation-unrelayed'), true);
  const told = FULL.replace(/(## 4\.[^\n]*\n)/, (m) => m + '- 어답터 이탈 신규 2 (census 2026-10-19) — 사람에게 전달\n');
  check('§4 에 어답터 이탈 언급 → 통과', rules(told, R(2)).includes('adopter-deviation-unrelayed'), false);
  check('신규 0 → 침묵', rules(FULL, R(0)).includes('adopter-deviation-unrelayed'), false);
  check('회차 없음/어답터(census null) → 침묵', rules(FULL, null).includes('adopter-deviation-unrelayed'), false);
  check('메시지에 --handoff 안내', analyze(FULL, 100000, { census: R(1) }).findings.find(f => f.rule === 'adopter-deviation-unrelayed').msg.includes('--handoff'), true);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
