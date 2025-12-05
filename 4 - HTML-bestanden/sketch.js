/* ===============================================
   Slimme Vuilnisbak – Online Version v5
   © 2025 Robbe Wulgaert · AI in de Klas
   =============================================== */

/* ================== GLOBALE TOESTAND ================== */

// TM-model (teachablemachine-image)
let tmModel = null;

// p5 video capture
let video;

// Huidige inferentie-output
let label = '—';      // top-label
let conf  = 0;        // vertrouwen [0..1]

// WebSerial
let port   = null;
let writer = null;
let connectedBtn = null;

// Stabiliteit & drempels
const VOTE_WINDOW      = 5;       // meerderheidsvenster (frames)
const CONF_THRESHOLD   = 0.65;    // minimale zekerheid om te sturen
const SEND_DEBOUNCE_MS = 500;     // min. tijd tussen identieke zendingen

// Buffers/flags
let voteBuf      = [];            // laatste VOTE_WINDOW codes
let lastSentCode = null;
let lastSentTs   = 0;
let modelReady   = false;
let cameraReady  = false;

// Standaard Teachable Machine-model (uit map image_model/)
const MODEL_DIR = 'image_model/';
const MODEL_URL = MODEL_DIR + 'model.json';
const META_URL  = MODEL_DIR + 'metadata.json';

/* ================== LABEL → CODE MAPPING ================== */
const MAPPING_STORAGE_KEY = 'sv_mapping_v2';
let labelToCode = {};

// Normaliseer labels (zonder accenten, lowercase, spaties)
function canonical(s) {
  return String(s || '')
    .toLowerCase()
    .trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Bouw default mapping 1..n
function buildDefaultMapping(labels) {
  const map = {};
  let slot = 1;
  for (const lbl of labels) {
    const key = canonical(lbl);
    if (!map[key] && slot <= 9) {
      map[key] = String(slot++);
    }
  }
  // Alle labels die op mens/person lijken → 'X'
  for (const lbl of labels) {
    const k = canonical(lbl);
    if (k.includes('mens') || k.includes('human') || k.includes('person')) {
      map[k] = 'X';
    }
  }
  return map;
}

// Lees labels uit metadata.json (via URL)
async function loadModelLabelsFromUrl(url) {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const meta = await res.json();
    if (Array.isArray(meta.labels) && meta.labels.length) {
      return meta.labels.map(String);
    }
  } catch (e) {
    console.log('ℹ️ (Model) Kon labels niet lezen uit metadata.json – ga verder zonder.', e);
  }
  return null;
}

// Init mapping
async function initMapping(forceFresh = false) {
  if (!forceFresh) {
    const saved = localStorage.getItem(MAPPING_STORAGE_KEY);
    if (saved) {
      try {
        labelToCode = JSON.parse(saved);
        return;
      } catch {}
    }
  }

  let labels = null;
  // 1) Custom sessie?
  if (window.svCustomConfig && window.svCustomConfig.classes.length) {
    labels = window.svCustomConfig.classes.map(String);
  } else {
    // 2) Standaardmodel?
    labels = await loadModelLabelsFromUrl(META_URL);
  }

  if (labels && labels.length) {
    labelToCode = buildDefaultMapping(labels);
  } else {
    // Fallback
    labelToCode = {
      'biologisch': '1',
      'plastic':    '2',
      'metaal':     '3',
      'papier':     '4',
      'mens':       'X', 
    };
  }
  localStorage.setItem(MAPPING_STORAGE_KEY, JSON.stringify(labelToCode));
}

// Geef code ('0'..'9' of 'X') voor een ML-label
function codeForLabel(lbl) {
  const key = canonical(lbl);
  if (labelToCode[key]) return labelToCode[key];
  for (const k of Object.keys(labelToCode)) {
    if (key.startsWith(k) || key.includes(k)) return labelToCode[k];
  }
  return '0'; 
}

/* ================== PREFLIGHT STANDAARDMODEL ================== */

async function preflightDefaultModelAssets() {
  if (location.protocol === 'file:') {
    throw new Error('Open via http(s):// (niet file://).');
  }
  const res = await fetch(MODEL_URL, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error('model.json niet gevonden/bereikbaar op ' + MODEL_URL);
  }
}

/* ================== p5 – SETUP & DRAW ================== */

async function setup() {
  const c = createCanvas(320, 240);
  c.parent('canvasContainer');

  video = createCapture(VIDEO, () => {
    cameraReady = true;
    window.uiSetCamera?.(!(window.isPrivacyOn && window.isPrivacyOn()));
  });
  video.size(320, 240);
  video.hide();

  connectedBtn = document.getElementById('connectButton');
  if (!('serial' in navigator)) {
    connectedBtn?.setAttribute('disabled', 'true');
    window.uiSetSerial?.(false);
  } else {
    connectedBtn?.addEventListener('click', connectSerial);
    navigator.serial.addEventListener('disconnect', () => {
      writer = null; port = null;
      if (connectedBtn) connectedBtn.style.display = 'inline-block';
      window.uiSetSerial?.(false);
    });
  }

  await initMapping(false);
  await initDefaultModel();
  classifyLoop();

  document.addEventListener('privacychange', (e) => {
    const aan = !!e.detail;
    window.uiSetCamera?.(!aan && cameraReady);
  });

  document.addEventListener('svCustomConfigChanged', async (e) => {
    const cfg = e.detail || window.svCustomConfig;
    await initModelFromCustomConfig(cfg);
    await initMapping(true);  
  });
}

