const assert = require('node:assert/strict');
const { processVeins, goldProbabilityForPixel } = require('../src/processing');
const { createSvg } = require('../src/exporters');

function imageData(width, height, pixels) {
  return { width, height, data: new Uint8ClampedArray(pixels.flat()) };
}
function px(r, g, b, a = 255) { return [r, g, b, a]; }

assert.ok(goldProbabilityForPixel(218, 166, 52) > goldProbabilityForPixel(230, 230, 230), 'gold should score above white');
assert.ok(goldProbabilityForPixel(218, 166, 52) > goldProbabilityForPixel(35, 40, 80), 'gold should score above blue/dark color');

const thinVein = imageData(7, 3, [
  px(245,245,245), px(245,245,245), px(245,245,245), px(220,170,45), px(245,245,245), px(245,245,245), px(245,245,245),
  px(245,245,245), px(220,170,45), px(220,170,45), px(221,171,46), px(220,170,45), px(220,170,45), px(245,245,245),
  px(245,245,245), px(245,245,245), px(245,245,245), px(220,170,45), px(245,245,245), px(245,245,245), px(245,245,245),
]);
const veinResult = processVeins(thinVein, { mode: 'fine', sensitivity: 55, connectGaps: 35, noiseCleanup: 20 });
assert.ok(veinResult.detectedPixels >= 7, 'thin connected veins should be preserved');

const noisy = imageData(6, 4, [
  px(245,245,245), px(218,166,52), px(245,245,245), px(245,245,245), px(245,245,245), px(245,245,245),
  px(245,245,245), px(245,245,245), px(245,245,245), px(218,166,52), px(218,166,52), px(218,166,52),
  px(245,245,245), px(245,245,245), px(245,245,245), px(218,166,52), px(218,166,52), px(218,166,52),
  px(245,245,245), px(245,245,245), px(245,245,245), px(218,166,52), px(218,166,52), px(218,166,52),
]);
const clean = processVeins(noisy, { mode: 'balanced', sensitivity: 55, connectGaps: 0, noiseCleanup: 20 });
assert.equal(clean.mask[1], 0, 'isolated warm noise should be removed');
assert.ok(clean.detectedPixels >= 9, 'larger metallic fragments should remain');

for (let i = 0; i < veinResult.mask.length; i += 1) {
  if (!veinResult.mask[i]) assert.equal(veinResult.transparentImageData.data[i * 4 + 3], 0, 'PNG background must be transparent');
}

const svg = createSvg(veinResult);
assert.match(svg, /^<svg /, 'SVG should be generated');
assert.match(svg, /<path /, 'SVG should contain vector paths');
assert.doesNotMatch(svg, /<image|data:image\/png|<rect/i, 'SVG must not contain raster image or background rectangle');
assert.match(svg, /viewBox="0 0 7 3"/, 'SVG should preserve original dimensions');

console.log('Gold vein processing tests passed.');
