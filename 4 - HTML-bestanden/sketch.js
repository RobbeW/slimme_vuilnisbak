/* Slimme Vuilnisbak - platformlogica
   Copyright (c) 2026 Robbe Wulgaert */

const ASSET_BASE = window.SV_ASSET_BASE || "";
const MODEL_DIR = `${ASSET_BASE}image_model/`;
const MODEL_URL = MODEL_DIR + "model.json";
const META_URL = MODEL_DIR + "metadata.json";
const MAPPING_STORAGE_KEY = "sv_mapping_v3";
const CONF_THRESHOLD = 0.65;
const VOTE_WINDOW = 5;
const SEND_DEBOUNCE_MS = 500;

let tmModel = null;
let cameraVideo = null;
let cameraStream = null;
let p5Canvas = null;
let uploadedImageElement = null;
let uploadedP5Image = null;
let port = null;
let writer = null;

let modelReady = false;
let cameraReady = false;
let privacyOn = false;
let demoMode = false;
let demoTimer = 0;
let voteBuffer = [];
let lastSentCode = null;
let lastSentTs = 0;
let labels = ["BIO", "PLASTIC", "METAAL", "PAPIER", "MENS"];
let modelClassLabels = null; // class names exactly as the loaded model reports them
let defaultLabels = null;
let activeModelSource = "default";
let customFileSet = { model: null, metadata: null, weights: null, metadataLabels: null };
let classesAutoFilled = true;
let labelToCode = {};
let latestPrediction = null;
let observationLog = [];

let els = {};

function cacheElements() {
  els = {
    notice: document.getElementById("compatibility-notice"),
    modelStatus: document.getElementById("st-model"),
    cameraStatus: document.getElementById("st-camera"),
    serialStatus: document.getElementById("st-serial"),
    startCamera: document.getElementById("btn-start-camera"),
    testImage: document.getElementById("input-test-image"),
    demo: document.getElementById("btn-demo"),
    privacy: document.getElementById("btn-privacy"),
    connect: document.getElementById("btn-connect"),
    disconnect: document.getElementById("btn-disconnect"),
    resultLabel: document.getElementById("resultLabel"),
    confidenceLabel: document.getElementById("confidenceLabel"),
    confidenceList: document.getElementById("confidence-list"),
    mappingTable: document.getElementById("mapping-table"),
    resetMapping: document.getElementById("btn-reset-mapping"),
    expectedClass: document.getElementById("input-expected-class"),
    expectedMetric: document.getElementById("metric-expected"),
    predictedMetric: document.getElementById("metric-predicted"),
    confidenceMetric: document.getElementById("metric-confidence"),
    codeMetric: document.getElementById("metric-code"),
    observationBody: document.getElementById("observation-body"),
    serialPreview: document.getElementById("serial-preview"),
    diagBrowser: document.getElementById("diag-browser"),
    diagModel: document.getElementById("diag-model"),
    diagSource: document.getElementById("diag-source"),
    diagSerial: document.getElementById("diag-serial"),
    help: document.getElementById("overlay-help"),
    helpOpen: document.getElementById("btn-help"),
    helpClose: document.getElementById("btn-close-help"),
    customForm: document.getElementById("custom-session-form"),
    customTitle: document.getElementById("custom-title"),
    customClasses: document.getElementById("custom-classes"),
    customFiles: document.getElementById("custom-tm-files"),
    customModelStatus: document.getElementById("custom-model-status"),
    customDropzone: document.getElementById("custom-dropzone"),
    customClassesHint: document.getElementById("custom-classes-hint"),
    customLoad: document.getElementById("btn-load-custom-model"),
    useDefaultModel: document.getElementById("btn-use-default-model"),
    defaultModelClasses: document.getElementById("default-model-classes"),
    modelSourceRadios: [...document.querySelectorAll('input[name="model-source"]')],
    modelPanels: [...document.querySelectorAll("[data-model-panel]")],
    fileChecklist: [...document.querySelectorAll("[data-required-file]")],
    report: document.getElementById("report-modal"),
    reportOpen: document.getElementById("btn-report"),
    reportCancel: document.getElementById("btn-cancel-report"),
    reportBack: document.getElementById("btn-report-back"),
    reportForm: document.getElementById("report-form"),
    reportNames: document.getElementById("report-names"),
    reportClass: document.getElementById("report-class"),
    workflowLinks: [...document.querySelectorAll("[data-step-link]")]
  };
}

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  bindUi();
  renderConfidenceBars([]);
  updateDiagnostics();
  setCompatibilityNotice();
});

async function setup() {
  cacheElements();

  p5Canvas = createCanvas(320, 240);
  p5Canvas.parent("canvasContainer");
  background(18);

  await initMapping(false);
  await initDefaultModel();
  classifyLoop();
}

