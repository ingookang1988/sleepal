<!-- [Wiki] 세션 이어달리기. 세션을 마치는 에이전트가 덮어쓴다.
     ⚠ 이 문서는 **포인터만** 담는다. 어떤 사실도 여기에만 있어서는 안 된다 —
     latest-only 이고 손으로 덮어쓰므로 병렬 세션이 서로를 지운다(2026-08-22 실제 발생).
     세부는 소유 WO·평면 문서에 두고 여기서는 ID로 가리킨다. -->
# Handoff → next session

## 1. Summary
P1 기획·기록 → 공통 셸 구현까지 한 세션에 갔다. [PHASE-02]·[PLAN-02] v0.2(파트 H/T 파티션)·CON-02~04·WO 9건·ADR 대역 401–499([ARCH-00])·팀 프로필(`team_sleepal`)이 평면에 들어갔고, 코드는 [WO-02a-1](PWA 셸, **Closed**·아카이브됨)과 [WO-02a-2](모듈 분할, **Verifying**)가 main 머지·배포됐다(BUILD **2026-08-22f** 서빙 검증). CI 영구 적색이던 adopter-arm 게이트도 수정([ADR-303]). PR #1·#2 전부 머지. **그리고 보드 하드웨어를 수령했다** — 실기 검증 계보가 열린다.

## 2. Changed locations (ID list)
- 평면: [PHASE-02] · [PLAN-02] v0.2 · [CON-02] [CON-03] [CON-04] · HISTORY 2026-08-22 행 · [ADR-302] [ADR-303] · [ARCH-00] §ADR bands(+401–499) · `profile/human/team_sleepal.md` · `feature/live.md`(PWA 셸 Live)
- WO: [WO-02a-1] Closed → `sprint/archived/` · [WO-02a-2] Verifying · 02a-3~02e-1 Draft 7건
- 코드: `app/` 8모듈 분할 + PWA 5파일(BUILD 22f) · `scripts/deploy.js`([ADR-116] 자동화) · `scripts/adopter-arm.js`+회귀 4건
- 시연 시나리오 세션(2026-08-22, 인간 합의 반영): [PLAN-02] v0.3(시연 시나리오 v1 + 놀이 후보 — 거치/이탈 트리거·알람·시간당 기록·대화 일기) · [CON-03] v0.2(alarm·wake·diary·밤중 이벤트) · [WO-02d-3](알람) 신설 Draft · [WO-02d-1] 거치/이탈 행 추가 · `next.md` 재생성. 코드 변경 없음

## 3. Next task (single entry point)
**하드웨어 수령으로 [WO-01a-1](툴체인·컴파일 검증)이 최우선이 됐다** — [CON-01]은 여전히 한 번도 보드 왕복이 없는 미검증 계약이고, H 파트(강인구 PO) 소유다. 이어서 보드 lux → `LUX:` 5Hz → 표정 체인 실검증.
병행 가능: [WO-02a-3](프록시 — 공통 셸 마지막) · [WO-02a-2] 폰 스모크 마감(아래 방법).
- **02a-2 스모크 방법**: dev 화면과 얼굴이 서로 대체 관계(R3)라 버튼과 얼굴을 동시에 못 본다 — dev에서 ①카메라 조도계 ON ②표정 HUD ON 후 **닫기 → 얼굴 화면에서** 손전등 비췄다 끄기(움찔·안도 + HUD 수치), 두 손가락 탭 상태 전환. 확인되면 02a-2 Closed → **02b~02e 병렬 게이트 해제**

## 4. Open / cautions
- [WO-02a-2]가 **Verifying = 02a 계보 잠금**(blast-radius fail-close) — 스모크 마감 전 다른 세션이 02a 를 건드리면 막힌다
- ⚠ **railway.json (Config as Code) 폐기 예고** — 2026-12-01 이후 중단, `.railway/railway.ts` 마이그레이션 필요(`railway config migrate`). 급하지 않음
- 배포: `npm run deploy -- -p 7acb7b60-33ef-4d38-a44a-83f997f53226` (스테이징+BUILD 검증 자동). 이 원격 세션엔 railway CLI 없음 — 배포는 로컬
- PWA 는 SW 캐시라 **재실행 1회 후 새 빌드** — dev 화면 build 줄로 확인
- 실프로필 `user_ingookang.local.md` — **로컬 체크아웃 저장 필요**(원격 컨테이너 휘발), 내용은 세션 대화에
- ADR 대역: 얼굴 101–(다음 118) · 몸통 201–(다음 206) · 그 외/02a·02b 301–(다음 304) · **트래킹 401–(다음 401)**
- 이월 미해결: [WO-01d-1] 인간 보류 · [WO-01e-1] 3:00 연출 · 전 문서 tier: draft(승격은 인간)

## 5. Verification status
- 하네스: 전 게이트 통과 · npm test 35/35 · CI(main) 그린([ADR-303] 이후)
- 얼굴: 분할 후 face-sheet **22/22 동일**(시상수·R4·AE 램프 포함) — 동작 보존 기계 증명 완료. 폰 실기: PWA 설치·오프라인 OK([WO-02a-1] 증거) · 분할판 스모크(BLE·표정·HUD) **미완**
- 배포: BUILD 2026-08-22f 서빙 검증(deploy.js 폴링 ✓)
- 실기 전부 미완 유지: 보드 · BLE 왕복 · 발열 — **하드웨어 수령으로 이제 가능**
