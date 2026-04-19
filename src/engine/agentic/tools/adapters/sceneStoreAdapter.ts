import { v4 as uuidv4 } from 'uuid';
import type {
  Asset,
  AssetType,
  BuildArtifact,
  Component,
  ComponentType,
  Entity,
  Scene,
} from '@/types/engine';
import { EntityFactory } from '@/engine/core/ECS';
import {
  createLibraryClip,
  normalizeAnimatorEditorState,
  serializeAnimatorEditorState,
  type AnimationEditorClip,
  type AnimatorEditorState,
} from '@/engine/editor/animationEditorState';
import {
  resolveEditorMaterial,
  type EditorMaterialDefinition,
} from '@/engine/editor/editorMaterials';
import type { EngineStore } from '@/store/editorStore.types';
import type { BuildReport } from '@/engine/reyplay/types';
import type { EditorProjectSaveState } from '@/engine/serialization';
import {
  ONE_VECTOR,
  ZERO_VECTOR,
  createAgenticId,
  type AgenticAnimationClip,
  type AgenticAsset,
  type AgenticComponent,
  type AgenticComponentType,
  type AgenticEntity,
  type AgenticEnvironment,
  type AgenticFog,
  type AgenticMaterial,
  type AgenticScene,
  type AgenticTransform,
  type ChangeEvidence,
  type ColorRGBA,
  type JsonObject,
  type Vector3,
  type WorldState,
} from '../../schemas';
import type { WorldStateManager } from '../../memory/WorldStateManager';

export interface EditorStoreApi {
  getState: () => EngineStore;
}

export type EditorBuildTarget = 'web' | 'windows-exe' | 'windows-msi';

export type EditorBuildExportInput = EditorProjectSaveState & {
  buildManifest: EngineStore['buildManifest'];
};

export interface EditorBuildExportResult {
  ok: boolean;
  target: EditorBuildTarget;
  buildId: string;
  report: BuildReport;
  artifacts: BuildArtifact[];
  missingDeps: string[];
  logs: string[];
  source: 'local_node_build_pipeline' | 'remote_editor_project';
}

export type EditorBuildExporter = (
  target: EditorBuildTarget,
  input: EditorBuildExportInput
) => Promise<EditorBuildExportResult>;

export interface EditorSceneStoreAdapterOptions {
  buildExporter?: EditorBuildExporter;
}

export interface EditorRuntimeScaffold {
  createdCamera: boolean;
  createdPlayer: boolean;
  entityIds: string[];
  summaries: string[];
}

interface EditorRuntimeScaffoldResult extends EditorRuntimeScaffold {
  evidence: ChangeEvidence[];
}

export interface EditorBackedEntityInput {
  name: string;
  type?: AgenticEntity['type'];
  tags?: string[];
  sceneId?: string;
  transform?: Partial<AgenticTransform>;
  metadata?: JsonObject;
}

export interface EditorBackedMaterialInput {
  materialId?: string;
  name: string;
  color?: ColorRGBA;
  roughness?: number;
  metallic?: number;
  entityId?: string;
  metadata?: JsonObject;
}

export interface EditorBackedAnimationInput {
  entityId?: string;
  name: string;
  duration?: number;
  tracks?: JsonObject[];
  metadata?: JsonObject;
}

export interface EditorBackedAssetInput {
  id?: string;
  name: string;
  type?: AgenticAsset['type'];
  path?: string;
  valid?: boolean;
  metadata?: JsonObject;
}

const VALID_BUILD_TARGETS: EditorBuildTarget[] = ['web', 'windows-exe', 'windows-msi'];