function draw() {
  background(18);

  if (privacyOn) {
    drawMessage("Beeld gepauzeerd");
    return;
  }

  if (uploadedP5Image) {
    image(uploadedP5Image, 0, 0, width, height);
    return;
  }

  if (cameraVideo && cameraReady) {
    drawCameraFrame();
    return;
  }

  if (demoMode) {
    drawMessage("Demomodus");
    return;
  }

  drawMessage("Start camera of demo");
}

function drawMessage(message) {
  fill(248, 247, 243);
  noStroke();
  textAlign(CENTER, CENTER);
  textSize(18);
  text(message, width / 2, height / 2);
}

function drawCameraFrame() {
  if (!cameraVideo || cameraVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    drawMessage("Camera wordt gestart");
    return;
  }

  push();
  translate(width, 0);
  scale(-1, 1);
  drawingContext.drawImage(cameraVideo, 0, 0, width, height);
  pop();
}

function bindUi() {
  els.startCamera?.addEventListener("click", startCamera);
  els.testImage?.addEventListener("change", handleTestImageUpload);
  els.demo?.addEventListener("click", toggleDemoMode);
  els.privacy?.addEventListener("click", togglePrivacy);
  els.connect?.addEventListener("click", connectSerial);
  els.disconnect?.addEventListener("click", disconnectSerial);
  els.resetMapping?.addEventListener("click", async () => {
    storageRemove(MAPPING_STORAGE_KEY);
    await initMapping(true);
  });
  els.expectedClass?.addEventListener("change", updateMetrics);

  els.helpOpen?.addEventListener("click", () => openOverlay(els.help));
  els.helpClose?.addEventListener("click", () => closeOverlay(els.help));

  els.customForm?.addEventListener("submit", handleCustomModelSubmit);
  els.customForm?.addEventListener("reset", () => window.setTimeout(resetCustomForm, 0));
  els.customFiles?.addEventListener("change", () => inspectCustomFiles(els.customFiles.files));
  els.customClasses?.addEventListener("input", () => {
    classesAutoFilled = false;
    updateCustomFormState();
  });
  els.useDefaultModel?.addEventListener("click", switchToDefaultModel);
  els.modelSourceRadios.forEach((radio) => {
    radio.addEventListener("change", () => radio.checked && showModelPanel(radio.value));
  });
  bindDropzone();

  els.reportOpen?.addEventListener("click", () => openOverlay(els.report));
  els.reportCancel?.addEventListener("click", () => closeOverlay(els.report));
  els.reportBack?.addEventListener("click", () => closeOverlay(els.report));
  els.reportForm?.addEventListener("submit", handleReportSubmit);

  els.workflowLinks.forEach((link) => {
    link.addEventListener("click", () => setActiveStep(link.dataset.stepLink));
  });

  const observer = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (visible) setActiveStep(visible.target.id);
  }, { rootMargin: "-30% 0px -55% 0px", threshold: [0.15, 0.35, 0.55] });

  document.querySelectorAll(".workflow-section").forEach((section) => observer.observe(section));
}

function setActiveStep(id) {
  if (!id) return;
  els.workflowLinks?.forEach((link) => {
    link.classList.toggle("is-active", link.dataset.stepLink === id);
  });
}

function openOverlay(overlay) {
  overlay?.classList.remove("hidden");
}

function closeOverlay(overlay) {
  overlay?.classList.add("hidden");
}

function setCompatibilityNotice() {
  const problems = [];
  if (location.protocol === "file:") {
    problems.push("Open dit platform via localhost of GitHub Pages. Via file:// kan het model niet betrouwbaar laden.");
  }
  if (!("serial" in navigator)) {
    problems.push("WebSerial werkt in Chrome of Edge. In deze browser kan je wel de demo gebruiken.");
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    problems.push("Deze browser geeft geen cameratoegang aan webpagina's.");
  }

  if (problems.length && els.notice) {
    showNotice(problems.join(" "));
  }
}

function showNotice(message) {
  if (!els.notice) return;
  els.notice.textContent = message;
  els.notice.classList.remove("hidden");
}

function hideNotice() {
  els.notice?.classList.add("hidden");
}

function updateStatus(el, text, on = false, warn = false) {
  if (!el) return;
  el.textContent = text;
  el.classList.toggle("is-on", on);
  el.classList.toggle("is-warn", warn);
}

