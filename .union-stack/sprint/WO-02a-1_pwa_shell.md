---
id: WO-02a-1
title: PWA 요건 — 매니페스트·서비스워커·아이콘
status: Draft
parent: PLAN-02
evidence: "none — 미착수 (완료 시: 폰 크롬 설치 배너 캡처 + Lighthouse PWA 통과)"
closed_by: []
---
# [WO-02a-1] PWA 요건

**발표 최소 성립 조건.** 프레임워크 없이 파일 추가만으로 끝난다(HISTORY 2026-08-22 — 스택 결정의 근거가 이 작업의 크기다).

## 목표
폰 크롬에서 "홈 화면에 추가" → 전체화면 standalone 으로 팰이 뜬다.

## 수용 기준
- [ ] `app/manifest.json` — name/short_name(SleepPal) · `display: standalone` · `orientation: landscape` · 배경/테마색은 얼굴 배경과 동일 · 아이콘 192/512(마스커블 포함)
- [ ] `app/sw.js` — 앱 셸 프리캐시(오프라인에서 얼굴이 뜬다). **`/api/*`는 캐시하지 않는다**([CON-04] 소비 경로)
- [ ] 캐시 무효화가 [ADR-116]의 `BUILD` 문자열과 연동 — 배포마다 캐시 키가 바뀐다(낡은 셸 서빙 방지)
- [ ] `index.html`에 `<link rel="manifest">` + SW 등록. 등록 실패는 조용히 무시(비-HTTPS 로컬)
- [ ] 기존 게이트 무손상 — `face-sheet` 22/22 유지

## 증거
폰 크롬 설치 → standalone 실행 캡처 · 비행기 모드에서 얼굴 로드 확인 · 재배포 후 새 BUILD 문자열이 즉시 보임.
