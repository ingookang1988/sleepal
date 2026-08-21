<!-- 방법론 자산 카드(leakage-guard METHODOLOGY 등재) — 이 템플릿이 실제로 배송하는 도구. -->
---
id: TOOL-06
title: init 스캐폴딩 (템플릿 → 실프로젝트 1-샷 전환)
kind: cli
impl: scripts/init.js
status: Active
version: 1.0
---

# [TOOL-06] init 스캐폴딩

## 용도
정체성 시딩·더미(example) 제거·매니페스트 초기화로 템플릿을 실프로젝트로 전환한다(dry-run 기본).

## 언제 쓰나
- 클론 직후 **정확히 1회**. 미리보기 확인 후 `--apply`.

## 언제 쓰지 않나
- 이미 init된 레포 재실행 — HISTORY·원장이 리셋된다(Fail-close로 막히며, 정말 필요할 때만 `--force`).

## 호출
```bash
node scripts/init.js --name "My Project"          # dry-run
node scripts/init.js --name "My Project" --apply  # 적용 (+ --drop-template-bits)
```
