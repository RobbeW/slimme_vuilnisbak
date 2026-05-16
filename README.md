# Slimme Vuilnisbak

Slimme Vuilnisbak is een vakoverschrijdend STEaM-project. Leerlingen maken kennis met de volledige levenscyclus van een AI-model: data verzamelen, sorteren, labels toekennen, trainen, testen, bijsturen en koppelen aan een microcontroller zoals Arduino of micro:bit.

Het project gaat niet over "AI is magisch", maar over kijken, testen en bijsturen. Wanneer het model fout zit, wordt dat interessant: welke voorbeelden ontbreken, welke klassen lijken op elkaar en wanneer is een voorspelling betrouwbaar genoeg om een fysieke actie te starten?

## Links

- Repository: https://github.com/RobbeW/slimme_vuilnisbak
- GitHub Pages landing: https://robbew.github.io/slimme_vuilnisbak/
- GitHub Pages platform: https://robbew.github.io/slimme_vuilnisbak/platform.html
- Directe webmap: https://robbew.github.io/slimme_vuilnisbak/4%20-%20HTML-bestanden/


## Wat doen leerlingen?

- Ze verzamelen en sorteren voorbeeldbeelden.
- Ze kennen labels toe aan klassen.
- Ze trainen of testen een Teachable Machine model.
- Ze vergelijken hun verwachting met de voorspelling van het model.
- Ze lezen de zekerheid per klasse af.
- Ze koppelen klassen aan seriele codes.
- Ze laten een microcontroller reageren op de voorspelling.
- Ze schrijven kort wat goed werkte en welke beelden de dataset sterker zouden maken.

## Bestanden

```text
slimme_vuilnisbak/
|-- index.html          
|-- platform.html       
|-- README.md
|-- 1 - Lesmateriaal/
|-- 2 - Dataset/
|-- 3 - Microcontrollers/
|-- 4 - HTML-bestanden/
|   |-- index.html      
|   |-- platform.html   
|   |-- style.css
|   |-- sketch.js
|   |-- landing.js
|   |-- p5.min.js
|   `-- image_model/
`-- 5 - Lanceer de AI.py
```

## Lokaal starten

Gebruik een lokale server of GitHub Pages. Open de bestanden niet rechtstreeks via `file://`, want dan kan het model niet betrouwbaar laden.

```bash
python -m http.server 8000
```

Open daarna de canonieke lokale versie:

```text
http://localhost:8000/
```

Wil je enkel de directe webmap testen, start de server dan vanuit `4 - HTML-bestanden`.

## Platform

Het platform werkt met:

- Teachable Machine image model;
- p5.js voor camera en canvas;
- WebSerial voor Chrome en Edge;
- demomodus zonder hardware;
- testbeelden zonder live camera;
- observatielog;
- rapport met naam, klas, voorspelling, observaties en reflectie.

## Serieel protocol

De browser stuurt een code plus nieuwe regel:

```text
1\n
2\n
3\n
4\n
X\n
```

Gebruik in de microcontrollercode dezelfde baudrate als het platform: `115200`.

## Copyright

Copyright (c) 2026 Robbe Wulgaert. Alle rechten voorbehouden.
