#include <Arduino.h>
#include <Wire.h>
#include <bluefruit.h>
#include <LSM6DSLSensor.h>
#include <math.h>

#define DEVICE_NAME "SLEEPPAL-PILLOW-01"

const bool SEND_RAW_IMU = true;
const unsigned long IMU_SAMPLE_INTERVAL_MS = 20;
const unsigned long IMU_NOTIFY_INTERVAL_MS = 100;
const unsigned long LIGHT_SAMPLE_INTERVAL_MS = 20;
const unsigned long LIGHT_NOTIFY_INTERVAL_MS = 200;
const unsigned long LIGHT_REPORT_INTERVAL_MS = 1000;
const unsigned long SENSOR_RETRY_INTERVAL_MS = 5000;
const unsigned long MOTION_REFRACTORY_MS = 3000;
const uint16_t MOTION_WINDOW_SAMPLES = 50;
const int LIGHT_DEADBAND = 8;
const uint16_t LIGHT_BASELINE_SAMPLES = 100;
const float LIGHT_EMA_ALPHA = 0.15f;

const float ACC_RMS_THRESHOLD_RAW = 250.0f;
const float GYRO_RMS_THRESHOLD_RAW = 300.0f;

BLEUart bleuart;
LSM6DSLSensor imu(&Wire, LSM6DSL_ACC_GYRO_I2C_ADDRESS_LOW);

bool linked = false;
bool lightSensorReady = false;
bool imuReady = false;
bool heartbeatState = false;

uint16_t imuSequence = 0;
uint16_t moveSequence = 0;

unsigned long lastImuSampleMs = 0;
unsigned long lastImuNotifyMs = 0;
unsigned long lastLightSampleMs = 0;
unsigned long lastLightNotifyMs = 0;
unsigned long lastLightReportMs = 0;
unsigned long lastSensorRetryMs = 0;
unsigned long lastMotionEventMs = 0;
unsigned long lastHeartbeatMs = 0;
unsigned long motionStartedMs = 0;
unsigned long motionLastActiveMs = 0;

bool motionActive = false;
uint8_t motionMaxStrength = 0;

int16_t lastAccelRaw[3] = {0, 0, 0};
int16_t lastGyroRaw[3] = {0, 0, 0};

float gravityMagnitudeRaw = 0.0f;
float gyroBiasRaw[3] = {0.0f, 0.0f, 0.0f};
uint16_t gravityCalibrationSamples = 0;
float windowAccEnergy = 0.0f;
float windowGyroEnergy = 0.0f;
float windowAccPeak = 0.0f;
uint16_t windowSamples = 0;

int lastLightSent = -1;
int lightBaseline = -1;
uint32_t lightBaselineSum = 0;
uint16_t lightBaselineSamples = 0;
float filteredLight = 0.0f;
bool lightFilterInitialized = false;

char rxBuffer[64];
uint8_t rxLength = 0;

void setLed(uint8_t pin, bool on) {
  digitalWrite(pin, on ? LED_STATE_ON : !LED_STATE_ON);
}

void updateStatusLeds() {
  setLed(PIN_LED1, heartbeatState);
  setLed(PIN_LED2, linked);
  setLed(PIN_LED3, lightSensorReady);
  setLed(PIN_LED4, imuReady);
}

void sendLine(const char* line) {
  if (linked) {
    bleuart.print(line);
    bleuart.print('\n');
  }
  Serial.println(line);
}

void beginAnalogLightSensor() {
  pinMode(A0, INPUT);
  analogReadResolution(12);
  const int initialRaw = analogRead(A0);
  filteredLight = initialRaw;
  lightFilterInitialized = true;
  lightSensorReady = true;
  lastLightSent = -1;
  lightBaseline = -1;
  lightBaselineSum = 0;
  lightBaselineSamples = 0;
  Serial.print("ANALOG_LIGHT_READY PIN=A0/P0.02 RAW=");
  Serial.println(initialRaw);
}

