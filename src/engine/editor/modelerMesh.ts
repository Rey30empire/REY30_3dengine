export type EditableVec3 = { x: number; y: number; z: number };
export type EditableFace = [number, number, number];
export type EditableVec2 = { u: number; v: number };
export type EditableEdge = [number, number];
export type EditableColor = { r: number; g: number; b: number; a?: number };

export interface EditableMesh {
  vertices: EditableVec3[];
  faces: EditableFace[];
  uvs?: EditableVec2[];
  seamEdges?: EditableEdge[];
  vertexColors?: EditableColor[];
  weightGroups?: string[];
  weights?: number[][];
  vertexMask?: number[];
  hiddenFaces?: number[];
  faceSets?: number[];
}

export type ModelerElementMode = 'vertex' | 'edge' | 'face';

export interface SeparateMeshResult {
  remaining: EditableMesh;
  detached: EditableMesh | null;
}

export interface KnifeFaceOptions {
  amount?: number;
  segments?: number;
}

export interface SlideVerticesOptions {
  axis?: 'x' | 'y' | 'z';
  pathVertexIndices?: number[];
}

export interface RelaxVerticesOptions {
  preserveBoundary?: boolean;
}

export interface ProjectSelectionUvsOptions {
  axis?: 'x' | 'y' | 'z' | 'auto';
}

export interface ArrayMeshOptions {
  mode?: 'linear' | 'radial';
  offset?: EditableVec3;
  axis?: 'x' | 'y' | 'z';
  radius?: number;
  angle?: number;
  rotateInstances?: boolean;
}

function normalizeVertexMaskEntries(source: number[] | undefined, vertexCount: number) {
  if (!Array.isArray(source) || vertexCount <= 0) {
    return undefined;
  }

  const next = Array.from({ length: vertexCount }, (_unused, index) =>
    clampUnit(Number(source[index]), 0)
  );
  return next.some((value) => value > 0.0001) ? next : undefined;
}

function normalizeHiddenFaceEntries(source: number[] | undefined, faceCount: number) {
  if (!Array.isArray(source) || faceCount <= 0) {
    return undefined;
  }

  const next = Array.from(
    new Set(
      source
        .map((value) => Number(value))
        .filter(
          (value) =>
            Number.isInteger(value) && value >= 0 && value < faceCount
        )
    )
  ).sort((left, right) => left - right);
  return next.length > 0 ? next : undefined;
}

function normalizeFaceSetId(value: unknown) {
  const numeric = Math.round(Number(value));
  return Number.isInteger(numeric) && numeric > 0 ? numeric : 0;
}

function normalizeFaceSetEntries(source: number[] | undefined, faceCount: number) {
  if (!Array.isArray(source) || faceCount <= 0) {
    return undefined;
  }

  const next = Array.from({ length: faceCount }, (_unused, index) =>
    normalizeFaceSetId(source[index])
  );
  return next.some((value) => value > 0) ? next : undefined;
}

export function sanitizeEditableMesh(mesh: EditableMesh): EditableMesh {
  return {
    ...mesh,
    vertexMask: normalizeVertexMaskEntries(mesh.vertexMask, mesh.vertices.length),
    hiddenFaces: normalizeHiddenFaceEntries(mesh.hiddenFaces, mesh.faces.length),
    faceSets: normalizeFaceSetEntries(mesh.faceSets, mesh.faces.length),
  };
}

export function cloneEditableMesh(mesh: EditableMesh): EditableMesh {
  return sanitizeEditableMesh({
    vertices: mesh.vertices.map((vertex) => ({ ...vertex })),
    faces: mesh.faces.map((face) => [...face] as EditableFace),
    uvs: mesh.uvs ? mesh.uvs.map((uv) => ({ ...uv })) : undefined,
    seamEdges: mesh.seamEdges
      ? mesh.seamEdges.map((edge) => [...edge] as EditableEdge)
      : undefined,
    vertexColors: mesh.vertexColors
      ? mesh.vertexColors.map((color) => ({ ...color }))
      : undefined,
    weightGroups: mesh.weightGroups ? [...mesh.weightGroups] : undefined,
    weights: mesh.weights ? mesh.weights.map((entry) => [...entry]) : undefined,
    vertexMask: mesh.vertexMask ? [...mesh.vertexMask] : undefined,
    hiddenFaces: mesh.hiddenFaces ? [...mesh.hiddenFaces] : undefined,
    faceSets: mesh.faceSets ? [...mesh.faceSets] : undefined,
  });
}

export function createCubeMesh(): EditableMesh {
  return {
    vertices: [
      { x: -0.5, y: -0.5, z: -0.5 },
      { x: 0.5, y: -0.5, z: -0.5 },
      { x: 0.5, y: 0.5, z: -0.5 },
      { x: -0.5, y: 0.5, z: -0.5 },
      { x: -0.5, y: -0.5, z: 0.5 },
      { x: 0.5, y: -0.5, z: 0.5 },
      { x: 0.5, y: 0.5, z: 0.5 },
      { x: -0.5, y: 0.5, z: 0.5 },
    ],
    faces: [
      [0, 1, 2], [0, 2, 3],
      [4, 6, 5], [4, 7, 6],
      [4, 5, 1], [4, 1, 0],
      [3, 2, 6], [3, 6, 7],
      [1, 5, 6], [1, 6, 2],
      [4, 0, 3], [4, 3, 7],
    ],
  };
}

export function createPlaneMesh(): EditableMesh {
  return {
    vertices: [
      { x: -0.75, y: 0, z: -0.75 },
      { x: 0.75, y: 0, z: -0.75 },
      { x: 0.75, y: 0, z: 0.75 },
      { x: -0.75, y: 0, z: 0.75 },
    ],
    faces: [
      [0, 1, 2],
      [0, 2, 3],
    ],
  };
}

export function createPrimitiveMesh(kind: string): EditableMesh {
  switch (kind.toLowerCase()) {
    case 'plane':
      return createPlaneMesh();
    case 'cube':
    default:
      return createCubeMesh();
  }
}

export function listMeshEdges(mesh: EditableMesh): Array<[number, number]> {
  const edgeSet = new Set<string>();
  const edges: Array<[number, number]> = [];

  mesh.faces.forEach(([a, b, c]) => {
    const candidates: Array<[number, number]> = [
      [a, b],
      [b, c],
      [c, a],
    ];
    candidates.forEach(([left, right]) => {
      const sorted = left < right ? [left, right] : [right, left];
      const key = `${sorted[0]}:${sorted[1]}`;
      if (edgeSet.has(key)) return;
      edgeSet.add(key);
      edges.push([sorted[0], sorted[1]]);
    });
  });

  return edges;
}

export function getHiddenFaceIndices(mesh: EditableMesh) {
  return normalizeHiddenFaceEntries(mesh.hiddenFaces, mesh.faces.length) ?? [];
}

export function isFaceHidden(mesh: EditableMesh, faceIndex: number) {
  return getHiddenFaceIndices(mesh).includes(faceIndex);
}

export function getVisibleFaceIndices(mesh: EditableMesh) {
  const hiddenFaceSet = new Set(getHiddenFaceIndices(mesh));
  return mesh.faces.flatMap((_face, faceIndex) =>
    hiddenFaceSet.has(faceIndex) ? [] : [faceIndex]
  );
}

export function listVisibleMeshEdgeIndices(mesh: EditableMesh) {
  const visibleFaceSet = new Set(getVisibleFaceIndices(mesh));
  if (visibleFaceSet.size === 0) {
    return [];
  }

  const visibleEdgeKeys = new Set<string>();
  mesh.faces.forEach(([a, b, c], faceIndex) => {
    if (!visibleFaceSet.has(faceIndex)) return;
    visibleEdgeKeys.add(buildEdgeKey(...normalizeEdge(a, b)));
    visibleEdgeKeys.add(buildEdgeKey(...normalizeEdge(b, c)));
    visibleEdgeKeys.add(buildEdgeKey(...normalizeEdge(c, a)));
  });

  return listMeshEdges(mesh).flatMap(([left, right], edgeIndex) =>
    visibleEdgeKeys.has(buildEdgeKey(left, right)) ? [edgeIndex] : []
  );
}

export function getVertexMaskValue(mesh: EditableMesh, vertexIndex: number) {
  return clampUnit(Number(mesh.vertexMask?.[vertexIndex]), 0);
}

export function getFaceSetId(mesh: EditableMesh, faceIndex: number) {
  if (faceIndex < 0 || faceIndex >= mesh.faces.length) {
    return 0;
  }
  return normalizeFaceSetId(mesh.faceSets?.[faceIndex]);
}

export function getFaceNormal(mesh: EditableMesh, faceIndex: number) {
  const face = mesh.faces[faceIndex];
  if (!face) return { x: 0, y: 1, z: 0 };

  const [a, b, c] = face;
  const va = mesh.vertices[a];
  const vb = mesh.vertices[b];
  const vc = mesh.vertices[c];
  if (!va || !vb || !vc) return { x: 0, y: 1, z: 0 };

  const ab = {
    x: vb.x - va.x,
    y: vb.y - va.y,
    z: vb.z - va.z,
  };
  const ac = {
    x: vc.x - va.x,
    y: vc.y - va.y,
    z: vc.z - va.z,
  };
  const normal = {
    x: ab.y * ac.z - ab.z * ac.y,
    y: ab.z * ac.x - ab.x * ac.z,
    z: ab.x * ac.y - ab.y * ac.x,
  };
  const length = Math.hypot(normal.x, normal.y, normal.z) || 1;
  return {
    x: normal.x / length,
    y: normal.y / length,
    z: normal.z / length,
  };
}

export function getFaceCenter(mesh: EditableMesh, faceIndex: number) {
  const face = mesh.faces[faceIndex];
  if (!face) return { x: 0, y: 0, z: 0 };

  const [a, b, c] = face;
  const va = mesh.vertices[a];
  const vb = mesh.vertices[b];
  const vc = mesh.vertices[c];
  if (!va || !vb || !vc) return { x: 0, y: 0, z: 0 };

  return {
    x: (va.x + vb.x + vc.x) / 3,
    y: (va.y + vb.y + vc.y) / 3,
    z: (va.z + vb.z + vc.z) / 3,
  };
}

export function getEdgeMidpoint(mesh: EditableMesh, edge: [number, number]) {
  const [left, right] = edge;
  const start = mesh.vertices[left];
  const end = mesh.vertices[right];
  if (!start || !end) return { x: 0, y: 0, z: 0 };

  return {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
    z: (start.z + end.z) / 2,
  };
}

function getMeshCentroid(mesh: EditableMesh): EditableVec3 {
  if (mesh.vertices.length === 0) {
    return { x: 0, y: 0, z: 0 };
  }

  const total = mesh.vertices.reduce(
    (acc, vertex) => ({
      x: acc.x + vertex.x,
      y: acc.y + vertex.y,
      z: acc.z + vertex.z,
    }),
    { x: 0, y: 0, z: 0 }
  );

  return {
    x: total.x / mesh.vertices.length,
    y: total.y / mesh.vertices.length,
    z: total.z / mesh.vertices.length,
  };
}

function getEdgeDirection(mesh: EditableMesh, edge: [number, number]) {
  const [left, right] = edge;
  const start = mesh.vertices[left];
  const end = mesh.vertices[right];
  if (!start || !end) return { x: 1, y: 0, z: 0 };

  const direction = {
    x: end.x - start.x,
    y: end.y - start.y,
    z: end.z - start.z,
  };
  const length = Math.hypot(direction.x, direction.y, direction.z) || 1;
  return {
    x: direction.x / length,
    y: direction.y / length,
    z: direction.z / length,
  };
}

function getEdgeLength(mesh: EditableMesh, edge: [number, number]) {
  const [left, right] = edge;
  const start = mesh.vertices[left];
  const end = mesh.vertices[right];
  if (!start || !end) return 0;
  return Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z);
}

function dot(a: EditableVec3, b: EditableVec3) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function normalize(vector: EditableVec3) {
  const length = Math.hypot(vector.x, vector.y, vector.z) || 1;
  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  };
}

function subtractVectors(left: EditableVec3, right: EditableVec3): EditableVec3 {
  return {
    x: left.x - right.x,
    y: left.y - right.y,
    z: left.z - right.z,
  };
}

function addVectors(left: EditableVec3, right: EditableVec3): EditableVec3 {
  return {
    x: left.x + right.x,
    y: left.y + right.y,
    z: left.z + right.z,
  };
}

function scaleVector(vector: EditableVec3, factor: number): EditableVec3 {
  return {
    x: vector.x * factor,
    y: vector.y * factor,
    z: vector.z * factor,
  };
}

function crossVectors(left: EditableVec3, right: EditableVec3): EditableVec3 {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  };
}

function lerpVector(start: EditableVec3, end: EditableVec3, factor: number): EditableVec3 {
  return {
    x: start.x + (end.x - start.x) * factor,
    y: start.y + (end.y - start.y) * factor,
    z: start.z + (end.z - start.z) * factor,
  };
}

