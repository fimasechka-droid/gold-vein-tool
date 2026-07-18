const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('index.html', 'utf8');
const app = fs.readFileSync('src/app.js', 'utf8');
const exporters = fs.readFileSync('src/exporters.js', 'utf8');

['Режим обработки', 'Тонкие прожилки', 'Прожилки + брызги', 'Крупные металлические фрагменты', 'Чувствительность к золоту', 'Соединение разрывов', 'Очистка шума', 'Сбросить настройки', 'Исходник', 'Маска', 'Наложение', 'Скачать PNG', 'Скачать SVG'].forEach((text) => {
  assert.ok(html.includes(text), `Russian UI should include: ${text}`);
});
assert.doesNotMatch(html, /Original image|Gold color sensitivity|Download mask|Minimum fragment|Overlay|Processing mode/, 'visible UI should not keep old English labels');
assert.doesNotMatch(html, /Сглаживание вектора|vector-smoothing/, 'vector smoothing control should be removed');
assert.doesNotMatch(app, /vectorSmoothing|vector-smoothing/, 'app should not keep vector smoothing state or handlers');
assert.match(html, /type="file" accept="image\/png,image\/jpeg"/, 'upload should accept JPG and PNG');
assert.match(app, /GoldProcessing\.processVeins/, 'app should use the v2 processing pipeline');
assert.match(app, /downloadTransparentPng/, 'app should export transparent PNG');
assert.match(app, /downloadSvg/, 'app should export SVG');
assert.match(exporters, /<path d=/, 'SVG exporter should generate vector paths');
assert.doesNotMatch(exporters, /data:image\/png.*svg|<image/i, 'SVG exporter should not embed raster images');

console.log('Prototype Russian UI and export wiring tests passed.');
