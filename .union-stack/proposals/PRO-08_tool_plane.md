<!-- [Proposal] 승인 전 효력 없음. reference/에 tools/ 멤버(TOOL 도메인) 신설 제안. 예시(example) 값 포함. -->
---
id: PRO-08
title: reference/tools/ — 재사용 실행 자산(스크립트·스킬·MCP 도구)의 카탈로그 평면
status: Approved
decided_by: human-architect (chat approval, 2026-07-17)
reason: "split-principle (b)에서 신규 기둥은 탈락(reference의 정의에 정합) — 기둥이 아닌 reference 네 번째 멤버로 신설. CON-00(테스트 도구 카탈로그) 선례를 일반화. 카탈로그-only 원칙 + tool-linter 드리프트 게이트 동반 조건부."
version: 1.0
---

# [PRO-08] reference/tools/ — tool 축 신설

## 1. 제안 요지
레포 안에서 재사용되는 실행 자산(스크립트·스킬·MCP 도구)을 담는 축을 추가한다.
**최상위 기둥이 아니라 `reference/`의 네 번째 멤버**로: `reference/tools/`, 도메인 접두사 `TOOL-*`.

## 2. Split-principle check (필수 절)
- (a) "없는 시스템이 없는가" — ✅ 모든 에이전트 레포에 재사용 도구가 축적된다(이 레포 자체가 scripts/ 20여 개).
- (b) "기존 셀에 안 들어가는가" — ❌ **들어간다**: reference/의 정의(*쓰기 전에 조회하는 지식 — 재사용 방지 아님, 재발명 방지*)가 정확히 도구 카탈로그의 성격이다. [CON-00]이 이미 "테스트 도구 카탈로그"로 이 성격을 계약 셀에 얹어 왔다.
- → 따라서 **기둥이 아니라 reference 멤버**. (PRO-04의 기둥-거부 선례와 같은 논리.)

## 3. 설계 결정
- **카탈로그-only**: 실체는 원래 자리(`scripts/`, `.claude/`, `.mcp.json`)에 두고, `TOOL-*` 문서는
  포인터(`impl:` frontmatter) + 사용 계약(용도·입출력·언제 쓰고 언제 쓰지 않는가)만 담는다.
- **권한 계층: Wiki**(행 단위 원자적 쓰기) — 에이전트가 도구를 만들며 등재/갱신. contracts처럼 Schema로
  잠그면 §4.4의 "장부 정리 부활"이 된다. 규율: *실체 파일이 존재할 때만 등재.*
- **드리프트 게이트**: `scripts/tool-linter.js` — 모든 `TOOL-*`의 `impl:` 경로 실존을 검사(Fail-close).
  카탈로그↔코드 드리프트를 기계로 막는 첫 코드-실존 게이트(리뷰 P2 "드리프트 게이트 부재" 부분 해소).
- 인식 지형: contracts=합의된 진리 / lessons=경험 진리 / domain=도메인 진리 / **tools=실행 가능 자산의 사용 계약**.

## 4. 반영 목록 (PRO-02 선례와 동일 접점)
`zfs_util.js` VALID_DOMAINS + `zfs_index.js` SCAN_DIRS + ARCH-00 도메인 목록 + `reference/_GUIDE.md` 표 +
`reference/tools/_GUIDE.md`(신설) + 더미 예시 TOOL-01 + README(EN/KO) reference 주석 + `tool-linter.js`(+test) +
package.json lint/test 체인 + CHANGELOG.

## 5. 바뀌지 않는 것
- 신규 기둥·게이트 구조·권한 회로 없음(Wiki 멤버 추가일 뿐 — permission-guard 규칙 변경 불요).
- 실행 자산 자체의 위치·형식(코드 리뷰·테스트 규율은 기존 그대로).
