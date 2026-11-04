// scripts/section-fetch.test.js
// 부분 인출([PRO-28] ③ · [WO-28a-3]) 순수 로직 + upward-fetch CLI 표면. 실행: node scripts/section-fetch.test.js
// 가드 먼저([ADR-40]): H2 분할 · 계약 절 선택(별칭 맵·추가 이름) · 절 없는 문서의 머리 예산 · 생략 요약 한 줄 · 기본값 불변.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { splitSections, selectSections, excerpt, renderExcerpt, fetchExcerpts, HEAD_BUDGET, OMIT_LIST_CAP } = require('./section-fetch');
const { parseConfig } = require('./adapter');
const { estimateTokens } = require('./context-budget');

let pass = 0, fail = 0;
function check(label, got, exp) {
  const ok = JSON.stringify(got) === JSON.stringify(exp);
  if (ok) pass++; else { fail++; console.error(`FAIL ${label}: got ${JSON.stringify(got)}, exp ${JSON.stringify(exp)}`); }
}

const DOC = ['<!-- (예시) -->', '---', 'id: PLAN-01a', 'status: Active', '---', '# [PLAN-01a] 결제', '머리말 한 줄.', '',
  '## 1. 목적·진입 조건', '왜 하는가.', '### 세부', '하위 절은 상위 절에 속한다.', '',
  '## 배경', '긴 서사 '.repeat(50), '', '## 수용 게이트', '- 기준 A', '', '## 진행 기록', '- 2026-01-01 x', ''].join('\n');

// --- splitSections: frontmatter 제외 · 머리 = 첫 H2 앞 · H2 만 경계(### 은 본문) ---
const sp = splitSections(DOC);
check('머리: frontmatter 제외 + 제목·머리말', sp.head.includes('# [PLAN-01a] 결제') && sp.head.includes('머리말') && !sp.head.includes('status:'), true);
check('H2 4절', sp.sections.map(s => s.heading), ['1. 목적·진입 조건', '배경', '수용 게이트', '진행 기록']);
check('### 은 상위 절 본문', sp.sections[0].body.includes('### 세부') && sp.sections[0].body.includes('하위 절'), true);
check('절 토큰은 양수', sp.sections.every(s => s.tokens > 0), true);
check('절 없는 문서', splitSections('# 제목\n본문만').sections.length, 0);

// --- selectSections: 계약 의미(별칭 맵)로 해소된 절 + --sections 추가 이름(정규화 뒤 접두) ---
const cfg0 = parseConfig('{}');
const cfgS = parseConfig('{"sections": {"목표": ["목적·진입 조건"], "수용 기준": ["수용 게이트"]}}');
check('맵 없음: 상류 표기만 → 0절 선택', selectSections(sp.sections, cfg0).picked.map(s => s.heading), []);
check('맵 있음: 목적·진입 조건(번호 정규화)·수용 게이트 선택, 서사 제외', selectSections(sp.sections, cfgS).picked.map(s => s.heading), ['1. 목적·진입 조건', '수용 게이트']);
check('추가 이름(접두): 배경', selectSections(sp.sections, cfg0, ['배']).picked.map(s => s.heading), ['배경']);
check('생략 = 나머지', selectSections(sp.sections, cfgS).omitted.map(s => s.heading), ['배경', '진행 기록']);

// --- excerpt: 머리 + 선택 절 + 생략 요약(개수·토큰·헤딩 목록 캡) ---
const ex = excerpt(DOC, { cfg: cfgS });
check('발췌 토큰 < 전문 토큰', ex.tokens < ex.full, true);
check('생략 요약: 2절 · 토큰 합', [ex.omitted.count, ex.omitted.tokens > 0], [2, true]);
check('생략 헤딩 목록은 토큰 포함', ex.omitted.headings.every(h => h.heading && h.tokens >= 0), true);
const many = ['# t', ...Array.from({ length: 12 }, (_, i) => `## 절${i}\n본문 ${i}`)].join('\n');
check('생략 헤딩 목록 캡', excerpt(many, { cfg: cfg0 }).omitted.headings.length, OMIT_LIST_CAP);
check('캡 상수 8', OMIT_LIST_CAP, 8);
// 절 경계 없는 문서는 머리 HEAD_BUDGET(1,500 tok) 까지만
const flat = '# 제목\n' + '절 없는 긴 본문 한 줄. '.repeat(1200);
const exFlat = excerpt(flat, { cfg: cfg0 });
check('절 없음: 머리만, 예산 이내', [exFlat.omitted.count, estimateTokens(exFlat.head) <= HEAD_BUDGET, exFlat.truncated], [0, true, true]);
check('머리 예산 상수 1,500', HEAD_BUDGET, 1500);
check('짧은 문서는 자르지 않는다', excerpt('# t\n짧다', { cfg: cfg0 }).truncated, false);

