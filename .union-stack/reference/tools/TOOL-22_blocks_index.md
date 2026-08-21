<!-- 방법론 자산 카드(leakage-guard METHODOLOGY 등재) — 이 템플릿이 실제로 배송하는 도구. -->
---
id: TOOL-22
title: blocks-index (재제안 차단 표식의 상시 주입 인덱스)
kind: cli
impl: scripts/blocks-index.js
status: Active
version: 1.0
---

# [TOOL-22] blocks-index

## 용도
원장·제안의 `blocks:`/`reopen_when:` 표식을 모아 AGENTS.md 마커 블록에 컴파일한다 — 이미 결정된 방향의 재제안을 다음 세션이 반복하지 않게([PRO-14]).

## 언제 쓰나
- 원장·제안에 `blocks:` 표식을 새로 달았거나 해제했을 때 → `--write`로 인덱스 갱신.
- `npm run lint` 중 드리프트 CLARIFY가 뜰 때 → `--write` 후 커밋에 포함.
- 차단 목록의 현재 상태를 기계 판독으로 볼 때 → `--json`.

## 언제 쓰지 않나
- **차단의 타당성 판정** — 이 도구는 표식의 *존재·동기화*만 본다. 그 차단이 옳은지, 재제안이 실제로 일어났는지는 판정하지 않는다(`--contract`의 scope 참조).
- **기존 원장 행에 표식을 소급 부착** — `archive_ledger`는 append-only이고 소급 라벨링은 그 자체가 마찰이다([PRO-12]). 필요한 소수는 신규 ADR 한 건이 흡수한다([ADR-18]).
- **흐름 차단이 필요한 검사** — 이 게이트는 REJECT를 내지 않는다. 판정은 PASS 또는 CLARIFY뿐.

## 호출
```bash
node scripts/blocks-index.js            # check: 0(동기화) / 3(드리프트·상한초과·reopen_when 누락, 비차단)
node scripts/blocks-index.js --write    # AGENTS.md 마커 블록 재생성
node scripts/blocks-index.js --json     # 차단 항목 목록만 출력
node scripts/blocks-index.js --contract # 게이트 계약(무엇을 보고 무엇을 안 보는지)
```

## 주의 — 자기언급 오염
펜스 코드블록(```)과 제안 본문은 스캔 대상이 아니다. 문서가 *자기 표식 문법을 설명하는* 예시를 담으면
계측이 그것을 실제 항목으로 센다 — [ADR-07]이 남긴 함정이 [PRO-14] §3에서 실제로 재현됐다.
새 계측기를 만들 때 선점 확인할 사항이다.
