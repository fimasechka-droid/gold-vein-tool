const assert = require('node:assert/strict');
const { createGoldMask, isGoldPixel } = require('../src/goldMask');

function imageData(width, height, pixels) {
  return { width, height, data: new Uint8ClampedArray(pixels.flat()) };
}

assert.equal(isGoldPixel(218, 166, 52, 55), true, 'warm metallic gold should be detected');
assert.equal(isGoldPixel(25, 26, 28, 55), false, 'neutral dark colors should not be detected');
assert.equal(isGoldPixel(230, 230, 230, 80), false, 'white paper/background should not be detected');

const sample = imageData(3, 2, [
  [220, 170, 40, 255], [225, 176, 58, 255], [245, 245, 240, 255],
  [32, 30, 35, 255], [210, 160, 42, 255], [40, 80, 170, 255],
]);
const mask = createGoldMask(sample, { sensitivity: 55, minFragmentSize: 1 });
assert.equal(mask.detectedPixels, 3, 'three gold pixels should be detected');
assert.deepEqual(Array.from(mask.data.slice(0, 12)), [0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255, 255]);

const filtered = createGoldMask(sample, { sensitivity: 55, minFragmentSize: 4 });
assert.equal(filtered.detectedPixels, 0, 'small disconnected fragments should be removed');

const lenient = createGoldMask(imageData(1, 1, [[130, 100, 55, 255]]), { sensitivity: 100, minFragmentSize: 1 });
const strict = createGoldMask(imageData(1, 1, [[130, 100, 55, 255]]), { sensitivity: 0, minFragmentSize: 1 });
assert.equal(lenient.detectedPixels, 1, 'higher sensitivity should include muted gold');
assert.equal(strict.detectedPixels, 0, 'lower sensitivity should exclude muted gold');

console.log('Gold mask detection tests passed.');