// --- renderExcerpt: 사람이 읽는 블록 — 선택 절 본문 + 생략 한 줄 + 토큰 비율 ---
const txt = renderExcerpt({ domain: 'PLAN', id: '01a', file: 'p.md' }, ex);
check('렌더: 헤더에 ID·파일·토큰 비율', /\[PLAN-01a\] p\.md .*~\d+\/\d+ tok/.test(txt), true);
check('렌더: 선택 절 본문 포함', txt.includes('## 수용 게이트') && txt.includes('- 기준 A'), true);
check('렌더: 생략 한 줄(개수·토큰·헤딩)', /생략 2절 · ~\d+ tok: 배경\(~\d+\) · 진행 기록\(~\d+\)/.test(txt), true);
check('렌더: 서사 본문은 없다', txt.includes('긴 서사 긴 서사'), false);

// --- fetchExcerpts: 색인 문서 목록 → 렌더 블록(파일 없으면 건너뜀) ---
const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'sf-'));
try {
  fs.mkdirSync(path.join(tmp, '.union-stack/plan'), { recursive: true });
  fs.writeFileSync(path.join(tmp, '.union-stack/plan/PLAN-01a_x.md'), DOC);
  const out = fetchExcerpts(tmp, [{ domain: 'PLAN', id: '01a', file: '.union-stack/plan/PLAN-01a_x.md' }, { domain: 'PLAN', id: '02', file: '.union-stack/plan/nope.md' }], { cfg: cfgS });
  check('존재 파일만 · 렌더 블록', [out.length, out[0].text.includes('## 수용 게이트'), out[0].id], [1, true, '01a']);
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }

// --- CLI 표면(상류 자신, 템플릿 모드에서만): 기본값 불변 · --sections 는 발췌 절 추가 · --json 에 excerpts ---
if (require('./adapter').isTemplateRepo()) {
  const cwd = path.resolve(__dirname, '..');
  const cli = args => spawnSync(process.execPath, ['scripts/upward-fetch.js', ...args], { cwd, encoding: 'utf8' });
  const plain = cli(['WO-28a-3']);
  check('기본값: 발췌 없음(불변)', [plain.status, /계약 절 발췌/.test(plain.stdout)], [0, false]);
  const sec = cli(['WO-28a-3', '--sections']);
  check('--sections: 발췌 절 + 부모 PRO-28 블록 + 생략 요약', [sec.status, /계약 절 발췌/.test(sec.stdout), /\[PRO-28\]/.test(sec.stdout), /생략 \d+절/.test(sec.stdout)], [0, true, true, true]);
  const named = cli(['WO-28a-3', '--sections', '채택안,성공 바']);
  check('--sections 이름: 그 절 본문 주입', /## 3\. 채택안/.test(named.stdout) && /## 6\. 성공 바/.test(named.stdout), true);
  const js = JSON.parse(cli(['WO-28a-3', '--sections', '--json']).stdout);
  check('--json: excerpts 배열(id·tokens·full·omitted)', Array.isArray(js.excerpts) && js.excerpts.some(e => e.id === '28' && e.tokens <= e.full && e.omitted), true);
  const full = estimateTokens(fs.readFileSync(path.join(cwd, '.union-stack/proposals/PRO-28_section_contract.md'), 'utf8'));
  const inj = js.excerpts.find(e => e.id === '28').tokens;
  check('성공 바: 부모 PRO 의 기본 발췌는 전문의 1/3 이하', inj * 3 <= full, true);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