function updateDiagnostics() {
  updateStatus(els.modelStatus, modelReady ? "Model geladen" : "Model niet geladen", modelReady);
  updateStatus(els.cameraStatus, cameraReady && !privacyOn ? "Camera actief" : demoMode ? "Demomodus actief" : uploadedImageElement ? "Testbeeld actief" : "Camera niet actief", cameraReady && !privacyOn, demoMode || uploadedImageElement);
  updateStatus(els.serialStatus, writer ? "Verbonden" : "Niet verbonden", !!writer);

  if (els.diagBrowser) {
    els.diagBrowser.textContent = "Browsercontrole: " + (("serial" in navigator) ? "WebSerial beschikbaar" : "geen WebSerial");
  }
  if (els.diagModel) {
    els.diagModel.textContent = "Model: " + (modelReady ? "geladen" : "niet geladen");
  }
  if (els.diagSource) {
    const source = demoMode ? "demomodus" : uploadedImageElement ? "testbeeld" : cameraReady ? "camera" : "geen beeldbron";
    els.diagSource.textContent = "Beeldbron: " + source;
  }
  if (els.diagSerial) {
    els.diagSerial.textContent = "Serieel: " + (writer ? "verbonden op 115200 baud" : "niet verbonden");
  }
}

async function startCamera() {
  demoMode = false;
  uploadedImageElement = null;
  uploadedP5Image = null;
  cameraReady = false;
  updateDiagnostics();

  if (!navigator.mediaDevices?.getUserMedia) {
    showNotice("Deze browser geeft geen cameratoegang aan webpagina's. Gebruik Chrome of Edge via HTTPS, GitHub Pages of localhost.");
    updateDiagnostics();
    return;
  }

  stopCameraStream();

  try {
    cameraStream = await requestCameraStream();
    cameraVideo = document.createElement("video");
    cameraVideo.muted = true;
    cameraVideo.autoplay = true;
    cameraVideo.playsInline = true;
    cameraVideo.setAttribute("playsinline", "");
    cameraVideo.srcObject = cameraStream;

    await waitForVideoReady(cameraVideo);
    await cameraVideo.play();
    cameraReady = true;
    hideNotice();
    els.startCamera.textContent = "Herstart camera";
  } catch (error) {
    console.warn("Camera starten mislukt:", error);
    cameraReady = false;
    cameraVideo = null;
    cameraStream = null;
    showNotice("De camera kon niet gestart worden. Controleer de browsertoestemming of sluit een andere app die de camera gebruikt.");
  }

  els.demo.textContent = "Start demomodus";
  updateDiagnostics();
}

async function requestCameraStream() {
  const preferred = {
    audio: false,
    video: {
      width: { ideal: 640 },
      height: { ideal: 480 },
      facingMode: { ideal: "environment" }
    }
  };

  try {
    return await navigator.mediaDevices.getUserMedia(preferred);
  } catch {
    return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  }
}

function waitForVideoReady(videoElement) {
  return new Promise((resolve, reject) => {
    if (videoElement.readyState >= HTMLMediaElement.HAVE_METADATA) {
      resolve();
      return;
    }

    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Camera metadata timeout"));
    }, 6000);

    function cleanup() {
      window.clearTimeout(timeout);
      videoElement.removeEventListener("loadedmetadata", onReady);
      videoElement.removeEventListener("canplay", onReady);
      videoElement.removeEventListener("error", onError);
    }

    function onReady() {
      cleanup();
      resolve();
    }

    function onError() {
      cleanup();
      reject(new Error("Camera video error"));
    }

    videoElement.addEventListener("loadedmetadata", onReady, { once: true });
    videoElement.addEventListener("canplay", onReady, { once: true });
    videoElement.addEventListener("error", onError, { once: true });
  });
}

function stopCameraStream() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
  }
  cameraStream = null;
  if (cameraVideo) {
    cameraVideo.pause();
    cameraVideo.srcObject = null;
  }
  cameraVideo = null;
}

function handleTestImageUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  demoMode = false;
  cameraReady = false;
  stopCameraStream();

  const url = URL.createObjectURL(file);
  uploadedImageElement = new Image();
  uploadedImageElement.onload = async () => {
    loadImage(url, (img) => {
      uploadedP5Image = img;
      URL.revokeObjectURL(url);
    });
    await classifyUploadedImage();
    updateDiagnostics();
  };
  uploadedImageElement.src = url;
  updateDiagnostics();
}

function toggleDemoMode() {
  demoMode = !demoMode;
  privacyOn = false;
  uploadedImageElement = null;
  uploadedP5Image = null;
  cameraReady = false;

  stopCameraStream();

  els.demo.textContent = demoMode ? "Stop demomodus" : "Start demomodus";
  els.privacy?.setAttribute("aria-pressed", "false");
  updateDiagnostics();
}

function togglePrivacy() {
  privacyOn = !privacyOn;
  els.privacy?.setAttribute("aria-pressed", String(privacyOn));
  els.privacy.textContent = privacyOn ? "Hervat beeld" : "Pauzeer beeld";
  updateDiagnostics();
}

