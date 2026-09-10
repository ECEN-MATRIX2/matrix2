#include <Arduino.h>
#include <TinyGPSPlus.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

/*
  ESP32 custom PCB reader

  Requested output fields:
    - ts_ms
    - vsense_adc_v
    - curr_out_v
    - curr_out_a
    - board_temp_f
    - wheel_speed_mph
    - speed_hall_raw
    - brake_active
    - gnss_fix
    - lat
    - lng
    - alt_m
    - gnss_speed_kph
    - sats
    - hdop
    - date
    - time_utc

  BLE name:
    ESP32_MATRIX2

  Note:
    Speed hall logic below is kept to match the user's requested setup.
    Because SPEED_HALL_PIN is fixed to GPIO 5 in that setup, BRAKE_PIN is
    moved to GPIO 4 here so both signals can coexist in one sketch.
*/

static constexpr uint32_t USB_BAUD  = 115200;
static constexpr uint32_t GNSS_BAUD = 9600;
static constexpr uint32_t TELEMETRY_PERIOD_MS = 1000;
static constexpr const char* BLE_DEVICE_NAME = "ESP32_MATRIX2";
// Keep notify payload comfortably below common ATT payload limits.
static constexpr size_t BLE_NOTIFY_CHUNK_MAX = 180;

#define SERVICE_UUID           "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
#define CHARACTERISTIC_UUID_RX "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"
#define CHARACTERISTIC_UUID_TX "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"

static constexpr int VSENSE_PIN   = 1;
static constexpr int CURR_OUT_PIN = 2;
static constexpr int TEMP_PIN     = 3;
static constexpr int BRAKE_PIN    = 4;
static constexpr int GNSS_RX_PIN  = 17;
static constexpr int GNSS_TX_PIN  = 18;

static constexpr float ADC_FULL_SCALE_V = 3.3f;
static constexpr int ADC_SAMPLES = 32;
static constexpr int CURR_ADC_SAMPLES = 256;
static constexpr int CURR_ZERO_CAL_SAMPLES = 512;
static constexpr float LM35_MV_PER_C = 10.0f;
static constexpr float KPH_TO_MPH = 0.621371f;
static constexpr float CURR_SENSOR_SUPPLY_V = 5.0f;
static constexpr float CURR_SENSOR_ZERO_RATIO = 0.5f;       // TMCS1107 zero-current output ~= Vs/2
static constexpr float CURR_SENSOR_SENS_V_PER_A = 0.050f;    // TMCS1107A1 = 50 mV/A at sensor VOUT
static constexpr float CURR_OUT_DIVIDER_SCALE = 2.0f;        // R12=10k, R13=10k => ADC node is half sensor VOUT
static constexpr float CURR_ZERO_DEADBAND_A = 0.01f;         // suppress tiny ADC jitter near zero

// Exact requested speed hall setup
static constexpr int SPEED_HALL_PIN = 5;
static constexpr float MAGNETS_PER_WHEEL_REV = 1.0f;
// Fan geometry used for hall speed:
// - Blade sweep diameter ~= 3.0 in
// - Radius ~= 1.5 in
// - One magnet on one blade => 1 pulse per revolution
static constexpr float FAN_DIAMETER_IN = 3.0f;
static constexpr float INCH_TO_M = 0.0254f;
static constexpr float WHEEL_CIRCUMFERENCE_M = FAN_DIAMETER_IN * INCH_TO_M * PI;
static constexpr uint32_t HALL_TIMEOUT_MS = 2000;

volatile uint32_t hallPulseCount = 0;
volatile uint32_t lastPulseMs = 0;

HardwareSerial GNSSSerial(1);
TinyGPSPlus gps;

BLECharacteristic* g_txCharacteristic = nullptr;
bool g_deviceConnected = false;
uint32_t g_lastTelemetryMs = 0;
String g_serialBuffer;
float g_currZeroAdcV = (CURR_SENSOR_SUPPLY_V * CURR_SENSOR_ZERO_RATIO) / CURR_OUT_DIVIDER_SCALE;

