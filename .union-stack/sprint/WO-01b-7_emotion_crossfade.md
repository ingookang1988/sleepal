<!-- [Wiki] 작업 지시. 상태 정본은 이 frontmatter `status:` 하나뿐이다([up:PRO-15]). scaffold 생성 — 선택 절(배경·설계·절차)은 필요할 때만 추가. -->
---
id: WO-01b-7
title: 표정 합성·전이 정합 — 크로스페이드 큐 · startled 통일 · fx 전이 페이드 (ANL-01b 후보 1·6·7)
status: Verifying
parent: PLAN-01b
evidence: "emotion-core.test 6/6 · face-gate 15/15 · probe 겹침 점프 16.7→1.6mm · 인간 미적 확인 대기"
closed_by: []
version: 1.0
---
# [WO-01b-7] 표정 합성·전이 정합 — 크로스페이드 큐 · startled 통일 · fx 전이 페이드 (ANL-01b 후보 1·6·7)

## 목표
[ANL-01b] 근인 1·7·8(후보 1·6·7). 표정 슬롯이 하나라 새 트리거가 이전 봉투를 한 프레임에 0 으로 떨어뜨린다(아래꺼풀 0.62→0, 약 17mm). 놀이에서 반응이 연달아 오면 얼굴이 튄다. 같은 kind 가 원천(lux/play)에 따라 다르게 보이고, zzz 가 MORNING 으로 4.5초 넘어온다. 순수 합성 핵을 `face/emotion-core.mjs` 로 분리해 node 가 연속성을 검사한다.


## 수용 기준
- [ ] `face/emotion-core.mjs`(순수) — 봉투 정의·진행·**다중 슬롯 합성**. 새 트리거가 오면 이전 슬롯은 짧은 페이드(FADE_T)로 내려가고 새 슬롯이 오른다. 채널은 합(아래꺼풀·기울기·입)이고 높이 배율은 1 기준 합
- [ ] 프레임 간 채널 변화가 연속 — happy 정점에서 curious 발화 시 아래꺼풀 한 프레임 변화 ≤ 0.1(이전 0.62)
- [ ] 모든 슬롯이 끝나면 채널 전부 0 — 기하 픽셀 단위 원복(기존 불변식 유지)
- [ ] `startled` 는 원천과 무관하게 하드 블링크를 동반(kind 기준 통일) — lux 경로의 중복 블링크 없음
- [ ] fx(zzz·음표)는 상태 전이 시 0.3초 페이드로 제거 — MORNING 에 z 잔류 0
- [ ] R4 불변: NIGHT 에서 슬롯·fx 즉시 폐기 · DROWSY 게이트 0.5 유지

## 증거
- `scripts/emotion-core.test.js` 6/6(CI) — 봉투·단일 슬롯 원복·크로스페이드 연속성(프레임 변화 ≤0.1)·합성·게이트/톤·kind 채널.
- `scripts/face-gate.js` 15/15(2026-11-05) — 겹침 아래꺼풀 0.62→0.56(이전 0.62→0.00, 약 17mm → 1.6mm) · 3.5초 뒤 슬롯 0·채널 0 · startled(play) 하드 블링크 · zzz 전이 0.45초 안 제거 · NIGHT 슬롯 폐기.
- `scripts/expr-probe.js` 전/후: overlap jumpMm 16.7 → 1.6. 다른 kind 수치 불변(glare·happy·relieved 전/후 동일).
- 인간 확인(Closed 조건): 키 6→7 연타 시 얼굴이 튀지 않는지 · 전이 페이드 0.3초가 자연스러운지.