async function initDefaultModel() {
  modelReady = false;
  updateDiagnostics();

  if (typeof tmImage === "undefined") {
    console.warn("Teachable Machine library is niet beschikbaar.");
    setModelStatus("De Teachable Machine-bibliotheek kon niet geladen worden. Controleer je internetverbinding.", "error");
    syncModelChoiceUi();
    return;
  }

  try {
    const metaLabels = await loadModelLabelsFromUrl(META_URL);
    if (metaLabels?.length) {
      labels = metaLabels;
      defaultLabels = metaLabels;
      renderDefaultClassChips();
    }
    await initMapping(false);
    tmModel = await tmImage.load(MODEL_URL, META_URL);
    modelClassLabels = getModelClassLabels(tmModel) || labels.slice();
    activeModelSource = "default";
    modelReady = true;
    renderConfidenceBars([]);
    setModelStatus("Standaardmodel actief. Je kan nu testen.", "ok");
  } catch (error) {
    console.warn("Model laden mislukt:", error);
    modelReady = !!tmModel;
    setModelStatus("Het standaardmodel kon niet geladen worden. Open de pagina via een webserver (bv. GitHub Pages).", "error");
  }
  syncModelChoiceUi();

  updateDiagnostics();
}

async function loadModelLabelsFromUrl(url) {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const metadata = await response.json();
    return Array.isArray(metadata.labels) ? metadata.labels.map(String) : null;
  } catch {
    return null;
  }
}

async function initMapping(forceFresh = false) {
  if (!forceFresh) {
    const saved = storageGet(MAPPING_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const matchesLabels = parsed && labels.every((item) => Object.prototype.hasOwnProperty.call(parsed, canonical(item)));
        if (matchesLabels) {
          labelToCode = parsed;
          renderMappingTable();
          renderExpectedClassOptions();
          return;
        }
      } catch {
        storageRemove(MAPPING_STORAGE_KEY);
      }
    }
  }

  labelToCode = {};
  labels.forEach((item, index) => {
    const key = canonical(item);
    labelToCode[key] = key.includes("mens") || key.includes("human") || key.includes("person") ? "X" : String(index + 1);
  });
  saveMapping();
  renderMappingTable();
  renderExpectedClassOptions();
}

