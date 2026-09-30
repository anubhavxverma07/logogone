/* ============================================================
   LogoGone — app.js
   Browser-only logo removal using OpenCV.js
   100% client-side. No server. No tracking.
   ============================================================ */

'use strict';

/* ---------------- Utilities ---------------- */
const $  = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

function toast(msg, type = 'info', ms = 3200) {
  const wrap = $('#toastWrap');
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  const icons = {
    success: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    error:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    info:    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    warning: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
  };
  el.innerHTML = '<div class="toast-icon">' + (icons[type] || icons.info) + '</div><div>' + msg + '</div>';
  wrap.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 400);
  }, ms);
}

/* ---------------- State ---------------- */
const state = {
  mode: 'photo',
  originalImage: null,
  originalVideo: null,
  workCanvas: null,
  workCtx: null,
  maskCanvas: null,
  maskCtx: null,
  backupCanvas: null,
  backupCtx: null,
  history: [],
  painting: false,
  brushSize: 30,
  tool: 'paint',
  quality: 1080,
  lastPointer: null,
  resultBlob: null,
  cvReady: false,
  originalDisplayW: 0,
  originalDisplayH: 0,
  originalSourceW: 0,
  originalSourceH: 0
};

/* ---------------- OpenCV loader ---------------- */
function loadOpenCV() {
  return new Promise((resolve, reject) => {
    if (window.cv && window.cv.Mat) return resolve();
    const script = document.createElement('script');
    script.src = 'https://docs.opencv.org/4.8.0/opencv.js';
    script.async = true;
    script.onload = () => {
      if (window.cv && window.cv.Mat) return resolve();
      if (window.cv) {
        window.cv['onRuntimeInitialized'] = () => resolve();
      } else {
        reject(new Error('OpenCV failed to load'));
      }
    };
    script.onerror = () => reject(new Error('OpenCV script failed'));
    document.head.appendChild(script);
  });
}

(async function initCV() {
  const loader = $('#cvLoader');
  const loaderText = $('#cvLoaderText');
  try {
    loaderText.textContent = 'Loading AI engine… (first time only)';
    await loadOpenCV();
    state.cvReady = true;
    loader.classList.remove('show');
    toast('Engine ready ✓', 'success', 2000);
  } catch (e) {
    loaderText.textContent = 'Failed to load engine. Check internet.';
    toast('Engine failed to load', 'error', 5000);
    console.error(e);
  }
})();

/* ---------------- Tabs ---------------- */
$$('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    if (tab.classList.contains('active')) return;
    $$('.tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    state.mode = tab.dataset.mode;
    if (state.mode === 'photo') {
      $('#dropTitle').textContent = 'Drop your photo here';
      $('#dropSub').textContent = 'or click to browse — JPG, PNG, WebP, HEIC';
      $('#fileInput').setAttribute('accept', 'image/*');
    } else {
      $('#dropTitle').textContent = 'Drop your video here';
      $('#dropSub').textContent = 'or click to browse — MP4, WebM, MOV (short clips work best)';
      $('#fileInput').setAttribute('accept', 'video/*');
    }
  });
});

/* ---------------- Drop zone ---------------- */
const dropZone = $('#dropZone');
const fileInput = $('#fileInput');

['dragenter', 'dragover'].forEach((ev) => {
  dropZone.addEventListener(ev, (e) => {
    e.preventDefault(); e.stopPropagation();
    dropZone.classList.add('drag');
  });
});
['dragleave', 'drop'].forEach((ev) => {
  dropZone.addEventListener(ev, (e) => {
    e.preventDefault(); e.stopPropagation();
    dropZone.classList.remove('drag');
  });
});
dropZone.addEventListener('drop', (e) => {
  const f = e.dataTransfer.files[0];
  if (f) handleFile(f);
});
dropZone.addEventListener('click', () => fileInput.click());
$('#chooseBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  fileInput.click();
});
fileInput.addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (f) handleFile(f);
  fileInput.value = '';
});

