---
id: WO-01b-2
title: HTTPS 배포와 폰 실기 확인
status: Active
parent: PLAN-01b
evidence: "https://face-production-7605.up.railway.app — HTTPS 200 · isSecureContext true · navigator.bluetooth 존재. 미완: 실제 폰 크롬 확인(인간)"
closed_by: [.union-stack/verification/derived/state.md]
---
# [WO-01b-2] HTTPS 배포

**선행 [WO-01b-1].** **Web Bluetooth는 HTTPS 필수다** — 로컬 파일로 열면 동작하지 않는다. 내일 아침에 배포를 시작하면 늦다.

## 목표
폰 크롬에서 URL 하나로 열리고, BLE 연결 버튼이 실제로 스캔 다이얼로그를 띄우는 상태.

## 수용 기준
- [ ] HTTPS로 배포되어 있고 URL이 [PLAN-01e] 지참물에 적혀 있다
- [ ] **실제 폰 크롬**에서 열린다(데스크톱 확인만으로는 부족)
- [ ] 가로 전체화면·회전 잠금·Wake Lock이 실기에서 동작한다
- [ ] BLE 연결 버튼이 스캔 다이얼로그를 띄운다(연결 대상 보드는 아직 없어도 됨)
- [ ] 기존 `web-client-index.html`의 Nordic UART 배관을 **재사용**했다 — 새로 만들지 않았다 ([CON-01])

## 증거
배포 URL + 폰 크롬 캡처. 스캔 다이얼로그가 뜬 캡처.

## 진행 (2026-08-22) — 배포 완료

**URL: https://face-production-7605.up.railway.app**

Railway. 프로젝트 `sleepal` / env `production` / 서비스 `face`.

| 조각 | 무엇 |
|---|---|
| `scripts/serve.js` | `PORT`·`SERVE_ROOT` 환경변수를 읽고 컨테이너에서는 `0.0.0.0`에 바인딩한다 |
| `SERVE_ROOT=app` | 얼굴이 **도메인 루트**에서 열린다 — 무대에서 칠 URL이 짧아야 한다 |
| `railway.json` | `startCommand: node scripts/serve.js` |
| `.railwayignore` | `app/` · `serve.js` · `package.json` 만 올린다. **`.union-stack/`(내부 설계 평면)과 `ref/`(16MB)는 공개 서버에 올리지 않는다** |

빌드 Nixpacks, 의존성 0(serve.js는 node 내장 모듈만 쓴다).

### 확인된 것
- `GET /` → 200, 본문 길이가 로컬과 동일(15,543)
- `isSecureContext: true` · `navigator.bluetooth: object` · `navigator.wakeLock: object` — **Web Bluetooth 전제 충족**
- viewBox가 가로 뷰포트에서 `158 x 72.98`로 잡힘

### 남은 수용 기준 (인간·실기)
- [ ] **실제 폰 크롬에서 열기** — 데스크톱 확인만으로는 부족하다(이 WO의 원래 조건)
- [ ] 가로 전체화면·회전 잠금·Wake Lock이 실기에서 동작
- [ ] BLE 연결 버튼이 스캔 다이얼로그를 띄운다 — **배관 이식 완료(아래).** 실기 확인만 남음
- [ ] 폰 북마크 등록 → [WO-01e-2]

## BLE 배관 이식 (2026-08-22)

원본 `ref/toython-sleeppal/toython-sleeppal/code/web-client-index.html` 의 연결·notify·라인버퍼를 **그대로 옮겼다.** 새로 만든 것은 [CON-01] 규칙 3(정상 종료)뿐이다.

### 규칙 3 — 재연결하지 않는 경계
`SLEEPING` 을 받으면 `normalEnd` 를 세우고, 그 뒤의 끊김은 **오류가 아니라 정상 종료**로 처리해 재연결을 시도하지 않는다. 여기서 재연결하면 팰을 깨우는 그림이 된다. 예기치 못한 끊김만 3회 백오프 재시도한다.

### UI 배치 — R3 때문에 이렇게 됐다
얼굴에는 문자를 못 넣으므로 **연결 버튼은 대기 화면**(폰을 넣기 전), **재연결·LED·WAKE 는 디버그 화면**(세 손가락 탭)에 둔다. 폰이 몸통 안에 있을 때의 유일한 조작 경로가 디버그 화면이다.

### 광고 이름 충돌 — 현장 회피 경로
[CON-01] 경고대로 스캐폴드 기본값이 `TOYTHON-01` 이라 참가자 100명이면 목록이 전부 TOYTHON 이다. **`?dev=<이름>` 으로 재배포 없이 필터를 좁힌다.** `?dev=*` 는 전체 기기 목록(최후 수단).

### 검사 11/11 OK
라인버퍼가 청크 경계를 가로질러 조립됨(`STA`+`TE:DROWSY
`) · 한 청크 다중 라인 + CRLF 혼용 · 알 수 없는 메시지로 죽지 않음(규칙 5) · `SLEEPING`→NIGHT+normalEnd · **정상 종료 시 재시도 0**(규칙 3) · 미연결 `send()` 안전 · UUID 3개가 [CON-01] 과 일치.

### 고친 결함 1건
`applyViewBox()` 가 레이아웃 전에 불리면 `innerWidth` 가 0 이라 `viewBox` 가 `NaN` 이 되고 **SVG 속성이 통째로 무효가 되어 얼굴이 사라졌다.** 도면 비율(158:73) 폴백을 넣었다. 콘솔 오류로 잡혔다 — 눈으로는 못 본다.

### 남은 것 (인간·실기)
- [ ] **실제 폰 크롬** — 전체화면·회전잠금·Wake Lock·스캔 다이얼로그
- [ ] 보드가 없어 **왕복은 미검증**. [CON-01] 첫 실기 검증은 [PLAN-01a] 작업 2(12:20)
