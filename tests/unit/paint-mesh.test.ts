import { describe, expect, it } from 'vitest';
import { createPlaneMesh, type EditableMesh } from '@/engine/editor/modelerMesh';
import {
  buildWeightPreviewColors,
  clearMeshVertexColors,
  clearMeshWeights,
  fillMeshWeights,
  mirrorMeshWeights,
  normalizeMeshWeights,
  paintMeshVertexColors,
  paintMeshWeights,
  smoothMeshWeights,
  summarizeMeshWeights,
} from '@/engine/editor/paintMesh';

describe('paintMesh', () => {
  it('paints vertex colors persistently and can clear them', () => {
    const mesh = createPlaneMesh();
    const painted = paintMeshVertexColors({
      mesh,
      center: mesh.vertices[0],
      radius: 0.25,
      color: { r: 0.1, g: 0.8, b: 0.35, a: 1 },
      strength: 1,
    });

    expect(painted.vertexColors).toHaveLength(mesh.vertices.length);
    expect(painted.vertexColors?.[0]?.r ?? 0).toBeCloseTo(0.1, 5);
    expect(painted.vertexColors?.[0]?.g ?? 0).toBeCloseTo(0.8, 5);
    expect(painted.vertexColors?.[0]?.b ?? 0).toBeCloseTo(0.35, 5);
    expect(
      painted.vertexColors?.some((color) =>
        Math.abs((color?.r ?? 1) - 1) > 0.001 ||
        Math.abs((color?.g ?? 1) - 1) > 0.001 ||
        Math.abs((color?.b ?? 1) - 1) > 0.001
      )
    ).toBe(true);

    const cleared = clearMeshVertexColors(painted);
    expect(cleared.vertexColors).toBeUndefined();
  });

  it('paints mirrored weights into counterpart bone groups and clears a bone group', () => {
    const mirroredStrip: EditableMesh = {
      vertices: [
        { x: -1, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: -1, y: 0, z: 1 },
        { x: 1, y: 0, z: 1 },
      ],
      faces: [
        [0, 1, 2],
        [1, 3, 2],
      ],
    };

    const painted = paintMeshWeights({
      mesh: mirroredStrip,
      center: { x: -1, y: 0, z: 0 },
      radius: 0.2,
      boneName: 'Arm_L',
      strength: 1,
      mirror: true,
      smooth: false,
      normalize: true,
    });

    const leftSummary = summarizeMeshWeights(painted, 'Arm_L');
    const rightSummary = summarizeMeshWeights(painted, 'Arm_R');
    expect(painted.weightGroups).toEqual(['Arm_L', 'Arm_R']);
    expect(painted.weights?.[0]?.[0]).toBeCloseTo(1, 5);
    expect(painted.weights?.[1]?.[0] ?? 0).toBeCloseTo(0, 5);
    expect(painted.weights?.[1]?.[1]).toBeCloseTo(1, 5);
    expect(leftSummary.nonZeroVertices).toBe(1);
    expect(rightSummary.nonZeroVertices).toBe(1);
    expect(leftSummary.maxWeight).toBeCloseTo(1, 5);
    expect(rightSummary.maxWeight).toBeCloseTo(1, 5);

    const cleared = clearMeshWeights(painted, 'Arm_L');
    expect(summarizeMeshWeights(cleared, 'Arm_L').nonZeroVertices).toBe(0);
  });

  it('fills, smooths, normalizes and mirrors weight groups as explicit tools', () => {
    const plane = createPlaneMesh();
    const filled = fillMeshWeights({
      mesh: plane,
      boneName: 'Spine',
      value: 1,
      normalize: true,
    });

    expect(summarizeMeshWeights(filled, 'Spine').nonZeroVertices).toBe(plane.vertices.length);
    expect(filled.weights?.every((row) => (row?.[0] ?? 0) > 0.999)).toBe(true);

    const seeded: EditableMesh = {
      ...plane,
      weightGroups: ['Spine'],
      weights: [
        [1],
        [0],
        [0],
        [0],
      ],
    };
    const smoothed = smoothMeshWeights({
      mesh: seeded,
      boneName: 'Spine',
      iterations: 1,
      normalize: false,
      strength: 0.5,
    });
    expect((smoothed.weights?.[0]?.[0] ?? 0)).toBeLessThan(1);
    expect(
      Math.max(
        smoothed.weights?.[1]?.[0] ?? 0,
        smoothed.weights?.[2]?.[0] ?? 0,
        smoothed.weights?.[3]?.[0] ?? 0
      )
    ).toBeGreaterThan(0);

    const normalized = normalizeMeshWeights({
      ...plane,
      weightGroups: ['Spine', 'Head'],
      weights: plane.vertices.map(() => [0.2, 0.6]),
    });
    expect(
      normalized.weights?.every((row) =>
        Math.abs((row?.[0] ?? 0) + (row?.[1] ?? 0) - 1) < 0.0001
      )
    ).toBe(true);

    const mirrored = mirrorMeshWeights({
      mesh: {
        vertices: [
          { x: -1, y: 0, z: 0 },
          { x: 1, y: 0, z: 0 },
          { x: -1, y: 0, z: 1 },
          { x: 1, y: 0, z: 1 },
        ],
        faces: [
          [0, 1, 2],
          [1, 3, 2],
        ],
        weightGroups: ['Leg_L'],
        weights: [
          [1],
          [0],
          [0.75],
          [0],
        ],
      },
      boneName: 'Leg_L',
      normalize: true,
    });

    expect(mirrored.weightGroups).toEqual(['Leg_L', 'Leg_R']);
    expect(mirrored.weights?.[1]?.[1]).toBeCloseTo(1, 5);
    expect(mirrored.weights?.[3]?.[1]).toBeCloseTo(0.75, 5);
    expect(mirrored.weights?.[1]?.[0] ?? 0).toBeCloseTo(0, 5);
  });

  it('builds preview colors for a painted weight group', () => {
    const painted = paintMeshWeights({
      mesh: createPlaneMesh(),
      center: { x: -0.5, y: 0, z: -0.5 },
      radius: 0.5,
      boneName: 'Spine',
      strength: 1,
      mirror: false,
      smooth: false,
      normalize: true,
    });

    const preview = buildWeightPreviewColors(painted, 'Spine');

    expect(preview).toHaveLength(painted.vertices.length);
    expect((preview?.[0]?.r ?? 0)).toBeGreaterThan(preview?.[3]?.r ?? 0);
    expect(preview?.every((color) => (color?.a ?? 0) === 1)).toBe(true);
  });
});
