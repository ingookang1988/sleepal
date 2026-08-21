// scripts/session-friction.test.js
// 순수 로직(segment, aggregate, baseline, bucketOf) 테스트. 실행: node scripts/session-friction.test.js
const { segment, aggregate, baseline, bucketOf, sessionOf } = require('./session-friction');

let pass = 0, fail = 0;
function check(label, cond) { if (cond) pass++; else { fail++; console.error(`FAIL ${label}`); } }

// --- bucketOf: 첫 매칭 승리, 구체적인 것이 앞 ---
check('승인 단독 → approve', bucketOf('승인') === 'approve');
check('push → push/배포', bucketOf('push 해줘') === 'push/배포');
check('리서치 → research', bucketOf('리서치부터 해봐') === 'research/조사');
check('미분류 → other', bucketOf('오늘 날씨 어때') === 'other');

// --- segment: 발화→다음 발화 직전까지가 한 의도 ---
const U = (text, ts, session = 's1') => ({ kind: 'user', text, ts, session });
const A = (out, opts = {}) => ({ kind: 'assistant', usage: { output_tokens: out, input_tokens: 10 },
  ts: opts.ts, session: opts.session || 's1', sidechain: !!opts.sidechain, toolCalls: opts.toolCalls || 0 });

const segs = segment([
  U('push 해줘', '2026-07-25T00:00:00Z'),
  A(100, { toolCalls: 2, ts: '2026-07-25T00:00:10Z' }),
  A(50, { toolCalls: 1, ts: '2026-07-25T00:00:20Z' }),
  U('승인', '2026-07-25T00:01:00Z'),
  A(30, { ts: '2026-07-25T00:01:05Z' }),
  A(999, { sidechain: true, ts: '2026-07-25T00:01:06Z' }), // 서브에이전트는 별도 집계
]);
check('세그먼트 2개', segs.length === 2);
check('첫 의도 턴 2·도구 3·출력 150', segs[0].turns === 2 && segs[0].toolCalls === 3 && segs[0].outTok === 150);
check('버킷 부여', segs[0].bucket === 'push/배포' && segs[1].bucket === 'approve');
check('서브에이전트 턴 분리', segs[1].turns === 1 && segs[1].subTurns === 1);
check('소요 시간 계산', segs[0].durationMs === 20000);
check('발화 전 assistant는 무시', segment([A(10), U('x', '2026-01-01T00:00:00Z')]).length === 1);
check('빈 입력 → 빈 배열', segment([]).length === 0);

// 세션 경계 가드: 다른 세션의 어시스턴트 비용이 앞 세션의 마지막 의도로 새면 안 된다
// (한 팔 디렉터리에 런이 여럿일 때의 귀속 오류 — A/B 리그의 전제).
const crossed = segment([
  U('push 해줘', '2026-01-01T00:00:00Z', 's1'), A(100, { session: 's1' }),
  A(9999, { session: 's2' }),                          // s1의 의도에 얹히면 안 된다
]);
check('타 세션 비용 누수 없음', crossed.length === 1 && crossed[0].outTok === 100);
check('타 세션 턴 누수 없음', crossed[0].turns === 1);

// 서브에이전트 전사는 부모 세션에 귀속(파일명이 아니라 경로로 판정)
check('subagents → 부모 sid', sessionOf('40edefc4/subagents/agent-a02b49.jsonl') === '40edefc4');
check('일반 전사 → 파일명', sessionOf('40edefc4.jsonl') === '40edefc4');
check('중첩 경로도 부모 sid', sessionOf('x/y/sid-9/subagents/agent-z.jsonl') === 'sid-9');

// --- aggregate: 비용 순 정렬 + 독립 지지도 ---
const many = segment([
  U('push 해줘', '2026-01-01T00:00:00Z', 's1'), A(500, { session: 's1' }),
  U('push 부탁', '2026-01-01T00:10:00Z', 's1'), A(400, { session: 's1' }),
  U('설명해줘', '2026-01-01T00:20:00Z', 's1'), A(1000, { session: 's1' }),
]);
const agg = aggregate(many);
// 핵심: 1회짜리 설명(1000tok)이 2회짜리 push(900tok)보다 앞선다 — 빈도가 아니라 비용으로 정렬한다
check('비용 순 정렬(빈도 1회가 2회를 앞섬)', agg[0].bucket === 'explain/설명' && agg[0].outTok === 1000);
check('빈도 2인 push는 2위', agg[1].bucket === 'push/배포' && agg[1].count === 2 && agg[1].outTok === 900);
check('독립 지지도 = 세션 수(같은 세션이면 1)', agg[1].independent === 1);
check('평균 계산', agg[1].avgTurns === 1 && agg[1].avgOutTok === 450);

// 서로 다른 세션이면 독립 지지도가 오른다 — 상관 반복 오승격 방지의 핵심
const twoSess = segment([
  U('push 해줘', '2026-01-01T00:00:00Z', 's1'), A(100, { session: 's1' }),
  U('push 해줘', '2026-01-02T00:00:00Z', 's2'), A(100, { session: 's2' }),
]);
check('세션 2개 → indep 2', aggregate(twoSess)[0].independent === 2);

// --- homogeneity: 흡수 가능성 판별자(비용만으론 마찰과 본질 작업을 구분 못 한다) ---
// ⚠ session을 반드시 발화와 맞춰 넘긴다 — 예전 픽스처는 's1' 고정이라 세션 경계 누수에 의존했다.
const T = (tools, session = 's1') => ({ kind: 'assistant', usage: { output_tokens: 1 }, session, toolCalls: tools.length, tools });
const same = aggregate(segment([
  U('수정해줘', '2026-01-01T00:00:00Z', 's1'), T(['Read', 'Edit']),
  U('수정해줘', '2026-01-02T00:00:00Z', 's2'), T(['Edit', 'Read'], 's2'),
]))[0];
check('동일 도구집합 → 동형성 1', same.homogeneity === 1 && same.homogeneityN === 2);
const diff = aggregate(segment([
  U('수정해줘', '2026-01-01T00:00:00Z', 's1'), T(['Read']),
  U('수정해줘', '2026-01-02T00:00:00Z', 's2'), T(['Bash'], 's2'),
]))[0];
check('겹침 없음 → 동형성 0', diff.homogeneity === 0);
const noTool = aggregate(segment([
  U('수정해줘', '2026-01-01T00:00:00Z', 's1'), T([]),
  U('수정해줘', '2026-01-02T00:00:00Z', 's2'), T([], 's2'),
]))[0];
check('도구 없으면 판정 불가(null, n=0)', noTool.homogeneity === null && noTool.homogeneityN === 0);
check('표본 1개면 판정 불가', aggregate(segment([U('수정', '2026-01-01T00:00:00Z'), T(['Read'])]))[0].homogeneity === null);

// --- baseline ---
const b = baseline(many);
check('기준선 의도 수', b.intents === 3);
check('의도당 턴 평균', b.turnsPerIntent === 1);
check('의도당 출력 토큰 평균', b.outTokPerIntent === 633); // (500+400+1000)/3
check('빈 입력 → intents 0', baseline([]).intents === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
