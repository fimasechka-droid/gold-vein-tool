## Статус

Код **не изменял**. Я только проанализировал текущий проект и предлагаю технический план следующего крупного обновления.

Проверил структуру и текущее состояние командами:

* ✅ `git status --short --branch`
* ✅ `rg --files`
* ✅ `nl -ba src/goldMask.js | sed -n '1,140p'`
* ✅ `nl -ba src/app.js | sed -n '1,120p'`
* ✅ `nl -ba index.html | sed -n '1,90p'`
* ✅ `nl -ba package.json`
* ✅ `nl -ba README.md | sed -n '1,80p'`

---

# Краткий анализ текущего проекта

Сейчас приложение устроено как простой static app без сборки: `index.html` подключает `src/goldMask.js` и `src/app.js` напрямую. 

Текущий алгоритм выделения золота — это пиксельный RGB-фильтр:

* берётся `r`, `g`, `b`;
* вычисляются яркость, насыщенность, разница между красным/синим и зелёным/синим;
* пиксель считается золотым, если проходит набор порогов. 

После этого применяется только удаление маленьких connected components через обход соседей. 

Маска сейчас создаётся как raster RGBA: найденные золотые пиксели становятся чёрными, остальные — белыми. 

Интерфейс сейчас имеет только два управляющих параметра: `Gold color sensitivity` и `Minimum fragment size`. 

Экспорт сейчас — PNG через `canvas.toDataURL('image/png')`, то есть настоящего SVG пока нет. 

Это хорошая первая версия, но она ожидаемо даёт «точечный» результат: каждый пиксель решается отдельно, а потом только мелкие компоненты удаляются. Нет этапов соединения линий, морфологии, векторизации, сглаживания и анализа формы.

---

# 1. Как улучшить алгоритм, чтобы прожилки были непрерывными органическими линиями

Главное изменение: перейти от **пиксельной бинаризации** к **многоэтапному пайплайну**:

```text
image
 → цветовая нормализация
 → gold probability map
 → adaptive threshold
 → morphological cleanup
 → line/vein connection
 → contour extraction
 → vector tracing
 → SVG smoothing
```

Сейчас каждый пиксель либо gold, либо not gold. Это ломает узкие прожилки, если в линии есть блики, тени, JPEG-артефакты или полупрозрачные участки.

Лучше сначала строить не бинарную маску, а **карту вероятности золота**:

```text
0.0 = точно не золото
1.0 = очень похоже на золото
```

Затем уже из этой карты делать маску.

## Что именно улучшить

### A. Использовать несколько цветовых пространств, а не только RGB

RGB плохо отделяет золото от бежевого, жёлтого, кремового и светлых фонов. Лучше комбинировать:

* HSV / HSL — удобно выделять hue золота и saturation.
* Lab — полезно отделять жёлто-красные тона через `a*` / `b*`.
* YCbCr или normalized RGB — полезно уменьшить влияние яркости.
* Локальный контраст / specular highlights — для металлических участков.

OpenCV поддерживает цветовые преобразования и может быть использован в браузере через OpenCV.js; это хороший кандидат для следующего этапа.

### B. Делать не жёсткий threshold, а weighted score

Вместо:

```js
return brightness >= ... && warmLead >= ...
```

лучше:

```text
goldScore =
  hueScore * 0.35 +
  saturationScore * 0.20 +
  labYellowScore * 0.25 +
  highlightScore * 0.10 +
  localContrastScore * 0.10
```

Потом пользовательский `sensitivity` будет двигать порог `goldScore`, а не менять несколько отдельных RGB-порогов.

### C. Добавить морфологическое соединение

Чтобы точки превращались в линии:

* `closing` — соединяет маленькие разрывы;
* directional dilation — соединяет фрагменты вдоль предполагаемого направления прожилки;
* `opening` — убирает мелкий шум;
* area filtering — удаляет мусорные островки;
* bridge gaps — соединяет близкие компоненты, если они лежат почти на одной кривой.

