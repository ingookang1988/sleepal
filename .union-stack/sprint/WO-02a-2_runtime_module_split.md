---
id: WO-02a-2
title: 팰 런타임 ES 모듈 분할 — 파일 경계 = 파트 경계
status: Draft
parent: PLAN-02
evidence: "none — 미착수 (완료 시: 분할 전후 face-sheet 22/22 동일 + 배포본 동작 동일)"
closed_by: []
---
# [WO-02a-2] 팰 런타임 모듈 분할

**모든 병렬 작업의 게이트.** `app/index.html` 1,073줄 단일 파일이 H·T 두 파트의 최대 충돌면이다([PLAN-02] §경계 1). 이 WO가 닫히기 전 02b~02e 코드 착수 금지.

## 목표
동작 변화 0으로 파일을 파트 소유 단위로 가른다. 빌드 없이 — 네이티브 ES 모듈(`<script type="module">`).

## 수용 기준
- [ ] 분할: `face/eyes.js`·`face/expression.js`(H) · `ble.js`(H) · `lux.js`(H) · `hud.js`(dev) · `main.js`(셸 — 루프·배선만)
- [ ] T 파트 파일(`mode.js`·`tracker.js`·`sound.js`)의 **빈 자리(등록 지점)**를 `main.js`에 마련 — T가 index.html 을 건드리지 않고 착수 가능
- [ ] 동작 보존 증명: 분할 전후 `face-sheet.html` 22/22 동일 · dev HUD·BLE·카메라 조도계 수동 확인
- [ ] 단일 rAF 루프 유지([WO-01b-4] 제약) — 모듈은 루프에 콜백을 등록하지, 루프를 새로 만들지 않는다
- [ ] `.railwayignore`·배포 스테이징([ADR-116]) 경로가 새 파일들을 포함

## 증거
분할 커밋 전후 시트 게이트 수치 비교(22/22 = 22/22) · 배포 후 폰 실기 스모크(연결·표정·HUD).