function vectorLength(vector: EditableVec3) {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function getDistance(left: EditableVec3, right: EditableVec3) {
  return vectorLength(subtractVectors(left, right));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function radiansFromDegrees(value: number) {
  return (value * Math.PI) / 180;
}

function lerpUv(
  left: EditableVec2 | undefined,
  right: EditableVec2 | undefined,
  factor: number
): EditableVec2 {
  const start = left ?? { u: 0.5, v: 0.5 };
  const end = right ?? start;
  return {
    u: start.u + (end.u - start.u) * factor,
    v: start.v + (end.v - start.v) * factor,
  };
}

function clampUnit(value: number, fallback = 1) {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}

function cloneVertexColor(color: EditableColor | undefined): EditableColor {
  return {
    r: clampUnit(color?.r ?? 1, 1),
    g: clampUnit(color?.g ?? 1, 1),
    b: clampUnit(color?.b ?? 1, 1),
    a: clampUnit(color?.a ?? 1, 1),
  };
}

function getVertexColor(mesh: EditableMesh, vertexIndex: number) {
  return cloneVertexColor(mesh.vertexColors?.[vertexIndex]);
}

function lerpColor(
  left: EditableColor | undefined,
  right: EditableColor | undefined,
  factor: number
): EditableColor {
  const start = cloneVertexColor(left);
  const end = cloneVertexColor(right);
  return {
    r: start.r + (end.r - start.r) * factor,
    g: start.g + (end.g - start.g) * factor,
    b: start.b + (end.b - start.b) * factor,
    a: (start.a ?? 1) + ((end.a ?? 1) - (start.a ?? 1)) * factor,
  };
}

function cloneWeightRow(weights: number[] | undefined, groupCount: number) {
  return Array.from({ length: groupCount }, (_unused, index) =>
    clampUnit(Number(weights?.[index]), 0)
  );
}

function getVertexWeights(mesh: EditableMesh, vertexIndex: number) {
  const groupCount = mesh.weightGroups?.length ?? 0;
  return cloneWeightRow(mesh.weights?.[vertexIndex], groupCount);
}

function lerpWeights(
  left: number[] | undefined,
  right: number[] | undefined,
  factor: number,
  groupCount: number
) {
  const start = cloneWeightRow(left, groupCount);
  const end = cloneWeightRow(right, groupCount);
  return start.map((value, index) => value + (end[index] - value) * factor);
}

function averageVertexColors(mesh: EditableMesh, vertexIndices: number[]) {
  if (!mesh.vertexColors || vertexIndices.length === 0) {
    return cloneVertexColor(undefined);
  }

  const total = vertexIndices.reduce(
    (acc, vertexIndex) => {
      const color = cloneVertexColor(mesh.vertexColors?.[vertexIndex]);
      return {
        r: acc.r + color.r,
        g: acc.g + color.g,
        b: acc.b + color.b,
        a: acc.a + (color.a ?? 1),
      };
    },
    { r: 0, g: 0, b: 0, a: 0 }
  );

  return {
    r: total.r / vertexIndices.length,
    g: total.g / vertexIndices.length,
    b: total.b / vertexIndices.length,
    a: total.a / vertexIndices.length,
  };
}

function averageVertexWeights(mesh: EditableMesh, vertexIndices: number[]) {
  const groupCount = mesh.weightGroups?.length ?? 0;
  if (!mesh.weights || groupCount === 0 || vertexIndices.length === 0) {
    return undefined;
  }

  const total = new Array<number>(groupCount).fill(0);
  vertexIndices.forEach((vertexIndex) => {
    const weights = cloneWeightRow(mesh.weights?.[vertexIndex], groupCount);
    weights.forEach((value, index) => {
      total[index] += value;
    });
  });

  return total.map((value) => value / vertexIndices.length);
}

function addVertex(
  next: EditableMesh,
  vertex: EditableVec3,
  uv?: EditableVec2,
  options?: {
    color?: EditableColor;
    weights?: number[];
  }
) {
  next.vertices.push(vertex);
  if (next.uvs) {
    next.uvs.push(uv ?? { u: 0.5, v: 0.5 });
  }
  if (next.vertexColors) {
    next.vertexColors.push(cloneVertexColor(options?.color));
  }
  if (next.weightGroups && next.weightGroups.length > 0) {
    next.weights = next.weights ?? [];
    next.weights.push(
      cloneWeightRow(options?.weights, next.weightGroups.length)
    );
  }
  return next.vertices.length - 1;
}

function replaceFaceWithTriangles(
  next: EditableMesh,
  faceIndex: number,
  triangles: EditableFace[]
) {
  next.faces.splice(faceIndex, 1, ...triangles);
}

function getTriangleNormal(
  vertices: EditableVec3[],
  face: EditableFace,
  fallback: EditableVec3 = { x: 0, y: 1, z: 0 }
) {
  const [a, b, c] = face;
  const va = vertices[a];
  const vb = vertices[b];
  const vc = vertices[c];
  if (!va || !vb || !vc) return fallback;

  return normalize(crossVectors(subtractVectors(vb, va), subtractVectors(vc, va)));
}

function orientTriangle(
  vertices: EditableVec3[],
  triangle: EditableFace,
  referenceNormal: EditableVec3
): EditableFace {
  const normal = getTriangleNormal(vertices, triangle);
  if (dot(normal, referenceNormal) >= 0) {
    return triangle;
  }

  return [triangle[0], triangle[2], triangle[1]];
}

function buildEdgeKey(left: number, right: number) {
  const start = Math.min(left, right);
  const end = Math.max(left, right);
  return `${start}:${end}`;
}

function normalizeEdge(left: number, right: number): EditableEdge {
  return left < right ? [left, right] : [right, left];
}

function getMeshSeamEdgeKeys(mesh: EditableMesh) {
  return new Set((mesh.seamEdges ?? []).map(([left, right]) => buildEdgeKey(left, right)));
}

function getAdjacentFacesForEdge(mesh: EditableMesh, left: number, right: number) {
  return mesh.faces
    .map((face, faceIndex) => {
      if (!face.includes(left) || !face.includes(right)) return null;
      const opposite = face.find((vertexIndex) => vertexIndex !== left && vertexIndex !== right);
      if (opposite === undefined) return null;

      return {
        faceIndex,
        face,
        opposite,
        normal: getFaceNormal(mesh, faceIndex),
      };
    })
    .filter(
      (
        entry
      ): entry is {
        faceIndex: number;
        face: EditableFace;
        opposite: number;
        normal: EditableVec3;
      } => Boolean(entry)
    );
}

function buildTopologyMaps(mesh: EditableMesh) {
  const edges = listMeshEdges(mesh);
  const edgeIndexByKey = new Map<string, number>();
  const incidentEdgeIndicesByVertex = new Map<number, number[]>();
  const faceIndicesByEdgeKey = new Map<string, number[]>();

  edges.forEach(([left, right], edgeIndex) => {
    const key = buildEdgeKey(left, right);
    edgeIndexByKey.set(key, edgeIndex);
    incidentEdgeIndicesByVertex.set(left, [
      ...(incidentEdgeIndicesByVertex.get(left) ?? []),
      edgeIndex,
    ]);
    incidentEdgeIndicesByVertex.set(right, [
      ...(incidentEdgeIndicesByVertex.get(right) ?? []),
      edgeIndex,
    ]);
  });

  mesh.faces.forEach(([a, b, c], faceIndex) => {
    [
      [a, b],
      [b, c],
      [c, a],
    ].forEach(([left, right]) => {
      const key = buildEdgeKey(left, right);
      faceIndicesByEdgeKey.set(key, [
        ...(faceIndicesByEdgeKey.get(key) ?? []),
        faceIndex,
      ]);
    });
  });

  return {
    edges,
    edgeIndexByKey,
    incidentEdgeIndicesByVertex,
    faceIndicesByEdgeKey,
  };
}

function getOtherEdgeVertex(edge: [number, number], vertex: number) {
  if (edge[0] === vertex) return edge[1];
  if (edge[1] === vertex) return edge[0];
  return null;
}

function countSharedFaces(
  faceIndicesByEdgeKey: Map<string, number[]>,
  firstEdge: [number, number],
  secondEdge: [number, number]
) {
  const firstFaces = new Set(faceIndicesByEdgeKey.get(buildEdgeKey(firstEdge[0], firstEdge[1])) ?? []);
  const secondFaces = faceIndicesByEdgeKey.get(buildEdgeKey(secondEdge[0], secondEdge[1])) ?? [];
  return secondFaces.filter((faceIndex) => firstFaces.has(faceIndex)).length;
}

interface VirtualQuad {
  boundaryEdgeIndices: number[];
  oppositeBoundaryEdgeIndexByEdge: Map<number, number>;
}

function buildVirtualQuads(
  mesh: EditableMesh,
  topology: ReturnType<typeof buildTopologyMaps>
) {
  const quadsByBoundaryEdgeIndex = new Map<number, VirtualQuad[]>();
  const processedSharedEdgeKeys = new Set<string>();

  topology.faceIndicesByEdgeKey.forEach((faceIndices, edgeKey) => {
    if (processedSharedEdgeKeys.has(edgeKey) || faceIndices.length !== 2) return;
    processedSharedEdgeKeys.add(edgeKey);

    const [firstFaceIndex, secondFaceIndex] = faceIndices;
    const firstFace = mesh.faces[firstFaceIndex];
    const secondFace = mesh.faces[secondFaceIndex];
    if (!firstFace || !secondFace) return;

    const uniqueVertices = Array.from(
      new Set([...firstFace, ...secondFace])
    );
    if (uniqueVertices.length !== 4) return;

    const boundaryEdgeKeys = new Set<string>();
    [firstFace, secondFace].forEach(([a, b, c]) => {
      [
        [a, b],
        [b, c],
        [c, a],
      ].forEach(([left, right]) => {
        const key = buildEdgeKey(left, right);
        if (key === edgeKey) return;
        boundaryEdgeKeys.add(key);
      });
    });

    if (boundaryEdgeKeys.size !== 4) return;

    const boundaryEdgeIndices = Array.from(boundaryEdgeKeys)
      .map((key) => topology.edgeIndexByKey.get(key))
      .filter((edgeIndex): edgeIndex is number => typeof edgeIndex === 'number');
    if (boundaryEdgeIndices.length !== 4) return;

    const oppositeBoundaryEdgeIndexByEdge = new Map<number, number>();
    boundaryEdgeIndices.forEach((edgeIndex) => {
      const edge = topology.edges[edgeIndex];
      if (!edge) return;

      const oppositeEdgeIndex = boundaryEdgeIndices.find((candidateIndex) => {
        if (candidateIndex === edgeIndex) return false;
        const candidate = topology.edges[candidateIndex];
        if (!candidate) return false;
        return (
          !candidate.includes(edge[0]) &&
          !candidate.includes(edge[1])
        );
      });

      if (typeof oppositeEdgeIndex === 'number') {
        oppositeBoundaryEdgeIndexByEdge.set(edgeIndex, oppositeEdgeIndex);
      }
    });

    const quad: VirtualQuad = {
      boundaryEdgeIndices,
      oppositeBoundaryEdgeIndexByEdge,
    };

    boundaryEdgeIndices.forEach((edgeIndex) => {
      quadsByBoundaryEdgeIndex.set(edgeIndex, [
        ...(quadsByBoundaryEdgeIndex.get(edgeIndex) ?? []),
        quad,
      ]);
    });
  });

  return quadsByBoundaryEdgeIndex;
}

function buildFaceAdjacency(mesh: EditableMesh) {
  const topology = buildTopologyMaps(mesh);
  const adjacency = new Map<number, Set<number>>();

  mesh.faces.forEach((_face, faceIndex) => {
    adjacency.set(faceIndex, new Set<number>());
  });

  topology.faceIndicesByEdgeKey.forEach((faceIndices) => {
    if (faceIndices.length < 2) return;
    faceIndices.forEach((faceIndex) => {
      faceIndices.forEach((neighborFaceIndex) => {
        if (neighborFaceIndex === faceIndex) return;
        adjacency.get(faceIndex)?.add(neighborFaceIndex);
      });
    });
  });

  return adjacency;
}

function findShortestIndexPath(
  startIndex: number,
  endIndex: number,
  getNeighbors: (index: number) => Array<{ index: number; cost: number }>
) {
  if (startIndex === endIndex) {
    return [startIndex];
  }

  const frontier = new Set<number>([startIndex]);
  const distanceByIndex = new Map<number, number>([[startIndex, 0]]);
  const previousByIndex = new Map<number, number | null>([[startIndex, null]]);

  while (frontier.size > 0) {
    let currentIndex = -1;
    let currentDistance = Number.POSITIVE_INFINITY;

    frontier.forEach((candidateIndex) => {
      const candidateDistance = distanceByIndex.get(candidateIndex) ?? Number.POSITIVE_INFINITY;
      if (candidateDistance < currentDistance) {
        currentIndex = candidateIndex;
        currentDistance = candidateDistance;
      }
    });

    if (currentIndex < 0) break;
    if (currentIndex === endIndex) break;
    frontier.delete(currentIndex);

    getNeighbors(currentIndex).forEach(({ index, cost }) => {
      const nextDistance = currentDistance + Math.max(cost, 0.0001);
      if (nextDistance >= (distanceByIndex.get(index) ?? Number.POSITIVE_INFINITY)) {
        return;
      }
      distanceByIndex.set(index, nextDistance);
      previousByIndex.set(index, currentIndex);
      frontier.add(index);
    });
  }

  if (!distanceByIndex.has(endIndex)) {
    return [];
  }

  const path: number[] = [];
  let cursor: number | null = endIndex;
  while (cursor !== null) {
    path.unshift(cursor);
    cursor = previousByIndex.get(cursor) ?? null;
  }

  return path;
}

function buildVertexNormals(mesh: EditableMesh) {
  const normals = mesh.vertices.map(() => ({ x: 0, y: 0, z: 0 }));

  mesh.faces.forEach((face, faceIndex) => {
    const normal = getFaceNormal(mesh, faceIndex);
    face.forEach((vertexIndex) => {
      const target = normals[vertexIndex];
      if (!target) return;
      target.x += normal.x;
      target.y += normal.y;
      target.z += normal.z;
    });
  });

  return normals.map((normal) => normalize(normal));
}

function getBoundaryEdges(mesh: EditableMesh): Array<[number, number]> {
  const edgeCounts = new Map<string, { edge: [number, number]; count: number }>();

  mesh.faces.forEach(([a, b, c]) => {
    [
      [a, b],
      [b, c],
      [c, a],
    ].forEach(([left, right]) => {
      const edge: [number, number] =
        left < right ? [left, right] : [right, left];
      const key = buildEdgeKey(edge[0], edge[1]);
      const current = edgeCounts.get(key);
      if (current) {
        current.count += 1;
        return;
      }
      edgeCounts.set(key, { edge, count: 1 });
    });
  });

  return Array.from(edgeCounts.values())
    .filter((entry) => entry.count === 1)
    .map((entry) => entry.edge);
}

function buildVertexNeighborMap(mesh: EditableMesh) {
  const neighborSets = new Map<number, Set<number>>();

  mesh.faces.forEach(([a, b, c]) => {
    [
      [a, b],
      [b, c],
      [c, a],
    ].forEach(([left, right]) => {
      if (!neighborSets.has(left)) {
        neighborSets.set(left, new Set<number>());
      }
      if (!neighborSets.has(right)) {
        neighborSets.set(right, new Set<number>());
      }
      neighborSets.get(left)?.add(right);
      neighborSets.get(right)?.add(left);
    });
  });

  return new Map(
    Array.from(neighborSets.entries()).map(([vertexIndex, neighbors]) => [
      vertexIndex,
      Array.from(neighbors),
    ])
  );
}

function buildBoundaryNeighborMap(mesh: EditableMesh) {
  const boundaryNeighborSets = new Map<number, Set<number>>();

  getBoundaryEdges(mesh).forEach(([left, right]) => {
    if (!boundaryNeighborSets.has(left)) {
      boundaryNeighborSets.set(left, new Set<number>());
    }
    if (!boundaryNeighborSets.has(right)) {
      boundaryNeighborSets.set(right, new Set<number>());
    }
    boundaryNeighborSets.get(left)?.add(right);
    boundaryNeighborSets.get(right)?.add(left);
  });

  return new Map(
    Array.from(boundaryNeighborSets.entries()).map(([vertexIndex, neighbors]) => [
      vertexIndex,
      Array.from(neighbors),
    ])
  );
}

function resolveSlideVertexTargets(
  mesh: EditableMesh,
  vertexIndex: number,
  neighborMap: Map<number, number[]>,
  boundaryNeighborMap: Map<number, number[]>
) {
  const currentVertex = mesh.vertices[vertexIndex];
  if (!currentVertex) return null;

  const preferredNeighbors = boundaryNeighborMap.get(vertexIndex);
  const candidateNeighbors = Array.from(
    new Set(
      (preferredNeighbors && preferredNeighbors.length > 0
        ? preferredNeighbors
        : neighborMap.get(vertexIndex) ?? []
      ).filter((neighborIndex) => neighborIndex !== vertexIndex)
    )
  );

  if (candidateNeighbors.length === 0) {
    return null;
  }

  if (candidateNeighbors.length === 1) {
    return {
      positive: candidateNeighbors[0],
      negative: candidateNeighbors[0],
    };
  }

  let bestPair: [number, number] | null = null;
  let bestPairScore = Number.POSITIVE_INFINITY;

  for (let leftIndex = 0; leftIndex < candidateNeighbors.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < candidateNeighbors.length; rightIndex += 1) {
      const leftNeighbor = candidateNeighbors[leftIndex];
      const rightNeighbor = candidateNeighbors[rightIndex];
      const leftDirection = normalize(
        subtractVectors(mesh.vertices[leftNeighbor], currentVertex)
      );
      const rightDirection = normalize(
        subtractVectors(mesh.vertices[rightNeighbor], currentVertex)
      );
      const pairScore = dot(leftDirection, rightDirection);
      if (pairScore < bestPairScore) {
        bestPairScore = pairScore;
        bestPair = [leftNeighbor, rightNeighbor];
      }
    }
  }

  if (!bestPair) {
    return {
      positive: candidateNeighbors[0],
      negative: candidateNeighbors[1],
    };
  }

  const [firstNeighbor, secondNeighbor] = bestPair;
  let tangent = subtractVectors(
    normalize(subtractVectors(mesh.vertices[firstNeighbor], currentVertex)),
    normalize(subtractVectors(mesh.vertices[secondNeighbor], currentVertex))
  );
  if (vectorLength(tangent) < 1e-4) {
    tangent = subtractVectors(mesh.vertices[firstNeighbor], mesh.vertices[secondNeighbor]);
  }
  tangent = normalize(tangent);

  const firstScore = dot(
    normalize(subtractVectors(mesh.vertices[firstNeighbor], currentVertex)),
    tangent
  );
  const secondScore = dot(
    normalize(subtractVectors(mesh.vertices[secondNeighbor], currentVertex)),
    tangent
  );

  return firstScore >= secondScore
    ? { positive: firstNeighbor, negative: secondNeighbor }
    : { positive: secondNeighbor, negative: firstNeighbor };
}

function resolvePathSlideTargets(pathVertexIndices: number[], vertexIndex: number) {
  const orderedPath = Array.from(
    new Set(pathVertexIndices.filter((candidateIndex) => candidateIndex >= 0))
  );
  const pathIndex = orderedPath.indexOf(vertexIndex);
  if (pathIndex === -1) return null;

  const previousVertex = orderedPath[pathIndex - 1];
  const nextVertex = orderedPath[pathIndex + 1];
  if (previousVertex === undefined && nextVertex === undefined) {
    return null;
  }

  return {
    positive: nextVertex ?? previousVertex,
    negative: previousVertex ?? nextVertex,
  };
}

function constrainVectorToAxis(vector: EditableVec3, axis?: 'x' | 'y' | 'z') {
  if (!axis) return vector;
  return {
    x: axis === 'x' ? vector.x : 0,
    y: axis === 'y' ? vector.y : 0,
    z: axis === 'z' ? vector.z : 0,
  };
}

export function moveVertices(
  mesh: EditableMesh,
  vertexIndices: number[],
  delta: EditableVec3
): EditableMesh {
  const next = cloneEditableMesh(mesh);
  vertexIndices.forEach((vertexIndex) => {
    const vertex = next.vertices[vertexIndex];
    if (!vertex) return;
    vertex.x += delta.x;
    vertex.y += delta.y;
    vertex.z += delta.z;
  });
  return next;
}

export function slideVertices(
  mesh: EditableMesh,
  vertexIndices: number[],
  amount = 0.35,
  options?: SlideVerticesOptions
): EditableMesh {
  const uniqueVertexIndices = Array.from(
    new Set(
      vertexIndices.filter(
        (vertexIndex) => vertexIndex >= 0 && vertexIndex < mesh.vertices.length
      )
    )
  );
  if (uniqueVertexIndices.length === 0 || Math.abs(amount) < 1e-4) {
    return cloneEditableMesh(mesh);
  }

  const neighborMap = buildVertexNeighborMap(mesh);
  const boundaryNeighborMap = buildBoundaryNeighborMap(mesh);
  const slideFactor = clamp(Math.abs(amount), 0.02, 1);
  const next = cloneEditableMesh(mesh);
  const pathVertexIndices = (options?.pathVertexIndices ?? []).filter(
    (vertexIndex) => vertexIndex >= 0 && vertexIndex < mesh.vertices.length
  );

  uniqueVertexIndices.forEach((vertexIndex) => {
    const targets =
      resolvePathSlideTargets(pathVertexIndices, vertexIndex) ??
      resolveSlideVertexTargets(mesh, vertexIndex, neighborMap, boundaryNeighborMap);
    if (!targets) return;

    const targetVertex =
      mesh.vertices[amount >= 0 ? targets.positive : targets.negative];
    const currentVertex = mesh.vertices[vertexIndex];
    if (!targetVertex || !currentVertex) return;

    const targetPosition = lerpVector(currentVertex, targetVertex, slideFactor);
    const constrainedDelta = constrainVectorToAxis(
      subtractVectors(targetPosition, currentVertex),
      options?.axis
    );
    next.vertices[vertexIndex] = addVectors(currentVertex, constrainedDelta);
  });

  return next;
}

export function relaxVertices(
  mesh: EditableMesh,
  vertexIndices: number[],
  strength = 0.45,
  iterations = 1,
  options?: RelaxVerticesOptions
): EditableMesh {
  const uniqueVertexIndices = Array.from(
    new Set(
      vertexIndices.filter(
        (vertexIndex) => vertexIndex >= 0 && vertexIndex < mesh.vertices.length
      )
    )
  );
  if (uniqueVertexIndices.length === 0) {
    return cloneEditableMesh(mesh);
  }

  const neighborMap = buildVertexNeighborMap(mesh);
  const boundaryNeighborMap = buildBoundaryNeighborMap(mesh);
  const relaxFactor = clamp(strength, 0.05, 1);
  const passCount = Math.max(1, Math.min(8, Math.round(iterations)));
  const preserveBoundary = options?.preserveBoundary ?? true;
  let next = cloneEditableMesh(mesh);

  for (let passIndex = 0; passIndex < passCount; passIndex += 1) {
    const snapshot = cloneEditableMesh(next);

    uniqueVertexIndices.forEach((vertexIndex) => {
      const currentVertex = snapshot.vertices[vertexIndex];
      if (!currentVertex) return;
      if (preserveBoundary && boundaryNeighborMap.has(vertexIndex)) return;

      const preferredNeighbors = boundaryNeighborMap.get(vertexIndex);
      const candidateNeighbors =
        preferredNeighbors && preferredNeighbors.length > 0
          ? preferredNeighbors
          : neighborMap.get(vertexIndex) ?? [];
      if (candidateNeighbors.length === 0) return;

      const averageNeighborPosition = scaleVector(
        candidateNeighbors.reduce(
          (acc, neighborIndex) =>
            addVectors(acc, snapshot.vertices[neighborIndex] ?? currentVertex),
          { x: 0, y: 0, z: 0 }
        ),
        1 / candidateNeighbors.length
      );

      next.vertices[vertexIndex] = lerpVector(
        currentVertex,
        averageNeighborPosition,
        relaxFactor
      );
    });
  }

  return next;
}

export function extrudeFace(
  mesh: EditableMesh,
  faceIndex: number,
  distance = 0.2
): EditableMesh {
  const next = cloneEditableMesh(mesh);
  const face = next.faces[faceIndex];
  if (!face) return next;

  const normal = getFaceNormal(next, faceIndex);
  const [a, b, c] = face;
  const baseIndices = [a, b, c];
  const extrudedIndices = baseIndices.map((vertexIndex) => {
    const vertex = next.vertices[vertexIndex];
    next.vertices.push({
      x: vertex.x + normal.x * distance,
      y: vertex.y + normal.y * distance,
      z: vertex.z + normal.z * distance,
    });
    return next.vertices.length - 1;
  }) as EditableFace;

  const [na, nb, nc] = extrudedIndices;
  next.faces.push([na, nb, nc]);
  next.faces.push([a, b, nb], [a, nb, na]);
  next.faces.push([b, c, nc], [b, nc, nb]);
  next.faces.push([c, a, na], [c, na, nc]);
  return next;
}

export function insetFace(
  mesh: EditableMesh,
  faceIndex: number,
  factor = 0.18
): EditableMesh {
  const next = cloneEditableMesh(mesh);
  const face = next.faces[faceIndex];
  if (!face) return next;

  const center = getFaceCenter(next, faceIndex);
  const [a, b, c] = face;
  const innerFace = [a, b, c].map((vertexIndex) => {
    const vertex = next.vertices[vertexIndex];
    next.vertices.push({
      x: vertex.x + (center.x - vertex.x) * factor,
      y: vertex.y + (center.y - vertex.y) * factor,
      z: vertex.z + (center.z - vertex.z) * factor,
    });
    return next.vertices.length - 1;
  }) as EditableFace;

  const [na, nb, nc] = innerFace;
  next.faces.splice(faceIndex, 1, [na, nb, nc]);
  next.faces.push([a, b, nb], [a, nb, na]);
  next.faces.push([b, c, nc], [b, nc, nb]);
  next.faces.push([c, a, na], [c, na, nc]);
  return next;
}

export function subdivideFace(mesh: EditableMesh, faceIndex: number): EditableMesh {
  const next = cloneEditableMesh(mesh);
  const face = next.faces[faceIndex];
  if (!face) return next;

  const [a, b, c] = face;
  const center = getFaceCenter(next, faceIndex);
  next.vertices.push(center);
  const centerIndex = next.vertices.length - 1;
  next.faces.splice(faceIndex, 1, [a, b, centerIndex], [b, c, centerIndex], [c, a, centerIndex]);
  return next;
}

export function subdivideEdge(mesh: EditableMesh, edgeIndex: number): EditableMesh {
  const edges = listMeshEdges(mesh);
  const edge = edges[edgeIndex];
  if (!edge) return cloneEditableMesh(mesh);

  const [left, right] = edge;
  const next = cloneEditableMesh(mesh);
  const start = next.vertices[left];
  const end = next.vertices[right];
  if (!start || !end) return next;

  next.vertices.push({
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
    z: (start.z + end.z) / 2,
  });
  const midpointIndex = next.vertices.length - 1;

  const splitFaces: EditableFace[] = [];
  next.faces.forEach((face) => {
    const [a, b, c] = face;
    const hasLeft = face.includes(left);
    const hasRight = face.includes(right);
    if (!hasLeft || !hasRight) {
      splitFaces.push(face);
      return;
    }

    const orientedLeftToRight =
      (a === left && b === right) ||
      (b === left && c === right) ||
      (c === left && a === right);
    const orientedRightToLeft =
      (a === right && b === left) ||
      (b === right && c === left) ||
      (c === right && a === left);

    let remaining = a;
    if (a !== left && a !== right) remaining = a;
    if (b !== left && b !== right) remaining = b;
    if (c !== left && c !== right) remaining = c;

    if (orientedLeftToRight) {
      splitFaces.push([left, midpointIndex, remaining], [midpointIndex, right, remaining]);
      return;
    }
    if (orientedRightToLeft) {
      splitFaces.push([right, midpointIndex, remaining], [midpointIndex, left, remaining]);
      return;
    }

    splitFaces.push(face);
  });

  next.faces = splitFaces;
  return next;
}

export function knifeFace(
  mesh: EditableMesh,
  faceIndex: number,
  options?: KnifeFaceOptions
): EditableMesh {
  const face = mesh.faces[faceIndex];
  if (!face) return cloneEditableMesh(mesh);

  const [a, b, c] = face;
  const candidates: Array<{ edge: [number, number]; length: number }> = [
    { edge: [Math.min(a, b), Math.max(a, b)], length: getEdgeLength(mesh, [a, b]) },
    { edge: [Math.min(b, c), Math.max(b, c)], length: getEdgeLength(mesh, [b, c]) },
    { edge: [Math.min(c, a), Math.max(c, a)], length: getEdgeLength(mesh, [c, a]) },
  ];
  candidates.sort((left, right) => right.length - left.length);
  const [left, right] = candidates[0]?.edge ?? [];
  if (left === undefined || right === undefined) {
    return cloneEditableMesh(mesh);
  }

  const segments = Math.max(1, Math.min(8, Math.round(options?.segments ?? 1)));
  const amount = clamp(options?.amount ?? 0.5, 0.1, 0.9);
  const fractions =
    segments === 1
      ? [amount]
      : Array.from({ length: segments }, (_unused, index) => {
          const start = Math.max(0.05, 0.5 - amount / 2);
          const end = Math.min(0.95, 0.5 + amount / 2);
          return start + ((index + 1) / (segments + 1)) * (end - start);
        });

  return splitFacesByEdgeFractions(mesh, left, right, fractions);
}

function compactMesh(next: EditableMesh) {
  const usedVertices = new Set<number>();
  next.faces.forEach((face) => {
    face.forEach((vertexIndex) => usedVertices.add(vertexIndex));
  });

  const indexMap = new Map<number, number>();
  const vertices: EditableVec3[] = [];
  const uvs = next.uvs ? [] as EditableVec2[] : undefined;
  const vertexColors = next.vertexColors ? [] as EditableColor[] : undefined;
  const vertexMask = next.vertexMask ? [] as number[] : undefined;
  const weights =
    next.weightGroups && next.weightGroups.length > 0
      ? [] as number[][]
      : undefined;
  const hiddenFaceSet = new Set(getHiddenFaceIndices(next));
  const sourceFaceSets = normalizeFaceSetEntries(next.faceSets, next.faces.length);

  next.vertices.forEach((vertex, index) => {
    if (!usedVertices.has(index)) return;
    indexMap.set(index, vertices.length);
    vertices.push({ ...vertex });
    if (uvs && next.uvs?.[index]) {
      uvs.push({ ...next.uvs[index] });
    }
    if (vertexColors) {
      vertexColors.push(cloneVertexColor(next.vertexColors?.[index]));
    }
    if (vertexMask) {
      vertexMask.push(getVertexMaskValue(next, index));
    }
    if (weights) {
      weights.push(
        cloneWeightRow(next.weights?.[index], next.weightGroups?.length ?? 0)
      );
    }
  });

  const faces: EditableFace[] = [];
  const hiddenFaces: number[] = [];
  const faceSets: number[] = [];

  next.faces.forEach((face, faceIndex) => {
    const mapped = face.map((vertexIndex) => indexMap.get(vertexIndex) ?? -1) as EditableFace;
    if (mapped.some((vertexIndex) => vertexIndex < 0)) return;
    if (mapped[0] === mapped[1] || mapped[1] === mapped[2] || mapped[0] === mapped[2]) {
      return;
    }
    const nextFaceIndex = faces.length;
    faces.push(mapped);
    if (hiddenFaceSet.has(faceIndex)) {
      hiddenFaces.push(nextFaceIndex);
    }
    faceSets.push(sourceFaceSets?.[faceIndex] ?? 0);
  });

  next.faces = faces;
  const seamEdges = next.seamEdges
    ? Array.from(
        new Map(
          next.seamEdges
            .map(([left, right]) => {
              const mappedLeft = indexMap.get(left);
              const mappedRight = indexMap.get(right);
              if (mappedLeft === undefined || mappedRight === undefined || mappedLeft === mappedRight) {
                return null;
              }
              const normalized = normalizeEdge(mappedLeft, mappedRight);
              return [buildEdgeKey(normalized[0], normalized[1]), normalized] as const;
            })
            .filter(
              (entry): entry is readonly [string, EditableEdge] =>
                Boolean(entry)
            )
        ).values()
      )
    : undefined;
  next.vertices = vertices;
  next.uvs = uvs && uvs.length === vertices.length ? uvs : undefined;
  next.seamEdges = seamEdges && seamEdges.length > 0 ? seamEdges : undefined;
  next.vertexColors =
    vertexColors && vertexColors.length === vertices.length
      ? vertexColors
      : undefined;
  next.vertexMask =
    vertexMask && vertexMask.length === vertices.length && vertexMask.some((value) => value > 0.0001)
      ? vertexMask
      : undefined;
  next.weights =
    weights &&
    weights.length === vertices.length &&
    (next.weightGroups?.length ?? 0) > 0
      ? weights
      : undefined;
  next.weightGroups =
    next.weights && (next.weightGroups?.length ?? 0) > 0
      ? [...(next.weightGroups ?? [])]
      : undefined;
  next.hiddenFaces = hiddenFaces.length > 0 ? hiddenFaces : undefined;
  next.faceSets = faceSets.some((value) => value > 0) ? faceSets : undefined;
  return sanitizeEditableMesh(next);
}

function ensureMeshUvs(mesh: EditableMesh): EditableMesh {
  if (mesh.uvs && mesh.uvs.length === mesh.vertices.length) {
    return cloneEditableMesh(mesh);
  }

  const next = cloneEditableMesh(mesh);
  next.uvs = next.vertices.map(() => ({ u: 0.5, v: 0.5 }));
  return next;
}

function getFaceSelectionVertexIndices(mesh: EditableMesh, faceIndices: number[]) {
  return Array.from(
    new Set(
      faceIndices.flatMap((faceIndex) =>
        faceIndex >= 0 && faceIndex < mesh.faces.length ? mesh.faces[faceIndex] : []
      )
    )
  );
}

function getSelectionProjectedBounds(
  mesh: EditableMesh,
  vertexIndices: number[],
  axis: 'x' | 'y' | 'z'
) {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  vertexIndices.forEach((vertexIndex) => {
    const vertex = mesh.vertices[vertexIndex];
    if (!vertex) return;
    const projected = projectVertexTo2D(vertex, axis);
    minX = Math.min(minX, projected.x);
    maxX = Math.max(maxX, projected.x);
    minY = Math.min(minY, projected.y);
    maxY = Math.max(maxY, projected.y);
  });

  return {
    minX: Number.isFinite(minX) ? minX : 0,
    maxX: Number.isFinite(maxX) ? maxX : 1,
    minY: Number.isFinite(minY) ? minY : 0,
    maxY: Number.isFinite(maxY) ? maxY : 1,
  };
}

function getSelectionUvBounds(mesh: EditableMesh, vertexIndices: number[]) {
  let minU = Number.POSITIVE_INFINITY;
  let maxU = Number.NEGATIVE_INFINITY;
  let minV = Number.POSITIVE_INFINITY;
  let maxV = Number.NEGATIVE_INFINITY;

  vertexIndices.forEach((vertexIndex) => {
    const uv = mesh.uvs?.[vertexIndex];
    if (!uv) return;
    minU = Math.min(minU, uv.u);
    maxU = Math.max(maxU, uv.u);
    minV = Math.min(minV, uv.v);
    maxV = Math.max(maxV, uv.v);
  });

  return {
    minU: Number.isFinite(minU) ? minU : 0,
    maxU: Number.isFinite(maxU) ? maxU : 1,
    minV: Number.isFinite(minV) ? minV : 0,
    maxV: Number.isFinite(maxV) ? maxV : 1,
  };
}

function getSelectionUvCenter(mesh: EditableMesh, vertexIndices: number[]) {
  const bounds = getSelectionUvBounds(mesh, vertexIndices);
  return {
    u: (bounds.minU + bounds.maxU) * 0.5,
    v: (bounds.minV + bounds.maxV) * 0.5,
  };
}

function resolveProjectionAxis(
  mesh: EditableMesh,
  faceIndices: number[],
  preferredAxis: 'x' | 'y' | 'z' | 'auto'
) {
  if (preferredAxis !== 'auto') {
    return preferredAxis;
  }

  const averageNormal = faceIndices.reduce(
    (acc, faceIndex) => addVectors(acc, getFaceNormal(mesh, faceIndex)),
    { x: 0, y: 0, z: 0 }
  );

  if (Math.abs(averageNormal.x) > Math.abs(averageNormal.y) && Math.abs(averageNormal.x) > Math.abs(averageNormal.z)) {
    return 'x';
  }
  if (Math.abs(averageNormal.y) > Math.abs(averageNormal.z)) {
    return 'y';
  }
  return 'z';
}

function getSelectionBoundaryEdges(mesh: EditableMesh, faceIndices: number[]) {
  const edgeMap = new Map<string, { count: number; oriented: [number, number] }>();

  faceIndices.forEach((faceIndex) => {
    const face = mesh.faces[faceIndex];
    if (!face) return;
    const [a, b, c] = face;
    [
      [a, b],
      [b, c],
      [c, a],
    ].forEach(([start, end]) => {
      const key = buildEdgeKey(start, end);
      const current = edgeMap.get(key);
      if (current) {
        current.count += 1;
        return;
      }
      edgeMap.set(key, {
        count: 1,
        oriented: [start, end],
      });
    });
  });

  return Array.from(edgeMap.values())
    .filter((entry) => entry.count === 1)
    .map((entry) => entry.oriented);
}

function getSelectionAverageNormal(mesh: EditableMesh, faceIndices: number[]) {
  const average = faceIndices.reduce(
    (acc, faceIndex) => addVectors(acc, getFaceNormal(mesh, faceIndex)),
    { x: 0, y: 0, z: 0 }
  );
  return vectorLength(average) < 1e-4 ? { x: 0, y: 1, z: 0 } : normalize(average);
}

function getSelectionCenterFromVertices(mesh: EditableMesh, vertexIndices: number[]) {
  if (vertexIndices.length === 0) {
    return { x: 0, y: 0, z: 0 };
  }

  const total = vertexIndices.reduce(
    (acc, vertexIndex) => addVectors(acc, mesh.vertices[vertexIndex] ?? { x: 0, y: 0, z: 0 }),
    { x: 0, y: 0, z: 0 }
  );
  return scaleVector(total, 1 / vertexIndices.length);
}

function transformFaceSelection(
  mesh: EditableMesh,
  faceIndices: number[],
  options?: {
    centerFactor?: number;
    normalOffset?: number;
    replaceSelectedFaces?: boolean;
    bridgeBoundary?: boolean;
  }
): EditableMesh {
  const selectedFaceIndices = Array.from(
    new Set(faceIndices.filter((faceIndex) => faceIndex >= 0 && faceIndex < mesh.faces.length))
  );
  if (selectedFaceIndices.length === 0) {
    return cloneEditableMesh(mesh);
  }

  const replaceSelectedFaces = options?.replaceSelectedFaces ?? true;
  const bridgeBoundary = options?.bridgeBoundary ?? replaceSelectedFaces;
  const centerFactor = clamp(options?.centerFactor ?? 0, 0, 0.95);
  const normalOffset = options?.normalOffset ?? 0;

  const selectedVertices = Array.from(
    new Set(selectedFaceIndices.flatMap((faceIndex) => mesh.faces[faceIndex] ?? []))
  );
  const selectionCenter = getSelectionCenterFromVertices(mesh, selectedVertices);
  const selectionNormal = getSelectionAverageNormal(mesh, selectedFaceIndices);
  const boundaryEdges = getSelectionBoundaryEdges(mesh, selectedFaceIndices);

  const next = cloneEditableMesh(mesh);
  const duplicateMap = new Map<number, number>();

  selectedVertices.forEach((vertexIndex) => {
    const sourceVertex = mesh.vertices[vertexIndex];
    if (!sourceVertex) return;

    let nextVertex = { ...sourceVertex };
    if (centerFactor > 0) {
      nextVertex = lerpVector(nextVertex, selectionCenter, centerFactor);
    }
    if (Math.abs(normalOffset) > 1e-4) {
      nextVertex = addVectors(nextVertex, scaleVector(selectionNormal, normalOffset));
    }

    duplicateMap.set(
      vertexIndex,
      addVertex(next, nextVertex, mesh.uvs?.[vertexIndex], {
        color: getVertexColor(mesh, vertexIndex),
        weights: getVertexWeights(mesh, vertexIndex),
      })
    );
  });

  const retainedFaces = mesh.faces.filter((_face, faceIndex) =>
    replaceSelectedFaces ? !selectedFaceIndices.includes(faceIndex) : true
  );
  next.faces = retainedFaces.map((face) => [...face] as EditableFace);

  selectedFaceIndices.forEach((faceIndex) => {
    const face = mesh.faces[faceIndex];
    if (!face) return;
    const mapped = face.map((vertexIndex) => duplicateMap.get(vertexIndex) ?? vertexIndex) as EditableFace;
    next.faces.push(mapped);
  });

  if (bridgeBoundary) {
    boundaryEdges.forEach(([start, end]) => {
      const mappedStart = duplicateMap.get(start);
      const mappedEnd = duplicateMap.get(end);
      if (mappedStart === undefined || mappedEnd === undefined) return;

      const edgeDirection = subtractVectors(mesh.vertices[end], mesh.vertices[start]);
      const sideLift = subtractVectors(next.vertices[mappedStart], mesh.vertices[start]);
      let referenceNormal = normalize(crossVectors(edgeDirection, sideLift));
      if (vectorLength(referenceNormal) < 1e-4) {
        referenceNormal = selectionNormal;
      }

      next.faces.push(
        orientTriangle(next.vertices, [start, end, mappedEnd], referenceNormal),
        orientTriangle(next.vertices, [start, mappedEnd, mappedStart], referenceNormal)
      );
    });
  }

  return compactMesh(next);
}

function splitFacesByEdgeFractions(
  mesh: EditableMesh,
  left: number,
  right: number,
  fractions: number[]
): EditableMesh {
  const uniqueFractions = Array.from(
    new Set(
      fractions
        .filter((fraction) => Number.isFinite(fraction))
        .map((fraction) => clamp(fraction, 0.05, 0.95))
    )
  ).sort((first, second) => first - second);
  if (uniqueFractions.length === 0) {
    return cloneEditableMesh(mesh);
  }

  const startVertex = mesh.vertices[left];
  const endVertex = mesh.vertices[right];
  if (!startVertex || !endVertex) {
    return cloneEditableMesh(mesh);
  }

  const adjacentFaces = getAdjacentFacesForEdge(mesh, left, right);
  if (adjacentFaces.length === 0) {
    return cloneEditableMesh(mesh);
  }

  const next = cloneEditableMesh(mesh);
  const insertedVertexIndices = uniqueFractions.map((fraction) =>
    addVertex(
      next,
      lerpVector(startVertex, endVertex, fraction),
      lerpUv(mesh.uvs?.[left], mesh.uvs?.[right], fraction),
      {
        color: lerpColor(mesh.vertexColors?.[left], mesh.vertexColors?.[right], fraction),
        weights: lerpWeights(
          mesh.weights?.[left],
          mesh.weights?.[right],
          fraction,
          mesh.weightGroups?.length ?? 0
        ),
      }
    )
  );

  adjacentFaces
    .slice()
    .sort((first, second) => second.faceIndex - first.faceIndex)
    .forEach((entry) => {
      const sequence = [left, ...insertedVertexIndices, right];
      const triangles: EditableFace[] = [];
      for (let index = 0; index < sequence.length - 1; index += 1) {
        triangles.push(
          orientTriangle(
            next.vertices,
            [sequence[index], sequence[index + 1], entry.opposite],
            entry.normal
          )
        );
      }

      replaceFaceWithTriangles(next, entry.faceIndex, triangles);
    });

  return next;
}

export function mergeVertices(mesh: EditableMesh, vertexIndices: number[]): EditableMesh {
  const uniqueIndices = Array.from(
    new Set(vertexIndices.filter((vertexIndex) => vertexIndex >= 0 && vertexIndex < mesh.vertices.length))
  );
  if (uniqueIndices.length < 2) {
    return cloneEditableMesh(mesh);
  }

  const next = cloneEditableMesh(mesh);
  const keepIndex = uniqueIndices[0];
  const centroid = uniqueIndices.reduce(
    (acc, vertexIndex) => {
      const vertex = next.vertices[vertexIndex];
      return {
        x: acc.x + vertex.x,
        y: acc.y + vertex.y,
        z: acc.z + vertex.z,
      };
    },
    { x: 0, y: 0, z: 0 }
  );
  centroid.x /= uniqueIndices.length;
  centroid.y /= uniqueIndices.length;
  centroid.z /= uniqueIndices.length;
  next.vertices[keepIndex] = centroid;

  if (next.uvs) {
    const uvCentroid = uniqueIndices.reduce(
      (acc, vertexIndex) => {
        const uv = next.uvs?.[vertexIndex] ?? { u: 0.5, v: 0.5 };
        return {
          u: acc.u + uv.u,
          v: acc.v + uv.v,
        };
      },
      { u: 0, v: 0 }
    );
    next.uvs[keepIndex] = {
      u: uvCentroid.u / uniqueIndices.length,
      v: uvCentroid.v / uniqueIndices.length,
    };
  }
  if (next.vertexColors) {
    next.vertexColors[keepIndex] = averageVertexColors(next, uniqueIndices);
  }
  if (next.weights && next.weightGroups && next.weightGroups.length > 0) {
    next.weights[keepIndex] =
      averageVertexWeights(next, uniqueIndices) ??
      cloneWeightRow(undefined, next.weightGroups.length);
  }

  next.faces = next.faces.map((face) =>
    face.map((vertexIndex) =>
      uniqueIndices.includes(vertexIndex) ? keepIndex : vertexIndex
    ) as EditableFace
  );

  return compactMesh(next);
}

function projectVertexTo2D(vertex: EditableVec3, axis: 'x' | 'y' | 'z') {
  switch (axis) {
    case 'x':
      return { x: vertex.y, y: vertex.z };
    case 'y':
      return { x: vertex.x, y: vertex.z };
    case 'z':
    default:
      return { x: vertex.x, y: vertex.y };
  }
}

function orderVerticesForFill(mesh: EditableMesh, vertexIndices: number[]) {
  const vertices = vertexIndices
    .map((vertexIndex) => ({ vertexIndex, vertex: mesh.vertices[vertexIndex] }))
    .filter((entry) => Boolean(entry.vertex));
  if (vertices.length < 3) return [] as number[];

  const normal = vertices.slice(0, 3).reduce(
    (acc, entry, index, list) => {
      const current = entry.vertex;
      const next = list[(index + 1) % list.length]?.vertex ?? current;
      acc.x += (current.y - next.y) * (current.z + next.z);
      acc.y += (current.z - next.z) * (current.x + next.x);
      acc.z += (current.x - next.x) * (current.y + next.y);
      return acc;
    },
    { x: 0, y: 0, z: 0 }
  );

  const dominantAxis =
    Math.abs(normal.x) > Math.abs(normal.y) && Math.abs(normal.x) > Math.abs(normal.z)
      ? 'x'
      : Math.abs(normal.y) > Math.abs(normal.z)
        ? 'y'
        : 'z';

  const center = vertices.reduce(
    (acc, entry) => ({
      x: acc.x + entry.vertex.x,
      y: acc.y + entry.vertex.y,
      z: acc.z + entry.vertex.z,
    }),
    { x: 0, y: 0, z: 0 }
  );
  center.x /= vertices.length;
  center.y /= vertices.length;
  center.z /= vertices.length;
  const projectedCenter = projectVertexTo2D(center, dominantAxis);

  return vertices
    .map((entry) => {
      const projected = projectVertexTo2D(entry.vertex, dominantAxis);
      return {
        vertexIndex: entry.vertexIndex,
        angle: Math.atan2(projected.y - projectedCenter.y, projected.x - projectedCenter.x),
      };
    })
    .sort((left, right) => left.angle - right.angle)
    .map((entry) => entry.vertexIndex);
}

export function fillVertices(mesh: EditableMesh, vertexIndices: number[]): EditableMesh {
  const uniqueIndices = Array.from(
    new Set(vertexIndices.filter((vertexIndex) => vertexIndex >= 0 && vertexIndex < mesh.vertices.length))
  );
  if (uniqueIndices.length < 3) {
    return cloneEditableMesh(mesh);
  }

  const next = cloneEditableMesh(mesh);
  const ordered = orderVerticesForFill(next, uniqueIndices);
  if (ordered.length < 3) return next;

  if (ordered.length === 3) {
    next.faces.push([ordered[0], ordered[1], ordered[2]]);
    return next;
  }

  for (let index = 1; index < ordered.length - 1; index += 1) {
    next.faces.push([ordered[0], ordered[index], ordered[index + 1]]);
  }
  return next;
}

export function fillEdges(mesh: EditableMesh, edgeIndices: number[]): EditableMesh {
  const edges = listMeshEdges(mesh);
  const vertices = edgeIndices.flatMap((edgeIndex) => edges[edgeIndex] ?? []);
  return fillVertices(mesh, vertices);
}

export interface PolyBuildEdgeResult {
  mesh: EditableMesh;
  createdVertexIndices: number[];
  createdEdgeIndex: number | null;
  ok: boolean;
  reason?: string;
}

export function polyBuildEdge(
  mesh: EditableMesh,
  edgeIndex: number,
  distance = 0.25
): PolyBuildEdgeResult {
  const edges = listMeshEdges(mesh);
  const sourceEdge = edges[edgeIndex];
  if (!sourceEdge) {
    return {
      mesh: cloneEditableMesh(mesh),
      createdVertexIndices: [],
      createdEdgeIndex: null,
      ok: false,
      reason: 'Arista invalida para Poly Build.',
    };
  }

  const [left, right] = sourceEdge;
  const leftVertex = mesh.vertices[left];
  const rightVertex = mesh.vertices[right];
  if (!leftVertex || !rightVertex) {
    return {
      mesh: cloneEditableMesh(mesh),
      createdVertexIndices: [],
      createdEdgeIndex: null,
      ok: false,
      reason: 'La arista seleccionada no tiene vertices validos.',
    };
  }

  const adjacentFaces = getAdjacentFacesForEdge(mesh, left, right);
  if (adjacentFaces.length > 1) {
    return {
      mesh: cloneEditableMesh(mesh),
      createdVertexIndices: [],
      createdEdgeIndex: null,
      ok: false,
      reason: 'Poly Build requiere una arista de borde abierta.',
    };
  }

  const edgeDirection = normalize(subtractVectors(rightVertex, leftVertex));
  const safeDistance = clamp(distance, 0.001, 10);
  let referenceNormal =
    adjacentFaces[0]?.normal ??
    normalize(crossVectors({ x: 0, y: 1, z: 0 }, edgeDirection));
  if (vectorLength(referenceNormal) <= 1e-6) {
    referenceNormal = normalize(crossVectors({ x: 0, y: 0, z: 1 }, edgeDirection));
  }

  let buildDirection = normalize(crossVectors(referenceNormal, edgeDirection));
  if (vectorLength(buildDirection) <= 1e-6) {
    buildDirection = normalize(crossVectors(edgeDirection, { x: 0, y: 1, z: 0 }));
  }

  if (adjacentFaces.length === 1) {
    const midpoint = scaleVector(addVectors(leftVertex, rightVertex), 0.5);
    const interiorVertex = mesh.vertices[adjacentFaces[0].opposite];
    if (interiorVertex) {
      const interiorDirection = subtractVectors(interiorVertex, midpoint);
      if (dot(buildDirection, interiorDirection) > 0) {
        buildDirection = scaleVector(buildDirection, -1);
      }
    }
  } else {
    referenceNormal = normalize(crossVectors(edgeDirection, buildDirection));
  }

  const next = cloneEditableMesh(mesh);
  const leftUv = next.uvs?.[left];
  const rightUv = next.uvs?.[right];
  const leftColor = next.vertexColors?.[left];
  const rightColor = next.vertexColors?.[right];
  const leftWeights = next.weights?.[left];
  const rightWeights = next.weights?.[right];
  const offset = scaleVector(buildDirection, safeDistance);

  const newLeftIndex = addVertex(next, addVectors(leftVertex, offset), leftUv, {
    color: leftColor,
    weights: leftWeights,
  });
  const newRightIndex = addVertex(next, addVectors(rightVertex, offset), rightUv, {
    color: rightColor,
    weights: rightWeights,
  });

  next.faces.push(
    orientTriangle(next.vertices, [left, right, newRightIndex], referenceNormal),
    orientTriangle(next.vertices, [left, newRightIndex, newLeftIndex], referenceNormal)
  );

  const createdEdgeIndex = listMeshEdges(next).findIndex(
    ([start, end]) =>
      (start === newLeftIndex && end === newRightIndex) ||
      (start === newRightIndex && end === newLeftIndex)
  );

  return {
    mesh: next,
    createdVertexIndices: [newLeftIndex, newRightIndex],
    createdEdgeIndex: createdEdgeIndex >= 0 ? createdEdgeIndex : null,
    ok: true,
  };
}

export function gridFillVertices(mesh: EditableMesh, vertexIndices: number[]): EditableMesh {
  return fillVertices(mesh, vertexIndices);
}

export function gridFillEdges(mesh: EditableMesh, edgeIndices: number[]): EditableMesh {
  return fillEdges(mesh, edgeIndices);
}

function bevelSingleEdge(
  mesh: EditableMesh,
  left: number,
  right: number,
  amount: number,
  segments: number
): EditableMesh {
  const next = cloneEditableMesh(mesh);
  const adjacentFaces = getAdjacentFacesForEdge(mesh, left, right);
  if (adjacentFaces.length === 0) {
    return next;
  }

  const cutResults: Array<{ leftIndex: number; rightIndex: number }> = [];
  const sortedFaces = adjacentFaces
    .slice()
    .sort((first, second) => second.faceIndex - first.faceIndex);

  sortedFaces.forEach((entry) => {
    const leftVertex = next.vertices[left];
    const rightVertex = next.vertices[right];
    const oppositeVertex = next.vertices[entry.opposite];
    if (!leftVertex || !rightVertex || !oppositeVertex) return;

    const leftCutIndex = addVertex(
      next,
      lerpVector(leftVertex, oppositeVertex, amount),
      next.uvs?.[left],
      {
        color: lerpColor(next.vertexColors?.[left], next.vertexColors?.[entry.opposite], amount),
        weights: lerpWeights(
          next.weights?.[left],
          next.weights?.[entry.opposite],
          amount,
          next.weightGroups?.length ?? 0
        ),
      }
    );
    const rightCutIndex = addVertex(
      next,
      lerpVector(rightVertex, oppositeVertex, amount),
      next.uvs?.[right],
      {
        color: lerpColor(next.vertexColors?.[right], next.vertexColors?.[entry.opposite], amount),
        weights: lerpWeights(
          next.weights?.[right],
          next.weights?.[entry.opposite],
          amount,
          next.weightGroups?.length ?? 0
        ),
      }
    );

    replaceFaceWithTriangles(next, entry.faceIndex, [
      orientTriangle(next.vertices, [left, leftCutIndex, entry.opposite], entry.normal),
      orientTriangle(
        next.vertices,
        [leftCutIndex, rightCutIndex, entry.opposite],
        entry.normal
      ),
      orientTriangle(next.vertices, [rightCutIndex, right, entry.opposite], entry.normal),
    ]);

    cutResults.push({ leftIndex: leftCutIndex, rightIndex: rightCutIndex });
  });

  if (cutResults.length >= 2) {
    for (let pairIndex = 0; pairIndex + 1 < cutResults.length; pairIndex += 1) {
      const first = cutResults[pairIndex];
      const second = cutResults[pairIndex + 1];
      const meshCenter = getMeshCentroid(next);
      const bridgeAverage = scaleVector(
        addVectors(
          addVectors(next.vertices[first.leftIndex], next.vertices[first.rightIndex]),
          addVectors(next.vertices[second.leftIndex], next.vertices[second.rightIndex])
        ),
        0.25
      );
      let referenceNormal = normalize(subtractVectors(bridgeAverage, meshCenter));
      if (vectorLength(referenceNormal) < 1e-4) {
        referenceNormal = normalize(
          addVectors(adjacentFaces[0].normal, adjacentFaces[Math.min(pairIndex + 1, adjacentFaces.length - 1)].normal)
        );
      }

      const rings: Array<[number, number]> = [[first.leftIndex, first.rightIndex]];
      for (let segment = 1; segment < segments; segment += 1) {
        const factor = segment / segments;
        rings.push([
          addVertex(
            next,
            lerpVector(next.vertices[first.leftIndex], next.vertices[second.leftIndex], factor),
            lerpUv(next.uvs?.[first.leftIndex], next.uvs?.[second.leftIndex], factor),
            {
              color: lerpColor(
                next.vertexColors?.[first.leftIndex],
                next.vertexColors?.[second.leftIndex],
                factor
              ),
              weights: lerpWeights(
                next.weights?.[first.leftIndex],
                next.weights?.[second.leftIndex],
                factor,
                next.weightGroups?.length ?? 0
              ),
            }
          ),
          addVertex(
            next,
            lerpVector(next.vertices[first.rightIndex], next.vertices[second.rightIndex], factor),
            lerpUv(next.uvs?.[first.rightIndex], next.uvs?.[second.rightIndex], factor),
            {
              color: lerpColor(
                next.vertexColors?.[first.rightIndex],
                next.vertexColors?.[second.rightIndex],
                factor
              ),
              weights: lerpWeights(
                next.weights?.[first.rightIndex],
                next.weights?.[second.rightIndex],
                factor,
                next.weightGroups?.length ?? 0
              ),
            }
          ),
        ]);
      }
      rings.push([second.leftIndex, second.rightIndex]);

      for (let ringIndex = 0; ringIndex + 1 < rings.length; ringIndex += 1) {
        const [leftA, rightA] = rings[ringIndex];
        const [leftB, rightB] = rings[ringIndex + 1];
        next.faces.push(
          orientTriangle(next.vertices, [leftA, rightA, rightB], referenceNormal),
          orientTriangle(next.vertices, [leftA, rightB, leftB], referenceNormal)
        );
      }
    }
  }

  return next;
}

export function bevelEdges(
  mesh: EditableMesh,
  edgeIndices: number[],
  amount = 0.18,
  segments = 1
): EditableMesh {
  const sourceEdges = listMeshEdges(mesh);
  const uniqueEdgeIndices = Array.from(
    new Set(edgeIndices.filter((edgeIndex) => edgeIndex >= 0 && edgeIndex < sourceEdges.length))
  );
  if (uniqueEdgeIndices.length === 0) {
    return cloneEditableMesh(mesh);
  }

  let next = cloneEditableMesh(mesh);
  const bevelAmount = Math.min(Math.max(amount, 0.05), 0.45);
  const bevelSegments = Math.max(1, Math.min(6, Math.round(segments)));
  uniqueEdgeIndices.forEach((edgeIndex) => {
    const [left, right] = sourceEdges[edgeIndex] ?? [];
    if (left === undefined || right === undefined) return;
    next = bevelSingleEdge(next, left, right, bevelAmount, bevelSegments);
  });

  return compactMesh(next);
}

function subdivideEdgeByVertices(mesh: EditableMesh, left: number, right: number): EditableMesh {
  const next = cloneEditableMesh(mesh);
  const edges = listMeshEdges(next);
  const edgeIndex = edges.findIndex(
    ([start, end]) =>
      (start === left && end === right) || (start === right && end === left)
  );
  if (edgeIndex === -1) return next;
  return subdivideEdge(next, edgeIndex);
}

export function selectEdgeLoop(mesh: EditableMesh, edgeIndex: number): number[] {
  const topology = buildTopologyMaps(mesh);
  const seedEdge = topology.edges[edgeIndex];
  if (!seedEdge) return [];

  const seedLength = getEdgeLength(mesh, seedEdge) || 1;
  const visited = new Set<number>([edgeIndex]);

  const traverseDirection = (startVertex: number, directionSign: 1 | -1) => {
    let currentEdgeIndex = edgeIndex;
    let currentVertex = startVertex;
    let referenceDirection = scaleVector(getEdgeDirection(mesh, seedEdge), directionSign);

    while (true) {
      const incidentEdgeIndices = topology.incidentEdgeIndicesByVertex.get(currentVertex) ?? [];
      let bestCandidateEdgeIndex = -1;
      let bestCandidateNextVertex = -1;
      let bestCandidateDirection: EditableVec3 | null = null;
      let bestCandidateScore = Number.NEGATIVE_INFINITY;

      incidentEdgeIndices.forEach((candidateEdgeIndex) => {
        if (candidateEdgeIndex === currentEdgeIndex || visited.has(candidateEdgeIndex)) return;
        const candidateEdge = topology.edges[candidateEdgeIndex];
        if (!candidateEdge) return;

        const nextVertex = getOtherEdgeVertex(candidateEdge, currentVertex);
        if (nextVertex === null) return;

        const candidateVector = subtractVectors(
          mesh.vertices[nextVertex],
          mesh.vertices[currentVertex]
        );
        if (vectorLength(candidateVector) < 1e-4) return;

        const candidateDirection = normalize(candidateVector);
        const alignment = dot(referenceDirection, candidateDirection);
        if (alignment < 0.55) return;

        const candidateLength = getEdgeLength(mesh, candidateEdge) || 1;
        const lengthRatio = candidateLength / seedLength;
        if (lengthRatio < 0.25 || lengthRatio > 4) return;

        const sharedFaceCount = countSharedFaces(
          topology.faceIndicesByEdgeKey,
          topology.edges[currentEdgeIndex] ?? seedEdge,
          candidateEdge
        );
        const score =
          alignment +
          Math.min(sharedFaceCount, 1) * 0.08 -
          Math.abs(Math.log(lengthRatio)) * 0.15;

        if (score > bestCandidateScore) {
          bestCandidateEdgeIndex = candidateEdgeIndex;
          bestCandidateNextVertex = nextVertex;
          bestCandidateDirection = candidateDirection;
          bestCandidateScore = score;
        }
      });

      if (
        bestCandidateEdgeIndex < 0 ||
        bestCandidateNextVertex < 0 ||
        !bestCandidateDirection
      ) {
        break;
      }

      visited.add(bestCandidateEdgeIndex);
      currentEdgeIndex = bestCandidateEdgeIndex;
      currentVertex = bestCandidateNextVertex;
      referenceDirection = bestCandidateDirection;
    }
  };

  traverseDirection(seedEdge[0], -1);
  traverseDirection(seedEdge[1], 1);

  return Array.from(visited).sort((left, right) => left - right);
}

export function selectEdgeRing(mesh: EditableMesh, edgeIndex: number): number[] {
  const topology = buildTopologyMaps(mesh);
  const seedEdge = topology.edges[edgeIndex];
  if (!seedEdge) return [];

  const quadsByBoundaryEdgeIndex = buildVirtualQuads(mesh, topology);
  const queue = [edgeIndex];
  const visited = new Set<number>(queue);

  while (queue.length > 0) {
    const currentEdgeIndex = queue.shift()!;
    const quads = quadsByBoundaryEdgeIndex.get(currentEdgeIndex) ?? [];

    quads.forEach((quad) => {
      const oppositeEdgeIndex = quad.oppositeBoundaryEdgeIndexByEdge.get(currentEdgeIndex);
      if (oppositeEdgeIndex === undefined || visited.has(oppositeEdgeIndex)) return;
      visited.add(oppositeEdgeIndex);
      queue.push(oppositeEdgeIndex);
    });
  }

  return Array.from(visited).sort((left, right) => left - right);
}

export function selectVertexPath(
  mesh: EditableMesh,
  startVertexIndex: number,
  endVertexIndex: number
): number[] {
  if (
    startVertexIndex < 0 ||
    endVertexIndex < 0 ||
    startVertexIndex >= mesh.vertices.length ||
    endVertexIndex >= mesh.vertices.length
  ) {
    return [];
  }

  const neighborMap = buildVertexNeighborMap(mesh);
  return findShortestIndexPath(startVertexIndex, endVertexIndex, (vertexIndex) =>
    (neighborMap.get(vertexIndex) ?? []).map((neighborIndex) => ({
      index: neighborIndex,
      cost: getDistance(mesh.vertices[vertexIndex], mesh.vertices[neighborIndex]),
    }))
  );
}

export function selectEdgePath(
  mesh: EditableMesh,
  startEdgeIndex: number,
  endEdgeIndex: number
): number[] {
  const topology = buildTopologyMaps(mesh);
  const startEdge = topology.edges[startEdgeIndex];
  const endEdge = topology.edges[endEdgeIndex];
  if (!startEdge || !endEdge) {
    return [];
  }

  return findShortestIndexPath(startEdgeIndex, endEdgeIndex, (currentEdgeIndex) => {
    const currentEdge = topology.edges[currentEdgeIndex];
    if (!currentEdge) return [];

    const adjacentEdgeIndices = new Set<number>();
    currentEdge.forEach((vertexIndex) => {
      (topology.incidentEdgeIndicesByVertex.get(vertexIndex) ?? []).forEach((neighborEdgeIndex) => {
        if (neighborEdgeIndex === currentEdgeIndex) return;
        adjacentEdgeIndices.add(neighborEdgeIndex);
      });
    });

    const currentMidpoint = getEdgeMidpoint(mesh, currentEdge);
    return Array.from(adjacentEdgeIndices).map((neighborEdgeIndex) => ({
      index: neighborEdgeIndex,
      cost: getDistance(
        currentMidpoint,
        getEdgeMidpoint(mesh, topology.edges[neighborEdgeIndex]!)
      ),
    }));
  });
}

export function selectFaceIsland(mesh: EditableMesh, faceIndex: number): number[] {
  if (faceIndex < 0 || faceIndex >= mesh.faces.length) {
    return [];
  }

  const adjacency = buildFaceAdjacency(mesh);
  const visited = new Set<number>([faceIndex]);
  const queue = [faceIndex];

  while (queue.length > 0) {
    const currentFaceIndex = queue.shift()!;
    (adjacency.get(currentFaceIndex) ?? []).forEach((neighborFaceIndex) => {
      if (visited.has(neighborFaceIndex)) return;
      visited.add(neighborFaceIndex);
      queue.push(neighborFaceIndex);
    });
  }

  return Array.from(visited).sort((left, right) => left - right);
}

function buildSeamAwareFaceAdjacency(mesh: EditableMesh) {
  const topology = buildTopologyMaps(mesh);
  const seamEdgeKeys = getMeshSeamEdgeKeys(mesh);
  const adjacency = new Map<number, Set<number>>();

  mesh.faces.forEach((_face, faceIndex) => {
    adjacency.set(faceIndex, new Set<number>());
  });

  topology.faceIndicesByEdgeKey.forEach((faceIndices, edgeKey) => {
    if (seamEdgeKeys.has(edgeKey) || faceIndices.length < 2) {
      return;
    }

    faceIndices.forEach((faceIndex, faceIndexPosition) => {
      faceIndices.forEach((neighborFaceIndex, neighborPosition) => {
        if (faceIndexPosition === neighborPosition) return;
        adjacency.get(faceIndex)?.add(neighborFaceIndex);
      });
    });
  });

  return adjacency;
}

function collectFaceGroup(
  startFaceIndex: number,
  adjacency: Map<number, Set<number>>,
  visited: Set<number>
) {
  const queue = [startFaceIndex];
  const group: number[] = [];
  visited.add(startFaceIndex);

  while (queue.length > 0) {
    const currentFaceIndex = queue.shift()!;
    group.push(currentFaceIndex);

    (adjacency.get(currentFaceIndex) ?? new Set<number>()).forEach((neighborFaceIndex) => {
      if (visited.has(neighborFaceIndex)) return;
      visited.add(neighborFaceIndex);
      queue.push(neighborFaceIndex);
    });
  }

  return group.sort((left, right) => left - right);
}

function getUvIslandFaceGroups(mesh: EditableMesh) {
  if (mesh.faces.length === 0) {
    return [];
  }

  const adjacency = buildSeamAwareFaceAdjacency(mesh);
  const visited = new Set<number>();
  const groups: number[][] = [];

  for (let faceIndex = 0; faceIndex < mesh.faces.length; faceIndex += 1) {
    if (visited.has(faceIndex)) continue;
    groups.push(collectFaceGroup(faceIndex, adjacency, visited));
  }

  return groups;
}

function getVertexPositionKey(vertex: EditableVec3) {
  return `${vertex.x.toFixed(6)}:${vertex.y.toFixed(6)}:${vertex.z.toFixed(6)}`;
}

function getPositionEdgeKey(mesh: EditableMesh, edge: EditableEdge) {
  const left = mesh.vertices[edge[0]];
  const right = mesh.vertices[edge[1]];
  if (!left || !right) {
    return buildEdgeKey(edge[0], edge[1]);
  }

  const leftKey = getVertexPositionKey(left);
  const rightKey = getVertexPositionKey(right);
  return leftKey < rightKey ? `${leftKey}|${rightKey}` : `${rightKey}|${leftKey}`;
}

function splitMeshByUvIslands(mesh: EditableMesh): EditableMesh {
  const seamEdgeKeys = getMeshSeamEdgeKeys(mesh);
  if (seamEdgeKeys.size === 0) {
    return cloneEditableMesh(mesh);
  }

  const islands = getUvIslandFaceGroups(mesh);
  if (islands.length <= 1) {
    return cloneEditableMesh(mesh);
  }

  const islandIndexByFace = new Map<number, number>();
  islands.forEach((group, islandIndex) => {
    group.forEach((faceIndex) => islandIndexByFace.set(faceIndex, islandIndex));
  });

  const next: EditableMesh = {
    vertices: [],
    faces: [],
    uvs: mesh.uvs ? [] : undefined,
    seamEdges: [],
  };
  const vertexMapByIsland = islands.map(() => new Map<number, number>());
  const seamEdgesByKey = new Map<string, EditableEdge>();

  mesh.faces.forEach((face, faceIndex) => {
    const islandIndex = islandIndexByFace.get(faceIndex) ?? 0;
    const islandVertexMap = vertexMapByIsland[islandIndex]!;
    const mappedFace = face.map((vertexIndex) => {
      const existingVertexIndex = islandVertexMap.get(vertexIndex);
      if (existingVertexIndex !== undefined) {
        return existingVertexIndex;
      }

      const sourceVertex = mesh.vertices[vertexIndex] ?? { x: 0, y: 0, z: 0 };
      const sourceUv = mesh.uvs?.[vertexIndex];
      next.vertices.push({ ...sourceVertex });
      if (next.uvs) {
        next.uvs.push(sourceUv ? { ...sourceUv } : { u: 0.5, v: 0.5 });
      }
      const createdVertexIndex = next.vertices.length - 1;
      islandVertexMap.set(vertexIndex, createdVertexIndex);
      return createdVertexIndex;
    }) as EditableFace;

    next.faces.push(mappedFace);

    const [a, b, c] = face;
    const mappedEdges: Array<readonly [EditableEdge, EditableEdge]> = [
      [normalizeEdge(a, b), normalizeEdge(mappedFace[0], mappedFace[1])],
      [normalizeEdge(b, c), normalizeEdge(mappedFace[1], mappedFace[2])],
      [normalizeEdge(c, a), normalizeEdge(mappedFace[2], mappedFace[0])],
    ];

    mappedEdges.forEach(([originalEdge, mappedEdge]) => {
      const originalKey = buildEdgeKey(originalEdge[0], originalEdge[1]);
      if (!seamEdgeKeys.has(originalKey)) return;
      seamEdgesByKey.set(buildEdgeKey(mappedEdge[0], mappedEdge[1]), mappedEdge);
    });
  });

  next.seamEdges = Array.from(seamEdgesByKey.values());
  return next;
}

export function selectUvIsland(mesh: EditableMesh, faceIndex: number): number[] {
  if (faceIndex < 0 || faceIndex >= mesh.faces.length) {
    return [];
  }

  const adjacency = buildSeamAwareFaceAdjacency(mesh);
  return collectFaceGroup(faceIndex, adjacency, new Set<number>());
}

export function markSeamEdges(mesh: EditableMesh, edgeIndices: number[]): EditableMesh {
  const sourceEdges = listMeshEdges(mesh);
  const edgeKeys = new Map(
    (mesh.seamEdges ?? []).map((edge) => [buildEdgeKey(edge[0], edge[1]), normalizeEdge(edge[0], edge[1])])
  );

  edgeIndices.forEach((edgeIndex) => {
    const edge = sourceEdges[edgeIndex];
    if (!edge) return;
    const normalized = normalizeEdge(edge[0], edge[1]);
    edgeKeys.set(buildEdgeKey(normalized[0], normalized[1]), normalized);
  });

  const next = cloneEditableMesh(mesh);
  next.seamEdges = edgeKeys.size > 0 ? Array.from(edgeKeys.values()) : undefined;
  return next;
}

export function clearSeamEdges(mesh: EditableMesh, edgeIndices: number[]): EditableMesh {
  if (!mesh.seamEdges || mesh.seamEdges.length === 0) {
    return cloneEditableMesh(mesh);
  }

  const sourceEdges = listMeshEdges(mesh);
  const positionEdgeKeysToClear = new Set<string>();
  edgeIndices.forEach((edgeIndex) => {
    const edge = sourceEdges[edgeIndex];
    if (!edge) return;
    positionEdgeKeysToClear.add(getPositionEdgeKey(mesh, normalizeEdge(edge[0], edge[1])));
  });

  if (positionEdgeKeysToClear.size === 0) {
    return cloneEditableMesh(mesh);
  }

  const verticesToWeld = new Set<number>();
  const next = cloneEditableMesh(mesh);
  next.seamEdges = (next.seamEdges ?? []).filter((edge) => {
    const shouldClear = positionEdgeKeysToClear.has(getPositionEdgeKey(next, edge));
    if (shouldClear) {
      verticesToWeld.add(edge[0]);
      verticesToWeld.add(edge[1]);
    }
    return !shouldClear;
  });

  const cleared = next.seamEdges.length > 0 ? next : { ...next, seamEdges: undefined };
  if (verticesToWeld.size === 0) {
    return cleared;
  }

  return weldVerticesByDistance(cleared, 1e-6, Array.from(verticesToWeld));
}

export function selectFacesByNormal(
  mesh: EditableMesh,
  faceIndex: number,
  toleranceDegrees = 15
): number[] {
  if (faceIndex < 0 || faceIndex >= mesh.faces.length) {
    return [];
  }

  const adjacency = buildFaceAdjacency(mesh);
  const seedNormal = getFaceNormal(mesh, faceIndex);
  const maxAngle = radiansFromDegrees(clamp(toleranceDegrees, 0, 89.9));
  const visited = new Set<number>([faceIndex]);
  const queue = [faceIndex];

  while (queue.length > 0) {
    const currentFaceIndex = queue.shift()!;
    (adjacency.get(currentFaceIndex) ?? []).forEach((neighborFaceIndex) => {
      if (visited.has(neighborFaceIndex)) return;
      const neighborNormal = getFaceNormal(mesh, neighborFaceIndex);
      const angle = Math.acos(clamp(dot(seedNormal, neighborNormal), -1, 1));
      if (angle > maxAngle) return;
      visited.add(neighborFaceIndex);
      queue.push(neighborFaceIndex);
    });
  }

  return Array.from(visited).sort((left, right) => left - right);
}

export function growFaceSelection(
  mesh: EditableMesh,
  faceIndices: number[],
  steps = 1
): number[] {
  const currentSelection = new Set(
    faceIndices.filter((faceIndex) => faceIndex >= 0 && faceIndex < mesh.faces.length)
  );
  if (currentSelection.size === 0) {
    return [];
  }

  const adjacency = buildFaceAdjacency(mesh);
  const stepCount = Math.max(1, Math.min(8, Math.round(steps)));
  let frontier = new Set<number>(currentSelection);

  for (let stepIndex = 0; stepIndex < stepCount; stepIndex += 1) {
    const nextFrontier = new Set<number>();
    frontier.forEach((faceIndex) => {
      (adjacency.get(faceIndex) ?? []).forEach((neighborFaceIndex) => {
        if (currentSelection.has(neighborFaceIndex)) return;
        currentSelection.add(neighborFaceIndex);
        nextFrontier.add(neighborFaceIndex);
      });
    });
    if (nextFrontier.size === 0) break;
    frontier = nextFrontier;
  }

  return Array.from(currentSelection).sort((left, right) => left - right);
}

export function shrinkFaceSelection(
  mesh: EditableMesh,
  faceIndices: number[],
  steps = 1
): number[] {
  const topology = buildTopologyMaps(mesh);
  let currentSelection = new Set(
    faceIndices.filter((faceIndex) => faceIndex >= 0 && faceIndex < mesh.faces.length)
  );
  if (currentSelection.size === 0) {
    return [];
  }

  const stepCount = Math.max(1, Math.min(8, Math.round(steps)));

  for (let stepIndex = 0; stepIndex < stepCount; stepIndex += 1) {
    const boundaryFaces = new Set<number>();

    currentSelection.forEach((faceIndex) => {
      const face = mesh.faces[faceIndex];
      if (!face) return;

      const [a, b, c] = face;
      const edgeKeys = [
        buildEdgeKey(a, b),
        buildEdgeKey(b, c),
        buildEdgeKey(c, a),
      ];
      const isBoundary = edgeKeys.some((edgeKey) => {
        const adjacentFaceIndices = topology.faceIndicesByEdgeKey.get(edgeKey) ?? [];
        if (adjacentFaceIndices.length < 2) {
          return true;
        }
        return adjacentFaceIndices.some((neighborFaceIndex) => !currentSelection.has(neighborFaceIndex));
      });

      if (isBoundary) {
        boundaryFaces.add(faceIndex);
      }
    });

    if (boundaryFaces.size === 0) break;
    currentSelection = new Set(
      Array.from(currentSelection).filter((faceIndex) => !boundaryFaces.has(faceIndex))
    );
    if (currentSelection.size === 0) break;
  }

  return Array.from(currentSelection).sort((left, right) => left - right);
}

export function projectSelectionUvs(
  mesh: EditableMesh,
  faceIndices: number[],
  options?: ProjectSelectionUvsOptions
): EditableMesh {
  const selectedFaceIndices = Array.from(
    new Set(faceIndices.filter((faceIndex) => faceIndex >= 0 && faceIndex < mesh.faces.length))
  );
  if (selectedFaceIndices.length === 0) {
    return cloneEditableMesh(mesh);
  }

  const next = ensureMeshUvs(mesh);
  const vertexIndices = getFaceSelectionVertexIndices(next, selectedFaceIndices);
  if (vertexIndices.length === 0 || !next.uvs) {
    return next;
  }

  const axis = resolveProjectionAxis(next, selectedFaceIndices, options?.axis ?? 'auto');
  const bounds = getSelectionProjectedBounds(next, vertexIndices, axis);
  const spanX = bounds.maxX - bounds.minX || 1;
  const spanY = bounds.maxY - bounds.minY || 1;

  vertexIndices.forEach((vertexIndex) => {
    const vertex = next.vertices[vertexIndex];
    if (!vertex || !next.uvs) return;
    const projected = projectVertexTo2D(vertex, axis);
    next.uvs[vertexIndex] = {
      u: (projected.x - bounds.minX) / spanX,
      v: (projected.y - bounds.minY) / spanY,
    };
  });

  return next;
}

export function fitSelectionUvs(
  mesh: EditableMesh,
  faceIndices: number[],
  padding = 0
): EditableMesh {
  const selectedFaceIndices = Array.from(
    new Set(faceIndices.filter((faceIndex) => faceIndex >= 0 && faceIndex < mesh.faces.length))
  );
  if (selectedFaceIndices.length === 0) {
    return cloneEditableMesh(mesh);
  }

  const next = ensureMeshUvs(mesh);
  const vertexIndices = getFaceSelectionVertexIndices(next, selectedFaceIndices);
  if (vertexIndices.length === 0 || !next.uvs) {
    return next;
  }

  const uvBounds = getSelectionUvBounds(next, vertexIndices);
  const spanU = uvBounds.maxU - uvBounds.minU || 1;
  const spanV = uvBounds.maxV - uvBounds.minV || 1;
  const safePadding = clamp(padding, 0, 0.45);
  const targetSpan = 1 - safePadding * 2;

  vertexIndices.forEach((vertexIndex) => {
    const uv = next.uvs?.[vertexIndex];
    if (!uv || !next.uvs) return;
    next.uvs[vertexIndex] = {
      u: safePadding + ((uv.u - uvBounds.minU) / spanU) * targetSpan,
      v: safePadding + ((uv.v - uvBounds.minV) / spanV) * targetSpan,
    };
  });

  return next;
}

export function packUvIslands(mesh: EditableMesh, padding = 0.03): EditableMesh {
  const baseMesh =
    mesh.uvs && mesh.uvs.length === mesh.vertices.length
      ? cloneEditableMesh(mesh)
      : unwrapMeshPlanar(mesh);
  const splitMesh = splitMeshByUvIslands(baseMesh);
  const islands = getUvIslandFaceGroups(splitMesh);
  if (islands.length === 0) {
    return splitMesh;
  }

  const next = ensureMeshUvs(splitMesh);
  if (!next.uvs) {
    return next;
  }

  const safePadding = clamp(padding, 0, 0.12);
  const columns = Math.max(1, Math.ceil(Math.sqrt(islands.length)));
  const rows = Math.max(1, Math.ceil(islands.length / columns));
  const cellWidth = 1 / columns;
  const cellHeight = 1 / rows;

  islands.forEach((faceIndices, islandIndex) => {
    const vertexIndices = getFaceSelectionVertexIndices(next, faceIndices);
    if (vertexIndices.length === 0) return;

    const bounds = getSelectionUvBounds(next, vertexIndices);
    const spanU = bounds.maxU - bounds.minU || 1;
    const spanV = bounds.maxV - bounds.minV || 1;
    const column = islandIndex % columns;
    const row = Math.floor(islandIndex / columns);
    const originU = column * cellWidth;
    const originV = row * cellHeight;
    const marginU = Math.min(cellWidth * 0.35, safePadding);
    const marginV = Math.min(cellHeight * 0.35, safePadding);
    const innerWidth = Math.max(1e-4, cellWidth - marginU * 2);
    const innerHeight = Math.max(1e-4, cellHeight - marginV * 2);
    const fitScale = Math.min(innerWidth / spanU, innerHeight / spanV);
    const packedWidth = spanU * fitScale;
    const packedHeight = spanV * fitScale;
    const offsetU = originU + marginU + (innerWidth - packedWidth) * 0.5;
    const offsetV = originV + marginV + (innerHeight - packedHeight) * 0.5;

    vertexIndices.forEach((vertexIndex) => {
      const uv = next.uvs?.[vertexIndex];
      if (!uv || !next.uvs) return;
      next.uvs[vertexIndex] = {
        u: offsetU + (uv.u - bounds.minU) * fitScale,
        v: offsetV + (uv.v - bounds.minV) * fitScale,
      };
    });
  });

  return next;
}

export function translateSelectionUvs(
  mesh: EditableMesh,
  faceIndices: number[],
  offsetU = 0,
  offsetV = 0
): EditableMesh {
  const selectedFaceIndices = Array.from(
    new Set(faceIndices.filter((faceIndex) => faceIndex >= 0 && faceIndex < mesh.faces.length))
  );
  if (selectedFaceIndices.length === 0) {
    return cloneEditableMesh(mesh);
  }

  const next = ensureMeshUvs(mesh);
  const vertexIndices = getFaceSelectionVertexIndices(next, selectedFaceIndices);
  if (!next.uvs) {
    return next;
  }

  vertexIndices.forEach((vertexIndex) => {
    const uv = next.uvs?.[vertexIndex];
    if (!uv || !next.uvs) return;
    next.uvs[vertexIndex] = {
      u: uv.u + offsetU,
      v: uv.v + offsetV,
    };
  });

  return next;
}

export function scaleSelectionUvs(
  mesh: EditableMesh,
  faceIndices: number[],
  scaleU = 1,
  scaleV = 1
): EditableMesh {
  const selectedFaceIndices = Array.from(
    new Set(faceIndices.filter((faceIndex) => faceIndex >= 0 && faceIndex < mesh.faces.length))
  );
  if (selectedFaceIndices.length === 0) {
    return cloneEditableMesh(mesh);
  }

  const next = ensureMeshUvs(mesh);
  const vertexIndices = getFaceSelectionVertexIndices(next, selectedFaceIndices);
  if (vertexIndices.length === 0 || !next.uvs) {
    return next;
  }

  const center = getSelectionUvCenter(next, vertexIndices);
  vertexIndices.forEach((vertexIndex) => {
    const uv = next.uvs?.[vertexIndex];
    if (!uv || !next.uvs) return;
    next.uvs[vertexIndex] = {
      u: center.u + (uv.u - center.u) * scaleU,
      v: center.v + (uv.v - center.v) * scaleV,
    };
  });

  return next;
}

export function rotateSelectionUvs(
  mesh: EditableMesh,
  faceIndices: number[],
  degrees = 0
): EditableMesh {
  const selectedFaceIndices = Array.from(
    new Set(faceIndices.filter((faceIndex) => faceIndex >= 0 && faceIndex < mesh.faces.length))
  );
  if (selectedFaceIndices.length === 0 || Math.abs(degrees) < 1e-4) {
    return cloneEditableMesh(mesh);
  }

  const next = ensureMeshUvs(mesh);
  const vertexIndices = getFaceSelectionVertexIndices(next, selectedFaceIndices);
  if (vertexIndices.length === 0 || !next.uvs) {
    return next;
  }

  const center = getSelectionUvCenter(next, vertexIndices);
  const radians = radiansFromDegrees(degrees);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  vertexIndices.forEach((vertexIndex) => {
    const uv = next.uvs?.[vertexIndex];
    if (!uv || !next.uvs) return;
    const deltaU = uv.u - center.u;
    const deltaV = uv.v - center.v;
    next.uvs[vertexIndex] = {
      u: center.u + deltaU * cos - deltaV * sin,
      v: center.v + deltaU * sin + deltaV * cos,
    };
  });

  return next;
}

export function bridgeEdges(mesh: EditableMesh, edgeIndices: number[]): EditableMesh {
  const sourceEdges = listMeshEdges(mesh);
  const uniqueEdgeIndices = Array.from(
    new Set(edgeIndices.filter((edgeIndex) => edgeIndex >= 0 && edgeIndex < sourceEdges.length))
  );
  if (uniqueEdgeIndices.length < 2) {
    return cloneEditableMesh(mesh);
  }

  const next = cloneEditableMesh(mesh);
  const selectedEdges = uniqueEdgeIndices
    .map((edgeIndex) => sourceEdges[edgeIndex])
    .filter((edge): edge is [number, number] => Boolean(edge));

  for (let pairIndex = 0; pairIndex + 1 < selectedEdges.length; pairIndex += 2) {
    const firstEdge = selectedEdges[pairIndex];
    let secondEdge = selectedEdges[pairIndex + 1];
    if (!firstEdge || !secondEdge) continue;
    if (firstEdge.some((vertexIndex) => secondEdge.includes(vertexIndex))) continue;

    const [a, b] = firstEdge;
    const directCost =
      getDistance(next.vertices[a], next.vertices[secondEdge[0]]) +
      getDistance(next.vertices[b], next.vertices[secondEdge[1]]);
    const crossedCost =
      getDistance(next.vertices[a], next.vertices[secondEdge[1]]) +
      getDistance(next.vertices[b], next.vertices[secondEdge[0]]);

    if (crossedCost < directCost) {
      secondEdge = [secondEdge[1], secondEdge[0]];
    }

    const [c, d] = secondEdge;
    const firstMidpoint = getEdgeMidpoint(next, firstEdge);
    const secondMidpoint = getEdgeMidpoint(next, secondEdge);
    let referenceNormal = normalize(
      crossVectors(
        subtractVectors(next.vertices[b], next.vertices[a]),
        subtractVectors(secondMidpoint, firstMidpoint)
      )
    );
    if (vectorLength(referenceNormal) < 1e-4) {
      referenceNormal = { x: 0, y: 1, z: 0 };
    }

    next.faces.push(
      orientTriangle(next.vertices, [a, b, d], referenceNormal),
      orientTriangle(next.vertices, [a, d, c], referenceNormal)
    );
  }

  return next;
}

function groupSelectedEdges(selectedEdges: Array<[number, number]>) {
  const groups: Array<Array<[number, number]>> = [];
  const visited = new Set<number>();

  for (let startIndex = 0; startIndex < selectedEdges.length; startIndex += 1) {
    if (visited.has(startIndex)) continue;

    const group: Array<[number, number]> = [];
    const queue = [startIndex];
    visited.add(startIndex);

    while (queue.length > 0) {
      const edgeIndex = queue.shift()!;
      const edge = selectedEdges[edgeIndex];
      if (!edge) continue;
      group.push(edge);

      selectedEdges.forEach((candidate, candidateIndex) => {
        if (visited.has(candidateIndex)) return;
        if (
          candidate.includes(edge[0]) ||
          candidate.includes(edge[1])
        ) {
          visited.add(candidateIndex);
          queue.push(candidateIndex);
        }
      });
    }

    if (group.length > 0) {
      groups.push(group);
    }
  }

  return groups;
}

function orderEdgeGroupVertices(group: Array<[number, number]>) {
  if (group.length === 0) return null;

  const adjacency = new Map<number, number[]>();
  group.forEach(([left, right]) => {
    adjacency.set(left, [...(adjacency.get(left) ?? []), right]);
    adjacency.set(right, [...(adjacency.get(right) ?? []), left]);
  });

  if (Array.from(adjacency.values()).some((neighbors) => neighbors.length > 2 || neighbors.length === 0)) {
    return null;
  }

  const closed = Array.from(adjacency.values()).every((neighbors) => neighbors.length === 2);
  const start =
    Array.from(adjacency.entries()).find(([_vertex, neighbors]) => neighbors.length === 1)?.[0] ??
    group[0][0];

  const order = [start];
  const usedEdges = new Set<string>();
  let current = start;
  let previous: number | null = null;

  while (true) {
    const neighbors = adjacency.get(current) ?? [];
    const nextVertex =
      neighbors.find((neighbor) => {
        if (neighbor === previous && neighbors.length > 1) return false;
        return !usedEdges.has(buildEdgeKey(current, neighbor));
      }) ??
      neighbors.find((neighbor) => !usedEdges.has(buildEdgeKey(current, neighbor)));

    if (nextVertex === undefined) {
      break;
    }

    usedEdges.add(buildEdgeKey(current, nextVertex));
    previous = current;
    current = nextVertex;
    if (closed && current === start) {
      break;
    }
    order.push(current);
  }

  if (usedEdges.size !== group.length) {
    return null;
  }

  return {
    vertices: order,
    closed,
  };
}

function getEdgeGroupCentroid(mesh: EditableMesh, group: Array<[number, number]>) {
  const uniqueVertices = Array.from(new Set(group.flatMap((edge) => edge)));
  return scaleVector(
    uniqueVertices.reduce(
      (acc, vertexIndex) => addVectors(acc, mesh.vertices[vertexIndex]),
      { x: 0, y: 0, z: 0 }
    ),
    1 / Math.max(uniqueVertices.length, 1)
  );
}

function pairEdgeGroupsByCentroid(mesh: EditableMesh, groups: Array<Array<[number, number]>>) {
  const remaining = new Set(groups.map((_group, index) => index));
  const pairs: Array<[Array<[number, number]>, Array<[number, number]>]> = [];

  while (remaining.size >= 2) {
    const [firstIndex] = Array.from(remaining);
    remaining.delete(firstIndex);

    const firstGroup = groups[firstIndex];
    const firstCentroid = getEdgeGroupCentroid(mesh, firstGroup);
    let bestMatchIndex: number | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    remaining.forEach((candidateIndex) => {
      const candidateCentroid = getEdgeGroupCentroid(mesh, groups[candidateIndex]);
      const distance = getDistance(firstCentroid, candidateCentroid);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestMatchIndex = candidateIndex;
      }
    });

    if (bestMatchIndex === null) continue;

    remaining.delete(bestMatchIndex);
    pairs.push([firstGroup, groups[bestMatchIndex]]);
  }

  return pairs;
}

