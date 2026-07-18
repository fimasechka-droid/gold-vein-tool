(function (global) {
  const CONTOUR_FIT_TOLERANCE = 0.72;
  const CURVE_TENSION = 0.45;
  function downloadBlob(content, fileName, type) {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const link = document.createElement('a');
    link.download = fileName;
    link.href = URL.createObjectURL(blob);
    link.click();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 500);
  }

  function transparentPngUrl(maskResult) {
    const canvas = document.createElement('canvas');
    canvas.width = maskResult.width;
    canvas.height = maskResult.height;
    canvas.getContext('2d').putImageData(new ImageData(maskResult.transparentImageData.data, maskResult.width, maskResult.height), 0, 0);
    return canvas.toDataURL('image/png');
  }

  function downloadTransparentPng(maskResult, fileName) {
    const link = document.createElement('a');
    link.download = fileName;
    link.href = transparentPngUrl(maskResult);
    link.click();
  }

  function traceMask(mask, width, height) {
    const edges = new Map();
    function pointKey(point) { return `${point[0]},${point[1]}`; }
    function addEdge(from, to) {
      const key = pointKey(from);
      if (!edges.has(key)) edges.set(key, []);
      edges.get(key).push(to);
    }
    function has(x, y) { return x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x]; }

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (!has(x, y)) continue;

        // Collect only foreground/background transitions. These raw transitions
        // are an input bitmap outline; a later fitting pass reconstructs a much
        // smaller smooth contour instead of exporting each pixel step.
        const left = x;
        const right = x + 1;
        const top = y;
        const bottom = y + 1;
        if (!has(x, y - 1)) addEdge([left, top], [right, top]);
        if (!has(x + 1, y)) addEdge([right, top], [right, bottom]);
        if (!has(x, y + 1)) addEdge([right, bottom], [left, bottom]);
        if (!has(x - 1, y)) addEdge([left, bottom], [left, top]);
      }
    }

    const paths = [];
    while (edges.size) {
      const startKey = edges.keys().next().value;
      const [sx, sy] = startKey.split(',').map(Number);
      const points = [[sx, sy]];
      let key = startKey;
      let guard = 0;
      while (edges.has(key) && guard < width * height * 8) {
        guard += 1;
        const list = edges.get(key);
        const next = list.shift();
        if (!list.length) edges.delete(key);
        points.push(next);
        key = pointKey(next);
        if (key === startKey) break;
      }
      if (points.length > 3) paths.push(points);
    }
    return paths;
  }

  function removeDuplicateClosingPoint(points) {
    return points.length > 1 && points[0][0] === points[points.length - 1][0] && points[0][1] === points[points.length - 1][1]
      ? points.slice(0, -1)
      : points.slice();
  }

  function rotateToIndex(points, startIndex) {
    return points.slice(startIndex).concat(points.slice(0, startIndex));
  }

  function fitContour(points, tolerance) {
    const source = removeDuplicateClosingPoint(points);
    if (source.length <= 6) return points;

    // Potrace-style polygon fitting: find a stable break point, unwrap the
    // closed contour there, then Douglas-Peucker-fit the bitmap outline into a
    // concise polygon before curve fitting. The tolerance is intentionally below
    // one pixel so thin branches and small vein details are retained.
    let startIndex = 0;
    for (let i = 1; i < source.length; i += 1) {
      if (source[i][0] < source[startIndex][0] || (source[i][0] === source[startIndex][0] && source[i][1] < source[startIndex][1])) startIndex = i;
    }
    const rotated = rotateToIndex(source, startIndex);
    rotated.push(rotated[0]);
    const fitted = simplifyPath(rotated, tolerance);
    if (fitted.length > 2 && (fitted[0][0] !== fitted[fitted.length - 1][0] || fitted[0][1] !== fitted[fitted.length - 1][1])) fitted.push(fitted[0]);
    return fitted.length >= 4 ? fitted : points;
  }

  function perpendicularDistance(point, start, end) {
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    if (!dx && !dy) return Math.hypot(point[0] - start[0], point[1] - start[1]);
    return Math.abs(dy * point[0] - dx * point[1] + end[0] * start[1] - end[1] * start[0]) / Math.hypot(dx, dy);
  }

  function simplifyPath(points, tolerance) {
    if (points.length <= 4 || tolerance <= 0) return points;
    const closed = points[0][0] === points[points.length - 1][0] && points[0][1] === points[points.length - 1][1];
    const source = closed ? points.slice(0, -1) : points.slice();
    function simplifySegment(list) {
      if (list.length <= 2) return list;
      let maxDistance = 0;
      let index = 0;
      for (let i = 1; i < list.length - 1; i += 1) {
        const distance = perpendicularDistance(list[i], list[0], list[list.length - 1]);
        if (distance > maxDistance) { maxDistance = distance; index = i; }
      }
      if (maxDistance > tolerance) {
        const left = simplifySegment(list.slice(0, index + 1));
        const right = simplifySegment(list.slice(index));
        return left.slice(0, -1).concat(right);
      }
      return [list[0], list[list.length - 1]];
    }
    const simplified = simplifySegment(source);
    if (closed) simplified.push(simplified[0]);
    return simplified;
  }

  function formatNumber(value) {
    return Number(value.toFixed(3)).toString();
  }

  function pathToSvg(points) {
    const source = removeDuplicateClosingPoint(points);
    if (source.length < 3) return '';
    let d = `M ${formatNumber(source[0][0])} ${formatNumber(source[0][1])}`;
    for (let i = 0; i < source.length; i += 1) {
      const previous = source[(i - 1 + source.length) % source.length];
      const current = source[i];
      const next = source[(i + 1) % source.length];
      const afterNext = source[(i + 2) % source.length];
      const cp1 = [
        current[0] + (next[0] - previous[0]) * (CURVE_TENSION / 6),
        current[1] + (next[1] - previous[1]) * (CURVE_TENSION / 6),
      ];
      const cp2 = [
        next[0] - (afterNext[0] - current[0]) * (CURVE_TENSION / 6),
        next[1] - (afterNext[1] - current[1]) * (CURVE_TENSION / 6),
      ];
      d += ` C ${formatNumber(cp1[0])} ${formatNumber(cp1[1])} ${formatNumber(cp2[0])} ${formatNumber(cp2[1])} ${formatNumber(next[0])} ${formatNumber(next[1])}`;
    }
    return `${d} Z`;
  }

  function svgCanvasDimensions(maskResult) {
    return {
      width: maskResult.originalWidth || maskResult.imageWidth || maskResult.width,
      height: maskResult.originalHeight || maskResult.imageHeight || maskResult.height,
    };
  }

  function registrationMarks(dimensions) {
    const inset = 5;
    const halfSize = 3;
    const centers = [
      [inset, inset],
      [dimensions.width - inset, inset],
      [inset, dimensions.height - inset],
      [dimensions.width - inset, dimensions.height - inset],
    ];
    const lines = centers.flatMap(function (center) {
      const x = center[0];
      const y = center[1];
      return [
        `    <line x1="${x - halfSize}" y1="${y}" x2="${x + halfSize}" y2="${y}"/>`,
        `    <line x1="${x}" y1="${y - halfSize}" x2="${x}" y2="${y + halfSize}"/>`,
      ];
    }).join('\n');
    return `  <g id="registration-marks" stroke="black" stroke-width="1" fill="none" stroke-linecap="square">\n${lines}\n  </g>`;
  }

  function createSvg(maskResult) {
    const dimensions = svgCanvasDimensions(maskResult);
    const paths = traceMask(maskResult.mask, maskResult.width, maskResult.height)
      .map(function (path) { return fitContour(path, CONTOUR_FIT_TOLERANCE); })
      .filter(function (path) { return path.length > 3; })
      .map(pathToSvg)
      .filter(Boolean);
    const marks = registrationMarks(dimensions);
    const pathBody = paths.length ? `  <path d="${paths.join(' ')}" fill="black" fill-rule="evenodd" clip-rule="evenodd"/>` : '';
    const body = pathBody ? `${marks}\n${pathBody}` : marks;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${dimensions.width}" height="${dimensions.height}" viewBox="0 0 ${dimensions.width} ${dimensions.height}">\n${body}\n</svg>\n`;
  }

  function downloadSvg(maskResult, fileName) {
    downloadBlob(createSvg(maskResult), fileName, 'image/svg+xml;charset=utf-8');
  }

  const api = { transparentPngUrl, downloadTransparentPng, traceMask, fitContour, simplifyPath, svgCanvasDimensions, registrationMarks, createSvg, downloadSvg };
  global.GoldExporters = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
