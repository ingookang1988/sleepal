---
id: WO-02a-2
title: 팰 런타임 ES 모듈 분할 — 파일 경계 = 파트 경계
status: Verifying
parent: PLAN-02
evidence: "분할 완료(BUILD 2026-08-22f): 8모듈(core·main·ble·lux·hud·face/eyes·face/expression + index.html 부팅) · face-sheet 22/22 동일(헤드리스, 시상수·R4·AE 램프 곡선 포함) · SP 검증 표면 불변 · 스테이징 14파일에 face/ 포함 · sw.js 프리캐시 갱신. 미완(실기): 배포 후 폰 스모크(연결·표정·HUD)"
closed_by: []
---
# [WO-02a-2] 팰 런타임 모듈 분할

**모든 병렬 작업의 게이트.** `app/index.html` 1,073줄 단일 파일이 H·T 두 파트의 최대 충돌면이다([PLAN-02] §경계 1). 이 WO가 닫히기 전 02b~02e 코드 착수 금지.

## 목표
동작 변화 0으로 파일을 파트 소유 단위로 가른다. 빌드 없이 — 네이티브 ES 모듈(`<script type="module">`).

## 수용 기준
- [x] 분할: `face/eyes.js`·`face/expression.js`(H) · `ble.js`(H) · `lux.js`(H) · `hud.js`(dev) · `main.js`(셸 — 루프·배선) · `core.js`(공용 최하층: $·수학·log·palBus — 순환 의존 차단용)
- [x] T 파트 등록 지점 — `main.js` 상단에 mode/tracker/sound import 자리 + [CON-02] `palBus`(core) 신설, `SP.palBus` 노출
- [x] 동작 보존(기계): `face-sheet.html` 22/22 동일 — 시상수·R4·AE 램프 곡선까지 전부 통과. BUILD 문자열은 index.html 인라인 유지(deploy.js grep 전제, [ADR-116])
- [ ] 동작 보존(실기): 배포 후 폰에서 dev HUD·BLE·카메라 조도계 스모크
- [x] 단일 rAF 루프 유지 — 루프는 main.js 하나뿐, 모듈은 함수만 내보낸다
- [x] 배포 스테이징([ADR-116]/deploy.js)이 `app/` 재귀 복사로 14파일 전부 포함 확인 · `sw.js` 프리캐시에 모듈 7종 추가

## 증거
분할 커밋 전후 시트 게이트 수치 비교(22/22 = 22/22) · 배포 후 폰 실기 스모크(연결·표정·HUD).
