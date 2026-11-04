<!-- 방법론 자산 카드(leakage-guard METHODOLOGY 등재) — 이 템플릿이 실제로 배송하는 도구. -->
---
id: TOOL-29
title: frontmatter-backfill (status: 없는 WO·PRO 백필 — dry-run 기본, 적용은 어답터)
kind: cli
impl: scripts/frontmatter-backfill.js
status: Active
version: 1.0
---

# [TOOL-29] frontmatter-backfill

## 용도
`status:` frontmatter 가 없는 WO·PRO 문서를 나열하고 추정값(본문 표식 → 종결 디렉터리 → 비움)과 출처를 병기한다([up:PRO-27] ②).
상류 도구는 frontmatter `status:` 를 읽으므로 이 문서들은 "없는 것"으로 계수된다 — 조용한 0(어답터 실측: WO 99/179 · PRO 17/17).
값은 **로컬 어휘 그대로**(`Done` 을 `Closed` 로 바꾸지 않는다) — 읽기 시 `adapter.json statusMap` 이 매핑한다.

## 언제 쓰나
- 어답터가 상류 도구(work-close·health·census)를 처음 붙일 때 → dry-run 으로 목록 확인 → `--apply` → 커밋(어답터 몫).
- [up:PRO-25] 회고 트리거처럼 상태 집계가 의심스러울 때 → 대상 0 인지 확인.

## 언제 쓰지 않나
- **추정값 판정** — 표식·디렉터리의 존재만 본다. 추정 불가는 비워 보고한다(틀린 종결 표시가 빈칸보다 해롭다 — [up:PRO-27] §7-2).
- **상류가 어답터 문서를 고치는 것** — 상류는 dry-run 과 스크립트까지. 적용·커밋은 어답터([up:PRO-27] §5).
- **흐름 차단** — REJECT 를 내지 않는다. PASS 또는 CLARIFY.

## 호출
```bash
node scripts/frontmatter-backfill.js                 # dry-run: 0(대상 없음) / 3(목록 출력, 비차단)
node scripts/frontmatter-backfill.js --root <dir>    # 다른 레포(어답터·팔 사본)
node scripts/frontmatter-backfill.js --apply         # 추정값 있는 행에 status: 한 줄 삽입 — 어답터가 실행
node scripts/frontmatter-backfill.js --json          # 기계 판독 (--contract 로 계약 출력)
```
