// scripts/history-linter.test.js
// 순수 함수(findViolations) 단위 + 실제 HISTORY.md 통합 테스트.
// 실행: node scripts/history-linter.test.js
const { findViolations, findClarifications, parseHeadingEntries, run } = require('./history-linter');

let pass = 0, fail = 0;
function check(label, got, exp) {
  const ok = JSON.stringify(got) === JSON.stringify(exp);
  if (ok) pass++; else { fail++; console.error(`FAIL ${label}: got ${JSON.stringify(got)}, exp ${JSON.stringify(exp)}`); }
}

const H = '| 날짜 | 분기점(사실) | 근거(왜) | 시사점 |\n|---|---|---|---|\n';

// 사실+근거 모두 있음 → 위반 0
check('정상', findViolations(H + '| 2026-01 | A 폐기 | 라이선스 문제 | 재검토 가능 |').length, 0);

// 사실 있고 근거 빈칸 → 위반 1
check('근거 빈칸', findViolations(H + '| 2026-01 | A 폐기 |  | 메모 |').map(v => v.fact), ['A 폐기']);

// 근거가 플레이스홀더(-) → 위반
check('플레이스홀더', findViolations(H + '| 2026-01 | B 도입 | - | x |').length, 1);

// 전부 빈 행 → 무시(등재 아님)
check('빈 행 무시', findViolations(H + '|  |  |  |  |').length, 0);

// 다중 행: 하나만 위반
check('혼합', findViolations(H +
  '| 2026-01 | A 폐기 | 라이선스 | x |\n' +
  '| 2026-02 | C 피봇 | TBD | y |').map(v => v.fact), ['C 피봇']);

// 근거 컬럼 헤더 자체가 없음(양식 붕괴) → 구조 위반
const noReason = '| 날짜 | 분기점(사실) | 시사점 |\n|---|---|---|\n| 2026-01 | A 폐기 | x |';
check('근거 컬럼 없음', findViolations(noReason).length >= 1, true);

// 분기점 표가 아닌 표 → 무시
const other = '| 이름 | 값 |\n|---|---|\n| foo | bar |';
check('무관 표 무시', findViolations(other).length, 0);

// HISTORY 본문 없음(표 없음) → 위반 0
check('표 없음', findViolations('# 제목\n그냥 텍스트').length, 0);

// --- parseEntries: 분기점 표 → 항목(예시 행은 표시만) — 시간축 페이지 소비 ---
const { parseEntries } = require('./history-linter');
const histFix = [
  '| 날짜 | 분기점(사실) | 근거(왜) | 시사점 |',
  '|---|---|---|---|',
  '| (예시) 2026-01 | (예시) 더미 | (예시) 이유 | 참고 |',
  '| 2026-06-15 | v6.0 승격 | 법칙 확인 | 후속 필수 |',
].join('\n');
const ents = parseEntries(histFix);
check('parseEntries 2건(예시 포함)', ents.length, 2);
check('parseEntries 예시 표시', [ents[0].example, ents[1].example], [true, false]);
check('parseEntries 필드', [ents[1].date, ents[1].fact, ents[1].reason, ents[1].note],
  ['2026-06-15', 'v6.0 승격', '법칙 확인', '후속 필수']);
check('parseEntries 빈 입력', parseEntries(''), []);

// --- 헤딩형 HISTORY(MIGRATION 경로 이관본) — "조용한 0"이 없어야 한다 ---
// 실측: `### YYYY-MM-DD — 제목` + context/decision/rationale/impact 로 이관한 어답터에서
// 대시보드 시간축이 전략 분기점 **0**을 표시했고, 린터는 다른 불변식만 보므로 조용히 지나갔다.
const headingFix = [
  '# Project History',
  '',
  '### 2026-06-08 — 모놀리식에서 모듈러로 피봇',
  '',
  '- **Context:** 팀이 3명에서 9명으로 늘었다',
  '- **Decision:** 도메인별 패키지 분리',
  '- **Rationale:** 병렬 개발 시 머지 충돌이 주당 12건',
  '- **Impact:** 단일 개발자로 회귀하면 재평가 가능',
  '',
  '### 2026-07-02 — 결제 벤더 교체',
  '',
  '#### Context',
  '기존 벤더의 정산 지연',
  '',
  '#### 근거',
  '가격이 아니라 **정산 주기**가 현금흐름을 막았다',
  '',
  '### 2026-07-20 — 근거 없는 항목',
  '',
  '- **Context:** 뭔가 바꿨다',
].join('\n');

const he = parseHeadingEntries(headingFix);
check('헤딩형 3건 인식', he.length, 3);
check('헤딩형 날짜·사실', [he[0].date, he[0].fact], ['2026-06-08', '모놀리식에서 모듈러로 피봇']);
check('헤딩형 근거(목록 라벨)', he[0].reason, '병렬 개발 시 머지 충돌이 주당 12건');
check('헤딩형 시사점(Impact)', he[0].note, '단일 개발자로 회귀하면 재평가 가능');
check('헤딩형 근거(하위 헤딩 + 한국어 라벨)', he[1].reason, '가격이 아니라 **정산 주기**가 현금흐름을 막았다');
check('헤딩형 근거 없음 → 빈 문자열', he[2].reason, '');

// 차단은 표 형식만 — 헤딩형의 근거 부재는 CLARIFY(비차단)로 표면화된다.
check('헤딩형은 REJECT 하지 않는다', findViolations(headingFix).length, 0);
const cl = findClarifications(headingFix);
check('근거 미검출 1건이 CLARIFY 로', [cl.length, cl[0].fact], [1, '근거 없는 항목']);
check('근거가 있는 헤딩형은 CLARIFY 아님', findClarifications(headingFix.split('### 2026-07-20')[0]).length, 0);
check('표 형식만 있으면 CLARIFY 0', findClarifications(histFix).length, 0);

// parseEntries 는 두 형식을 문서 순서로 합친다 — 시간축 계수가 여기서 나온다.
const mixed = histFix + '\n\n' + headingFix;
const mixedEnts = parseEntries(mixed);
check('혼합 문서: 표 2 + 헤딩 3', mixedEnts.length, 5);
check('혼합 문서: 문서 순서 보존', mixedEnts.map(e => e.form), ['table', 'table', 'heading', 'heading', 'heading']);
check('헤딩형만 있어도 계수된다(조용한 0 없음)', parseEntries(headingFix).length, 3);
check('레벨 1 제목은 항목이 아니다', parseHeadingEntries('# 2026-01-01 제목\n본문').length, 0);
check('날짜 없는 헤딩은 항목이 아니다', parseHeadingEntries('### 그냥 절\n본문').length, 0);
check('(예시) 헤딩은 example 표시', parseHeadingEntries('### 2026-01-01 — (예시) 더미\n- 근거: x')[0].example, true);

// --- 통합: 현재 레포 HISTORY.md → 통과(exit 0) ---
check('현재 레포 통과', run(), 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