function canonical(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function displayLabel(value) {
  const raw = String(value || "--").trim();
  if (!raw || raw === "--") return "--";
  const lower = raw.toLowerCase();
  if (lower === "bio") return "BIO";
  if (lower === "plastic") return "PLASTIC";
  if (lower === "metaal") return "METAAL";
  if (lower === "papier") return "PAPIER";
  if (lower === "mens") return "MENS";
  return raw.toUpperCase();
}

function codeForLabel(value) {
  const key = canonical(value);
  if (labelToCode[key]) return labelToCode[key];
  const match = Object.keys(labelToCode).find((known) => key.includes(known) || known.includes(key));
  return match ? labelToCode[match] : "0";
}

// localStorage is shared by every page on the same origin (e.g. all GitHub Pages
// projects under one account), so it can be full or blocked. Never let storage
// failures break model loading: the mapping simply stays in memory.
function storageGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function storageRemove(key) {
  try { localStorage.removeItem(key); } catch {}
}

function saveMapping() {
  try {
    localStorage.setItem(MAPPING_STORAGE_KEY, JSON.stringify(labelToCode));
  } catch (error) {
    console.warn("Mapping kon niet bewaard worden (opslag vol of geblokkeerd):", error);
  }
}

function renderMappingTable() {
  if (!els.mappingTable) return;

  els.mappingTable.innerHTML = "";
  labels.forEach((item) => {
    const key = canonical(item);
    const row = document.createElement("label");
    row.className = "mapping-row";

    const labelSpan = document.createElement("span");
    labelSpan.textContent = displayLabel(item);

    const input = document.createElement("input");
    input.value = labelToCode[key] || "";
    input.maxLength = 3;
    input.setAttribute("aria-label", `Code voor ${displayLabel(item)}`);
    input.addEventListener("input", () => {
      labelToCode[key] = input.value.trim() || "0";
      saveMapping();
      updateMetrics();
    });

    row.append(labelSpan, input);
    els.mappingTable.append(row);
  });
}

function renderConfidenceBars(predictions) {
  if (!els.confidenceList) return;

  const byLabel = new Map((predictions || []).map((prediction) => [
    canonical(prediction.className),
    Number(prediction.probability || 0)
  ]));

  els.confidenceList.innerHTML = "";
  labels.forEach((item) => {
    const value = byLabel.get(canonical(item)) || 0;
    const row = document.createElement("div");
    row.className = "confidence-row";
    row.innerHTML = `
      <strong>${displayLabel(item)}</strong>
      <div class="confidence-track"><span style="width: ${(value * 100).toFixed(0)}%"></span></div>
      <span>${(value * 100).toFixed(0)}%</span>
    `;
    els.confidenceList.append(row);
  });
}

async function classifyLoop() {
  while (true) {
    if (privacyOn) {
      await sleep(150);
      continue;
    }

    if (demoMode) {
      if (Date.now() - demoTimer > 950) {
        demoTimer = Date.now();
        handleResults(createDemoPredictions());
      }
      await sleep(80);
      continue;
    }

    if (uploadedImageElement && modelReady && tmModel) {
      await sleep(600);
      await classifyUploadedImage();
      continue;
    }

    if (modelReady && cameraReady && cameraVideo && tmModel) {
      try {
        const predictions = await tmModel.predict(cameraVideo);
        handleResults(applyDisplayLabels(predictions));
      } catch (error) {
        console.warn("Classificatiefout:", error);
        await sleep(250);
      }
    }

    await sleep(80);
  }
}

async function classifyUploadedImage() {
  if (!uploadedImageElement || !modelReady || !tmModel || privacyOn) return;
  try {
    const predictions = await tmModel.predict(uploadedImageElement);
    handleResults(applyDisplayLabels(predictions));
  } catch (error) {
    console.warn("Testbeeld classificeren mislukt:", error);
  }
}

function createDemoPredictions() {
  const selected = labels[Math.floor(Math.random() * labels.length)];
  const topValue = 0.72 + Math.random() * 0.22;
  const remaining = Math.max(0, 1 - topValue);
  const predictions = labels.map((item) => ({
    className: item,
    probability: item === selected ? topValue : remaining / Math.max(1, labels.length - 1) * Math.random()
  }));
  return predictions;
}

function handleResults(predictions) {
  if (!Array.isArray(predictions) || !predictions.length) return;

  let top = predictions[0];
  predictions.forEach((prediction) => {
    if (prediction.probability > top.probability) top = prediction;
  });

  const label = top.className || "--";
  const confidence = Number(top.probability || 0);
  const code = codeForLabel(label);

  latestPrediction = { label, confidence, code, sent: false, time: new Date() };
  voteBuffer.push(code);
  if (voteBuffer.length > VOTE_WINDOW) voteBuffer.shift();

  renderPrediction(label, confidence, code);
  renderConfidenceBars(predictions);

  const stableCode = mode(voteBuffer);
  const stableCount = voteBuffer.filter((item) => item === stableCode).length;
  const stable = stableCount >= Math.ceil(voteBuffer.length / 2);

  if (stable && confidence >= CONF_THRESHOLD && stableCode && stableCode !== "0") {
    sendCodeDebounced(stableCode, label, confidence);
  } else {
    addObservation(label, confidence, code, false);
  }
}

function renderPrediction(label, confidence, code) {
  const display = displayLabel(label);
  if (els.resultLabel) els.resultLabel.textContent = display;
  if (els.confidenceLabel) els.confidenceLabel.textContent = `${Math.round(confidence * 100)}% zekerheid`;
  updateMetrics(display, confidence, code);
}

function updateMetrics(label = latestPrediction?.label, confidence = latestPrediction?.confidence, code = latestPrediction?.code) {
  const expected = els.expectedClass?.value || "--";
  if (els.expectedMetric) els.expectedMetric.textContent = expected || "--";
  if (els.predictedMetric) els.predictedMetric.textContent = displayLabel(label);
  if (els.confidenceMetric) els.confidenceMetric.textContent = typeof confidence === "number" ? `${Math.round(confidence * 100)}%` : "--";
  if (els.codeMetric) els.codeMetric.textContent = code || "--";
}

function addObservation(label, confidence, code, sent) {
  const now = new Date();
  const last = observationLog[0];
  if (
    last &&
    last.label === label &&
    last.code === code &&
    last.sent === sent &&
    now - last.time < 1200
  ) {
    return;
  }

  observationLog.unshift({ label, confidence, code, sent, time: now });
  observationLog = observationLog.slice(0, 14);
  renderObservationLog();
}

function renderObservationLog() {
  if (!els.observationBody) return;
  if (!observationLog.length) {
    els.observationBody.innerHTML = '<tr><td colspan="5">Nog geen observatie.</td></tr>';
    return;
  }

  els.observationBody.innerHTML = observationLog.map((entry) => `
    <tr>
      <td>${entry.time.toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</td>
      <td>${displayLabel(entry.label)}</td>
      <td>${Math.round(entry.confidence * 100)}%</td>
      <td>${entry.code}</td>
      <td>${entry.sent ? "ja" : "nee"}</td>
    </tr>
  `).join("");
}

function mode(items) {
  const counts = new Map();
  let best = null;
  let bestCount = -1;
  items.forEach((item) => {
    const count = (counts.get(item) || 0) + 1;
    counts.set(item, count);
    if (count > bestCount) {
      best = item;
      bestCount = count;
    }
  });
  return best;
}

async function connectSerial() {
  if (!("serial" in navigator)) {
    alert("WebSerial werkt in Chrome of Edge via HTTPS, GitHub Pages of localhost.");
    updateDiagnostics();
    return;
  }

  try {
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200 });
    writer = port.writable.getWriter();
    els.connect.disabled = true;
    els.disconnect.disabled = false;
  } catch (error) {
    console.warn("Seriële verbinding mislukt:", error);
    writer = null;
    port = null;
  }

  updateDiagnostics();
}

