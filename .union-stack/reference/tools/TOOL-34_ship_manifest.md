<!-- 방법론 자산 카드(leakage-guard METHODOLOGY 등재) — 이 템플릿이 실제로 배송하는 도구. -->
---
id: TOOL-34
title: ship-manifest (배송 화이트리스트 — @ship 태그에서 생성)
kind: cli
impl: scripts/ship-manifest.js
status: Active
version: 1.0
---

# [TOOL-34] ship-manifest

## 용도
어답터에 가는 스크립트를 **상류가 열거**한다([up:PRO-24] ①(c) · §9 ①). 수기 목록이 아니라 정의 지점 태그(`// @ship upstream-only` · `// @ship optional`)에서
`scripts/ship-manifest.json` 을 생성하고, `template-update` 가 로컬·상류 매니페스트를 각각 읽어 상류 전용 스크립트(eval · eval-arm · fetch-eval ·
scenario-rubric · token-accounting · hook-replay · check-prereqs · adopter-arm · e6-workspace · adopter-census)를 배송·보고에서 뺀다. 매니페스트 밖의 로컬 스크립트는
**기본 로컬**이라 "상류에서 사라진 파일" 오보가 사라진다. `X.test.js` 는 `X.js` 의 분류를 따른다.

## 언제 쓰나
- 스크립트를 새로 만들거나 상류 전용으로 바꿨을 때 → 선두 주석에 태그 → `--write` → 커밋에 포함(CI 체인이 드리프트를 CLARIFY 로 표면화).
- 어답터가 "이 스크립트가 상류 것인가"를 물을 때 → 매니페스트가 답이다.
- **배송 파일이 상류 전용 모듈을 무조건 require** 하면 검사가 CLARIFY 다(어답터 실측: 배송 테스트가 상류 전용 평가 모듈을 require → 어답터에서
  MODULE_NOT_FOUND). 열 0 의 `const x = require('./y')` 만 본다 — try 로 감싼 조건부 require 는 부재를 감수하는 명시적 선택이라 통과.

## 언제 쓰지 않나
- **어답터 로컬 파일 선언** — 그건 `adapter.json localOwned`(글롭)다. 매니페스트는 상류 몫.
- **동작 보증** — 태그와 목록만 본다. 배송된 스크립트가 어답터에서 도는지는 어답터 팔 env 형상([up:TOOL-26])이 본다.
- **init 의 삭제 목록** — `init --drop-template-bits` 는 아직 TEMPLATE_BITS 만 지운다(상류 전용 스크립트 삭제는 별건).

## 호출
```bash
node scripts/ship-manifest.js            # 드리프트 검사: 0 / 3(비차단)
node scripts/ship-manifest.js --write    # scripts/ship-manifest.json 재생성
node scripts/ship-manifest.js --json
```
