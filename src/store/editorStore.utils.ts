import type { AutomationPermissions, EditorState } from '@/types/engine';
import type {
  EngineStore,
  HistoryEntry,
  HistorySnapshotState,
} from './editorStore.types';

export const HISTORY_LIMIT = 50;

export const createDefaultEditorState = (): EditorState => ({
  selectedEntities: [],
  selectedAsset: null,
  characterBuilderFocusRequest: null,
  lightingBakeRequest: null,
  tool: 'select',
  mode: 'scene',
  gridVisible: true,
  snapEnabled: true,
  snapValue: 1,
  snapTarget: 'grid',
  gizmoMode: 'translate',
  cameraSpeed: 1,
  navigationMode: 'orbit',
  viewportCameraMode: 'perspective',
  viewportCameraEntityId: null,
  viewportFov: 60,
  showColliders: false,
  showLights: true,
  paintEnabled: false,
  paintMode: 'vertex',
  paintColor: '#ff4d6d',
  paintSize: 0.5,
  paintStrength: 0.8,
  paintTextureSlot: 'albedo',
  paintTextureResolution: 1024,
  paintWeightBone: 'Spine',
  paintWeightMirror: true,
  paintWeightSmooth: true,
  paintWeightNormalize: true,
  paintWeightErase: false,
  sculptSymmetryX: true,
  sculptDyntopo: false,
  sculptRemeshIterations: 1,
  sculptMultiresLevels: 1,
  sculptVoxelSize: 0.12,
  modelerMode: 'face',
  modelerSelectedElements: [0],
  topologyViewportEnabled: false,
  topologyViewportMode: 'intent_driven',
  topologyViewportTemplateType: 'chair',
});

export const createDefaultAutomationPermissions = (): AutomationPermissions => ({
  filesystem_write: {
    action: 'filesystem_write',
    allowed: false,
    requireConfirm: true,
    updatedAt: new Date().toISOString(),
    note: 'Escritura de archivos por IA',
  },
  scene_edit: {
    action: 'scene_edit',
    allowed: true,
    requireConfirm: false,
    updatedAt: new Date().toISOString(),
  },
  asset_delete: {
    action: 'asset_delete',
    allowed: false,
    requireConfirm: true,
    updatedAt: new Date().toISOString(),
  },
  build_project: {
    action: 'build_project',
    allowed: true,
    requireConfirm: true,
    updatedAt: new Date().toISOString(),
  },
  run_command: {
    action: 'run_command',
    allowed: false,
    requireConfirm: true,
    updatedAt: new Date().toISOString(),
    note: 'Terminal / shell',
  },
  mcp_tool: {
    action: 'mcp_tool',
    allowed: true,
    requireConfirm: false,
    updatedAt: new Date().toISOString(),
  },
});

export const cloneValue = <T,>(value: T): T => {
  if (value === null || typeof value !== 'object') return value;

  if (value instanceof Date) {
    return new Date(value.getTime()) as T;
  }

  if (value instanceof Map) {
    const next = new Map();
    value.forEach((entryValue, key) => {
      next.set(cloneValue(key), cloneValue(entryValue));
    });
    return next as T;
  }

  if (value instanceof Set) {
    const next = new Set();
    value.forEach((entryValue) => {
      next.add(cloneValue(entryValue));
    });
    return next as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => cloneValue(item)) as T;
  }

  if (ArrayBuffer.isView(value)) {
    const ctor = (value as any).constructor as { new (input: ArrayLike<number>): unknown };
    return new ctor(value as any) as T;
  }

  const record = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  Object.keys(record).forEach((key) => {
    next[key] = cloneValue(record[key]);
  });
  return next as T;
};

export const cloneHistoryState = (state: HistorySnapshotState): HistoryEntry => ({
  label: 'snapshot',
  timestamp: Date.now(),
  projectName: state.projectName,
  projectPath: state.projectPath,
  isDirty: state.isDirty,
  scenes: cloneValue(state.scenes),
  activeSceneId: state.activeSceneId,
  entities: cloneValue(state.entities),
  assets: cloneValue(state.assets),
  engineMode: state.engineMode,
  aiMode: state.aiMode,
  aiEnabled: state.aiEnabled,
  editor: cloneValue({
    selectedEntities: state.editor.selectedEntities,
    selectedAsset: state.editor.selectedAsset,
  }),
  scribProfiles: cloneValue(state.scribProfiles),
  activeScribEntityId: state.activeScribEntityId,
  scribInstances: cloneValue(state.scribInstances),
  automationPermissions: cloneValue(state.automationPermissions),
});

export const pushHistory = (state: EngineStore) => {
  const past = [...state.historyPast, cloneHistoryState(state)];
  const overflow = past.length - HISTORY_LIMIT;
  return {
    historyPast: overflow > 0 ? past.slice(overflow) : past,
    historyFuture: [],
  };
};

export const sameSelection = (left: string[], right: string[]) => {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
};
