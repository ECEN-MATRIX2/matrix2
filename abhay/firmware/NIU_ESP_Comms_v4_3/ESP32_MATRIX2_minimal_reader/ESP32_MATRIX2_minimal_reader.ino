#include <Arduino.h>
#include <TinyGPSPlus.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <driver/uart.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#include <atomic>

/*
  ESP32_MATRIX2 v4.3 - NIU2 speed/SOC/errors, NIC1 fault-clear return.
  Y signal: motor J4.3 + comm J5.3 + comm J6.1. GND: J4.5 -> J5.2.
  UART2 RX GPIO5 through U2; TX GPIO4 open drain upstream of U2.
  J6/S3 is reserved for UART, no longer a brake input. Leave J5.1 unconnected.
  GNSS, BLE UUIDs/name, local ADC fields and speed/battery keys retained.
  Requires the adjacent protocol headers in the same Arduino sketch folder.
*/

static constexpr uint32_t USB_BAUD  = 115200;
static constexpr uint32_t GNSS_BAUD = 9600;
static constexpr uint32_t TELEMETRY_PERIOD_MS = 1000;
static constexpr const char* BLE_DEVICE_NAME = "ESP32_MATRIX2";
// Keep notify payload comfortably below common ATT payload limits.
static constexpr size_t BLE_NOTIFY_CHUNK_MAX = 20; // safe even at default ATT MTU23

#define SERVICE_UUID           "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
#define CHARACTERISTIC_UUID_RX "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"
#define CHARACTERISTIC_UUID_TX "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"

static constexpr int VSENSE_PIN   = 1;
static constexpr int CURR_OUT_PIN = 2;
static constexpr int TEMP_PIN     = 3;

static constexpr int GNSS_RX_PIN  = 17;
static constexpr int GNSS_TX_PIN  = 18;

static constexpr float ADC_FULL_SCALE_V = 3.3f;
static constexpr int ADC_SAMPLES = 32;
static constexpr int CURR_ADC_SAMPLES = 256;
static constexpr int CURR_ZERO_CAL_SAMPLES = 512;
static constexpr float LM35_MV_PER_C = 10.0f;
static constexpr float CURR_SENSOR_SUPPLY_V = 5.0f;
static constexpr float CURR_SENSOR_ZERO_RATIO = 0.5f;       // TMCS1107 zero-current output ~= Vs/2
static constexpr float CURR_SENSOR_SENS_V_PER_A = 0.050f;    // TMCS1107A1 = 50 mV/A at sensor VOUT
static constexpr float CURR_OUT_DIVIDER_SCALE = 2.0f;        // R12=10k, R13=10k => ADC node is half sensor VOUT
static constexpr float CURR_ZERO_DEADBAND_A = 0.01f;         // suppress tiny ADC jitter near zero

#include "motor_uart.h"
#include "command_stream.h"
struct BleCommand {char text[96];uint32_t epoch;};
static QueueHandle_t bleCommands=nullptr;
static appcommand::Stream bleLine;
static std::atomic<bool> clearBleLine{false};
static uint32_t espBootId=0;

HardwareSerial GNSSSerial(1);
TinyGPSPlus gps;

