const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('index.html', 'utf8');
const app = fs.readFileSync('src/app.js', 'utf8');

assert.match(html, /type="file" accept="image\/png,image\/jpeg"/, 'upload should accept one JPG or PNG file');
assert.match(html, /id="original-canvas"/, 'original preview canvas should exist');
assert.match(html, /id="mask-canvas"/, 'mask preview canvas should exist');
assert.match(html, /id="sensitivity" type="range"/, 'sensitivity range control should exist');
assert.match(html, /id="min-fragment" type="range"/, 'minimum fragment range control should exist');
assert.match(html, /id="download"/, 'download button should exist');
assert.match(app, /GoldMask\.createGoldMask/, 'app should generate masks through the detector');
assert.match(app, /toDataURL\('image\/png'\)/, 'download should export a PNG data URL');
assert.match(app, /drawImage\(loadedImage/, 'app should render the original upload preview');
assert.match(app, /putImageData\(output/, 'app should render the generated mask preview');

console.log('Prototype file wiring tests passed.');
