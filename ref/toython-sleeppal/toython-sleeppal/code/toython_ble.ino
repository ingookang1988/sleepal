/*
 * TOYTHON 2026 — NU-40 DK  BLE UART 양방향 스캐폴드
 * ------------------------------------------------------------
 * 보드 ↔ 스마트폰(갤럭시 Chrome) 사이의 배관(plumbing)만 담당합니다.
 * 아이디어 로직은 이 위에 얹으세요.
 *
 *   보드 → 폰 :  "BTN:A:DOWN" / "BTN:A:UP" / "BTN:B:DOWN" / "BTN:B:UP" / "HELLO"
 *   폰 → 보드 :  "LED:0~255"  (LED 밝기)
 *                "TILT:-90~90" (폰 기울기 → LED 밝기로 자동 매핑)
 *                "SHAKE"       (폰 흔들림 → LED 3회 점멸)
 *
 * 보드: Tools > Board > NUBoards nRF52 > NU40DK nRF52840
 * ------------------------------------------------------------
 */

#include <bluefruit.h>

// ─────────────────────────────────────────────
// 설정
// ─────────────────────────────────────────────
#define DEVICE_NAME     "TOYTHON-01"   // 팀마다 다르게! 100명이 모이면 이름 충돌납니다
#define LED_ACTIVE_LOW  false          // LED가 반대로 동작하면 true 로 바꾸세요

// 버튼 핀. BSP가 정의해두지 않았다면 pin_finder.ino 로 찾아서 숫자를 직접 넣으세요.
#ifndef PIN_BUTTON1
  #define PIN_BUTTON1 -1
#endif
#ifndef PIN_BUTTON2
  #define PIN_BUTTON2 -1
#endif

const int BTN_A = PIN_BUTTON1;
const int BTN_B = PIN_BUTTON2;

// ─────────────────────────────────────────────
BLEUart bleuart;

bool     lastA = HIGH, lastB = HIGH;
uint32_t tA = 0, tB = 0;
const uint32_t DEBOUNCE_MS = 30;

char     rxbuf[64];
uint8_t  rxlen = 0;
bool     linked = false;

// ─────────────────────────────────────────────
void setLed(uint8_t v) {
  analogWrite(LED_BUILTIN, LED_ACTIVE_LOW ? (255 - v) : v);
}

void blink(uint8_t times, uint16_t ms) {
  for (uint8_t i = 0; i < times; i++) {
    setLed(255); delay(ms);
    setLed(0);   delay(ms);
  }
}

void sendLine(const char* s) {
  if (linked) { bleuart.print(s); bleuart.print("\n"); }
  Serial.println(s);
}

// ─────────────────────────────────────────────
void connect_callback(uint16_t conn_handle) {
  (void) conn_handle;
  linked = true;
  blink(2, 80);
  sendLine("HELLO");
}

void disconnect_callback(uint16_t conn_handle, uint8_t reason) {
  (void) conn_handle; (void) reason;
  linked = false;
  setLed(0);
  Serial.println("disconnected");
}

void startAdv() {
  Bluefruit.Advertising.addFlags(BLE_GAP_ADV_FLAGS_LE_ONLY_GENERAL_DISC_MODE);
  Bluefruit.Advertising.addTxPower();
  Bluefruit.Advertising.addService(bleuart);
  Bluefruit.ScanResponse.addName();

  Bluefruit.Advertising.restartOnDisconnect(true);
  Bluefruit.Advertising.setInterval(32, 244);
  Bluefruit.Advertising.setFastTimeout(30);
  Bluefruit.Advertising.start(0);          // 0 = 무제한 광고
}

// ─────────────────────────────────────────────
void setup() {
  Serial.begin(115200);

  pinMode(LED_BUILTIN, OUTPUT);
  setLed(0);

  if (BTN_A >= 0) pinMode(BTN_A, INPUT_PULLUP);
  if (BTN_B >= 0) pinMode(BTN_B, INPUT_PULLUP);

  Bluefruit.begin();
  Bluefruit.setTxPower(4);
  Bluefruit.setName(DEVICE_NAME);
  Bluefruit.Periph.setConnectCallback(connect_callback);
  Bluefruit.Periph.setDisconnectCallback(disconnect_callback);

  bleuart.begin();
  startAdv();

  Serial.println("advertising as " DEVICE_NAME);
  blink(1, 150);
}

// ─────────────────────────────────────────────
void handleLine(char* line) {
  // LED:<0-255>
  if (strncmp(line, "LED:", 4) == 0) {
    int v = atoi(line + 4);
    v = constrain(v, 0, 255);
    setLed((uint8_t)v);
    return;
  }

  // TILT:<-90..90>  →  기울기를 밝기로
  if (strncmp(line, "TILT:", 5) == 0) {
    int deg = atoi(line + 5);
    deg = constrain(abs(deg), 0, 90);
    setLed((uint8_t)map(deg, 0, 90, 0, 255));
    return;
  }

  // SHAKE
  if (strcmp(line, "SHAKE") == 0) {
    blink(3, 60);
    return;
  }

  Serial.print("unknown cmd: "); Serial.println(line);
}

void pumpRx() {
  while (bleuart.available()) {
    char c = (char) bleuart.read();
    if (c == '\n' || c == '\r') {
      if (rxlen > 0) { rxbuf[rxlen] = '\0'; handleLine(rxbuf); rxlen = 0; }
    } else if (rxlen < sizeof(rxbuf) - 1) {
      rxbuf[rxlen++] = c;
    }
  }
}

void pumpButton(int pin, bool& last, uint32_t& t, const char* name) {
  if (pin < 0) return;
  bool now = digitalRead(pin);
  if (now != last && (millis() - t) > DEBOUNCE_MS) {
    t = millis();
    last = now;
    char msg[24];
    snprintf(msg, sizeof(msg), "BTN:%s:%s", name, (now == LOW) ? "DOWN" : "UP");
    sendLine(msg);
  }
}

void loop() {
  pumpRx();
  pumpButton(BTN_A, lastA, tA, "A");
  pumpButton(BTN_B, lastB, tB, "B");
  delay(5);
}
