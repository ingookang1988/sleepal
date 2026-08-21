// scripts/ledger.test.js
// 원장 경로 정본(머리 + 회전본) 단위 + 회전이 소비자에게 보이지 않는지 통합 검사.
// 실행: node scripts/ledger.test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const ledger = require('./ledger');
const { rowAnchors, extractRefs, findBroken, ROW_STORES } = require('./ref-linter');
const { extractBlocks } = require('./blocks-index');

let pass = 0, fail = 0;
function check(label, cond) { if (cond) pass++; else { fail++; console.error(`FAIL ${label}`); } }

// --- isLedgerStore: 무엇이 "저장소"인가(가드의 append-only 판정이 쓴다) ---
check('머리는 저장소', ledger.isLedgerStore('.union-stack/archive_ledger.md'));
check('회전본은 저장소', ledger.isLedgerStore('.union-stack/archive_ledger/ADR-02_25.md'));
check('가이드는 저장소가 아니다', !ledger.isLedgerStore('.union-stack/archive_ledger/_GUIDE.md'));
check('규약 밖 이름은 저장소가 아니다', !ledger.isLedgerStore('.union-stack/archive_ledger/notes.md'));
check('무관 경로', !ledger.isLedgerStore('.union-stack/project/HISTORY.md'));
check('백슬래시 경로도 정규화', ledger.isLedgerStore('.union-stack\\archive_ledger.md'));

// --- files/read: 회전본 → 머리 순서(머리가 항상 최신) ---
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-'));
const w = (rel, txt) => {
  const abs = path.join(tmp, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, txt);
};
check('아무것도 없으면 빈 목록(부재는 정상)', ledger.files(tmp).length === 0 && ledger.read(tmp) === '');

w(ledger.HEAD, '# head\n- [2026-08-20][ADR-26]: 최신.\n');
check('회전 전에는 머리 하나', JSON.stringify(ledger.files(tmp)) === JSON.stringify([ledger.HEAD]));

w(`${ledger.DIR}/ADR-10_25.md`, '# shard b\n- [2026-07-01][ADR-10]: 중간.\n');
w(`${ledger.DIR}/ADR-02_09.md`, '# shard a\n- [2026-06-14][ADR-02]: 오래됨.\n');
w(`${ledger.DIR}/_GUIDE.md`, '# guide\n');
w(`${ledger.DIR}/stray.md`, '- [2026-01-01][ADR-99]: 규약 밖 파일.\n');
check('회전본은 첫 번호 오름차순, 머리가 마지막',
  JSON.stringify(ledger.files(tmp)) === JSON.stringify([
    `${ledger.DIR}/ADR-02_09.md`, `${ledger.DIR}/ADR-10_25.md`, ledger.HEAD,
  ]));
check('가이드·규약 밖 파일은 원장이 아니다',
  !ledger.files(tmp).some(f => /_GUIDE|stray/.test(f)) && !ledger.read(tmp).includes('ADR-99'));

const full = ledger.read(tmp);
check('read 는 전 구간을 담는다', ['ADR-02', 'ADR-10', 'ADR-26'].every(id => full.includes(id)));
check('read 는 문서 순서를 지킨다', full.indexOf('ADR-02') < full.indexOf('ADR-10')
  && full.indexOf('ADR-10') < full.indexOf('ADR-26'));

// --- 회전은 소비자에게 보이지 않아야 한다([PRO-18] §3-3의 실패 모드 회귀 고정) ---
const LEDGER_STORE = ROW_STORES.find(s => s.rel === ledger.HEAD);
const anchors = new Set(rowAnchors(LEDGER_STORE.read(tmp), LEDGER_STORE.re));
check('회전본의 ADR 도 행 앵커가 된다(유령 참조 0)',
  ['ADR-02', 'ADR-10', 'ADR-26'].every(id => anchors.has(id)));
check('회전본에 있는 참조가 해소된다', findBroken(extractRefs('[ADR-02] 를 본다'), anchors).length === 0);
check('유령 ADR 은 여전히 잡힌다', findBroken(extractRefs('[ADR-77]'), anchors).length === 1);

// 차단 표식이 회전본에 있어도 수집돼야 한다 — 안 되면 AGENTS.md ⛔ 블록이 통째로 비워진다.
w(`${ledger.DIR}/ADR-02_09.md`,
  '# shard a\n- [2026-06-14][ADR-02]: 오래됨.\n  - [ADR-02] blocks: "옛 방향" · reopen_when: "조건 충족 시"\n');
const blocks = extractBlocks(ledger.read(tmp));
check('회전본의 차단 표식이 수집된다', blocks.length === 1 && blocks[0].id === 'ADR-02');
check('차단 표식의 재개 조건도 보존', blocks[0].reopen_when === '조건 충족 시');

fs.rmSync(tmp, { recursive: true, force: true });

// --- 실레포 통합: 회전 후에도 원장이 하나로 읽힌다 ---
const real = ledger.files();
check('실레포 원장 파일 ≥ 1', real.length >= 1);
check('실레포 머리는 마지막', real[real.length - 1] === ledger.HEAD);
// 회전본이 있으면 "회전본의 ADR 도 앵커로 잡히는가"가 이 설계의 실증이다.
// 회전 전(또는 원장이 비어 있는 어답터)에는 검사할 대상이 없다 — 픽스처 감지로 가른다([ADR-30]).
const root = path.resolve(__dirname, '..');
const realAnchors = new Set(rowAnchors(LEDGER_STORE.read(root), LEDGER_STORE.re));
const realShards = ledger.shards(root);
if (realShards.length) {
  const shardIds = rowAnchors(fs.readFileSync(path.join(root, realShards[0]), 'utf8'), LEDGER_STORE.re);
  check('실레포: 회전본의 ADR 이 전부 앵커로 잡힌다', shardIds.length > 0 && shardIds.every(id => realAnchors.has(id)));
  check('실레포: 머리의 ADR 도 함께 잡힌다',
    rowAnchors(fs.readFileSync(path.join(root, ledger.HEAD), 'utf8'), LEDGER_STORE.re).every(id => realAnchors.has(id)));
} else {
  console.log('(회전본 없음: 회전 전 또는 어답터 — 회전 앵커 검사 건너뜀)');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
