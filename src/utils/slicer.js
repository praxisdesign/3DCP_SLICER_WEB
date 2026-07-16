import { Box3, Vector3 } from 'three';

const epsilon = 1e-6;

export function sliceModel(object, options) {
  const box = new Box3().setFromObject(object);
  const height = box.max.z - box.min.z;
  const layerCount = Math.min(
    options.maxLayers,
    Math.max(1, Math.floor(height / options.layerHeight) + 1),
  );
  const layers = [];
  let totalLength = 0;

  for (let index = 0; index < layerCount; index += 1) {
    const z = box.min.z + index * options.layerHeight;
    const segments = sliceAtZ(object, z);
    const length = segments.reduce((sum, [start, end]) => sum + start.distanceTo(end), 0);

    if (segments.length > 0) {
      layers.push({ index, z, segments, length });
      totalLength += length;
    }
  }

  return { layers, totalLength };
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
