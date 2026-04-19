import {
  createEditorSessionSnapshot,
  editorSessionSnapshotToStoreState,
  isEditorSessionSnapshot,
  type EditorSessionSnapshot,
  type EditorSessionStoreState,
} from '@/lib/editor-session-snapshot';
import type { EngineStore } from '@/store/editorStore.types';
import type { Scene, TransformData, Vector3, Quaternion } from '@/types/engine';
import type { ScribProfile } from '@/engine/reyplay/types';
import type { ScribInstance } from '@/engine/scrib';
import { PlayerPrefs, Serializer, saveSystem, type EntitySaveData, type SaveData } from './SaveSystem';

export const DEFAULT_EDITOR_PROJECT_SAVE_SLOT = 'editor_project_current';

type EditorProjectSnapshot = {
  session: EditorSessionSnapshot;
  scribProfiles: ScribProfile[];
  activeScribEntityId: string | null;
  scribInstances: ScribInstance[];
};

type EditorProjectSaveCustom = {
  kind: 'editor_project';
  snapshot: EditorProjectSnapshot;
  sceneCount: number;
  entityCount: number;
  assetCount: number;
  scribProfileCount: number;
  scribInstanceCount: number;
};

export type EditorProjectSaveState = Pick<
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
  | 'scribProfiles'
  | 'activeScribEntityId'
  | 'scribInstances'
>;

export type EditorProjectRestoreState = EditorSessionStoreState &
  Pick<EngineStore, 'scribProfiles' | 'activeScribEntityId' | 'scribInstances'>;

export interface EditorProjectSaveSummary {
  slot: string;
  timestamp: number;
  projectName: string;
  sceneCount: number;
  entityCount: number;
  assetCount: number;
  scribProfileCount: number;
  scribInstanceCount: number;
}

export type EditorProjectSaveData = SaveData & { custom: EditorProjectSaveCustom };