function now(): string {
  return new Date().toISOString();
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeBuildTarget(target: string): EditorBuildTarget {
  return VALID_BUILD_TARGETS.includes(target as EditorBuildTarget)
    ? (target as EditorBuildTarget)
    : 'web';
}

function primaryBuildArtifact(artifacts: BuildArtifact[]): BuildArtifact | undefined {
  return (
    artifacts.find((artifact) => artifact.kind === 'bundle' || artifact.kind === 'installer') ??
    artifacts.find((artifact) => artifact.kind === 'manifest') ??
    artifacts[0]
  );
}

function runtimeScaffoldOutput(scaffold: EditorRuntimeScaffold): EditorRuntimeScaffold {
  return {
    createdCamera: scaffold.createdCamera,
    createdPlayer: scaffold.createdPlayer,
    entityIds: [...scaffold.entityIds],
    summaries: [...scaffold.summaries],
  };
}

function toJsonObject(value: unknown): JsonObject {
  if (!value || typeof value !== 'object') {
    return {};
  }

  return cloneJson(value) as JsonObject;
}

function evidence(
  type: ChangeEvidence['type'],
  summary: string,
  targetId?: string,
  before?: unknown,
  after?: unknown
): ChangeEvidence {
  return {
    id: createAgenticId('evidence'),
    type,
    targetId,
    summary,
    before: before === undefined ? undefined : toJsonObjectOrNull(before),
    after: after === undefined ? undefined : toJsonObjectOrNull(after),
    timestamp: now(),
  };
}

function toJsonObjectOrNull(value: unknown) {
  if (value === null) {
    return null;
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return toJsonObject(value);
}

function toQuaternion(rotation?: Partial<Vector3>) {
  return {
    x: rotation?.x ?? 0,
    y: rotation?.y ?? 0,
    z: rotation?.z ?? 0,
    w: 1,
  };
}

function inferAgenticEntityType(entity: Entity): AgenticEntity['type'] {
  if (entity.tags.includes('layout-group')) {
    return 'group';
  }
  if (entity.tags.includes('npc') || entity.tags.includes('patrol-target')) {
    return 'npc';
  }
  if (entity.components.has('Light')) {
    return 'light';
  }
  if (entity.components.has('Camera')) {
    return 'camera';
  }
  if (entity.components.has('MeshRenderer')) {
    return 'mesh';
  }
  return 'empty';
}

function transformFromEntity(entity: Entity): AgenticTransform {
  const transform = entity.components.get('Transform')?.data as
    | {
        position?: Partial<Vector3>;
        rotation?: Partial<Vector3>;
        scale?: Partial<Vector3>;
      }
    | undefined;

  return {
    position: { ...ZERO_VECTOR, ...transform?.position },
    rotation: {
      x: transform?.rotation?.x ?? 0,
      y: transform?.rotation?.y ?? 0,
      z: transform?.rotation?.z ?? 0,
    },
    scale: { ...ONE_VECTOR, ...transform?.scale },
  };
}

function agenticComponentFromEngine(component: Component): AgenticComponent {
  return {
    id: component.id,
    type: component.type as AgenticComponentType,
    data: toJsonObject(component.data),
    enabled: component.enabled,
  };
}

function engineFogFromAgentic(fog: AgenticFog | null | undefined) {
  if (fog === undefined) {
    return undefined;
  }
  if (fog === null) {
    return null;
  }
  return {
    enabled: fog.enabled,
    type: fog.type,
    color: fog.color,
    near: fog.near,
    far: fog.far,
    density: fog.density,
  };
}

function colorFromEngine(color: { r: number; g: number; b: number; a?: number }): ColorRGBA {
  return {
    r: color.r,
    g: color.g,
    b: color.b,
    a: color.a,
  };
}

function toAgenticEnvironment(scene: Scene): AgenticEnvironment {
  const environment = scene.environment;
  const fog = environment.fog
    ? {
        enabled: environment.fog.enabled,
        type: environment.fog.type,
        color: colorFromEngine(environment.fog.color),
        near: environment.fog.near,
        far: environment.fog.far,
        density: environment.fog.density,
      }
    : null;

  const ambientIntensity = environment.ambientIntensity ?? 1;
  const directionalLightIntensity = environment.directionalLightIntensity ?? 1;
  const mood: AgenticEnvironment['mood'] = fog?.enabled
    ? 'foggy'
    : ambientIntensity <= 0.35 && directionalLightIntensity <= 0.65
      ? 'dark'
      : ambientIntensity >= 0.9
        ? 'bright'
        : 'neutral';

  return {
    skybox: environment.skybox,
    mood,
    ambientLight: colorFromEngine(environment.ambientLight),
    ambientIntensity,
    directionalLightIntensity,
    fog,
  };
}

function toAgenticScene(scene: Scene): AgenticScene {
  return {
    id: scene.id,
    name: scene.name,
    rootEntityIds: [...scene.rootEntities],
    entityIds: scene.entities.map((entity) => entity.id),
    environment: toAgenticEnvironment(scene),
    layoutGroups: scene.entities
      .filter((entity) => entity.tags.includes('layout-group'))
      .map((entity) => entity.id),
    metadata: {},
    createdAt: scene.createdAt.toISOString(),
    updatedAt: scene.updatedAt.toISOString(),
  };
}

function toAgenticAssetType(type: string) {
  const supported = new Set(['mesh', 'texture', 'material', 'script', 'animation', 'audio', 'scene']);
  return supported.has(type) ? (type as 'mesh' | 'texture' | 'material' | 'script' | 'animation' | 'audio' | 'scene') : 'unknown';
}

function toEngineAssetType(type: AgenticAsset['type'] | undefined): AssetType {
  if (
    type === 'mesh' ||
    type === 'texture' ||
    type === 'material' ||
    type === 'script' ||
    type === 'animation' ||
    type === 'audio' ||
    type === 'scene'
  ) {
    return type;
  }
  return 'prefab';
}

function agenticMaterialFromDefinition(definition: EditorMaterialDefinition): AgenticMaterial {
  return {
    id: definition.id,
    name: definition.name,
    color: definition.albedoColor,
    roughness: definition.roughness,
    metallic: definition.metallic,
    metadata: {
      definition: toJsonObject(definition),
    },
  };
}

function materialDefinitionFromInput(input: EditorBackedMaterialInput): EditorMaterialDefinition {
  const materialId = input.materialId ?? createAgenticId('material');
  return resolveEditorMaterial({
    materialId,
    material: {
      id: materialId,
      name: input.name,
      albedoColor: input.color ?? { r: 1, g: 1, b: 1, a: 1 },
      metallic: input.metallic ?? 0,
      roughness: input.roughness ?? 0.5,
      ...(input.metadata ?? {}),
    },
  });
}

function materialDefinitionFromAsset(asset: Asset): EditorMaterialDefinition | null {
  if (asset.type !== 'material') {
    return null;
  }
  const definition = asset.metadata.definition;
  if (!definition || typeof definition !== 'object') {
    return null;
  }
  return resolveEditorMaterial({
    materialId: asset.id,
    material: definition,
  });
}

function animationClipsFromEntity(entity: Entity): AgenticAnimationClip[] {
  const animator = entity.components.get('Animator');
  if (!animator?.enabled) {
    return [];
  }
  const state = normalizeAnimatorEditorState(animator.data, entity.name);
  return state.clips.map((clip) => ({
    id: clip.id,
    name: clip.name,
    duration: clip.duration,
    targetEntityId: entity.id,
    tracks: clip.tracks.map((track) => toJsonObject(track)),
    metadata: {
      source: 'editor_component',
      frameRate: clip.frameRate,
      isLooping: clip.isLooping,
      entityId: entity.id,
    },
  }));
}

function animationClipFromAsset(asset: Asset): AgenticAnimationClip | null {
  if (asset.type !== 'animation') {
    return null;
  }
  const clip = asset.metadata.clip;
  if (!clip || typeof clip !== 'object') {
    return null;
  }
  const record = clip as Record<string, unknown>;
  return {
    id: typeof record.id === 'string' ? record.id : asset.id,
    name: typeof record.name === 'string' ? record.name : asset.name,
    duration: typeof record.duration === 'number' ? record.duration : 1,
    targetEntityId:
      typeof asset.metadata.entityId === 'string' ? asset.metadata.entityId : undefined,
    tracks: Array.isArray(record.tracks)
      ? record.tracks.map((track) => toJsonObject(track))
      : [],
    metadata: toJsonObject(asset.metadata),
  };
}

function toAgenticEntity(entity: Entity, sceneId: string): AgenticEntity {
  const components = Object.fromEntries(
    Array.from(entity.components.values()).map((component) => [
      component.id,
      agenticComponentFromEngine(component),
    ])
  );

  return {
    id: entity.id,
    sceneId,
    name: entity.name,
    type: inferAgenticEntityType(entity),
    parentId: entity.parentId,
    childIds: entity.children.map((child) => child.id),
    transform: transformFromEntity(entity),
    components,
    tags: [...entity.tags],
    metadata: {},
  };
}

function sceneIdForEntity(scenes: Scene[], entityId: string): string | null {
  for (const scene of scenes) {
    if (scene.entities.some((entity) => entity.id === entityId) || scene.rootEntities.includes(entityId)) {
      return scene.id;
    }
  }
  return null;
}

export class EditorSceneStoreAdapter {
  constructor(
    private readonly store: EditorStoreApi,
    private readonly options: EditorSceneStoreAdapterOptions = {}
  ) {}

  snapshotWorldState(): WorldState {
    const state = this.store.getState();
    const scenes = Object.fromEntries(state.scenes.map((scene) => [scene.id, toAgenticScene(scene)]));
    const entities = Object.fromEntries(
      Array.from(state.entities.values()).map((entity) => [
        entity.id,
        toAgenticEntity(entity, sceneIdForEntity(state.scenes, entity.id) ?? state.activeSceneId ?? ''),
      ])
    );
    const materialEntries = new Map<string, AgenticMaterial>();
    for (const asset of state.assets) {
      const definition = materialDefinitionFromAsset(asset);
      if (definition) {
        materialEntries.set(definition.id, agenticMaterialFromDefinition(definition));
      }
    }
    for (const entity of state.entities.values()) {
      const meshRenderer = entity.components.get('MeshRenderer')?.data;
      if (meshRenderer && typeof meshRenderer === 'object') {
        const definition = resolveEditorMaterial(meshRenderer as Record<string, unknown>);
        materialEntries.set(definition.id, agenticMaterialFromDefinition(definition));
      }
    }
    const animationEntries = new Map<string, AgenticAnimationClip>();
    for (const asset of state.assets) {
      const animation = animationClipFromAsset(asset);
      if (animation) {
        animationEntries.set(animation.id, animation);
      }
    }
    for (const entity of state.entities.values()) {
      for (const animation of animationClipsFromEntity(entity)) {
        animationEntries.set(animation.id, animation);
      }
    }

    return {
      id: createAgenticId('editor_world'),
      activeSceneId: state.activeSceneId,
      scenes,
      entities,
      materials: Object.fromEntries(materialEntries),
      assets: Object.fromEntries(
        state.assets.map((asset) => [
          asset.id,
          {
            id: asset.id,
            name: asset.name,
            type: toAgenticAssetType(asset.type),
            path: asset.path,
            valid: Boolean(asset.path),
            metadata: toJsonObject(asset.metadata),
          },
        ])
      ),
      scripts: {},
      animations: Object.fromEntries(animationEntries),
      buildReports: {},
      updatedAt: now(),
    };
  }

  refreshWorldState(world: WorldStateManager): WorldState {
    const snapshot = this.snapshotWorldState();
    world.replace(snapshot);
    return snapshot;
  }

  ensureScene(world: WorldStateManager, name = 'Agentic Editor Scene'): {
    sceneId: string;
    evidence: ChangeEvidence[];
  } {
    const state = this.store.getState();
    if (state.activeSceneId) {
      this.refreshWorldState(world);
      return {
        sceneId: state.activeSceneId,
        evidence: [],
      };
    }
    return this.createScene(world, name);
  }

  createScene(world: WorldStateManager, name: string): { sceneId: string; evidence: ChangeEvidence[] } {
    const before = this.snapshotWorldState();
    const scene = this.store.getState().createScene(name);
    const after = this.refreshWorldState(world);
    return {
      sceneId: scene.id,
      evidence: [evidence('scene', `Created editor scene "${scene.name}".`, scene.id, before, after)],
    };
  }

  updateScene(
    world: WorldStateManager,
    sceneId: string,
    updates: Partial<Pick<Scene, 'name' | 'environment'>>
  ): ChangeEvidence[] {
    const before = this.snapshotWorldState();
    this.store.getState().updateScene(sceneId, updates);
    const after = this.refreshWorldState(world);
    return [evidence('scene', `Updated editor scene ${sceneId}.`, sceneId, before, after)];
  }

  createEntity(
    world: WorldStateManager,
    input: EditorBackedEntityInput
  ): { entityId: string; evidence: ChangeEvidence[] } {
    const before = this.snapshotWorldState();
    if (input.sceneId && this.store.getState().activeSceneId !== input.sceneId) {
      this.store.getState().setActiveScene(input.sceneId);
    }

    const entity = EntityFactory.create(input.name);
    entity.tags = [...(input.tags ?? [])];
    entity.parentId = null;
    entity.components.set('Transform', {
      id: uuidv4(),
      type: 'Transform',
      enabled: true,
      data: {
        position: { ...ZERO_VECTOR, ...input.transform?.position },
        rotation: toQuaternion(input.transform?.rotation),
        scale: { ...ONE_VECTOR, ...input.transform?.scale },
      },
    });

    if (input.type === 'mesh' || input.type === 'npc') {
      const meshId = input.type === 'npc' ? 'capsule' : 'cube';
      this.ensurePrimitiveMeshAsset(meshId);
      entity.components.set('MeshRenderer', {
        id: uuidv4(),
        type: 'MeshRenderer',
        enabled: true,
        data: {
          meshId,
          materialId: 'default',
          castShadows: true,
          receiveShadows: true,
        },
      });
    }

    if (input.type === 'light') {
      entity.components.set('Light', {
        id: uuidv4(),
        type: 'Light',
        enabled: true,
        data: {
          type: 'point',
          color: { r: 1, g: 1, b: 1 },
          intensity: 1,
          shadows: true,
        },
      });
    }

    if (input.type === 'camera') {
      entity.components.set('Camera', {
        id: uuidv4(),
        type: 'Camera',
        enabled: true,
        data: {
          fov: 60,
          near: 0.1,
          far: 1000,
          orthographic: false,
          isMain: false,
        },
      });
    }

    this.store.getState().addEntity(entity);
    const after = this.refreshWorldState(world);
    return {
      entityId: entity.id,
      evidence: [evidence('entity', `Created editor entity "${entity.name}".`, entity.id, before, after)],
    };
  }

  updateEntityTransform(
    world: WorldStateManager,
    entityId: string,
    transform: Partial<AgenticTransform>
  ): ChangeEvidence[] {
    const state = this.store.getState();
    const entity = state.entities.get(entityId);
    if (!entity) {
      throw new Error(`Entity not found: ${entityId}`);
    }
    const before = this.snapshotWorldState();
    const components = new Map(entity.components);
    const transformComponent =
      components.get('Transform') ??
      ({
        id: uuidv4(),
        type: 'Transform',
        enabled: true,
        data: {
          position: ZERO_VECTOR,
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          scale: ONE_VECTOR,
        },
      } satisfies Component);
    const data = transformComponent.data as {
      position?: Vector3;
      rotation?: { x: number; y: number; z: number; w: number };
      scale?: Vector3;
    };

    transformComponent.data = {
      ...data,
      position: { ...(data.position ?? ZERO_VECTOR), ...transform.position },
      rotation: { ...(data.rotation ?? { x: 0, y: 0, z: 0, w: 1 }), ...toQuaternion(transform.rotation) },
      scale: { ...(data.scale ?? ONE_VECTOR), ...transform.scale },
    };
    components.set('Transform', transformComponent);
    state.updateEntity(entityId, { components });
    const after = this.refreshWorldState(world);

    return [evidence('entity', `Updated editor transform for ${entityId}.`, entityId, before, after)];
  }

  setParent(world: WorldStateManager, entityId: string, parentId: string | null): ChangeEvidence[] {
    const before = this.snapshotWorldState();
    this.store.getState().updateEntity(entityId, { parentId });
    const after = this.refreshWorldState(world);
    return [evidence('entity', `Updated editor hierarchy for ${entityId}.`, entityId, before, after)];
  }

  groupObjects(
    world: WorldStateManager,
    sceneId: string,
    name: string,
    entityIds: string[]
  ): { groupId: string; evidence: ChangeEvidence[] } {
    const group = this.createEntity(world, {
      sceneId,
      name,
      type: 'group',
      tags: ['layout-group'],
    });
    const evidenceItems = [...group.evidence];
    for (const entityId of entityIds) {
      if (this.store.getState().entities.has(entityId)) {
        evidenceItems.push(...this.setParent(world, entityId, group.entityId));
      }
    }
    this.refreshWorldState(world);
    return {
      groupId: group.entityId,
      evidence: evidenceItems,
    };
  }

  assignComponent(
    world: WorldStateManager,
    entityId: string,
    componentType: ComponentType,
    data: JsonObject
  ): ChangeEvidence[] {
    const state = this.store.getState();
    const entity = state.entities.get(entityId);
    if (!entity) {
      throw new Error(`Entity not found: ${entityId}`);
    }
    const before = this.snapshotWorldState();
    const components = new Map(entity.components);
    components.set(componentType, {
      id: uuidv4(),
      type: componentType,
      enabled: true,
      data,
    });
    state.updateEntity(entityId, { components });
    const after = this.refreshWorldState(world);
    return [evidence('component', `Assigned ${componentType} to editor entity ${entityId}.`, entityId, before, after)];
  }

  updateComponent(
    world: WorldStateManager,
    entityId: string,
    componentType: ComponentType,
    data: JsonObject
  ): ChangeEvidence[] {
    const state = this.store.getState();
    const entity = state.entities.get(entityId);
    if (!entity) {
      throw new Error(`Entity not found: ${entityId}`);
    }
    const before = this.snapshotWorldState();
    const components = new Map(entity.components);
    const current = components.get(componentType);
    components.set(componentType, {
      id: current?.id ?? uuidv4(),
      type: componentType,
      enabled: current?.enabled ?? true,
      data: {
        ...(current?.data ?? {}),
        ...data,
      },
    });
    state.updateEntity(entityId, { components });
    const after = this.refreshWorldState(world);
    return [evidence('component', `Updated ${componentType} on editor entity ${entityId}.`, entityId, before, after)];
  }

  registerScript(
    world: WorldStateManager,
    input: {
      name: string;
      source: string;
      parameters?: JsonObject;
      metadata?: JsonObject;
    }
  ): { scriptId: string; evidence: ChangeEvidence[] } {
    const before = this.snapshotWorldState();
    const script = world.createScript({
      name: input.name,
      source: input.source,
      parameters: input.parameters,
      metadata: input.metadata,
    });
    this.store.getState().addAsset({
      id: script.script.id,
      name: script.script.name,
      type: 'script',
      path: `agentic://scripts/${script.script.id}.ts`,
      size: script.script.source.length,
      createdAt: new Date(),
      metadata: {
        ...script.script.metadata,
        source: script.script.source,
        parameters: script.script.parameters,
        agenticScript: true,
      },
    });

    const storeSnapshot = this.snapshotWorldState();
    world.replace({
      ...storeSnapshot,
      scripts: {
        ...world.getSnapshot().scripts,
        [script.script.id]: script.script,
      },
    });

    return {
      scriptId: script.script.id,
      evidence: [
        script.evidence,
        evidence('asset', `Registered editor script asset "${script.script.name}".`, script.script.id, before, storeSnapshot),
      ],
    };
  }

  updateEnvironment(
    world: WorldStateManager,
    sceneId: string,
    patch: Partial<AgenticEnvironment>
  ): ChangeEvidence[] {
    const state = this.store.getState();
    const scene = state.scenes.find((item) => item.id === sceneId);
    if (!scene) {
      throw new Error(`Scene not found: ${sceneId}`);
    }
    const before = this.snapshotWorldState();
    state.updateScene(sceneId, {
      environment: {
        ...scene.environment,
        skybox: patch.skybox === undefined ? scene.environment.skybox : patch.skybox,
        ambientLight: patch.ambientLight ?? scene.environment.ambientLight,
        ambientIntensity: patch.ambientIntensity ?? scene.environment.ambientIntensity,
        directionalLightIntensity:
          patch.directionalLightIntensity ?? scene.environment.directionalLightIntensity,
        fog: engineFogFromAgentic(patch.fog) ?? scene.environment.fog,
      },
    });
    const after = this.refreshWorldState(world);
    return [evidence('environment', `Updated editor environment for ${sceneId}.`, sceneId, before, after)];
  }

  createMaterial(
    world: WorldStateManager,
    input: EditorBackedMaterialInput
  ): { materialId: string; evidence: ChangeEvidence[] } {
    const before = this.snapshotWorldState();
    const definition = materialDefinitionFromInput(input);
    this.upsertAsset({
      id: definition.id,
      name: `${definition.name}.material`,
      type: 'material',
      path: `agentic://materials/${definition.id}.json`,
      size: JSON.stringify(definition).length,
      createdAt: new Date(),
      metadata: {
        agenticMaterial: true,
        definition: toJsonObject(definition),
        ...(input.metadata ?? {}),
      },
    });

    const materialEvidence = world.createMaterial({
      name: definition.name,
      color: definition.albedoColor,
      roughness: definition.roughness,
      metallic: definition.metallic,
      metadata: {
        definition: toJsonObject(definition),
        ...(input.metadata ?? {}),
      },
    }).evidence;

    if (input.entityId) {
      this.applyMaterialToEntity(world, input.entityId, definition);
    }

    const after = this.refreshWorldState(world);
    return {
      materialId: definition.id,
      evidence: [
        materialEvidence,
        evidence('material', `Created editor material "${definition.name}".`, definition.id, before, after),
      ],
    };
  }

  updateMaterial(
    world: WorldStateManager,
    materialId: string,
    patch: Partial<EditorBackedMaterialInput>
  ): ChangeEvidence[] {
    const before = this.snapshotWorldState();
    const existingAsset = this.store.getState().assets.find((asset) => asset.id === materialId);
    const existingDefinition = existingAsset ? materialDefinitionFromAsset(existingAsset) : null;
    const definition = materialDefinitionFromInput({
      materialId,
      name: patch.name ?? existingDefinition?.name ?? materialId,
      color: patch.color ?? existingDefinition?.albedoColor,
      roughness: patch.roughness ?? existingDefinition?.roughness,
      metallic: patch.metallic ?? existingDefinition?.metallic,
      metadata: {
        ...toJsonObject(existingAsset?.metadata ?? {}),
        ...(patch.metadata ?? {}),
      },
    });

    this.upsertAsset({
      id: definition.id,
      name: `${definition.name}.material`,
      type: 'material',
      path: existingAsset?.path ?? `agentic://materials/${definition.id}.json`,
      size: JSON.stringify(definition).length,
      createdAt: existingAsset?.createdAt ?? new Date(),
      metadata: {
        ...existingAsset?.metadata,
        agenticMaterial: true,
        definition: toJsonObject(definition),
        ...(patch.metadata ?? {}),
      },
    });

    const targetEntityId = patch.entityId ?? this.findEntityUsingMaterial(materialId);
    if (targetEntityId) {
      this.applyMaterialToEntity(world, targetEntityId, definition);
    }

    const after = this.refreshWorldState(world);
    return [evidence('material', `Updated editor material "${definition.name}".`, definition.id, before, after)];
  }

  createAnimationClip(
    world: WorldStateManager,
    input: EditorBackedAnimationInput
  ): { animationId: string; entityId: string; evidence: ChangeEvidence[] } {
    const before = this.snapshotWorldState();
    const target = this.resolveAnimationTarget(world, input.entityId);
    const animation = world.createAnimation({
      name: input.name,
      duration: input.duration ?? 1.2,
      targetEntityId: target.entityId,
      tracks: input.tracks ?? [],
      metadata: input.metadata ?? {},
    });
    const entity = this.store.getState().entities.get(target.entityId);
    if (!entity) {
      throw new Error(`Entity not found: ${target.entityId}`);
    }
    const animatorState = this.readAnimatorState(entity);
    const clip = this.createEditorAnimationClip(animation.animation.id, input, animatorState);
    const nextState: AnimatorEditorState = {
      ...animatorState,
      activeClipId: clip.id,
      clips: [...animatorState.clips.filter((item) => item.id !== clip.id), clip],
      nlaStrips: animatorState.nlaStrips.some((strip) => strip.clipId === clip.id)
        ? animatorState.nlaStrips
        : [
            ...animatorState.nlaStrips,
            {
              id: uuidv4(),
              name: `${clip.name} Strip`,
              clipId: clip.id,
              start: 0,
              end: clip.duration,
              blendMode: 'replace',
              muted: false,
            },
          ],
    };
    const animatorEvidence = this.writeAnimatorState(world, target.entityId, nextState);
    this.upsertAsset({
      id: clip.id,
      name: `${clip.name}.animation.json`,
      type: 'animation',
      path: `agentic://animations/${clip.id}.json`,
      size: JSON.stringify(clip).length,
      createdAt: new Date(),
      metadata: {
        agenticAnimation: true,
        entityId: target.entityId,
        clip: toJsonObject(clip),
        ...(input.metadata ?? {}),
      },
    });

    const after = this.refreshWorldState(world);
    return {
      animationId: clip.id,
      entityId: target.entityId,
      evidence: [
        ...target.evidence,
        animation.evidence,
        ...animatorEvidence,
        evidence('animation', `Created editor animation clip "${clip.name}".`, clip.id, before, after),
      ],
    };
  }

  attachAnimationClip(
    world: WorldStateManager,
    animationId: string,
    entityId?: string,
    stateName = 'default'
  ): ChangeEvidence[] {
    const target = this.resolveAnimationTarget(world, entityId);
    const entity = this.store.getState().entities.get(target.entityId);
    if (!entity) {
      throw new Error(`Entity not found: ${target.entityId}`);
    }
    const before = this.snapshotWorldState();
    const animatorState = this.readAnimatorState(entity);
    const existingClip =
      animatorState.clips.find((clip) => clip.id === animationId) ??
      this.animationAssetToEditorClip(animationId) ??
      {
        ...createLibraryClip(stateName === 'entrance' ? 'Entrance Animation' : 'Idle Patrol'),
        id: animationId,
      };
    const nextState: AnimatorEditorState = {
      ...animatorState,
      activeClipId: existingClip.id,
      clips: animatorState.clips.some((clip) => clip.id === existingClip.id)
        ? animatorState.clips
        : [...animatorState.clips, existingClip],
    };
    const componentEvidence = this.writeAnimatorState(world, target.entityId, nextState, {
      activeClipId: existingClip.id,
      state: stateName,
    });
    const after = this.refreshWorldState(world);
    return [
      ...target.evidence,
      ...componentEvidence,
      evidence('animation', `Attached animation ${animationId} to editor entity ${target.entityId}.`, animationId, before, after),
    ];
  }

  editAnimationTimeline(
    world: WorldStateManager,
    entityId: string | undefined,
    timeline: JsonObject
  ): ChangeEvidence[] {
    const target = this.resolveAnimationTarget(world, entityId);
    const entity = this.store.getState().entities.get(target.entityId);
    if (!entity) {
      throw new Error(`Entity not found: ${target.entityId}`);
    }
    const before = this.snapshotWorldState();
    const animatorState = this.readAnimatorState(entity);
    const activeClipId = animatorState.activeClipId ?? animatorState.clips[0]?.id ?? null;
    const duration =
      typeof timeline.end === 'number'
        ? Math.max(0.1, timeline.end)
        : typeof timeline.duration === 'number'
          ? Math.max(0.1, timeline.duration)
          : null;
    const clips = activeClipId && duration
      ? animatorState.clips.map((clip) => (clip.id === activeClipId ? { ...clip, duration } : clip))
      : animatorState.clips;
    const nextState: AnimatorEditorState = {
      ...animatorState,
      clips,
      nlaStrips: activeClipId
        ? [
            {
              id: uuidv4(),
              name: 'Agentic Timeline',
              clipId: activeClipId,
              start: typeof timeline.start === 'number' ? timeline.start : 0,
              end: duration ?? clips.find((clip) => clip.id === activeClipId)?.duration ?? 1,
              blendMode: 'replace',
              muted: false,
            },
          ]
        : animatorState.nlaStrips,
    };
    const componentEvidence = this.writeAnimatorState(world, target.entityId, nextState, {
      timeline,
    });
    const after = this.refreshWorldState(world);
    return [
      ...target.evidence,
      ...componentEvidence,
      evidence('animation', `Edited editor animation timeline for ${target.entityId}.`, target.entityId, before, after),
    ];
  }

  assignAnimationState(
    world: WorldStateManager,
    entityId: string | undefined,
    stateName: string
  ): ChangeEvidence[] {
    const target = this.resolveAnimationTarget(world, entityId);
    const entity = this.store.getState().entities.get(target.entityId);
    if (!entity) {
      throw new Error(`Entity not found: ${target.entityId}`);
    }
    const before = this.snapshotWorldState();
    const animatorState = this.readAnimatorState(entity);
    const componentEvidence = this.writeAnimatorState(world, target.entityId, animatorState, {
      state: stateName,
      currentAnimation:
        animatorState.clips.find((clip) => clip.id === animatorState.activeClipId)?.name ?? stateName,
    });
    const after = this.refreshWorldState(world);
    return [
      ...target.evidence,
      ...componentEvidence,
      evidence('animation', `Assigned editor animation state "${stateName}".`, target.entityId, before, after),
    ];
  }

  registerAsset(
    world: WorldStateManager,
    input: EditorBackedAssetInput
  ): { assetId: string; evidence: ChangeEvidence[] } {
    const before = this.snapshotWorldState();
    const result = world.registerAsset({
      id: input.id,
      name: input.name,
      type: input.type ?? 'unknown',
      path: input.path ?? '',
      valid: input.valid !== false,
      metadata: input.metadata ?? {},
    });
    this.upsertAsset({
      id: result.asset.id,
      name: result.asset.name,
      type: toEngineAssetType(result.asset.type),
      path: result.asset.path,
      size: JSON.stringify(result.asset.metadata).length,
      createdAt: new Date(),
      metadata: {
        ...result.asset.metadata,
        agenticAsset: true,
        valid: result.asset.valid,
      },
    });
    const after = this.refreshWorldState(world);
    return {
      assetId: result.asset.id,
      evidence: [
        result.evidence,
        evidence('asset', `Registered editor asset "${result.asset.name}".`, result.asset.id, before, after),
      ],
    };
  }

  validateAssets(world: WorldStateManager, scope = 'all'): ChangeEvidence[] {
    const state = this.store.getState();
    const invalidAssets = state.assets.filter((asset) => !asset.path || asset.metadata.valid === false);
    const result = world.addBuildReport({
      status: invalidAssets.length ? 'invalid' : 'valid',
      summary: invalidAssets.length
        ? `${invalidAssets.length} editor asset references need attention.`
        : `Editor assets valid for scope ${scope}.`,
      issues: invalidAssets.map((asset) => `Invalid asset: ${asset.name}`),
    });
    return [result.evidence];
  }

  reindexAssets(world: WorldStateManager, reason = 'manual'): ChangeEvidence[] {
    const state = this.store.getState();
    const result = world.addBuildReport({
      status: 'valid',
      summary: `Reindexed ${state.assets.length} editor assets (${reason}).`,
      issues: [],
    });
    this.refreshWorldState(world);
    const snapshot = world.getSnapshot();
    world.replace({
      ...snapshot,
      buildReports: {
        ...snapshot.buildReports,
        [result.report.id]: result.report,
      },
    });
    return [result.evidence];
  }

  validateBuild(world: WorldStateManager, target = 'web'): {
    reportId: string;
    issueCount: number;
    sceneId: string;
    evidence: ChangeEvidence[];
  } {
    const before = this.snapshotWorldState();
    const report = this.store.getState().runReyPlayCompile();
    this.refreshWorldState(world);
    const result = world.addBuildReport({
      status: report.ok ? 'valid' : 'invalid',
      summary: report.summary,
      issues: report.diagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`),
    });
    return {
      reportId: result.report.id,
      issueCount: report.diagnostics.length,
      sceneId: this.store.getState().activeSceneId ?? '',
      evidence: [
        result.evidence,
        evidence('build', `Validated editor build target ${target}.`, result.report.id, before, world.getSnapshot()),
      ],
    };
  }

  async exportBuild(world: WorldStateManager, target = 'web'): Promise<{
    ok: boolean;
    reportId: string;
    artifactPath: string;
    artifacts: BuildArtifact[];
    missingDeps: string[];
    logs: string[];
    runtimeScaffold: EditorRuntimeScaffold;
    source?: EditorBuildExportResult['source'];
    evidence: ChangeEvidence[];
  }> {
    const before = this.snapshotWorldState();
    const normalizedTarget = normalizeBuildTarget(target);
    const scaffold = this.ensureExportRuntimeEssentials(world);
    const exporter = this.options.buildExporter;
    if (!exporter) {
      const report = this.store.getState().runReyPlayCompile();
      this.refreshWorldState(world);
      const issues = [
        ...report.diagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`),
        'PHYSICAL_BUILD_EXPORTER_NOT_CONFIGURED: build.export cannot create files in this runtime.',
      ];
      const result = world.addBuildReport({
        status: 'invalid',
        summary: `Physical editor export for ${normalizedTarget} is not configured in this runtime.`,
        issues,
      });
      return {
        ok: false,
        reportId: result.report.id,
        artifactPath: '',
        artifacts: [],
        missingDeps: [],
        logs: ['Physical build exporter was not configured.'],
        runtimeScaffold: runtimeScaffoldOutput(scaffold),
        evidence: [
          ...scaffold.evidence,
          result.evidence,
          evidence(
            'build',
            `Blocked physical editor export target ${normalizedTarget}: exporter not configured.`,
            result.report.id,
            before,
            world.getSnapshot()
          ),
        ],
      };
    }

    const build = await exporter(normalizedTarget, this.readBuildExportInput());
    this.refreshWorldState(world);
    const artifact = primaryBuildArtifact(build.artifacts);
    const artifactPath = artifact?.path ?? '';
    const issues = [
      ...build.report.diagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`),
      ...build.missingDeps.map((dependency) => `MISSING_DEPENDENCY: ${dependency}`),
    ];
    const result = world.addBuildReport({
      status: build.ok ? 'exported' : 'invalid',
      summary: build.ok
        ? `Exported editor scene for ${normalizedTarget}: ${artifactPath || 'artifact emitted'}.`
        : build.report.summary,
      issues,
      artifactPath: artifactPath || undefined,
    });
    return {
      ok: build.ok,
      reportId: result.report.id,
      artifactPath,
      artifacts: build.artifacts,
      missingDeps: build.missingDeps,
      logs: build.logs,
      runtimeScaffold: runtimeScaffoldOutput(scaffold),
      source: build.source,
      evidence: [
        ...scaffold.evidence,
        result.evidence,
        evidence(
          'build',
          build.ok
            ? `Ran physical editor export target ${normalizedTarget}.`
            : `Physical editor export target ${normalizedTarget} failed.`,
          result.report.id,
          before,
          world.getSnapshot()
        ),
      ],
    };
  }

  generateBuildReport(world: WorldStateManager, summary?: string, issues: string[] = []): {
    reportId: string;
    evidence: ChangeEvidence[];
  } {
    const state = this.store.getState();
    const lastReport = state.lastBuildReport;
    const result = world.addBuildReport({
      status: lastReport?.ok === false ? 'invalid' : 'valid',
      summary: summary ?? state.lastCompileSummary ?? lastReport?.summary ?? 'Editor build report generated.',
      issues: issues.length
        ? issues
        : lastReport?.diagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`) ?? [],
    });
    return {
      reportId: result.report.id,
      evidence: [result.evidence],
    };
  }

  private upsertAsset(asset: Asset): void {
    const state = this.store.getState();
    if (state.assets.some((item) => item.id === asset.id)) {
      state.removeAsset(asset.id);
    }
    state.addAsset(asset);
  }

  private readBuildExportInput(): EditorBuildExportInput {
    const state = this.store.getState();
    return {
      projectName: state.projectName,
      projectPath: state.projectPath,
      isDirty: state.isDirty,
      scenes: state.scenes,
      entities: new Map(state.entities),
      assets: [...state.assets],
      engineMode: state.engineMode,
      aiMode: state.aiMode,
      aiEnabled: state.aiEnabled,
      editor: state.editor,
      automationPermissions: state.automationPermissions,
      profiler: state.profiler,
      scribProfiles: state.scribProfiles,
      activeScribEntityId: state.activeScribEntityId,
      scribInstances: state.scribInstances,
      activeSceneId: state.activeSceneId,
      buildManifest: state.buildManifest,
    };
  }

  private ensureExportRuntimeEssentials(world: WorldStateManager): EditorRuntimeScaffoldResult {
    const ensured = this.ensureScene(world, 'Agentic Export Scene');
    const evidenceItems = [...ensured.evidence];
    const scaffold: EditorRuntimeScaffoldResult = {
      createdCamera: false,
      createdPlayer: false,
      entityIds: [],
      summaries: [],
      evidence: evidenceItems,
    };
    const state = this.store.getState();
    const sceneId = state.activeSceneId ?? ensured.sceneId;
    const entities = Array.from(state.entities.values());
    const hasCamera = entities.some((entity) => entity.components.has('Camera'));
    const hasPlayer = entities.some(
      (entity) =>
        entity.tags.some((tag) => tag.toLowerCase() === 'player') ||
        entity.components.has('PlayerController')
    );

    if (!hasCamera) {
      const camera = this.createEntity(world, {
        sceneId,
        name: 'Agentic Export Camera',
        type: 'camera',
        tags: ['camera', 'agentic-export-runtime'],
        transform: {
          position: { x: 0, y: 3, z: 8 },
          rotation: { x: -15, y: 0, z: 0 },
        },
        metadata: {
          generatedFor: 'build.export',
        },
      });
      evidenceItems.push(...camera.evidence);
      scaffold.createdCamera = true;
      scaffold.entityIds.push(camera.entityId);
      scaffold.summaries.push('Created runtime export camera.');
    }

    if (!hasPlayer) {
      const player = this.createEntity(world, {
        sceneId,
        name: 'Agentic Export Player',
        type: 'npc',
        tags: ['player', 'agentic-export-runtime'],
        transform: {
          position: { x: 0, y: 1, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        },
        metadata: {
          generatedFor: 'build.export',
        },
      });
      evidenceItems.push(...player.evidence);
      scaffold.createdPlayer = true;
      scaffold.entityIds.push(player.entityId);
      scaffold.summaries.push('Created runtime export player with controller and physics.');
      evidenceItems.push(
        ...this.assignComponent(world, player.entityId, 'Collider', {
          type: 'capsule',
          isTrigger: false,
          center: { x: 0, y: 0.9, z: 0 },
          size: { x: 0.8, y: 1.8, z: 0.8 },
          radius: 0.4,
          height: 1.8,
        })
      );
      evidenceItems.push(
        ...this.assignComponent(world, player.entityId, 'Rigidbody', {
          mass: 1,
          drag: 0.1,
          angularDrag: 0.05,
          useGravity: true,
          isKinematic: false,
          velocity: { x: 0, y: 0, z: 0 },
          angularVelocity: { x: 0, y: 0, z: 0 },
        })
      );
      evidenceItems.push(
        ...this.assignComponent(world, player.entityId, 'PlayerController', {
          speed: 4.5,
          runSpeed: 7,
          jumpForce: 8,
          sensitivity: 1.25,
        })
      );
      evidenceItems.push(
        ...this.assignComponent(world, player.entityId, 'Health', {
          maxHealth: 100,
          currentHealth: 100,
          team: 'player',
        })
      );
    }

    scaffold.evidence = evidenceItems;
    return scaffold;
  }

  private ensurePrimitiveMeshAsset(meshId: string): void {
    const state = this.store.getState();
    if (state.assets.some((asset) => asset.id === meshId)) {
      return;
    }
    state.addAsset({
      id: meshId,
      name: `${meshId}.primitive.json`,
      type: 'mesh',
      path: `download/assets/mesh/${meshId}.primitive.json`,
      size: 1,
      createdAt: new Date(),
      metadata: {
        agenticPrimitive: true,
        primitive: meshId,
      },
    });
  }

  private applyMaterialToEntity(
    world: WorldStateManager,
    entityId: string,
    definition: EditorMaterialDefinition
  ): ChangeEvidence[] {
    const state = this.store.getState();
    const entity = state.entities.get(entityId);
    if (!entity) {
      throw new Error(`Entity not found: ${entityId}`);
    }
    const meshRenderer = entity.components.get('MeshRenderer');
    const data = {
      ...(meshRenderer?.data ?? {
        meshId: 'cube',
        castShadows: true,
        receiveShadows: true,
      }),
      materialId: definition.id,
      material: toJsonObject(definition),
    };
    return this.updateComponent(world, entityId, 'MeshRenderer', data);
  }

  private findEntityUsingMaterial(materialId: string): string | undefined {
    for (const entity of this.store.getState().entities.values()) {
      const data = entity.components.get('MeshRenderer')?.data;
      if (data && typeof data === 'object' && (data as Record<string, unknown>).materialId === materialId) {
        return entity.id;
      }
    }
    return undefined;
  }

  private resolveAnimationTarget(
    world: WorldStateManager,
    requestedEntityId?: string
  ): { entityId: string; evidence: ChangeEvidence[] } {
    const state = this.store.getState();
    if (requestedEntityId && state.entities.has(requestedEntityId)) {
      this.refreshWorldState(world);
      return { entityId: requestedEntityId, evidence: [] };
    }
    const selectedEntityId = state.editor.selectedEntities.find((entityId) => state.entities.has(entityId));
    if (selectedEntityId) {
      this.refreshWorldState(world);
      return { entityId: selectedEntityId, evidence: [] };
    }
    const npc = Array.from(state.entities.values()).find((entity) => entity.tags.includes('npc'));
    if (npc) {
      this.refreshWorldState(world);
      return { entityId: npc.id, evidence: [] };
    }
    const firstEntity = state.entities.values().next().value as Entity | undefined;
    if (firstEntity) {
      this.refreshWorldState(world);
      return { entityId: firstEntity.id, evidence: [] };
    }
    const ensured = this.ensureScene(world);
    const created = this.createEntity(world, {
      sceneId: ensured.sceneId,
      name: 'Agentic Animated Target',
      type: 'mesh',
      tags: ['animation-target'],
    });
    return {
      entityId: created.entityId,
      evidence: [...ensured.evidence, ...created.evidence],
    };
  }

  private readAnimatorState(entity: Entity): AnimatorEditorState {
    return normalizeAnimatorEditorState(entity.components.get('Animator')?.data, entity.name);
  }

  private writeAnimatorState(
    world: WorldStateManager,
    entityId: string,
    state: AnimatorEditorState,
    parameterPatch: JsonObject = {}
  ): ChangeEvidence[] {
    const entity = this.store.getState().entities.get(entityId);
    if (!entity) {
      throw new Error(`Entity not found: ${entityId}`);
    }
    const current = entity.components.get('Animator');
    const baseData = current?.data as Record<string, unknown> | undefined;
    const data = serializeAnimatorEditorState(baseData, state);
    const parameters = {
      ...(data.parameters as Record<string, unknown>),
      ...parameterPatch,
    };
    return this.updateComponent(world, entityId, 'Animator', toJsonObject({
      ...data,
      parameters: toJsonObject(parameters),
    }));
  }

  private createEditorAnimationClip(
    animationId: string,
    input: EditorBackedAnimationInput,
    currentState: AnimatorEditorState
  ): AnimationEditorClip {
    const base = createLibraryClip(input.name);
    const tracks: AnimationEditorClip['tracks'] = input.tracks?.length
      ? input.tracks.map((track, index) => ({
          id: typeof track.id === 'string' ? track.id : uuidv4(),
          name: typeof track.name === 'string' ? track.name : `Agentic Track ${index + 1}`,
          path: typeof track.path === 'string' ? track.path : 'Rig/Root',
          property: typeof track.property === 'string' ? track.property : 'position.y',
          type:
            track.type === 'rotation' || track.type === 'scale' || track.type === 'shapeKey' || track.type === 'custom'
              ? (track.type as AnimationEditorClip['tracks'][number]['type'])
              : 'position',
          keyframes: Array.isArray(track.keyframes)
            ? (track.keyframes as unknown as AnimationEditorClip['tracks'][number]['keyframes'])
            : [],
          color: typeof track.color === 'string' ? track.color : '#22c55e',
          visible: track.visible !== false,
          locked: track.locked === true,
        }))
      : base.tracks;
    return {
      ...base,
      id: animationId,
      name: input.name,
      duration: input.duration ?? base.duration,
      tracks,
      isLooping: input.metadata?.loop === true || base.isLooping,
      frameRate:
        typeof input.metadata?.frameRate === 'number'
          ? Math.max(1, input.metadata.frameRate)
          : base.frameRate,
    };
  }

  private animationAssetToEditorClip(animationId: string): AnimationEditorClip | null {
    const asset = this.store.getState().assets.find((item) => item.id === animationId);
    const clip = asset?.metadata.clip;
    if (!clip || typeof clip !== 'object') {
      return null;
    }
    return {
      ...createLibraryClip(asset?.name ?? 'Animation Clip'),
      ...(clip as Partial<AnimationEditorClip>),
      id: animationId,
    };
  }
}
