import type { Addon, Component, Entity } from '@/types/engine';
import { EntityFactory } from '@/engine/core/ECS';
import { makeStarterCamera, makeStarterLight } from '@/engine/reyplay/studio/Templates';
import { getMaterialPreset } from './editorMaterials';
import { SIMULATION_COMPONENT_DEFAULTS } from './inspector/simulation';
import { getParticlePresetRegistryEntry } from '@/engine/rendering/particlePresetRegistry';
import {
  createDefaultAnimatorEditorState,
  createLibraryClip,
  normalizeAnimatorEditorState,
  serializeAnimatorEditorState,
} from './animationEditorState';

export interface AddonQuickActionDefinition {
  id: string;
  label: string;
  description: string;
  requiresSelectedEntity?: boolean;
  requiresMeshRenderer?: boolean;
  createsEntity?: boolean;
  createsScenePack?: boolean;
}

interface AddonQuickActionResult {
  ok: boolean;
  message: string;
  patch?: Partial<Entity>;
  createdEntity?: Entity;
  createdEntities?: Entity[];
  selectEntityId?: string | null;
}

const CONTENT_PACK_QUICK_ACTIONS: Record<string, AddonQuickActionDefinition[]> = {
  materials_core_pack: [
    {
      id: 'apply_steel',
      label: 'Steel',
      description: 'Aplica un material metálico base al MeshRenderer seleccionado.',
      requiresSelectedEntity: true,
      requiresMeshRenderer: true,
    },
    {
      id: 'apply_frosted_glass',
      label: 'Frosted Glass',
      description: 'Aplica un material translúcido útil para vidrio esmerilado.',
      requiresSelectedEntity: true,
      requiresMeshRenderer: true,
    },
    {
      id: 'apply_skin',
      label: 'Skin',
      description: 'Aplica un material orgánico base para personajes o manos.',
      requiresSelectedEntity: true,
      requiresMeshRenderer: true,
    },
    {
      id: 'create_steel_prop',
      label: 'Crear Steel Prop',
      description: 'Crea una entidad helper con material Steel lista para usar.',
      createsEntity: true,
    },
    {
      id: 'create_material_showcase',
      label: 'Crear Material Showcase',
      description: 'Instancia una mini escena con piso, props de material, luz y cámara.',
      createsScenePack: true,
    },
  ],
  vfx_core_pack: [
    {
      id: 'apply_bonfire',
      label: 'Bonfire',
      description: 'Monta un ParticleSystem de fuego base sobre la selección.',
      requiresSelectedEntity: true,
    },
    {
      id: 'apply_water_splash',
      label: 'Water Splash',
      description: 'Monta un preset líquido para impactos y salpicaduras.',
      requiresSelectedEntity: true,
    },
    {
      id: 'apply_void_smoke',
      label: 'Void Smoke',
      description: 'Monta un preset de humo oscuro para FX más dramáticos.',
      requiresSelectedEntity: true,
    },
    {
      id: 'create_bonfire_helper',
      label: 'Crear Bonfire Helper',
      description: 'Crea una entidad helper con el preset Bonfire listo para escena.',
      createsEntity: true,
    },
    {
      id: 'create_campfire_scene',
      label: 'Crear Campfire Scene',
      description: 'Instancia una escena VFX con piso, bonfire, void smoke, luz y cámara.',
      createsScenePack: true,
    },
  ],
  ambient_fx_pack: [
    {
      id: 'apply_ambient_motes',
      label: 'Ambient Motes',
      description: 'Llena la escena con partículas flotantes suaves.',
      requiresSelectedEntity: true,
    },
    {
      id: 'apply_dust',
      label: 'Dust',
      description: 'Aplica un preset de polvo ambiental ligero.',
      requiresSelectedEntity: true,
    },
    {
      id: 'apply_mist',
      label: 'Mist',
      description: 'Aplica una niebla suave para atmósfera y mood.',
      requiresSelectedEntity: true,
    },
    {
      id: 'create_mist_volume',
      label: 'Crear Mist Volume',
      description: 'Crea una entidad helper de niebla ambiental lista para usar.',
      createsEntity: true,
    },
    {
      id: 'create_atmosphere_scene',
      label: 'Crear Atmosphere Scene',
      description: 'Instancia una escena ambiental con mist, motes flotantes, luz y cámara.',
      createsScenePack: true,
    },
  ],
  animation_starter_pack: [
    {
      id: 'ensure_animator',
      label: 'Montar Rig',
      description: 'Asegura un Animator base con rig humanoide y pose mode.',
      requiresSelectedEntity: true,
    },
    {
      id: 'activate_walk_cycle',
      label: 'Walk Cycle',
      description: 'Activa o agrega un clip base de caminata sobre la selección.',
      requiresSelectedEntity: true,
    },
    {
      id: 'activate_run_cycle',
      label: 'Run Cycle',
      description: 'Activa o agrega un clip base de carrera sobre la selección.',
      requiresSelectedEntity: true,
    },
    {
      id: 'create_walk_dummy',
      label: 'Crear Walk Dummy',
      description: 'Crea una entidad demo con Animator y Walk Cycle activo.',
      createsEntity: true,
    },
    {
      id: 'create_walk_stage',
      label: 'Crear Walk Stage',
      description: 'Instancia una mini escena de animación con piso, dummy, luz y cámara.',
      createsScenePack: true,
    },
  ],
  boss_arena_pack: [
    {
      id: 'create_boss_arena',
      label: 'Crear Boss Arena',
      description: 'Instancia una arena dramática con núcleo caliente, humo oscuro, sombras, luz y cámara.',
      createsScenePack: true,
    },
  ],
  horror_fog_scene_pack: [
    {
      id: 'create_horror_fog_scene',
      label: 'Crear Horror Fog Scene',
      description: 'Instancia una escena de horror con mist, black smoke, shadow motes, luz y cámara.',
      createsScenePack: true,
    },
  ],
  scifi_material_lab_pack: [
    {
      id: 'create_scifi_material_lab',
      label: 'Crear Sci-Fi Material Lab',
      description: 'Instancia un laboratorio sci-fi para lookdev con props de mercury, acrylic, aluminum y luz.',
      createsScenePack: true,
    },
  ],
  animation_demo_stage_pack: [
    {
      id: 'create_animation_demo_stage',
      label: 'Crear Animation Demo Stage',
      description: 'Instancia un stage de demo con dummies animados, luz y cámara.',
      createsScenePack: true,
    },
  ],
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function cloneComponents(entity: Entity) {
  return new Map(entity.components);
}

function extractEntityPosition(entity: Entity | null) {
  const transform = entity?.components.get('Transform');
  const transformData = asRecord(transform?.data);
  const position = asRecord(transformData?.position);
  return {
    x: Number.isFinite(position?.x) ? Number(position?.x) : 0,
    y: Number.isFinite(position?.y) ? Number(position?.y) : 0,
    z: Number.isFinite(position?.z) ? Number(position?.z) : 0,
  };
}

function createTransformComponent(position: { x: number; y: number; z: number }): Component {
  return {
    id: crypto.randomUUID(),
    type: 'Transform',
    enabled: true,
    data: {
      position,
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
    },
  };
}

function updateTransformComponent(
  entity: Entity,
  updates: {
    position?: { x: number; y: number; z: number };
    scale?: { x: number; y: number; z: number };
  }
) {
  const current = entity.components.get('Transform');
  const currentData = asRecord(current?.data);
  entity.components.set('Transform', {
    id: current?.id ?? crypto.randomUUID(),
    type: 'Transform',
    enabled: current?.enabled ?? true,
    data: {
      position:
        updates.position ??
        (asRecord(currentData.position) as { x?: number; y?: number; z?: number } | null) ?? {
          x: 0,
          y: 0,
          z: 0,
        },
      rotation:
        asRecord(currentData.rotation) ?? {
          x: 0,
          y: 0,
          z: 0,
          w: 1,
        },
      scale:
        updates.scale ??
        (asRecord(currentData.scale) as { x?: number; y?: number; z?: number } | null) ?? {
          x: 1,
          y: 1,
          z: 1,
        },
    },
  });
}

function createMeshRendererComponent(meshId: string, materialId = 'default', material?: Record<string, unknown>): Component {
  return {
    id: crypto.randomUUID(),
    type: 'MeshRenderer',
    enabled: true,
    data: {
      meshId,
      materialId,
      material: material ?? undefined,
      castShadows: true,
      receiveShadows: true,
    },
  };
}

function createHelperEntity(name: string, meshId: string, selectedEntity: Entity | null) {
  const entity = EntityFactory.create(name);
  const origin = extractEntityPosition(selectedEntity);
  entity.components.set(
    'Transform',
    createTransformComponent({
      x: origin.x + 1.5,
      y: origin.y,
      z: origin.z,
    })
  );
  entity.components.set('MeshRenderer', createMeshRendererComponent(meshId));
  return entity;
}

function createFloorEntity(name: string, materialId: string, selectedEntity: Entity | null) {
  const entity = EntityFactory.create(name);
  const origin = extractEntityPosition(selectedEntity);
  entity.components.set(
    'Transform',
    createTransformComponent({
      x: origin.x,
      y: origin.y - 0.5,
      z: origin.z,
    })
  );
  updateTransformComponent(entity, {
    scale: { x: 8, y: 1, z: 8 },
  });
  entity.components.set('MeshRenderer', createMeshRendererComponent('plane'));
  const applied = buildMaterialActionPatch(entity, materialId);
  entity.components = applied.patch?.components ?? entity.components;
  return entity;
}

function placeHelperEntity(
  entity: Entity,
  position: { x: number; y: number; z: number },
  scale?: { x: number; y: number; z: number }
) {
  updateTransformComponent(entity, { position, scale });
  return entity;
}

function createScenePackResult(
  message: string,
  createdEntities: Entity[],
  selectEntityId: string | null
): AddonQuickActionResult {
  return {
    ok: true,
    message,
    createdEntities,
    selectEntityId,
  };
}

function buildMaterialActionPatch(entity: Entity, materialId: string): AddonQuickActionResult {
  const meshRenderer = entity.components.get('MeshRenderer');
  if (!meshRenderer) {
    return {
      ok: false,
      message: `La selección actual (${entity.name}) no tiene MeshRenderer.`,
    };
  }

  const preset = getMaterialPreset(materialId);
  if (!preset) {
    return {
      ok: false,
      message: `No se encontró el material ${materialId}.`,
    };
  }

  const nextComponents = cloneComponents(entity);
  nextComponents.set('MeshRenderer', {
    ...meshRenderer,
    data: {
      ...asRecord(meshRenderer.data),
      materialId: preset.id,
      material: {
        ...preset,
      },
    },
  });

  return {
    ok: true,
    message: `${preset.name} aplicado a ${entity.name}.`,
    patch: { components: nextComponents },
  };
}

function buildMaterialCreationResult(
  entityName: string,
  meshId: string,
  materialId: string,
  selectedEntity: Entity | null
): AddonQuickActionResult {
  const helper = createHelperEntity(entityName, meshId, selectedEntity);
  const applyResult = buildMaterialActionPatch(helper, materialId);
  helper.components = applyResult.patch?.components ?? helper.components;

  return {
    ok: true,
    message: `${helper.name} creado con ${getMaterialPreset(materialId)?.name ?? materialId}.`,
    createdEntity: helper,
    selectEntityId: helper.id,
  };
}

function buildParticleDataFromPreset(presetId: string) {
  const presetEntry = getParticlePresetRegistryEntry(presetId);
  if (!presetEntry) return null;

  const preset = presetEntry.params;
  const lifetimeMin = Math.max(0.05, preset.lifetimeMin ?? 0.4);
  const lifetimeMax = Math.max(lifetimeMin, preset.lifetimeMax ?? 1.4);
  const looping = (preset.burstCount ?? 0) === 0 && (preset.rate ?? 0) > 0;

  return {
    presetId: presetEntry.id,
    rate: preset.rate ?? 24,
    maxParticles: preset.maxParticles ?? 800,
    burstCount: preset.burstCount ?? 0,
    duration: Math.max(lifetimeMax, 0.1),
    looping,
    shape: preset.shape ?? 'sphere',
    radius: preset.radius ?? 0.35,
    speedMin: preset.speedMin ?? 0.6,
    speedMax: Math.max(preset.speedMin ?? 0.6, preset.speedMax ?? 1.8),
    direction: preset.direction ?? 'up',
    lifetimeMin,
    lifetimeMax,
    startSizeMin: preset.startSizeMin ?? 0.12,
    startSizeMax: preset.startSizeMax ?? 0.24,
    endSizeMin: preset.endSizeMin ?? 0,
    endSizeMax: preset.endSizeMax ?? 0.08,
    gravity: preset.gravity ?? -0.6,
    drag: preset.drag ?? 0,
    blendMode: preset.blendMode ?? 'additive',
    startColor: {
      r: preset.startColor?.r ?? 1,
      g: preset.startColor?.g ?? 1,
      b: preset.startColor?.b ?? 1,
    },
    endColor: {
      r: preset.endColor?.r ?? 1,
      g: preset.endColor?.g ?? 1,
      b: preset.endColor?.b ?? 1,
    },
    startAlpha: preset.startAlpha ?? 1,
    endAlpha: preset.endAlpha ?? 0,
    noiseStrength: preset.noiseStrength ?? 0,
    noiseFrequency: preset.noiseFrequency ?? 1,
    simulationBackend: presetEntry.previewBackend,
  };
}

function buildParticleActionPatch(entity: Entity, presetId: string): AddonQuickActionResult {
  const presetEntry = getParticlePresetRegistryEntry(presetId);
  const presetData = buildParticleDataFromPreset(presetId);
  if (!presetEntry || !presetData) {
    return {
      ok: false,
      message: `No se encontró el preset de partículas ${presetId}.`,
    };
  }

  const existing = entity.components.get('ParticleSystem');
  const nextComponents = cloneComponents(entity);
  const nextComponent: Component = {
    id: existing?.id ?? crypto.randomUUID(),
    type: 'ParticleSystem',
    enabled: existing?.enabled ?? true,
    data: {
      ...structuredClone(SIMULATION_COMPONENT_DEFAULTS.ParticleSystem),
      ...asRecord(existing?.data),
      ...presetData,
    },
  };
  nextComponents.set('ParticleSystem', nextComponent);

  return {
    ok: true,
    message: `${presetEntry.name} aplicado como ParticleSystem en ${entity.name}.`,
    patch: { components: nextComponents },
  };
}

function buildParticleCreationResult(
  entityName: string,
  meshId: string,
  presetId: string,
  selectedEntity: Entity | null
): AddonQuickActionResult {
  const helper = createHelperEntity(entityName, meshId, selectedEntity);
  const applyResult = buildParticleActionPatch(helper, presetId);
  helper.components = applyResult.patch?.components ?? helper.components;

  return {
    ok: true,
    message: `${helper.name} creado con el preset ${presetId}.`,
    createdEntity: helper,
    selectEntityId: helper.id,
  };
}

function upsertAnimationClip(entity: Entity, clipName: string): AddonQuickActionResult {
  const animator = entity.components.get('Animator');
  const baseData = animator
    ? asRecord(animator.data)
    : {
        controllerId: null,
        currentAnimation: null,
        parameters: {},
      };

  const state = normalizeAnimatorEditorState(animator?.data ?? null, entity.name);
  const existingClip = state.clips.find((clip) => clip.name === clipName) ?? null;
  const nextClip = existingClip ?? createLibraryClip(clipName);
  const nextClips = existingClip ? state.clips : [...state.clips, nextClip];
  const nextState = {
    ...state,
    activeClipId: nextClip.id,
    clips: nextClips,
  };

  const nextComponents = cloneComponents(entity);
  nextComponents.set('Animator', {
    id: animator?.id ?? crypto.randomUUID(),
    type: 'Animator',
    enabled: animator?.enabled ?? true,
    data: serializeAnimatorEditorState(baseData, nextState),
  });

  return {
    ok: true,
    message: `${clipName} listo en ${entity.name}.`,
    patch: { components: nextComponents },
  };
}

function ensureAnimatorPatch(entity: Entity): AddonQuickActionResult {
  const animator = entity.components.get('Animator');
  if (animator) {
    return {
      ok: true,
      message: `${entity.name} ya tenía Animator listo.`,
      patch: undefined,
    };
  }

  const state = createDefaultAnimatorEditorState(entity.name);
  const nextComponents = cloneComponents(entity);
  nextComponents.set('Animator', {
    id: crypto.randomUUID(),
    type: 'Animator',
    enabled: true,
    data: serializeAnimatorEditorState(
      {
        controllerId: null,
        currentAnimation: null,
        parameters: {},
      },
      state
    ),
  });

  return {
    ok: true,
    message: `Animator base montado para ${entity.name}.`,
    patch: { components: nextComponents },
  };
}

function buildAnimatedCreationResult(
  entityName: string,
  clipName: string,
  selectedEntity: Entity | null
): AddonQuickActionResult {
  const helper = createHelperEntity(entityName, 'cube', selectedEntity);
  const ensured = ensureAnimatorPatch(helper);
  helper.components = ensured.patch?.components ?? helper.components;
  const clipped = upsertAnimationClip(helper, clipName);
  helper.components = clipped.patch?.components ?? helper.components;

  return {
    ok: true,
    message: `${helper.name} creado con ${clipName} activo.`,
    createdEntity: helper,
    selectEntityId: helper.id,
  };
}

function buildMaterialShowcaseScene(selectedEntity: Entity | null): AddonQuickActionResult {
  const origin = extractEntityPosition(selectedEntity);
  const floor = createFloorEntity('Material Showcase Floor', 'concrete', selectedEntity);
  const steelProp = createHelperEntity('Steel Showcase Prop', 'cube', selectedEntity);
  placeHelperEntity(steelProp, { x: origin.x - 1.5, y: origin.y, z: origin.z });
  steelProp.components = buildMaterialActionPatch(steelProp, 'steel').patch?.components ?? steelProp.components;

  const glassProp = createHelperEntity('Glass Showcase Prop', 'sphere', selectedEntity);
  placeHelperEntity(glassProp, { x: origin.x + 1.5, y: origin.y, z: origin.z });
  glassProp.components =
    buildMaterialActionPatch(glassProp, 'frosted_glass').patch?.components ?? glassProp.components;

  const light = makeStarterLight('Material Showcase Light');
  placeHelperEntity(light, { x: origin.x + 5, y: origin.y + 8, z: origin.z + 4 });

  const camera = makeStarterCamera('Material Showcase Camera');
  placeHelperEntity(camera, { x: origin.x, y: origin.y + 3, z: origin.z + 8 });

  return createScenePackResult(
    'Material Showcase creado con piso, props, luz y cámara.',
    [floor, steelProp, glassProp, light, camera],
    steelProp.id
  );
}

function buildCampfireScene(selectedEntity: Entity | null): AddonQuickActionResult {
  const origin = extractEntityPosition(selectedEntity);
  const floor = createFloorEntity('Campfire Floor', 'stone', selectedEntity);
  const bonfire = createHelperEntity('Campfire Bonfire', 'cube', selectedEntity);
  placeHelperEntity(bonfire, { x: origin.x, y: origin.y, z: origin.z });
  bonfire.components =
    buildParticleActionPatch(bonfire, 'bonfire').patch?.components ?? bonfire.components;

  const smoke = createHelperEntity('Campfire Smoke', 'sphere', selectedEntity);
  placeHelperEntity(smoke, { x: origin.x + 1.8, y: origin.y + 0.2, z: origin.z });
  smoke.components =
    buildParticleActionPatch(smoke, 'void_smoke').patch?.components ?? smoke.components;

  const light = makeStarterLight('Campfire Scene Light');
  placeHelperEntity(light, { x: origin.x + 4, y: origin.y + 7, z: origin.z + 3 });

  const camera = makeStarterCamera('Campfire Scene Camera');
  placeHelperEntity(camera, { x: origin.x, y: origin.y + 2.8, z: origin.z + 7 });

  return createScenePackResult(
    'Campfire Scene creada con piso, bonfire, humo, luz y cámara.',
    [floor, bonfire, smoke, light, camera],
    bonfire.id
  );
}

function buildAtmosphereScene(selectedEntity: Entity | null): AddonQuickActionResult {
  const origin = extractEntityPosition(selectedEntity);
  const floor = createFloorEntity('Atmosphere Floor', 'concrete', selectedEntity);
  const mist = createHelperEntity('Atmosphere Mist', 'sphere', selectedEntity);
  placeHelperEntity(mist, { x: origin.x, y: origin.y + 0.2, z: origin.z }, { x: 1.4, y: 1.4, z: 1.4 });
  mist.components = buildParticleActionPatch(mist, 'mist').patch?.components ?? mist.components;

  const motes = createHelperEntity('Atmosphere Motes', 'cube', selectedEntity);
  placeHelperEntity(motes, { x: origin.x + 1.2, y: origin.y + 0.4, z: origin.z - 0.8 });
  motes.components =
    buildParticleActionPatch(motes, 'ambient_motes').patch?.components ?? motes.components;

  const light = makeStarterLight('Atmosphere Scene Light');
  placeHelperEntity(light, { x: origin.x + 3.5, y: origin.y + 7, z: origin.z + 2.5 });

  const camera = makeStarterCamera('Atmosphere Scene Camera');
  placeHelperEntity(camera, { x: origin.x, y: origin.y + 2.6, z: origin.z + 7.5 });

  return createScenePackResult(
    'Atmosphere Scene creada con mist, motes, luz y cámara.',
    [floor, mist, motes, light, camera],
    mist.id
  );
}

function buildWalkStage(selectedEntity: Entity | null): AddonQuickActionResult {
  const origin = extractEntityPosition(selectedEntity);
  const floor = createFloorEntity('Walk Stage Floor', 'concrete', selectedEntity);
  const dummyResult = buildAnimatedCreationResult('Walk Stage Dummy', 'Walk Cycle', selectedEntity);
  const dummy = dummyResult.createdEntity!;
  placeHelperEntity(dummy, { x: origin.x, y: origin.y, z: origin.z });

  const light = makeStarterLight('Walk Stage Light');
  placeHelperEntity(light, { x: origin.x + 4, y: origin.y + 8, z: origin.z + 3 });

  const camera = makeStarterCamera('Walk Stage Camera');
  placeHelperEntity(camera, { x: origin.x, y: origin.y + 2.8, z: origin.z + 7 });

  return createScenePackResult(
    'Walk Stage creada con piso, dummy, luz y cámara.',
    [floor, dummy, light, camera],
    dummy.id
  );
}

function buildBossArenaScene(selectedEntity: Entity | null): AddonQuickActionResult {
  const origin = extractEntityPosition(selectedEntity);
  const floor = createFloorEntity('Boss Arena Floor', 'stone', selectedEntity);
  updateTransformComponent(floor, {
    position: { x: origin.x, y: origin.y - 0.7, z: origin.z },
    scale: { x: 12, y: 1, z: 12 },
  });

  const bossCore = createHelperEntity('Boss Arena Core', 'sphere', selectedEntity);
  placeHelperEntity(bossCore, { x: origin.x, y: origin.y + 0.8, z: origin.z }, { x: 1.8, y: 1.8, z: 1.8 });
  bossCore.components = buildMaterialActionPatch(bossCore, 'lava').patch?.components ?? bossCore.components;

  const shadowAura = createHelperEntity('Boss Arena Shadow Aura', 'sphere', selectedEntity);
  placeHelperEntity(shadowAura, { x: origin.x, y: origin.y + 1.2, z: origin.z }, { x: 2.4, y: 2.4, z: 2.4 });
  shadowAura.components =
    buildParticleActionPatch(shadowAura, 'shadow_motes').patch?.components ?? shadowAura.components;

  const bossSmoke = createHelperEntity('Boss Arena Smoke', 'cube', selectedEntity);
  placeHelperEntity(bossSmoke, { x: origin.x, y: origin.y + 0.6, z: origin.z + 0.8 });
  bossSmoke.components =
    buildParticleActionPatch(bossSmoke, 'void_smoke').patch?.components ?? bossSmoke.components;

  const light = makeStarterLight('Boss Arena Light');
  placeHelperEntity(light, { x: origin.x + 5, y: origin.y + 9, z: origin.z + 4 });

  const camera = makeStarterCamera('Boss Arena Camera');
  placeHelperEntity(camera, { x: origin.x, y: origin.y + 3.2, z: origin.z + 9 });

  return createScenePackResult(
    'Boss Arena creada con core, sombra, humo, luz y cámara.',
    [floor, bossCore, shadowAura, bossSmoke, light, camera],
    bossCore.id
  );
}

function buildHorrorFogScene(selectedEntity: Entity | null): AddonQuickActionResult {
  const origin = extractEntityPosition(selectedEntity);
  const floor = createFloorEntity('Horror Floor', 'marble', selectedEntity);
  updateTransformComponent(floor, {
    position: { x: origin.x, y: origin.y - 0.6, z: origin.z },
    scale: { x: 10, y: 1, z: 10 },
  });

  const mist = createHelperEntity('Horror Mist', 'sphere', selectedEntity);
  placeHelperEntity(mist, { x: origin.x, y: origin.y + 0.2, z: origin.z }, { x: 2.2, y: 2.2, z: 2.2 });
  mist.components = buildParticleActionPatch(mist, 'mist').patch?.components ?? mist.components;

  const smoke = createHelperEntity('Horror Black Smoke', 'cube', selectedEntity);
  placeHelperEntity(smoke, { x: origin.x + 1.1, y: origin.y + 0.6, z: origin.z - 0.6 });
  smoke.components =
    buildParticleActionPatch(smoke, 'black_smoke').patch?.components ?? smoke.components;

  const shadows = createHelperEntity('Horror Shadow Motes', 'sphere', selectedEntity);
  placeHelperEntity(shadows, { x: origin.x - 1.1, y: origin.y + 0.8, z: origin.z + 0.4 });
  shadows.components =
    buildParticleActionPatch(shadows, 'shadow_motes').patch?.components ?? shadows.components;

  const light = makeStarterLight('Horror Scene Light');
  placeHelperEntity(light, { x: origin.x + 2.8, y: origin.y + 6.5, z: origin.z + 2.2 });

  const camera = makeStarterCamera('Horror Scene Camera');
  placeHelperEntity(camera, { x: origin.x, y: origin.y + 2.4, z: origin.z + 8 });

  return createScenePackResult(
    'Horror Fog Scene creada con mist, black smoke, sombras, luz y cámara.',
    [floor, mist, smoke, shadows, light, camera],
    mist.id
  );
}

function buildScifiMaterialLabScene(selectedEntity: Entity | null): AddonQuickActionResult {
  const origin = extractEntityPosition(selectedEntity);
  const floor = createFloorEntity('Sci-Fi Lab Floor', 'aluminum', selectedEntity);
  updateTransformComponent(floor, {
    position: { x: origin.x, y: origin.y - 0.55, z: origin.z },
    scale: { x: 11, y: 1, z: 9 },
  });

  const mercuryOrb = createHelperEntity('Sci-Fi Mercury Orb', 'sphere', selectedEntity);
  placeHelperEntity(mercuryOrb, { x: origin.x - 1.7, y: origin.y + 0.8, z: origin.z });
  mercuryOrb.components =
    buildMaterialActionPatch(mercuryOrb, 'mercury').patch?.components ?? mercuryOrb.components;

  const acrylicPanel = createHelperEntity('Sci-Fi Acrylic Panel', 'cube', selectedEntity);
  placeHelperEntity(acrylicPanel, { x: origin.x + 0.4, y: origin.y + 0.6, z: origin.z }, { x: 1.2, y: 2.2, z: 0.2 });
  acrylicPanel.components =
    buildMaterialActionPatch(acrylicPanel, 'acrylic').patch?.components ?? acrylicPanel.components;

  const goldAccent = createHelperEntity('Sci-Fi Gold Accent', 'sphere', selectedEntity);
  placeHelperEntity(goldAccent, { x: origin.x + 2.1, y: origin.y + 0.5, z: origin.z - 0.4 }, { x: 0.8, y: 0.8, z: 0.8 });
  goldAccent.components =
    buildMaterialActionPatch(goldAccent, 'gold').patch?.components ?? goldAccent.components;

  const light = makeStarterLight('Sci-Fi Lab Light');
  placeHelperEntity(light, { x: origin.x + 4.5, y: origin.y + 8.2, z: origin.z + 3 });

  const camera = makeStarterCamera('Sci-Fi Lab Camera');
  placeHelperEntity(camera, { x: origin.x, y: origin.y + 2.8, z: origin.z + 8.5 });

  return createScenePackResult(
    'Sci-Fi Material Lab creado con mercury, acrylic, gold, luz y cámara.',
    [floor, mercuryOrb, acrylicPanel, goldAccent, light, camera],
    mercuryOrb.id
  );
}

function buildAnimationDemoStageScene(selectedEntity: Entity | null): AddonQuickActionResult {
  const origin = extractEntityPosition(selectedEntity);
  const floor = createFloorEntity('Animation Demo Floor', 'concrete', selectedEntity);
  updateTransformComponent(floor, {
    position: { x: origin.x, y: origin.y - 0.55, z: origin.z },
    scale: { x: 12, y: 1, z: 7 },
  });

  const walkDummyResult = buildAnimatedCreationResult('Demo Walk Dummy', 'Walk Cycle', selectedEntity);
  const walkDummy = walkDummyResult.createdEntity!;
  placeHelperEntity(walkDummy, { x: origin.x - 1.6, y: origin.y, z: origin.z });

  const runDummyResult = buildAnimatedCreationResult('Demo Run Dummy', 'Run Cycle', selectedEntity);
  const runDummy = runDummyResult.createdEntity!;
  placeHelperEntity(runDummy, { x: origin.x + 1.6, y: origin.y, z: origin.z });

  const light = makeStarterLight('Animation Demo Light');
  placeHelperEntity(light, { x: origin.x + 4, y: origin.y + 8, z: origin.z + 3 });

  const camera = makeStarterCamera('Animation Demo Camera');
  placeHelperEntity(camera, { x: origin.x, y: origin.y + 3, z: origin.z + 8.5 });

  return createScenePackResult(
    'Animation Demo Stage creado con dummies de walk/run, luz y cámara.',
    [floor, walkDummy, runDummy, light, camera],
    runDummy.id
  );
}

export function getAddonQuickActions(addonOrId: Addon | string): AddonQuickActionDefinition[] {
  const addonId = typeof addonOrId === 'string' ? addonOrId : addonOrId.id;
  return CONTENT_PACK_QUICK_ACTIONS[addonId] ?? [];
}

export function runAddonQuickAction(params: {
  addon: Addon | string;
  actionId: string;
  selectedEntity: Entity | null;
}): AddonQuickActionResult {
  const addonId = typeof params.addon === 'string' ? params.addon : params.addon.id;
  const selectedEntity = params.selectedEntity;
  const action = getAddonQuickActions(addonId).find((entry) => entry.id === params.actionId) ?? null;

  if (!action) {
    return {
      ok: false,
      message: `La acción ${params.actionId} no está registrada para ${addonId}.`,
    };
  }

  if (action.requiresSelectedEntity && !selectedEntity) {
    return {
      ok: false,
      message: 'Selecciona una sola entidad para usar esta acción rápida.',
    };
  }

  switch (`${addonId}:${params.actionId}`) {
    case 'materials_core_pack:apply_steel':
      return buildMaterialActionPatch(selectedEntity!, 'steel');
    case 'materials_core_pack:apply_frosted_glass':
      return buildMaterialActionPatch(selectedEntity!, 'frosted_glass');
    case 'materials_core_pack:apply_skin':
      return buildMaterialActionPatch(selectedEntity!, 'skin');
    case 'materials_core_pack:create_steel_prop':
      return buildMaterialCreationResult('Steel Prop', 'cube', 'steel', selectedEntity);
    case 'materials_core_pack:create_material_showcase':
      return buildMaterialShowcaseScene(selectedEntity);
    case 'vfx_core_pack:apply_bonfire':
      return buildParticleActionPatch(selectedEntity!, 'bonfire');
    case 'vfx_core_pack:apply_water_splash':
      return buildParticleActionPatch(selectedEntity!, 'water_splash');
    case 'vfx_core_pack:apply_void_smoke':
      return buildParticleActionPatch(selectedEntity!, 'void_smoke');
    case 'vfx_core_pack:create_bonfire_helper':
      return buildParticleCreationResult('Bonfire Helper', 'cube', 'bonfire', selectedEntity);
    case 'vfx_core_pack:create_campfire_scene':
      return buildCampfireScene(selectedEntity);
    case 'ambient_fx_pack:apply_ambient_motes':
      return buildParticleActionPatch(selectedEntity!, 'ambient_motes');
    case 'ambient_fx_pack:apply_dust':
      return buildParticleActionPatch(selectedEntity!, 'dust');
    case 'ambient_fx_pack:apply_mist':
      return buildParticleActionPatch(selectedEntity!, 'mist');
    case 'ambient_fx_pack:create_mist_volume':
      return buildParticleCreationResult('Mist Volume', 'sphere', 'mist', selectedEntity);
    case 'ambient_fx_pack:create_atmosphere_scene':
      return buildAtmosphereScene(selectedEntity);
    case 'animation_starter_pack:ensure_animator':
      return ensureAnimatorPatch(selectedEntity!);
    case 'animation_starter_pack:activate_walk_cycle':
      return upsertAnimationClip(selectedEntity!, 'Walk Cycle');
    case 'animation_starter_pack:activate_run_cycle':
      return upsertAnimationClip(selectedEntity!, 'Run Cycle');
    case 'animation_starter_pack:create_walk_dummy':
      return buildAnimatedCreationResult('Walk Dummy', 'Walk Cycle', selectedEntity);
    case 'animation_starter_pack:create_walk_stage':
      return buildWalkStage(selectedEntity);
    case 'boss_arena_pack:create_boss_arena':
      return buildBossArenaScene(selectedEntity);
    case 'horror_fog_scene_pack:create_horror_fog_scene':
      return buildHorrorFogScene(selectedEntity);
    case 'scifi_material_lab_pack:create_scifi_material_lab':
      return buildScifiMaterialLabScene(selectedEntity);
    case 'animation_demo_stage_pack:create_animation_demo_stage':
      return buildAnimationDemoStageScene(selectedEntity);
    default:
      return {
        ok: false,
        message: `La acción ${params.actionId} no está registrada para ${addonId}.`,
      };
  }
}
