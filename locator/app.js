import {saveHandoff} from '/handoff.js';

const CLASSIFIER_URL = 'https://teachablemachine.withgoogle.com/models/zYUF_tPw1/';
const MAX_UPLOAD_BYTES = 10000000;
const ui = Object.fromEntries([
  'imageUpload', 'preview', 'marker', 'emptyState', 'systemStatus', 'resultBlock',
  'resultLabel', 'resultScore', 'analysisStatus', 'locationBlock', 'coordinates',
  'coordinateX', 'coordinateY', 'locationLabel', 'locationStatus', 'errorMessage', 'manualLocation',
  'confirmTarget', 'handoffNote'
].map(id => [id, document.getElementById(id)]));

let classifier;
let currentRequest = 0;
let pendingLocation;
let activeImageURL;
let manualMode = false;
let currentFile;
let selectedTarget;
let currentClass;

function stopManualMarking() {
  manualMode = false;
  ui.preview.classList.remove('marking');
  ui.preview.removeAttribute('tabindex');
  ui.preview.removeAttribute('role');
  ui.preview.alt = 'Uploaded CT scan';
}

function clearResult() {
  currentFile = undefined;
  selectedTarget = undefined;
  currentClass = undefined;
  stopManualMarking();
  ui.manualLocation.hidden = true;
  ui.confirmTarget.hidden = true;
  ui.confirmTarget.disabled = false;
  ui.handoffNote.hidden = true;
  ui.manualLocation.textContent = 'Mark location';
  ui.marker.hidden = true;
  ui.marker.getContext('2d').clearRect(0, 0, ui.marker.width, ui.marker.height);
  ui.resultBlock.hidden = true;
  ui.locationBlock.hidden = true;
  ui.coordinates.hidden = true;
  ui.errorMessage.hidden = true;
  ui.locationStatus.textContent = '';
  ui.coordinateX.textContent = '';
  ui.coordinateY.textContent = '';
  ui.locationLabel.textContent = 'Image location';
}

function showError(message) {
  ui.errorMessage.textContent = message;
  ui.errorMessage.hidden = false;
}

function drawLocation(point, width, height, color = '#79f5d9', label = 'AI-proposed location') {
  const box = point.box;
  const hasBox = Array.isArray(box) && box.length === 4 && box.every(Number.isFinite) &&
    box[0] >= 0 && box[1] >= 0 && box[2] <= width && box[3] <= height &&
    box[0] < box[2] && box[1] < box[3] &&
    box[0] <= point.x && point.x <= box[2] && box[1] <= point.y && point.y <= box[3];
  ui.marker.setAttribute('aria-label', hasBox ? `${label} and estimated area` : label);
  ui.marker.width = width;
  ui.marker.height = height;
  const ctx = ui.marker.getContext('2d');
  ctx.clearRect(0, 0, width, height);
  const markerSize = Math.max(8, Math.min(width, height) / 45);
  const size = hasBox ? Math.min(markerSize, Math.max(4, Math.min(box[2] - box[0], box[3] - box[1]) / 3)) : markerSize;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, Math.min(width, height) / 300);
  ctx.shadowColor = '#000';
  ctx.shadowBlur = 3;
  if (hasBox) {
    const [left, top, right, bottom] = box;
    ctx.strokeRect(left, top, right - left, bottom - top);
  }
  ctx.beginPath();
  ctx.arc(point.x, point.y, size * .55, 0, Math.PI * 2);
  ctx.moveTo(point.x - size * 1.5, point.y);
  ctx.lineTo(point.x - size * .75, point.y);
  ctx.moveTo(point.x + size * .75, point.y);
  ctx.lineTo(point.x + size * 1.5, point.y);
  ctx.moveTo(point.x, point.y - size * 1.5);
  ctx.lineTo(point.x, point.y - size * .75);
  ctx.moveTo(point.x, point.y + size * .75);
  ctx.lineTo(point.x, point.y + size * 1.5);
  ctx.stroke();
  ui.marker.hidden = false;
}