function handleFile(file) {
  if (!state.cvReady) { toast('Engine still loading, wait a moment…', 'warning'); return; }
  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');
  if (state.mode === 'photo' && !isImage) { toast('Please drop an image file', 'error'); return; }
  if (state.mode === 'video' && !isVideo) { toast('Please drop a video file', 'error'); return; }
  if (isImage) loadImage(file);
  else loadVideo(file);
}

/* ---------------- Image loading ---------------- */
function loadImage(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    state.originalImage = img;
    setupEditor(img.naturalWidth, img.naturalHeight, img);
    URL.revokeObjectURL(url);
    toast(`Photo loaded · ${img.naturalWidth}×${img.naturalHeight}`, 'success');
  };
  img.onerror = () => { toast('Failed to load image', 'error'); URL.revokeObjectURL(url); };
  img.src = url;
}

/* ---------------- Video loading ---------------- */
function loadVideo(file) {
  const url = URL.createObjectURL(file);
  const vid = document.createElement('video');
  vid.muted = true;
  vid.playsInline = true;
  vid.preload = 'auto';
  vid.crossOrigin = 'anonymous';
  vid.onloadedmetadata = async () => {
    state.originalVideo = vid;
    await seekTo(vid, Math.min(0.1, vid.duration / 2));
    const temp = document.createElement('canvas');
    temp.width = vid.videoWidth; temp.height = vid.videoHeight;
    temp.getContext('2d').drawImage(vid, 0, 0);
    setupEditor(vid.videoWidth, vid.videoHeight, temp);
    toast(`Video loaded · ${vid.videoWidth}×${vid.videoHeight} · ${vid.duration.toFixed(1)}s`, 'success');
    if (vid.duration > 30) toast('Tip: short clips (≤30s) process much faster', 'warning', 5000);
  };
  vid.onerror = () => { toast('Failed to load video', 'error'); URL.revokeObjectURL(url); };
  vid.src = url;
}

function seekTo(video, time) {
  return new Promise((resolve) => {
    const onSeeked = () => { video.removeEventListener('seeked', onSeeked); resolve(); };
    video.addEventListener('seeked', onSeeked);
    video.currentTime = time;
  });
}

/* ---------------- Setup editor ---------------- */
function setupEditor(w, h, source) {
  $('#uploadSection').style.display = 'none';
  $('#editorSection').style.display = 'block';
  scrollTo({ top: 0, behavior: 'smooth' });

  const maxW = Math.min(window.innerWidth - 40, 1100);
  const maxH = window.innerHeight * 0.68;
  const ratio = Math.min(maxW / w, maxH / h, 1);
  const dispW = Math.round(w * ratio);
  const dispH = Math.round(h * ratio);

  const canvas = $('#canvas');
  canvas.width = dispW;
  canvas.height = dispH;
  canvas.style.width = dispW + 'px';
  canvas.style.height = dispH + 'px';

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  state.workCanvas = canvas;
  state.workCtx = ctx;
  ctx.drawImage(source, 0, 0, dispW, dispH);

  const mc = document.createElement('canvas');
  mc.width = dispW; mc.height = dispH;
  state.maskCanvas = mc;
  state.maskCtx = mc.getContext('2d', { willReadFrequently: true });

  state.history = [];
  state.lastPointer = null;
  state.backupCanvas = null;
  state.originalDisplayW = dispW;
  state.originalDisplayH = dispH;
  state.originalSourceW = w;
  state.originalSourceH = h;

  attachCanvasEvents();
  updateDownloadUI(null);
  $('#progressCard').style.display = 'none';
}

