(function (global) {
  const VECTOR_SIMPLIFICATION_TOLERANCE = 0.63;
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
    function addEdge(x1, y1, x2, y2) {
      const key = `${x1},${y1}`;
      if (!edges.has(key)) edges.set(key, []);
      edges.get(key).push([x2, y2]);
    }
    function has(x, y) { return x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x]; }

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (!has(x, y)) continue;
        if (!has(x, y - 1)) addEdge(x, y, x + 1, y);
        if (!has(x + 1, y)) addEdge(x + 1, y, x + 1, y + 1);
        if (!has(x, y + 1)) addEdge(x + 1, y + 1, x, y + 1);
        if (!has(x - 1, y)) addEdge(x, y + 1, x, y);
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
        key = `${next[0]},${next[1]}`;
        if (key === startKey) break;
      }
      if (points.length > 3) paths.push(points);
    }
    return paths;
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

  function pathToSvg(points) {
    if (points.length < 3) return '';
    let d = `M ${points[0][0]} ${points[0][1]}`;
    for (let i = 1; i < points.length; i += 1) d += ` L ${points[i][0]} ${points[i][1]}`;
    return `${d} Z`;
  }

  function createSvg(maskResult) {
    const paths = traceMask(maskResult.mask, maskResult.width, maskResult.height)
      .map(function (path) { return simplifyPath(path, VECTOR_SIMPLIFICATION_TOLERANCE); })
      .filter(function (path) { return path.length > 3; })
      .map(pathToSvg)
      .filter(Boolean);
    const body = paths.map(function (d) { return `  <path d="${d}" fill="black"/>`; }).join('\n');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${maskResult.width}" height="${maskResult.height}" viewBox="0 0 ${maskResult.width} ${maskResult.height}">\n${body}\n</svg>\n`;
  }

  function downloadSvg(maskResult, fileName) {
    downloadBlob(createSvg(maskResult), fileName, 'image/svg+xml;charset=utf-8');
  }

  const api = { transparentPngUrl, downloadTransparentPng, traceMask, simplifyPath, createSvg, downloadSvg };
  global.GoldExporters = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
