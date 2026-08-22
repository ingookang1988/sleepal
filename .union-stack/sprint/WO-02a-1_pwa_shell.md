---
id: WO-02a-1
title: PWA 요건 — 매니페스트·서비스워커·아이콘
status: Closed
parent: PLAN-02
evidence: "BUILD 2026-08-22e 배포·검증 완료: deploy.js --check-only ✓(배포본==로컬) · 폰 실기 — 앱 설치(standalone)·비행기 모드 얼굴 로드 인간 확인(PO, 2026-08-22) · face-sheet 22/22 유지 · manifest 유효·sw 구문 OK·서빙 5종 200"
closed_by: [.union-stack/feature/live.md]
---
# [WO-02a-1] PWA 요건

**발표 최소 성립 조건.** 프레임워크 없이 파일 추가만으로 끝난다(HISTORY 2026-08-22 — 스택 결정의 근거가 이 작업의 크기다).

## 목표
폰 크롬에서 "홈 화면에 추가" → 전체화면 standalone 으로 팰이 뜬다.

## 수용 기준
- [x] `app/manifest.json` — name/short_name(SleepPal) · `display: standalone` · `orientation: landscape` · 배경 `#0A0D14`(얼굴과 동일) · 아이콘 192/512 + maskable
- [x] `app/sw.js` — 셸 프리캐시 + 내비게이션 network-first(온라인=새 빌드, 오프라인=캐시 얼굴). **`/api/*` 관여 안 함**([CON-04])
- [x] 캐시 무효화 = `sw.js?v=BUILD` 등록 — SW URL 이 배포마다 바뀌고 activate 가 이전 `sleepal-*` 캐시 삭제
- [x] `<link rel="manifest">` + SW 등록(`.catch(()=>{})` — 비보안 컨텍스트 무시)
- [x] 기존 게이트 무손상 — `face-sheet` 22/22 유지(헤드리스 확인)
- [ ] **실기**: 배포 후 폰 크롬 "홈 화면에 추가" → standalone 실행 · 비행기 모드 얼굴 로드

## 증거
폰 크롬 설치 → standalone 실행 캡처 · 비행기 모드에서 얼굴 로드 확인 · 재배포 후 새 BUILD 문자열이 즉시 보임.