/* ---------------- Painting ---------------- */
function attachCanvasEvents() {
  const c = state.workCanvas;
  if (!c || c.dataset.bound) return;
  c.dataset.bound = '1';

  const getPos = (e) => {
    const rect = c.getBoundingClientRect();
    const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const cy = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    const scaleX = c.width / rect.width;
    const scaleY = c.height / rect.height;
    return { x: cx * scaleX, y: cy * scaleY };
  };

  const start = (e) => {
    e.preventDefault();
    state.painting = true;
    pushHistory();
    const p = getPos(e);
    state.lastPointer = p;
    drawMark(p, p);
  };
  const move = (e) => {
    if (!state.painting) return;
    e.preventDefault();
    const p = getPos(e);
    drawMark(state.lastPointer, p);
    state.lastPointer = p;
  };
  const end = () => {
    if (!state.painting) return;
    state.painting = false;
    state.lastPointer = null;
  };

  c.addEventListener('mousedown', start);
  c.addEventListener('mousemove', move);
  c.addEventListener('mouseup', end);
  c.addEventListener('mouseleave', end);
  c.addEventListener('touchstart', start, { passive: false });
  c.addEventListener('touchmove', move, { passive: false });
  c.addEventListener('touchend', end);
  c.addEventListener('touchcancel', end);
}

