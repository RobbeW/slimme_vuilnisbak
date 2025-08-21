// © 2025 Robbe Wulgaert · AI in de Klas
// LED-sturing voor Slimme Vuilnisbak


#include <Arduino.h>

// ===== NL: Pas hier eenvoudig het aantal pins aan =====
const uint8_t PINS[] = {2, 3, 4, 5}; // voeg gerust 6,7,8,9,10 toe indien gewenst
const uint8_t N = sizeof(PINS) / sizeof(PINS[0]);

char currentState = '0';

void allOff() {
  for (uint8_t i = 0; i < N; i++) digitalWrite(PINS[i], LOW);
}

void allOn() {
  for (uint8_t i = 0; i < N; i++) digitalWrite(PINS[i], HIGH);
}

void setExclusive(uint8_t oneBased) {
  // NL: oneBased = 1..N
  for (uint8_t i = 0; i < N; i++) {
    digitalWrite(PINS[i], (i + 1 == oneBased) ? HIGH : LOW);
  }
}

void setup() {
  Serial.begin(115200);
  for (uint8_t i = 0; i < N; i++) pinMode(PINS[i], OUTPUT);
  allOff();
  Serial.print(F("✅ (Arduino) Gestart @115200. Slots: "));
  Serial.print(N);
  Serial.println(F(" — Wacht op '0'..'9' of 'X'."));
}

void loop() {
  // NL: Lees alle beschikbare bytes en verwerk alleen nuttige tekens
  while (Serial.available() > 0) {
    char c = Serial.read();
    if (c == '\r' || c == '\n') continue; // negeer regeleinde

    if (c == '0') {
      currentState = c;
      Serial.println(F("🔔 (Arduino) Code '0' → alles uit."));
      allOff();
    } else if (c == 'X' || c == 'x' || c == '9') {
      currentState = 'X';
      Serial.println(F("🔔 (Arduino) Code 'X/9' → alles aan."));
      allOn();
    } else if (c >= '1' && c <= '9') {
      uint8_t slot = (uint8_t)(c - '0'); // 1..9
      if (slot <= N) {
        currentState = c;
        Serial.print(F("🔔 (Arduino) Slot "));
        Serial.print(slot);
        Serial.println(F(" → exclusief aan."));
        setExclusive(slot);
      } else {
        Serial.println(F("⚠️ (Arduino) Slot buiten bereik → genegeerd."));
      }
    } else {
      Serial.print(F("⚠️ (Arduino) Onbekend teken: "));
      Serial.println(c);
      // toestand ongewijzigd
    }
  }

  delay(3); // klein adempauze
}

// Dit project is van Robbe Wulgaert, auteur van 'AI in de Klas'.
// Meer informatie op www.robbewulgaert.be
