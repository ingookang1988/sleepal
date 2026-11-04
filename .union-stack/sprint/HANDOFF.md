<!-- [Wiki] 세션 이어달리기. 세션을 마치는 에이전트가 덮어쓴다.
     ⚠ 이 문서는 **포인터만** 담는다. 어떤 사실도 여기에만 있어서는 안 된다 —
     latest-only 이고 손으로 덮어쓰므로 병렬 세션이 서로를 지운다(2026-08-22 실제 발생).
     세부는 소유 WO·평면 문서에 두고 여기서는 ID로 가리킨다. -->
# Handoff → next session

## 1. Summary
하네스를 상류 union-stack `main@20e054f`에 동기화했다([ADR-305]). sync 67파일(`ci.js` 게이트 체인·컨테이너·`ship-manifest`·`scaffold`·`weakening-guard`·`receipts`), `harness.yml`은 컨테이너 래퍼, `adapter.json` 신설, 배송 도구 카드 9장([TOOL-27]~[TOOL-36], census 제외) 추가. 다음 작업 진입점으로 [WO-02f-2]를 scaffold로 발행했다(Draft). 제품 코드(`app/`·`mobile/`·펌웨어)는 변경 0.

## 2. Changed locations (ID list)
- [ADR-305] 원장 append · [WO-02f-2] 신설(Draft) · [TOOL-27][TOOL-28][TOOL-29][TOOL-31][TOOL-32][TOOL-33][TOOL-34][TOOL-35][TOOL-36] 카드 신설
- `scripts/`(sync 67) · `.github/workflows/harness.yml` · `docker-compose.harness.yml` · `ci/Dockerfile` · `.union-stack/adapter.json` · `.union-stack/template-sync.json`(앵커) · `verification/raw/receipts.md`(시드) · `package.json`(`ci`·`ci:docker`) · `AGENTS.md`(`PHASE-*` 1줄 + 도구 인덱스 재생성) · `sprint/next.md`(라벨 포함 재생성) · `CHANGELOG.md`·`MIGRATION.md`

## 3. Next task (single entry point)
**[WO-02f-2]** — 밤샘 검증. 실기(NU40 + Galaxy S22)가 필요하므로 클라우드 세션은 계측 로깅·진단 화면 준비까지. 착수 시 status 를 Active 로.

## 4. Open / cautions
- **인간 결정 대기 ①** 상류 전용 스크립트 로컬 사본 18개(`adopter-arm`·`check-prereqs`·`eval*`·`hook-replay`·`scenario-rubric`·`token-accounting`·`e6-workspace`)는 동결 상태 — 삭제하려면 카드 6장([TOOL-08][TOOL-15][TOOL-18][TOOL-19][TOOL-20][TOOL-26])과 `package.json` 스크립트도 함께 정리해야 한다. `adopter-arm.js`는 [ADR-303] 로컬 포크(상류와 다름)로 CI 체인에서 여전히 돈다.
- **상류 제안 대기** `scripts/weakening-guard.js`·`.test.js` 로컬 포크([ADR-306] — 자기 파일 제외). 상류에 같은 수정을 제안하고, 받아들여지면 `--apply --force scripts/weakening-guard.js` 로 포크 해제.
- **인간 검토 대기 ②** review 5건 미반영: `_GUIDE.md`(plan/analytics·project/roadmap·proposals·sprint·verification) — 상류 diff 는 `node scripts/template-update.js` 보고로 재확인. 검토 후 `--ack-review`.
- 상류 API(`api.github.com`)가 이 환경에서 403 — `template-update`는 로컬 클론을 서빙하는 fetch shim 으로 돌렸다(스크래치, 미커밋). 네트워크가 되는 환경에서는 그대로 `node scripts/template-update.js` 사용.
- `harness.yml`이 docker compose 를 호출한다. PR #9 첫 CI 런에서 컨테이너 빌드·체인 실행은 정상이었고 weakening-guard 오탐만 [ADR-306]으로 해소. `ci.js`는 `adapter.json checks[suite]` 영수증을 `receipts.md`에 쓰고 래퍼가 커밋한다.
- 회고 트리거 due(정체 WO 24·GC 가능 PLAN 1 — `node scripts/retro.js --proposal`). 회고 제안 — 정체 WO 24 ≥ 5.
- 이전 세션 주의사항은 유효: `IMU:`/`MOVE:`는 RN 범위 밖, [CON-03]↔[CON-02f1] 동기화 미정의, PWA 번들 내장 후속.

## 5. Verification status
- root: `npm test` 52/52 · `npm run lint` 통과 · `node scripts/health.js` 전 게이트 통과 · `node scripts/ci.js --no-receipts` 전 단계 PASS(handoff-linter CLARIFY 는 본 문서 §3 으로 해소 예정).
- 미검증: docker 컨테이너 체인(이 환경에 docker 없음) · mobile Jest(node_modules 미설치, 핸드오프 직전 값 13/13) · `--apply` 후 상류 재조회(shim 기준 드리프트 0).
