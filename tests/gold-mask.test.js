const assert = require('node:assert/strict');
const { processVeins, goldProbabilityForPixel } = require('../src/processing');
const { createSvg, traceMask, fitContour } = require('../src/exporters');

function imageData(width, height, pixels) {
  return { width, height, data: new Uint8ClampedArray(pixels.flat()) };
}
function px(r, g, b, a = 255) { return [r, g, b, a]; }

function pointSegmentDistance(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  if (!dx && !dy) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point[0] - (start[0] + t * dx), point[1] - (start[1] + t * dy));
}

function distanceToContour(point, contour) {
  let best = Infinity;
  for (let i = 0; i < contour.length - 1; i += 1) {
    best = Math.min(best, pointSegmentDistance(point, contour[i], contour[i + 1]));
  }
  return best;
}

function assertNearSourceBoundary(fitted, raw, maxDistance) {
  fitted.slice(0, -1).forEach(function (point) {
    assert.ok(distanceToContour(point, raw) <= maxDistance, `fitted point ${point.join(',')} should stay within ${maxDistance}px of the source boundary`);
  });
}

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

let svg;
assert.doesNotThrow(function () {
  svg = createSvg(veinResult);
}, ReferenceError, 'createSvg should complete without referencing deleted contour functions');
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
const diagonalRawContour = traceMask(diagonalMask.mask, diagonalMask.width, diagonalMask.height)[0];
const diagonalFittedContour = fitContour(diagonalRawContour, 0.9);
const diagonalSvg = createSvg(diagonalMask);
assert.match(diagonalSvg, / C /, 'diagonal shapes should export with smoothed cubic curve segments instead of only axis-aligned lines');
assert.doesNotMatch(diagonalSvg, /(?: [LQ] \d+(?:\.\d+)? \d+(?:\.\d+)?){8,}/, 'diagonal shape should not export as a purely line-based staircase');
assert.ok(diagonalFittedContour.length <= 6, 'staircase contour should be reduced to a small set of significant vertices');
assert.ok(diagonalRawContour.length > diagonalFittedContour.length * 4, 'fitted contour should ignore intermediate pixel-step vertices');
assert.deepEqual(diagonalFittedContour.slice(0, -1).map(function (point) { return point.join(','); }), ['0,0', '2,0', '6,5', '4,5'], 'fitted contour should retain the main peaks and valleys of the diagonal shape');
assert.ok((diagonalSvg.match(/ C /g) || []).length < 8, 'diagonal contour should be fitted to fewer curves than the source pixel stair steps');
assertNearSourceBoundary(diagonalFittedContour, diagonalRawContour, 1.15);


const longStairMask = {
  width: 12,
  height: 8,
  mask: new Uint8Array([
    1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  ]),
};
const longStairRawContour = traceMask(longStairMask.mask, longStairMask.width, longStairMask.height)[0];
const longStairFittedContour = fitContour(longStairRawContour, 1.15);
const longStairSvg = createSvg(longStairMask);
assert.ok(longStairFittedContour.length <= 6, 'long stair-stepped edges should collapse to the main contour turns');
assert.ok(longStairRawContour.length > longStairFittedContour.length * 5, 'long stair-stepped edges should drop unnecessary pixel-step vertices');
assertNearSourceBoundary(longStairFittedContour, longStairRawContour, 1.15);
assert.match(longStairSvg, /C 2\.319 0\.279 7\.881 6\.792 8 7/, 'long diagonal stair-step should use relaxed Bézier handles for a gentler contour');


const zigzagMask = {
  width: 9,
  height: 5,
  mask: new Uint8Array([
    1, 1, 0, 0, 0, 0, 0, 0, 0,
    0, 1, 1, 0, 0, 0, 0, 0, 0,
    0, 0, 1, 1, 0, 0, 0, 0, 0,
    0, 0, 0, 1, 1, 1, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0,
  ]),
};
const zigzagRawContour = traceMask(zigzagMask.mask, zigzagMask.width, zigzagMask.height)[0];
const zigzagFittedContour = fitContour(zigzagRawContour, 1.15);
assert.ok(zigzagFittedContour.length <= 6, 'short alternating pixel zigzags should be removed from a diagonal run');
assertNearSourceBoundary(zigzagFittedContour, zigzagRawContour, 1.15);


const branchMask = {
  width: 5,
  height: 5,
  mask: new Uint8Array([
    0, 0, 1, 0, 0,
    0, 0, 1, 0, 0,
    1, 1, 1, 1, 1,
    0, 0, 1, 0, 0,
    0, 0, 1, 0, 0,
  ]),
};
const branchContour = fitContour(traceMask(branchMask.mask, branchMask.width, branchMask.height)[0], 1.15);
const branchPoints = new Set(branchContour.map(function (point) { return point.join(','); }));
assert.ok(branchPoints.has('2,0') || branchPoints.has('3,0'), 'thin vertical branch tip should remain after contour fitting');
assert.ok(branchPoints.has('0,2') || branchPoints.has('0,3'), 'thin horizontal branch tip should remain after contour fitting');
assert.equal(branchContour[0].join(','), branchContour[branchContour.length - 1].join(','), 'thin branch contour should remain closed');


const peakValleyMask = {
  width: 7,
  height: 5,
  mask: new Uint8Array([
    0, 0, 0, 1, 0, 0, 0,
    0, 0, 1, 1, 1, 0, 0,
    0, 1, 1, 1, 1, 1, 0,
    1, 1, 1, 1, 1, 1, 1,
    0, 0, 0, 0, 0, 0, 0,
  ]),
};
const peakValleyContour = fitContour(traceMask(peakValleyMask.mask, peakValleyMask.width, peakValleyMask.height)[0], 1.15);
const peakValleyPoints = new Set(peakValleyContour.map(function (point) { return point.join(','); }));
assert.ok(peakValleyPoints.has('3,0'), 'meaningful pointed peak should remain after contour fitting');
assert.ok(peakValleyPoints.has('0,4') || peakValleyPoints.has('7,3'), 'meaningful valley/base direction change should remain after contour fitting');

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
traceMask(donutMask.mask, donutMask.width, donutMask.height).map(function (contour) { return fitContour(contour, 1.15); }).forEach(function (contour) {
  assert.equal(contour[0].join(','), contour[contour.length - 1].join(','), 'outer and hole contours should remain closed after fitting');
});

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
