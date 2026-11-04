<!-- 방법론 자산 카드(leakage-guard METHODOLOGY 등재) — 이 템플릿이 실제로 배송하는 도구. -->
---
id: TOOL-33
title: label (파생 라벨 — ID 단독 자리에 slug 토큰 · 선택적 mnemonic override)
kind: cli
impl: scripts/label.js
status: Active
version: 1.0
---

# [TOOL-33] label

## 용도
ID 만 단독으로 나오는 자리(`sprint/next.md` 작업대 · MCP `list_docs`)에 사람이 읽을 라벨을 붙인다 — `[WO-27a-1 · prereq_upstream]`([up:PRO-26] ④ v0.2).
선언이 아니라 **파생**이다: 자기 slug 의 첫 1~2 토큰(stopword 제거), 비면 직계 부모의 slug. frontmatter `mnemonic:`(2~16자 소문자·숫자·`_-`)은 **선택적 override**
로 어디서나 허용되고 frontmatter 부모(`plan:`·`parent:`) → ID 산술 조상 순으로 상속된다([up:PRO-27] ③). 유일성 강제 없음. `node scripts/label.js` 가 루트별 니모닉 표의
**생성 뷰**다(손표 사전 금지).

## 언제 쓰나
- 작업대·목록에서 번호만 보고 뜻을 못 읽을 때 → 라벨이 자동으로 붙는다(`work-close --table --write`).
- 루트 slug 와 활성 자손의 주제가 갈라진 계보 → 그 노드에 `mnemonic:` 한 줄(override).

## 언제 쓰지 않나
- **파일명·slug 변경** — ID 도 파일명도 바꾸지 않는다([up:ADR-25]). ARCH-00 규칙 3 은 개정하지 않는다(slug 접두 규약은 하류 4/4 기각).
- **파일명이 이미 보이는 자리** — upward-fetch · blast-radius · 디렉터리 목록에는 넣지 않는다(중복).
- **레거시 독립 채번 구간의 산술 상속** — `arithmetic:false` 문서는 숫자 루트의 mnemonic 을 상속하지 않는다(냉독 반례: 거짓 라벨).

## 호출
```bash
node scripts/label.js                 # 전체 표(생성 뷰)
node scripts/label.js WO-27a-1 --json # 특정 ID 의 라벨과 출처(mnemonic · mnemonic:<부모> · slug · parent:<부모>)
```
