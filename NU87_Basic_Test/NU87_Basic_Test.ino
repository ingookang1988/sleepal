#include <Arduino.h>
#include <WiFi.h>

const uint8_t STATUS_LED_PIN = LED_BUILTIN;
const unsigned long LED_INTERVAL_MS = 500;
const unsigned long REPORT_INTERVAL_MS = 5000;

bool ledState = false;
bool wifiScanComplete = false;
unsigned long lastLedChangeMs = 0;
unsigned long lastReportMs = 0;
unsigned long lastWifiScanMs = 0;

void setup() {
  Serial.begin(115200);
  pinMode(STATUS_LED_PIN, OUTPUT);
  digitalWrite(STATUS_LED_PIN, LOW);

  delay(1500);
  Serial.println("NU87_READY");

  const int initialWifiStatus = WiFi.status();
  Serial.print("WIFI_STATUS_INIT=");
  Serial.println(initialWifiStatus);
}

void loop() {
  const unsigned long now = millis();

  if (now - lastLedChangeMs >= LED_INTERVAL_MS) {
    lastLedChangeMs = now;
    ledState = !ledState;
    digitalWrite(STATUS_LED_PIN, ledState ? HIGH : LOW);
  }

  if (!wifiScanComplete || now - lastWifiScanMs >= 30000) {
    wifiScanComplete = true;
    lastWifiScanMs = now;
    const int networkCount = WiFi.scanNetworks();

    if (networkCount >= 0) {
      Serial.print("WIFI_SCAN_OK NETWORK_COUNT=");
      Serial.println(networkCount);
    } else {
      Serial.println("WIFI_SCAN_FAILED");
    }
  }

  if (now - lastReportMs >= REPORT_INTERVAL_MS) {
    lastReportMs = now;
    Serial.print("NU87_ALIVE UPTIME_MS=");
    Serial.println(now);
  }
}
