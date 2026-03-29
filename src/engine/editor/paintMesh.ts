'use client';

import {
  cloneEditableMesh,
  getVertexMaskValue,
  type EditableColor,
  type EditableMesh,
  type EditableVec3,
} from './modelerMesh';

function clampUnit(value: number | undefined, fallback = 0) {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value ?? fallback)) : fallback;
}

function cloneColor(color?: EditableColor): EditableColor {
  return {
    r: clampUnit(color?.r, 1),
    g: clampUnit(color?.g, 1),
    b: clampUnit(color?.b, 1),
    a: clampUnit(color?.a, 1),
  };
}

function distance(left: EditableVec3, right: EditableVec3) {
  return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);
}

function normalizeWeights(weights: number[]) {
  const total = weights.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (total <= 1e-6) {
    return weights.map(() => 0);
  }
  return weights.map((value) => Math.max(0, value) / total);
}

function ensureVertexColors(mesh: EditableMesh, fill?: EditableColor) {
  const next = cloneEditableMesh(mesh);
  if (next.vertexColors && next.vertexColors.length === next.vertices.length) {
    return next;
  }
  const seed = cloneColor(fill);
  next.vertexColors = next.vertices.map(() => ({ ...seed }));
  return next;
}

function ensureWeightGroup(mesh: EditableMesh, boneName: string) {
  const normalizedBone = boneName.trim() || 'Spine';
  const next = cloneEditableMesh(mesh);
  const existingGroups = next.weightGroups ? [...next.weightGroups] : [];
  const existingIndex = existingGroups.findIndex((group) => group === normalizedBone);
  const groups = existingIndex >= 0 ? existingGroups : [...existingGroups, normalizedBone];
  const targetIndex = existingIndex >= 0 ? existingIndex : groups.length - 1;

  next.weightGroups = groups;
  next.weights = next.vertices.map((_vertex, vertexIndex) => {
    const source = Array.isArray(next.weights?.[vertexIndex]) ? [...next.weights![vertexIndex]!] : [];
    while (source.length < groups.length) {
      source.push(0);
    }
    return source.slice(0, groups.length).map((value) => clampUnit(Number(value), 0));
  });

  return {
    mesh: next,
    groupName: normalizedBone,
    groupIndex: targetIndex,
  };
}

function setTargetWeight(params: {
  row: number[];
  targetIndex: number;
  value: number;
  normalize: boolean;
  clearIndex?: number;
}) {
  const next = [...params.row];
  const highestIndex = Math.max(params.targetIndex, params.clearIndex ?? -1);
  while (next.length <= highestIndex) {
    next.push(0);
  }

  const safeValue = clampUnit(params.value, 0);
  if (!params.normalize) {
    if (
      typeof params.clearIndex === 'number' &&
      params.clearIndex >= 0 &&
      params.clearIndex !== params.targetIndex
    ) {
      next[params.clearIndex] = 0;
    }
    next[params.targetIndex] = safeValue;
    return next;
  }

  const clearIndex =
    typeof params.clearIndex === 'number' &&
    params.clearIndex >= 0 &&
    params.clearIndex !== params.targetIndex
      ? params.clearIndex
      : -1;

  let otherTotal = 0;
  next.forEach((entry, index) => {
    if (index === params.targetIndex || index === clearIndex) return;
    otherTotal += Math.max(0, entry);
  });

  const remaining = Math.max(0, 1 - safeValue);
  const scale = otherTotal > 1e-6 ? remaining / otherTotal : 0;

  next.forEach((entry, index) => {
    if (index === params.targetIndex) {
      next[index] = safeValue;
      return;
    }
    if (index === clearIndex) {
      next[index] = 0;
      return;
    }
    next[index] = otherTotal > 1e-6 ? Math.max(0, entry) * scale : 0;
  });

  return next;
}

function buildVertexAdjacency(mesh: EditableMesh) {
  const adjacency = mesh.vertices.map(() => new Set<number>());
  (mesh.faces ?? []).forEach((face) => {
    const [a, b, c] = face;
    if (mesh.vertices[a] && mesh.vertices[b]) {
      adjacency[a]?.add(b);
      adjacency[b]?.add(a);
    }
    if (mesh.vertices[b] && mesh.vertices[c]) {
      adjacency[b]?.add(c);
      adjacency[c]?.add(b);
    }
    if (mesh.vertices[c] && mesh.vertices[a]) {
      adjacency[c]?.add(a);
      adjacency[a]?.add(c);
    }
  });
  return adjacency.map((entry) => [...entry]);
}

