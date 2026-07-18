(function (global) {
  const CONTOUR_FIT_TOLERANCE = 0.9;
  const CURVE_HANDLE_SCALE = 0.22;
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

  function squaredDistance(a, b) {
    const dx = a[0] - b[0];
    const dy = a[1] - b[1];
    return dx * dx + dy * dy;
  }

  function contourChain(points, startIndex, endIndex) {
    const chain = [];
    let index = startIndex;
    while (index !== endIndex) {
      chain.push(points[index]);
      index = (index + 1) % points.length;
    }
    chain.push(points[endIndex]);
    return chain;
  }

  function farthestContourPair(points) {
    let first = 0;
    let second = Math.floor(points.length / 2);
    let bestDistance = -1;
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        const distance = squaredDistance(points[i], points[j]);
        if (distance > bestDistance) {
          bestDistance = distance;
          first = i;
          second = j;
        }
      }
    }
    return [first, second];
  }

  function fitContour(points, tolerance) {
    const source = removeDuplicateClosingPoint(points);
    if (source.length <= 6) return points;

    // Closed contours cannot be simplified well by cutting at an arbitrary
    // point: that tends to keep the staircase near the seam. Split the outline
    // at the farthest pair of contour vertices, simplify both arcs, then join
    // them again. This keeps real peaks/valleys and narrow protrusions while
    // removing the intermediate one-pixel steps along a continuous slope.
    const pair = farthestContourPair(source);
    const firstArc = simplifyPath(contourChain(source, pair[0], pair[1]), tolerance);
    const secondArc = simplifyPath(contourChain(source, pair[1], pair[0]), tolerance);
    const fitted = firstArc.slice(0, -1).concat(secondArc.slice(0, -1));
    fitted.push(fitted[0]);
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

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function clampToPoints(point, points) {
    const xs = points.map(function (candidate) { return candidate[0]; });
    const ys = points.map(function (candidate) { return candidate[1]; });
    return [
      clamp(point[0], Math.min.apply(null, xs), Math.max.apply(null, xs)),
      clamp(point[1], Math.min.apply(null, ys), Math.max.apply(null, ys)),
    ];
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
      const segmentLength = Math.hypot(next[0] - current[0], next[1] - current[1]);
      const incomingLength = Math.hypot(current[0] - previous[0], current[1] - previous[1]);
      const outgoingLength = Math.hypot(afterNext[0] - next[0], afterNext[1] - next[1]);
      const handle1 = Math.min(segmentLength * CURVE_HANDLE_SCALE, incomingLength * CURVE_HANDLE_SCALE, segmentLength / 3);
      const handle2 = Math.min(segmentLength * CURVE_HANDLE_SCALE, outgoingLength * CURVE_HANDLE_SCALE, segmentLength / 3);
      const tangent1Length = Math.hypot(next[0] - previous[0], next[1] - previous[1]) || 1;
      const tangent2Length = Math.hypot(afterNext[0] - current[0], afterNext[1] - current[1]) || 1;
      const cp1 = clampToPoints([
        current[0] + ((next[0] - previous[0]) / tangent1Length) * handle1,
        current[1] + ((next[1] - previous[1]) / tangent1Length) * handle1,
      ], [previous, current, next]);
      const cp2 = clampToPoints([
        next[0] - ((afterNext[0] - current[0]) / tangent2Length) * handle2,
        next[1] - ((afterNext[1] - current[1]) / tangent2Length) * handle2,
      ], [current, next, afterNext]);
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
