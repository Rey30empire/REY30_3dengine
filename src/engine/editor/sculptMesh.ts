'use client';

import {
  cloneEditableMesh,
  getHiddenFaceIndices,
  getVertexMaskValue,
  type EditableMesh,
  type EditableVec3,
} from './modelerMesh';

export type SculptBrush = 'draw' | 'clay' | 'grab' | 'smooth' | 'crease';

function clampUnit(value: number, fallback = 0) {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}

function add(left: EditableVec3, right: EditableVec3): EditableVec3 {
  return {
    x: left.x + right.x,
    y: left.y + right.y,
    z: left.z + right.z,
  };
}

function subtract(left: EditableVec3, right: EditableVec3): EditableVec3 {
  return {
    x: left.x - right.x,
    y: left.y - right.y,
    z: left.z - right.z,
  };
}

function scale(vector: EditableVec3, scalar: number): EditableVec3 {
  return {
    x: vector.x * scalar,
    y: vector.y * scalar,
    z: vector.z * scalar,
  };
}

function dot(left: EditableVec3, right: EditableVec3) {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function length(vector: EditableVec3) {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function normalize(vector: EditableVec3, fallback: EditableVec3 = { x: 0, y: 1, z: 0 }) {
  const vectorLength = length(vector);
  if (vectorLength <= 1e-6) {
    return { ...fallback };
  }
  return scale(vector, 1 / vectorLength);
}

function cross(left: EditableVec3, right: EditableVec3): EditableVec3 {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  };
}

function distance(left: EditableVec3, right: EditableVec3) {
  return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);
}

function buildVertexNormals(mesh: EditableMesh) {
  const normals = mesh.vertices.map(() => ({ x: 0, y: 0, z: 0 }));
  const hiddenFaces = new Set(getHiddenFaceIndices(mesh));

  mesh.faces.forEach(([a, b, c], faceIndex) => {
    if (hiddenFaces.has(faceIndex)) return;
    const va = mesh.vertices[a];
    const vb = mesh.vertices[b];
    const vc = mesh.vertices[c];
    if (!va || !vb || !vc) return;

    const ab = subtract(vb, va);
    const ac = subtract(vc, va);
    const faceNormal = normalize(cross(ab, ac));
    normals[a] = add(normals[a], faceNormal);
    normals[b] = add(normals[b], faceNormal);
    normals[c] = add(normals[c], faceNormal);
  });

  return normals.map((normal) => normalize(normal));
}

function buildVertexNeighbors(mesh: EditableMesh) {
  const neighbors = mesh.vertices.map(() => new Set<number>());
  const hiddenFaces = new Set(getHiddenFaceIndices(mesh));

  mesh.faces.forEach(([a, b, c], faceIndex) => {
    if (hiddenFaces.has(faceIndex)) return;
    neighbors[a]?.add(b);
    neighbors[a]?.add(c);
    neighbors[b]?.add(a);
    neighbors[b]?.add(c);
    neighbors[c]?.add(a);
    neighbors[c]?.add(b);
  });

  return neighbors.map((entry) => [...entry]);
}

function getBrushFalloff(center: EditableVec3, vertex: EditableVec3, radius: number) {
  const safeRadius = Math.max(0.0001, radius);
  const ratio = distance(center, vertex) / safeRadius;
  if (ratio >= 1) return 0;
  const linear = 1 - ratio;
  return linear * linear * (3 - 2 * linear);
}

function applyBrush(params: {
  mesh: EditableMesh;
  brush: SculptBrush;
  center: EditableVec3;
  radius: number;
  strength: number;
  delta?: EditableVec3;
  brushNormal?: EditableVec3;
}) {
  const { brush, center, radius, delta, brushNormal } = params;
  const next = cloneEditableMesh(params.mesh);
  const normals = buildVertexNormals(next);
  const neighbors = brush === 'smooth' || brush === 'clay' ? buildVertexNeighbors(next) : null;
  const safeStrength = clampUnit(params.strength, 0.65);

  next.vertices.forEach((vertex, index) => {
    const falloff = getBrushFalloff(center, vertex, radius);
    if (falloff <= 0) return;

    const maskAttenuation = 1 - getVertexMaskValue(next, index);
    if (maskAttenuation <= 0.0001) return;

    const weight = safeStrength * falloff * maskAttenuation;
    const normal = normals[index] ?? { x: 0, y: 1, z: 0 };
    const sculptDirection = brushNormal
      ? normalize(
          add(
            scale(normal, dot(normal, brushNormal) >= 0 ? 0.35 : -0.15),
            scale(normalize(brushNormal), 0.85)
          ),
          normal
        )
      : normal;

    switch (brush) {
      case 'draw': {
        const amount = radius * 0.18 * weight;
        next.vertices[index] = add(vertex, scale(sculptDirection, amount));
        break;
      }
      case 'clay': {
        const amount = radius * 0.12 * weight;
        let nextVertex = add(vertex, scale(sculptDirection, amount));
        const neighborIndices = neighbors?.[index] ?? [];
        if (neighborIndices.length > 0) {
          const average = neighborIndices.reduce(
            (acc, neighborIndex) => add(acc, next.vertices[neighborIndex] ?? vertex),
            { x: 0, y: 0, z: 0 }
          );
          const averagePosition = scale(average, 1 / neighborIndices.length);
          nextVertex = add(nextVertex, scale(subtract(averagePosition, nextVertex), 0.2 * weight));
        }
        next.vertices[index] = nextVertex;
        break;
      }
      case 'grab': {
        if (!delta) return;
        next.vertices[index] = add(vertex, scale(delta, weight));
        break;
      }
      case 'smooth': {
        const neighborIndices = neighbors?.[index] ?? [];
        if (neighborIndices.length === 0) return;
        const average = neighborIndices.reduce(
          (acc, neighborIndex) => add(acc, next.vertices[neighborIndex] ?? vertex),
          { x: 0, y: 0, z: 0 }
        );
        const averagePosition = scale(average, 1 / neighborIndices.length);
        next.vertices[index] = add(vertex, scale(subtract(averagePosition, vertex), 0.35 * weight));
        break;
      }
      case 'crease': {
        const lift = scale(sculptDirection, radius * 0.22 * weight);
        const pinch = scale(subtract(center, vertex), 0.12 * weight);
        next.vertices[index] = add(add(vertex, lift), pinch);
        break;
      }
    }
  });

  return next;
}

export function sculptMesh(params: {
  mesh: EditableMesh;
  brush: SculptBrush;
  center: EditableVec3;
  radius: number;
  strength: number;
  delta?: EditableVec3;
  brushNormal?: EditableVec3;
  symmetryX?: boolean;
}) {
  const { mesh, brush, center, radius, strength, delta, brushNormal, symmetryX = false } = params;
  let next = applyBrush({
    mesh,
    brush,
    center,
    radius,
    strength,
    delta,
    brushNormal,
  });

  if (symmetryX && Math.abs(center.x) > 1e-5) {
    next = applyBrush({
      mesh: next,
      brush,
      center: { x: -center.x, y: center.y, z: center.z },
      radius,
      strength,
      delta: delta
        ? { x: -delta.x, y: delta.y, z: delta.z }
        : undefined,
      brushNormal,
    });
  }

  return next;
}