float clampf(float x, float lo, float hi) {
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}

float readAveragedVoltage(int pin) {
  uint32_t sumMv = 0;
  for (int i = 0; i < ADC_SAMPLES; i++) {
    sumMv += analogReadMilliVolts(pin);
    delayMicroseconds(300);
  }
  return (sumMv / (float)ADC_SAMPLES) / 1000.0f;
}

float readAveragedVoltageSamples(int pin, int samples) {
  uint32_t sumMv = 0;
  for (int i = 0; i < samples; i++) {
    sumMv += analogReadMilliVolts(pin);
    delayMicroseconds(300);
  }
  return (sumMv / (float)samples) / 1000.0f;
}

float readVsenseAdcVoltage() {
  return clampf(readAveragedVoltage(VSENSE_PIN), 0.0f, ADC_FULL_SCALE_V);
}

float readCurrentOutVoltage() {
  return clampf(readAveragedVoltageSamples(CURR_OUT_PIN, CURR_ADC_SAMPLES), 0.0f, ADC_FULL_SCALE_V);
}

void calibrateCurrentZero() {
  // Run with no load current for best accuracy.
  const float zero = clampf(
    readAveragedVoltageSamples(CURR_OUT_PIN, CURR_ZERO_CAL_SAMPLES),
    0.0f,
    ADC_FULL_SCALE_V
  );
  g_currZeroAdcV = zero;
}

float convertCurrOutVoltageToAmps(float currOutAdcV) {
  const float sensorDeltaV = (currOutAdcV - g_currZeroAdcV) * CURR_OUT_DIVIDER_SCALE;
  float currentA = sensorDeltaV / CURR_SENSOR_SENS_V_PER_A;

  if (currentA < CURR_ZERO_DEADBAND_A && currentA > -CURR_ZERO_DEADBAND_A) {
    currentA = 0.0f;
  }
  return currentA;
}

float readBoardTempC() {
  const float tempV = clampf(readAveragedVoltage(TEMP_PIN), 0.0f, ADC_FULL_SCALE_V);
  return (tempV * 1000.0f) / LM35_MV_PER_C;
}

float readBoardTempF() {
  const float tempC = readBoardTempC();
  return (tempC * 9.0f / 5.0f) + 32.0f;
}

bool readBrakeActive() {
  return digitalRead(BRAKE_PIN) == LOW;
}

void IRAM_ATTR onHallPulse() {
  hallPulseCount++;
  lastPulseMs = millis();
}

float readWheelSpeedKph() {
  static uint32_t lastPrintMs = 0;
  static uint32_t lastPulseCountSnapshot = 0;
  static float cachedSpeedKph = 0.0f;

  uint32_t nowMs = millis();

  if (lastPrintMs == 0) {
    lastPrintMs = nowMs;
    noInterrupts();
    lastPulseCountSnapshot = hallPulseCount;
    interrupts();
    return 0.0f;
  }

  if (nowMs - lastPrintMs < 1000) {
    return cachedSpeedKph;
  }

  uint32_t dtMs = nowMs - lastPrintMs;
  lastPrintMs = nowMs;

  uint32_t pulseCountSnapshot;
  uint32_t lastPulseMsSnapshot;

  noInterrupts();
  pulseCountSnapshot = hallPulseCount;
  lastPulseMsSnapshot = lastPulseMs;
  interrupts();

  uint32_t pulsesThisWindow = pulseCountSnapshot - lastPulseCountSnapshot;
  lastPulseCountSnapshot = pulseCountSnapshot;

  float speedKph = 0.0f;

  if ((nowMs - lastPulseMsSnapshot) <= HALL_TIMEOUT_MS) {
    float pulsesPerSecond = (pulsesThisWindow * 1000.0f) / dtMs;
    float wheelRevPerSecond = pulsesPerSecond / MAGNETS_PER_WHEEL_REV;
    float metersPerSecond = wheelRevPerSecond * WHEEL_CIRCUMFERENCE_M;
    speedKph = metersPerSecond * 3.6f;
  }

  cachedSpeedKph = speedKph;
  return cachedSpeedKph;
}