function alignOpenOrClosedVertexLoops(
  mesh: EditableMesh,
  leftVertices: number[],
  rightVertices: number[],
  closed: boolean
) {
  const evaluateCost = (candidate: number[]) =>
    leftVertices.reduce(
      (acc, leftVertexIndex, index) =>
        acc + getDistance(mesh.vertices[leftVertexIndex], mesh.vertices[candidate[index]]),
      0
    );

  if (!closed) {
    const forwardCost = evaluateCost(rightVertices);
    const backwardVertices = [...rightVertices].reverse();
    const backwardCost = evaluateCost(backwardVertices);
    return backwardCost < forwardCost ? backwardVertices : rightVertices;
  }

  const candidates = [rightVertices, [...rightVertices].reverse()];
  let bestVertices = rightVertices;
  let bestCost = Number.POSITIVE_INFINITY;

  candidates.forEach((candidateBase) => {
    for (let offset = 0; offset < candidateBase.length; offset += 1) {
      const rotated = [
        ...candidateBase.slice(offset),
        ...candidateBase.slice(0, offset),
      ];
      const cost = evaluateCost(rotated);
      if (cost < bestCost) {
        bestCost = cost;
        bestVertices = rotated;
      }
    }
  });

  return bestVertices;
}

export function bridgeEdgeLoops(
  mesh: EditableMesh,
  edgeIndices: number[],
  segments = 1
): EditableMesh {
  const sourceEdges = listMeshEdges(mesh);
  const selectedEdges = Array.from(
    new Set(edgeIndices.filter((edgeIndex) => edgeIndex >= 0 && edgeIndex < sourceEdges.length))
  )
    .map((edgeIndex) => sourceEdges[edgeIndex])
    .filter((edge): edge is [number, number] => Boolean(edge));
  if (selectedEdges.length < 2) {
    return cloneEditableMesh(mesh);
  }

  const next = cloneEditableMesh(mesh);
  const groups = groupSelectedEdges(selectedEdges);
  if (groups.length < 2) {
    return next;
  }

  const bridgeSegments = Math.max(1, Math.min(8, Math.round(segments)));
  const groupPairs = pairEdgeGroupsByCentroid(next, groups);

  groupPairs.forEach(([leftGroup, rightGroup]) => {
    const orderedLeft = orderEdgeGroupVertices(leftGroup);
    const orderedRight = orderEdgeGroupVertices(rightGroup);
    if (!orderedLeft || !orderedRight) return;
    if (orderedLeft.vertices.length !== orderedRight.vertices.length) return;
    if (orderedLeft.vertices.length < 2) return;

    const leftVertices = orderedLeft.vertices;
    const rightVertices = alignOpenOrClosedVertexLoops(
      next,
      leftVertices,
      orderedRight.vertices,
      orderedLeft.closed && orderedRight.closed
    );
    const rings: number[][] = [leftVertices];

    for (let segment = 1; segment < bridgeSegments; segment += 1) {
      const factor = segment / bridgeSegments;
      rings.push(
        leftVertices.map((leftVertexIndex, index) =>
          addVertex(
            next,
            lerpVector(next.vertices[leftVertexIndex], next.vertices[rightVertices[index]], factor),
            lerpUv(next.uvs?.[leftVertexIndex], next.uvs?.[rightVertices[index]], factor),
            {
              color: lerpColor(
                next.vertexColors?.[leftVertexIndex],
                next.vertexColors?.[rightVertices[index]],
                factor
              ),
              weights: lerpWeights(
                next.weights?.[leftVertexIndex],
                next.weights?.[rightVertices[index]],
                factor,
                next.weightGroups?.length ?? 0
              ),
            }
          )
        )
      );
    }
    rings.push(rightVertices);

    const closed = orderedLeft.closed && orderedRight.closed;
    const vertexCount = leftVertices.length;
    const stepCount = closed ? vertexCount : vertexCount - 1;

    for (let ringIndex = 0; ringIndex + 1 < rings.length; ringIndex += 1) {
      const currentRing = rings[ringIndex];
      const nextRing = rings[ringIndex + 1];

      for (let index = 0; index < stepCount; index += 1) {
        const nextIndex = closed ? (index + 1) % vertexCount : index + 1;
        if (!closed && nextIndex >= vertexCount) break;

        const a = currentRing[index];
        const b = currentRing[nextIndex];
        const c = nextRing[nextIndex];
        const d = nextRing[index];

        let referenceNormal = normalize(
          crossVectors(
            subtractVectors(next.vertices[b], next.vertices[a]),
            subtractVectors(next.vertices[d], next.vertices[a])
          )
        );
        if (vectorLength(referenceNormal) < 1e-4) {
          referenceNormal = { x: 0, y: 1, z: 0 };
        }

        next.faces.push(
          orientTriangle(next.vertices, [a, b, c], referenceNormal),
          orientTriangle(next.vertices, [a, c, d], referenceNormal)
        );
      }
    }
  });

  return next;
}

