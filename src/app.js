(function () {
  const upload = document.querySelector('#image-upload');
  const sensitivity = document.querySelector('#sensitivity');
  const sensitivityValue = document.querySelector('#sensitivity-value');
  const minFragment = document.querySelector('#min-fragment');
  const minFragmentValue = document.querySelector('#min-fragment-value');
  const status = document.querySelector('#status');
  const download = document.querySelector('#download');
  const originalCanvas = document.querySelector('#original-canvas');
  const maskCanvas = document.querySelector('#mask-canvas');
  const originalContext = originalCanvas.getContext('2d');
  const maskContext = maskCanvas.getContext('2d');
  let loadedImage = null;
  let currentFileName = 'gold-mask';

  function setCanvasSize(canvas, width, height) {
    canvas.width = width;
    canvas.height = height;
  }

  function updateOutputLabels() {
    sensitivityValue.value = sensitivity.value;
    minFragmentValue.value = minFragment.value;
  }

  function renderMask() {
    if (!loadedImage) return;
    setCanvasSize(originalCanvas, loadedImage.width, loadedImage.height);
    setCanvasSize(maskCanvas, loadedImage.width, loadedImage.height);
    originalContext.drawImage(loadedImage, 0, 0);

    const imageData = originalContext.getImageData(0, 0, originalCanvas.width, originalCanvas.height);
    const mask = window.GoldMask.createGoldMask(imageData, {
      sensitivity: Number(sensitivity.value),
      minFragmentSize: Number(minFragment.value),
    });
    const output = new ImageData(mask.data, mask.width, mask.height);
    maskContext.putImageData(output, 0, 0);
    status.textContent = `Mask generated: ${mask.detectedPixels.toLocaleString()} gold pixels detected.`;
    download.disabled = false;
  }

  function loadFile(file) {
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      status.textContent = 'Please choose a JPG or PNG image.';
      download.disabled = true;
      return;
    }

    currentFileName = file.name.replace(/\.[^.]+$/, '') || 'gold-mask';
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = function () {
      URL.revokeObjectURL(objectUrl);
      loadedImage = image;
      renderMask();
    };
    image.onerror = function () {
      URL.revokeObjectURL(objectUrl);
      status.textContent = 'The selected image could not be loaded.';
      download.disabled = true;
    };
    image.src = objectUrl;
  }

  upload.addEventListener('change', function (event) {
    loadFile(event.target.files[0]);
  });

  sensitivity.addEventListener('input', function () {
    updateOutputLabels();
    renderMask();
  });

  minFragment.addEventListener('input', function () {
    updateOutputLabels();
    renderMask();
  });

  download.addEventListener('click', function () {
    const link = document.createElement('a');
    link.download = `${currentFileName}-gold-mask.png`;
    link.href = maskCanvas.toDataURL('image/png');
    link.click();
  });

  updateOutputLabels();
})();
