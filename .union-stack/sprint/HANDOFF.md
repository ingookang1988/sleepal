<!-- [Wiki] 세션 이어달리기. 세션을 마치는 에이전트가 덮어쓴다.
     ⚠ 이 문서는 **포인터만** 담는다. 어떤 사실도 여기에만 있어서는 안 된다 —
     latest-only 이고 손으로 덮어쓰므로 병렬 세션이 서로를 지운다(2026-08-22 실제 발생).
     세부는 소유 WO·평면 문서에 두고 여기서는 ID로 가리킨다. -->
# Handoff → next session

## 1. Summary
**P1(제품화) 방향이 인간 확정됐다.** UX 플로우(놀이→수면 환경→수면→기상 4모드)와 스택(바닐라 팰 런타임 유지 · 트래커 화면 한정 Vite+React · Next.js 기각 · `serve.js` zero-dep 프록시 · 유튜브 뮤직 "공존" · 놀이는 녹음→STT · 뒤척임은 배게 IMU 로드맵)을 [PHASE-02]·[PLAN-02]·HISTORY 2026-08-22 행·[ADR-302]로 기록했다. 코드 변경 없음 — 이 세션은 기획·기록 세션이다.

## 2. Changed locations (ID list)
- 신설: [PHASE-02] · [PLAN-02] v0.2 (파트 소유권 구조) — 둘 다 `tier: draft`
- WO 9건 신설(전부 Draft): [WO-02a-1]~[WO-02a-3](공통 셸·선행) · [WO-02b-1] [WO-02b-2](놀이) · [WO-02c-1](사운드) · [WO-02d-1] [WO-02d-2](모드·트래커) · [WO-02e-1](React 뷰) — `next.md` 재생성
- 계약 신설(draft): [CON-02](모드 이벤트) · [CON-03](기록 스키마) · [CON-04](프록시 API)
- profile 축 가동: `human/team_sleepal.md`(팀 레지스트리 — PO=`ingookang1988` 총괄·H파트·기획·owner) 커밋 · 실프로필은 `user_ingookang.local.md`(gitignored — **각자 로컬 체크아웃에 저장**, 원격 컨테이너는 휘발)
- 코드: [WO-02a-1] 구현 — `app/manifest.json` · `app/sw.js` · `app/icons/`(3종) · `index.html`(manifest 링크 + SW 등록, BUILD 2026-08-22e)
- HISTORY 2026-08-22 행(스택·방향 확정) · [ADR-302](재제안 차단 표식 → AGENTS.md 인덱스 반영)
- [ADR-303]: CI `validate` 영구 적색 수정 — `scripts/adopter-arm.js`(+init.js export·회귀 테스트 4건). 채택 인스턴스에서 템플릿 전용 불변식을 건너뜀
- 직전 세션분(로컬): [ADR-112]~[ADR-117](HUD·조도계 원인 수정·놓아줌) · 게이트 22/22 · [ADR-116] 배포 스테이징 경로

## 3. Next task (single entry point)
**[WO-02a-2](모듈 분할 — 병렬 게이트)** — [WO-02a-1]은 구현 완료·Verifying(실기 확인만 남음, 코드 BUILD 2026-08-22e). 이어서 [WO-02a-3](프록시). 파트 배분·병렬 규칙은 [PLAN-02] §분해와 파트 소유권.
⚠ 배포는 로컬에서 **`npm run deploy -- -p <projectId>`**(`scripts/deploy.js` — [ADR-116] 스테이징+BUILD 검증 자동화) — 원격 세션에는 railway CLI 가 없다. 배포 후 폰에서 [WO-02a-1] 실기 2종(설치·오프라인) 확인.
몸통 계보는 [WO-01d-1](폰 실측)을 **인간이 보류 지시**(2026-08-22 대화) — 재개는 인간 신호로.

## 4. Open / cautions
- **P1 최대 리스크는 밤샘 상시 가동(발열·배터리)** — 코드보다 실기 밤샘 테스트 선행 → [PLAN-02] §리스크 · [PHASE-02] Exit gate 5
- 배포는 worktree 가 아니라 스테이징 디렉터리에서 — [ADR-116]. 배포본 신선도는 dev 화면 BUILD 문자열로 확인
- ADR 번호는 계보별 대역(얼굴 101– 다음 118 · 몸통 201– 다음 206 · 그 외/02a·02b 301– 다음 304 · **트래킹 401– 다음 401**) — [ARCH-00] §ADR bands
- 전 문서 `tier: draft` — 규범적 효력 0. [PHASE-02]·[PLAN-02]·CON-02~04 승격은 인간 몫
- ~~인간 결정 대기: ADR 대역 401–499~~ → **승인·반영 완료**(2026-08-22, [ARCH-00] §ADR bands + 원장 머리말)
- [CON-01] 여전히 미검증(보드 왕복 0회) · 얼굴 실기 잔여([WO-01b-3] 오디오) · [WO-01e-1] 3:00 연출 인간 결정 미해결
- 카메라 조도계 "적응 중" 상태 배너 노출 기획 미착수 — [ADR-117] 잔여 관찰
- git: 이 세션은 원격( `claude/handoff-dev-context-a8ad12-ow7iu3` ) — 로컬 main 과 병합 필요

## 5. Verification status
- 이 세션: `zfs-linter` · `history-linter` · `permission-guard` · `blocks-index` · `npm test` 35/35 · `adopter-arm` 두 형상 전부 통과([ADR-303] 수정 후 — base 는 이 수정 머지 전까지 적색). 앱 게이트는 직전 상태 유지(얼굴 22/22 · [ADR-117])
- 실기 검증 전부 미완(폰 크롬 · 보드 · BLE 왕복 · 발열) — P0 이월
