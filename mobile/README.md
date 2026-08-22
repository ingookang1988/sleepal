# SleepPal mobile

NU40의 Nordic UART Service 조도 라인을 받는 Android 우선 React Native 앱입니다. PWA 얼굴 소스는 `app/`이 단일 원본이며, 이 폴더는 PWA를 수정하지 않습니다.

## 개발 실행

```bash
npm install
npm run prebuild:android
npm run android
```

BLE 네이티브 모듈 때문에 Expo Go에서는 실행되지 않습니다. Development Build를 사용합니다.

선택 환경변수:

- `EXPO_PUBLIC_PWA_URL`: WebView가 열 PWA HTTPS URL
- `EXPO_PUBLIC_NU40_NAME_PREFIX`: NU40 광고 이름 prefix. 기본값 `SLEEPPAL`
- `EXPO_PUBLIC_VERY_NEAR_RSSI`: 개발용 `VERY_NEAR 추정` RSSI 문턱. 기본값 `-45`; 정확한 거리가 아님

## 검증

```bash
npm test
npm run typecheck
npx expo-doctor
```

## Firebase App Distribution

배포 대상은 `sleepal-app` Firebase 프로젝트의 Android 앱이며, Firebase에 등록할 패키지명은 `com.sleepal.mobile`과 정확히 같아야 합니다. App Distribution만 사용하는 동안에는 Firebase 런타임 SDK나 `google-services.json`이 필요하지 않습니다.

최초 1회 로그인과 프로젝트 연결:

```bash
npm run eas:login
npm run eas:init
npm run firebase:login
npm run firebase:apps
```

`firebase:apps` 결과에서 패키지명이 `com.sleepal.mobile`인 Android 앱의 Firebase App ID(`1:...:android:...`)를 확인합니다. `.env.app-distribution.example`을 참고해 셸 환경변수를 설정합니다. 이 값과 테스터 이메일/그룹은 앱 번들에 넣지 않습니다.

EAS에서 서명된 설치용 APK를 만든 뒤, 빌드 결과 링크에서 APK를 내려받아 Firebase로 올립니다.

```bash
npm run build:distribution

export FIREBASE_APP_ID='1:000000000000:android:0000000000000000000000'
export FIREBASE_TESTER_GROUPS='sleepal-testers'
export FIREBASE_RELEASE_NOTES='SleepPal Android preview'
npm run distribute:firebase -- /absolute/path/to/sleepal.apk
```

`app-distribution` EAS 프로필은 내부 배포용 APK를 만들고 원격 `versionCode`를 빌드마다 증가시킵니다. Firebase CLI는 업로드 후 콘솔·테스터 설치·단기 바이너리 다운로드 링크를 출력합니다.