export function extrudeFaceRegion(
  mesh: EditableMesh,
  faceIndices: number[],
  distance = 0.2
): EditableMesh {
  return transformFaceSelection(mesh, faceIndices, {
    normalOffset: distance,
    replaceSelectedFaces: true,
    bridgeBoundary: true,
  });
}

export function insetFaceRegion(
  mesh: EditableMesh,
  faceIndices: number[],
  factor = 0.18
): EditableMesh {
  return transformFaceSelection(mesh, faceIndices, {
    centerFactor: factor,
    replaceSelectedFaces: true,
    bridgeBoundary: true,
  });
}

export function duplicateFacesAlongNormal(
  mesh: EditableMesh,
  faceIndices: number[],
  distance = 0.2
): EditableMesh {
  return transformFaceSelection(mesh, faceIndices, {
    normalOffset: distance,
    replaceSelectedFaces: false,
    bridgeBoundary: false,
  });
}

export function separateFaces(
  mesh: EditableMesh,
  faceIndices: number[]
): SeparateMeshResult {
  const selectedFaceIndices = Array.from(
    new Set(faceIndices.filter((faceIndex) => faceIndex >= 0 && faceIndex < mesh.faces.length))
  );
  if (selectedFaceIndices.length === 0) {
    return {
      remaining: cloneEditableMesh(mesh),
      detached: null,
    };
  }

  const selectedSet = new Set(selectedFaceIndices);
  const remaining = cloneEditableMesh(mesh);
  remaining.faces = remaining.faces.filter((_face, faceIndex) => !selectedSet.has(faceIndex));

  const detached = cloneEditableMesh(mesh);
  detached.faces = detached.faces.filter((_face, faceIndex) => selectedSet.has(faceIndex));

  return {
    remaining: remaining.faces.length > 0 ? compactMesh(remaining) : remaining,
    detached: detached.faces.length > 0 ? compactMesh(detached) : null,
  };
}

