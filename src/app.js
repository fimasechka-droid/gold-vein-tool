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
