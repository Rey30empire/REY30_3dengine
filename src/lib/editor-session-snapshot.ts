import { materializeScene, normalizeScenesAndEntities } from '@/store/sceneGraph';
import type { EngineStore } from '@/store/editorStore.types';
import type {
  AIMode,
  Asset,
  AutomationPermissions,
  ComponentType,
  EditorState,
  Entity,
  EngineWorkflowMode,
  ProfilerData,
  Scene,
} from '@/types/engine';

type SerializableComponent = {
  id: string;
  type: string;
  data: Record<string, unknown>;
  enabled: boolean;
};

type SerializableEntity = {
  id: string;
  name: string;
  components: SerializableComponent[];
  parentId: string | null;
  active: boolean;
  tags: string[];
};

type SerializableAsset = {
  id: string;
  name: string;
  type: Asset['type'];
  path: string;
  size: number;
  createdAt: string;
  metadata: Asset['metadata'];
};

type SerializableScene = {
  id: string;
  name: string;
  rootEntities: string[];
  entityIds: string[];
  collections: NonNullable<Scene['collections']>;
  environment: Scene['environment'];
  createdAt: string;
  updatedAt: string;
};

export type EditorSessionSnapshot = {
  version: 1;
  projectName: string;
  projectPath: string;
  isDirty: boolean;
  scenes: SerializableScene[];
  activeSceneId: string | null;
  entities: SerializableEntity[];
  assets: SerializableAsset[];
  engineMode: EngineWorkflowMode;
  aiMode: AIMode;
  aiEnabled: boolean;
  editor: EditorState;
  automationPermissions: AutomationPermissions;
  profiler: ProfilerData;
};

export type EditorSessionStoreState = Pick<
  EngineStore,
  | 'projectName'
  | 'projectPath'
  | 'isDirty'
  | 'scenes'
  | 'activeSceneId'
  | 'entities'
  | 'assets'
  | 'engineMode'
  | 'aiMode'
  | 'aiEnabled'
  | 'editor'
  | 'automationPermissions'
  | 'profiler'
  | 'historyPast'
  | 'historyFuture'
>;

function cloneSerializable<T>(value: T): T {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function serializeDate(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) {
    return new Date(0).toISOString();
  }
  return date.toISOString();
}

function deserializeDate(value: unknown): Date {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) {
    return new Date(0);
  }
  return date;
}

function serializeEntity(entity: Entity): SerializableEntity {
  return {
    id: entity.id,
    name: entity.name,
    components: Array.from(entity.components.values()).map((component) => ({
      id: component.id,
      type: component.type,
      data: cloneSerializable(component.data),
      enabled: component.enabled,
    })),
    parentId: entity.parentId ?? null,
    active: entity.active,
    tags: [...entity.tags],
  };
}

function deserializeEntity(entity: SerializableEntity): Entity {
  return {
    id: entity.id,
    name: entity.name,
    components: new Map(
      entity.components.map((component) => [
        component.type,
        {
          id: component.id,
          type: component.type as ComponentType,
          data: cloneSerializable(component.data),
          enabled: component.enabled,
        },
      ])
    ),
    children: [],
    parentId: entity.parentId,
    active: entity.active,
    tags: [...entity.tags],
  };
}

function serializeAsset(asset: Asset): SerializableAsset {
  return {
    id: asset.id,
    name: asset.name,
    type: asset.type,
    path: asset.path,
    size: asset.size,
    createdAt: serializeDate(asset.createdAt),
    metadata: cloneSerializable(asset.metadata),
  };
}

function deserializeAsset(asset: SerializableAsset): Asset {
  return {
    id: asset.id,
    name: asset.name,
    type: asset.type,
    path: asset.path,
    size: asset.size,
    createdAt: deserializeDate(asset.createdAt),
    metadata: cloneSerializable(asset.metadata),
  };
}