export function ripFaces(
  mesh: EditableMesh,
  faceIndices: number[],
  distance = 0.18
): EditableMesh {
  const selectedFaceIndices = Array.from(
    new Set(faceIndices.filter((faceIndex) => faceIndex >= 0 && faceIndex < mesh.faces.length))
  );
  if (selectedFaceIndices.length === 0) {
    return cloneEditableMesh(mesh);
  }

  const next = cloneEditableMesh(mesh);
  const duplicateMap = new Map<number, number>();
  const averageNormal = normalize(
    selectedFaceIndices.reduce(
      (acc, faceIndex) => addVectors(acc, getFaceNormal(mesh, faceIndex)),
      { x: 0, y: 0, z: 0 }
    )
  );

  selectedFaceIndices.forEach((faceIndex) => {
    const face = next.faces[faceIndex];
    if (!face) return;

    next.faces[faceIndex] = face.map((vertexIndex) => {
      const existingDuplicate = duplicateMap.get(vertexIndex);
      if (existingDuplicate !== undefined) {
        return existingDuplicate;
      }

      const originalVertex = next.vertices[vertexIndex];
      const duplicateIndex = addVertex(next, { ...originalVertex }, next.uvs?.[vertexIndex], {
        color: getVertexColor(next, vertexIndex),
        weights: getVertexWeights(next, vertexIndex),
      });
      duplicateMap.set(vertexIndex, duplicateIndex);
      return duplicateIndex;
    }) as EditableFace;
  });

  duplicateMap.forEach((duplicateIndex) => {
    const vertex = next.vertices[duplicateIndex];
    if (!vertex) return;
    vertex.x += averageNormal.x * distance;
    vertex.y += averageNormal.y * distance;
    vertex.z += averageNormal.z * distance;
  });

  return next;
}