function resolveMirroredBoneName(boneName: string) {
  const normalized = boneName.trim();
  if (!normalized) return 'Spine';
  if (normalized.endsWith('_L')) return `${normalized.slice(0, -2)}_R`;
  if (normalized.endsWith('_R')) return `${normalized.slice(0, -2)}_L`;
  if (normalized.endsWith('.L')) return `${normalized.slice(0, -2)}.R`;
  if (normalized.endsWith('.R')) return `${normalized.slice(0, -2)}.L`;
  if (normalized.endsWith('Left')) return `${normalized.slice(0, -4)}Right`;
  if (normalized.endsWith('Right')) return `${normalized.slice(0, -5)}Left`;
  if (normalized.endsWith('left')) return `${normalized.slice(0, -4)}right`;
  if (normalized.endsWith('right')) return `${normalized.slice(0, -5)}left`;
  return normalized;
}

function resolveMirrorSourceSide(
  boneName: string
): 'negative_x' | 'positive_x' | 'any' {
  const normalized = boneName.trim();
  if (
    normalized.endsWith('_L') ||
    normalized.endsWith('.L') ||
    normalized.endsWith('Left') ||
    normalized.endsWith('left')
  ) {
    return 'negative_x';
  }
  if (
    normalized.endsWith('_R') ||
    normalized.endsWith('.R') ||
    normalized.endsWith('Right') ||
    normalized.endsWith('right')
  ) {
    return 'positive_x';
  }
  return 'any';
}

function findMirroredVertexIndices(mesh: EditableMesh, sourceIndices: number[], tolerance: number) {
  const mirrored = new Map<number, number>();
  const safeTolerance = Math.max(0.0001, tolerance);

  sourceIndices.forEach((sourceIndex) => {
    const source = mesh.vertices[sourceIndex];
    if (!source) return;

    let bestIndex = -1;
    let bestScore = Number.POSITIVE_INFINITY;

    mesh.vertices.forEach((candidate, candidateIndex) => {
      if (candidateIndex === sourceIndex) return;
      const mirrorDelta = Math.abs(candidate.x + source.x);
      const yzDelta = Math.hypot(candidate.y - source.y, candidate.z - source.z);
      const score = mirrorDelta + yzDelta;
      if (mirrorDelta > safeTolerance || yzDelta > safeTolerance * 2) return;
      if (score < bestScore) {
        bestScore = score;
        bestIndex = candidateIndex;
      }
    });

    if (bestIndex >= 0) {
      mirrored.set(sourceIndex, bestIndex);
    }
  });

  return mirrored;
}

export function paintMeshVertexColors(params: {
  mesh: EditableMesh;
  center: EditableVec3;
  radius: number;
  color: EditableColor;
  strength: number;
}) {
  const { mesh, center, radius, color, strength } = params;
  const next = ensureVertexColors(mesh, { r: 1, g: 1, b: 1, a: 1 });
  const brushColor = cloneColor(color);
  const safeRadius = Math.max(0.0001, radius);
  const safeStrength = clampUnit(strength, 0.8);

  next.vertices.forEach((vertex, index) => {
    const dist = distance(vertex, center);
    if (dist > safeRadius) return;

    const maskAttenuation = 1 - getVertexMaskValue(next, index);
    if (maskAttenuation <= 0.0001) return;

    const falloff = 1 - dist / safeRadius;
    const weight = clampUnit(safeStrength * falloff * maskAttenuation, 0);
    const current = cloneColor(next.vertexColors?.[index]);
    next.vertexColors![index] = {
      r: current.r + (brushColor.r - current.r) * weight,
      g: current.g + (brushColor.g - current.g) * weight,
      b: current.b + (brushColor.b - current.b) * weight,
      a: (current.a ?? 1) + ((brushColor.a ?? 1) - (current.a ?? 1)) * weight,
    };
  });

  return next;
}

export function clearMeshVertexColors(mesh: EditableMesh) {
  const next = cloneEditableMesh(mesh);
  delete next.vertexColors;
  return next;
}

