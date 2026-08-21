#!/usr/bin/env node
// scripts/ref-linter.js
// 브래킷 ID 참조 무결성 — 본문의 [DOMAIN-id] 참조가 색인에 실제 존재하는지 검사한다.
// (union-stack은 상대경로 금지·브래킷 ID 참조라, 이것이 ZFS-네이티브 "깨진 링크" 검사다.)
//
// 기본(advisory, exit 0): 모든 미해소 참조를 나열(템플릿·예시엔 의도적 forward-ref가 흔하다).
// --strict(Fail-close, exit 1): *게이팅 대상*만 막는다 — 다음을 모두 만족하는 참조:
//   (a) forward 마커 `[DOMAIN-id?]`(끝의 `?`)가 *아니고*,
//   (b) 파일이 정화-면제(_GUIDE·방법론·더미 마커)가 *아닌* 실제 콘텐츠 문서.
//   → 템플릿(전부 예시/가이드/방법론)은 통과하고, init 후 실프로젝트의 *진짜* 오타만 잡는다.
//   forward 의도면 `[PLAN-09z?]`로 표시(leakage-guard의 마커 철학과 동형 — 표시 한 톨이면 통과).
//
// 실행: node scripts/ref-linter.js [--strict]
const fs = require('fs');
const path = require('path');
const { buildIndex } = require('./zfs_index');
// 누설 가드는 템플릿 전용 자산이라 어답터엔 없다(`init --drop-template-bits`). 없을 때의 면제는
// **구조적 면제만** 남긴다 — 가이드는 어답터에도 방법론 텍스트지만, 더미 마커·METHODOLOGY 목록은
// 템플릿 개념이다. 어답터에서 전부 실콘텐츠라는 판정이 곧 옳은 기본값이다.
let isSanitized;
try { ({ isSanitized } = require('./leakage-guard')); }
catch { isSanitized = rel => /_GUIDE\.md$/.test(rel); }
const { walkFiles } = require('./fs_walk');
const ledger = require('./ledger');

// 끝의 (\??)로 forward 마커를 포착: `[PLAN-09z]`=일반, `[PLAN-09z?]`=의도된 forward.
const REF_RE = /\[([A-Z]{2,6})-([0-9][0-9a-z-]*)(\??)\]/g;

// 행 정본 저장소([ADR-24]) — ADR은 archive_ledger의 *행*, GRANT는 GRANTS의 *행*이라 파일 색인에
// 영원히 없다. 참조 대상이 실존하므로 known set에 편입한다(제외가 아니라 편입 — 제외하면
// 유령 참조 [ADR-99] 오타가 영원히 통과한다). buildIndex에는 절대 넣지 않는다: ADR-16의
// id "16"이 색인에 들어가면 계보 16을 오염시킨다(계수 도메인 앨리어싱의 역수입).
// `read(root)` 로 본문을 얻는다 — 원장은 회전본까지 이어 붙여야 하므로 경로 하나로는 부족하다
// ([PRO-18] §3-3: 안 넓히면 옮긴 ADR 참조가 전부 유령이 된다 — 실측 24종).
const ROW_STORES = [
  { rel: ledger.HEAD, re: /^- \[\d{4}-\d{2}-\d{2}\]\[(ADR-\d+)\]:/gm, read: root => ledger.read(root) },
  { rel: '.union-stack/project/GRANTS.md', re: /^\|\s*(GRANT-\d+)\s*\|/gm,
    read: root => { try { return fs.readFileSync(path.join(root, '.union-stack/project/GRANTS.md'), 'utf8'); } catch { return ''; } } },
];

/** 행 정본 텍스트에서 앵커 ID만 뽑는다(순수). 본문 속 *언급*은 앵커가 아니다 —
 *  언급까지 넣으면 존재하지 않는 ADR을 참조한 문장이 스스로를 해소해 검출력을 잃는다. */
function rowAnchors(text, re) {
  const out = [];
  let m;
  re.lastIndex = 0;
  while ((m = re.exec(String(text || ''))) !== null) out.push(m[1]);
  return out;
}

/** 텍스트에서 참조 추출(순수). forward=true 면 의도된 미래참조(게이트 면제). */
function extractRefs(text) {
  const out = [];
  let m;
  REF_RE.lastIndex = 0;
  while ((m = REF_RE.exec(text)) !== null) {
    out.push({ domain: m[1], id: m[2], raw: `${m[1]}-${m[2]}`, forward: m[3] === '?' });
  }
  return out;
}

/** knownSet(`DOMAIN-id`)에 없고 forward도 아닌 참조만(중복 제거, 순수). */
function findBroken(refs, knownSet) {
  const seen = new Set();
  return refs.filter(r => {
    if (r.forward || knownSet.has(r.raw) || seen.has(r.raw)) return false;
    seen.add(r.raw);
    return true;
  });
}

// gateOnly=true면 정화-면제 파일(_GUIDE·방법론·더미)은 건너뛴다(게이팅 대상만 수집).
function gather(root = path.resolve(__dirname, '..'), gateOnly = false) {
  const known = new Set(buildIndex(root).map(d => `${d.domain}-${d.id}`));
  for (const s of ROW_STORES) {
    for (const id of rowAnchors(s.read(root), s.re)) known.add(id);
  }
  const broken = [];
  walkFiles(root, '.union-stack', rel => {
    if (!rel.endsWith('.md')) return;
    let content = '';
    try { content = fs.readFileSync(path.join(root, rel), 'utf8'); } catch { return; }
    if (gateOnly && isSanitized(rel, content)) return; // 예시/가이드/방법론은 게이트 면제
    for (const r of findBroken(extractRefs(content), known)) broken.push({ file: rel, ref: r.raw });
  });
  return broken;
}

/** 게이팅 대상(실 콘텐츠 + 미마킹)만. --strict가 사용. */
function gatherGating(root) { return gather(root, true); }

function run(root) {
  const strict = process.argv.includes('--strict');
  if (strict) {
    const gating = gatherGating(root);
    if (gating.length) {
      console.error(`\n[참조] Fail-close — 실 콘텐츠의 미해소 참조 ${gating.length}건:`);
      gating.slice(0, 50).forEach(b => console.error(`  ✗ ${b.ref}  ← ${b.file}`));
      console.error('\n오타면 고치고, 의도된 미래참조면 `[DOMAIN-id?]`로 표시하라.');
      return 1;
    }
    console.log('참조 게이트 통과(strict): 실 콘텐츠에 미마킹 깨진 참조 없음.');
    return 0;
  }
  const broken = gather(root);
  if (broken.length) {
    console.error(`\n[참조] 미해소 브래킷 ID ${broken.length}건 (advisory):`);
    broken.slice(0, 50).forEach(b => console.error(`  ? ${b.ref}  ← ${b.file}`));
    console.error('\n실제 문서가 아직 없거나(forward-ref) 오타일 수 있음. --strict 시 게이팅 대상만 Fail-close.');
    return 0;
  }
  console.log('참조 무결성 통과: 모든 브래킷 ID가 해소됨.');
  return 0;
}

module.exports = { extractRefs, findBroken, rowAnchors, ROW_STORES, gather, gatherGating, run };

if (require.main === module) process.exit(run());