BLECharacteristic* g_txCharacteristic = nullptr;
std::atomic<bool> g_deviceConnected{false};
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

  const bool gnssFix = gps.location.isValid();

  const MotorView view=motorSnapshot();
  const motorclient::Client& client=view.client;
  const comms::Status& motorStatus=client.status;
  const telemetry::Frame& motorData=motorStatus.data;
  const bool motorHaveData=client.have;
  const uint32_t motorReceivedMs=client.receivedMs;
  const uint32_t motorNow=millis();
  const bool motorFresh=view.ready && client.fresh(motorNow);
  const bool speedValid=motorFresh && (motorData.flags&telemetry::SPEED_VALID);
  const bool batteryValid=motorFresh && (motorData.flags&telemetry::SOC_VALID);

  String json;
  json.reserve(2300);
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
  json += speedValid ? String(motorData.speedCentiMph / 100.0f, 2) : String("null");

  json += ",\"battery_percent\":";
  json += batteryValid ? String(motorData.socCentiPercent / 100.0f, 2) : String("null");
  json += ",\"motor_link_ok\":";
  json += motorFresh ? "true" : "false";
  json += ",\"motor_rx_age_ms\":";
  json += motorHaveData ? String(uint32_t(motorNow-motorReceivedMs)) : String("null");
  json += ",\"motor_vm_v\":";
  json += motorFresh && (motorData.flags&telemetry::VM_VALID) ? String(motorData.vmMilliVolts/1000.0f,3) : String("null");
  json += ",\"motor_phase_a\":";
  json += motorFresh && (motorData.flags&telemetry::PHASE_VALID) ? String(motorData.phaseMilliAmps/1000.0f,3) : String("null");
  json += ",\"motor_bus_est_a\":";
  json += motorFresh && (motorData.flags&telemetry::BUS_EST_VALID) ? String(motorData.busEstimateMilliAmps/1000.0f,3) : String("null");
  json += ",\"battery_estimate_demo\":";
  json += !motorFresh ? "null" : (motorData.flags&telemetry::DEMO_SOC) ? "true" : "false";
  json += ",\"motor_simulated\":";
  json += !motorFresh ? "null" : (motorData.flags&telemetry::SIMULATED) ? "true" : "false";
  json += ",\"motor_running\":";
  json += !motorFresh ? "null" : (motorData.flags&telemetry::RUNNING) ? "true" : "false";
  json += ",\"motor_charging\":";
  json += !motorFresh ? "null" : (motorData.flags&telemetry::CHARGING) ? "true" : "false";
  json += ",\"motor_fault\":";
  json += motorFresh ? String(motorData.fault) : String("null");
  json += ",\"motor_sequence\":";
  json += motorFresh ? String(motorData.sequence) : String("null");
  json += ",\"motor_rx_packets\":";
  json += String(client.packets);
  json += ",\"motor_bad_frames\":";
  json += String(view.badFrames);
  json += ",\"motor_uart_errors\":";
  json += String(view.uartErrors);


  json += ",\"motor_fw_protocol\":\"NIU2\",\"esp_revision\":\"4.3\"";
  json += ",\"motor_tx_open_drain\":";json += view.openDrain?"true":"false";
  json += ",\"motor_fault_code\":";json += motorFresh?String(motorData.fault):String("null");
  json += ",\"throttle_fault_code\":";json += motorFresh?String(motorStatus.inputFault):String("null");
  json += ",\"motor_state\":";
  if(motorFresh){json+='"';json+=motorclient::stateName(motorStatus.state);json+='"';}else json+="null";
  json += ",\"motor_error_reason\":";
  if(motorFresh){
    json+='"';
    if(!motorData.fault && !motorStatus.inputFault)json+="none";
    else {
      if(motorData.fault)json+=motorclient::faultName(motorData.fault);
      if(motorData.fault && motorStatus.inputFault)json+="; ";
      if(motorStatus.inputFault)json+=motorclient::inputName(motorStatus.inputFault);
    }
    json+='"';
  }else json+="null";
  json += ",\"fault_vm_v\":";
  json += motorFresh && motorStatus.faultVmMv>=0?String(motorStatus.faultVmMv/1000.0f,3):String("null");
  json += ",\"fault_phase_a\":";
  json += motorFresh && motorStatus.faultPhaseMa>=0?String(motorStatus.faultPhaseMa/1000.0f,3):String("null");
  json += ",\"last_motor_fault_code\":";json+=String(client.lastMotorFault);
  json += ",\"last_throttle_fault_code\":";json+=String(client.lastInputFault);
  json += ",\"last_fault_esp_ms\":";
  json += (client.lastMotorFault || client.lastInputFault)?String(client.lastFaultMs):String("null");
  json += ",\"reset_request_id\":";json+=String(client.clearRequestId);
  json += ",\"reset_state\":\"";json+=motorclient::resetName(client.reset);json+='"';
  json += ",\"reset_result\":";json+=String(client.result);
  json += ",\"reset_reason\":\"";json+=motorclient::resultName(client.result);json+='"';
  json += ",\"reset_attempts\":";json+=String(client.clearAttempts);
  json += ",\"esp_boot_id\":";json+=String(espBootId);
  json += ",\"motor_operation_id\":";json+=String(client.operationId);
  json += ",\"motor_operation_kind\":\"";json+=client.recovery?"clear_and_enable":"clear_only";json+='"';
  json += ",\"motor_operation_stage\":\"";json+=client.stage();json+='"';
  json += ",\"motor_operation_state\":\"";json+=motorclient::operationName(client.operation);json+='"';
  json += ",\"motor_operation_pending\":";json+=client.pending?"true":"false";
  json += ",\"motor_operation_reason\":\"";json+=client.reason;json+='"';
  json += ",\"motor_clear_result\":";json+=client.result?String(client.result):String("null");
  json += ",\"motor_enable_result\":";json+=client.enableResult?String(client.enableResult):String("null");
  json += ",\"motor_enable_reason\":";
  if(client.enableResult){json+='"';json+=motorclient::resultName(client.enableResult);json+='"';}else json+="null";
  json += ",\"motor_enable_request_id\":";json+=client.action==comms::Enable?String(client.requestId):String("null");
  json += ",\"motor_enable_attempts\":";json+=client.action==comms::Enable?String(client.attempts):String("0");
  json += ",\"motor_throttle_enabled\":";json+=!motorFresh?"null":client.enabled()?"true":"false";

  json += ",\"brake_active\":";
  json += "null"; // GPIO4 is now UART TX, not a brake input

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
        reinterpret_cast<uint8_t*>(const_cast<char*>(raw + offset)),
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
  sendLineBoth("CMDS: PING | STATUS? | HELP | MOTOR_CLEAR_FAULT | {\"cmd\":\"motor_clear_fault_and_enable\"}+LF\n");
}