export function weldVerticesByDistance(
  mesh: EditableMesh,
  distance = 0.05,
  vertexIndices?: number[]
): EditableMesh {
  const candidateIndices = Array.from(
    new Set(
      (vertexIndices ?? mesh.vertices.map((_vertex, index) => index)).filter(
        (vertexIndex) => vertexIndex >= 0 && vertexIndex < mesh.vertices.length
      )
    )
  );
  if (candidateIndices.length < 2) {
    return cloneEditableMesh(mesh);
  }

  const threshold = Math.max(distance, 0.0001);
  const parent = new Map<number, number>();
  candidateIndices.forEach((vertexIndex) => {
    parent.set(vertexIndex, vertexIndex);
  });

  const find = (vertexIndex: number): number => {
    const currentParent = parent.get(vertexIndex) ?? vertexIndex;
    if (currentParent === vertexIndex) {
      return vertexIndex;
    }
    const root = find(currentParent);
    parent.set(vertexIndex, root);
    return root;
  };

  const unite = (left: number, right: number) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot === rightRoot) return;
    parent.set(rightRoot, leftRoot);
  };

  for (let leftIndex = 0; leftIndex < candidateIndices.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < candidateIndices.length; rightIndex += 1) {
      const leftVertexIndex = candidateIndices[leftIndex];
      const rightVertexIndex = candidateIndices[rightIndex];
      if (getDistance(mesh.vertices[leftVertexIndex], mesh.vertices[rightVertexIndex]) <= threshold) {
        unite(leftVertexIndex, rightVertexIndex);
      }
    }
  }

  const clusters = new Map<number, number[]>();
  candidateIndices.forEach((vertexIndex) => {
    const root = find(vertexIndex);
    clusters.set(root, [...(clusters.get(root) ?? []), vertexIndex]);
  });

  const next = cloneEditableMesh(mesh);
  const remap = new Map<number, number>();

  clusters.forEach((indices, root) => {
    if (indices.length === 0) return;

    const keepIndex = indices[0] ?? root;
    const centroid = scaleVector(
      indices.reduce(
        (acc, vertexIndex) => addVectors(acc, next.vertices[vertexIndex]),
        { x: 0, y: 0, z: 0 }
      ),
      1 / indices.length
    );
    next.vertices[keepIndex] = centroid;

    if (next.uvs) {
      next.uvs[keepIndex] = indices.reduce(
        (acc, vertexIndex, index) => {
          const uv = next.uvs?.[vertexIndex] ?? { u: 0.5, v: 0.5 };
          if (index === 0) {
            return { ...uv };
          }
          return {
            u: acc.u + uv.u,
            v: acc.v + uv.v,
          };
        },
        { u: 0, v: 0 }
      );
      next.uvs[keepIndex] = {
        u: next.uvs[keepIndex].u / indices.length,
        v: next.uvs[keepIndex].v / indices.length,
      };
    }
    if (next.vertexColors) {
      next.vertexColors[keepIndex] = averageVertexColors(next, indices);
    }
    if (next.weights && next.weightGroups && next.weightGroups.length > 0) {
      next.weights[keepIndex] =
        averageVertexWeights(next, indices) ??
        cloneWeightRow(undefined, next.weightGroups.length);
    }

    indices.slice(1).forEach((vertexIndex) => {
      remap.set(vertexIndex, keepIndex);
    });
  });

  next.faces = next.faces.map((face) =>
    face.map((vertexIndex) => remap.get(vertexIndex) ?? vertexIndex) as EditableFace
  );

  return compactMesh(next);
}

