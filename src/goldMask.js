(function (global) {
  function ensureProcessing() {
    if (!global.GoldProcessing && typeof require !== 'undefined') {
      global.GoldProcessing = require('./processing');
    }
    return global.GoldProcessing;
  }

  function createGoldMask(imageData, options) {
    const processing = ensureProcessing();
    const result = processing.processVeins(imageData, {
      sensitivity: options?.sensitivity,
      noiseCleanup: options?.minFragmentSize ?? options?.noiseCleanup,
      connectGaps: options?.connectGaps ?? 0,
      mode: options?.mode || 'balanced',
    });
    return {
      width: result.width,
      height: result.height,
      data: result.previewImageData.data,
      detectedPixels: result.detectedPixels,
    };
  }

  function isGoldPixel(r, g, b, sensitivity) {
    const processing = ensureProcessing();
    const threshold = 0.72 - Math.min(100, Math.max(0, sensitivity ?? 58)) * 0.0046;
    return processing.goldProbabilityForPixel(r, g, b) >= threshold;
  }

  const api = { createGoldMask, isGoldPixel };
  global.GoldMask = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
