// scripts/ledger.js
// 원장 저장소의 **경로 정본** — 머리(`archive_ledger.md`) + 회전본(`archive_ledger/ADR-a_b.md`).
//
// 왜 모듈 하나인가([PRO-18] §3-3): 원장을 읽는 곳이 5군데(`ref-linter` 행 앵커 · `blocks-index`
// 차단 표식 · `dashboard` 시간축 · `health` 동기화 관측 · `leakage-guard` 누설 스캔)인데 전부
// 단일 경로를 하드코딩하고 있었다. 회전은 이들에게 **보이지 않아야** 하므로 경로 지식을 한 벌로
// 모은다 — 실측상 안 모으면 회전이 유령 참조 24종과 **차단 표식 6→0**을 만든다.
//
// 회전의 불변식([PRO-18] §2): append-only 가 지키는 것은 "줄이 파일에서 사라지지 않는 것"이 아니라
// **"항목이 기록에서 사라지지 않는 것"**이다. 그래서 회전본은 삭제 대상이 아니라 *같은 저장소의
// 다른 조각*이고, `read()` 가 그 조각들을 문서 순서로 다시 이어 붙여 소비자에게 하나로 보인다.
const fs = require('fs');
const path = require('path');

const HEAD = '.union-stack/archive_ledger.md';
const DIR = '.union-stack/archive_ledger';
// 회전본 파일명 — `ADR-<첫>_<끝>.md`. 첫 번호로 정렬하므로 이름이 곧 순서다.
const SHARD_RE = /^ADR-(\d+)_(\d+)\.md$/;

/** 경로가 원장 저장소인가(순수) — 가드의 append-only 판정이 쓴다. `_GUIDE.md` 는 저장소가 아니다. */
function isLedgerStore(p) {
  const s = String(p).split('\\').join('/');
  if (s === HEAD) return true;
  const m = s.startsWith(`${DIR}/`) && s.slice(DIR.length + 1);
  return !!m && SHARD_RE.test(m);
}

/** 회전본 목록(오래된 것부터). 디렉터리가 없으면 빈 배열 — **부재는 정상**(회전 전). */
function shards(root) {
  let entries = [];
  try { entries = fs.readdirSync(path.join(root, DIR)); } catch { return []; }
  return entries
    .map(e => ({ e, m: e.match(SHARD_RE) }))
    .filter(x => x.m)
    .sort((a, b) => Number(a.m[1]) - Number(b.m[1]))
    .map(x => `${DIR}/${x.e}`);
}

/** 원장을 이루는 파일 전부(회전본 → 머리 순). 머리는 항상 마지막 = 최신. */
function files(root = path.resolve(__dirname, '..')) {
  const out = shards(root);
  if (fs.existsSync(path.join(root, HEAD))) out.push(HEAD);
  return out;
}

/** 원장 전문(문서 순서로 이어 붙임). 소비자는 파일이 몇 개인지 알 필요가 없다. */
function read(root = path.resolve(__dirname, '..')) {
  return files(root)
    .map(rel => { try { return fs.readFileSync(path.join(root, rel), 'utf8'); } catch { return ''; } })
    .join('\n');
}

module.exports = { HEAD, DIR, SHARD_RE, isLedgerStore, shards, files, read };
