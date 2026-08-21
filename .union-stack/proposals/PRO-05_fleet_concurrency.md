<!-- [Proposal] 승인 전 효력 없음. 병렬 에이전트 플릿 동시성 의미론. 모든 ID·값은 가공 예시(example). -->
---
id: PRO-05
title: 병렬 에이전트 플릿 동시성 — append 병합안전 + 계보 파티셔닝 + Wiki OCC
status: Approved
decided_by: human-architect
reason: "2026 worktree-플릿 표준에 맞춰 동시성 의미론 명문화. append 평면=union merge, Wiki=frontmatter version OCC, 파티션 키=blast-radius 계보. 런타임 분산락은 비범위(정직한 한계)."
version: 1.0
---

# [PRO-05] 병렬 에이전트 플릿 동시성 의미론

## 1. 배경
부록 A는 "frontmatter version 기반 OCC + push 충돌 행 단위 처리"를 계승 자산으로 적었으나,
2026 표준인 **worktree 기반 N-병렬 에이전트** 하에서의 의미론이 명문화되지 않았다. 단일 인간·단일
세션 가정이 군데군데 남아 있어 플릿 시나리오의 규칙을 고정한다.

## 2. 평면별 동시성 규칙 (tier에서 연역)
- **Append-only 평면**(`archive_ledger`·`verification/raw`·`plan/meetings`·`plan/analytics`):
  **병합 안전**. 서로 다른 에이전트의 추가는 union으로 합쳐진다. 인접 추가의 거짓 충돌은
  git **union merge 드라이버**로 흡수한다(아래 4절 `.gitattributes`). 기존 줄 삭제는 permission-guard가
  이미 금지하므로 append끼리는 본질적 충돌이 없다.
- **Wiki 평면**(`feature/live`·`sprint/*`·`profile`·`lessons`·`verification/derived`):
  **행 단위 원자수정 + 프론트매터 `version` OCC**. 두 에이전트가 같은 행을 동시에 고치면 version
  불일치로 후착이 거부 → 재읽기 후 재적용(낙관적 동시성). 서로 다른 행은 자유 병렬.
- **Schema 평면**: 에이전트 read-only이므로 플릿 내 쓰기 경합이 원천적으로 없다(인간만 변경).

## 3. 파티셔닝 규칙 — 경합을 *구조로* 회피 (핵심)
락보다 **분할**이 우선이다. **Blast-Radius(계보 서브트리)를 파티션 키로** 삼는다.
- 규칙: *한 에이전트 = 하나의 ZFS 계보 서브트리*. 예) 에이전트A는 `01a*`, 에이전트B는 `02*`.
  같은 행을 두 에이전트가 만질 일이 구조적으로 줄어든다.
- worktree: 각 에이전트는 자기 계보를 격리 worktree에서 작업 → 파일 충돌면 머지에서만 만난다.
- 진입 시 `node scripts/blast-radius.js <루트ID>`로 **자기 서브트리에 잠금(Verifying/Live) 노드가
  없는지** 확인(Fail-close). 잠금 노드는 다른 에이전트가 검증 중일 수 있으므로 침범 금지.

## 4. 변경 영향 범위 (승인 시 구현 — 최소)
- **`.gitattributes` 신설**: append-only 매니페스트에 `merge=union`(거짓 충돌 자동 흡수). 코드·tier 무변경.
- `AGENTS.md` 작업-진입 의례에 "플릿이면 자기 계보 서브트리로 한정하고 진입 시 blast-radius 확인" 1문장.
- `.union-stack/sprint/_GUIDE.md`에 파티셔닝 규칙(계보=파티션 키) 1문단(**Wiki — 행 추가**).
- 신규 도메인·스크립트 게이트 **없음**.

## 5. 정직한 한계 (비범위)
- **런타임 분산락 없음**: 프로세스 간 강제 상호배제는 이 문서·git 머지로 보장하지 못한다. version OCC는
  *충돌 탐지*이지 *예방*이 아니다. 진짜 동시 동일행 수정은 후착 재시도로 수렴할 뿐, 막지는 않는다.
- 권장은 "락으로 막기"가 아니라 "**계보 분할로 만나지 않기**"다 — 구조적 회피가 1차, OCC가 2차 그물.

## 6. 결정
- → **승인**: 위 규칙 채택, 4절을 최소 변경으로 반영(`.gitattributes` 우선).
- 기각이었다면 사유 보존. 본 건은 승인.
