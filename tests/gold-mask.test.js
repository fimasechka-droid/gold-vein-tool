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
assert.doesNotMatch(svg, /<image|data:image\/png/i, 'SVG must not contain raster image data');
assert.match(svg, /width="7" height="3" viewBox="0 0 7 3"/, 'SVG should preserve original dimensions');
assert.match(svg, /<rect x="0" y="0" width="7" height="3" fill="none" opacity="0" pointer-events="none"\/>/, 'SVG should include an invisible full-canvas bounds rectangle');
assert.match(svg, /<path d="M 3 0/, 'SVG path coordinates should remain in the original canvas coordinate space');

const sparseMask = {
  width: 10,
  height: 8,
  originalWidth: 10,
  originalHeight: 8,
  mask: new Uint8Array(80),
};
sparseMask.mask[6 * sparseMask.width + 8] = 1;
const sparseSvg = createSvg(sparseMask);
assert.match(sparseSvg, /width="10" height="8" viewBox="0 0 10 8"/, 'SVG should use the full source canvas rather than the vein bounding box');
assert.match(sparseSvg, /<rect x="0" y="0" width="10" height="8" fill="none" opacity="0" pointer-events="none"\/>/, 'empty canvas areas should remain transparent but preserved');

console.log('Gold vein processing tests passed.');
