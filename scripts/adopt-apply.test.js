// scripts/adopt-apply.test.js
// init --adopt --plan [--apply] — 사람이 고친 매핑안의 적용(순수 + 실 git 픽스처) — [WO-29a-12], [PRO-29] ③(b). 실행: node scripts/adopt-apply.test.js
const fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync } = require('child_process');
const { kindOf, selectRows, buildOps, linkSection, deliveryList, apply, LINK_HEADING } = require('./adopt-apply');
const { plan } = require('./adopt-map');

let pass = 0, fail = 0;
function check(label, cond) { if (cond) pass++; else { fail++; console.error(`FAIL ${label}`); } }
const UPSTREAM = path.resolve(__dirname, '..');
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const hush = fn => { const c = console.log, e = console.error; const out = []; console.log = (...a) => out.push(a.join(' ')); console.error = (...a) => out.push(a.join(' ')); try { return { r: fn(), out: out.join('\n') }; } finally { console.log = c; console.error = e; } };

// --- kind 추론: plan 이 kind 를 싣고, 없으면 proposedId·자리에서 유추(사람이 행을 손으로 추가해도 된다) ---
check('kind: proposedId 있으면 id', kindOf({ to: '.union-stack/plan/meetings/MTG-01_x.md', proposedId: 'MTG-01' }) === 'id');
check('kind: 원장·HISTORY·HANDOFF·IDENTITY 는 file', kindOf({ to: '.union-stack/archive_ledger.md' }) === 'file' && kindOf({ to: '.union-stack/project/HISTORY.md' }) === 'file' && kindOf({ to: '.union-stack/sprint/HANDOFF.md' }) === 'file' && kindOf({ to: '.union-stack/project/IDENTITY.md' }) === 'file');
check('kind: 그 밖(verification·spike)은 dir', kindOf({ to: '.union-stack/spike/x.md' }) === 'dir');
check('kind: 행의 kind 가 우선', kindOf({ to: '.union-stack/spike/x.md', kind: 'file' }) === 'file');

