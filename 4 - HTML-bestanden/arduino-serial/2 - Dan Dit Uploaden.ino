char result = '0';

void allOff() {
  digitalWrite(2, LOW);
  digitalWrite(3, LOW);
  digitalWrite(4, LOW);
  digitalWrite(5, LOW);
}

void setup() {
  Serial.begin(115200);
  pinMode(2, OUTPUT); // biologisch afval
  pinMode(3, OUTPUT); // plastic afval
  pinMode(4, OUTPUT); // metaal afval
  pinMode(5, OUTPUT); // papier afval
  allOff();
}

void loop() {
  while (Serial.available()) {
    char incoming = Serial.read();
    if (incoming == '\n' || incoming == '\r') {
      continue;
    }
    result = incoming;
  }

  allOff();

  switch (result) {
    case '1':
      digitalWrite(2, HIGH);
      break;
    case '2':
      digitalWrite(3, HIGH);
      break;
    case '3':
      digitalWrite(4, HIGH);
      break;
    case '4':
      digitalWrite(5, HIGH);
      break;
    case 'X':
    case 'x':
      // Mens in beeld: geen afvalbak aansturen.
      allOff();
      break;
    default:
      allOff();
      break;
  }
}
