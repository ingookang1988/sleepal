<!-- 방법론 자산 카드(leakage-guard METHODOLOGY 등재) — 이 템플릿이 실제로 배송하는 도구. -->
---
id: TOOL-35
title: union-stack-kit (손 이식 어답터의 사후 입장권 — 의존 0 단일 파일)
kind: cli
impl: scripts/union-stack-kit.js
status: Active
version: 1.0
---

# [TOOL-35] union-stack-kit

## 용도
`template-update` 도 정합 앵커도 없는 어답터(손으로 이식한 레포)에 **갱신 통로**를 연다([up:PRO-24] ①(a) · §9 ①). 의존 0 단일 파일을 한 줄로 받아 실행하면
① 상류 매니페스트를 읽어 template-update 의 require 폐포 8 파일 중 **없는 것만** 가져오고 ② 앵커(`.union-stack/template-sync.json`)를 `clone@<버전>(추정)`
으로 심는다 — 로컬이 상류(추정 클론 지점 태그 또는 main)와 **바이트 동일한 파일만** 정합으로 기록하되 **일치한 쪽의 sha**(태그와 같으면 태그 sha — main sha 를 적으면 3-way 가 localForked 로 오판, 어답터 실측)를 적고 나머지는 unknown 으로 남겨 `template-update --apply`
의 3-way 보호가 지키게 한다(앵커를 전부 정합으로 위조하면 [up:ADR-29] 사고 재현). **첫 실행은 dry-run**. `.union-stack/` 콘텐츠는 앵커 외에 건드리지 않는다.

## 언제 쓰나
- 어답터에 `scripts/template-update.js` 가 없을 때(센서스 "계측기" 열에 template-update 없음) — 어답터 세션이 한 줄을 실행한다. 상류 세션은 어답터 레포를 쓰지 않는다.
- 오프라인·검증: `--from-dir <상류 체크아웃>`(어답터 팔 `kit` 형상이 이 경로로 돈다).

## 언제 쓰지 않나
- **이미 template-update 가 있는 어답터** — 그냥 `node scripts/template-update.js`. 키트는 있는 파일을 건드리지 않으므로 해는 없지만 할 일도 없다.
- **상류 자체** — `.union-stack` 이 있어도 의미 없음.
- **하위 디렉터리 설치**(`scripts/union-stack/`) — 미지원. 배송 분류 규칙이 `scripts/*.js` 1레벨이라 하위 경로는 템플릿 소유로 인식되지 않는다(별건).

## 호출
```bash
curl -fsSL https://raw.githubusercontent.com/ingookang1988/union-stack/main/scripts/union-stack-kit.js -o scripts/union-stack-kit.js
node scripts/union-stack-kit.js                       # dry-run: 가져올 파일 · 앵커 후보 · unknown
node scripts/union-stack-kit.js --apply               # 키트 8 파일(없는 것만) + 앵커
node scripts/union-stack-kit.js --guess v6.0.0        # 추정 클론 지점 태그(기본 v<로컬 CHANGELOG 버전>)
node scripts/template-update.js                       # 그 다음 — dry-run 보고 → --apply
```
