<!-- [Wiki] 관찰된 현재 코드 구조. -->
# Observed Structure

## `app/` — 폰(얼굴) [PLAN-01b]
| 경로 | 무엇 | 관련 |
|---|---|---|
| `app/index.html` | 얼굴 단일 파일. 외부 의존 0·빌드 0. 화면 4개(대기·얼굴·보정·디버그)와 rAF 루프 1개 | [WO-01b-1] |
| `app/face-sheet.html` | 표정 시트 겸 검사 하네스. **앱을 iframe으로 실행한다 — 그림을 옮겨 그리지 않는다**. 검사 **18항**(기존 14 + dev HUD 4) | [WO-01b-1] 증거 |
| `scripts/serve.js` | 정적 서버. 로컬 `localhost:5173/app/`, Railway는 `PORT`+`SERVE_ROOT=app` | [WO-01b-2] |
| `railway.json` · `.railwayignore` | 배포 설정. 올라가는 것은 `app/`·`serve.js`·`package.json` 뿐 | [WO-01b-2] |

### 좌표계
SVG `viewBox` = 화면 실치수(mm)이고 SVG가 화면을 꽉 채우므로 **1 유닛 = 1mm**. 보정할 숫자는 **화면 가로 mm 하나**뿐이고(`localStorage['sp.screenWmm']`, 기본 158), 세로는 CSS 픽셀 종횡비에서 유도된다. 보정 UI는 재단 원형의 **눈금바 100mm 패턴** 그대로.

### 층 구조
- **상태**(이산·보드 소유) — `STATES` 5종. `setEyeState()` 진입점.
- **표정**(연속·환경 구동) — `expression(t,dt)` 가 glare·호흡·표류·떨림을 계산해 반환하고, 루프가 눈 기하에 합성한다([WO-01b-4]).
- 표정 채널이 전부 0이면 5상태 렌더는 b-1과 같다.
- ⛔ `expression()` **최상단에 R4 게이트** — 밤에는 `return null`, 계산 자체가 돌지 않는다.
- **놓아줌**(`GL.release`) — 빛이 *급락*할 때만(안도 발화) 이완 시상수가 `TAU_DOWN 2.5` → `TAU_RELEASE 0.4` 로 바뀐다. 창 1.35초 = 안도 깜빡임 봉투 길이. 완만한 하강은 예전 그대로. [ADR-115]
- ⚠ `frame()` 의 `dt` 는 **아래를 0 에서 막아야 한다** — 음수면 `smooth()` 가 발산한다. [ADR-114]
- 검사용 `SP._step(ms)` 로 rAF 없이 루프를 결정적으로 밟을 수 있다(반응 곡선 측정·시트 정지화면).
- **계측**: 루프가 `expression()` 반환값을 `F.X` 에 남긴다(렌더 무관). `dev HUD`(`#hud` — `#faceScreen` **바깥** 형제)가 얼굴 위 **눈 아래 띠**에 4줄로 그린다. 기본 OFF · `sessionStorage` · `?dev=1`. **NIGHT 이면 devMode 와 무관하게 강제로 꺼진다**(R4). 띠 위 경계는 `EYE_SAFE=61mm` 로 매 프레임 계산 → 눈과 겹치지 않는다(R3). [ADR-112]
- **기준선 고정**(`lux.hold`) — 카메라 조도계 전용 dev 스위치. AE 가 평균 휘도를 붙들면 롤링 중앙값이 신호를 따라와 `base ≈ v` → glare 영구 0 이 되는 문제. dev 전용이라 [ADR-103] 은 불변. [ADR-113]

### [CON-01] v0.2 이행 상태
| 항목 | 상태 |
|---|---|
| `STATE:` → 눈 상태 | ✅ `handleLine()` |
| `SLEEPING` → 밤 (유도) | ✅ |
| 밤에서 `HELLO` → 아침 (유도) | ✅ |
| `LUX:`/`LUX:BASE:` → glare | ✅ 30초 롤링 중앙값 기준선. 시상수 0.15/2.5 실측 |
| 호흡 주기 상수 (4.0/5.5/6.5초) | ✅ 폰 쪽만 — 펌웨어 미구현 |
| 조도 대역 3종(슬라이더·불켜기끄기·카메라) | ✅ dev 화면. **테스트 전용 — 폰이 몸통 안에 들어가면 카메라는 방을 못 본다** |
| dev 계기판 (age·n·스파크라인·glare 막대) | ✅ 대기 화면 `dev` 버튼 또는 세 손가락 탭. 10Hz |
| 알 수 없는 메시지 무시 (규칙 5) | ✅ |
| lux가 상태 전이를 유발하지 않음 (규칙 2) | ✅ 검사됨 |
| **BLE 배관(연결·notify·라인버퍼)** | ✅ 원본에서 이식. 검사 11/11 |
| 규칙 3 정상 종료 (재연결 억제) | ✅ `normalEnd` |
| 예기치 못한 끊김 3회 백오프 재시도 | ✅ |
| **보드 왕복 실기** | ❌ 보드 없음 — [PLAN-01a] 작업 2가 첫 검증 |
| 5Hz 데드밴드 송신 | ❌ **펌웨어 미구현 — [PLAN-01a]** |

## 배포
**https://face-production-7605.up.railway.app** — Railway `sleepal`/`production`/`face`. HTTPS·`isSecureContext` 확인됨(Web Bluetooth 전제 충족). 실제 폰 확인은 미완.

## 아직 코드가 없는 곳
[PLAN-01a] 펌웨어(`ref/` 스캐폴드는 **컴파일 검증 전**) · [PLAN-01c] 앱 · 오디오([WO-01b-3]).
