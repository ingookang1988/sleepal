<!-- 방법론 자산 카드(leakage-guard METHODOLOGY 등재) — 이 템플릿이 실제로 배송하는 도구. -->
---
id: TOOL-28
title: test-catalog (테스트 호출 자산 카탈로그의 생성 뷰)
kind: cli
impl: scripts/test-catalog.js
status: Active
version: 1.0
---

# [TOOL-28] test-catalog

## 용도
`scripts/*.js` 의 `@test-asset` 정의 지점 태그를 모아 `[up:CON-00]` 마커 블록에 컴파일한다 — 수기 카탈로그의 부패(§5.6 "낡은 카탈로그는 중복을 유발한다")를 추출=동기화로 막는다([up:PRO-21] 2단계).

## 언제 쓰나
- 테스트 헬퍼·픽스처를 새로 만들었을 때 → 정의 지점에 `@test-asset` 줄 주석 → `--write`.
- CI 체인에서 드리프트 CLARIFY 가 뜰 때 → `--write` 후 커밋에 포함(커밋은 `Approved-by: GRANT-03` 인용).
- 카탈로그의 기계 판독이 필요할 때 → `--json` (health 의 test infra 차원이 이 경로를 쓴다).

## 언제 쓰지 않나
- **관용구(규약) 등재** — 러너 관용구·순수 분리 규약은 호출 자산이 아니라 CON-00 의 수기 절이다(변경은 채팅 승인).
- **자산 품질·재사용 판정** — 태그의 존재·동기화만 본다. 그 자산이 좋은지, 실제로 재사용됐는지는 판정하지 않는다(`--contract` scope 참조).
- **흐름 차단** — REJECT 를 내지 않는다. 판정은 PASS 또는 CLARIFY 뿐이며, 카탈로그 부재(어답터 미작성)는 INFO PASS 다([up:ADR-28] 문법).

## 호출
```bash
node scripts/test-catalog.js            # check: 0(동기화) / 3(드리프트·블록 부재, 비차단)
node scripts/test-catalog.js --write    # CON-00 마커 블록 재생성 (Schema — GRANT-03)
node scripts/test-catalog.js --json     # 태그 목록만 출력
node scripts/test-catalog.js --contract # 게이트 계약
```

## 주의 — 자기언급 오염([up:ADR-19])
줄 시작의 `//` 주석만 태그다 — 문자열/픽스처 속 인용, 산문 언급, 정규식 정의는 매치되지 않고, `.md` 는 스캔하지 않는다. 회귀는 `test-catalog.test.js` 오염원 케이스가 고정한다.