export function paintMeshWeights(params: {
  mesh: EditableMesh;
  center: EditableVec3;
  radius: number;
  boneName: string;
  strength: number;
  erase?: boolean;
  mirror?: boolean;
  smooth?: boolean;
  normalize?: boolean;
}) {
  const {
    mesh,
    center,
    radius,
    boneName,
    strength,
    erase = false,
    mirror = false,
    smooth = false,
    normalize = true,
  } = params;

  const prepared = ensureWeightGroup(mesh, boneName);
  let next = prepared.mesh;
  const safeRadius = Math.max(0.0001, radius);
  const safeStrength = clampUnit(strength, 0.7);
  const affected = new Set<number>();

  next.vertices.forEach((vertex, index) => {
    const dist = distance(vertex, center);
    if (dist > safeRadius) return;

    const maskAttenuation = 1 - getVertexMaskValue(next, index);
    if (maskAttenuation <= 0.0001) return;

    const falloff = 1 - dist / safeRadius;
    const delta = clampUnit(safeStrength * falloff * maskAttenuation, 0);
    const currentWeights = [...(next.weights?.[index] ?? [])];
    const current = currentWeights[prepared.groupIndex] ?? 0;
    currentWeights[prepared.groupIndex] = erase
      ? Math.max(0, current * (1 - delta))
      : Math.min(1, current + (1 - current) * delta);

    next.weights![index] = normalize ? normalizeWeights(currentWeights) : currentWeights;
    affected.add(index);
  });

  if (smooth && affected.size > 0) {
    [...affected].forEach((vertexIndex) => {
      const source = next.vertices[vertexIndex];
      if (!source) return;

      const neighbors = next.vertices
        .map((candidate, candidateIndex) => ({
          candidate,
          candidateIndex,
          dist: distance(source, candidate),
        }))
        .filter(({ candidateIndex, dist }) =>
          candidateIndex !== vertexIndex && dist <= safeRadius * 1.5
        );

      if (neighbors.length === 0) return;

      const average =
        neighbors.reduce((sum, entry) => sum + (next.weights?.[entry.candidateIndex]?.[prepared.groupIndex] ?? 0), 0) /
        neighbors.length;
      const row = [...(next.weights?.[vertexIndex] ?? [])];
      row[prepared.groupIndex] =
        row[prepared.groupIndex] + (average - row[prepared.groupIndex]) * 0.35;
      next.weights![vertexIndex] = normalize ? normalizeWeights(row) : row;
    });
  }

  if (mirror && affected.size > 0) {
    const mirroredBoneName = resolveMirroredBoneName(prepared.groupName);
    let mirroredGroupIndex = prepared.groupIndex;
    if (mirroredBoneName !== prepared.groupName) {
      const mirroredPrepared = ensureWeightGroup(next, mirroredBoneName);
      next = mirroredPrepared.mesh;
      mirroredGroupIndex = mirroredPrepared.groupIndex;
    }

    const mirroredMap = findMirroredVertexIndices(next, [...affected], safeRadius * 0.25);
    mirroredMap.forEach((targetVertexIndex, sourceIndex) => {
      const sourceWeight = clampUnit(
        Number(next.weights?.[sourceIndex]?.[prepared.groupIndex]),
        0
      );
      const row = [...(next.weights?.[targetVertexIndex] ?? [])];
      next.weights![targetVertexIndex] = setTargetWeight({
        row,
        targetIndex: mirroredGroupIndex,
        value: sourceWeight,
        normalize,
        clearIndex:
          mirroredGroupIndex !== prepared.groupIndex ? prepared.groupIndex : undefined,
      });
    });
  }

  return next;
}

export function clearMeshWeights(mesh: EditableMesh, boneName: string) {
  const prepared = ensureWeightGroup(mesh, boneName);
  const next = prepared.mesh;
  next.weights = next.vertices.map((_, vertexIndex) => {
    const row = [...(next.weights?.[vertexIndex] ?? [])];
    row[prepared.groupIndex] = 0;
    return normalizeWeights(row);
  });
  return next;
}