function draw() {
  background(20);
  push();
  translate(width, 0);
  scale(-1, 1);
  if (video) image(video, 0, 0, width, height);
  pop();

  noStroke();
  fill(0, 150);
  rect(0, height - 28, width, 28);
  fill(255);
  textSize(14);
  textAlign(CENTER, CENTER);
  text(`${label}  (${nf(conf * 100, 2, 1)}%)`, width / 2, height - 14);
}

/* ================== MODEL-INITIALISATIE ================== */

async function initDefaultModel() {
  window.uiSetModel?.(false);
  modelReady = false;

  try { await preflightDefaultModelAssets(); } 
  catch (err) { console.warn('Preflight error:', err); }

  if (tmModel) try { tmModel.dispose(); } catch (e) {}

  try {
    tmModel = await tmImage.load(MODEL_URL, META_URL);
    modelReady = true;
    window.uiSetModel?.(true);
  } catch (err) {
    console.error('Laden standaardmodel mislukt:', err);
    modelReady = false;
    window.uiSetModel?.(false);
  }
}

// FIX HIERONDER TOEGEPAST: loadFromFiles(model, weights, metadata)
async function initModelFromCustomConfig(cfg) {
  const config = cfg || window.svCustomConfig;

  if (
    !config ||
    !config.modelFile ||
    !config.metadataFile ||
    !Array.isArray(config.weightFiles) ||
    !config.weightFiles.length
  ) {
    console.warn('⚠️ (Model) Custom-config incompleet.');
    return;
  }

  if (tmModel) try { tmModel.dispose(); } catch (e) {}

  modelReady = false;
  window.uiSetModel?.(false);

  console.log('🧠 Custom model laden...');
  
  try {
    // FIX: De library verwacht drie losse argumenten, geen array!
    tmModel = await tmImage.loadFromFiles(
      config.modelFile, 
      config.weightFiles[0], // Neem de eerste binary file
      config.metadataFile
    );
    
    modelReady = true;
    window.uiSetModel?.(true);
    console.log('✅ Custom model geladen.');
  } catch (err) {
    console.error('❌ Fout bij laden custom model:', err);
    alert('Kon model niet laden. Check of je model.json, metadata.json EN weights.bin hebt geselecteerd.');
    modelReady = false;
    window.uiSetModel?.(false);
  }
}

/* ================== INFERENTIE-LOOP ================== */

async function classifyLoop() {
  while (true) {
    if (!modelReady || !cameraReady || (window.isPrivacyOn && window.isPrivacyOn())) {
      await sleep(150);
      continue;
    }
    if (!tmModel) {
      await sleep(150);
      continue;
    }

    try {
      const predictions = await tmModel.predict(video.elt);
      handleResults(predictions);
    } catch (err) {
      console.error('Classificatiefout:', err);
      await sleep(200);
    }
    await sleep(10);
  }
}

function handleResults(predictions) {
  if (!Array.isArray(predictions) || !predictions.length) return;

  let top = predictions[0];
  for (const p of predictions) {
    if (p.probability > top.probability) top = p;
  }

  label = top.className || '—';
  conf  = Number(top.probability || 0);
  window.uiSetLabels?.(label, conf);

  const code = codeForLabel(label);
  voteBuf.push(code);
  if (voteBuf.length > VOTE_WINDOW) voteBuf.shift();

  const maj = mode(voteBuf);
  const threshold = Math.ceil(voteBuf.length / 2);
  const freq = voteBuf.filter(c => c === maj).length;
  const stable = (freq >= threshold);

  if (stable && conf >= CONF_THRESHOLD && maj && maj !== '0') {
    sendCodeDebounced(maj);
  }
}

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

/* ================== WEBSERIAL ================== */

async function connectSerial() {
  try {
    port   = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200 });
    writer = port.writable.getWriter();
    window.uiSetSerial?.(true);
    window.setPrivacy?.(false);
    if (connectedBtn) connectedBtn.style.display = 'none';
  } catch (err) {
    console.error('Serial error:', err);
    window.uiSetSerial?.(false);
  }
}

async function sendCodeDebounced(code) {
  if (!writer) return;
  const now = Date.now();
  if (code === lastSentCode && (now - lastSentTs) < SEND_DEBOUNCE_MS) return;

  try {
    await writer.write(new TextEncoder().encode(code));
    lastSentCode = code;
    lastSentTs   = now;
    console.log('📨 Sent:', code);
  } catch (err) {
    console.error('Serial write error:', err);
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }