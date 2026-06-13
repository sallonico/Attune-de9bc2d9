// Attune ESP32 BLE firmware
// ---------------------------
// Turns the ESP32 into a Bluetooth Low Energy (BLE) device that the Attune
// web app can find and connect to via the browser's Web Bluetooth API.
//
// Toolchain (beginner setup):
//   1. Install the Arduino IDE.
//   2. Boards Manager -> install "esp32 by Espressif Systems" (bundles BLEDevice).
//   3. Select your board (e.g. "ESP32 Dev Module") and the correct serial port.
//   4. Upload this sketch, then open the Serial Monitor at 115200 baud.
//
// Verify with a generic BLE scanner app (e.g. nRF Connect) BEFORE using the web
// app: you should see "Attune Device" advertise and be able to read the status
// characteristic. That isolates hardware issues from browser issues.

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// These UUIDs MUST match the ones in frontend/lib/bluetooth.ts.
#define SERVICE_UUID     "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define STATUS_CHAR_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

// Onboard LED, used only as a visual "connected" indicator. Not every ESP32
// board defines LED_BUILTIN, so we pin it explicitly. GPIO 2 is the onboard
// LED on most ESP32 dev boards; change it if yours differs (or has no LED).
#define LED_PIN 2

BLECharacteristic* statusChar = nullptr;
bool deviceConnected = false;

// Server callbacks fire when a central (the browser) connects or disconnects.
class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer* server) override {
    deviceConnected = true;
    digitalWrite(LED_PIN, HIGH);              // LED on while connected
    Serial.println("Central connected");
  }

  void onDisconnect(BLEServer* server) override {
    deviceConnected = false;
    digitalWrite(LED_PIN, LOW);
    Serial.println("Central disconnected; re-advertising");
    BLEDevice::startAdvertising();            // allow reconnect without reflash
  }
};

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  BLEDevice::init("Attune Device");           // name shown in the browser picker

  BLEServer* server = BLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());

  BLEService* service = server->createService(SERVICE_UUID);
  statusChar = service->createCharacteristic(
      STATUS_CHAR_UUID,
      BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  statusChar->addDescriptor(new BLE2902());   // required so notifications work
  statusChar->setValue("ok");
  service->start();

  BLEAdvertising* adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(SERVICE_UUID);          // lets the browser filter for us
  adv->setScanResponse(true);
  BLEDevice::startAdvertising();

  Serial.println("Advertising as \"Attune Device\"");
}

void loop() {
  // While connected, push a small heartbeat so the link stays observably live.
  // For this build it just proves the connection; later this is where real
  // device data (button presses, battery level, etc.) would be sent.
  if (deviceConnected) {
    statusChar->setValue("ok");
    statusChar->notify();
  }
  delay(2000);
}