async function disconnectSerial() {
  try {
    if (writer) {
      await writer.close();
      writer.releaseLock();
    }
    if (port) await port.close();
  } catch (error) {
    console.warn("Verbinding verbreken mislukt:", error);
  }

  writer = null;
  port = null;
  els.connect.disabled = false;
  els.disconnect.disabled = true;
  updateDiagnostics();
}

async function sendCodeDebounced(code, label, confidence) {
  const now = Date.now();
  if (code === lastSentCode && now - lastSentTs < SEND_DEBOUNCE_MS) return;

  let sent = false;
  if (writer) {
    try {
      await writer.write(new TextEncoder().encode(`${code}\n`));
      lastSentCode = code;
      lastSentTs = now;
      sent = true;
      if (els.serialPreview) {
        els.serialPreview.textContent = `Laatste code: ${code}\\n`;
      }
    } catch (error) {
      console.warn("Serieel schrijven mislukt:", error);
    }
  }

  addObservation(label, confidence, code, sent);
  updateMetrics(label, confidence, code);
  updateDiagnostics();
}

// ---------- Model choice: standaardmodel OR eigen Teachable Machine model ----------

const FALLBACK_DEFAULT_LABELS = ["BIO", "PLASTIC", "METAAL", "PAPIER", "MENS"];
const CLASSES_HINT_DEFAULT = "De klassen worden automatisch ingevuld uit metadata.json.";

function getModelClassLabels(model) {
  try {
    const list = typeof model?.getClassLabels === "function" ? model.getClassLabels() : null;
    return Array.isArray(list) && list.length ? list.map(String) : null;
  } catch {
    return null;
  }
}

// The model always reports its own class names. When the user renamed the
// classes, translate each prediction to the new name by position.
function applyDisplayLabels(predictions) {
  if (!Array.isArray(predictions) || !modelClassLabels || modelClassLabels.length !== labels.length) {
    return predictions;
  }
  return predictions.map((prediction) => {
    const index = modelClassLabels.indexOf(String(prediction.className));
    return index >= 0 ? { ...prediction, className: labels[index] } : prediction;
  });
}

function setModelStatus(message, tone = "info") {
  if (!els.customModelStatus) return;
  els.customModelStatus.textContent = message;
  els.customModelStatus.dataset.tone = tone;
}

function showModelPanel(source) {
  (els.modelPanels || []).forEach((panel) => {
    panel.hidden = panel.dataset.modelPanel !== source;
  });
  (els.modelSourceRadios || []).forEach((radio) => {
    radio.checked = radio.value === source;
  });
}

function syncModelChoiceUi() {
  if (els.useDefaultModel) {
    const isActive = activeModelSource === "default" && modelReady;
    els.useDefaultModel.disabled = isActive;
    els.useDefaultModel.textContent = isActive ? "Standaardmodel is actief" : "Gebruik standaardmodel";
  }
  (els.modelSourceRadios || []).forEach((radio) => {
    radio.closest(".model-choice-card")?.classList.toggle("is-active-model", modelReady && radio.value === activeModelSource);
  });
}

function renderDefaultClassChips() {
  if (!els.defaultModelClasses) return;
  els.defaultModelClasses.innerHTML = "";
  (defaultLabels || FALLBACK_DEFAULT_LABELS).forEach((item) => {
    const chip = document.createElement("li");
    chip.textContent = displayLabel(item);
    els.defaultModelClasses.append(chip);
  });
}

function renderExpectedClassOptions() {
  const select = els.expectedClass;
  if (!select) return;
  const previous = select.value;
  select.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Kies een klasse";
  select.append(placeholder);
  labels.forEach((item) => {
    const option = document.createElement("option");
    option.value = displayLabel(item);
    option.textContent = displayLabel(item);
    select.append(option);
  });
  select.value = [...select.options].some((option) => option.value === previous) ? previous : "";
}