bool tryBeginImu() {
  Wire.beginTransmission(0x6A);
  if (Wire.endTransmission() != 0) {
    return false;
  }

  if (imu.begin() != LSM6DSL_STATUS_OK) {
    return false;
  }

  uint8_t id = 0;
  if (imu.ReadID(&id) != LSM6DSL_STATUS_OK || id != 0x6A) {
    return false;
  }

  if (imu.Enable_X() != LSM6DSL_STATUS_OK ||
      imu.Enable_G() != LSM6DSL_STATUS_OK ||
      imu.Set_X_ODR(52.0f) != LSM6DSL_STATUS_OK ||
      imu.Set_G_ODR(52.0f) != LSM6DSL_STATUS_OK ||
      imu.Set_X_FS(4.0f) != LSM6DSL_STATUS_OK ||
      imu.Set_G_FS(500.0f) != LSM6DSL_STATUS_OK) {
    return false;
  }

  gravityMagnitudeRaw = 0.0f;
  gyroBiasRaw[0] = 0.0f;
  gyroBiasRaw[1] = 0.0f;
  gyroBiasRaw[2] = 0.0f;
  gravityCalibrationSamples = 0;
  windowAccEnergy = 0.0f;
  windowGyroEnergy = 0.0f;
  windowAccPeak = 0.0f;
  windowSamples = 0;
  motionActive = false;
  motionMaxStrength = 0;
  Serial.println("LSM6DSL_READY ADDRESS=0x6A WHO_AM_I=0x6A");
  return true;
}

void retryMissingSensors() {
  const unsigned long now = millis();
  if (now - lastSensorRetryMs < SENSOR_RETRY_INTERVAL_MS) {
    return;
  }

  lastSensorRetryMs = now;
  if (!imuReady) {
    imuReady = tryBeginImu();
  }
  updateStatusLeds();
}

void processMotionWindow() {
  if (windowSamples < MOTION_WINDOW_SAMPLES) {
    return;
  }

  const float accRms = sqrtf(windowAccEnergy / windowSamples);
  const float gyroRms = sqrtf(windowGyroEnergy / windowSamples);
  const bool candidate =
      accRms >= ACC_RMS_THRESHOLD_RAW || gyroRms >= GYRO_RMS_THRESHOLD_RAW;
  const unsigned long now = millis();
  const float normalized = fmaxf(
      accRms / ACC_RMS_THRESHOLD_RAW,
      gyroRms / GYRO_RMS_THRESHOLD_RAW);
  const uint8_t strength = static_cast<uint8_t>(
      constrain(static_cast<int>(normalized * 64.0f), 1, 255));

  if (candidate &&
      (motionActive || now - lastMotionEventMs >= MOTION_REFRACTORY_MS)) {
    if (!motionActive) {
      motionActive = true;
      motionStartedMs = now - MOTION_WINDOW_SAMPLES * IMU_SAMPLE_INTERVAL_MS;
      motionMaxStrength = 0;
    }
    motionLastActiveMs = now;
    motionMaxStrength = max(motionMaxStrength, strength);
  } else if (motionActive && now - motionLastActiveMs >= 1000) {
    const unsigned long durationMs =
        motionLastActiveMs - motionStartedMs +
        MOTION_WINDOW_SAMPLES * IMU_SAMPLE_INTERVAL_MS;
    char line[48];
    snprintf(
        line,
        sizeof(line),
        "MOVE:%u,%d,%lu",
        moveSequence++,
        motionMaxStrength,
        durationMs);
    sendLine(line);
    lastMotionEventMs = now;
    motionActive = false;
    motionMaxStrength = 0;
  }

  Serial.print("MOTION_WINDOW acc_rms=");
  Serial.print(accRms, 1);
  Serial.print(" gyro_rms=");
  Serial.print(gyroRms, 1);
  Serial.print(" acc_peak=");
  Serial.println(windowAccPeak, 1);

  windowAccEnergy = 0.0f;
  windowGyroEnergy = 0.0f;
  windowAccPeak = 0.0f;
  windowSamples = 0;
}

