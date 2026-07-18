const assert = require('node:assert/strict');
const { processVeins, goldProbabilityForPixel } = require('../src/processing');
const { createSvg, traceMask } = require('../src/exporters');

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
assert.match(svg, /<g id="registration-marks" stroke="black" stroke-width="1" fill="none" stroke-linecap="square">/, 'SVG should include selectable registration marks');
assert.match(svg, /<path d="M /, 'SVG path coordinates should remain in the original canvas coordinate space');
assert.match(svg, / C /, 'SVG should use smooth cubic Bézier path segments');


const diagonalMask = {
  width: 6,
  height: 6,
  mask: new Uint8Array([
    1, 1, 0, 0, 0, 0,
    0, 1, 1, 0, 0, 0,
    0, 0, 1, 1, 0, 0,
    0, 0, 0, 1, 1, 0,
    0, 0, 0, 0, 1, 1,
    0, 0, 0, 0, 0, 0,
  ]),
};
const diagonalSvg = createSvg(diagonalMask);
assert.match(diagonalSvg, / C /, 'diagonal shapes should export with smoothed cubic curve segments instead of only axis-aligned lines');
assert.doesNotMatch(diagonalSvg, /(?: [LQ] \d+(?:\.\d+)? \d+(?:\.\d+)?){8,}/, 'diagonal shape should not export as a purely line-based staircase');
assert.ok((diagonalSvg.match(/ C /g) || []).length < 12, 'diagonal contour should be fitted to fewer curves than the source pixel stair steps');

const donutMask = {
  width: 5,
  height: 5,
  mask: new Uint8Array([
    1, 1, 1, 1, 1,
    1, 0, 0, 0, 1,
    1, 0, 0, 0, 1,
    1, 0, 0, 0, 1,
    1, 1, 1, 1, 1,
  ]),
};
const donutSvg = createSvg(donutMask);
assert.match(donutSvg, /fill-rule="evenodd"/, 'compound SVG path should preserve holes as holes');
assert.ok((donutSvg.match(/M /g) || []).length >= 2, 'hole contour should be retained as its own subpath');

const disconnectedMask = {
  width: 6,
  height: 3,
  mask: new Uint8Array([
    1, 1, 0, 0, 1, 1,
    1, 1, 0, 0, 1, 1,
    0, 0, 0, 0, 0, 0,
  ]),
};
assert.equal(traceMask(disconnectedMask.mask, disconnectedMask.width, disconnectedMask.height).length, 2, 'disconnected objects should remain separate contours');

const sparseMask = {
  width: 20,
  height: 18,
  originalWidth: 20,
  originalHeight: 18,
  mask: new Uint8Array(360),
};
sparseMask.mask[14 * sparseMask.width + 17] = 1;
const sparseSvg = createSvg(sparseMask);
assert.match(sparseSvg, /width="20" height="18" viewBox="0 0 20 18"/, 'SVG should use the full source canvas rather than the vein bounding box');
[
  ['2', '5', '8', '5'],
  ['5', '2', '5', '8'],
  ['12', '5', '18', '5'],
  ['15', '2', '15', '8'],
  ['2', '13', '8', '13'],
  ['5', '10', '5', '16'],
  ['12', '13', '18', '13'],
  ['15', '10', '15', '16'],
].forEach(function (coords) {
  assert.match(
    sparseSvg,
    new RegExp(`<line x1="${coords[0]}" y1="${coords[1]}" x2="${coords[2]}" y2="${coords[3]}"\\/>`),
    `registration mark line should exist at ${coords.join(',')}`,
  );
});

console.log('Gold vein processing tests passed.');