export function createEditorSessionSnapshot(
  state: Pick<
    EngineStore,
    | 'projectName'
    | 'projectPath'
    | 'isDirty'
    | 'scenes'
    | 'activeSceneId'
    | 'entities'
    | 'assets'
    | 'engineMode'
    | 'aiMode'
    | 'aiEnabled'
    | 'editor'
    | 'automationPermissions'
    | 'profiler'
  >
): EditorSessionSnapshot {
  return {
    version: 1,
    projectName: state.projectName,
    projectPath: state.projectPath,
    isDirty: state.isDirty,
    scenes: state.scenes.map((scene) => ({
      id: scene.id,
      name: scene.name,
      rootEntities: [...scene.rootEntities],
      entityIds: Array.from(
        new Set([
          ...scene.rootEntities,
          ...scene.entities.map((entity) => entity.id),
        ])
      ),
      collections: cloneSerializable(scene.collections ?? []),
      environment: cloneSerializable(scene.environment),
      createdAt: serializeDate(scene.createdAt),
      updatedAt: serializeDate(scene.updatedAt),
    })),
    activeSceneId: state.activeSceneId,
    entities: Array.from(state.entities.values()).map(serializeEntity),
    assets: state.assets.map(serializeAsset),
    engineMode: state.engineMode,
    aiMode: state.aiMode,
    aiEnabled: state.aiEnabled,
    editor: cloneSerializable(state.editor),
    automationPermissions: cloneSerializable(state.automationPermissions),
    profiler: cloneSerializable(state.profiler),
  };
}

export function editorSessionSnapshotToStoreState(
  snapshot: EditorSessionSnapshot
): EditorSessionStoreState {
  const entities = new Map(snapshot.entities.map((entity) => [entity.id, deserializeEntity(entity)]));
  const scenes = snapshot.scenes.map((scene) =>
    materializeScene(
      {
        id: scene.id,
        name: scene.name,
        entities: [],
        rootEntities: [...scene.rootEntities],
        collections: cloneSerializable(scene.collections),
        environment: cloneSerializable(scene.environment),
        createdAt: deserializeDate(scene.createdAt),
        updatedAt: deserializeDate(scene.updatedAt),
      },
      entities,
      scene.entityIds
    ).scene
  );

  const normalized = normalizeScenesAndEntities({
    scenes,
    entities,
    sceneIds: scenes.map((scene) => scene.id),
  });

  const validEntityIds = new Set(normalized.entities.keys());
  return {
    projectName: snapshot.projectName,
    projectPath: snapshot.projectPath,
    isDirty: snapshot.isDirty,
    scenes: normalized.scenes,
    activeSceneId:
      snapshot.activeSceneId && normalized.scenes.some((scene) => scene.id === snapshot.activeSceneId)
        ? snapshot.activeSceneId
        : normalized.scenes[0]?.id ?? null,
    entities: normalized.entities,
    assets: snapshot.assets.map(deserializeAsset),
    engineMode: snapshot.engineMode,
    aiMode: snapshot.aiMode,
    aiEnabled: snapshot.aiEnabled,
    editor: {
      ...cloneSerializable(snapshot.editor),
      selectedEntities: snapshot.editor.selectedEntities.filter((entityId) =>
        validEntityIds.has(entityId)
      ),
    },
    automationPermissions: cloneSerializable(snapshot.automationPermissions),
    profiler: cloneSerializable(snapshot.profiler),
    historyPast: [],
    historyFuture: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isEditorSessionSnapshot(value: unknown): value is EditorSessionSnapshot {
  if (!isRecord(value)) return false;
  if (value.version !== 1) return false;
  if (typeof value.projectName !== 'string') return false;
  if (!Array.isArray(value.scenes)) return false;
  if (!Array.isArray(value.entities)) return false;
  if (!Array.isArray(value.assets)) return false;
  if (!isRecord(value.editor)) return false;
  if (!isRecord(value.automationPermissions)) return false;
  if (!isRecord(value.profiler)) return false;
  return true;
}
