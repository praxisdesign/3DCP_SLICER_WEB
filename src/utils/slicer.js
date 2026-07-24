import { Box3, Vector3 } from 'three';

const epsilon = 1e-6;

export function sliceModel(object, options) {
  const box = new Box3().setFromObject(object);
  const height = box.max.z - box.min.z;
  const requestedLayers = Math.max(1, Math.floor(height / options.layerHeight) + 1);
  const layerCount = Math.min(options.maxLayers, requestedLayers);
  const layers = [];
  let totalLength = 0;

  for (let index = 0; index < layerCount; index += 1) {
    const z = box.min.z + index * options.layerHeight;
    const segments = sliceAtZ(object, z);
    const length = segments.reduce((sum, [start, end]) => sum + start.distanceTo(end), 0);

    if (segments.length > 0) {
      const paths = stitchSegments(segments);
      layers.push({ index, z, segments, paths, length });
      totalLength += length;
    }
  }

  return { layers, totalLength, requestedLayers, clipped: requestedLayers > layerCount };
}

// Raw per-triangle intersection segments arrive in arbitrary order and don't share
// endpoint identity, so without stitching, every segment becomes an isolated
// travel-move + pump-on/off pair in the generated G-code — the concrete pump can't
// physically cycle that fast. This chains same-endpoint segments into continuous
// polylines/loops so each printed path gets one pump-on/off pair.
function stitchSegments(segments) {
  const adjacency = new Map();

  function addEdge(key, edge) {
    if (!adjacency.has(key)) {
      adjacency.set(key, []);
    }
    adjacency.get(key).push(edge);
  }

  segments.forEach(([a, b], segIndex) => {
    const keyA = pointKey(a);
    const keyB = pointKey(b);
    addEdge(keyA, { segIndex, otherPoint: b, otherKey: keyB });
    addEdge(keyB, { segIndex, otherPoint: a, otherKey: keyA });
  });

  const used = new Array(segments.length).fill(false);
  const paths = [];

  segments.forEach((segment, startIndex) => {
    if (used[startIndex]) {
      return;
    }

    used[startIndex] = true;
    const points = [segment[0], segment[1]];
    let closed = false;

    let tailKey = pointKey(points[points.length - 1]);
    for (;;) {
      const next = (adjacency.get(tailKey) || []).find((edge) => !used[edge.segIndex]);
      if (!next) break;
      used[next.segIndex] = true;
      points.push(next.otherPoint);
      tailKey = next.otherKey;
      if (tailKey === pointKey(points[0])) {
        closed = true;
        break;
      }
    }

    if (!closed) {
      let headKey = pointKey(points[0]);
      for (;;) {
        const prev = (adjacency.get(headKey) || []).find((edge) => !used[edge.segIndex]);
        if (!prev) break;
        used[prev.segIndex] = true;
        points.unshift(prev.otherPoint);
        headKey = prev.otherKey;
        if (headKey === pointKey(points[points.length - 1])) {
          closed = true;
          break;
        }
      }
    }

    paths.push({ points, closed });
  });

  return paths;
}

function sliceAtZ(object, z) {
  const segments = [];

  object.updateMatrixWorld(true);
  object.traverse((child) => {
    if (!child.isMesh || !child.geometry?.attributes?.position) {
      return;
    }

    const geometry = child.geometry.toNonIndexed();
    const position = geometry.attributes.position;
    const matrix = child.matrixWorld.clone();

    for (let i = 0; i < position.count; i += 3) {
      const a = readVertex(position, i, matrix);
      const b = readVertex(position, i + 1, matrix);
      const c = readVertex(position, i + 2, matrix);
      const intersections = trianglePlaneIntersections([a, b, c], z);

      if (intersections.length === 2 && intersections[0].distanceTo(intersections[1]) > epsilon) {
        segments.push(intersections);
      }
    }
  });

  return dedupeSegments(segments);
}

function readVertex(position, index, matrix) {
  return new Vector3(
    position.getX(index),
    position.getY(index),
    position.getZ(index),
  ).applyMatrix4(matrix);
}

function trianglePlaneIntersections(vertices, z) {
  const points = [];
  addEdgeIntersection(vertices[0], vertices[1], z, points);
  addEdgeIntersection(vertices[1], vertices[2], z, points);
  addEdgeIntersection(vertices[2], vertices[0], z, points);
  return uniquePoints(points);
}

function addEdgeIntersection(start, end, z, points) {
  const startDistance = start.z - z;
  const endDistance = end.z - z;

  if (Math.abs(startDistance) < epsilon && Math.abs(endDistance) < epsilon) {
    return;
  }

  if (startDistance * endDistance > 0) {
    return;
  }

  const denominator = end.z - start.z;
  if (Math.abs(denominator) < epsilon) {
    return;
  }

  const t = (z - start.z) / denominator;
  if (t < -epsilon || t > 1 + epsilon) {
    return;
  }

  points.push(start.clone().lerp(end, Math.min(1, Math.max(0, t))));
}

function uniquePoints(points) {
  const result = [];

  points.forEach((point) => {
    if (!result.some((existing) => existing.distanceTo(point) < epsilon)) {
      result.push(point);
    }
  });

  return result;
}

function dedupeSegments(segments) {
  const seen = new Set();
  const result = [];

  segments.forEach(([start, end]) => {
    const keyA = pointKey(start);
    const keyB = pointKey(end);
    const key = keyA < keyB ? `${keyA}|${keyB}` : `${keyB}|${keyA}`;

    if (!seen.has(key)) {
      seen.add(key);
      result.push([start, end]);
    }
  });

  return result;
}

function pointKey(point) {
  return `${round(point.x)},${round(point.y)},${round(point.z)}`;
}

function round(value) {
  return Math.round(value * 100000) / 100000;
}
