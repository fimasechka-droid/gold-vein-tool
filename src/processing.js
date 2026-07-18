(function (global) {
  function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

  function rgbToHsv(r, g, b) {
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
    const delta = max - min;
    let hue = 0;
    if (delta) {
      if (max === rn) hue = ((gn - bn) / delta) % 6;
      else if (max === gn) hue = (bn - rn) / delta + 2;
      else hue = (rn - gn) / delta + 4;
      hue *= 60;
      if (hue < 0) hue += 360;
    }
    return { hue, saturation: max === 0 ? 0 : delta / max, value: max };
  }

  function goldProbabilityForPixel(r, g, b) {
    const hsv = rgbToHsv(r, g, b);
    const sum = Math.max(1, r + g + b);
    const rn = r / sum, gn = g / sum, bn = b / sum;
    const hueDistance = Math.min(Math.abs(hsv.hue - 43), 360 - Math.abs(hsv.hue - 43));
    const hueScore = clamp(1 - hueDistance / 58, 0, 1);
    const saturationScore = clamp((hsv.saturation - 0.12) / 0.48, 0, 1);
    const brightnessScore = clamp((hsv.value - 0.24) / 0.58, 0, 1);
    const warmthScore = clamp(((r - b) / 255 - 0.06) / 0.42, 0, 1);
    const yellowScore = clamp(((r + g) / 2 - b - 12) / 120, 0, 1);
    const balanceScore = clamp(1 - Math.abs(rn - gn) / 0.17, 0, 1);
    const bluePenalty = clamp(1 - bn / 0.34, 0, 1);
    const highlightScore = clamp((Math.max(r, g, b) - Math.min(r, g, b) - 18) / 95, 0, 1);

    return clamp(
      hueScore * 0.24 + saturationScore * 0.16 + brightnessScore * 0.12 +
      warmthScore * 0.18 + yellowScore * 0.16 + balanceScore * 0.06 +
      bluePenalty * 0.04 + highlightScore * 0.04,
      0,
      1,
    );
  }

  function createProbabilityMap(imageData) {
    const { width, height, data } = imageData;
    const probability = new Float32Array(width * height);
    for (let pixel = 0, source = 0; pixel < probability.length; pixel += 1, source += 4) {
      probability[pixel] = goldProbabilityForPixel(data[source], data[source + 1], data[source + 2]);
    }
    return probability;
  }

  function thresholdProbability(probability, width, height, options) {
    const sensitivity = clamp(options.sensitivity ?? 58, 0, 100);
    const base = 0.72 - sensitivity * 0.0046;
    const strongThreshold = clamp(base + 0.12, 0.22, 0.86);
    const weakThreshold = clamp(base - 0.08, 0.16, 0.74);
    const strong = new Uint8Array(probability.length);
    const weak = new Uint8Array(probability.length);
    const output = new Uint8Array(probability.length);
    const queue = [];

    for (let index = 0; index < probability.length; index += 1) {
      if (probability[index] >= strongThreshold) {
        strong[index] = 1;
        weak[index] = 1;
        output[index] = 1;
        queue.push(index);
      } else if (probability[index] >= weakThreshold) {
        weak[index] = 1;
      }
    }

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor];
      const x = index % width;
      const y = Math.floor(index / width);
      forEachNeighbor8(x, y, width, height, function (next) {
        if (weak[next] && !output[next]) {
          output[next] = 1;
          queue.push(next);
        }
      });
    }

    return output;
  }

  function forEachNeighbor8(x, y, width, height, visit) {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < width && ny < height) visit(ny * width + nx, nx, ny);
      }
    }
  }

  function dilate(mask, width, height, radius) {
    if (radius <= 0) return new Uint8Array(mask);
    const output = new Uint8Array(mask.length);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let found = false;
        for (let dy = -radius; dy <= radius && !found; dy += 1) {
          for (let dx = -radius; dx <= radius; dx += 1) {
            if (dx * dx + dy * dy > radius * radius) continue;
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < width && ny < height && mask[ny * width + nx]) {
              found = true;
              break;
            }
          }
        }
        output[y * width + x] = found ? 1 : 0;
      }
    }
    return output;
  }

  function erode(mask, width, height, radius) {
    if (radius <= 0) return new Uint8Array(mask);
    const output = new Uint8Array(mask.length);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let keep = true;
        for (let dy = -radius; dy <= radius && keep; dy += 1) {
          for (let dx = -radius; dx <= radius; dx += 1) {
            if (dx * dx + dy * dy > radius * radius) continue;
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height || !mask[ny * width + nx]) {
              keep = false;
              break;
            }
          }
        }
        output[y * width + x] = keep ? 1 : 0;
      }
    }
    return output;
  }

  function closeGaps(mask, width, height, connectGaps) {
    const radius = Math.round((clamp(connectGaps, 0, 100) / 100) * 2);
    if (radius <= 0) return new Uint8Array(mask);
    return erode(dilate(mask, width, height, radius), width, height, Math.max(1, radius - 1));
  }

  function cleanupComponents(mask, probability, width, height, noiseCleanup) {
    const minArea = Math.round(5 + clamp(noiseCleanup, 0, 100) * 0.22);
    const output = new Uint8Array(mask.length);
    const visited = new Uint8Array(mask.length);
    const queue = [];
    const component = [];

    for (let start = 0; start < mask.length; start += 1) {
      if (!mask[start] || visited[start]) continue;
      queue.length = 0;
      component.length = 0;
      queue.push(start);
      visited[start] = 1;
      let minX = width, minY = height, maxX = 0, maxY = 0, score = 0;

      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const index = queue[cursor];
        const x = index % width;
        const y = Math.floor(index / width);
        component.push(index);
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        score += probability[index] || 0;
        forEachNeighbor8(x, y, width, height, function (next) {
          if (mask[next] && !visited[next]) {
            visited[next] = 1;
            queue.push(next);
          }
        });
      }

      const span = Math.max(maxX - minX + 1, maxY - minY + 1);
      const thinDecorative = span >= 5 && component.length >= Math.max(2, minArea * 0.35);
      const confident = score / component.length > 0.66 && component.length >= Math.max(2, minArea * 0.45);
      const keep = component.length >= minArea || thinDecorative || confident;
      if (keep) for (const index of component) output[index] = 1;
    }

    return output;
  }

  function keepNearbyRawPixels(cleanMask, rawMask, width, height) {
    const grown = dilate(cleanMask, width, height, 2);
    const output = new Uint8Array(cleanMask);
    for (let index = 0; index < rawMask.length; index += 1) {
      if (rawMask[index] && grown[index]) output[index] = 1;
    }
    return output;
  }

  function maskToImageData(mask, width, height, transparent) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0, target = 0; i < mask.length; i += 1, target += 4) {
      if (mask[i]) {
        data[target] = 0; data[target + 1] = 0; data[target + 2] = 0; data[target + 3] = 255;
      } else {
        data[target] = transparent ? 0 : 255;
        data[target + 1] = transparent ? 0 : 255;
        data[target + 2] = transparent ? 0 : 255;
        data[target + 3] = transparent ? 0 : 255;
      }
    }
    return { width, height, data };
  }

  function processVeins(imageData, options) {
    const opts = options || {};
    const { width, height } = imageData;
    const probability = createProbabilityMap(imageData);
    const rawMask = thresholdProbability(probability, width, height, opts);
    const connectedMask = closeGaps(rawMask, width, height, opts.connectGaps ?? 45);
    const cleanMask = cleanupComponents(connectedMask, probability, width, height, opts.noiseCleanup ?? 45);
    const finalMask = keepNearbyRawPixels(cleanMask, rawMask, width, height);
    const detectedPixels = finalMask.reduce((sum, value) => sum + value, 0);
    return {
      width,
      height,
      originalWidth: width,
      originalHeight: height,
      probability,
      rawMask,
      mask: finalMask,
      detectedPixels,
      previewImageData: maskToImageData(finalMask, width, height, false),
      transparentImageData: maskToImageData(finalMask, width, height, true),
    };
  }

  const api = { processVeins, createProbabilityMap, goldProbabilityForPixel, maskToImageData, dilate, erode, cleanupComponents };
  global.GoldProcessing = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