Морфологические операции обычно применяются к бинарным изображениям; OpenCV описывает их как операции на форме изображения с использованием structuring element/kernel, включая erosion, dilation, opening и closing. ([opencv24-python-tutorials.readthedocs.io](https://opencv24-python-tutorials.readthedocs.io/en/latest/py_tutorials/py_imgproc/py_morphological_ops/py_morphological_ops.html?utm_source=openai))

### D. Использовать анализ формы, а не только размер компонента

Сейчас компонент удаляется только по количеству пикселей. 

Для прожилок лучше учитывать:

* площадь;
* длину;
* aspect ratio;
* compactness;
* skeleton length;
* среднюю толщину;
* наличие ветвления;
* близость к другим компонентам.

Например, маленький круглый объект можно удалить, а длинную тонкую линию оставить даже при небольшой площади.

---

# 2. Предлагаемые методы обработки изображений

## Рекомендуемый пайплайн обработки

### Шаг 1. Предобработка

Цель — уменьшить шум, JPEG-артефакты и влияние освещения.

Методы:

* downscale для очень больших изображений;
* bilateral filter или guided filter;
* лёгкий Gaussian blur;
* CLAHE / contrast normalization только для score map, не для исходника;
* white balance / gray-world correction опционально.

Важно: слишком сильное размытие уничтожит узкие прожилки, поэтому blur должен быть небольшим и настраиваемым внутренне, а не обязательно через UI.

---

### Шаг 2. Цветовые пространства

Использовать минимум:

#### HSV / HSL

Для грубого выделения золотого диапазона:

* hue примерно в зоне жёлтого / оранжевого;
* saturation выше фона;
* value/brightness достаточно высокий, но не обязательно максимальный.

#### Lab

Lab полезен, потому что золотые области часто имеют выраженный жёлтый компонент. Можно использовать:

* `b*` для yellow/blue axis;
* `a*` для red/green correction;
* `L*` для контроля яркости.

#### Normalized RGB

Например:

```text
rN = r / (r + g + b)
gN = g / (r + g + b)
bN = b / (r + g + b)
```

Это помогает отделить цвет от общей яркости.

---

### Шаг 3. Gold probability map

Вместо бинарного `rawMask` создать `Float32Array`:

```text
goldProbability[pixel] = 0..1
```

Источники score:

* hue closeness to gold;
* saturation;
* Lab yellow score;
* red/green balance;
* blue suppression;
* local contrast;
* highlight score.

Преимущество: после этого можно использовать adaptive threshold и мягкую очистку.

---

### Шаг 4. Adaptive threshold

Вместо одного глобального порога использовать:

* global threshold для простого режима;
* local/adaptive threshold для сложных изображений;
* hysteresis threshold, как в Canny:
  * high threshold — уверенное золото;
  * low threshold — слабые пиксели, которые сохраняются только если связаны с уверенным золотом.

Это особенно полезно для прожилок: слабые пиксели вдоль линии сохраняются, а случайный шум — нет.

---

### Шаг 5. Морфология

Основные операции:

* `closing` — закрыть разрывы;
* `opening` — удалить одиночный шум;
* `dilation` с маленьким kernel — расширить тонкие линии;
* `erosion` после dilation — вернуть толщину;
* directional kernels — соединять линии по нескольким направлениям: 0°, 45°, 90°, 135°.

OpenCV `morphologyEx` выполняет advanced morphological transformations через erosion/dilation и принимает structuring element/kernel. ([docs.opencv.org](https://docs.opencv.org/master/javadoc/org/opencv/imgproc/Imgproc.html?utm_source=openai))

---

### Шаг 6. Поиск connected components и контуров

После морфологии:

* найти компоненты;
* удалить явно шумовые;
* сохранить тонкие длинные компоненты;
* вычислить bounding box, площадь, периметр, aspect ratio;
* найти контуры.

OpenCV.js может быть полезен здесь, потому что там есть стандартные операции для morphology и contour processing.

---

### Шаг 7. Соединение линий

Для органических прожилок одного closing недостаточно. Нужен отдельный этап gap bridging.

Подходы:

#### A. Endpoint connection

1. Скелетизировать маску.
2. Найти endpoints.
3. Для каждой пары близких endpoints проверить:
   * расстояние;
   * направление касательной;
   * похожую толщину;
   * наличие слабого gold probability между ними.
4. Если условия выполнены — соединить кривой или линией.

#### B. Graph-based connection

Скелет представить как граф:

* узлы — endpoints и junctions;
* рёбра — сегменты прожилок.

Потом соединять короткие разрывы как graph completion.

#### C. Directional dilation

Более простой вариант для MVP:

* применить несколько directional closing kernels;
* объединить результат;
* удалить лишнее opening-фильтром.

Это проще и быстрее, но менее точно.

---

### Шаг 8. Скелетизация

Скелетизация нужна не для финальной маски, а для анализа:

* найти центральные линии;
* определить endpoints;
* определить ветвления;
* оценить длину прожилок;
* соединить разорванные участки.

Финальный SVG лучше строить не только из skeleton, а из **контуров областей**, потому что пользователю нужна маска прожилок с толщиной.

---

### Шаг 9. Векторизация

Есть два пути:

#### Вариант 1 — vectorize filled mask

Берём финальную бинарную маску, извлекаем контуры, превращаем их в SVG `<path>`.

Плюсы:

* сохраняет толщину прожилок;
* подходит для масок;
* результат похож на текущий PNG, но векторный.

Минусы:

* сложнее сглаживать без потери деталей.

#### Вариант 2 — vectorize centerlines

Берём skeleton и экспортируем SVG strokes.

Плюсы:

* очень лёгкий SVG;
* красивые линии;
* удобно редактировать stroke width.

Минусы:

* можно потерять реальную переменную толщину золотых прожилок;
* сложнее получить mask-like output.

Для этого проекта я бы выбрал **filled contour SVG** как основной экспорт и позже добавил optional centerline SVG.

---

# 3. Как организовать экспорт настоящего SVG

Сейчас экспорт — PNG из canvas. 

Для настоящего SVG нужно генерировать XML со структурой примерно:

```xml
<svg xmlns="http://www.w3.org/2000/svg" width="..." height="..." viewBox="0 0 W H">
  <rect width="100%" height="100%" fill="white"/>
  <path d="..." fill="black"/>
  <path d="..." fill="black"/>
</svg>
```

Важно: нельзя вставлять `<image href="data:image/png;base64,...">`, потому что это будет raster PNG внутри SVG, а пользователь просит векторные контуры.

## Рекомендуемый SVG pipeline

```text
binary mask
 → find contours
 → simplify contour points
 → convert to cubic/quadratic paths
 → preserve holes
 → emit SVG path data
 → download .svg
```

## Контуры и holes

Для настоящей маски нужно учитывать:

* внешние контуры;
* внутренние отверстия;
* hierarchy.

Если использовать OpenCV contours, нужно сохранять иерархию. Если использовать marching squares, нужно потом правильно группировать rings.

## Какие SVG-элементы использовать

Лучше использовать:

```xml
<path fill="black" fill-rule="evenodd" d="..."/>
```

`fill-rule="evenodd"` помогает корректно отображать отверстия внутри контуров.

## Масштаб

SVG должен сохранять исходный размер изображения:

```xml
width="${imageWidth}"
height="${imageHeight}"
viewBox="0 0 ${imageWidth} ${imageHeight}"
```

---

# 4. Как сглаживать вектор без потери тонких прожилок

Главный риск: обычное сильное упрощение контура уничтожит тонкие ветви.

## Рекомендация: двухэтапное сглаживание

### Этап 1. Topology-preserving cleanup на raster mask

До векторизации:

* closing маленьким kernel;
* remove isolated pixels;
* preserve thin components based on skeleton length;
* avoid aggressive erosion.

Цель — не заставлять SVG-сглаживание исправлять шум, который лучше удалить на raster stage.

### Этап 2. Adaptive vector simplification

Не использовать один global tolerance для всех контуров.

Лучше:

```text
tolerance = min(baseTolerance, localWidth * 0.2)
```

То есть:

* толстые области можно сглаживать сильнее;
* узкие прожилки сглаживать минимально;
* endpoints и sharp turns сохранять.

## Методы

### Ramer–Douglas–Peucker

Подходит для сокращения количества точек. Но его нужно применять осторожно: большой tolerance может удалить тонкие детали и острые изгибы. Библиотеки вроде simplify-js используют radial distance и Ramer–Douglas–Peucker для быстрого упрощения линий. ([github.com](https://github.com/geonome/simplify2-js?utm_source=openai))

### Chaikin smoothing

Даёт красивые органические линии, но может:

* срезать углы;
* уменьшать тонкие выступы;
* менять площадь маски.

Использовать только на копии контура и ограниченно.

### Bézier fitting

Лучший визуальный результат:

* сначала упростить точки;
* потом аппроксимировать cubic Bézier;
* контролировать maximum fitting error.

### Запрет на сглаживание критических мест

Нужно сохранять:

* endpoints skeleton;
* junctions;
* узкие перемычки;
* компоненты меньше определённой ширины.

Практически: перед vector smoothing можно вычислить distance transform или approximate local width. Если ширина участка меньше N пикселей, tolerance должен быть очень маленьким.

---

# 5. Какие UI-настройки действительно нужны, а какие лишние

Сейчас UI минимальный: upload, sensitivity, min fragment size, preview, download. 

Для следующего большого обновления настройки стоит разделить на **Basic** и **Advanced**.

---

## Нужные настройки

### Basic

#### 1. Gold sensitivity

Оставить. Это главный понятный пользователю параметр. Уже есть. 

Но внутри он должен управлять threshold на `goldProbability`, а не RGB-порогами.

#### 2. Line continuity / Connect gaps

Новая важная настройка.

Пример:

```text
Connect broken veins: Off / Low / Medium / High
```

Это будет управлять:

* closing radius;
* max endpoint gap;
* directional connection strength.

#### 3. Noise cleanup

Заменить или переосмыслить текущий `Minimum fragment size`. Сейчас он удаляет компоненты только по площади. 

Лучше UI:

```text
Noise cleanup: Low / Medium / High
```

А внутри учитывать не только площадь, но и форму.

#### 4. Detail preservation

Очень полезно для тонких прожилок:

```text
Preserve delicate vein details: Low / Medium / High
```

Это влияет на:

* minimum retained skeleton length;
* vector simplification tolerance;
* erosion strength.

#### 5. Preview mode

Добавить переключатель:

* Mask preview;
* Overlay preview;
* Gold probability preview;
* Vector preview.

Overlay preview очень важен: пользователь должен видеть, где маска ошиблась относительно оригинала.

---

## Полезные Advanced-настройки

Спрятать в “Advanced”:

* Hue range;
* Saturation minimum;
* Lab yellow weight;
* Morphology radius;
* Max gap distance;
* SVG simplification tolerance;
* Minimum vein length;
* Maximum noise blob size;
* Include holes / fill holes.

---

## Лишние настройки на этом этапе

Не стоит добавлять сразу:

* 10 отдельных RGB-порогов;
* отдельные sliders для `r - b`, `g - b`, brightness, saturation;
* выбор каждого morphology kernel вручную;
* ручной выбор алгоритма контуров;
* десятки параметров SVG path fitting.

Причина: пользователь хочет хороший результат, а не интерфейс лаборатории компьютерного зрения.

Лучше дать 4–5 понятных регуляторов и один Advanced-раздел для отладки.

---

# 6. Архитектурные изменения проекта

Сейчас приложение — простые global scripts. `GoldMask` экспортируется в browser global и CommonJS. 

Для следующего этапа этого будет мало.

## Рекомендованная структура

```text
src/
  app/
    appController.js
    state.js
    uiBindings.js
    previewRenderer.js
    download.js

  image/
    imageLoader.js
    canvasUtils.js
    colorSpaces.js

  processing/
    goldProbability.js
    threshold.js
    morphology.js
    components.js
    skeleton.js
    contours.js
    vectorize.js
    svgExport.js
    pipeline.js

  workers/
    processingWorker.js

  types/
    processingOptions.js

tests/
  fixtures/
  unit/
  integration/
```

## Почему так

### A. Отделить UI от обработки

Сейчас `app.js` одновременно:

* читает файл;
* рисует canvas;
* вызывает алгоритм;
* обновляет UI;
* экспортирует PNG. 

Для развития лучше разделить:

* UI state;
* image loading;
* processing pipeline;
* export.

### B. Сделать pipeline чистыми функциями

Например:

```js
const result = processGoldVeins(imageData, options);
```

Где result содержит:

```js
{
  probabilityMap,
  binaryMask,
  cleanedMask,
  contours,
  svg,
  stats
}
```

Так проще тестировать.

### C. Добавить Web Worker

Морфология, скелетизация и векторизация могут быть тяжёлыми на больших изображениях.

Чтобы UI не зависал:

```text
main thread → worker → processing result → preview
```

### D. Перейти на Vite или аналогичный лёгкий bundler

Сейчас нет сборки, что удобно для первого прототипа. 

Но для библиотек вроде OpenCV.js, SVG tracing и workers лучше добавить Vite:

* удобные ES modules;
* dev server;
* production build;
* проще тестировать;
* проще GitHub Pages deploy через `dist`.

---

# 7. Какие библиотеки использовать и почему

## Рекомендованный набор

### 1. OpenCV.js

Использовать для:

* color conversion;
* blur / filters;
* morphology;
* connected components;
* contours;
* distance transform, если доступно в сборке;
* возможно watershed/edge detection позже.

Почему: это стандартный набор image processing primitives, а не самописная реализация всего.

Риск: OpenCV.js тяжёлый. Возможно, стоит загружать его lazy only after upload.

---

### 2. Potrace / potrace-wasm / imagetracerjs

Для SVG-векторизации бинарной маски.

Potrace — классический инструмент для преобразования bitmap в smooth scalable vector output; официальный сайт описывает его как tracing bitmap into smooth scalable image с выводом в SVG/PDF и другие форматы. ([potrace.sourceforge.net](https://potrace.sourceforge.net/?utm_source=openai))

Плюсы:

* даёт smooth vector contours;
* хорошо подходит для black/white mask;
* меньше писать самим.

Минусы:

* лицензия и конкретная JS/WASM-обёртка требуют проверки;
* может сглаживать слишком агрессивно;
* нужен контроль параметров.

Если лицензия Potrace-обёртки проблемная, рассмотреть `imagetracerjs` или собственный contour-to-SVG.

---

### 3. d3-contour

Альтернатива для извлечения контуров через marching squares.

D3 contour module вычисляет contour polygons через marching squares по rectangular grid numeric values. ([d3js.org](https://d3js.org/d3-contour?utm_source=openai))

Плюсы:

* хорошо подходит для probability map;
* можно строить контуры не только бинарной маски, но и thresholded scalar field;
* лёгче, чем OpenCV.

Минусы:

* не заменяет morphology;
* нужно самостоятельно обрабатывать holes, сглаживание, SVG path generation.

---

### 4. simplify-js или собственный RDP

Для упрощения контуров.

Библиотеки семейства simplify используют radial distance и Ramer–Douglas–Peucker для быстрого упрощения точек. ([github.com](https://github.com/geonome/simplify2-js?utm_source=openai))

Но я бы начал с собственной маленькой реализации RDP, потому что:

* нужно adaptive tolerance;
* нужно сохранять детали узких прожилок;
* меньше зависимостей.

---

### 5. Vitest

Для тестов после перехода на модули.

Сейчас тесты запускаются через Node напрямую. 

Vitest даст:

* unit tests;
* snapshot tests для SVG;
* тестирование pipeline stages;
* coverage.

---

### 6. Playwright

Для end-to-end тестов:

* upload image fixture;
* move sliders;
* verify mask canvas changes;
* click SVG/PNG download;
* compare output dimensions.

Это станет важно, когда появится SVG export.

---

### 7. Comlink — опционально

Если processing уйдёт в Web Worker, Comlink упростит вызовы worker API.

---

# 8. Основные риски реализации

## Риск 1. Золото визуально неоднозначно

На abstract marble/alcohol-ink изображениях золото может быть:

* ярким metallic;
* тёмным bronze;
* почти бежевым;
* пересвеченным белым бликом;
* похожим на жёлтый фон.

Один алгоритм не будет идеальным для всех изображений. Нужны presets и overlay preview.

---

## Риск 2. Морфология может соединять лишнее

Closing/gap bridging может превратить отдельные золотые точки в ложные линии.

Решение:

* ограничивать соединение по направлению;
* использовать probability map между endpoints;
* показывать overlay;
* добавить “Connect gaps” как отдельный контрол.

---

## Риск 3. Сглаживание может уничтожить узкие прожилки

SVG simplification опасен для тонких линий.

Решение:

* adaptive tolerance;
* учитывать local width;
* сохранять skeleton endpoints/junctions;
* сохранять детали узких прожилок.

---

## Риск 4. Производительность в браузере

Большие изображения могут подвесить UI.

Решение:

* processing scale;
* Web Worker;
* progress indicator;
* debounced slider updates;
* preview downscale + final full-resolution export.

---

## Риск 5. SVG может стать слишком большим

Если контуров много, SVG будет тяжёлым.

Решение:

* contour simplification;
* min contour area;
* merge nearby contours;
* optional export scale;
* remove tiny holes.

---

## Риск 6. Библиотечные ограничения

OpenCV.js тяжёлый, Potrace/WASM может иметь вопросы лицензии/размера/инициализации.

Решение:

* сначала сделать pipeline интерфейсы независимыми от библиотек;
* библиотеку подключать за адаптером;
* иметь fallback на pure JS для базовых операций.

---

# Рекомендованный технический план реализации

## Этап 1. Подготовить архитектуру без изменения поведения

1. Перейти на ES modules.
2. Ввести `processGoldMask(imageData, options)`.
3. Разделить:
   * UI;
   * image loading;
   * processing;
   * export.
4. Сохранить текущий PNG export и текущий визуальный результат как baseline.
5. Добавить fixtures для тестов.

Цель: не ломать текущий прототип.

---

## Этап 2. Ввести probability map

1. Реализовать RGB → HSV.
2. Реализовать RGB → Lab или подключить библиотеку.
3. Сделать `computeGoldProbability(imageData, options)`.
4. Заменить бинарный `isGoldPixel` на scoring model.
5. Добавить тесты на:
   * bright gold;
   * muted gold;
   * beige background;
   * white highlight;
   * dark bronze.

---

## Этап 3. Улучшить бинаризацию

1. Добавить threshold по probability.
2. Добавить hysteresis threshold:
   * strong gold;
   * weak gold connected to strong gold.
3. Добавить preview probability map.
4. Сравнить с текущими тестами и сохранить backward-compatible controls.

---

## Этап 4. Добавить морфологическую очистку

1. Реализовать или подключить:
   * dilation;
   * erosion;
   * opening;
   * closing.
2. Добавить directional kernels.
3. Заменить `minFragmentSize` на более умный component filtering:
   * area;
   * length;
   * aspect ratio;
   * skeleton length позже.
4. Добавить UI control `Line continuity`.

---

## Этап 5. Скелетизация и соединение разрывов

1. Добавить skeletonization для анализа.
2. Найти endpoints и junctions.
3. Реализовать simple endpoint bridging:
   * max gap distance;
   * angle compatibility;
   * probability along gap.
4. Добавить тесты на искусственных разорванных линиях.
5. Добавить UI настройку `Connect gaps`.

---

## Этап 6. Контуры

1. Извлекать контуры финальной маски.
2. Сохранять hierarchy/holes.
3. Удалять микроконтуры.
4. Сравнивать raster preview с contour-filled preview.

Варианты реализации:

* OpenCV.js `findContours`;
* d3-contour / marching squares;
* custom border following.

---

## Этап 7. Настоящий SVG export

1. Добавить `exportSvg(contours, width, height, options)`.
2. Генерировать:
   * white background rect;
   * black filled paths;
   * `fill-rule="evenodd"`.
3. Добавить кнопку:
   * Download PNG mask;
   * Download SVG mask.
4. Добавить тесты:
   * SVG contains `<path>`;
   * SVG does not contain embedded PNG;
   * viewBox matches image size.

---

## Этап 8. Adaptive smoothing

1. Добавить contour simplification.
2. Использовать adaptive tolerance.
3. Защитить узкие прожилки через:
   * local width;
   * skeleton endpoints;
   * max fitting error.
4. Добавить preview:
   * raw mask;
   * smoothed SVG overlay.

---

## Этап 9. Производительность

1. Добавить Web Worker.
2. Добавить debounce для sliders.
3. Добавить processing scale:
   * Preview quality;
   * Export quality.
4. Добавить progress/status.

---

## Этап 10. Финальная полировка UI

1. Basic controls:
   * Gold sensitivity;
   * Line continuity;
   * Noise cleanup;
   * Preserve delicate vein details.
2. Advanced controls:
   * Threshold;
   * Morphology radius;
   * Max gap distance;
   * SVG simplification.
3. Preview modes:
   * Original;
   * Mask;
   * Overlay;
   * Vector.
4. Export:
   * PNG;
   * SVG;
   * maybe transparent PNG later.

---

# Моя главная рекомендация

Следующее большое обновление лучше делать не как «добавим SVG-кнопку», а как полноценный pipeline:

```text
gold probability → morphology → line connection → contour tracing → adaptive SVG export
```

Если сразу векторизовать текущую точечную маску, SVG получится технически настоящим, но визуально плохим: много маленьких чёрных островков вместо непрерывных органических золотых прожилок. Поэтому сначала нужно улучшить raster mask, а уже потом делать SVG.
