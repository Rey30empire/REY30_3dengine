import { describe, expect, it } from 'vitest';
import {
  arrayMesh,
  bevelEdges,
  bridgeEdges,
  bridgeEdgeLoops,
  clearSeamEdges,
  collapseEdges,
  type EditableMesh,
  deleteEdges,
  deleteFaces,
  deleteVertices,
  duplicateFacesAlongNormal,
  extrudeFaceRegion,
  fillVertices,
  growFaceSelection,
  insetFaceRegion,
  knifeFace,
  listMeshEdges,
  markSeamEdges,
  mergeVertices,
  createPlaneMesh,
  decimateMesh,
  extrudeFace,
  fitSelectionUvs,
  moveVertices,
  packUvIslands,
  parseEditableMesh,
  projectSelectionUvs,
  relaxVertices,
  ripFaces,
  remeshMeshUniform,
  rotateSelectionUvs,
  scaleSelectionUvs,
  selectFacesByNormal,
  selectEdgePath,
  selectEdgeLoop,
  selectEdgeRing,
  selectFaceIsland,
  selectUvIsland,
  selectVertexPath,
  separateFaces,
  shrinkFaceSelection,
  slideVertices,
  solidifyMesh,
  subdivideFace,
  translateSelectionUvs,
  weldVerticesByDistance,
} from '@/engine/editor/modelerMesh';

