/* ===============================================
   Slimme Vuilnisbak – p5 + ml5 + WebSerial
   © 2025 Robbe Wulgaert · AI in de Klas
   =============================================== */

// ===== Globale toestand =====
let classifier;               // ml5-classifier
let video;                    // p5 video capture
let label = '—';              // huidig top-label
let conf  = 0;                // huidig vertrouwen [0..1]

let port = null;              // WebSerial poort
let writer = null;            // WebSerial writer
let connectedBtn = null;

// Stabiliteit & drempels
const VOTE_WINDOW      = 5;       // meerderheidsvenster (frames)
const CONF_THRESHOLD   = 0.65;    // minimale zekerheid om te sturen
const SEND_DEBOUNCE_MS = 500;     // min. tijd tussen identieke zendingen

// Buffers/flags
let voteBuf      = [];            // laatste VOTE_WINDOW codes ('0'..'9'/'X')
let lastSentCode = null;          // laatst verzonden code ('0'..'9'/'X')
let lastSentTs   = 0;             // timestamp laatste verzending (ms)
let modelReady   = false;
let cameraReady  = false;

// Modelbestanden
const MODEL_DIR = 'image_model/';
const MODEL_URL = MODEL_DIR + 'model.json';
const META_URL  = MODEL_DIR + 'metadata.json';

// ===== Dynamische label→code mapping (student-hackable) =====
// - Leest labels uit metadata.json (indien aanwezig)
// - Maakt 1..n toewijzing; studenten kunnen dit live aanpassen
const MAPPING_STORAGE_KEY = 'sv_mapping_v1';
let labelToCode = {};  // { "papier": "3", "mens": "X", ... }

