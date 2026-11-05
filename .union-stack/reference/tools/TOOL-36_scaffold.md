<!-- 방법론 자산 카드(leakage-guard METHODOLOGY 등재) — 이 템플릿이 실제로 배송하는 도구. -->
---
id: TOOL-36
title: scaffold (WO 뼈대 생성기 — 다음 번호 제안 + parent 실존 확인 + 필수 3절)
kind: cli
impl: scripts/scaffold.js
status: Active
version: 1.0
---

# [TOOL-36] scaffold

## 용도
새 WO 를 **한 줄로** 찍는다([up:PRO-28] ④). 직전 WO 복사 + 손 수정이 변종 헤딩(한 의미에 3~5 표기)·중복 ID·빈 status 의 발생원이었다(회신 2곳 · 센서스 3회차) —
린트(사후)보다 생성(사전)이 싸다. ① **다음 번호 제안**: 산술 범위면 부모 아래 다음 자식(`PLAN-01a` → `WO-01a-N`, `PRO-28` → `WO-28a-N`, 계보 글자는 `--lineage`),
레거시 구간(`lineage.arithmeticFrom` 아래)이면 도메인 전역 최대+1. 부모 아래 **글자 자식 계열**(`66a…66k`)만 있으면 다음 글자(`66m`, l·o 건너뜀 — 어답터 실측). ② **parent 실존 확인**(ZFS 색인, 도메인+ID). ③ 뼈대 = frontmatter(status Draft · parent ·
evidence `none — 착수 전` · closed_by []) + 필수 3절(어답터 표기는 `adapter.json sections` 의 **첫 별칭**) + 선택 절 안내 한 줄. 뼈대는 **≤400 tok**.

## 언제 쓰나
- WO 를 새로 발행할 때 — dry-run 으로 번호·파일명·본문을 보고 `--write`. 그 뒤 본문을 쓰고 `work-close --table --write`.
- 번호가 헷갈릴 때 — `--json` 으로 제안만 읽는다(예약이 아니라 제안 — 동시 발행은 사람이 조정).

## 언제 쓰지 않나
- **본문 작성** — 목표·수용 기준의 내용은 사람·에이전트가 쓴다. 뼈대는 비어 있다([up:ADR-12] — 자동 서술 없음).
- **기존 문서 수정** — 같은 파일이 있으면 거부. 헤딩 변형은 별칭 맵(`sections`)으로 *읽는다*, 고치지 않는다.
- **WO 외 도메인** — 미지원(CLARIFY). 요구가 생기면 확장.
- 공개 템플릿(상류) 자신의 실제 WO 는 누설 가드 마커 관행을 따로 지켜야 한다 — 뼈대는 마커를 넣지 않는다.

## 호출
```bash
node scripts/scaffold.js WO --parent PLAN-01a --title "Refund flow"            # dry-run: 번호·파일·본문
node scripts/scaffold.js WO --parent PLAN-01a --title "환불 흐름" --slug refund_flow --write
node scripts/scaffold.js WO --parent PRO-28 --lineage b --json                  # 계보 글자 지정 · 기계 판독
node scripts/scaffold.js --contract
```
종료 코드: 0 PASS(dry-run 또는 생성) · 3 CLARIFY(parent 부재 · ID 충돌 · 파일 존재 · slug 불가 · 도메인 미지원 — 파일 안 만듦).