describe('modelerMesh', () => {
  it('moves selected vertices', () => {
    const plane = createPlaneMesh();
    const moved = moveVertices(plane, [0, 1], { x: 0.25, y: 0.5, z: -0.1 });

    expect(moved.vertices[0]).toMatchObject({ x: -0.5, y: 0.5, z: -0.85 });
    expect(moved.vertices[2]).toMatchObject(plane.vertices[2]);
  });

  it('subdivides and extrudes faces', () => {
    const plane = createPlaneMesh();
    const subdivided = subdivideFace(plane, 0);
    const extruded = extrudeFace(plane, 0, 0.3);

    expect(subdivided.faces.length).toBe(plane.faces.length + 2);
    expect(subdivided.vertices.length).toBe(plane.vertices.length + 1);
    expect(extruded.vertices.length).toBe(plane.vertices.length + 3);
    expect(extruded.faces.length).toBe(plane.faces.length + 7);
  });

  it('parses editable mesh payloads safely', () => {
    const parsed = parseEditableMesh({
      vertices: [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 0, y: 1, z: 0 },
      ],
      faces: [[0, 1, 2]],
      uvs: [
        { u: 0, v: 0 },
        { u: 1, v: 0 },
        { u: 0, v: 1 },
      ],
      seamEdges: [[0, 1]],
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.faces).toEqual([[0, 1, 2]]);
    expect(parsed?.uvs?.length).toBe(3);
    expect(parsed?.seamEdges).toEqual([[0, 1]]);
    expect(parseEditableMesh({ vertices: [], faces: [] })).toBeNull();
  });

  it('supports knife, merge and fill operations', () => {
    const plane = createPlaneMesh();
    const knifed = knifeFace(plane, 0);
    const merged = mergeVertices(plane, [0, 1]);
    const filled = fillVertices(
      {
        vertices: [
          { x: -1, y: 0, z: -1 },
          { x: 1, y: 0, z: -1 },
          { x: 1, y: 0, z: 1 },
          { x: -1, y: 0, z: 1 },
        ],
        faces: [],
      },
      [0, 1, 2, 3]
    );

    expect(knifed.vertices.length).toBe(plane.vertices.length + 1);
    expect(knifed.faces.length).toBe(plane.faces.length + 2);
    expect(merged.vertices.length).toBeLessThan(plane.vertices.length);
    expect(merged.faces.length).toBeGreaterThan(0);
    expect(filled.faces.length).toBe(2);
  });

  it('applies parametric knife, region extrude/inset and duplicate along normal', () => {
    const plane = createPlaneMesh();
    const knifed = knifeFace(plane, 0, { amount: 0.75, segments: 3 });
    const insetRegion = insetFaceRegion(plane, [0, 1], 0.35);
    const extrudedRegion = extrudeFaceRegion(plane, [0, 1], 0.4);
    const duplicated = duplicateFacesAlongNormal(plane, [0, 1], 0.3);

    expect(knifed.vertices.length).toBe(plane.vertices.length + 3);
    expect(knifed.faces.length).toBe(plane.faces.length + 6);
    expect(insetRegion.vertices.length).toBeGreaterThan(plane.vertices.length);
    expect(insetRegion.faces.length).toBeGreaterThan(plane.faces.length);
    expect(extrudedRegion.vertices.length).toBeGreaterThan(plane.vertices.length);
    expect(extrudedRegion.faces.length).toBeGreaterThan(insetRegion.faces.length - 1);
    expect(duplicated.faces.length).toBe(plane.faces.length * 2);
  });

  it('supports edge loop/ring selection and simple bevel', () => {
    const strip: EditableMesh = {
      vertices: [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 0, y: 1, z: 0 },
        { x: 1, y: 1, z: 0 },
        { x: 2, y: 0, z: 0 },
        { x: 2, y: 1, z: 0 },
      ],
      faces: [
        [0, 1, 2],
        [1, 3, 2],
        [1, 4, 3],
        [4, 5, 3],
      ],
    };
    const edges = listMeshEdges(strip);
    const seedEdgeIndex = edges.findIndex(([left, right]) => left === 0 && right === 1);
    const loop = selectEdgeLoop(strip, seedEdgeIndex);
    const ring = selectEdgeRing(strip, seedEdgeIndex);
    const beveled = bevelEdges(strip, [seedEdgeIndex]);

    expect(loop.length).toBeGreaterThanOrEqual(2);
    expect(ring.length).toBeGreaterThanOrEqual(2);
    expect(beveled.vertices.length).toBeGreaterThan(strip.vertices.length);
  });

  it('follows topological loop/ring selection on triangulated quad strips', () => {
    const strip: EditableMesh = {
      vertices: [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 2, y: 0, z: 0 },
        { x: 0, y: 1, z: 0 },
        { x: 1, y: 1, z: 0 },
        { x: 2, y: 1, z: 0 },
      ],
      faces: [
        [0, 1, 4],
        [0, 4, 3],
        [1, 2, 5],
        [1, 5, 4],
      ],
    };
    const edges = listMeshEdges(strip);
    const bottomSeed = edges.findIndex(([left, right]) => left === 0 && right === 1);
    const leftVerticalSeed = edges.findIndex(([left, right]) => left === 0 && right === 3);
    const loop = selectEdgeLoop(strip, bottomSeed).map((selectedEdgeIndex) =>
      edges[selectedEdgeIndex]?.join(':')
    );
    const ring = selectEdgeRing(strip, leftVerticalSeed).map((selectedEdgeIndex) =>
      edges[selectedEdgeIndex]?.join(':')
    );

    expect(loop).toEqual(['0:1', '1:2']);
    expect(ring.slice().sort()).toEqual(['0:3', '1:4', '2:5']);
  });

  it('supports bevel segments and bridge loops across two rings', () => {
    const dualPlanes: EditableMesh = {
      vertices: [
        { x: -2, y: 0, z: -1 },
        { x: 0, y: 0, z: -1 },
        { x: 0, y: 0, z: 1 },
        { x: -2, y: 0, z: 1 },
        { x: 2, y: 0, z: -1 },
        { x: 4, y: 0, z: -1 },
        { x: 4, y: 0, z: 1 },
        { x: 2, y: 0, z: 1 },
      ],
      faces: [
        [0, 1, 2],
        [0, 2, 3],
        [4, 5, 6],
        [4, 6, 7],
      ],
    };
    const dualEdges = listMeshEdges(dualPlanes);
    const selectedLoopEdges = dualEdges
      .map((edge, index) => ({ edge, index }))
      .filter(({ edge }) => {
        const [left, right] = edge;
        return (
          (left === 0 && right === 1) ||
          (left === 1 && right === 2) ||
          (left === 2 && right === 3) ||
          (left === 0 && right === 3) ||
          (left === 4 && right === 5) ||
          (left === 5 && right === 6) ||
          (left === 6 && right === 7) ||
          (left === 4 && right === 7)
        );
      })
      .map(({ index }) => index);

    const strip: EditableMesh = {
      vertices: [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 0, y: 1, z: 0 },
        { x: 1, y: 1, z: 0 },
        { x: 2, y: 0, z: 0 },
        { x: 2, y: 1, z: 0 },
      ],
      faces: [
        [0, 1, 2],
        [1, 3, 2],
        [1, 4, 3],
        [4, 5, 3],
      ],
    };
    const stripEdges = listMeshEdges(strip);
    const seedEdgeIndex = stripEdges.findIndex(([left, right]) => left === 1 && right === 2);
    const beveled = bevelEdges(strip, [seedEdgeIndex], 0.2, 3);
    const bridgedLoops = bridgeEdgeLoops(dualPlanes, selectedLoopEdges, 3);

    expect(beveled.vertices.length).toBeGreaterThan(strip.vertices.length + 2);
    expect(beveled.faces.length).toBeGreaterThan(strip.faces.length + 3);
    expect(bridgedLoops.vertices.length).toBeGreaterThan(dualPlanes.vertices.length);
    expect(bridgedLoops.faces.length).toBeGreaterThan(dualPlanes.faces.length);
  });

  it('pairs nearest closed loops when bridging multiple groups', () => {
    const multiLoops: EditableMesh = {
      vertices: [
        { x: -6, y: 0, z: -1 },
        { x: -4, y: 0, z: -1 },
        { x: -4, y: 0, z: 1 },
        { x: -6, y: 0, z: 1 },
        { x: -2, y: 0, z: -1 },
        { x: 0, y: 0, z: -1 },
        { x: 0, y: 0, z: 1 },
        { x: -2, y: 0, z: 1 },
        { x: 2, y: 0, z: -1 },
        { x: 4, y: 0, z: -1 },
        { x: 4, y: 0, z: 1 },
        { x: 2, y: 0, z: 1 },
        { x: 6, y: 0, z: -1 },
        { x: 8, y: 0, z: -1 },
        { x: 8, y: 0, z: 1 },
        { x: 6, y: 0, z: 1 },
      ],
      faces: [
        [0, 1, 2],
        [0, 2, 3],
        [4, 5, 6],
        [4, 6, 7],
        [8, 9, 10],
        [8, 10, 11],
        [12, 13, 14],
        [12, 14, 15],
      ],
    };
    const edges = listMeshEdges(multiLoops);
    const selectedLoopEdges = edges
      .map((edge, index) => ({ edge, index }))
      .filter(({ edge }) => {
        const [left, right] = edge;
        return !(
          (left === 0 && right === 2) ||
          (left === 4 && right === 6) ||
          (left === 8 && right === 10) ||
          (left === 12 && right === 14)
        );
      })
      .map(({ index }) => index);

    const bridged = bridgeEdgeLoops(multiLoops, selectedLoopEdges, 2);

    expect(bridged.vertices.length).toBe(24);
    expect(bridged.faces.length).toBe(40);
  });

  it('supports bridge, separate, rip and solidify flows', () => {
    const plane = createPlaneMesh();
    const edges = listMeshEdges(plane);
    const bridge = bridgeEdges(plane, [
      edges.findIndex(([left, right]) => left === 0 && right === 1),
      edges.findIndex(([left, right]) => left === 2 && right === 3),
    ]);
    const separated = separateFaces(plane, [0]);
    const ripped = ripFaces(plane, [0]);
    const solidified = solidifyMesh(plane, 0.2);

    expect(bridge.faces.length).toBe(plane.faces.length + 2);
    expect(separated.detached?.faces.length).toBe(1);
    expect(separated.remaining.faces.length).toBe(1);
    expect(ripped.vertices.length).toBeGreaterThan(plane.vertices.length);
    expect(solidified.vertices.length).toBe(plane.vertices.length * 2);
    expect(solidified.faces.length).toBeGreaterThan(plane.faces.length * 2);
  });

  it('supports linear/radial array, uniform remesh and decimate flows', () => {
    const plane = createPlaneMesh();
    const arrayed = arrayMesh(plane, 3, { x: 2, y: 0, z: 0 });
    const radial = arrayMesh(plane, 4, {
      mode: 'radial',
      axis: 'y',
      radius: 2,
      angle: 360,
      rotateInstances: true,
    });
    const remeshed = remeshMeshUniform(plane, 1);
    const decimated = decimateMesh(remeshed, 0.5);

    expect(arrayed.vertices.length).toBe(plane.vertices.length * 3);
    expect(arrayed.faces.length).toBe(plane.faces.length * 3);
    expect(radial.vertices.length).toBe(plane.vertices.length * 4);
    expect(radial.faces.length).toBe(plane.faces.length * 4);
    expect(radial.vertices.some((vertex) => vertex.z > 1)).toBe(true);
    expect(remeshed.vertices.length).toBeGreaterThan(plane.vertices.length);
    expect(remeshed.faces.length).toBeGreaterThan(plane.faces.length);
    expect(decimated.faces.length).toBeLessThan(remeshed.faces.length);
    expect(decimated.faces.length).toBeGreaterThan(0);
  });

  it('supports slide, relax and collapse operations', () => {
    const plane = createPlaneMesh();
    const slided = slideVertices(plane, [1], 0.5);

    const fan: EditableMesh = {
      vertices: [
        { x: 0, y: 0, z: 0 },
        { x: 2, y: 0, z: 0 },
        { x: 2, y: 0, z: 2 },
        { x: 0, y: 0, z: 2 },
        { x: 1.6, y: 0, z: 1 },
      ],
      faces: [
        [0, 1, 4],
        [1, 2, 4],
        [2, 3, 4],
        [3, 0, 4],
      ],
    };
    const relaxed = relaxVertices(fan, [4], 0.5, 1);

    const planeEdges = listMeshEdges(plane);
    const collapsed = collapseEdges(plane, [
      planeEdges.findIndex(([left, right]) => left === 0 && right === 1),
    ]);
    const slideDistance = Math.hypot(
      slided.vertices[1].x - plane.vertices[1].x,
      slided.vertices[1].y - plane.vertices[1].y,
      slided.vertices[1].z - plane.vertices[1].z
    );

    expect(slideDistance).toBeGreaterThan(0.05);
    expect(relaxed.vertices[4].x).toBeLessThan(fan.vertices[4].x);
    expect(relaxed.vertices[4].z).toBeCloseTo(1, 5);
    expect(collapsed.vertices.length).toBe(3);
    expect(collapsed.faces.length).toBe(1);
  });

  it('supports path and region selection helpers', () => {
    const strip: EditableMesh = {
      vertices: [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 2, y: 0, z: 0 },
        { x: 0, y: 1, z: 0 },
        { x: 1, y: 1, z: 0 },
        { x: 2, y: 1, z: 0 },
      ],
      faces: [
        [0, 1, 4],
        [0, 4, 3],
        [1, 2, 5],
        [1, 5, 4],
      ],
    };
    const stripEdges = listMeshEdges(strip);
    const edgePath = selectEdgePath(
      strip,
      stripEdges.findIndex(([left, right]) => left === 0 && right === 1),
      stripEdges.findIndex(([left, right]) => left === 4 && right === 5)
    );
    const vertexPath = selectVertexPath(strip, 0, 2);

    const disconnected: EditableMesh = {
      vertices: [
        { x: -3, y: 0, z: -1 },
        { x: -1, y: 0, z: -1 },
        { x: -1, y: 0, z: 1 },
        { x: -3, y: 0, z: 1 },
        { x: 1, y: 0, z: -1 },
        { x: 3, y: 0, z: -1 },
        { x: 3, y: 0, z: 1 },
        { x: 1, y: 0, z: 1 },
      ],
      faces: [
        [0, 1, 2],
        [0, 2, 3],
        [4, 5, 6],
        [4, 6, 7],
      ],
    };
    const island = selectFaceIsland(disconnected, 0);

    const grid: EditableMesh = {
      vertices: [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 2, y: 0, z: 0 },
        { x: 3, y: 0, z: 0 },
        { x: 0, y: 1, z: 0 },
        { x: 1, y: 1, z: 0 },
        { x: 2, y: 1, z: 0 },
        { x: 3, y: 1, z: 0 },
        { x: 0, y: 2, z: 0 },
        { x: 1, y: 2, z: 0 },
        { x: 2, y: 2, z: 0 },
        { x: 3, y: 2, z: 0 },
        { x: 0, y: 3, z: 0 },
        { x: 1, y: 3, z: 0 },
        { x: 2, y: 3, z: 0 },
        { x: 3, y: 3, z: 0 },
      ],
      faces: [
        [0, 1, 5], [0, 5, 4],
        [1, 2, 6], [1, 6, 5],
        [2, 3, 7], [2, 7, 6],
        [4, 5, 9], [4, 9, 8],
        [5, 6, 10], [5, 10, 9],
        [6, 7, 11], [6, 11, 10],
        [8, 9, 13], [8, 13, 12],
        [9, 10, 14], [9, 14, 13],
        [10, 11, 15], [10, 15, 14],
      ],
    };
    const islandGrid = selectFaceIsland(grid, 0);
    const grown = growFaceSelection(grid, [8], 1);
    const shrunk = shrinkFaceSelection(grid, islandGrid, 1);
    const constrainedSlide = slideVertices(
      strip,
      [1],
      0.5,
      { axis: 'x', pathVertexIndices: [0, 1, 2] }
    );
    const preservedBoundary = relaxVertices(createPlaneMesh(), [0], 0.8, 2, {
      preserveBoundary: true,
    });

    expect(vertexPath).toEqual([0, 1, 2]);
    expect(edgePath.length).toBeGreaterThanOrEqual(2);
    expect(island).toEqual([0, 1]);
    expect(grown.length).toBeGreaterThan(1);
    expect(shrunk.length).toBeGreaterThan(0);
    expect(shrunk.length).toBeLessThan(islandGrid.length);
    expect(constrainedSlide.vertices[1].z).toBe(strip.vertices[1].z);
    expect(constrainedSlide.vertices[1].x).toBeGreaterThan(strip.vertices[1].x);
    expect(preservedBoundary.vertices[0]).toEqual(createPlaneMesh().vertices[0]);
  });

  it('supports weld by distance and delete operations', () => {
    const duplicateMesh: EditableMesh = {
      vertices: [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 1, y: 1, z: 0 },
        { x: 0, y: 1, z: 0 },
        { x: 0.02, y: 0.01, z: 0 },
      ],
      faces: [
        [0, 1, 2],
        [4, 2, 3],
      ],
    };

    const welded = weldVerticesByDistance(duplicateMesh, 0.05);
    const plane = createPlaneMesh();
    const edges = listMeshEdges(plane);
    const deletedFaces = deleteFaces(plane, [0]);
    const deletedEdges = deleteEdges(plane, [
      edges.findIndex(([left, right]) => left === 0 && right === 1),
    ]);
    const deletedVertices = deleteVertices(plane, [0]);

    expect(welded.vertices.length).toBeLessThan(duplicateMesh.vertices.length);
    expect(welded.faces.length).toBeGreaterThan(0);
    expect(deletedFaces.faces.length).toBe(1);
    expect(deletedEdges.faces.length).toBeLessThan(plane.faces.length);
    expect(deletedVertices.faces.length).toBeLessThan(plane.faces.length);
  });

  it('selects coplanar faces by normal tolerance', () => {
    const plane = createPlaneMesh();
    const selected = selectFacesByNormal(plane, 0, 5);

    expect(selected).toEqual([0, 1]);
  });

  it('projects and transforms selection UVs', () => {
    const plane = createPlaneMesh();
    const projected = projectSelectionUvs(plane, [0, 1]);
    const translated = translateSelectionUvs(projected, [0, 1], 0.2, -0.1);
    const scaled = scaleSelectionUvs(translated, [0, 1], 0.5, 0.5);
    const rotated = rotateSelectionUvs(scaled, [0, 1], 90);
    const fitted = fitSelectionUvs(rotated, [0, 1], 0.1);

    expect(projected.uvs?.length).toBe(projected.vertices.length);
    expect(translated.uvs?.[0]).toMatchObject({ u: 0.2, v: -0.1 });

    const scaledSpanU =
      Math.max(...(scaled.uvs?.map((uv) => uv.u) ?? [0])) -
      Math.min(...(scaled.uvs?.map((uv) => uv.u) ?? [0]));
    const scaledSpanV =
      Math.max(...(scaled.uvs?.map((uv) => uv.v) ?? [0])) -
      Math.min(...(scaled.uvs?.map((uv) => uv.v) ?? [0]));
    expect(scaledSpanU).toBeCloseTo(0.5, 5);
    expect(scaledSpanV).toBeCloseTo(0.5, 5);

    expect(rotated.uvs?.[0]?.u).toBeCloseTo(0.95, 5);
    expect(rotated.uvs?.[0]?.v).toBeCloseTo(0.15, 5);

    const fittedUs = fitted.uvs?.map((uv) => uv.u) ?? [];
    const fittedVs = fitted.uvs?.map((uv) => uv.v) ?? [];
    expect(Math.min(...fittedUs)).toBeCloseTo(0.1, 5);
    expect(Math.max(...fittedUs)).toBeCloseTo(0.9, 5);
    expect(Math.min(...fittedVs)).toBeCloseTo(0.1, 5);
    expect(Math.max(...fittedVs)).toBeCloseTo(0.9, 5);
  });

  it('marks seams, selects UV islands, packs islands and clears seams again', () => {
    const strip: EditableMesh = {
      vertices: [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 2, y: 0, z: 0 },
        { x: 0, y: 1, z: 0 },
        { x: 1, y: 1, z: 0 },
        { x: 2, y: 1, z: 0 },
      ],
      faces: [
        [0, 1, 4],
        [0, 4, 3],
        [1, 2, 5],
        [1, 5, 4],
      ],
    };
    const edges = listMeshEdges(strip);
    const seamEdgeIndex = edges.findIndex(([left, right]) => left === 1 && right === 4);
    const marked = markSeamEdges(strip, [seamEdgeIndex]);
    const island = selectUvIsland(marked, 0);
    const packed = packUvIslands(marked, 0.04);

    const getFaceGroupBounds = (mesh: EditableMesh, faceIndices: number[]) => {
      const vertexIndices = Array.from(
        new Set(faceIndices.flatMap((faceIndex) => mesh.faces[faceIndex] ?? []))
      );
      const uvs = vertexIndices
        .map((vertexIndex) => mesh.uvs?.[vertexIndex])
        .filter((uv): uv is { u: number; v: number } => Boolean(uv));
      return {
        minU: Math.min(...uvs.map((uv) => uv.u)),
        maxU: Math.max(...uvs.map((uv) => uv.u)),
        minV: Math.min(...uvs.map((uv) => uv.v)),
        maxV: Math.max(...uvs.map((uv) => uv.v)),
      };
    };

    const leftBounds = getFaceGroupBounds(packed, [0, 1]);
    const rightBounds = getFaceGroupBounds(packed, [2, 3]);
    const packedEdges = listMeshEdges(packed);
    const packedSeamEdge = packed.seamEdges?.[0];
    const packedSeamEdgeIndex = packedEdges.findIndex(
      ([left, right]) =>
        packedSeamEdge &&
        left === packedSeamEdge[0] &&
        right === packedSeamEdge[1]
    );
    const cleared = clearSeamEdges(packed, packedSeamEdgeIndex >= 0 ? [packedSeamEdgeIndex] : []);

    expect(marked.seamEdges).toEqual([[1, 4]]);
    expect(island).toEqual([0, 1]);
    expect(packed.vertices.length).toBeGreaterThan(strip.vertices.length);
    expect(packed.seamEdges?.length).toBeGreaterThanOrEqual(2);
    expect(leftBounds.maxU).toBeLessThan(rightBounds.minU);
    expect(cleared.seamEdges ?? []).toHaveLength(0);
    expect(cleared.vertices.length).toBeLessThan(packed.vertices.length);
  });
});