// --- 적용 행 선택([WO-29a-12] 규칙): high 적용 · medium 은 approved 만 · low·to:null 제외 · 사람 수정값 우선 · 무효 이름 거부 ---
{
  const rows = [
    { from: 'docs/meetings/2026-01-01.md', to: '.union-stack/plan/meetings/MTG-01_doc_2026_01_01.md', proposedId: 'MTG-01', confidence: 'high', kind: 'id' },
    { from: 'docs/plan.md', to: '.union-stack/plan/PLAN-01_plan.md', proposedId: 'PLAN-01', confidence: 'medium', kind: 'id' },
    { from: 'docs/plan2.md', to: '.union-stack/plan/PLAN-02_plan2.md', proposedId: 'PLAN-02', confidence: 'medium', kind: 'id', approved: true },
    { from: 'docs/misc.md', to: null, proposedId: null, confidence: 'low' },
    { from: 'docs/adr/0001.md', to: '.union-stack/archive_ledger.md', proposedId: null, confidence: 'high', kind: 'file' },
    // 사람이 to·proposedId 를 고쳤다 — 고친 값을 쓴다
    { from: 'docs/arch.md', to: '.union-stack/architecture/ARCH-07_layers.md', proposedId: 'ARCH-07', confidence: 'high', kind: 'id' },
    // 사람이 고쳤는데 ZFS 무효(소문자 도메인) → 그 행 거부
    { from: 'docs/bad.md', to: '.union-stack/architecture/arch-08_bad.md', proposedId: 'arch-08', confidence: 'high', kind: 'id' },
    // proposedId 와 to 의 ID 가 어긋남 → 거부
    { from: 'docs/bad2.md', to: '.union-stack/architecture/ARCH-09_x.md', proposedId: 'ARCH-10', confidence: 'high', kind: 'id' },
    // 자리 밖(.union-stack 밖) → 거부
    { from: 'docs/bad3.md', to: 'docs/elsewhere/ARCH-11_x.md', proposedId: 'ARCH-11', confidence: 'high', kind: 'id' },
    // 사람이 high 를 거부(approved:false) → 건너뜀
    { from: 'docs/veto.md', to: '.union-stack/plan/PLAN-03_veto.md', proposedId: 'PLAN-03', confidence: 'high', kind: 'id', approved: false },
    // 같은 자리로 두 행 → 뒤의 것 거부
    { from: 'docs/dup.md', to: '.union-stack/plan/meetings/MTG-01_doc_2026_01_01.md', proposedId: 'MTG-01', confidence: 'high', kind: 'id' },
    // dir 행은 이름 검사 없이 자리만 본다
    { from: 'experiments/poc.md', to: '.union-stack/spike/poc.md', proposedId: null, confidence: 'high', kind: 'dir' },
    { from: 'README.md', to: '.union-stack/project/IDENTITY.md', proposedId: null, confidence: 'medium', kind: 'file', approved: true },
  ];
  const s = selectRows(rows);
  const applied = s.apply.map(r => r.from), why = f => (s.skipped.find(x => x.from === f) || {}).reason || '';
  check('high 적용', applied.includes('docs/meetings/2026-01-01.md'));
  check('medium 미승인 → 건너뜀', !applied.includes('docs/plan.md') && /approved/.test(why('docs/plan.md')));
  check('medium approved → 적용', applied.includes('docs/plan2.md'));
  check('low·to:null → 목록만', !applied.includes('docs/misc.md') && /low|자리/.test(why('docs/misc.md')));
  check('file 행 적용(링크 목록 대상)', applied.includes('docs/adr/0001.md') && applied.includes('README.md'));
  check('사람 수정값 그대로', s.apply.find(r => r.from === 'docs/arch.md').to === '.union-stack/architecture/ARCH-07_layers.md');
  check('ZFS 무효 이름 거부', !applied.includes('docs/bad.md') && /ZFS/.test(why('docs/bad.md')));
  check('proposedId ≠ to 거부', !applied.includes('docs/bad2.md') && /proposedId/.test(why('docs/bad2.md')));
  check('.union-stack 밖 거부', !applied.includes('docs/bad3.md') && /union-stack/.test(why('docs/bad3.md')));
  check('approved:false 는 high 도 건너뜀', !applied.includes('docs/veto.md'));
  check('같은 자리 중복 → 뒤 행 거부', !applied.includes('docs/dup.md') && /중복/.test(why('docs/dup.md')));
  check('dir 행 적용', applied.includes('experiments/poc.md'));
  check('skipped 는 전부 from·reason', s.skipped.every(x => x.from && x.reason));
  // 규칙 자리의 글롭이 그대로 남은 행(OSS 실측: README → `IDENTITY*.md`)은 거부 — 파일 하나로 고쳐야 한다
  const g = selectRows([{ from: 'README.md', to: '.union-stack/project/IDENTITY*.md', confidence: 'high', kind: 'file' }]);
  check('글롭 남은 자리 거부', g.apply.length === 0 && /글롭/.test(g.skipped[0].reason));
}

// --- ops(순수): id/dir → mv · file → link · 이미 옮긴 행(from 없음·to 있음)은 skip(멱등) · 둘 다 있으면 충돌 ---
{
  const rows = [
    { from: 'a.md', to: '.union-stack/plan/PLAN-01_a.md', proposedId: 'PLAN-01', confidence: 'high', kind: 'id' },
    { from: 'b.md', to: '.union-stack/plan/PLAN-02_b.md', proposedId: 'PLAN-02', confidence: 'high', kind: 'id' },
    { from: 'c.md', to: '.union-stack/plan/PLAN-03_c.md', proposedId: 'PLAN-03', confidence: 'high', kind: 'id' },
    { from: 'adr/1.md', to: '.union-stack/archive_ledger.md', confidence: 'high', kind: 'file' },
    { from: 'adr/2.md', to: '.union-stack/archive_ledger.md', confidence: 'high', kind: 'file' },
  ];
  const present = new Set(['a.md', '.union-stack/plan/PLAN-02_b.md', 'c.md', '.union-stack/plan/PLAN-03_c.md', 'adr/1.md', 'adr/2.md']);
  const ops = buildOps(rows, { exists: p => present.has(p) });
  const of = from => ops.find(o => o.from === from);
  check('mv op', of('a.md').op === 'mv' && of('a.md').to === '.union-stack/plan/PLAN-01_a.md');
  check('이미 옮긴 행은 skip(멱등)', of('b.md').op === 'skip' && /이미/.test(of('b.md').reason));
  check('from·to 둘 다 있으면 충돌(덮어쓰지 않음)', of('c.md').op === 'conflict');
  const links = ops.filter(o => o.op === 'link');
  check('file 행은 자리별로 link 하나에 from 모음', links.length === 1 && links[0].file === '.union-stack/archive_ledger.md' && links[0].froms.join(',') === 'adr/1.md,adr/2.md');
}

