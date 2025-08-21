char result = '0';

void setup() {
  Serial.begin(9600);
  pinMode(2, OUTPUT); // biologisch afval
  pinMode(3, OUTPUT); // plastic afval
  pinMode(4, OUTPUT); // metaal afval
  pinMode(5, OUTPUT); // papier afval
}

void loop() {
  // lees een enkel karakter (label of naam klasse) via de serial port
  if (Serial.available()) {
    result = Serial.read();
  }
  // Wat moet de Arduino doen wanneer label X binnenkomt vanuit de PC?
  switch (result) {
    case '1':  // label "1" == biologisch
      digitalWrite(2, HIGH);  // turn on LED on pin 2
      digitalWrite(3, LOW); // turn off LED on pin 3
      digitalWrite(4, LOW); // turn off LED on pin 4
      digitalWrite(5, LOW);  // turn on LED on pin 5
      break;
	case '2':  // label "2" == plastic
      digitalWrite(3, HIGH);  // turn on LED on pin 3
      digitalWrite(2, LOW); // turn off LED on pin 2
      digitalWrite(4, LOW); // turn off LED on pin 4
      digitalWrite(5, LOW);  // turn on LED on pin 5
      break;
	case '3':  // label "3" == metaal
      digitalWrite(5, LOW); // turn on LED on pin 5
      digitalWrite(4, HIGH);  // turn on LED on pin 4
      digitalWrite(3, LOW); // turn off LED on pin 3
      digitalWrite(2, LOW); // turn off LED on pin 2
      break;
	case '4':  // label "4" == papier
      digitalWrite(5, HIGH); // turn on LED on pin 5
      digitalWrite(4, LOW);  // turn on LED on pin 4
      digitalWrite(3, LOW); // turn off LED on pin 3
      digitalWrite(2, LOW); // turn off LED on pin 2
      break;

    default:  // alle andere labels
      digitalWrite(2, LOW);  // turn off LED on pin 2
      digitalWrite(3, LOW); // turn off LED on pin 3
      digitalWrite(4, LOW); // turn off LED on pin 4	  
      digitalWrite(5, LOW); // turn off LED on pin 5	
  }
}
