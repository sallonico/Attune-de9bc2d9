// Attune ESP32 BLE firmware
// ---------------------------
// Makes the ESP32 a Bluetooth device the Attune web app connects to. When you
// press the button, it tells the web app "taken" and the app logs today's dose
// (just like tapping "Mark as taken" on screen).
//
// Wiring:
//   * Button: one leg to GPIO 4, the other leg to GND. (We use the chip's
//     built-in pull-up, so the pin reads HIGH normally and LOW when pressed.)
//
// Upload steps:
//   1. Arduino IDE -> Boards Manager -> install "esp32 by Espressif Systems".
//   2. Pick your board (e.g. "ESP32 Dev Module") and the right serial port.
//   3. Upload, then open Serial Monitor at 115200 baud to watch button presses.
//
// Serial Monitor testing (no button needed):
//   * Type "1" and press Enter to simulate a button press (sends "taken").
//   * Type "0" and press Enter to simulate releasing the button.
//   Make sure the Serial Monitor line ending is set to "Newline" (or similar).

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// These IDs MUST match frontend/lib/bluetooth.ts so the website can find us.
#define SERVICE_UUID     "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define STATUS_CHAR_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

// Pin for the button.
const int buttonPin = 4;

// Variables to store the button state and the previous reading.
int buttonState = HIGH;
int lastButtonState = HIGH;

// BLE objects, and whether the website is currently connected.
BLECharacteristic* statusChar = nullptr;
bool deviceConnected = false;

// Fires when the website connects or disconnects over Bluetooth.
class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer* server) override {
    deviceConnected = true;
    Serial.println("Website connected");
  }
  void onDisconnect(BLEServer* server) override {
    deviceConnected = false;
    Serial.println("Website disconnected; advertising again");
    BLEDevice::startAdvertising();   // let the website reconnect
  }
};

// Sends "taken" to the website (or explains why it can't yet).
void sendTaken() {
  Serial.println("Sending \"taken\"");
  if (deviceConnected) {
    statusChar->setValue("taken");
    statusChar->notify();          // this is what the website reacts to
  } else {
    Serial.println("(no website connected yet)");
  }
}

void setup() {
  // Start the serial communication.
  Serial.begin(115200);

  // Set the button pin as input with internal pull-up resistor.
  pinMode(buttonPin, INPUT_PULLUP);

  // --- Set up Bluetooth so the website can connect ---
  BLEDevice::init("Attune Device");

  BLEServer* server = BLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());

  BLEService* service = server->createService(SERVICE_UUID);
  statusChar = service->createCharacteristic(
      STATUS_CHAR_UUID,
      BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  statusChar->addDescriptor(new BLE2902());   // needed for notifications
  statusChar->setValue("ok");
  service->start();

  BLEAdvertising* adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(SERVICE_UUID);
  adv->setScanResponse(true);
  BLEDevice::startAdvertising();

  Serial.println("Advertising as \"Attune Device\"");
  Serial.println("Type 1 (press) or 0 (release) in Serial Monitor to test.");
}

void loop() {
  // --- Serial Monitor testing: type 1 to simulate a press, 0 to release ---
  if (Serial.available() > 0) {
    char c = Serial.read();
    if (c == '1') {
      Serial.println("Serial: simulating button press");
      sendTaken();
    } else if (c == '0') {
      Serial.println("Serial: simulating button release");
    }
    // Ignore anything else (e.g. newline characters).
  }

  // Read the button. With INPUT_PULLUP: HIGH = not pressed, LOW = pressed.
  buttonState = digitalRead(buttonPin);

  // TEMPORARY test line: prints 1 normally and 0 when the button is pressed.
  // Remove this once you've confirmed the button works.
  Serial.println(buttonState);

  // Only act once per press: when it just went from not-pressed to pressed.
  if (buttonState == LOW && lastButtonState == HIGH) {
    Serial.println("Button pressed -> sending \"taken\"");
    sendTaken();
  }

  // Remember this reading for next time.
  lastButtonState = buttonState;

  delay(100);   // small delay to debounce the button
}
