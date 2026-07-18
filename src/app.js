(function () {
  const defaults = { mode: 'balanced', sensitivity: 58, connectGaps: 45, noiseCleanup: 45 };
  const upload = document.querySelector('#image-upload');
  const mode = document.querySelector('#processing-mode');
  const sensitivity = document.querySelector('#sensitivity');
  const connectGaps = document.querySelector('#connect-gaps');
  const noiseCleanup = document.querySelector('#noise-cleanup');
  const status = document.querySelector('#status');
  const reset = document.querySelector('#reset');
  const downloadPng = document.querySelector('#download-png');
  const downloadSvg = document.querySelector('#download-svg');
  const previewCanvas = document.querySelector('#preview-canvas');
  const maskCanvas = document.querySelector('#mask-canvas');
  const previewCaption = document.querySelector('#preview-caption');
  const previewModeButtons = Array.from(document.querySelectorAll('.preview-mode'));
  const zoomButtons = Array.from(document.querySelectorAll('.zoom-control'));
  const zoomValue = document.querySelector('#zoom-value');
  const previewViewports = Array.from(document.querySelectorAll('[data-preview-viewport]'));
  const zoomState = { mode: 'fit', scale: 1, panX: 0, panY: 0, isPanning: false, startX: 0, startY: 0, startPanX: 0, startPanY: 0 };
  const fixedZooms = [0.5, 1, 2, 4];
  let loadedImage = null;
  let currentResult = null;
  let currentPreview = 'original';
  let currentFileName = 'gold-veins';

  function setOutput(id, value) { document.querySelector(id).value = value; }
  function options() {
    return {
      mode: mode.value,
      sensitivity: Number(sensitivity.value),
      connectGaps: Number(connectGaps.value),
      noiseCleanup: Number(noiseCleanup.value),
    };
  }
  function updateLabels() {
    setOutput('#sensitivity-value', sensitivity.value);
    setOutput('#connect-gaps-value', connectGaps.value);
    setOutput('#noise-cleanup-value', noiseCleanup.value);
  }
  function imageDataFromImage(image) {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    return context.getImageData(0, 0, canvas.width, canvas.height);
  }
  function canvasList() { return [previewCanvas, maskCanvas]; }
  function fitScaleFor(canvas) {
    const viewport = canvas.parentElement;
    if (!canvas.width || !canvas.height || !viewport) return 1;
    return Math.min(viewport.clientWidth / canvas.width, viewport.clientHeight / canvas.height, 1);
  }
  function displayScale() { return zoomState.mode === 'fit' ? fitScaleFor(previewCanvas) : zoomState.scale; }
  function clampPan() {
    const scale = displayScale();
    const viewport = previewCanvas.parentElement;
    if (!viewport || !previewCanvas.width || !previewCanvas.height) return;
    const minX = Math.min(0, viewport.clientWidth - previewCanvas.width * scale);
    const minY = Math.min(0, viewport.clientHeight - previewCanvas.height * scale);
    zoomState.panX = Math.min(0, Math.max(minX, zoomState.panX));
    zoomState.panY = Math.min(0, Math.max(minY, zoomState.panY));
    if (previewCanvas.width * scale <= viewport.clientWidth) zoomState.panX = (viewport.clientWidth - previewCanvas.width * scale) / 2;
    if (previewCanvas.height * scale <= viewport.clientHeight) zoomState.panY = (viewport.clientHeight - previewCanvas.height * scale) / 2;
  }
  function applyZoom() {
    const scale = displayScale();
    clampPan();
    canvasList().forEach(function (canvas) {
      canvas.style.transform = `translate(${zoomState.panX}px, ${zoomState.panY}px) scale(${scale})`;
    });
    previewViewports.forEach(function (viewport) { viewport.classList.toggle('is-pannable', scale > fitScaleFor(previewCanvas)); });
    zoomValue.textContent = zoomState.mode === 'fit' ? `Fit (${Math.round(scale * 100)}%)` : `${Math.round(scale * 100)}%`;
    zoomButtons.forEach(function (button) { button.classList.toggle('is-active', button.dataset.zoom === zoomState.mode); });
  }
  function setZoom(nextMode, anchor) {
    const oldScale = displayScale();
    const viewport = previewCanvas.parentElement;
    const rect = viewport ? viewport.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
    const point = anchor || { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const imageX = (point.x - rect.left - zoomState.panX) / oldScale;
    const imageY = (point.y - rect.top - zoomState.panY) / oldScale;
    zoomState.mode = nextMode;
    zoomState.scale = nextMode === 'fit' ? zoomState.scale : Number(nextMode);
    const newScale = displayScale();
    zoomState.panX = point.x - rect.left - imageX * newScale;
    zoomState.panY = point.y - rect.top - imageY * newScale;
    applyZoom();
  }
  function resetZoom() { zoomState.mode = 'fit'; zoomState.panX = 0; zoomState.panY = 0; applyZoom(); }
  function renderPreview() {
    if (!loadedImage) return;
    if (currentPreview === 'mask' && currentResult) {
      window.GoldPreview.drawMask(previewCanvas, currentResult);
      previewCaption.textContent = 'Маска';
    } else if (currentPreview === 'overlay' && currentResult) {
      window.GoldPreview.drawOverlay(previewCanvas, loadedImage, currentResult);
      previewCaption.textContent = 'Наложение';
    } else {
      window.GoldPreview.drawOriginal(previewCanvas, loadedImage);
      previewCaption.textContent = 'Исходник';
    }
    if (currentResult) window.GoldPreview.drawMask(maskCanvas, currentResult);
    applyZoom();
  }
  function processImage() {
    if (!loadedImage) return;
    status.textContent = 'Обработка изображения…';
    const result = window.GoldProcessing.processVeins(imageDataFromImage(loadedImage), options());
    currentResult = result;
    renderPreview();
    downloadPng.disabled = false;
    downloadSvg.disabled = false;
    status.textContent = `Готово: найдено ${result.detectedPixels.toLocaleString('ru-RU')} пикселей прожилок.`;
  }
  function loadFile(file) {
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      status.textContent = 'Выберите изображение JPG или PNG.';
      downloadPng.disabled = true;
      downloadSvg.disabled = true;
      return;
    }
    currentFileName = file.name.replace(/\.[^.]+$/, '') || 'gold-veins';
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = function () {
      URL.revokeObjectURL(objectUrl);
      loadedImage = image;
      resetZoom();
      processImage();
    };
    image.onerror = function () {
      URL.revokeObjectURL(objectUrl);
      status.textContent = 'Не удалось загрузить выбранное изображение.';
    };
    image.src = objectUrl;
  }
  function resetSettings() {
    mode.value = defaults.mode;
    sensitivity.value = defaults.sensitivity;
    connectGaps.value = defaults.connectGaps;
    noiseCleanup.value = defaults.noiseCleanup;
    updateLabels();
    processImage();
  }

  upload.addEventListener('change', function (event) { loadFile(event.target.files[0]); });
  [mode, sensitivity, connectGaps, noiseCleanup].forEach(function (control) {
    control.addEventListener('input', function () { updateLabels(); processImage(); });
  });
  reset.addEventListener('click', resetSettings);
  zoomButtons.forEach(function (button) {
    button.addEventListener('click', function () { setZoom(button.dataset.zoom); });
  });
  previewViewports.forEach(function (viewport) {
    viewport.addEventListener('wheel', function (event) {
      if (!previewCanvas.width) return;
      event.preventDefault();
      const current = displayScale();
      const direction = event.deltaY < 0 ? 1 : -1;
      const target = fixedZooms.reduce(function (selected, value) {
        if (direction > 0 && value > current + 0.01 && selected === current) return value;
        if (direction < 0 && value < current - 0.01) return value;
        return selected;
      }, current * (direction > 0 ? 1.25 : 0.8));
      const minimumScale = Math.min(fitScaleFor(previewCanvas), 0.5);
      setZoom(String(Math.min(4, Math.max(minimumScale, target))), { x: event.clientX, y: event.clientY });
    }, { passive: false });
    viewport.addEventListener('pointerdown', function (event) {
      if (displayScale() <= fitScaleFor(previewCanvas)) return;
      zoomState.isPanning = true;
      zoomState.startX = event.clientX;
      zoomState.startY = event.clientY;
      zoomState.startPanX = zoomState.panX;
      zoomState.startPanY = zoomState.panY;
      viewport.classList.add('is-panning');
      viewport.setPointerCapture(event.pointerId);
    });
    viewport.addEventListener('pointermove', function (event) {
      if (!zoomState.isPanning) return;
      zoomState.panX = zoomState.startPanX + event.clientX - zoomState.startX;
      zoomState.panY = zoomState.startPanY + event.clientY - zoomState.startY;
      applyZoom();
    });
    ['pointerup', 'pointercancel'].forEach(function (type) {
      viewport.addEventListener(type, function (event) {
        zoomState.isPanning = false;
        viewport.classList.remove('is-panning');
        if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
      });
    });
  });
  window.addEventListener('resize', applyZoom);
  previewModeButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      currentPreview = button.dataset.preview;
      previewModeButtons.forEach(function (item) { item.classList.toggle('is-active', item === button); });
      renderPreview();
    });
  });
  downloadPng.addEventListener('click', function () {
    if (currentResult) window.GoldExporters.downloadTransparentPng(currentResult, `${currentFileName}-prozhilki.png`);
  });
  downloadSvg.addEventListener('click', function () {
    if (currentResult) window.GoldExporters.downloadSvg(currentResult, `${currentFileName}-prozhilki.svg`);
  });

  updateLabels();
})();
