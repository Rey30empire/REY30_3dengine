import { describe, expect, it } from 'vitest';
import { shrinkwrapMesh, type EditableMesh } from '@/engine/editor/modelerMesh';

describe('retopo mesh helpers', () => {
  it('shrinkwraps vertices onto the target surface with offset', () => {
    const source: EditableMesh = {
      vertices: [
        { x: -1, y: 1, z: -1 },
        { x: 1, y: 1, z: -1 },
        { x: -1, y: 1, z: 1 },
        { x: 1, y: 1, z: 1 },
      ],
      faces: [
        [0, 2, 1],
        [1, 2, 3],
      ],
    };

    const target: EditableMesh = {
      vertices: [
        { x: -2, y: 0, z: -2 },
        { x: 2, y: 0, z: -2 },
        { x: -2, y: 0, z: 2 },
        { x: 2, y: 0, z: 2 },
      ],
      faces: [
        [0, 2, 1],
        [1, 2, 3],
      ],
    };

    const wrapped = shrinkwrapMesh(source, target, { offset: 0.1 });

    wrapped.vertices.forEach((vertex, index) => {
      expect(vertex.x).toBeCloseTo(source.vertices[index]?.x ?? 0, 5);
      expect(vertex.z).toBeCloseTo(source.vertices[index]?.z ?? 0, 5);
      expect(vertex.y).toBeCloseTo(0.1, 5);
    });
  });

  it('returns a safe clone when the target mesh is invalid', () => {
    const source: EditableMesh = {
      vertices: [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 0, y: 1, z: 0 },
      ],
      faces: [[0, 1, 2]],
    };

    const wrapped = shrinkwrapMesh(source, { vertices: [], faces: [] });

    expect(wrapped).toEqual(source);
    expect(wrapped).not.toBe(source);
  });
});