// Normaliseer labels (zonder accenten, lowercase, spaties)
function canonical(s) {
  return String(s || '')
    .toLowerCase()
    .trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Lees labels uit metadata.json (Teachable Machine) – optioneel
async function loadModelLabels() {
  try {
    const res = await fetch(META_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const meta = await res.json();
    if (Array.isArray(meta.labels) && meta.labels.length) {
      console.log('🧠 (Model) Labels uit metadata.json:', meta.labels);
      return meta.labels.map(String);
    }
  } catch (e) {
    console.log('ℹ️ (Model) Geen/ongeldige metadata.json – ga verder zonder.');
  }
  return null;
}

// Bouw default mapping 1..n (+ 'mens/human/person' → 'X' = alles aan)
function buildDefaultMapping(labels) {
  const map = {};
  let slot = 1;
  for (const lbl of labels) {
    const key = canonical(lbl);
    if (!map[key] && slot <= 9) map[key] = String(slot++);
  }
  for (const lbl of labels) {
    const k = canonical(lbl);
    if (k.includes('mens') || k.includes('human') || k.includes('person')) {
      map[k] = 'X';
    }
  }
  return map;
}

// Init mapping uit opslag of metadata; met fallback voor typische labels
async function initMapping() {
  const saved = localStorage.getItem(MAPPING_STORAGE_KEY);
  if (saved) {
    try {
      labelToCode = JSON.parse(saved);
      console.log('🗂️ (Mapping) Hersteld uit opslag:', labelToCode);
      return;
    } catch {
      // ga verder
    }
  }

  const labels = await loadModelLabels();
  if (labels && labels.length) {
    labelToCode = buildDefaultMapping(labels);
  } else {
    // Fallback: voorverzonnen set — studenten mogen wijzigen
    labelToCode = {
      'biologisch': '1',
      'plastic':    '2',
      'metaal':     '3',
      'papier':     '4',
      'mens':       'X', // alles aan
    };
  }
  localStorage.setItem(MAPPING_STORAGE_KEY, JSON.stringify(labelToCode));
  console.log('🆕 (Mapping) Aangemaakt:', labelToCode);
}

// Geef code ('0'..'9' of 'X') voor een ML-label
function codeForLabel(lbl) {
  const key = canonical(lbl);
  if (labelToCode[key]) return labelToCode[key];

  // Fuzzy fallback (begint met / bevat)
  for (const k of Object.keys(labelToCode)) {
    if (key.startsWith(k) || key.includes(k)) return labelToCode[k];
  }
  return '0'; // onbekend → alles uit
}

// Console-hulpen voor studenten (bewust globaal)
window.showMapping = () => console.table(labelToCode);
window.setMapping = (obj) => {
  labelToCode = { ...labelToCode, ...obj };
  localStorage.setItem(MAPPING_STORAGE_KEY, JSON.stringify(labelToCode));
  console.log('✅ (Mapping) Bijgewerkt:', labelToCode);
};
window.resetMapping = async () => {
  const labels = await loadModelLabels();
  labelToCode = labels ? buildDefaultMapping(labels) : {};
  localStorage.setItem(MAPPING_STORAGE_KEY, JSON.stringify(labelToCode));
  console.log('🔄 (Mapping) Gereset:', labelToCode);
};

// ===== Preflight – controle van modelbestanden =====
async function preflightModelAssets() {
  // 1) file:// blokkeren i.v.m. CORS/camera/serieel
  if (location.protocol === 'file:') {
    console.error('❌ (Model) CORS-blokkade: geopend via file://');
    console.info('💡 Start een lokale server, bv:');
    console.info('   npx http-server -c-1 .   of   python3 -m http.server 8000');
    throw new Error('Open via http(s):// (niet file://).');
  }

  // 2) model.json ophalen
  console.log('🔍 (Model) Controleer model.json…');
  const modelRes = await fetch(MODEL_URL, { cache: 'no-cache' });
  if (!modelRes.ok) throw new Error('model.json niet gevonden/bereikbaar.');
  const modelJson = await modelRes.json();

  // 3) eerste weightpad verifiëren
  const manifest = Array.isArray(modelJson.weightsManifest) ? modelJson.weightsManifest : null;
  if (!manifest || !manifest.length || !manifest[0].paths || !manifest[0].paths.length) {
    throw new Error('weightsManifest ontbreekt/leeg in model.json.');
  }
  const firstWeight = manifest[0].paths[0];
  console.log('🔍 (Model) Controleer weights:', firstWeight);
  const weightRes = await fetch(MODEL_DIR + firstWeight, { cache: 'no-cache' });
  if (!weightRes.ok) throw new Error('weights (.bin) niet gevonden: ' + firstWeight);

  // 4) metadata.json is optioneel
  console.log('🔍 (Model) Controleer metadata.json (optioneel)…');
  try {
    const metaRes = await fetch(META_URL, { cache: 'no-cache' });
    if (!metaRes.ok) {
      console.warn('⚠️ (Model) metadata.json niet gevonden – ga verder zonder.');
    } else {
      await metaRes.json();
    }
  } catch {
    console.warn('⚠️ (Model) metadata.json ongeldig – ga verder zonder.');
  }

  console.log('✅ (Model) Bestanden OK – ga laden.');
}

// ===== p5 – setup & draw =====
async function setup() {
  // Canvas + camera (gespiegeld tekenen doen we in draw)
  const c = createCanvas(320, 240);
  c.parent('canvasContainer');

  video = createCapture(VIDEO, () => {
    cameraReady = true;
    console.log('📷 (Camera) Gestart.');
    // NL: Camera-badge is 'actief' alleen als privacy UIT is
    window.uiSetCamera?.(!(window.isPrivacyOn && window.isPrivacyOn()));
  });
  video.size(320, 240);
  video.hide();

  // WebSerial knop & beleid
  connectedBtn = document.getElementById('connectButton');
  if (!('serial' in navigator) || (location.protocol !== 'https:' && location.hostname !== 'localhost')) {
    console.warn('⚠️ (Serieel) Niet beschikbaar – gebruik https:// of http://localhost.');
    connectedBtn?.setAttribute('disabled', 'true');
    window.uiSetSerial?.(false);
  } else {
    connectedBtn?.addEventListener('click', connectSerial);
    navigator.serial.addEventListener('disconnect', () => {
      console.warn('📴 (Serieel) Verbinding verbroken.');
      try { writer?.releaseLock?.(); } catch {}
      writer = null; port = null;
      if (connectedBtn) connectedBtn.style.display = 'inline-block';
      window.uiSetSerial?.(false);
    });
  }

  // Mapping & model parallel initialiseren
  await initMapping();
  initModel().catch(err => {
    console.error('❌ (Model) Laden mislukt:', err);
    window.uiSetModel?.(false);
  });

  // ===== NL: Reageer op privacy-toggles (badge & logging) =====
  document.addEventListener('privacychange', (e) => {
    const aan = !!e.detail;
    console.log('🔒 (Privacy) Modus:', aan ? 'aan' : 'uit');
    // Camera-badge toont 'actief' alleen als cameraReady en privacy UIT
    window.uiSetCamera?.(!aan && cameraReady);
  });
}

function draw() {
  background(20); // donker voor contrast

  // Gespiegeld tekenen van de live video
  push();
  translate(width, 0);
  scale(-1, 1);
  if (video) image(video, 0, 0, width, height);
  pop();

  // Overlay (label + zekerheid)
  noStroke();
  fill(0, 150); rect(0, height - 28, width, 28);
  fill(255);
  textSize(14); textAlign(CENTER, CENTER);
  text(`${label}  (${nf(conf * 100, 2, 1)}%)`, width / 2, height - 14);
}

// ===== Model-initialisatie =====
async function initModel() {
  window.uiSetModel?.(false);
  await preflightModelAssets();

  console.log('🧠 (Model) Laden…');
  // ml5 v0.6.1: gebruik await (geen .then op de factory)
  classifier = await ml5.imageClassifier(MODEL_URL);
  modelReady = true;
  window.uiSetModel?.(true);
  console.log('🧠 (Model) Geladen.');

  // Start inferentieloop
  classifyLoop();
}

// ===== Inferentie-loop met meerderheid =====
async function classifyLoop() {
  while (true) {
    // Wacht tot camera+model klaar en privacy UIT staat
    if (!modelReady || !cameraReady || (window.isPrivacyOn && window.isPrivacyOn())) {
      await sleep(150);
      continue;
    }
    try {
      const results = await classifier.classify(video);
      handleResults(results);
    } catch (err) {
      console.error('Classificatiefout:', err);
      await sleep(200);
    }
    await sleep(10);
  }
}

function handleResults(results) {
  if (!Array.isArray(results) || !results.length) return;

  const top = results[0];
  label = top.label || '—';
  conf  = Number(top.confidence || 0);
  window.uiSetLabels?.(label, conf);

  // Vertaal label → code ('0'..'9' of 'X')
  const code = codeForLabel(label);

  // Update stem-buffer
  voteBuf.push(code);
  if (voteBuf.length > VOTE_WINDOW) voteBuf.shift();

  // Bepaal modus (meest voorkomende code)
  const maj = mode(voteBuf);

  // Stabiliteitscriterium: meerderheid ≥ ceil(VOTE_WINDOW/2)
  const threshold = Math.ceil(voteBuf.length / 2);
  const freq = voteBuf.filter(c => c === maj).length;
  const stable = (freq >= threshold);

  // Zend enkel bij stabiele meerderheid, voldoende vertrouwen én geen '0'
  if (stable && conf >= CONF_THRESHOLD && maj && maj !== '0') {
    sendCodeDebounced(maj);
  }
}

// Modus (meest voorkomende waarde) van een array
function mode(arr) {
  const counts = new Map();
  let best = null, bestN = -1;
  for (const v of arr) {
    const n = (counts.get(v) || 0) + 1;
    counts.set(v, n);
    if (n > bestN) { best = v; bestN = n; }
  }
  return best;
}

// ===== WebSerial – verbinden en sturen =====
async function connectSerial() {
  try {
    port   = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200 });
    writer = port.writable.getWriter();
    window.writer = writer; // handig voor debugging in console
    window.uiSetSerial?.(true);
    console.log('🔌 (Serieel) Verbonden @115200.');

    // NL: Privacy uitzetten zodat de analyse direct hervat
    window.setPrivacy?.(false);

    if (connectedBtn) connectedBtn.style.display = 'none';
  } catch (err) {
    console.error('Fout bij seriële verbinding:', err);
    alert('Kon niet verbinden met microcontroller. Gebruik https:// of http://localhost.');
    window.uiSetSerial?.(false);
  }
}

// Schrijf exact 1 teken ZONDER newline, met debounce
async function sendCodeDebounced(code) {
  if (!writer) return;
  const now = Date.now();
  if (code === lastSentCode && (now - lastSentTs) < SEND_DEBOUNCE_MS) return;

  try {
    const msg = code; // ❗ enkel 1 teken sturen: '1'..'9' of 'X' – géén '\n'
    await writer.write(new TextEncoder().encode(msg));
    lastSentCode = code;
    lastSentTs   = now;
    console.log('📨 (Serieel) Verzonden code:', code);
  } catch (err) {
    console.error('Schrijffout (serieel):', err);
  }
}

// ===== kleine hulpjes =====
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
