# Slimme Vuilnisbak (Smart Trash Bin)  
Teachable Machine + p5.js + ml5.js + WebSerial

Een lokaal, privacyvriendelijk AI-prototype. Je traint een beeldclassificatiemodel (Teachable Machine), de webapp draait lokaal met camera-preview, en stuurt **één seriële code** (één teken + newline) naar een microcontroller (Arduino) om LED’s/servo’s aan te sturen. Inclusief licht/donker thema, statusbadges en privacy-modus.
Meer achtergrondinformatie kan je vinden via [mijn website](https://www.robbewulgaert.be/onderwijs) en [mijn boek](https://www.robbewulgaert.be/boek) .
## Kenmerken
- Volledig lokaal (alleen een simpele webserver nodig).
- p5.js + ml5.js voor camera en inference in de browser.
- WebSerial in Chrome/Edge (geen p5.serialcontrol nodig).
- Licht/donker-modus, badges voor **Model/Camera/Serieel**.
- Privacy-modus pauzeert camera + inference.
- Flexibele **label → code** mapping (aanpasbaar via console).
- Stabiele output: 5-frame meerderheid, confidence-drempel, debounce.

## Vereisten
- Chrome of Edge (via `https://` of `http://localhost`).
- Python 3 of Node.js (voor de lokale server).
- Arduino/microcontroller op **115200 baud**.

## Mappenstructuur
```
Slimme Vuilnisbak 4.0/
 ├─ 1 - Lesmateriaal/
 ├─ 2 - Dataset/
 ├─ 3 - Microcontrollers/
 ├─ 4 - HTML-bestanden/        # ← serveer deze map
 │   ├─ index.html
 │   ├─ style.css
 │   ├─ sketch.js
 │   ├─ p5.min.js
 │   ├─ ml5.min.js
 │   └─ image_model/
 │       ├─ model.json
 │       ├─ metadata.json
 │       └─ weights.bin
 └─ 5 - Lanceer de AI.py       # optioneel: start server + opent browser
```

## Snel starten
**Optie A – Python launcher**  
Dubbelklik `5 - Lanceer de AI.py`. De tool zoekt `4 - HTML-bestanden`, start een server en opent `http://localhost:8000`.  
Valt de autodetectie weg? Zet een env-variabele naar die map.

**Optie B – Handmatig (Python)**
```bash
cd "4 - HTML-bestanden"
python3 -m http.server 8000   # Windows: python -m http.server 8000
# open http://localhost:8000
```

## Teachable Machine model
1. Train op https://teachablemachine.withgoogle.com/train/image  
2. Exporteer als **TensorFlow.js**.  
3. Zet `model.json`, `weights.bin`, `metadata.json` in `4 - HTML-bestanden/image_model/`.  
4. Herlaad de app. De **Model**-badge moet groen worden.

## Label → code mapping
- Standaardmapping wordt uit `metadata.json` opgebouwd en opgeslagen in `localStorage`.  
- Codes: `'1'..'9'` (categorieën), `'X'` (alles aan), `'0'` (alles uit).  
- Aanpassen kan live via DevTools-console:

```js
showMapping();                      // toon huidige mapping
setMapping({ "karton": "4" });      // voeg/overschrijf regels
resetMapping();                     // reset naar metadata.json (indien aanwezig)
```

Parameters vind je bovenin `sketch.js`:
```js
const VOTE_WINDOW = 5;      // frames voor meerderheid
const CONF_THRESHOLD = 0.65;// minimale zekerheid
const SEND_DEBOUNCE_MS = 500;
```

## Serieel protocol (WebSerial)
- Klik **Verbind met microcontroller** en kies je poort.
- Er wordt exact **één teken + newline** geschreven (bijv. `'2\n'`, `'X\n'`).
- Baudrate **115200**.

### Arduino-voorbeeld
```cpp
void setup(){
  Serial.begin(115200);
  pinMode(2,OUTPUT); pinMode(3,OUTPUT);
  pinMode(4,OUTPUT); pinMode(5,OUTPUT);
}
void loop(){
  if(Serial.available()){
    char c = Serial.read();
    digitalWrite(2,LOW); digitalWrite(3,LOW);
    digitalWrite(4,LOW); digitalWrite(5,LOW);
    if(c=='1') digitalWrite(2,HIGH);
    else if(c=='2') digitalWrite(3,HIGH);
    else if(c=='3') digitalWrite(4,HIGH);
    else if(c=='4') digitalWrite(5,HIGH);
    else if(c=='X'){ digitalWrite(2,HIGH); digitalWrite(3,HIGH); digitalWrite(4,HIGH); digitalWrite(5,HIGH); }
  }
  delay(10);
}
```

## Probleemoplossing (kort)
- **Model laadt niet / CORS**: start altijd via een lokale server, niet via `file://`.
- **Camera werkt niet**: sta cameratoegang toe; sluit apps die de camera gebruiken.
- **WebSerial grijs**: gebruik Chrome/Edge via `https` of `http://localhost`.
- **LED’s reageren niet**: check baud 115200, wiring, en dat er één teken + newline verstuurd wordt. Bekijk de console voor `📨 Verzonden code`.

## Licentie en naamsvermelding
**MIT** — vrij te hergebruiken voor educatie **mits bronvermelding**.  
© 2025 Robbe Wulgaert – Sint-Lievenscollege Gent / AI in de Klas



