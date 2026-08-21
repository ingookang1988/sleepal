// scripts/adopter-arm.test.js
// 순수 함수(픽스처 생성 · 성공 바 판정) 단위. 팔 전체 실행은 비싸므로 CI 스텝이 소유한다.
// 실행: node scripts/adopter-arm.test.js
const { dataShape, rawMarkers, noJsReachable, crashed, ZONES, ROWS_PER_ZONE, HISTORY_ENTRIES } = require('./adopter-arm');
const { parseLiveRows } = require('./dashboard');
const { parseEntries } = require('./history-linter');

let pass = 0, fail = 0;
function check(label, cond) { if (cond) pass++; else { fail++; console.error(`FAIL ${label}`); } }

// --- dataShape: 픽스처가 자기 정답을 안다(그래야 계수 결함을 잡는다) ---
const { files, truth } = dataShape();
check('평면 4곳을 덮는다', ['feature/live.md', 'archive_ledger.md', 'project/HISTORY.md', 'sprint/HANDOFF.md']
  .every(f => Object.keys(files).some(k => k.endsWith(f))));
check('정답이 상수와 일치', truth.liveRows === ZONES * ROWS_PER_ZONE && truth.historyEntries === HISTORY_ENTRIES);

// 픽스처의 모양이 실제로 "다른 형상"인가 — 이게 아니면 팔이 상류를 두 번 도는 것뿐이다.
const live = files['.union-stack/feature/live.md'];
check('live: 표가 여럿', (live.match(/^\|---/gm) || []).length === ZONES);
check('live: 헤더가 한국어(어휘 판정이면 못 알아본다)', live.includes('| 기능 | ZFS Ref | 상태 |'));
check('live: 셀에 백틱·볼드', live.includes('`/zone1/item1`') && live.includes('**Live**'));
check('원장: 볼드가 구분자를 감싼다', /\*\*[^*]+ — [^*]+\*\*/.test(files['.union-stack/archive_ledger.md']));
check('HISTORY: 헤딩형', /^### \d{4}-\d{2}-\d{2} — /m.test(files['.union-stack/project/HISTORY.md']));
check('HANDOFF §3: 인용+헤딩+볼드+코드', files['.union-stack/sprint/HANDOFF.md'].includes('> ### 🎯 **'));
// 접힌 줄에 걸친 볼드 — 팔이 잡은 형상은 픽스처에 남긴다([LSN-17] 규율).
check('HANDOFF §4: 볼드가 줄바꿈을 넘는다',
  /\*\*[^*]*\n[^*]*\*\*/.test(files['.union-stack/sprint/HANDOFF.md']));

// 픽스처를 지금의 파서에 먹여 정답이 나오는지(팔이 재는 것과 같은 계산)
check('live 픽스처 → 정답 계수', parseLiveRows(live).length === truth.liveRows);
check('HISTORY 픽스처 → 정답 계수',
  parseEntries(files['.union-stack/project/HISTORY.md']).filter(e => !e.example).length === truth.historyEntries);
check('HISTORY 픽스처는 근거를 갖는다(CLARIFY 아님)',
  parseEntries(files['.union-stack/project/HISTORY.md']).every(e => e.reason));

// --- rawMarkers: 본문만 본다(속성값의 마커는 세지 않는다) ---
check('본문 마커를 센다(여는·닫는 각각)', rawMarkers('<main><div>a **b** `c`</div>') === 4);
check('title 속성은 제외', rawMarkers('<main><div title="**x**">깨끗</div>') === 0);
check('마커 없으면 0', rawMarkers('<main><div>깨끗하다</div>') === 0);

// --- noJsReachable: [ADR-26] 형상 검사 ---
const okHtml = '<input class="vsel" type="radio">#v-a:checked ~ main .view[data-view="a"] { display:block; }'
  + '<main><div class="view" data-view="a"></div></main>';
check('라디오+규칙 갖추면 도달 가능', noJsReachable(okHtml).ok);
check('뷰가 없으면 불가', !noJsReachable('<main></main>').ok);
check('라디오가 모자라면 불가',
  !noJsReachable(okHtml.replace('<input class="vsel" type="radio">', '')).ok);
check('규칙이 없으면 불가', !noJsReachable(okHtml.replace(/#v-a:checked[^}]*}/, '')).ok);
check('앵커 진입점이 있으면 불가(JS 없이 안 눌린다)',
  !noJsReachable(okHtml + '<a data-nav="a">x</a>').ok);

// --- crashed: 게이트 FAIL(판정)과 크래시(죽음)를 가른다 ---
// 이 구별이 [ADR-28]의 문법이다 — 게이트는 FAIL 할 수 있으나 죽어서는 안 된다.
check('게이트 FAIL 은 크래시가 아니다', !crashed({ code: 1, stderr: '[누설 가드] ✗ x.md\n', signal: null }));
check('exit 0 도 아니다', !crashed({ code: 0, stderr: '', signal: null }));
check('스택 프레임은 크래시', crashed({ code: 1, stderr: 'TypeError: x is not a function\n    at Object.<anonymous> (a.js:1:1)\n', signal: null }));
check('모듈 부재는 크래시', crashed({ code: 1, stderr: "Error: Cannot find module './leakage-guard'\n", signal: null }));
check('시그널은 크래시', crashed({ code: null, stderr: '', signal: 'SIGSEGV' }));
check('status 없음은 크래시', crashed({ code: -1, stderr: '', signal: null }));
// 회귀: execFileSync 래퍼 문구를 stderr 로 섞으면 모든 비영 종료가 크래시로 오판됐다(실측).
check('"Command failed" 래퍼 문구에 속지 않는다', !crashed({ code: 1, stderr: '', signal: null }));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
