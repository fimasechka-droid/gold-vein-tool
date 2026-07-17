(function (global) {
  function drawOriginal(canvas, image) {
    const context = canvas.getContext('2d');
    canvas.width = image.width;
    canvas.height = image.height;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);
  }

  function drawMask(canvas, maskResult) {
    const context = canvas.getContext('2d');
    canvas.width = maskResult.width;
    canvas.height = maskResult.height;
    context.putImageData(new ImageData(maskResult.previewImageData.data, maskResult.width, maskResult.height), 0, 0);
  }

  function drawOverlay(canvas, image, maskResult) {
    const context = canvas.getContext('2d');
    canvas.width = image.width;
    canvas.height = image.height;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);
    const overlay = new Uint8ClampedArray(maskResult.width * maskResult.height * 4);
    for (let i = 0, target = 0; i < maskResult.mask.length; i += 1, target += 4) {
      if (maskResult.mask[i]) {
        overlay[target] = 0;
        overlay[target + 1] = 0;
        overlay[target + 2] = 0;
        overlay[target + 3] = 175;
      }
    }
    context.putImageData(new ImageData(overlay, maskResult.width, maskResult.height), 0, 0);
  }

  const api = { drawOriginal, drawMask, drawOverlay };
  global.GoldPreview = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