export function deleteFaces(mesh: EditableMesh, faceIndices: number[]): EditableMesh {
  const selectedFaceIndices = new Set(
    faceIndices.filter((faceIndex) => faceIndex >= 0 && faceIndex < mesh.faces.length)
  );
  if (selectedFaceIndices.size === 0) {
    return cloneEditableMesh(mesh);
  }

  const next = cloneEditableMesh(mesh);
  next.faces = next.faces.filter((_face, faceIndex) => !selectedFaceIndices.has(faceIndex));
  return compactMesh(next);
}

export function collapseEdges(mesh: EditableMesh, edgeIndices: number[]): EditableMesh {
  const edges = listMeshEdges(mesh);
  const selectedEdges = Array.from(
    new Set(edgeIndices.filter((edgeIndex) => edgeIndex >= 0 && edgeIndex < edges.length))
  )
    .map((edgeIndex) => edges[edgeIndex])
    .filter((edge): edge is [number, number] => Boolean(edge));
  if (selectedEdges.length === 0) {
    return cloneEditableMesh(mesh);
  }

  const involvedVertices = Array.from(new Set(selectedEdges.flat()));
  if (involvedVertices.length < 2) {
    return cloneEditableMesh(mesh);
  }

  const parent = new Map<number, number>();
  involvedVertices.forEach((vertexIndex) => {
    parent.set(vertexIndex, vertexIndex);
  });

  const find = (vertexIndex: number): number => {
    const currentParent = parent.get(vertexIndex) ?? vertexIndex;
    if (currentParent === vertexIndex) {
      return vertexIndex;
    }
    const root = find(currentParent);
    parent.set(vertexIndex, root);
    return root;
  };

  const unite = (left: number, right: number) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot === rightRoot) return;
    parent.set(rightRoot, leftRoot);
  };

  selectedEdges.forEach(([left, right]) => unite(left, right));

  const clusters = new Map<number, number[]>();
  involvedVertices.forEach((vertexIndex) => {
    const root = find(vertexIndex);
    clusters.set(root, [...(clusters.get(root) ?? []), vertexIndex]);
  });

  const next = cloneEditableMesh(mesh);
  const remap = new Map<number, number>();

  clusters.forEach((indices, root) => {
    if (indices.length === 0) return;

    const keepIndex = indices[0] ?? root;
    const centroid = scaleVector(
      indices.reduce(
        (acc, vertexIndex) => addVectors(acc, next.vertices[vertexIndex]),
        { x: 0, y: 0, z: 0 }
      ),
      1 / indices.length
    );
    next.vertices[keepIndex] = centroid;

    if (next.uvs) {
      const uvTotal = indices.reduce(
        (acc, vertexIndex) => {
          const uv = next.uvs?.[vertexIndex] ?? { u: 0.5, v: 0.5 };
          return {
            u: acc.u + uv.u,
            v: acc.v + uv.v,
          };
        },
        { u: 0, v: 0 }
      );
      next.uvs[keepIndex] = {
        u: uvTotal.u / indices.length,
        v: uvTotal.v / indices.length,
      };
    }
    if (next.vertexColors) {
      next.vertexColors[keepIndex] = averageVertexColors(next, indices);
    }
    if (next.weights && next.weightGroups && next.weightGroups.length > 0) {
      next.weights[keepIndex] =
        averageVertexWeights(next, indices) ??
        cloneWeightRow(undefined, next.weightGroups.length);
    }

    indices.slice(1).forEach((vertexIndex) => {
      remap.set(vertexIndex, keepIndex);
    });
  });

  next.faces = next.faces.map((face) =>
    face.map((vertexIndex) => remap.get(vertexIndex) ?? vertexIndex) as EditableFace
  );

  return compactMesh(next);
}

export function deleteEdges(mesh: EditableMesh, edgeIndices: number[]): EditableMesh {
  const edges = listMeshEdges(mesh);
  const selectedEdgeKeys = new Set(
    edgeIndices
      .filter((edgeIndex) => edgeIndex >= 0 && edgeIndex < edges.length)
      .map((edgeIndex) => {
        const edge = edges[edgeIndex];
        return edge ? buildEdgeKey(edge[0], edge[1]) : '';
      })
      .filter(Boolean)
  );
  if (selectedEdgeKeys.size === 0) {
    return cloneEditableMesh(mesh);
  }

  const next = cloneEditableMesh(mesh);
  next.faces = next.faces.filter((face) => {
    const [a, b, c] = face;
    const faceEdgeKeys = [
      buildEdgeKey(a, b),
      buildEdgeKey(b, c),
      buildEdgeKey(c, a),
    ];
    return !faceEdgeKeys.some((edgeKey) => selectedEdgeKeys.has(edgeKey));
  });
  return compactMesh(next);
}

export function deleteVertices(mesh: EditableMesh, vertexIndices: number[]): EditableMesh {
  const selectedVertices = new Set(
    vertexIndices.filter((vertexIndex) => vertexIndex >= 0 && vertexIndex < mesh.vertices.length)
  );
  if (selectedVertices.size === 0) {
    return cloneEditableMesh(mesh);
  }

  const next = cloneEditableMesh(mesh);
  next.faces = next.faces.filter(
    (face) => !face.some((vertexIndex) => selectedVertices.has(vertexIndex))
  );
  return compactMesh(next);
}

export function maskVertices(
  mesh: EditableMesh,
  vertexIndices: number[],
  amount = 1
): EditableMesh {
  const selectedVertices = Array.from(
    new Set(
      vertexIndices.filter((vertexIndex) => vertexIndex >= 0 && vertexIndex < mesh.vertices.length)
    )
  );
  if (selectedVertices.length === 0) {
    return cloneEditableMesh(mesh);
  }

  const next = cloneEditableMesh(mesh);
  const safeAmount = clampUnit(amount, 1);
  next.vertexMask = Array.from({ length: next.vertices.length }, (_unused, index) =>
    index < next.vertices.length ? getVertexMaskValue(next, index) : 0
  );
  selectedVertices.forEach((vertexIndex) => {
    next.vertexMask![vertexIndex] = safeAmount;
  });
  return sanitizeEditableMesh(next);
}

export function clearVertexMask(
  mesh: EditableMesh,
  vertexIndices?: number[]
): EditableMesh {
  if (!mesh.vertexMask || mesh.vertexMask.length === 0) {
    return cloneEditableMesh(mesh);
  }

  if (!vertexIndices || vertexIndices.length === 0) {
    const next = cloneEditableMesh(mesh);
    delete next.vertexMask;
    return next;
  }

  const selectedVertices = Array.from(
    new Set(
      vertexIndices.filter((vertexIndex) => vertexIndex >= 0 && vertexIndex < mesh.vertices.length)
    )
  );
  if (selectedVertices.length === 0) {
    return cloneEditableMesh(mesh);
  }

  const next = cloneEditableMesh(mesh);
  next.vertexMask = Array.from({ length: next.vertices.length }, (_unused, index) =>
    index < next.vertices.length ? getVertexMaskValue(next, index) : 0
  );
  selectedVertices.forEach((vertexIndex) => {
    next.vertexMask![vertexIndex] = 0;
  });
  return sanitizeEditableMesh(next);
}

export function hideFaces(mesh: EditableMesh, faceIndices: number[]): EditableMesh {
  const selectedFaces = Array.from(
    new Set(
      faceIndices.filter((faceIndex) => faceIndex >= 0 && faceIndex < mesh.faces.length)
    )
  );
  if (selectedFaces.length === 0) {
    return cloneEditableMesh(mesh);
  }

  const next = cloneEditableMesh(mesh);
  next.hiddenFaces = Array.from(
    new Set([...(next.hiddenFaces ?? []), ...selectedFaces])
  ).sort((left, right) => left - right);
  return sanitizeEditableMesh(next);
}

export function revealFaces(mesh: EditableMesh, faceIndices?: number[]): EditableMesh {
  if (!mesh.hiddenFaces || mesh.hiddenFaces.length === 0) {
    return cloneEditableMesh(mesh);
  }

  const next = cloneEditableMesh(mesh);
  if (!faceIndices || faceIndices.length === 0) {
    delete next.hiddenFaces;
    return next;
  }

  const toReveal = new Set(
    faceIndices.filter((faceIndex) => faceIndex >= 0 && faceIndex < mesh.faces.length)
  );
  next.hiddenFaces = (next.hiddenFaces ?? []).filter((faceIndex) => !toReveal.has(faceIndex));
  return sanitizeEditableMesh(next);
}

export function assignFaceSet(
  mesh: EditableMesh,
  faceIndices: number[],
  faceSetId: number
): EditableMesh {
  const selectedFaces = Array.from(
    new Set(
      faceIndices.filter((faceIndex) => faceIndex >= 0 && faceIndex < mesh.faces.length)
    )
  );
  if (selectedFaces.length === 0) {
    return cloneEditableMesh(mesh);
  }

  const next = cloneEditableMesh(mesh);
  const safeFaceSetId = normalizeFaceSetId(faceSetId);
  next.faceSets = Array.from({ length: next.faces.length }, (_unused, index) =>
    getFaceSetId(next, index)
  );
  selectedFaces.forEach((faceIndex) => {
    next.faceSets![faceIndex] = safeFaceSetId;
  });
  return sanitizeEditableMesh(next);
}

export function selectFaceSet(mesh: EditableMesh, seedFaceIndex: number) {
  if (seedFaceIndex < 0 || seedFaceIndex >= mesh.faces.length) {
    return [];
  }

  const targetFaceSetId = getFaceSetId(mesh, seedFaceIndex);
  if (targetFaceSetId <= 0) {
    return [seedFaceIndex];
  }

  return mesh.faces.flatMap((_face, faceIndex) =>
    getFaceSetId(mesh, faceIndex) === targetFaceSetId ? [faceIndex] : []
  );
}

export function solidifyMesh(
  mesh: EditableMesh,
  thickness = 0.12
): EditableMesh {
  const next = cloneEditableMesh(mesh);
  const normals = buildVertexNormals(mesh);
  const offset = next.vertices.length;
  normals.forEach((normal, index) => {
    const vertex = mesh.vertices[index];
    addVertex(
      next,
      {
        x: vertex.x + normal.x * thickness,
        y: vertex.y + normal.y * thickness,
        z: vertex.z + normal.z * thickness,
      },
      mesh.uvs?.[index],
      {
        color: getVertexColor(mesh, index),
        weights: getVertexWeights(mesh, index),
      }
    );
  });

  mesh.faces.forEach((face) => {
    next.faces.push([face[0] + offset, face[2] + offset, face[1] + offset]);
  });

  const meshCenter = getMeshCentroid(mesh);
  getBoundaryEdges(mesh).forEach(([left, right]) => {
    const midpoint = getEdgeMidpoint(mesh, [left, right]);
    let referenceNormal = normalize(subtractVectors(midpoint, meshCenter));
    if (vectorLength(referenceNormal) < 1e-4) {
      referenceNormal = normalize(
        crossVectors(subtractVectors(mesh.vertices[right], mesh.vertices[left]), {
          x: 0,
          y: 1,
          z: 0,
        })
      );
    }
    if (vectorLength(referenceNormal) < 1e-4) {
      referenceNormal = { x: 1, y: 0, z: 0 };
    }

    next.faces.push(
      orientTriangle(next.vertices, [left, right, right + offset], referenceNormal),
      orientTriangle(next.vertices, [left, right + offset, left + offset], referenceNormal)
    );
  });

  return next;
}

export function getSelectionVertexIndices(
  mesh: EditableMesh,
  mode: ModelerElementMode,
  selection: number[]
) {
  if (mode === 'vertex') {
    return Array.from(
      new Set(selection.filter((index) => index >= 0 && index < mesh.vertices.length))
    );
  }

  if (mode === 'edge') {
    const edges = listMeshEdges(mesh);
    return Array.from(
      new Set(
        selection.flatMap((edgeIndex) =>
          edgeIndex >= 0 && edgeIndex < edges.length ? edges[edgeIndex] : []
        )
      )
    );
  }

  return Array.from(
    new Set(
      selection.flatMap((faceIndex) =>
        faceIndex >= 0 && faceIndex < mesh.faces.length ? mesh.faces[faceIndex] : []
      )
    )
  );
}

export function getSelectionCenter(
  mesh: EditableMesh,
  mode: ModelerElementMode,
  selection: number[]
): EditableVec3 {
  const vertexIndices = getSelectionVertexIndices(mesh, mode, selection);
  if (vertexIndices.length === 0) {
    return { x: 0, y: 0, z: 0 };
  }

  const total = vertexIndices.reduce(
    (acc, vertexIndex) => addVectors(acc, mesh.vertices[vertexIndex] ?? { x: 0, y: 0, z: 0 }),
    { x: 0, y: 0, z: 0 }
  );

  return scaleVector(total, 1 / vertexIndices.length);
}

export function mirrorMeshX(mesh: EditableMesh): EditableMesh {
  const next = cloneEditableMesh(mesh);
  const offset = next.vertices.length;
  next.vertices.push(
    ...next.vertices.map((vertex) => ({
      x: -vertex.x,
      y: vertex.y,
      z: vertex.z,
    }))
  );
  next.faces.push(
    ...next.faces.map(([a, b, c]) => [a + offset, c + offset, b + offset] as EditableFace)
  );
  if (next.uvs) {
    next.uvs.push(...next.uvs.map((uv) => ({ u: 1 - uv.u, v: uv.v })));
  }
  if (next.vertexColors) {
    next.vertexColors.push(...next.vertexColors.map((color) => ({ ...color })));
  }
  if (next.weights) {
    next.weights.push(...next.weights.map((entry) => [...entry]));
  }
  return next;
}

function isArrayMeshOptions(value: EditableVec3 | ArrayMeshOptions): value is ArrayMeshOptions {
  return (
    'mode' in value ||
    'offset' in value ||
    'axis' in value ||
    'radius' in value ||
    'angle' in value ||
    'rotateInstances' in value
  );
}

function rotateVectorAroundAxis(
  vector: EditableVec3,
  axis: 'x' | 'y' | 'z',
  angleRadians: number
): EditableVec3 {
  const cosine = Math.cos(angleRadians);
  const sine = Math.sin(angleRadians);

  switch (axis) {
    case 'x':
      return {
        x: vector.x,
        y: vector.y * cosine - vector.z * sine,
        z: vector.y * sine + vector.z * cosine,
      };
    case 'z':
      return {
        x: vector.x * cosine - vector.y * sine,
        y: vector.x * sine + vector.y * cosine,
        z: vector.z,
      };
    case 'y':
    default:
      return {
        x: vector.x * cosine + vector.z * sine,
        y: vector.y,
        z: -vector.x * sine + vector.z * cosine,
      };
  }
}