float readWheelSpeedMph() {
  return readWheelSpeedKph() * KPH_TO_MPH;
}

String buildGnssDate() {
  if (!gps.date.isValid()) return "";

  String s;
  s.reserve(10);
  s += String(gps.date.year());
  s += "-";
  if (gps.date.month() < 10) s += "0";
  s += String(gps.date.month());
  s += "-";
  if (gps.date.day() < 10) s += "0";
  s += String(gps.date.day());
  return s;
}

String buildGnssTimeUtc() {
  if (!gps.time.isValid()) return "";

  String s;
  s.reserve(8);
  if (gps.time.hour() < 10) s += "0";
  s += String(gps.time.hour());
  s += ":";
  if (gps.time.minute() < 10) s += "0";
  s += String(gps.time.minute());
  s += ":";
  if (gps.time.second() < 10) s += "0";
  s += String(gps.time.second());
  return s;
}

String buildTelemetryJson() {
  const float vsenseAdcV = readVsenseAdcVoltage();
  const float currOutV = readCurrentOutVoltage();
  const float currOutA = convertCurrOutVoltageToAmps(currOutV);
  const float tempF = readBoardTempF();
  const float wheelSpeedMph = readWheelSpeedMph();
  const bool brakeActive = readBrakeActive();
  const bool gnssFix = gps.location.isValid();

  String json;
  json.reserve(512);
  json += "{";
  json += "\"ts_ms\":";
  json += String(millis());

  json += ",\"vsense_adc_v\":";
  json += String(vsenseAdcV, 3);

  json += ",\"curr_out_v\":";
  json += String(currOutV, 3);

  json += ",\"curr_out_a\":";
  json += String(currOutA, 3);

  json += ",\"board_temp_f\":";
  json += String(tempF, 2);

  json += ",\"wheel_speed_mph\":";
  json += String(wheelSpeedMph, 2);

  json += ",\"speed_hall_raw\":";
  json += String(digitalRead(SPEED_HALL_PIN));

  json += ",\"brake_active\":";
  json += (brakeActive ? "true" : "false");

  json += ",\"gnss_fix\":";
  json += (gnssFix ? "true" : "false");

  json += ",\"lat\":";
  if (gnssFix) json += String(gps.location.lat(), 6);
  else json += "null";

  json += ",\"lng\":";
  if (gnssFix) json += String(gps.location.lng(), 6);
  else json += "null";

  json += ",\"alt_m\":";
  if (gps.altitude.isValid()) json += String(gps.altitude.meters(), 2);
  else json += "null";

  json += ",\"gnss_speed_kph\":";
  if (gps.speed.isValid()) json += String(gps.speed.kmph(), 2);
  else json += "null";

  json += ",\"sats\":";
  if (gps.satellites.isValid()) json += String(gps.satellites.value());
  else json += "null";

  json += ",\"hdop\":";
  if (gps.hdop.isValid()) json += String(gps.hdop.hdop(), 2);
  else json += "null";

  json += ",\"date\":\"";
  json += buildGnssDate();
  json += "\"";

  json += ",\"time_utc\":\"";
  json += buildGnssTimeUtc();
  json += "\"";

  json += "}\n";
  return json;
}

void sendLineBoth(const String& line) {
  Serial.print(line);
  if (g_deviceConnected && g_txCharacteristic != nullptr) {
    const char* raw = line.c_str();
    const size_t len = line.length();
    size_t offset = 0;

    while (offset < len) {
      const size_t remaining = len - offset;
      const size_t chunkLen = remaining > BLE_NOTIFY_CHUNK_MAX ? BLE_NOTIFY_CHUNK_MAX : remaining;
      g_txCharacteristic->setValue(
        reinterpret_cast<const uint8_t*>(raw + offset),
        chunkLen
      );
      g_txCharacteristic->notify();
      offset += chunkLen;
      // Small pacing gap helps avoid dropped notify fragments on some centrals.
      delay(2);
    }
  }
}