void sampleImu() {
  if (!imuReady) {
    return;
  }

  const unsigned long now = millis();
  if (now - lastImuSampleMs < IMU_SAMPLE_INTERVAL_MS) {
    return;
  }
  lastImuSampleMs = now;

  if (imu.Get_X_AxesRaw(lastAccelRaw) != LSM6DSL_STATUS_OK ||
      imu.Get_G_AxesRaw(lastGyroRaw) != LSM6DSL_STATUS_OK) {
    imuReady = false;
    Serial.println("LSM6DSL_READ_FAILED");
    return;
  }

  const float ax = lastAccelRaw[0];
  const float ay = lastAccelRaw[1];
  const float az = lastAccelRaw[2];
  const float accMagnitude = sqrtf(ax * ax + ay * ay + az * az);

  if (gravityCalibrationSamples < 100) {
    gravityMagnitudeRaw += accMagnitude;
    gyroBiasRaw[0] += lastGyroRaw[0];
    gyroBiasRaw[1] += lastGyroRaw[1];
    gyroBiasRaw[2] += lastGyroRaw[2];
    gravityCalibrationSamples++;
    if (gravityCalibrationSamples == 100) {
      gravityMagnitudeRaw /= gravityCalibrationSamples;
      gyroBiasRaw[0] /= gravityCalibrationSamples;
      gyroBiasRaw[1] /= gravityCalibrationSamples;
      gyroBiasRaw[2] /= gravityCalibrationSamples;
      Serial.print("IMU_CALIBRATED gravity_raw=");
      Serial.print(gravityMagnitudeRaw, 1);
      Serial.print(" gyro_bias=");
      Serial.print(gyroBiasRaw[0], 1);
      Serial.print(',');
      Serial.print(gyroBiasRaw[1], 1);
      Serial.print(',');
      Serial.println(gyroBiasRaw[2], 1);
    }
    return;
  }

  const float gx = lastGyroRaw[0] - gyroBiasRaw[0];
  const float gy = lastGyroRaw[1] - gyroBiasRaw[1];
  const float gz = lastGyroRaw[2] - gyroBiasRaw[2];
  const float gyroMagnitude = sqrtf(gx * gx + gy * gy + gz * gz);
  const float dynamicAcc = fabsf(accMagnitude - gravityMagnitudeRaw);
  windowAccEnergy += dynamicAcc * dynamicAcc;
  windowGyroEnergy += gyroMagnitude * gyroMagnitude;
  windowAccPeak = fmaxf(windowAccPeak, dynamicAcc);
  windowSamples++;
  processMotionWindow();

  if (SEND_RAW_IMU && linked && now - lastImuNotifyMs >= IMU_NOTIFY_INTERVAL_MS) {
    lastImuNotifyMs = now;
    char line[64];
    const int length = snprintf(
        line,
        sizeof(line),
        "IMU:%u,%d,%d,%d,%d,%d,%d",
        imuSequence++,
        lastAccelRaw[0],
        lastAccelRaw[1],
        lastAccelRaw[2],
        lastGyroRaw[0],
        lastGyroRaw[1],
        lastGyroRaw[2]);
    if (length > 0 && length < static_cast<int>(sizeof(line))) {
      sendLine(line);
    }
  }
}

void sampleLightSensor() {
  if (!lightSensorReady) {
    return;
  }

  const unsigned long now = millis();
  if (now - lastLightSampleMs < LIGHT_SAMPLE_INTERVAL_MS) {
    return;
  }
  lastLightSampleMs = now;

  const int raw = analogRead(A0);
  if (!lightFilterInitialized) {
    filteredLight = raw;
    lightFilterInitialized = true;
  } else {
    filteredLight += LIGHT_EMA_ALPHA * (raw - filteredLight);
  }
  const int filteredAdc =
      constrain(static_cast<int>(filteredLight + 0.5f), 0, 4095);
  const int brightness = 4095 - filteredAdc;

  if (lightBaseline < 0) {
    lightBaselineSum += brightness;
    lightBaselineSamples++;
    if (lightBaselineSamples >= LIGHT_BASELINE_SAMPLES) {
      lightBaseline = lightBaselineSum / lightBaselineSamples;
      char baselineLine[24];
      snprintf(
          baselineLine,
          sizeof(baselineLine),
          "LUX:BASE:%d",
          lightBaseline);
      sendLine(baselineLine);
    }
  }

  if (lightBaseline >= 0 &&
      now - lastLightNotifyMs >= LIGHT_NOTIFY_INTERVAL_MS &&
      (lastLightSent < 0 || abs(brightness - lastLightSent) >= LIGHT_DEADBAND)) {
    lastLightNotifyMs = now;
    lastLightSent = brightness;
    char line[20];
    snprintf(line, sizeof(line), "LUX:%d", brightness);
    sendLine(line);
  }

  if (now - lastLightReportMs >= LIGHT_REPORT_INTERVAL_MS) {
    lastLightReportMs = now;
    Serial.print("LIGHT raw=");
    Serial.print(raw);
    Serial.print(" adc_filtered=");
    Serial.print(filteredAdc);
    Serial.print(" brightness=");
    Serial.print(brightness);
    Serial.print(" baseline=");
    Serial.println(lightBaseline);
  }
}