function bindDropzone() {
  const zone = els.customDropzone;
  if (!zone) return;
  ["dragenter", "dragover"].forEach((type) => zone.addEventListener(type, (event) => {
    event.preventDefault();
    zone.classList.add("is-dragging");
  }));
  ["dragleave", "dragend", "drop"].forEach((type) => zone.addEventListener(type, () => zone.classList.remove("is-dragging")));
  zone.addEventListener("drop", (event) => {
    event.preventDefault();
    const files = event.dataTransfer?.files;
    if (!files?.length) return;
    try {
      els.customFiles.files = files;
    } catch {}
    inspectCustomFiles(files);
  });
}

async function readJsonFile(file) {
  try {
    return JSON.parse(await file.text());
  } catch {
    return null;
  }
}

// Recognise the three Teachable Machine export files by content, not only by
// name, so renamed downloads like "model (1).json" still work.
async function inspectCustomFiles(fileList) {
  const files = [...(fileList || [])];
  const found = { model: null, metadata: null, weights: null, metadataLabels: null, metadataInvalid: false };

  for (const file of files) {
    const name = file.name.toLowerCase();
    if (name.endsWith(".bin")) {
      found.weights = found.weights || file;
      continue;
    }
    if (!name.endsWith(".json")) continue;

    const json = await readJsonFile(file);
    if (json?.modelTopology || json?.weightsManifest) {
      found.model = found.model || file;
    } else if (Array.isArray(json?.labels)) {
      found.metadata = found.metadata || file;
      found.metadataLabels = json.labels.map(String);
    } else if (name.includes("metadata")) {
      found.metadata = found.metadata || file;
      found.metadataInvalid = true;
    } else if (name.includes("model")) {
      found.model = found.model || file;
    }
  }

  customFileSet = found;

  if (found.metadataLabels && (classesAutoFilled || !els.customClasses?.value.trim())) {
    if (els.customClasses) els.customClasses.value = found.metadataLabels.join("\n");
    classesAutoFilled = true;
  }

  updateCustomFormState();
}

