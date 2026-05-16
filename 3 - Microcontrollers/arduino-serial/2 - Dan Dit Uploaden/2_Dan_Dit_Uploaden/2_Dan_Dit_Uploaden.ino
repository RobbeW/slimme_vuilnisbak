// Slimme Vuilnisbak - Arduino serial output
// Copyright (c) 2026 Robbe Wulgaert

#include <Arduino.h>

const uint8_t PINS[] = {2, 3, 4, 5};
const uint8_t PIN_COUNT = sizeof(PINS) / sizeof(PINS[0]);

char currentState = '0';

void allOff() {
  for (uint8_t i = 0; i < PIN_COUNT; i++) {
    digitalWrite(PINS[i], LOW);
  }
}

void setExclusive(uint8_t oneBased) {
  for (uint8_t i = 0; i < PIN_COUNT; i++) {
    digitalWrite(PINS[i], (i + 1 == oneBased) ? HIGH : LOW);
  }
}

void setup() {
  Serial.begin(115200);
  for (uint8_t i = 0; i < PIN_COUNT; i++) {
    pinMode(PINS[i], OUTPUT);
  }
  allOff();
}

void loop() {
  while (Serial.available() > 0) {
    char c = Serial.read();
    if (c == '\r' || c == '\n') {
      continue;
    }
    currentState = c;
  }

  if (currentState >= '1' && currentState <= '4') {
    setExclusive((uint8_t)(currentState - '0'));
  } else {
    allOff();
  }

  delay(3);
}