void handleCommand(char* line) {
  if (strcmp(line, "WAKE") == 0) {
    sendLine("HELLO");
    return;
  }
  Serial.print("UNKNOWN_COMMAND=");
  Serial.println(line);
}

void pumpBleRx() {
  while (bleuart.available()) {
    const char c = static_cast<char>(bleuart.read());
    if (c == '\n' || c == '\r') {
      if (rxLength > 0) {
        rxBuffer[rxLength] = '\0';
        handleCommand(rxBuffer);
        rxLength = 0;
      }
    } else if (rxLength < sizeof(rxBuffer) - 1) {
      rxBuffer[rxLength++] = c;
    }
  }
}

void connectCallback(uint16_t connectionHandle) {
  (void)connectionHandle;
  linked = true;
  updateStatusLeds();
  sendLine("HELLO");
  if (lightBaseline >= 0) {
    char baselineLine[24];
    snprintf(baselineLine, sizeof(baselineLine), "LUX:BASE:%d", lightBaseline);
    sendLine(baselineLine);
  }
  if (lastLightSent >= 0) {
    char luxLine[20];
    snprintf(luxLine, sizeof(luxLine), "LUX:%d", lastLightSent);
    sendLine(luxLine);
  }
}

void disconnectCallback(uint16_t connectionHandle, uint8_t reason) {
  (void)connectionHandle;
  (void)reason;
  linked = false;
  updateStatusLeds();
  Serial.println("BLE_DISCONNECTED");
}

void startAdvertising() {
  Bluefruit.Advertising.addFlags(BLE_GAP_ADV_FLAGS_LE_ONLY_GENERAL_DISC_MODE);
  Bluefruit.Advertising.addTxPower();
  Bluefruit.Advertising.addService(bleuart);
  Bluefruit.ScanResponse.addName();
  Bluefruit.Advertising.restartOnDisconnect(true);
  Bluefruit.Advertising.setInterval(32, 244);
  Bluefruit.Advertising.setFastTimeout(30);
  Bluefruit.Advertising.start(0);
}

void setup() {
  Serial.begin(115200);

  const uint8_t ledPins[] = {PIN_LED1, PIN_LED2, PIN_LED3, PIN_LED4};
  for (uint8_t pin : ledPins) {
    pinMode(pin, OUTPUT);
    setLed(pin, false);
  }

  Wire.begin();
  Wire.setClock(400000);
  delay(100);
  beginAnalogLightSensor();
  imuReady = tryBeginImu();
  updateStatusLeds();

  Bluefruit.begin();
  Bluefruit.setTxPower(4);
  Bluefruit.setName(DEVICE_NAME);
  Bluefruit.Periph.setConnectCallback(connectCallback);
  Bluefruit.Periph.setDisconnectCallback(disconnectCallback);
  bleuart.begin();
  startAdvertising();

  Serial.println("PILLOW_NODE_READY");
  Serial.println("LED1=HEARTBEAT LED2=BLE LED3=ANALOG_LIGHT LED4=LSM6DSL");
}

void loop() {
  retryMissingSensors();
  sampleImu();
  sampleLightSensor();
  pumpBleRx();

  const unsigned long now = millis();
  if (now - lastHeartbeatMs >= 1000) {
    lastHeartbeatMs = now;
    heartbeatState = !heartbeatState;
    updateStatusLeds();
  }

  delay(1);
}
