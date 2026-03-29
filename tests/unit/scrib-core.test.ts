import { describe, expect, it } from 'vitest';
import { defaultScribRegistry, assignScribToTarget, composeRuntimePlan } from '@/engine/scrib';
import type { Entity, Scene } from '@/types/engine';

function makeEntity(id: string, name: string): Entity {
  return {
    id,
    name,
    components: new Map(),
    children: [],
    parentId: null,
    active: true,
    tags: [],
  };
}

function makeScene(id: string, name: string): Scene {
  return {
    id,
    name,
    entities: [],
    rootEntities: [],
    environment: {
      skybox: null,
      ambientLight: { r: 0.1, g: 0.1, b: 0.1, a: 1 },
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

describe('Scrib core', () => {
  it('registry exposes atomic and composed scribs', () => {
    const atomic = defaultScribRegistry.list('atomic');
    const composed = defaultScribRegistry.list('composed');

    expect(atomic.length).toBeGreaterThan(10);
    expect(composed.some((item) => item.type === 'characterBasic')).toBe(true);
  });

  it('assign auto-adds dependencies', () => {
    const instances = new Map();
    const result = assignScribToTarget(
      {
        target: { scope: 'entity', id: 'player_01' },
        type: 'movement',
        origin: 'manual',
      },
      instances
    );

    expect(result.ok).toBe(true);
    expect(result.assigned.some((item) => item.type === 'movement')).toBe(true);
    expect(result.autoAdded.some((item) => item.type === 'transform')).toBe(true);
  });

  it('composer returns runtime nodes in deterministic order', () => {
    const scene = makeScene('scene_01', 'Scene 01');
    const entity = makeEntity('player_01', 'Player');
    const scribInstances = new Map();
    const assign = assignScribToTarget(
      {
        target: { scope: 'entity', id: entity.id },
        type: 'characterBasic',
        origin: 'ai',
      },
      scribInstances
    );

    expect(assign.ok).toBe(true);
    [...assign.assigned, ...assign.autoAdded].forEach((item) => {
      scribInstances.set(item.id, item);
    });

    const plan = composeRuntimePlan({
      scenes: [scene],
      activeSceneId: scene.id,
      entities: new Map([[entity.id, entity]]),
      scribInstances,
    });

    expect(plan.ok).toBe(true);
    expect(plan.nodes.length).toBeGreaterThan(2);
    const priorities = plan.nodes.map((node) => node.priority);
    const sorted = [...priorities].sort((a, b) => a - b);
    expect(priorities).toEqual(sorted);
  });
});