function readTypedClasses() {
  return (els.customClasses?.value || "")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function updateCustomFormState() {
  const { model, metadata, weights, metadataLabels, metadataInvalid } = customFileSet;

  (els.fileChecklist || []).forEach((item) => {
    const key = item.dataset.requiredFile;
    const file = customFileSet[key];
    const invalid = key === "metadata" && metadataInvalid;
    item.classList.toggle("is-found", !!file && !invalid);
    item.classList.toggle("is-invalid", invalid);
    const state = item.querySelector(".file-state");
    if (state) state.textContent = invalid ? "ongeldig" : file ? "gevonden" : "ontbreekt";
  });

  const typed = readTypedClasses();
  const countMismatch = metadataLabels && typed.length && typed.length !== metadataLabels.length;
  const ready = !!(model && metadata && weights) && !metadataInvalid && !countMismatch;

  if (els.customClassesHint) {
    let hint = CLASSES_HINT_DEFAULT;
    let tone = "";
    if (metadataInvalid) {
      hint = "Dit metadata.json-bestand bevat geen klassen. Kies het bestand uit je Teachable Machine-export.";
      tone = "error";
    } else if (countMismatch) {
      hint = `Je model heeft ${metadataLabels.length} klassen, maar je vulde er ${typed.length} in.`;
      tone = "error";
    } else if (metadataLabels) {
      hint = `${metadataLabels.length} klassen gevonden in metadata.json.`;
      tone = "ok";
    }
    els.customClassesHint.textContent = hint;
    els.customClassesHint.dataset.tone = tone;
  }

  if (els.customLoad) els.customLoad.disabled = !ready;
  return ready;
}

function resetCustomForm() {
  customFileSet = { model: null, metadata: null, weights: null, metadataLabels: null };
  classesAutoFilled = true;
  updateCustomFormState();
}

let defaultAppTitle = null;
function applyProjectTitle(title) {
  const heading = document.querySelector(".AIapp h2");
  if (defaultAppTitle === null) {
    defaultAppTitle = { page: document.title, heading: heading?.textContent || "" };
  }
  if (title) {
    document.title = `Platform ${title}`;
    if (heading) heading.textContent = title;
  } else {
    document.title = defaultAppTitle.page;
    if (heading) heading.textContent = defaultAppTitle.heading;
  }
}

function disposeModel(model) {
  try {
    model?.dispose?.();
  } catch {}
}

async function switchToDefaultModel() {
  const previous = tmModel;
  setModelStatus("Standaardmodel wordt geladen...", "info");
  labels = (defaultLabels || FALLBACK_DEFAULT_LABELS).slice();
  applyProjectTitle("");
  await initDefaultModel();
  if (previous && previous !== tmModel) disposeModel(previous);
}

async function handleCustomModelSubmit(event) {
  event.preventDefault();

  // Older page versions have no file checklist: inspect the files now.
  if (!customFileSet.model || !customFileSet.metadata || !customFileSet.weights) {
    await inspectCustomFiles(els.customFiles?.files);
  }
  if (!updateCustomFormState()) {
    setModelStatus("Selecteer model.json, metadata.json en weights.bin uit dezelfde export.", "error");
    return;
  }

  const { model, metadata, weights, metadataLabels } = customFileSet;
  const typed = readTypedClasses();
  const title = els.customTitle?.value.trim();
  const previous = tmModel;

  setModelStatus("Eigen model wordt geladen...", "info");
  if (els.customLoad) els.customLoad.disabled = true;
  modelReady = false;
  updateDiagnostics();

  try {
    const loaded = await tmImage.loadFromFiles(model, weights, metadata);
    tmModel = loaded;
    modelClassLabels = getModelClassLabels(loaded) || metadataLabels || typed;
    labels = typed.length ? typed : modelClassLabels.slice();
    activeModelSource = "custom";
    await initMapping(true);
    renderConfidenceBars([]);
    modelReady = true;
    applyProjectTitle(title);
    if (previous && previous !== loaded) disposeModel(previous);
    setModelStatus("Eigen model actief. Je kan nu testen.", "ok");
  } catch (error) {
    console.warn("Eigen model laden mislukt:", error);
    modelReady = !!tmModel; // keep the previous model running
    setModelStatus("Het model kon niet geladen worden. Controleer of de drie bestanden uit dezelfde export komen.", "error");
  }

  syncModelChoiceUi();
  updateCustomFormState();
  updateDiagnostics();
}

function handleReportSubmit(event) {
  event.preventDefault();
  const reportWindow = window.open("", "_blank");
  if (!reportWindow) {
    alert("De browser blokkeerde het rapportvenster. Sta pop-ups toe voor deze pagina.");
    return;
  }

  const rows = observationLog.slice(0, 8).map((entry) => `
    <tr>
      <td>${entry.time.toLocaleTimeString("nl-BE")}</td>
      <td>${displayLabel(entry.label)}</td>
      <td>${Math.round(entry.confidence * 100)}%</td>
      <td>${entry.code}</td>
      <td>${entry.sent ? "ja" : "nee"}</td>
    </tr>
  `).join("");

  const html = `
    <!doctype html>
    <html lang="nl-BE">
    <head>
      <meta charset="utf-8" />
      <title>Rapport Slimme Vuilnisbak</title>
      <style>
        body { font-family: Roboto, Arial, sans-serif; margin: 36px; color: #273142; }
        h1, h2 { color: #160033; }
        .meta { border-left: 6px solid #5200ff; padding-left: 16px; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { border-bottom: 1px solid #e2ddea; padding: 8px; text-align: left; }
        th { color: #3a00b8; }
      </style>
    </head>
    <body>
      <h1>Rapport Slimme Vuilnisbak</h1>
      <div class="meta">
        <p><strong>Naam/namen:</strong> ${escapeHtml(els.reportNames.value)}</p>
        <p><strong>Klas:</strong> ${escapeHtml(els.reportClass.value)}</p>
        <p><strong>Datum:</strong> ${new Date().toLocaleDateString("nl-BE")}</p>
      </div>
      <h2>Voorspelling</h2>
      <p><strong>Testobject:</strong> ${escapeHtml(document.getElementById("input-object")?.value || "")}</p>
      <p><strong>Verwachte klasse:</strong> ${escapeHtml(els.expectedClass?.value || "")}</p>
      <p><strong>Waarom:</strong> ${escapeHtml(document.getElementById("input-prediction-reason")?.value || "")}</p>
      <h2>Laatste observaties</h2>
      <table>
        <thead><tr><th>Tijd</th><th>Klasse</th><th>Zekerheid</th><th>Code</th><th>Verstuurd</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5">Geen observaties.</td></tr>'}</tbody>
      </table>
      <h2>Besluit</h2>
      <p>${escapeHtml(document.getElementById("input-conclusion")?.value || "")}</p>
      <h2>Reflectie</h2>
      <p>${escapeHtml(document.getElementById("input-reflection")?.value || "")}</p>
      <footer><p>© 2026 Robbe Wulgaert · AI in de Klas</p></footer>
      <script>window.print();<\/script>
    </body>
    </html>
  `;

  reportWindow.document.open();
  reportWindow.document.write(html);
  reportWindow.document.close();
  closeOverlay(els.report);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
