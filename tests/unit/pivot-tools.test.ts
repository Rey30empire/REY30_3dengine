import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  computeEditableMeshBoundsCenter,
  resolveEditableMeshFromEntity,
  translateEditableMesh,
} from '@/engine/editor/pivotTools';
import type { Entity } from '@/types/engine';

describe('pivotTools', () => {
  it('computes the center of an editable mesh bounds', () => {
    const center = computeEditableMeshBoundsCenter({
      vertices: [
        { x: -2, y: 1, z: -1 },
        { x: 2, y: 3, z: 1 },
        { x: 0, y: 5, z: 4 },
      ],
      faces: [[0, 1, 2]],
    });

    expect(center.x).toBeCloseTo(0, 5);
    expect(center.y).toBeCloseTo(3, 5);
    expect(center.z).toBeCloseTo(1.5, 5);
  });

  it('translates mesh vertices without mutating the original mesh', () => {
    const source = {
      vertices: [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 1, z: 1 },
      ],
      faces: [[0, 1, 1] as [number, number, number]],
    };

    const translated = translateEditableMesh(source, new THREE.Vector3(2, -1, 0.5));

    expect(source.vertices[0]).toEqual({ x: 0, y: 0, z: 0 });
    expect(translated.vertices[0]).toEqual({ x: 2, y: -1, z: 0.5 });
    expect(translated.vertices[1]).toEqual({ x: 3, y: 0, z: 1.5 });
  });

  it('resolves manual meshes and supported primitives for origin operations', () => {
    const entity: Entity = {
      id: 'entity-1',
      name: 'Cube',
      children: [],
      parentId: null,
      active: true,
      tags: [],
      components: new Map([
        ['Transform', {
          id: 'transform-1',
          type: 'Transform',
          enabled: true,
          data: {
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            scale: { x: 1, y: 1, z: 1 },
          },
        }],
        ['MeshRenderer', {
          id: 'mesh-1',
          type: 'MeshRenderer',
          enabled: true,
          data: {
            meshId: 'cube',
            materialId: 'default',
            castShadows: true,
            receiveShadows: true,
          },
        }],
      ]),
    };

    const cubeMesh = resolveEditableMeshFromEntity(entity);
    expect(cubeMesh?.vertices.length).toBe(8);

    entity.components.set('MeshRenderer', {
      id: 'mesh-2',
      type: 'MeshRenderer',
      enabled: true,
      data: {
        meshId: 'sphere',
        materialId: 'default',
        castShadows: true,
        receiveShadows: true,
      },
    });
    expect(resolveEditableMeshFromEntity(entity)).toBeNull();
  });
});
