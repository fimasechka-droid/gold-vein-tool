const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('index.html', 'utf8');
const app = fs.readFileSync('src/app.js', 'utf8');
const exporters = fs.readFileSync('src/exporters.js', 'utf8');
const styles = fs.readFileSync('src/styles.css', 'utf8');

['Режим обработки', 'Тонкие прожилки', 'Прожилки + брызги', 'Крупные металлические фрагменты', 'Чувствительность к золоту', 'Соединение разрывов', 'Очистка шума', 'Сбросить настройки', 'Исходник', 'Маска', 'Наложение', 'Скачать PNG', 'Скачать SVG', 'Масштаб', '50%', '100%', '200%', '400%', 'Fit'].forEach((text) => {
  assert.ok(html.includes(text), `Russian UI should include: ${text}`);
});
assert.doesNotMatch(html, /Original image|Gold color sensitivity|Download mask|Minimum fragment|Overlay|Processing mode/, 'visible UI should not keep old English labels');
assert.doesNotMatch(html, /Сглаживание вектора|vector-smoothing/, 'vector smoothing control should be removed');
assert.doesNotMatch(app, /vectorSmoothing|vector-smoothing/, 'app should not keep vector smoothing state or handlers');
assert.match(html, /type="file" accept="image\/png,image\/jpeg"/, 'upload should accept JPG and PNG');
assert.match(app, /GoldProcessing\.processVeins/, 'app should use the v2 processing pipeline');
assert.match(app, /downloadTransparentPng/, 'app should export transparent PNG');
assert.match(app, /downloadSvg/, 'app should export SVG');
assert.match(html, /class="zoom-toolbar"/, 'preview should include visible zoom controls');
assert.match(html, /data-zoom="fit"/, 'preview should include a Fit zoom control');
assert.match(app, /addEventListener\('wheel'/, 'preview should support mouse-wheel zoom');
assert.match(app, /pointerdown/, 'preview should support click-and-drag panning');
assert.match(styles, /overflow: hidden;/, 'preview viewport should clip zoomed content inside the panel');
assert.match(exporters, /<path d=/, 'SVG exporter should generate vector paths');
assert.doesNotMatch(exporters, /data:image\/png.*svg|<image/i, 'SVG exporter should not embed raster images');

console.log('Prototype Russian UI and export wiring tests passed.');