// --- 링크 목록(순수): 헤딩 1회 · 원문 경로 줄 · 재실행 중복 0 · 본문은 손대지 않는다([ADR-12]) ---
{
  const base = '# Ledger\n\n- [ADR-01] x\n';
  const once = linkSection(base, ['docs/adr/0001.md', 'docs/adr/0002.md']);
  check('링크: 헤딩 + 경로 줄', once.includes(LINK_HEADING) && once.includes('docs/adr/0001.md') && once.includes('docs/adr/0002.md') && once.startsWith(base));
  const twice = linkSection(once, ['docs/adr/0002.md', 'docs/adr/0003.md']);
  check('링크: 재실행 — 헤딩 1회·중복 0·새 줄만 추가', twice.split(LINK_HEADING).length === 2 && twice.split('docs/adr/0002.md').length === 2 && twice.includes('docs/adr/0003.md'));
  check('링크: 추가할 것 없으면 원문 그대로', linkSection(twice, ['docs/adr/0001.md']) === twice);
}

// --- 배송 목록: 상류의 sync 범주(키트·template-update 와 같은 분류) — 스크립트는 매니페스트 열거분만, 상류 전용 0, .union-stack 콘텐츠 0 ---
{
  const d = deliveryList(UPSTREAM);
  const m = JSON.parse(fs.readFileSync(path.join(UPSTREAM, 'scripts/ship-manifest.json'), 'utf8'));
  // 어답터 팔(init --drop-template-bits 사본)에서는 shipped 중 템플릿 비트가 없다 — 실존하는 것만 본다
  check('배송: 매니페스트 shipped(실존) 전부 포함', m.shipped.filter(p => fs.existsSync(path.join(UPSTREAM, p))).every(p => d.includes(p)));
  check('배송: 상류 전용 0', m.upstreamOnly.every(p => !d.includes(p)));
  check('배송: adopt-apply 자신도 배송(대상 레포의 사람이 실행)', d.includes('scripts/adopt-apply.js'));
  check('배송: .union-stack 콘텐츠·AGENTS·README 는 배송 아님(review 는 사람 몫)', !d.some(p => p.startsWith('.union-stack/')) && !d.includes('AGENTS.md') && !d.includes('README.md'));
  check('배송: CHANGELOG·MIGRATION 포함(template-update 가 버전을 읽는다)', d.includes('CHANGELOG.md') && d.includes('MIGRATION.md'));
}