void sendHelp() {
  sendLineBoth("CMDS: PING | STATUS? | HELP\n");
}

void processCommand(String cmd) {
  cmd.trim();
  cmd.toUpperCase();
  if (cmd.length() == 0) return;

  if (cmd == "PING") {
    sendLineBoth("PONG\n");
    return;
  }
  if (cmd == "HELP") {
    sendHelp();
    return;
  }
  if (cmd == "STATUS?") {
    sendLineBoth(buildTelemetryJson());
    return;
  }

  sendLineBoth("ERR UNKNOWN_COMMAND\n");
}

void pollSerialCommands() {
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\n') {
      String cmd = g_serialBuffer;
      g_serialBuffer = "";
      processCommand(cmd);
    } else if (c != '\r') {
      g_serialBuffer += c;
    }
  }
}

class MyServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer* pServer) override {
    g_deviceConnected = true;
    Serial.println("{\"ble\":\"connected\"}");
  }

  void onDisconnect(BLEServer* pServer) override {
    g_deviceConnected = false;
    Serial.println("{\"ble\":\"disconnected\"}");
    delay(100);
    BLEDevice::startAdvertising();
    Serial.println("{\"ble\":\"advertising_restart\"}");
  }
};

class MyRxCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* pCharacteristic) override {
    String rxValue = pCharacteristic->getValue();
    if (rxValue.length() > 0) {
      processCommand(rxValue);
    }
  }
};

void setupBle() {
  BLEDevice::init(BLE_DEVICE_NAME);

  BLEServer* pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  BLEService* pService = pServer->createService(SERVICE_UUID);

  g_txCharacteristic = pService->createCharacteristic(
    CHARACTERISTIC_UUID_TX,
    BLECharacteristic::PROPERTY_NOTIFY
  );
  g_txCharacteristic->addDescriptor(new BLE2902());

  BLECharacteristic* pRxCharacteristic = pService->createCharacteristic(
    CHARACTERISTIC_UUID_RX,
    BLECharacteristic::PROPERTY_WRITE |
    BLECharacteristic::PROPERTY_WRITE_NR
  );
  pRxCharacteristic->setCallbacks(new MyRxCallbacks());

  pService->start();

  BLEAdvertising* pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->start();

  Serial.println("{\"ble\":\"advertising\",\"name\":\"ESP32_MATRIX2\"}");
}

void setupAdcPin(int pin) {
  pinMode(pin, INPUT);
  analogReadResolution(12);
  analogSetPinAttenuation(pin, ADC_11db);
}

void setup() {
  Serial.begin(USB_BAUD);
  delay(500);

  setupAdcPin(VSENSE_PIN);
  setupAdcPin(CURR_OUT_PIN);
  setupAdcPin(TEMP_PIN);
  calibrateCurrentZero();

  pinMode(SPEED_HALL_PIN, INPUT);
  attachInterrupt(digitalPinToInterrupt(SPEED_HALL_PIN), onHallPulse, FALLING);

  pinMode(BRAKE_PIN, INPUT_PULLUP);

  GNSSSerial.begin(GNSS_BAUD, SERIAL_8N1, GNSS_RX_PIN, GNSS_TX_PIN);

  setupBle();

  Serial.println("speed_hall_speed_calc_started");
  Serial.print("{\"curr_zero_adc_v\":");
  Serial.print(String(g_currZeroAdcV, 4));
  Serial.println("}");
  Serial.println("{\"status\":\"esp32_matrix2_custom_started\"}");
  sendHelp();
  g_lastTelemetryMs = millis();
}

void loop() {
  while (GNSSSerial.available() > 0) {
    gps.encode((char)GNSSSerial.read());
  }

  pollSerialCommands();

  const uint32_t now = millis();
  if (now - g_lastTelemetryMs >= TELEMETRY_PERIOD_MS) {
    g_lastTelemetryMs += TELEMETRY_PERIOD_MS;
    sendLineBoth(buildTelemetryJson());
  }
}