export function fillMeshWeights(params: {
  mesh: EditableMesh;
  boneName: string;
  value?: number;
  normalize?: boolean;
}) {
  const {
    mesh,
    boneName,
    value = 1,
    normalize = true,
  } = params;
  const prepared = ensureWeightGroup(mesh, boneName);
  const next = prepared.mesh;
  const safeValue = clampUnit(value, 1);

  next.weights = next.vertices.map((_vertex, vertexIndex) => {
    const row = [...(next.weights?.[vertexIndex] ?? [])];
    const maskAttenuation = 1 - getVertexMaskValue(next, vertexIndex);
    if (maskAttenuation <= 0.0001) {
      return row;
    }
    return setTargetWeight({
      row,
      targetIndex: prepared.groupIndex,
      value: safeValue,
      normalize,
    });
  });

  return next;
}

export function normalizeMeshWeights(mesh: EditableMesh) {
  const next = cloneEditableMesh(mesh);
  if (!next.weights || next.weights.length === 0) {
    return next;
  }

  next.weights = next.vertices.map((_vertex, vertexIndex) => {
    const row = [...(next.weights?.[vertexIndex] ?? [])];
    const maskAttenuation = 1 - getVertexMaskValue(next, vertexIndex);
    if (maskAttenuation <= 0.0001) {
      return row;
    }
    return normalizeWeights(row);
  });

  return next;
}

export function smoothMeshWeights(params: {
  mesh: EditableMesh;
  boneName: string;
  iterations?: number;
  normalize?: boolean;
  strength?: number;
}) {
  const {
    mesh,
    boneName,
    iterations = 1,
    normalize = true,
    strength = 0.35,
  } = params;
  const prepared = ensureWeightGroup(mesh, boneName);
  const next = prepared.mesh;
  const adjacency = buildVertexAdjacency(next);
  const safeStrength = clampUnit(strength, 0.35);
  const safeIterations = Math.max(1, Math.min(4, Math.round(iterations)));

  for (let iteration = 0; iteration < safeIterations; iteration += 1) {
    const sourceWeights = next.weights?.map((row) => [...(row ?? [])]) ?? [];
    const blended = sourceWeights.map((row) => [...row]);

    next.vertices.forEach((_vertex, vertexIndex) => {
      const neighbors = adjacency[vertexIndex] ?? [];
      if (neighbors.length === 0) return;

      const maskAttenuation = 1 - getVertexMaskValue(next, vertexIndex);
      if (maskAttenuation <= 0.0001) return;

      const average =
        neighbors.reduce(
          (sum, neighborIndex) =>
            sum +
            clampUnit(
              Number(sourceWeights[neighborIndex]?.[prepared.groupIndex]),
              0
            ),
          0
        ) / neighbors.length;

      const row = [...(sourceWeights[vertexIndex] ?? [])];
      const current = clampUnit(Number(row[prepared.groupIndex]), 0);
      row[prepared.groupIndex] = current + (average - current) * safeStrength;
      blended[vertexIndex] = normalize ? normalizeWeights(row) : row;
    });

    next.weights = blended;
  }

  return next;
}

