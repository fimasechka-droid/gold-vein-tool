(function (global) {
  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function isGoldPixel(r, g, b, sensitivity) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const chroma = max - min;
    const brightness = max / 255;
    const warmLead = r - b;
    const greenSupport = g - b;
    const redGreenBalance = Math.abs(r - g);
    const saturation = max === 0 ? 0 : chroma / max;
    const strictness = 1 - clamp(sensitivity, 0, 100) / 100;

    const minBrightness = 0.28 + strictness * 0.25;
    const minWarmLead = 18 + strictness * 40;
    const minGreenSupport = 8 + strictness * 28;
    const maxBalance = 95 - strictness * 35;
    const minSaturation = 0.16 + strictness * 0.16;

    return brightness >= minBrightness &&
      warmLead >= minWarmLead &&
      greenSupport >= minGreenSupport &&
      redGreenBalance <= maxBalance &&
      saturation >= minSaturation;
  }

  function removeSmallFragments(mask, width, height, minFragmentSize) {
    const minimum = Math.max(0, Math.floor(minFragmentSize));
    if (minimum <= 1) return mask;

    const output = new Uint8Array(mask);
    const visited = new Uint8Array(mask.length);
    const queue = [];
    const component = [];

    for (let start = 0; start < mask.length; start += 1) {
      if (!mask[start] || visited[start]) continue;
      queue.length = 0;
      component.length = 0;
      queue.push(start);
      visited[start] = 1;

      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const index = queue[cursor];
        component.push(index);
        const x = index % width;
        const y = Math.floor(index / width);
        const neighbors = [index - 1, index + 1, index - width, index + width];

        for (const next of neighbors) {
          if (next < 0 || next >= mask.length || visited[next] || !mask[next]) continue;
          const nx = next % width;
          const ny = Math.floor(next / width);
          if (Math.abs(nx - x) + Math.abs(ny - y) !== 1) continue;
          visited[next] = 1;
          queue.push(next);
        }
      }

      if (component.length < minimum) {
        for (const index of component) output[index] = 0;
      }
    }

    return output;
  }

  function createGoldMask(imageData, options) {
    const sensitivity = options && Number.isFinite(options.sensitivity) ? options.sensitivity : 55;
    const minFragmentSize = options && Number.isFinite(options.minFragmentSize) ? options.minFragmentSize : 24;
    const { width, height, data } = imageData;
    const rawMask = new Uint8Array(width * height);

    for (let pixel = 0, source = 0; pixel < rawMask.length; pixel += 1, source += 4) {
      rawMask[pixel] = isGoldPixel(data[source], data[source + 1], data[source + 2], sensitivity) ? 1 : 0;
    }

    const cleanMask = removeSmallFragments(rawMask, width, height, minFragmentSize);
    const maskData = new Uint8ClampedArray(width * height * 4);

    for (let pixel = 0, target = 0; pixel < cleanMask.length; pixel += 1, target += 4) {
      const value = cleanMask[pixel] ? 0 : 255;
      maskData[target] = value;
      maskData[target + 1] = value;
      maskData[target + 2] = value;
      maskData[target + 3] = 255;
    }

    return { width, height, data: maskData, detectedPixels: cleanMask.reduce((sum, value) => sum + value, 0) };
  }

  global.GoldMask = { createGoldMask, isGoldPixel, removeSmallFragments };
  if (typeof module !== 'undefined') module.exports = global.GoldMask;
})(typeof window !== 'undefined' ? window : globalThis);
