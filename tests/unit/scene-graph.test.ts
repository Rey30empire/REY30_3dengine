import { describe, expect, it } from 'vitest';
import type { Entity, Scene } from '@/types/engine';
import {
  collectDescendantIds,
  collectSceneEntityIds,
  materializeScene,
  normalizeScenesAndEntities,
} from '@/store/sceneGraph';
import { buildReyPlayManifest } from '@/engine/reyplay/build/compile';

function makeEntity(id: string, name: string, parentId: string | null = null): Entity {
  return {
    id,
    name,
    components: new Map(),
    children: [],
    parentId,
    active: true,
    tags: [],
  };
}

function makeScene(id: string, name: string, entities: Entity[] = [], rootEntities: string[] = []): Scene {
  return {
    id,
    name,
    entities,
    rootEntities,
    environment: {
      skybox: null,
      ambientLight: { r: 0.2, g: 0.2, b: 0.2, a: 1 },
      fog: null,
      postProcessing: {
        bloom: { enabled: false, intensity: 0, threshold: 0, radius: 0 },
        ssao: { enabled: false, radius: 0, intensity: 0, bias: 0 },
        ssr: { enabled: false, intensity: 0, maxDistance: 0 },
        colorGrading: { enabled: false, exposure: 1, contrast: 1, saturation: 1, gamma: 1 },
        vignette: { enabled: false, intensity: 0, smoothness: 0, roundness: 0 },
      },
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('scene graph helpers', () => {
  it('collects descendants from parentId relationships', () => {
    const player = makeEntity('player', 'Player');
    const weapon = makeEntity('weapon', 'Weapon', 'player');
    const muzzle = makeEntity('muzzle', 'Muzzle', 'weapon');
    const tree = makeEntity('tree', 'Tree');
    const entities = new Map([
      [player.id, player],
      [weapon.id, weapon],
      [muzzle.id, muzzle],
      [tree.id, tree],
    ]);

    expect(collectDescendantIds(entities, 'player')).toEqual(['player', 'weapon', 'muzzle']);
  });

  it('materializes parent-child trees and normalized roots inside a scene', () => {
    const player = makeEntity('player', 'Player');
    const weapon = makeEntity('weapon', 'Weapon', 'player');
    const scene = makeScene('scene-1', 'Scene 1', [player, weapon], ['player']);
    const entities = new Map([
      [player.id, player],
      [weapon.id, weapon],
    ]);

    const materialized = materializeScene(scene, entities);

    expect(materialized.scene.rootEntities).toEqual(['player']);
    expect(materialized.scene.entities).toHaveLength(2);
    expect(materialized.entities.get('player')?.children.map((child) => child.id)).toEqual(['weapon']);
    expect(materialized.entities.get('weapon')?.parentId).toBe('player');
  });

  it('expands scene membership to include descendants already tracked in the global map', () => {
    const player = makeEntity('player', 'Player');
    const weapon = makeEntity('weapon', 'Weapon', 'player');
    const scene = makeScene('scene-1', 'Scene 1', [player], ['player']);
    const entities = new Map([
      [player.id, player],
      [weapon.id, weapon],
    ]);

    const normalized = normalizeScenesAndEntities({
      scenes: [scene],
      entities,
      sceneIds: ['scene-1'],
    });

    expect(collectSceneEntityIds(normalized.scenes[0], normalized.entities)).toEqual(['player', 'weapon']);
    expect(normalized.scenes[0].entities.map((entity) => entity.id)).toEqual(['player', 'weapon']);
  });

  it('counts scene entities uniquely in the build manifest', () => {
    const player = makeEntity('player', 'Player');
    const weapon = makeEntity('weapon', 'Weapon', 'player');
    const scene = makeScene('scene-1', 'Scene 1', [player, weapon], ['player']);
    const entities = new Map([
      [player.id, player],
      [weapon.id, weapon],
    ]);

    const manifest = buildReyPlayManifest({
      scenes: [scene],
      entities,
      assets: [],
      scribProfiles: new Map(),
      scribInstances: new Map(),
      activeSceneId: 'scene-1',
      projectName: 'Scene Graph Test',
    });

    expect(manifest.scenes[0]?.rootEntityIds).toEqual(['player']);
    expect(manifest.scenes[0]?.entityCount).toBe(2);
  });
});