void processCommand(String cmd,uint32_t epoch) {
  if(epoch!=commandEpoch.load())return;
  const unsigned motorAction=appcommand::kind(cmd.c_str());
  cmd.trim();
  cmd.toUpperCase();
  if (cmd.length() == 0) return;

  if(motorAction) {
    const MotorView view=motorSnapshot();
    if(!view.ready || !view.client.fresh(millis()))sendLineBoth("{\"reset_queued\":false,\"reason\":\"link_unavailable\"}\n");
    else if(view.client.pending)sendLineBoth("{\"reset_queued\":false,\"reason\":\"pending\"}\n");
    else sendLineBoth(requestMotorClear(motorAction==2,epoch)?"{\"reset_queued\":true}\n":"{\"reset_queued\":false,\"reason\":\"queue_busy\"}\n");
    return; // queued is not an acknowledgement; wait for reset_state telemetry
  }
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
      processCommand(cmd,commandEpoch.load());
    } else if (c != '\r') {
      if(g_serialBuffer.length()<95)g_serialBuffer += c;
      else g_serialBuffer="INVALID_OVERSIZED_COMMAND";
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
    ++commandEpoch;
    cancelMotorRequest=true;
    clearBleLine=true;
    if(bleCommands)xQueueReset(bleCommands);
    Serial.println("{\"ble\":\"disconnected\"}");
    delay(100);
    BLEDevice::startAdvertising();
    Serial.println("{\"ble\":\"advertising_restart\"}");
  }
};

class MyRxCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* pCharacteristic) override {
    const auto rxValue = pCharacteristic->getValue(); // Arduino-ESP32 2.x/3.x
    if (!bleCommands || !g_deviceConnected || rxValue.length()==0) return;
    if(rxValue.length()>=sizeof(BleCommand::text) || memchr(rxValue.c_str(),0,rxValue.length())){
      ++commandEpoch;cancelMotorRequest=true;clearBleLine=true;xQueueReset(bleCommands);return;
    }
    BleCommand command{};
    command.epoch=commandEpoch.load();
    memcpy(command.text,rxValue.c_str(),rxValue.length());
    // Only loop() reads GPS/UART state or formats telemetry, never the BLE task.
    if(xQueueSend(bleCommands,&command,0)!=pdTRUE){
      ++commandEpoch;cancelMotorRequest=true;clearBleLine=true;xQueueReset(bleCommands);
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
  espBootId=esp_random();
  Serial.begin(USB_BAUD);
  delay(500);

  setupAdcPin(VSENSE_PIN);
  setupAdcPin(CURR_OUT_PIN);
  setupAdcPin(TEMP_PIN);
  calibrateCurrentZero();

  setupMotorUart();



  GNSSSerial.begin(GNSS_BAUD, SERIAL_8N1, GNSS_RX_PIN, GNSS_TX_PIN);

  bleCommands=xQueueCreate(4,sizeof(BleCommand));
  setupBle();

  Serial.println("motor_uart_v4.3 RX5 TX4 open-drain 9600 8N1");
  Serial.print("{\"curr_zero_adc_v\":");
  Serial.print(String(g_currZeroAdcV, 4));
  Serial.println("}");
  Serial.println("{\"status\":\"esp32_matrix2_custom_started\"}");
  sendHelp();
  g_lastTelemetryMs = millis();
}

void loop() {
  if(clearBleLine.exchange(false))bleLine.clear();

  while (GNSSSerial.available() > 0) {
    gps.encode((char)GNSSSerial.read());
  }

  pollSerialCommands();
  BleCommand command;
  for (unsigned i=0; bleCommands && i<4 && xQueueReceive(bleCommands,&command,0)==pdTRUE; ++i) {
    if(command.epoch!=commandEpoch.load() || !g_deviceConnected){bleLine.clear();continue;}
    auto consume=[&](const char* line){processCommand(String(line),command.epoch);};
    for(const char* p=command.text;*p;++p)bleLine.feed(*p,consume);
    bleLine.endWrite(consume);
  
  }

  const uint32_t now = millis();
  if (now - g_lastTelemetryMs >= TELEMETRY_PERIOD_MS) {
    g_lastTelemetryMs = now;
    sendLineBoth(buildTelemetryJson());
  }
}
