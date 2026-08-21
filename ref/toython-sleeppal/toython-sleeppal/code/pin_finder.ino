/*
 * TOYTHON 2026 — NU-40 DK  버튼 핀 찾기
 * ------------------------------------------------------------
 * 보드를 받은 직후 30초면 끝납니다.
 * 업로드 → 시리얼 모니터(115200) 열기 → 버튼을 하나씩 눌러보세요.
 * 눌린 순간 어떤 핀 번호가 LOW로 떨어지는지 출력됩니다.
 *
 * ※ 센서/케이블을 꽂기 전에 돌리세요. 모든 핀을 입력으로 잡습니다.
 * ------------------------------------------------------------
 */

const int MAX_PIN = 48;
bool prev[MAX_PIN];

void setup() {
  Serial.begin(115200);
  while (!Serial) delay(10);

  for (int p = 0; p < MAX_PIN; p++) pinMode(p, INPUT_PULLUP);
  delay(80);
  for (int p = 0; p < MAX_PIN; p++) prev[p] = digitalRead(p);

  Serial.println("=== NU-40 DK 핀 스캔 ===");
  Serial.println("버튼을 하나씩 눌렀다 떼보세요.");

#ifdef PIN_BUTTON1
  Serial.print("BSP 정의값 PIN_BUTTON1 = "); Serial.println(PIN_BUTTON1);
#endif
#ifdef PIN_BUTTON2
  Serial.print("BSP 정의값 PIN_BUTTON2 = "); Serial.println(PIN_BUTTON2);
#endif
  Serial.print("LED_BUILTIN = "); Serial.println(LED_BUILTIN);
  Serial.println("------------------------");
}

void loop() {
  for (int p = 0; p < MAX_PIN; p++) {
    bool now = digitalRead(p);
    if (now != prev[p]) {
      prev[p] = now;
      Serial.print("PIN ");
      Serial.print(p);
      Serial.println(now == LOW ? "  ->  눌림 (LOW)" : "  ->  뗌 (HIGH)");
    }
  }
  delay(20);
}