function drawMark(from, to) {
  const ctx  = state.workCtx;
  const mctx = state.maskCtx;
  const size = state.brushSize;

  // backup original visible frame once
  if (!state.backupCanvas) {
    const bc = document.createElement('canvas');
    bc.width = state.workCanvas.width;
    bc.height = state.workCanvas.height;
    state.backupCanvas = bc;
    state.backupCtx = bc.getContext('2d', { willReadFrequently: true });
    state.backupCtx.drawImage(state.workCanvas, 0, 0);
  }

  if (state.tool === 'paint') {
    // mask: solid white
    mctx.save();
    mctx.strokeStyle = '#ffffff';
    mctx.fillStyle = '#ffffff';
    mctx.lineWidth = size;
    mctx.lineCap = 'round';
    mctx.lineJoin = 'round';
    mctx.beginPath();
    mctx.moveTo(from.x, from.y);
    mctx.lineTo(to.x, to.y);
    mctx.stroke();
    mctx.beginPath();
    mctx.arc(to.x, to.y, size / 2, 0, Math.PI * 2);
    mctx.fill();
    mctx.restore();

    // visible: translucent brand tint
    ctx.save();
    ctx.strokeStyle = 'rgba(124,92,255,0.55)';
    ctx.fillStyle = 'rgba(124,92,255,0.55)';
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(to.x, to.y, size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else {
    // erase mask
    mctx.save();
    mctx.globalCompositeOperation = 'destination-out';
    mctx.strokeStyle = '#000';
    mctx.fillStyle = '#000';
    mctx.lineWidth = size;
    mctx.lineCap = 'round';
    mctx.lineJoin = 'round';
    mctx.beginPath();
    mctx.moveTo(from.x, from.y);
    mctx.lineTo(to.x, to.y);
    mctx.stroke();
    mctx.beginPath();
    mctx.arc(to.x, to.y, size / 2, 0, Math.PI * 2);
    mctx.fill();
    mctx.restore();

    // restore visible pixels from backup along stroke
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.floor(dist / (size / 3)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const px = from.x + (to.x - from.x) * t;
      const py = from.y + (to.y - from.y) * t;
      ctx.save();
      ctx.beginPath();
      ctx.arc(px, py, size / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(state.backupCanvas, 0, 0);
      ctx.restore();
    }
  }
}

function pushHistory() {
  try {
    const snap = document.createElement('canvas');
    snap.width = state.maskCanvas.width;
    snap.height = state.maskCanvas.height;
    snap.getContext('2d').drawImage(state.maskCanvas, 0, 0);

    const vis = document.createElement('canvas');
    vis.width = state.workCanvas.width;
    vis.height = state.workCanvas.height;
    vis.getContext('2d').drawImage(state.workCanvas, 0, 0);

    state.history.push({ mask: snap, visible: vis });
    if (state.history.length > 30) state.history.shift();
  } catch (e) { /* ignore */ }
}

/* ---------------- Undo / Clear / New ---------------- */
$('#btnUndo').addEventListener('click', () => {
  if (!state.history.length) { toast('Nothing to undo', 'info'); return; }
  const last = state.history.pop();
  state.maskCtx.clearRect(0, 0, state.maskCanvas.width, state.maskCanvas.height);
  state.maskCtx.drawImage(last.mask, 0, 0);
  state.workCtx.clearRect(0, 0, state.workCanvas.width, state.workCanvas.height);
  state.workCtx.drawImage(last.visible, 0, 0);
  state.backupCanvas = null;
});

$('#btnClear').addEventListener('click', () => {
  pushHistory();
  state.maskCtx.clearRect(0, 0, state.maskCanvas.width, state.maskCanvas.height);
  redrawSource();
  state.backupCanvas = null;
});

$('#btnNew').addEventListener('click', () => location.reload());

function redrawSource() {
  const src = state.mode === 'photo' ? state.originalImage : state.originalVideo;
  if (!src) return;
  state.workCtx.clearRect(0, 0, state.workCanvas.width, state.workCanvas.height);
  state.workCtx.drawImage(src, 0, 0, state.workCanvas.width, state.workCanvas.height);
}

/* ---------------- Brush UI ---------------- */
$('#brushSize').addEventListener('input', (e) => {
  state.brushSize = +e.target.value;
  $('#brushVal').textContent = state.brushSize;
});

$('#modePaint').addEventListener('click', () => {
  state.tool = 'paint';
  $('#modePaint').style.background = 'linear-gradient(135deg, rgba(124,92,255,0.3), rgba(77,171,255,0.3))';
  $('#modeErase').style.background = '';
});

$('#modeErase').addEventListener('click', () => {
  state.tool = 'erase';
  $('#modeErase').style.background = 'linear-gradient(135deg, rgba(124,92,255,0.3), rgba(77,171,255,0.3))';
  $('#modePaint').style.background = '';
});

/* ---------------- Quality picker ---------------- */
$$('.q-btn').forEach((b) => {
  b.addEventListener('click', () => {
    $$('.q-btn').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    state.quality = +b.dataset.q;
    const hints = {
      480:  '480p — fastest, lowest quality. Good for testing.',
      720:  '720p — fast, decent quality.',
      1080: '1080p — recommended. Best balance of speed and quality.',
      2160: '4K — slowest. Keeps full 4K resolution. May take minutes on long clips.',
      0:    'Original — keeps source resolution exactly as it is.'
    };
    $('#qualityHint').textContent = hints[state.quality];
  });
});

/* ---------------- Process ---------------- */
$('#btnProcess').addEventListener('click', async () => {
  if (!state.cvReady) { toast('Engine still loading…', 'warning'); return; }

  const maskData = state.maskCtx.getImageData(0, 0, state.maskCanvas.width, state.maskCanvas.height).data;
  let hasMark = false;
  for (let i = 3; i < maskData.length; i += 4) {
    if (maskData[i] > 10) { hasMark = true; break; }
  }
  if (!hasMark) { toast('Brush over the logo first ✏️', 'warning'); return; }

  if (state.mode === 'photo') await processPhoto();
  else await processVideo();
});

/* ---------------- Photo processing ---------------- */
async function processPhoto() {
  showOverlay('Removing logo…');
  try {
    await new Promise((r) => setTimeout(r, 50));
    const resultCanvas = inpaintCanvas(state.workCanvas, state.maskCanvas, 5);

    state.workCtx.clearRect(0, 0, state.workCanvas.width, state.workCanvas.height);
    state.workCtx.drawImage(resultCanvas, 0, 0);
    state.backupCanvas = null;

    const outCanvas = document.createElement('canvas');
    outCanvas.width = state.originalSourceW;
    outCanvas.height = state.originalSourceH;
    const octx = outCanvas.getContext('2d');
    octx.imageSmoothingEnabled = true;
    octx.imageSmoothingQuality = 'high';
    octx.drawImage(resultCanvas, 0, 0, outCanvas.width, outCanvas.height);

    outCanvas.toBlob((blob) => {
      state.resultBlob = blob;
      const url = URL.createObjectURL(blob);
      updateDownloadUI(url, 'logoGone.png', 'image/png');
      toast('Logo removed ✓', 'success');
    }, 'image/png');

    hideOverlay();
  } catch (e) {
    console.error(e);
    hideOverlay();
    toast('Processing failed: ' + e.message, 'error');
  }
}

/* ---------------- Core inpaint ---------------- */
function inpaintCanvas(sourceCanvas, maskCanvas, radius = 5) {
  const src  = cv.imread(sourceCanvas);
  const mask = cv.imread(maskCanvas);

  const gray = new cv.Mat();
  cv.cvtColor(mask, gray, cv.COLOR_RGBA2GRAY);
  cv.threshold(gray, gray, 10, 255, cv.THRESH_BINARY);

  const dst = new cv.Mat();
  cv.inpaint(src, gray, dst, radius, cv.INPAINT_TELEA);

  const out = document.createElement('canvas');
  out.width = sourceCanvas.width;
  out.height = sourceCanvas.height;
  cv.imshow(out, dst);

  src.delete(); mask.delete(); gray.delete(); dst.delete();
  return out;
}

/* ---------------- Video processing ---------------- */
async function processVideo() {
  const vid = state.originalVideo;
  if (!vid) return;

  showOverlay('Preparing video…');
  try {
    await new Promise((r) => setTimeout(r, 50));

    const srcW = state.originalSourceW;
    const srcH = state.originalSourceH;
    let targetW = srcW, targetH = srcH;

    if (state.quality !== 0) {
      const scale = state.quality / srcH;
      if (scale < 1) {
        targetW = Math.round(srcW * scale);
        targetH = Math.round(srcH * scale);
        targetW += targetW % 2;
        targetH += targetH % 2;
      }
    }

    const outCanvas = document.createElement('canvas');
    outCanvas.width = targetW;
    outCanvas.height = targetH;
    const outCtx = outCanvas.getContext('2d', { willReadFrequently: true });

    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = state.workCanvas.width;
    frameCanvas.height = state.workCanvas.height;
    const frameCtx = frameCanvas.getContext('2d', { willReadFrequently: true });

    const maskSrc = cv.imread(state.maskCanvas);
    const maskGray = new cv.Mat();
    cv.cvtColor(maskSrc, maskGray, cv.COLOR_RGBA2GRAY);
    cv.threshold(maskGray, maskGray, 10, 255, cv.THRESH_BINARY);
    maskSrc.delete();

    const stream = outCanvas.captureStream(30);

    let mimeType = 'video/webm;codecs=vp9';
    if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm;codecs=vp8';
    if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm';

    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond:
        state.quality === 2160 ? 45000000 :
        state.quality === 1080 ? 12000000 : 6000000
    });
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

    const recordingDone = new Promise((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
    });

    $('#progressCard').style.display = 'block';
    $('#progressLabel').textContent = 'Processing video…';
    setProgress(0);

    const duration = vid.duration;
    const fps = 30;
    const totalFrames = Math.max(1, Math.ceil(duration * fps));
    let frameIdx = 0;
    const startTime = performance.now();

    vid.pause();
    vid.currentTime = 0;
    await new Promise((r) => setTimeout(r, 100));

    recorder.start();

    for (let t = 0; t < duration; t += 1 / fps) {
      await seekTo(vid, t);
      frameCtx.clearRect(0, 0, frameCanvas.width, frameCanvas.height);
      frameCtx.drawImage(vid, 0, 0, frameCanvas.width, frameCanvas.height);

      const src = cv.imread(frameCanvas);
      const dst = new cv.Mat();
      cv.inpaint(src, maskGray, dst, 5, cv.INPAINT_TELEA);

      const tmp = document.createElement('canvas');
      tmp.width = frameCanvas.width;
      tmp.height = frameCanvas.height;
      cv.imshow(tmp, dst);

      outCtx.clearRect(0, 0, outCanvas.width, outCanvas.height);
      outCtx.drawImage(tmp, 0, 0, outCanvas.width, outCanvas.height);

      src.delete(); dst.delete();

      frameIdx++;
      if (frameIdx % 3 === 0 || t + (1 / fps) >= duration) {
        const pct = Math.min(100, (frameIdx / totalFrames) * 100);
        setProgress(pct);
        const elapsed = (performance.now() - startTime) / 1000;
        const eta = pct > 5 ? (elapsed / pct) * (100 - pct) : 0;
        $('#progressSub').textContent = `Frame ${frameIdx}/${totalFrames} · ETA ~${Math.round(eta)}s`;
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    await new Promise((r) => setTimeout(r, 300));

    recorder.stop();
    const blob = await recordingDone;
    maskGray.delete();

    state.resultBlob = blob;
    const url = URL.createObjectURL(blob);
    const ext = mimeType.includes('webm') ? 'webm' : 'mp4';
    updateDownloadUI(url, `logoGone.${ext}`, blob.type);

    $('#progressLabel').textContent = 'Done ✓';
    setProgress(100);
    $('#progressSub').textContent = `Output: ${targetW}×${targetH} · ${(blob.size / 1024 / 1024).toFixed(1)} MB`;
    hideOverlay();
    toast('Video processed ✓ Download below', 'success', 5000);
  } catch (e) {
    console.error(e);
    hideOverlay();
    toast('Video processing failed: ' + e.message, 'error', 6000);
  }
}

/* ---------------- Progress / Overlay ---------------- */
function setProgress(pct) {
  const clamped = Math.max(0, Math.min(100, pct));
  $('#progressFill').style.width = clamped + '%';
  $('#progressPct').textContent = Math.round(clamped) + '%';
}

function showOverlay(text) {
  $('#overlayText').textContent = text;
  $('#canvasOverlay').classList.add('show');
}
function hideOverlay() {
  $('#canvasOverlay').classList.remove('show');
}

/* ---------------- Download UI ---------------- */
function updateDownloadUI(url, filename) {
  const wrap = $('#downloadWrap');
  wrap.innerHTML = '';
  if (!url) return;
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'logoGone';
  a.className = 'btn btn-primary';
  a.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
    Download ${filename ? '(' + filename.split('.').pop().toUpperCase() + ')' : ''}
  `;
  wrap.appendChild(a);
}

/* ---------------- Before / After ---------------- */
let previewState = false;
$('#btnPreview').addEventListener('click', () => {
  if (!state.resultBlob) { toast('Process first to preview', 'info'); return; }
  previewState = !previewState;
  if (previewState) {
    redrawSource();
    toast('Showing original', 'info', 1500);
  } else {
    const url = URL.createObjectURL(state.resultBlob);
    const img = new Image();
    img.onload = () => {
      state.workCtx.clearRect(0, 0, state.workCanvas.width, state.workCanvas.height);
      state.workCtx.drawImage(img, 0, 0, state.workCanvas.width, state.workCanvas.height);
      URL.revokeObjectURL(url);
    };
    img.src = url;
    toast('Showing result', 'info', 1500);
  }
});

/* ---------------- Boot ---------------- */
$('#year').textContent = new Date().getFullYear();
$('#modePaint').style.background = 'linear-gradient(135deg, rgba(124,92,255,0.3), rgba(77,171,255,0.3))';

document.addEventListener('keydown', (e) => {
  if (e.key === 'z' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('#btnUndo').click(); }
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('#btnProcess').click(); }
});