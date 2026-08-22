#!/usr/bin/env node
/**
 * 스테이징 배포 — [ADR-116]의 수동 절차를 스크립트로.
 *
 * 왜 스테이징인가: `railway up` 은 cwd 가 아니라 **git 저장소 루트**를 업로드한다.
 * worktree 에서 올리면 본체의 main 체크아웃(낡은 상태)이 올라간다 — 실측으로
 * SUCCESS 세 번 동안 서빙 내용이 한 번도 안 바뀌었다([ADR-116]). 그래서 배포
 * 필요 파일만 스크래치 디렉터리에 복사한 뒤 거기서 올린다.
 *
 *   node scripts/deploy.js --dry-run                  # 스테이징만 만들어 목록 출력
 *   node scripts/deploy.js -p <projectId>             # 스테이징 + railway up + BUILD 검증
 *   node scripts/deploy.js --check-only               # 배포본 BUILD == 로컬 BUILD 만 확인
 *
 * 옵션: -p/--project <id> · -s/--service (기본 face) · -e/--env (기본 production)
 *       --url (기본 https://face-production-7605.up.railway.app) · --dry-run · --check-only
 * 전제: 로컬에 railway CLI 로그인. 이 스크립트는 의존성 0 (Node 18+).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
// 배포에 필요한 전부 — app/ 은 재귀 복사라 icons/·manifest.json·sw.js 포함([WO-02a-1]).
const STAGE_LIST = ['app', 'scripts/serve.js', 'package.json', 'railway.json'];

const arg = (k, alt) => {
  const i = process.argv.findIndex(a => a === k || a === alt);
  return i >= 0 ? process.argv[i + 1] : null;
};
const has = (k) => process.argv.includes(k);

function localBuild() {
  const m = fs.readFileSync(path.join(ROOT, 'app/index.html'), 'utf8').match(/const BUILD = '([^']+)'/);
  if (!m) throw new Error("app/index.html 에서 BUILD 문자열을 못 찾음 — [ADR-116] 전제가 깨졌다");
  return m[1];
}

function stage() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sleepal-deploy-'));
  for (const rel of STAGE_LIST) {
    const from = path.join(ROOT, rel);
    if (!fs.existsSync(from)) throw new Error(`스테이징 대상 없음: ${rel}`);
    fs.cpSync(from, path.join(dir, rel), { recursive: true });
  }
  return dir;
}

async function checkDeployed(url, build, { tries = 18, delayMs = 10_000 } = {}) {
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(url, { redirect: 'follow' });
      const body = await res.text();
      const m = body.match(/const BUILD = '([^']+)'/);
      if (m && m[1] === build) return true;
      console.log(`  대기 ${i}/${tries} — 배포본 BUILD=${m ? m[1] : '?'} (기대 ${build})`);
    } catch (e) {
      console.log(`  대기 ${i}/${tries} — 조회 실패: ${e.message}`);
    }
    if (i < tries) await new Promise(r => setTimeout(r, delayMs));
  }
  return false;
}

async function main() {
  const build = localBuild();
  const url = arg('--url') || 'https://face-production-7605.up.railway.app';
  console.log(`# sleepal deploy — 로컬 BUILD ${build}`);

  if (has('--check-only')) {
    const ok = await checkDeployed(url, build, { tries: 1 });
    console.log(ok ? `✓ 배포본 == 로컬 (${build})` : '✗ 배포본이 로컬 BUILD 와 다르다');
    process.exit(ok ? 0 : 1);
  }

  const dir = stage();
  console.log(`스테이징: ${dir}`);
  for (const rel of STAGE_LIST) console.log(`  + ${rel}`);

  if (has('--dry-run')) { console.log('(dry-run) railway up 은 생략'); return; }

  const project = arg('-p', '--project');
  const args = ['up', '-s', arg('-s', '--service') || 'face', '-e', arg('-e', '--env') || 'production', ...(project ? ['-p', project] : [])];
  console.log(`railway ${args.join(' ')}  (cwd=${dir})`);
  const r = spawnSync('railway', args, { cwd: dir, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) { console.error(`railway up 실패 (exit ${r.status ?? 'spawn error'})`); process.exit(1); }

  console.log('업로드 완료 — 배포본 BUILD 검증([ADR-116]: SUCCESS 는 증거가 아니다)');
  const ok = await checkDeployed(url, build);
  console.log(ok ? `✓ 배포 확인: ${url} 이 BUILD ${build} 를 서빙 중` : '✗ 3분 내 새 BUILD 미확인 — Railway 로그를 볼 것');
  process.exit(ok ? 0 : 1);
}

main().catch(e => { console.error(e.message); process.exit(1); });
