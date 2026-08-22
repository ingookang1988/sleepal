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