function getRadialOffset(
  axis: 'x' | 'y' | 'z',
  radius: number,
  angleRadians: number
): EditableVec3 {
  const cosine = Math.cos(angleRadians) * radius;
  const sine = Math.sin(angleRadians) * radius;

  switch (axis) {
    case 'x':
      return { x: 0, y: cosine, z: sine };
    case 'z':
      return { x: cosine, y: sine, z: 0 };
    case 'y':
    default:
      return { x: cosine, y: 0, z: sine };
  }
}

function appendArrayInstance(
  next: EditableMesh,
  baseVertices: EditableVec3[],
  baseFaces: EditableFace[],
  baseUvs: EditableVec2[] | undefined,
  baseSeamEdges: EditableEdge[] | undefined,
  baseVertexColors: EditableColor[] | undefined,
  baseWeights: number[][] | undefined,
  baseWeightGroups: string[] | undefined,
  transformVertex: (vertex: EditableVec3) => EditableVec3
) {
  const vertexOffset = next.vertices.length;

  next.vertices.push(...baseVertices.map(transformVertex));
  next.faces.push(
    ...baseFaces.map(
      ([a, b, c]) => [a + vertexOffset, b + vertexOffset, c + vertexOffset] as EditableFace
    )
  );

  if (baseUvs) {
    next.uvs = next.uvs ?? [];
    next.uvs.push(...baseUvs.map((uv) => ({ ...uv })));
  }

  if (baseVertexColors) {
    next.vertexColors = next.vertexColors ?? [];
    next.vertexColors.push(...baseVertexColors.map((color) => ({ ...color })));
  }

  if (baseWeightGroups && baseWeightGroups.length > 0) {
    next.weightGroups = next.weightGroups ?? [...baseWeightGroups];
    next.weights = next.weights ?? [];
    next.weights.push(...(baseWeights ?? []).map((entry) => [...entry]));
  }

  if (baseSeamEdges) {
    next.seamEdges = next.seamEdges ?? [];
    next.seamEdges.push(
      ...baseSeamEdges.map(([left, right]) =>
        normalizeEdge(left + vertexOffset, right + vertexOffset)
      )
    );
  }
}

export function arrayMesh(
  mesh: EditableMesh,
  count = 2,
  offsetOrOptions: EditableVec3 | ArrayMeshOptions = { x: 1.5, y: 0, z: 0 }
): EditableMesh {
  const instanceCount = Math.max(1, Math.round(count));
  if (instanceCount <= 1) {
    return cloneEditableMesh(mesh);
  }

  const baseVertices = mesh.vertices.map((vertex) => ({ ...vertex }));
  const baseFaces = mesh.faces.map((face) => [...face] as EditableFace);
  const baseUvs = mesh.uvs?.map((uv) => ({ ...uv }));
  const baseSeamEdges = mesh.seamEdges?.map((edge) => [...edge] as EditableEdge);
  const baseVertexColors = mesh.vertexColors?.map((color) => ({ ...color }));
  const baseWeightGroups = mesh.weightGroups ? [...mesh.weightGroups] : undefined;
  const baseWeights = mesh.weights?.map((entry) => [...entry]);
  const options = isArrayMeshOptions(offsetOrOptions)
    ? offsetOrOptions
    : { mode: 'linear' as const, offset: offsetOrOptions };

  if (options.mode === 'radial') {
    const axis = options.axis ?? 'y';
    const radius = Math.max(0, Math.abs(options.radius ?? 2));
    const totalAngle = Number.isFinite(options.angle) ? options.angle ?? 360 : 360;
    const fullLoop = Math.abs(totalAngle) >= 359.999;
    const divisor = fullLoop ? instanceCount : Math.max(1, instanceCount - 1);
    const stepAngle = radiansFromDegrees(totalAngle / divisor);
    const centroid = getMeshCentroid(mesh);
    const baseOffset = getRadialOffset(axis, radius, 0);
    const next: EditableMesh = {
      vertices: [],
      faces: [],
      uvs: baseUvs ? [] : undefined,
      seamEdges: baseSeamEdges ? [] : undefined,
    };

    for (let instanceIndex = 0; instanceIndex < instanceCount; instanceIndex += 1) {
      const angleRadians = stepAngle * instanceIndex;
      const ringOffset = subtractVectors(
        getRadialOffset(axis, radius, angleRadians),
        baseOffset
      );

      appendArrayInstance(
        next,
        baseVertices,
        baseFaces,
        baseUvs,
        baseSeamEdges,
        baseVertexColors,
        baseWeights,
        baseWeightGroups,
        (vertex) => {
          const local = subtractVectors(vertex, centroid);
          const rotatedLocal = options.rotateInstances
            ? rotateVectorAroundAxis(local, axis, angleRadians)
            : local;
          return addVectors(addVectors(rotatedLocal, centroid), ringOffset);
        }
      );
    }

    return next;
  }

  const offset = options.offset ?? { x: 1.5, y: 0, z: 0 };
  const next = cloneEditableMesh(mesh);

  for (let instanceIndex = 1; instanceIndex < instanceCount; instanceIndex += 1) {
    const vertexOffset = next.vertices.length;
    const instanceOffset = scaleVector(offset, instanceIndex);

    next.vertices.push(
      ...baseVertices.map((vertex) => addVectors(vertex, instanceOffset))
    );
    next.faces.push(
      ...baseFaces.map(
        ([a, b, c]) => [a + vertexOffset, b + vertexOffset, c + vertexOffset] as EditableFace
      )
    );

    if (baseUvs) {
      next.uvs = next.uvs ?? [];
      next.uvs.push(...baseUvs.map((uv) => ({ ...uv })));
    }

    if (baseVertexColors) {
      next.vertexColors = next.vertexColors ?? [];
      next.vertexColors.push(...baseVertexColors.map((color) => ({ ...color })));
    }

    if (baseWeightGroups && baseWeightGroups.length > 0) {
      next.weightGroups = next.weightGroups ?? [...baseWeightGroups];
      next.weights = next.weights ?? [];
      next.weights.push(...(baseWeights ?? []).map((entry) => [...entry]));
    }

    if (baseSeamEdges) {
      next.seamEdges = next.seamEdges ?? [];
      next.seamEdges.push(
        ...baseSeamEdges.map(([left, right]) =>
          normalizeEdge(left + vertexOffset, right + vertexOffset)
        )
      );
    }
  }

  return next;
}

export function subdivideMesh(mesh: EditableMesh, iterations = 1): EditableMesh {
  let next = cloneEditableMesh(mesh);
  const passCount = Math.max(1, Math.min(3, Math.round(iterations)));

  for (let pass = 0; pass < passCount; pass += 1) {
    const faceIndices = Array.from({ length: next.faces.length }, (_unused, index) => index)
      .sort((left, right) => right - left);
    faceIndices.forEach((faceIndex) => {
      next = subdivideFace(next, faceIndex);
    });
  }

  return sanitizeEditableMesh(next);
}

function getMeshBoundsSpan(mesh: EditableMesh) {
  if (mesh.vertices.length === 0) {
    return 0;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  mesh.vertices.forEach((vertex) => {
    minX = Math.min(minX, vertex.x);
    minY = Math.min(minY, vertex.y);
    minZ = Math.min(minZ, vertex.z);
    maxX = Math.max(maxX, vertex.x);
    maxY = Math.max(maxY, vertex.y);
    maxZ = Math.max(maxZ, vertex.z);
  });

  return Math.max(maxX - minX, maxY - minY, maxZ - minZ, 0);
}

export function voxelRemeshMesh(
  mesh: EditableMesh,
  voxelSize = 0.12,
  smoothPasses = 1
): EditableMesh {
  if (mesh.faces.length === 0) {
    return cloneEditableMesh(mesh);
  }

  const span = getMeshBoundsSpan(mesh) || 1;
  const safeVoxelSize = Math.min(span, Math.max(0.03, voxelSize));
  const densityHint = Math.max(2, Math.round(span / safeVoxelSize));
  const remeshIterations = Math.max(1, Math.min(3, Math.round(densityHint / 4)));

  let next = remeshMeshUniform(mesh, remeshIterations, 0.14);
  const smoothIterations = Math.max(0, Math.min(3, Math.round(smoothPasses)));
  if (smoothIterations > 0) {
    next = relaxVertices(
      next,
      next.vertices.map((_vertex, index) => index),
      0.18,
      smoothIterations,
      { preserveBoundary: false }
    );
  }

  if (safeVoxelSize > 0.03) {
    next = weldVerticesByDistance(next, safeVoxelSize * 0.18);
  }

  return sanitizeEditableMesh(next);
}

export function remeshMeshUniform(
  mesh: EditableMesh,
  iterations = 1,
  relaxStrength = 0.12
): EditableMesh {
  let next = cloneEditableMesh(mesh);
  const passCount = Math.max(1, Math.min(3, Math.round(iterations)));

  for (let pass = 0; pass < passCount; pass += 1) {
    const faceIndices = Array.from({ length: next.faces.length }, (_value, index) => index)
      .sort((left, right) => right - left);

    faceIndices.forEach((faceIndex) => {
      next = subdivideFace(next, faceIndex);
    });

    next = relaxVertices(
      next,
      next.vertices.map((_vertex, index) => index),
      relaxStrength,
      1,
      { preserveBoundary: true }
    );
  }

  return next;
}

function closestPointOnTriangle(
  point: EditableVec3,
  a: EditableVec3,
  b: EditableVec3,
  c: EditableVec3
) {
  const ab = subtractVectors(b, a);
  const ac = subtractVectors(c, a);
  const ap = subtractVectors(point, a);

  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) {
    return { point: { ...a }, normal: normalize(crossVectors(ab, ac)) };
  }

  const bp = subtractVectors(point, b);
  const d3 = dot(ab, bp);
  const d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) {
    return { point: { ...b }, normal: normalize(crossVectors(ab, ac)) };
  }

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return {
      point: addVectors(a, scaleVector(ab, v)),
      normal: normalize(crossVectors(ab, ac)),
    };
  }

  const cp = subtractVectors(point, c);
  const d5 = dot(ab, cp);
  const d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) {
    return { point: { ...c }, normal: normalize(crossVectors(ab, ac)) };
  }

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return {
      point: addVectors(a, scaleVector(ac, w)),
      normal: normalize(crossVectors(ab, ac)),
    };
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const bc = subtractVectors(c, b);
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    return {
      point: addVectors(b, scaleVector(bc, w)),
      normal: normalize(crossVectors(ab, ac)),
    };
  }

  const denominator = 1 / (va + vb + vc);
  const v = vb * denominator;
  const w = vc * denominator;
  return {
    point: addVectors(addVectors(a, scaleVector(ab, v)), scaleVector(ac, w)),
    normal: normalize(crossVectors(ab, ac)),
  };
}

export function shrinkwrapMesh(
  mesh: EditableMesh,
  targetMesh: EditableMesh,
  options?: {
    offset?: number;
  }
): EditableMesh {
  if (targetMesh.faces.length === 0 || targetMesh.vertices.length < 3) {
    return cloneEditableMesh(mesh);
  }

  const offset = Number.isFinite(options?.offset) ? Number(options?.offset) : 0;
  const next = cloneEditableMesh(mesh);

  next.vertices = next.vertices.map((vertex) => {
    let bestPoint: EditableVec3 | null = null;
    let bestNormal: EditableVec3 = { x: 0, y: 1, z: 0 };
    let bestDistance = Number.POSITIVE_INFINITY;

    targetMesh.faces.forEach(([aIndex, bIndex, cIndex]) => {
      const a = targetMesh.vertices[aIndex];
      const b = targetMesh.vertices[bIndex];
      const c = targetMesh.vertices[cIndex];
      if (!a || !b || !c) return;

      const candidate = closestPointOnTriangle(vertex, a, b, c);
      const distance = getDistance(vertex, candidate.point);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestPoint = candidate.point;
        bestNormal = candidate.normal;
      }
    });

    if (!bestPoint) {
      return vertex;
    }

    return addVectors(bestPoint, scaleVector(bestNormal, offset));
  });

  return next;
}

export function decimateMesh(mesh: EditableMesh, ratio = 0.5): EditableMesh {
  const safeRatio = clamp(ratio, 0.1, 1);
  if (safeRatio >= 0.999 || mesh.faces.length <= 1) {
    return cloneEditableMesh(mesh);
  }

  const targetFaceCount = Math.max(1, Math.round(mesh.faces.length * safeRatio));
  let next = cloneEditableMesh(mesh);
  let guard = 0;

  while (next.faces.length > targetFaceCount && guard < mesh.faces.length * 6) {
    const edges = listMeshEdges(next);
    if (edges.length === 0) break;

    let bestEdgeIndex = -1;
    let bestEdgeLength = Number.POSITIVE_INFINITY;
    edges.forEach((edge, edgeIndex) => {
      const length = getEdgeLength(next, edge);
      if (length > 1e-5 && length < bestEdgeLength) {
        bestEdgeLength = length;
        bestEdgeIndex = edgeIndex;
      }
    });

    if (bestEdgeIndex < 0) {
      break;
    }

    const collapsed = collapseEdges(next, [bestEdgeIndex]);
    if (
      collapsed.faces.length >= next.faces.length &&
      collapsed.vertices.length >= next.vertices.length
    ) {
      break;
    }

    next = collapsed;
    guard += 1;
  }

  return next;
}

export function unwrapMeshPlanar(mesh: EditableMesh): EditableMesh {
  const next = cloneEditableMesh(mesh);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  next.vertices.forEach((vertex) => {
    minX = Math.min(minX, vertex.x);
    maxX = Math.max(maxX, vertex.x);
    minZ = Math.min(minZ, vertex.z);
    maxZ = Math.max(maxZ, vertex.z);
  });

  const spanX = maxX - minX || 1;
  const spanZ = maxZ - minZ || 1;
  next.uvs = next.vertices.map((vertex) => ({
    u: (vertex.x - minX) / spanX,
    v: (vertex.z - minZ) / spanZ,
  }));
  return next;
}

export function buildEditableMeshSignature(mesh: EditableMesh): string {
  return JSON.stringify(mesh);
}

export function parseEditableMesh(value: unknown): EditableMesh | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as {
    vertices?: Array<{ x?: unknown; y?: unknown; z?: unknown }>;
    faces?: Array<[unknown, unknown, unknown]>;
    uvs?: Array<{ u?: unknown; v?: unknown }>;
    seamEdges?: Array<[unknown, unknown]>;
    vertexColors?: Array<{ r?: unknown; g?: unknown; b?: unknown; a?: unknown }>;
    weightGroups?: unknown[];
    weights?: unknown[];
    vertexMask?: unknown[];
    hiddenFaces?: unknown[];
    faceSets?: unknown[];
  };

  if (!Array.isArray(record.vertices) || !Array.isArray(record.faces)) {
    return null;
  }

  const vertices = record.vertices
    .map((vertex) => ({
      x: typeof vertex?.x === 'number' ? vertex.x : 0,
      y: typeof vertex?.y === 'number' ? vertex.y : 0,
      z: typeof vertex?.z === 'number' ? vertex.z : 0,
    }))
    .filter((vertex) =>
      Number.isFinite(vertex.x) &&
      Number.isFinite(vertex.y) &&
      Number.isFinite(vertex.z)
    );
  if (vertices.length === 0) return null;

  const faces = record.faces
    .map((face) => {
      if (!Array.isArray(face) || face.length !== 3) return null;
      const normalized = face.map((index) => Number(index));
      if (normalized.some((index) => !Number.isInteger(index) || index < 0 || index >= vertices.length)) {
        return null;
      }
      return normalized as EditableFace;
    })
    .filter((face): face is EditableFace => Boolean(face));

  const uvs = Array.isArray(record.uvs)
    ? record.uvs
        .map((uv) => ({
          u: typeof uv?.u === 'number' ? uv.u : 0,
          v: typeof uv?.v === 'number' ? uv.v : 0,
        }))
        .slice(0, vertices.length)
    : undefined;
  const seamEdges = Array.isArray(record.seamEdges)
    ? record.seamEdges
        .map((edge) => {
          if (!Array.isArray(edge) || edge.length !== 2) return null;
          const normalized = edge.map((index) => Number(index));
          if (
            normalized.some(
              (index) => !Number.isInteger(index) || index < 0 || index >= vertices.length
            ) ||
            normalized[0] === normalized[1]
          ) {
            return null;
          }
          return normalizeEdge(normalized[0]!, normalized[1]!) as EditableEdge;
        })
        .filter((edge): edge is EditableEdge => Boolean(edge))
    : undefined;
  const vertexColors = Array.isArray(record.vertexColors)
    ? record.vertexColors
        .map((color) => ({
          r: clampUnit(Number(color?.r), 1),
          g: clampUnit(Number(color?.g), 1),
          b: clampUnit(Number(color?.b), 1),
          a: clampUnit(Number(color?.a), 1),
        }))
        .slice(0, vertices.length)
    : undefined;
  const weightGroups = Array.isArray(record.weightGroups)
    ? record.weightGroups
        .map((group) => (typeof group === 'string' ? group.trim() : ''))
        .filter(Boolean)
    : undefined;
  const weights =
    Array.isArray(record.weights) && weightGroups && weightGroups.length > 0
      ? record.weights
          .map((entry) =>
            Array.isArray(entry)
              ? cloneWeightRow(
                  entry.map((value) => Number(value)),
                  weightGroups.length
                )
              : cloneWeightRow(undefined, weightGroups.length)
          )
          .slice(0, vertices.length)
      : undefined;
  const vertexMask = Array.isArray(record.vertexMask)
    ? record.vertexMask
        .map((entry) => clampUnit(Number(entry), 0))
        .slice(0, vertices.length)
    : undefined;
  const hiddenFaces = Array.isArray(record.hiddenFaces)
    ? record.hiddenFaces
        .map((entry) => Number(entry))
        .filter(
          (entry) => Number.isInteger(entry) && entry >= 0 && entry < faces.length
        )
    : undefined;
  const faceSets = Array.isArray(record.faceSets)
    ? record.faceSets
        .map((entry) => normalizeFaceSetId(entry))
        .slice(0, faces.length)
    : undefined;

  return sanitizeEditableMesh({
    vertices,
    faces,
    uvs: uvs && uvs.length === vertices.length ? uvs : undefined,
    seamEdges:
      seamEdges && seamEdges.length > 0
        ? Array.from(
            new Map(
              seamEdges.map((edge) => [buildEdgeKey(edge[0], edge[1]), edge] as const)
            ).values()
          )
        : undefined,
    vertexColors:
      vertexColors && vertexColors.length === vertices.length
        ? vertexColors
        : undefined,
    weightGroups:
      weights && weights.length === vertices.length && weightGroups && weightGroups.length > 0
        ? weightGroups
        : undefined,
    weights:
      weights && weights.length === vertices.length && (weightGroups?.length ?? 0) > 0
        ? weights
        : undefined,
    vertexMask: vertexMask && vertexMask.length === vertices.length ? vertexMask : undefined,
    hiddenFaces: hiddenFaces && hiddenFaces.length > 0 ? hiddenFaces : undefined,
    faceSets: faceSets && faceSets.length === faces.length ? faceSets : undefined,
  });
}