export function mirrorMeshWeights(params: {
  mesh: EditableMesh;
  boneName: string;
  normalize?: boolean;
}) {
  const {
    mesh,
    boneName,
    normalize = true,
  } = params;
  const prepared = ensureWeightGroup(mesh, boneName);
  let next = prepared.mesh;
  const sourceSide = resolveMirrorSourceSide(prepared.groupName);
  const mirroredBoneName = resolveMirroredBoneName(prepared.groupName);
  let mirroredGroupIndex = prepared.groupIndex;
  if (mirroredBoneName !== prepared.groupName) {
    const mirroredPrepared = ensureWeightGroup(next, mirroredBoneName);
    next = mirroredPrepared.mesh;
    mirroredGroupIndex = mirroredPrepared.groupIndex;
  }

  const bounds = next.vertices.reduce(
    (acc, vertex) => ({
      minX: Math.min(acc.minX, vertex.x),
      maxX: Math.max(acc.maxX, vertex.x),
      minY: Math.min(acc.minY, vertex.y),
      maxY: Math.max(acc.maxY, vertex.y),
      minZ: Math.min(acc.minZ, vertex.z),
      maxZ: Math.max(acc.maxZ, vertex.z),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
      minZ: Number.POSITIVE_INFINITY,
      maxZ: Number.NEGATIVE_INFINITY,
    }
  );
  const tolerance =
    Math.max(
      bounds.maxX - bounds.minX,
      bounds.maxY - bounds.minY,
      bounds.maxZ - bounds.minZ,
      1
    ) * 0.01;

  const sourceIndices = next.vertices
    .map((vertex, index) => ({ vertex, index }))
    .filter(({ vertex, index }) => {
      const maskAttenuation = 1 - getVertexMaskValue(next, index);
      if (maskAttenuation <= 0.0001) return false;
      const weight = clampUnit(Number(next.weights?.[index]?.[prepared.groupIndex]), 0);
      if (weight <= 0.0001) return false;
      if (sourceSide === 'negative_x') return vertex.x <= 0;
      if (sourceSide === 'positive_x') return vertex.x >= 0;
      return true;
    })
    .map(({ index }) => index);

  const mirroredMap = findMirroredVertexIndices(
    next,
    sourceIndices.length > 0
      ? sourceIndices
      : next.vertices.map((_vertex, index) => index),
    tolerance
  );

  mirroredMap.forEach((targetVertexIndex, sourceIndex) => {
    const sourceWeight = clampUnit(
      Number(next.weights?.[sourceIndex]?.[prepared.groupIndex]),
      0
    );
    if (sourceWeight <= 0.0001) return;

    const targetRow = [...(next.weights?.[targetVertexIndex] ?? [])];
    next.weights![targetVertexIndex] = setTargetWeight({
      row: targetRow,
      targetIndex: mirroredGroupIndex,
      value: sourceWeight,
      normalize,
      clearIndex:
        mirroredGroupIndex !== prepared.groupIndex ? prepared.groupIndex : undefined,
    });

    if (mirroredGroupIndex !== prepared.groupIndex) {
      const sourceRow = [...(next.weights?.[sourceIndex] ?? [])];
      next.weights![sourceIndex] = setTargetWeight({
        row: sourceRow,
        targetIndex: prepared.groupIndex,
        value: sourceWeight,
        normalize,
        clearIndex: mirroredGroupIndex,
      });
    }
  });

  return next;
}

export function summarizeMeshWeights(mesh: EditableMesh, boneName: string) {
  const groupIndex = mesh.weightGroups?.findIndex((group) => group === boneName) ?? -1;
  if (groupIndex < 0 || !mesh.weights || mesh.weights.length === 0) {
    return {
      groupIndex: -1,
      nonZeroVertices: 0,
      maxWeight: 0,
      averageWeight: 0,
    };
  }

  let nonZeroVertices = 0;
  let maxWeight = 0;
  let totalWeight = 0;

  mesh.weights.forEach((row) => {
    const weight = clampUnit(Number(row?.[groupIndex]), 0);
    if (weight > 0.0001) {
      nonZeroVertices += 1;
    }
    maxWeight = Math.max(maxWeight, weight);
    totalWeight += weight;
  });

  return {
    groupIndex,
    nonZeroVertices,
    maxWeight,
    averageWeight: totalWeight / mesh.weights.length,
  };
}

export function buildWeightPreviewColors(mesh: EditableMesh, boneName: string) {
  const summary = summarizeMeshWeights(mesh, boneName);
  if (summary.groupIndex < 0 || !mesh.weights) {
    return undefined;
  }

  return mesh.vertices.map((_vertex, vertexIndex) => {
    const weight = clampUnit(nextWeight(mesh.weights?.[vertexIndex]?.[summary.groupIndex]), 0);
    return weightToColor(weight);
  });
}

function nextWeight(value: number | undefined) {
  return clampUnit(Number(value), 0);
}

function weightToColor(weight: number): EditableColor {
  const cold = { r: 0.08, g: 0.22, b: 0.95 };
  const mid = { r: 0.9, g: 0.85, b: 0.2 };
  const hot = { r: 1, g: 0.18, b: 0.12 };
  const pivot = 0.5;

  if (weight <= pivot) {
    const factor = weight / pivot;
    return {
      r: cold.r + (mid.r - cold.r) * factor,
      g: cold.g + (mid.g - cold.g) * factor,
      b: cold.b + (mid.b - cold.b) * factor,
      a: 1,
    };
  }

  const factor = (weight - pivot) / pivot;
  return {
    r: mid.r + (hot.r - mid.r) * factor,
    g: mid.g + (hot.g - mid.g) * factor,
    b: mid.b + (hot.b - mid.b) * factor,
    a: 1,
  };
}
