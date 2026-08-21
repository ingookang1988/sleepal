// scripts/ref-linter.test.js
// 순수 함수(extractRefs, findBroken) 단위 + gather/gatherGating 스모크. 실행: node scripts/ref-linter.test.js
const fs = require('fs');
const path = require('path');
const { extractRefs, findBroken, rowAnchors, ROW_STORES, gather, gatherGating } = require('./ref-linter');
const { isTemplateRepo } = require('./adapter');

let pass = 0, fail = 0;
function check(label, cond) { if (cond) pass++; else { fail++; console.error(`FAIL ${label}`); } }

// extractRefs
const refs = extractRefs('see [PLAN-01a] and [CON-01], also [WO-01a-2]. not [TODO] or [a link](x).');
check('extract count', refs.length === 3);
check('extract raws', JSON.stringify(refs.map(r => r.raw)) === JSON.stringify(['PLAN-01a', 'CON-01', 'WO-01a-2']));
check('no false [TODO]', !refs.some(r => r.domain === 'TODO'));

// forward 마커
const fwd = extractRefs('[PLAN-09z?] future and [PLAN-01a] now');
check('forward flagged', fwd.find(r => r.raw === 'PLAN-09z').forward === true);
check('non-forward flagged', fwd.find(r => r.raw === 'PLAN-01a').forward === false);

// findBroken
const known = new Set(['PLAN-01a', 'CON-01']);
const broken = findBroken(extractRefs('[PLAN-01a] [CON-01] [FLOW-09z] [FLOW-09z]'), known);
check('broken = FLOW-09z (deduped)', broken.length === 1 && broken[0].raw === 'FLOW-09z');
check('known resolve', findBroken(extractRefs('[PLAN-01a]'), known).length === 0);
check('forward never broken', findBroken(extractRefs('[FLOW-09z?]'), known).length === 0);

// 행 정본 앵커([ADR-24]) — ADR·GRANT는 파일이 아니라 원장/GRANTS의 행이다.
const [LEDGER_STORE, GRANTS_STORE] = ROW_STORES;
const ledgerSample = [
  '- (예시) [2026-01-01][ADR-01]: 예시 행 — 앵커가 아니다.',
  '- [2026-08-18][ADR-23]: 실행이다.',
  '  - [ADR-21] blocks: 하위 메타 행 — 앵커가 아니다.',
  '본문 속 [ADR-99] 언급은 앵커가 아니다 — 유령 참조는 계속 잡혀야 한다.',
].join('\n');
check('ledger 앵커: 실행만', JSON.stringify(rowAnchors(ledgerSample, LEDGER_STORE.re)) === JSON.stringify(['ADR-23']));
const grantsSample = '| GRANT-01 | scope | who | date | why |\n| (예시) GRANT-90 | x | y | z | 예시 |';
check('GRANTS 앵커: 예시 행 제외', JSON.stringify(rowAnchors(grantsSample, GRANTS_STORE.re)) === JSON.stringify(['GRANT-01']));
check('행 앵커가 참조를 해소', findBroken(extractRefs('[ADR-23]'), new Set(rowAnchors(ledgerSample, LEDGER_STORE.re))).length === 0);
check('유령 ADR은 여전히 깨짐', findBroken(extractRefs('[ADR-99]'), new Set(rowAnchors(ledgerSample, LEDGER_STORE.re))).length === 1);

// gather/gatherGating smoke (현재 레포 — 배열, 예외 없이)
const g = gather();
check('gather returns array', Array.isArray(g));
// 실재하는 행 앵커는 미해소로 세지 않는다. 어느 ID가 실재하는지는 **이 레포의 원장에서 읽는다** —
// 특정 ID를 박아 두면 원장이 리셋된 어답터(init 직후가 정상)에서 구조적으로 깨진다.
const rowIds = ROW_STORES.flatMap(s => {
  let txt = '';
  try { txt = fs.readFileSync(path.join(__dirname, '..', s.rel), 'utf8'); } catch { return []; }
  return rowAnchors(txt, s.re);
});
if (rowIds.length) check('gather가 원장·GRANTS 행을 해소', !g.some(x => rowIds.includes(x.ref)));
else console.log('(행 정본 비어 있음: 신선한 어답터 — 앵커 해소 검사 건너뜀)');
// 게이팅 대상은 정화-면제(예시/가이드/방법론) 제외 → **템플릿은** 0이어야 한다(strict 통과 보장).
// 어답터에선 0이 불변식이 아니다: 실콘텐츠에 의도된 forward-ref 가 있고, leakage-guard(면제 판정의
// 정본)가 drop-template-bits 로 사라져 방법론 문서까지 실콘텐츠로 판정되기 때문이다.
const gg = gatherGating();
check('gatherGating returns array', Array.isArray(gg));
if (isTemplateRepo()) check('gating empty on template', gg.length === 0);
else console.log(`(어답터: 템플릿 청결도 단언 건너뜀 — 게이팅 대상 ${gg.length}건)`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
