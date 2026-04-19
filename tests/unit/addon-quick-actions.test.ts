import { describe, expect, it } from 'vitest';
import type { Addon, Entity } from '@/types/engine';
import {
  getAddonQuickActions,
  runAddonQuickAction,
} from '@/engine/editor/addonQuickActions';

function createEntity(name: string, withMeshRenderer = true): Entity {
  const components = new Map();

  if (withMeshRenderer) {
    components.set('MeshRenderer', {
      id: 'mesh-renderer',
      type: 'MeshRenderer',
      enabled: true,
      data: {
        meshId: 'cube',
        materialId: 'default',
        material: {
          id: 'default',
          name: 'Default',
        },
      },
    });
  }

  return {
    id: `${name.toLowerCase()}-id`,
    name,
    components,
    children: [],
    parentId: null,
    active: true,
    tags: [],
  };
}

function createAddon(id: string): Addon {
  return {
    id,
    name: id,
    version: '1.0.0',
    author: 'test',
    description: 'test addon',
    enabled: true,
    entryPoint: `addon://${id}`,
    dependencies: [],
    permissions: ['assets'],
  };
}

describe('addon quick actions', () => {
  it('exposes quick actions for installed content packs', () => {
    const actions = getAddonQuickActions('materials_core_pack');

    expect(actions.map((action) => action.id)).toEqual(
      expect.arrayContaining(['apply_steel', 'apply_frosted_glass', 'apply_skin'])
    );
  });

  it('applies a material preset to the selected mesh entity', () => {
    const entity = createEntity('Hero');
    const result = runAddonQuickAction({
      addon: createAddon('materials_core_pack'),
      actionId: 'apply_steel',
      selectedEntity: entity,
    });

    expect(result.ok).toBe(true);
    const nextMeshRenderer = result.patch?.components?.get('MeshRenderer');
    const meshData = nextMeshRenderer?.data as
      | { materialId?: string; material?: { name?: string } }
      | undefined;
    expect(meshData?.materialId).toBe('steel');
    expect(meshData?.material?.name).toBe('Steel');
  });

  it('can create a helper entity from a content pack without prior selection', () => {
    const result = runAddonQuickAction({
      addon: createAddon('materials_core_pack'),
      actionId: 'create_steel_prop',
      selectedEntity: null,
    });

    expect(result.ok).toBe(true);
    expect(result.createdEntity?.name).toBe('Steel Prop');
    expect(result.selectEntityId).toBe(result.createdEntity?.id);
    const meshData = result.createdEntity?.components.get('MeshRenderer')?.data as
      | { materialId?: string }
      | undefined;
    expect(meshData?.materialId).toBe('steel');
  });

  it('can create a chained material showcase scene pack', () => {
    const result = runAddonQuickAction({
      addon: createAddon('materials_core_pack'),
      actionId: 'create_material_showcase',
      selectedEntity: null,
    });

    expect(result.ok).toBe(true);
    expect(result.createdEntities?.length).toBe(5);
    const selected = result.createdEntities?.find((entity) => entity.id === result.selectEntityId);
    const meshData = selected?.components.get('MeshRenderer')?.data as
      | { materialId?: string }
      | undefined;
    expect(meshData?.materialId).toBe('steel');
  });

  it('adds or updates a particle system from a VFX preset', () => {
    const entity = createEntity('Campfire');
    const result = runAddonQuickAction({
      addon: createAddon('vfx_core_pack'),
      actionId: 'apply_bonfire',
      selectedEntity: entity,
    });

    expect(result.ok).toBe(true);
    const particleSystem = result.patch?.components?.get('ParticleSystem');
    expect(particleSystem?.data?.presetId).toBe('bonfire');
    expect(particleSystem?.data?.simulationBackend).toBe('gpu');
  });

  it('can create a bonfire helper entity with VFX ready to use', () => {
    const result = runAddonQuickAction({
      addon: createAddon('vfx_core_pack'),
      actionId: 'create_bonfire_helper',
      selectedEntity: null,
    });

    expect(result.ok).toBe(true);
    expect(result.createdEntity?.name).toBe('Bonfire Helper');
    const particleSystem = result.createdEntity?.components.get('ParticleSystem');
    expect(particleSystem?.data?.presetId).toBe('bonfire');
    expect(particleSystem?.data?.simulationBackend).toBe('gpu');
  });

  it('can create a chained campfire scene pack', () => {
    const result = runAddonQuickAction({
      addon: createAddon('vfx_core_pack'),
      actionId: 'create_campfire_scene',
      selectedEntity: null,
    });

    expect(result.ok).toBe(true);
    expect(result.createdEntities?.length).toBe(5);
    const selected = result.createdEntities?.find((entity) => entity.id === result.selectEntityId);
    const particleSystem = selected?.components.get('ParticleSystem');
    expect(particleSystem?.data?.presetId).toBe('bonfire');
  });

  it('creates an animator and activates starter clips for animation packs', () => {
    const entity = createEntity('Runner');

    const ensured = runAddonQuickAction({
      addon: createAddon('animation_starter_pack'),
      actionId: 'ensure_animator',
      selectedEntity: entity,
    });
    expect(ensured.ok).toBe(true);

    const animatedEntity = {
      ...entity,
      components: ensured.patch?.components ?? entity.components,
    };

    const walk = runAddonQuickAction({
      addon: createAddon('animation_starter_pack'),
      actionId: 'activate_walk_cycle',
      selectedEntity: animatedEntity,
    });

    expect(walk.ok).toBe(true);
    const animatorData = walk.patch?.components?.get('Animator')?.data as {
      currentAnimation?: string | null;
      editor?: { clips?: Array<{ name: string }>; activeClipId?: string };
    };
    expect(animatorData.currentAnimation).toBe('Walk Cycle');
    expect(animatorData.editor?.clips?.some((clip) => clip.name === 'Walk Cycle')).toBe(true);
  });

  it('can create an animated helper entity with walk cycle active', () => {
    const result = runAddonQuickAction({
      addon: createAddon('animation_starter_pack'),
      actionId: 'create_walk_dummy',
      selectedEntity: null,
    });

    expect(result.ok).toBe(true);
    expect(result.createdEntity?.name).toBe('Walk Dummy');
    const animatorData = result.createdEntity?.components.get('Animator')?.data as {
      currentAnimation?: string | null;
      editor?: { clips?: Array<{ name: string }> };
    };
    expect(animatorData.currentAnimation).toBe('Walk Cycle');
    expect(animatorData.editor?.clips?.some((clip) => clip.name === 'Walk Cycle')).toBe(true);
  });

  it('can create a chained walk stage scene pack', () => {
    const result = runAddonQuickAction({
      addon: createAddon('animation_starter_pack'),
      actionId: 'create_walk_stage',
      selectedEntity: null,
    });

    expect(result.ok).toBe(true);
    expect(result.createdEntities?.length).toBe(4);
    const selected = result.createdEntities?.find((entity) => entity.id === result.selectEntityId);
    const animatorData = selected?.components.get('Animator')?.data as {
      currentAnimation?: string | null;
      editor?: { clips?: Array<{ name: string }> };
    };
    expect(animatorData.currentAnimation).toBe('Walk Cycle');
    expect(animatorData.editor?.clips?.some((clip) => clip.name === 'Walk Cycle')).toBe(true);
  });

  it('fails gracefully when a material action has no mesh renderer', () => {
    const entity = createEntity('Locator', false);
    const result = runAddonQuickAction({
      addon: createAddon('materials_core_pack'),
      actionId: 'apply_skin',
      selectedEntity: entity,
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('no tiene MeshRenderer');
  });

  it('creates a boss arena scene pack with a lava core selected', () => {
    const result = runAddonQuickAction({
      addon: createAddon('boss_arena_pack'),
      actionId: 'create_boss_arena',
      selectedEntity: null,
    });

    expect(result.ok).toBe(true);
    expect(result.createdEntities?.length).toBe(6);
    const selected = result.createdEntities?.find((entity) => entity.id === result.selectEntityId);
    const meshData = selected?.components.get('MeshRenderer')?.data as
      | { materialId?: string }
      | undefined;
    expect(meshData?.materialId).toBe('lava');
  });

  it('creates a horror fog scene pack with mist selected', () => {
    const result = runAddonQuickAction({
      addon: createAddon('horror_fog_scene_pack'),
      actionId: 'create_horror_fog_scene',
      selectedEntity: null,
    });

    expect(result.ok).toBe(true);
    expect(result.createdEntities?.length).toBe(6);
    const selected = result.createdEntities?.find((entity) => entity.id === result.selectEntityId);
    const particleSystem = selected?.components.get('ParticleSystem');
    expect(particleSystem?.data?.presetId).toBe('mist');
  });

  it('creates a sci-fi material lab scene pack with mercury selected', () => {
    const result = runAddonQuickAction({
      addon: createAddon('scifi_material_lab_pack'),
      actionId: 'create_scifi_material_lab',
      selectedEntity: null,
    });

    expect(result.ok).toBe(true);
    expect(result.createdEntities?.length).toBe(6);
    const selected = result.createdEntities?.find((entity) => entity.id === result.selectEntityId);
    const meshData = selected?.components.get('MeshRenderer')?.data as
      | { materialId?: string }
      | undefined;
    expect(meshData?.materialId).toBe('mercury');
  });

  it('creates an animation demo stage scene pack with run cycle selected', () => {
    const result = runAddonQuickAction({
      addon: createAddon('animation_demo_stage_pack'),
      actionId: 'create_animation_demo_stage',
      selectedEntity: null,
    });

    expect(result.ok).toBe(true);
    expect(result.createdEntities?.length).toBe(5);
    const selected = result.createdEntities?.find((entity) => entity.id === result.selectEntityId);
    const animatorData = selected?.components.get('Animator')?.data as {
      currentAnimation?: string | null;
      editor?: { clips?: Array<{ name: string }> };
    };
    expect(animatorData.currentAnimation).toBe('Run Cycle');
    expect(animatorData.editor?.clips?.some((clip) => clip.name === 'Run Cycle')).toBe(true);
  });
});