function cloneSerializable<T>(value: T): T {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeVector3(value: unknown, fallback: [number, number, number]): [number, number, number] {
  const data = value as Partial<Vector3> | null | undefined;
  return [
    typeof data?.x === 'number' ? data.x : fallback[0],
    typeof data?.y === 'number' ? data.y : fallback[1],
    typeof data?.z === 'number' ? data.z : fallback[2],
  ];
}

function normalizeQuaternion(
  value: unknown,
  fallback: [number, number, number, number]
): [number, number, number, number] {
  const data = value as Partial<Quaternion> | null | undefined;
  return [
    typeof data?.x === 'number' ? data.x : fallback[0],
    typeof data?.y === 'number' ? data.y : fallback[1],
    typeof data?.z === 'number' ? data.z : fallback[2],
    typeof data?.w === 'number' ? data.w : fallback[3],
  ];
}

function serializeSceneEntityTree(
  entityId: string,
  state: EditorProjectSaveState
): EntitySaveData | null {
  const entity = state.entities.get(entityId);
  if (!entity) {
    return null;
  }

  const transform = entity.components.get('Transform')?.data as Partial<TransformData> | undefined;
  const children = Array.from(state.entities.values())
    .filter((candidate) => candidate.parentId === entityId)
    .map((child) => serializeSceneEntityTree(child.id, state))
    .flatMap((child) => (child ? [child] : []));

  return {
    id: entity.id,
    name: entity.name,
    transform: {
      position: normalizeVector3(transform?.position, [0, 0, 0]),
      rotation: normalizeQuaternion(transform?.rotation, [0, 0, 0, 1]),
      scale: normalizeVector3(transform?.scale, [1, 1, 1]),
    },
    components: Array.from(entity.components.values()).map((component) => ({
      type: component.type,
      data: cloneSerializable(component.data),
    })),
    children: children.length > 0 ? children : undefined,
  };
}

function resolveSceneForSave(state: EditorProjectSaveState): Scene | null {
  return (
    state.scenes.find((scene) => scene.id === state.activeSceneId) ??
    state.scenes[0] ??
    null
  );
}

function createEditorProjectSnapshot(
  state: EditorProjectSaveState,
  options?: { markClean?: boolean }
): EditorProjectSnapshot {
  const normalizedState = {
    ...state,
    isDirty: options?.markClean === false ? state.isDirty : false,
  };

  return {
    session: createEditorSessionSnapshot(normalizedState),
    scribProfiles: Array.from(state.scribProfiles.values()).map((profile) => cloneSerializable(profile)),
    activeScribEntityId: state.activeScribEntityId,
    scribInstances: Array.from(state.scribInstances.values()).map((instance) =>
      cloneSerializable(instance)
    ),
  };
}

export function createEditorProjectSaveData(
  state: EditorProjectSaveState,
  options?: { markClean?: boolean }
): EditorProjectSaveData {
  const snapshot = createEditorProjectSnapshot(state, options);
  const activeScene = resolveSceneForSave(state);
  const rootEntities = (activeScene?.rootEntities ?? [])
    .map((entityId) => serializeSceneEntityTree(entityId, state))
    .flatMap((entity) => (entity ? [entity] : []));

  return {
    version: 'editor-project/1',
    timestamp: Date.now(),
    playerName: snapshot.session.projectName || undefined,
    scene: {
      name: activeScene?.name ?? snapshot.session.projectName ?? 'Untitled Project',
      entities: rootEntities,
    },
    custom: {
      kind: 'editor_project',
      snapshot,
      sceneCount: snapshot.session.scenes.length,
      entityCount: snapshot.session.entities.length,
      assetCount: snapshot.session.assets.length,
      scribProfileCount: snapshot.scribProfiles.length,
      scribInstanceCount: snapshot.scribInstances.length,
    } satisfies EditorProjectSaveCustom,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isEditorProjectSnapshot(value: unknown): value is EditorProjectSnapshot {
  if (!isRecord(value)) return false;
  if (!isEditorSessionSnapshot(value.session)) return false;
  if (!Array.isArray(value.scribProfiles)) return false;
  if (!Array.isArray(value.scribInstances)) return false;
  return true;
}

export function isEditorProjectSaveData(
  value: unknown
): value is EditorProjectSaveData {
  if (!Serializer.validateSaveData(value)) {
    return false;
  }

  if (!isRecord(value.custom) || value.custom.kind !== 'editor_project') {
    return false;
  }

  if (!isEditorProjectSnapshot(value.custom.snapshot)) {
    return false;
  }

  return true;
}

function readEditorProjectSaveData(slot: string) {
  return PlayerPrefs.getObject<SaveData>(`save_${slot}`, null as never);
}

export function summarizeEditorProjectSaveData(
  data: SaveData,
  slot = DEFAULT_EDITOR_PROJECT_SAVE_SLOT
): EditorProjectSaveSummary | null {
  if (!isEditorProjectSaveData(data)) {
    return null;
  }

  return {
    slot,
    timestamp: data.timestamp,
    projectName: data.custom.snapshot.session.projectName,
    sceneCount: data.custom.sceneCount,
    entityCount: data.custom.entityCount,
    assetCount: data.custom.assetCount,
    scribProfileCount: data.custom.scribProfileCount,
    scribInstanceCount: data.custom.scribInstanceCount,
  };
}

export function getEditorProjectSaveSummary(slot = DEFAULT_EDITOR_PROJECT_SAVE_SLOT): EditorProjectSaveSummary | null {
  const data = readEditorProjectSaveData(slot);
  if (!data) {
    return null;
  }
  return summarizeEditorProjectSaveData(data, slot);
}

export function restoreEditorProjectSaveData(
  data: SaveData
): EditorProjectRestoreState | null {
  if (!isEditorProjectSaveData(data)) {
    return null;
  }

  const restored = editorSessionSnapshotToStoreState(data.custom.snapshot.session);
  const validEntityIds = new Set(restored.entities.keys());
  const validSceneIds = new Set(restored.scenes.map((scene) => scene.id));

  const scribProfiles = new Map(
    data.custom.snapshot.scribProfiles
      .filter((profile) => validEntityIds.has(profile.entityId))
      .map((profile) => [profile.entityId, cloneSerializable(profile)])
  );

  const scribInstances = new Map(
    data.custom.snapshot.scribInstances
      .filter((instance) =>
        instance.target.scope === 'entity'
          ? validEntityIds.has(instance.target.id)
          : validSceneIds.has(instance.target.id)
      )
      .map((instance) => [instance.id, cloneSerializable(instance)])
  );

  return {
    ...restored,
    isDirty: false,
    scribProfiles,
    activeScribEntityId:
      data.custom.snapshot.activeScribEntityId &&
      scribProfiles.has(data.custom.snapshot.activeScribEntityId)
        ? data.custom.snapshot.activeScribEntityId
        : null,
    scribInstances,
  };
}

export function createLoadedEditorProjectPatch(
  restored: EditorProjectRestoreState
): Pick<
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
  | 'scribProfiles'
  | 'activeScribEntityId'
  | 'scribInstances'
  | 'playRuntimeState'
  | 'lastBuildReport'
  | 'buildManifest'
  | 'lastCompileSummary'
> {
  return {
    projectName: restored.projectName,
    projectPath: restored.projectPath,
    isDirty: restored.isDirty,
    scenes: restored.scenes,
    activeSceneId: restored.activeSceneId,
    entities: restored.entities,
    assets: restored.assets,
    engineMode: restored.engineMode,
    aiMode: restored.aiMode,
    aiEnabled: restored.aiEnabled,
    editor: restored.editor,
    automationPermissions: restored.automationPermissions,
    profiler: restored.profiler,
    historyPast: restored.historyPast,
    historyFuture: restored.historyFuture,
    scribProfiles: restored.scribProfiles,
    activeScribEntityId: restored.activeScribEntityId,
    scribInstances: restored.scribInstances,
    playRuntimeState: 'IDLE',
    lastBuildReport: null,
    buildManifest: null,
    lastCompileSummary: '',
  };
}

export function saveEditorProjectToSlot(
  slot: string,
  state: EditorProjectSaveState,
  options?: { markClean?: boolean }
) {
  return saveSystem.save(slot, createEditorProjectSaveData(state, options));
}

export function loadEditorProjectFromSlot(slot = DEFAULT_EDITOR_PROJECT_SAVE_SLOT) {
  const data = readEditorProjectSaveData(slot);
  if (!data || !Serializer.validateSaveData(data)) {
    return null;
  }
  return restoreEditorProjectSaveData(data);
}