async function analyze(file) {
  const request = ++currentRequest;
  pendingLocation?.abort();
  pendingLocation = undefined;
  clearResult();
  ui.preview.hidden = true;
  ui.emptyState.hidden = false;
  if (activeImageURL) URL.revokeObjectURL(activeImageURL);
  activeImageURL = undefined;
  if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > MAX_UPLOAD_BYTES) {
    ui.systemStatus.textContent = 'Ready';
    ui.analysisStatus.textContent = 'Ready for a scan.';
    showError('Choose a JPG or PNG image smaller than 10 MB.');
    return;
  }
  currentFile = file;
  ui.systemStatus.textContent = 'Analyzing';
  ui.analysisStatus.textContent = 'Analyzing scan…';
  const imageURL = URL.createObjectURL(file);
  activeImageURL = imageURL;
  const scan = new Image();
  scan.src = imageURL;
  try {
    await scan.decode();
    if (request !== currentRequest) return;
    ui.preview.src = imageURL;
    ui.preview.hidden = false;
    ui.emptyState.hidden = true;
    const predictions = await classifier.predict(scan);
    if (request !== currentRequest) return;
    const top = [...predictions].sort((a, b) => b.probability - a.probability)[0];
    const scanClass = top?.className.trim().toLowerCase();
    if (!['normal', 'benign', 'malignant'].includes(scanClass) || !Number.isFinite(top.probability)) {
      throw new Error('Invalid classification');
    }
    ui.resultBlock.hidden = false;
    currentClass = scanClass;
    ui.resultLabel.textContent = scanClass[0].toUpperCase() + scanClass.slice(1);
    ui.resultScore.textContent = `${(top.probability * 100).toFixed(1)}% model confidence`;
    if (scanClass === 'normal') {
      ui.analysisStatus.textContent = 'Analysis complete.';
      return;
    }

    ui.analysisStatus.textContent = 'Finding the location…';
    const controller = new AbortController();
    pendingLocation = controller;
    const timeout = setTimeout(() => controller.abort(), 60000);
    let result;
    try {
      const response = await fetch('/api/locate', {
        method: 'POST', headers: {'Content-Type': file.type, 'X-Scan-Class': scanClass},
        body: file, signal: controller.signal
      });
      if (!response.ok) throw new Error('Location analysis failed');
      result = await response.json();
    } finally {
      clearTimeout(timeout);
      if (pendingLocation === controller) pendingLocation = undefined;
    }
    if (request !== currentRequest) return;
    ui.locationBlock.hidden = false;
    ui.locationLabel.textContent = `Image location · ${result.width} × ${result.height} px`;
    ui.analysisStatus.textContent = 'Analysis complete.';
    const point = result.location;
    if (result.status !== 'located' || !point) {
      ui.locationStatus.textContent = 'Automatic location needs review.';
      ui.manualLocation.hidden = false;
      return;
    }
    if (result.width !== scan.naturalWidth || result.height !== scan.naturalHeight ||
        ![point.x, point.y, point.x_percent, point.y_percent].every(Number.isFinite) ||
        point.x < 0 || point.y < 0 || point.x >= result.width || point.y >= result.height) {
      throw new Error('Invalid location');
    }
    drawLocation(point, result.width, result.height);
    selectedTarget = {x: point.x, y: point.y, width: result.width, height: result.height, source: 'ai'};
    ui.coordinateX.textContent = `${point.x.toFixed(1)} px`;
    ui.coordinateY.textContent = `${point.y.toFixed(1)} px`;
    ui.coordinates.hidden = false;
    ui.locationStatus.textContent = point.box ? 'Estimated area · review required.' : 'Review the marked location.';
    ui.confirmTarget.hidden = false;
    ui.handoffNote.hidden = false;
  } catch (error) {
    if (request !== currentRequest) return;
    ui.marker.hidden = true;
    selectedTarget = undefined;
    ui.confirmTarget.hidden = true;
    ui.handoffNote.hidden = true;
    ui.coordinates.hidden = true;
    ui.analysisStatus.textContent = 'Analysis incomplete.';
    showError(error.name === 'AbortError' ? 'Analysis timed out. Please try again.' : 'Unable to analyze this scan. Please try again.');
  } finally {
    if (request === currentRequest) ui.systemStatus.textContent = 'Ready';
  }
}