// --- 실 git 픽스처: dry-run 쓰기 0 · 깨끗하지 않은 트리 거부 · --apply = 배송·골격·git mv(이력)·링크·adapter·앵커·린트 · 재실행 멱등 ---
{
  const t = fs.mkdtempSync(path.join(os.tmpdir(), 'adopt-apply-'));
  try {
    git(t, 'init', '-q'); git(t, 'config', 'user.email', 't@t'); git(t, 'config', 'user.name', 't');
    fs.mkdirSync(path.join(t, 'docs/meetings'), { recursive: true });
    fs.mkdirSync(path.join(t, 'docs/decisions'), { recursive: true });
    fs.mkdirSync(path.join(t, 'experiments'), { recursive: true });
    fs.writeFileSync(path.join(t, 'docs/meetings/2026-01-01.md'), '# Meeting 2026-01-01\n## Attendees\n- a\n');
    fs.writeFileSync(path.join(t, 'docs/meetings/2026-01-08.md'), '# Meeting 2026-01-08\n## Agenda\n- b\n');
    fs.writeFileSync(path.join(t, 'docs/decisions/0001-db.md'), '# Use Postgres\n## Decision\nyes\n');
    fs.writeFileSync(path.join(t, 'docs/plan.md'), '# Plan\n## Goals\n- c\n');          // 평평 → medium
    fs.writeFileSync(path.join(t, 'experiments/poc.md'), '# PoC\n## Experiment\n');
    fs.writeFileSync(path.join(t, 'README.md'), '# Proj\n## Overview\n');
    fs.writeFileSync(path.join(t, 'notes.md'), 'no headings\n');                         // low
    git(t, 'add', '-A'); git(t, 'commit', '-q', '-m', 'init');
    const p = plan(t);
    check('plan 행에 kind 가 실린다', p.rows.every(r => r.confidence === 'low' || ['id', 'file', 'dir'].includes(r.kind)));
    const med = p.rows.find(r => r.from === 'docs/plan.md');
    check('픽스처 전제: plan.md 는 medium', med && med.confidence === 'medium');
    med.approved = true;                                     // 사람이 승인
    const rd = p.rows.find(r => r.from === 'README.md');
    check('plan: 루트 README 의 file 자리는 글롭 없는 IDENTITY.md', rd && rd.kind === 'file' && rd.to === '.union-stack/project/IDENTITY.md');
    rd.approved = true;                                      // 사람이 승인 → IDENTITY.md 에 링크 목록
    const head = git(t, 'rev-parse', 'HEAD').trim();
    // 어답터 팔 사본은 git 레포가 아니다 — 그땐 파일 목록 스냅샷으로 "상류 쓰기 0" 을 본다
    const upstreamSnap = () => { try { return git(UPSTREAM, 'status', '--porcelain'); } catch { return fs.readdirSync(path.join(UPSTREAM, 'scripts')).sort().join(','); } };
    const upstreamStatus = upstreamSnap();

    // dry-run: 쓰기 0
    const before = JSON.stringify(fs.readdirSync(t, { recursive: true }).sort());
    const dry = hush(() => apply(t, p, { upstreamRoot: UPSTREAM, write: false }));
    check('dry-run: exit 0 · 계획 출력(mv·link·배송 수)', dry.r.code === 0 && dry.r.ops.some(o => o.op === 'mv') && dry.r.ops.some(o => o.op === 'link'));
    check('dry-run: 대상 쓰기 0', JSON.stringify(fs.readdirSync(t, { recursive: true }).sort()) === before && git(t, 'status', '--porcelain') === '');

    // 깨끗하지 않은 트리 → 거부(exit 2) · 쓰기 0
    fs.writeFileSync(path.join(t, 'dirty.md'), 'x');
    const dirty = hush(() => apply(t, p, { upstreamRoot: UPSTREAM, write: true }));
    check('더러운 트리: 거부(exit 2) · 쓰기 0', dirty.r.code === 2 && /깨끗/.test(dirty.out) && !fs.existsSync(path.join(t, '.union-stack')));
    fs.rmSync(path.join(t, 'dirty.md'));

    // --apply
    const ap = hush(() => apply(t, p, { upstreamRoot: UPSTREAM, write: true }));
    check('apply: exit 0', ap.r.code === 0);
    const mtg = fs.readdirSync(path.join(t, '.union-stack/plan/meetings')).filter(f => /^MTG-/.test(f));
    check('apply: git mv — 회의록 2 → MTG-*', mtg.length === 2 && !fs.existsSync(path.join(t, 'docs/meetings/2026-01-01.md')));
    check('apply: git mv 는 스테이징(rename) — 커밋은 사람 몫', /^R/m.test(git(t, 'status', '--porcelain')));
    check('apply: approved medium 옮김', fs.existsSync(path.join(t, '.union-stack/plan/PLAN-01_plan.md')) && !fs.existsSync(path.join(t, 'docs/plan.md')));
    check('apply: dir 행 — spike 에 원래 이름', fs.existsSync(path.join(t, '.union-stack/spike/poc.md')));
    check('apply: low 는 그대로', fs.existsSync(path.join(t, 'notes.md')));
    const ledger = fs.readFileSync(path.join(t, '.union-stack/archive_ledger.md'), 'utf8');
    check('apply: file 행 — 원장은 옮기지 않고 링크 목록(원문 그대로 남음)', ledger.includes(LINK_HEADING) && ledger.includes('docs/decisions/0001-db.md') && fs.existsSync(path.join(t, 'docs/decisions/0001-db.md')));
    check('apply: README(approved file 행) → 옮기지 않고 IDENTITY.md 에 링크 목록', fs.existsSync(path.join(t, 'README.md')) && fs.readFileSync(path.join(t, '.union-stack/project/IDENTITY.md'), 'utf8').includes('- `README.md`'));
    check('apply: 배송 — scripts/template-update.js·ship-manifest·CHANGELOG', ['scripts/template-update.js', 'scripts/ship-manifest.json', 'CHANGELOG.md', 'scripts/zfs-linter.js'].every(f => fs.existsSync(path.join(t, f))));
    check('apply: 골격 — 모든 _GUIDE · next.md 마커', fs.existsSync(path.join(t, '.union-stack/sprint/_GUIDE.md')) && fs.existsSync(path.join(t, '.union-stack/reference/lessons/_GUIDE.md')) && /worktable:begin/.test(fs.readFileSync(path.join(t, '.union-stack/sprint/next.md'), 'utf8')));
    const ad = JSON.parse(fs.readFileSync(path.join(t, '.union-stack/adapter.json'), 'utf8'));
    check('apply: adapter.json 초안(statusMap·sections·localOwned 키)', ad && typeof ad.statusMap === 'object' && typeof ad.sections === 'object' && Array.isArray(ad.localOwned));
    check('apply: adapter.json private:true(실콘텐츠 레포 — 누설 가드 INFO 강등, OSS 실측 FAIL 343)', ad.private === true);
    const anchor = JSON.parse(fs.readFileSync(path.join(t, '.union-stack/template-sync.json'), 'utf8'));
    check('apply: 정합 앵커 — 배송 파일 sha 기록', anchor.blobs && anchor.blobs['scripts/template-update.js'] && /adopt@/.test(anchor.ref));
    check('apply: 린트 결과 보고(zfs-linter · work-close)', /zfs-linter/.test(ap.out) && /work-close/.test(ap.out));
    check('apply: 상류 쓰기 0(배송은 복사)', upstreamSnap() === upstreamStatus);

    // 재실행 멱등: 옮긴 행은 skip · 링크 중복 0 · 변경 0. (적용 뒤 트리가 더러우므로 커밋 먼저 — 사람이 하는 그 순서)
    git(t, 'add', '-A'); git(t, 'commit', '-q', '-m', 'adopt');
    check('apply: 이력 보존(커밋 뒤 git log --follow 가 원 커밋에 닿는다)', git(t, 'log', '--follow', '--format=%H', '--', `.union-stack/plan/meetings/${mtg[0]}`).trim().split('\n').includes(head));
    const again = hush(() => apply(t, p, { upstreamRoot: UPSTREAM, write: true }));
    check('재실행: exit 0 · mv 0(전부 skip)', again.r.code === 0 && !again.r.ops.some(o => o.op === 'mv') && again.r.ops.filter(o => o.op === 'skip').length >= 4);
    check('재실행: 링크 중복 0 · 작업 트리 변경 0', fs.readFileSync(path.join(t, '.union-stack/archive_ledger.md'), 'utf8').split('docs/decisions/0001-db.md').length === 2 && git(t, 'status', '--porcelain') === '');
  } finally { fs.rmSync(t, { recursive: true, force: true }); }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