function markManualPoint(x, y) {
  if (!manualMode) return;
  const width = ui.preview.naturalWidth;
  const height = ui.preview.naturalHeight;
  const point = {x: Math.max(0, Math.min(width - 1, x)), y: Math.max(0, Math.min(height - 1, y))};
  selectedTarget = {x: point.x, y: point.y, width, height, source: 'manual'};
  drawLocation(point, width, height, '#ffd27b', 'Manually marked location');
  ui.coordinateX.textContent = `${point.x.toFixed(1)} px`;
  ui.coordinateY.textContent = `${point.y.toFixed(1)} px`;
  ui.coordinates.hidden = false;
  ui.locationStatus.textContent = 'Manual location · review required.';
  ui.confirmTarget.hidden = false;
  ui.handoffNote.hidden = false;
  ui.manualLocation.textContent = 'Finish marking';
  ui.preview.dataset.manualX = point.x;
  ui.preview.dataset.manualY = point.y;
}

ui.manualLocation.addEventListener('click', () => {
  if (manualMode) {
    stopManualMarking();
    ui.manualLocation.textContent = ui.marker.hidden ? 'Mark location' : 'Adjust location';
    ui.locationStatus.textContent = ui.marker.hidden ? 'Automatic location needs review.' : 'Manual location · review required.';
    return;
  }
  manualMode = true;
  ui.preview.classList.add('marking');
  ui.preview.tabIndex = 0;
  ui.preview.setAttribute('role', 'button');
  ui.preview.alt = 'Choose a location: click the scan, or use arrow keys and Enter.';
  ui.preview.focus();
  ui.locationStatus.textContent = 'Click the location to mark it manually.';
});

ui.confirmTarget.addEventListener('click', async () => {
  const target = selectedTarget;
  const request = currentRequest;
  if (!currentFile || !currentClass || !target || manualMode && ui.marker.hidden) return;
  ui.confirmTarget.disabled = true;
  ui.confirmTarget.textContent = 'Opening 3D simulation…';
  try {
    const id = await saveHandoff({file: currentFile, scanClass: currentClass, ...target});
    if (request !== currentRequest) return;
    window.location.assign(`/3d/?handoff=${encodeURIComponent(id)}`);
  } catch {
    ui.confirmTarget.disabled = false;
    ui.confirmTarget.textContent = 'Doctor confirm & move 3D hand';
    showError('Unable to transfer this image to the 3D simulation. Please try again.');
  }
});

ui.preview.addEventListener('click', event => {
  const bounds = ui.preview.getBoundingClientRect();
  markManualPoint((event.clientX - bounds.left) / bounds.width * ui.preview.naturalWidth,
    (event.clientY - bounds.top) / bounds.height * ui.preview.naturalHeight);
});

ui.preview.addEventListener('keydown', event => {
  if (!manualMode) return;
  const directions = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]};
  if (event.key === 'Enter' && !ui.marker.hidden) {
    event.preventDefault();
    stopManualMarking();
    ui.manualLocation.textContent = 'Adjust location';
    ui.manualLocation.focus();
    return;
  }
  if (!directions[event.key]) return;
  event.preventDefault();
  const [dx, dy] = directions[event.key];
  const x = ui.marker.hidden ? ui.preview.naturalWidth / 2 : Number(ui.preview.dataset.manualX);
  const y = ui.marker.hidden ? ui.preview.naturalHeight / 2 : Number(ui.preview.dataset.manualY);
  markManualPoint(x + dx * (event.shiftKey ? 10 : 1), y + dy * (event.shiftKey ? 10 : 1));
});

ui.imageUpload.addEventListener('change', () => {
  const file = ui.imageUpload.files[0];
  ui.imageUpload.value = '';
  if (file) analyze(file);
});

try {
  classifier = await tmImage.load(CLASSIFIER_URL + 'model.json', CLASSIFIER_URL + 'metadata.json');
  ui.imageUpload.disabled = false;
  ui.systemStatus.textContent = 'Ready';
} catch {
  ui.systemStatus.textContent = 'Unavailable';
  ui.analysisStatus.textContent = 'Unable to load the model.';
  showError('Check your internet connection and reload the page.');
}
