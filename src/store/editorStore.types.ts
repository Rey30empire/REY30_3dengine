import type { StateCreator } from 'zustand';
import type {
  Asset,
  AIMode,
  Agent,
  AgentTask,
  AutomationAction,
  AutomationPermission,
  AutomationPermissions,
  ChatMessage,
  EditorState,
  EngineWorkflowMode,
  Entity,
  ProfilerData,
  Scene,
} from '@/types/engine';
import type {
  AssignScribResult,
  ScribInstance,
  ScribType,
} from '@/engine/scrib';
import type {
  BuildManifest,
  BuildReport,
  PlayRuntimeState,
  ScribProfile,
} from '@/engine/reyplay/types';

export interface ProjectSlice {
  projectName: string;
  projectPath: string;
  isDirty: boolean;
  scenes: Scene[];
  activeSceneId: string | null;
  entities: Map<string, Entity>;
  assets: Asset[];
  historyPast: HistoryEntry[];
  historyFuture: HistoryEntry[];
  automationPermissions: AutomationPermissions;
  setProjectName: (name: string) => void;
  setDirty: (dirty: boolean) => void;
  createScene: (name: string) => Scene;
  setActiveScene: (sceneId: string) => void;
  updateScene: (sceneId: string, updates: Partial<Scene>) => void;
  deleteScene: (sceneId: string) => void;
  addEntity: (entity: Entity) => void;
  updateEntity: (id: string, updates: Partial<Entity>) => void;
  updateEntityTransient: (id: string, updates: Partial<Entity>) => void;
  removeEntity: (id: string) => void;
  addAsset: (asset: Asset) => void;
  removeAsset: (assetId: string) => void;
  undo: () => void;
  redo: () => void;
  setAutomationPermission: (
    action: AutomationAction,
    permission: Partial<AutomationPermission>
  ) => void;
}

export interface EditorSlice {
  editor: EditorState;
  profiler: ProfilerData;
  sidebarCollapsed: boolean;
  activePanel: string;
  showProfiler: boolean;
  showConsole: boolean;
  selectEntity: (id: string | null, multi?: boolean) => void;
  clearSelection: () => void;
  selectAsset: (assetId: string | null) => void;
  setEditorTool: (tool: EditorState['tool']) => void;
  setEditorMode: (mode: EditorState['mode']) => void;
  setGizmoMode: (mode: EditorState['gizmoMode']) => void;
  toggleGrid: () => void;
  setGridVisible: (visible: boolean) => void;
  toggleSnap: () => void;
  setSnapEnabled: (enabled: boolean) => void;
  setSnapValue: (value: number) => void;
  setSnapTarget: (target: NonNullable<EditorState['snapTarget']>) => void;
  setCameraSpeed: (speed: number) => void;
  setNavigationMode: (mode: NonNullable<EditorState['navigationMode']>) => void;
  setViewportCameraMode: (mode: NonNullable<EditorState['viewportCameraMode']>) => void;
  setViewportCameraEntity: (entityId: string | null) => void;
  setViewportFov: (fov: number) => void;
  setShowColliders: (visible: boolean) => void;
  setShowLights: (visible: boolean) => void;
  setPaintEnabled: (enabled: boolean) => void;
  setPaintMode: (mode: NonNullable<EditorState['paintMode']>) => void;
  setPaintColor: (color: string) => void;
  setPaintSize: (size: number) => void;
  setPaintStrength: (strength: number) => void;
  setPaintTextureSlot: (slot: NonNullable<EditorState['paintTextureSlot']>) => void;
  setPaintTextureResolution: (resolution: number) => void;
  setPaintWeightBone: (boneName: string) => void;
  setPaintWeightMirror: (enabled: boolean) => void;
  setPaintWeightSmooth: (enabled: boolean) => void;
  setPaintWeightNormalize: (enabled: boolean) => void;
  setPaintWeightErase: (enabled: boolean) => void;
  setSculptSymmetryX: (enabled: boolean) => void;
  setSculptDyntopo: (enabled: boolean) => void;
  setSculptRemeshIterations: (iterations: number) => void;
  setSculptMultiresLevels: (levels: number) => void;
  setSculptVoxelSize: (size: number) => void;
  setModelerMode: (mode: NonNullable<EditorState['modelerMode']>) => void;
  setModelerSelection: (selection: number[]) => void;
  toggleModelerSelection: (index: number, additive?: boolean) => void;
  setTopologyViewportEnabled: (enabled: boolean) => void;
  setTopologyViewportMode: (mode: NonNullable<EditorState['topologyViewportMode']>) => void;
  setTopologyViewportTemplateType: (
    templateType: NonNullable<EditorState['topologyViewportTemplateType']>
  ) => void;
  updateProfiler: (data: Partial<ProfilerData>) => void;
  toggleSidebar: () => void;
  setActivePanel: (panel: string) => void;
  focusCharacterBuilderCategory: (category: string | null) => void;
  clearCharacterBuilderFocus: () => void;
  requestLightingBake: (sceneId: string) => void;
  toggleProfiler: () => void;
  toggleConsole: () => void;
}

export interface AISlice {
  engineMode: EngineWorkflowMode;
  aiMode: AIMode;
  aiEnabled: boolean;
  agents: Map<string, Agent>;
  tasks: AgentTask[];
  chatMessages: ChatMessage[];
  isAiProcessing: boolean;
  agenticMutationIndexAudit: AgenticMutationIndexAuditState | null;
  setEngineMode: (mode: EngineWorkflowMode) => void;
  setAIMode: (mode: AIMode) => void;
  addAgent: (agent: Agent) => void;
  updateAgentStatus: (agentId: string, status: Agent['status']) => void;
  addTask: (task: AgentTask) => void;
  updateTask: (taskId: string, updates: Partial<AgentTask>) => void;
  addChatMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  clearChat: () => void;
  setAiProcessing: (processing: boolean) => void;
  setAgenticMutationIndexAudit: (audit: AgenticMutationIndexAuditState | null) => void;
}

export type AgenticMutationIndexAuditState = {
  repairCount: number;
  checksumRepairCount?: number;
  historyReindexedFullCount?: number;
  historyReindexedPartialCount?: number;
  legacyHistoryReindexedCount?: number;
  latestRepairId: string | null;
  latestRepairAt: string | null;
  integrityStatus: 'valid' | 'mismatch' | 'missing';
  integrityValid: boolean;
  recommendationCount?: number;
  lastIndexedExecutionId?: string | null;
  latestIndexableExecutionId?: string | null;
  pendingIndexableExecutionCount?: number;
  pendingIndexableExecutionIds?: string[];
  indexBehind?: boolean;
  checkedAt?: string | null;
};

export interface RuntimeSlice {
  playRuntimeState: PlayRuntimeState;
  lastBuildReport: BuildReport | null;
  buildManifest: BuildManifest | null;
  lastCompileSummary: string;
  scribProfiles: Map<string, ScribProfile>;
  activeScribEntityId: string | null;
  scribInstances: Map<string, ScribInstance>;
  setPlayRuntimeState: (state: PlayRuntimeState) => void;
  runReyPlayCompile: () => BuildReport;
  clearBuild: () => void;
  setScribProfile: (entityId: string, profile: ScribProfile) => void;
  selectScribEntity: (entityId: string | null) => void;
  assignScribToEntity: (
    entityId: string,
    type: ScribType,
    options?: { config?: Record<string, unknown>; origin?: ScribInstance['origin'] }
  ) => AssignScribResult;
  assignScribToScene: (
    sceneId: string,
    type: ScribType,
    options?: { config?: Record<string, unknown>; origin?: ScribInstance['origin'] }
  ) => AssignScribResult;
  deleteScribInstance: (instanceId: string) => void;
  setScribInstanceEnabled: (instanceId: string, enabled: boolean) => void;
}

export type EngineStore = ProjectSlice & EditorSlice & AISlice & RuntimeSlice;

export type HistorySnapshotState = Pick<
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
  | 'scribProfiles'
  | 'activeScribEntityId'
  | 'scribInstances'
  | 'automationPermissions'
>;

export type HistoryEntry = {
  label: string;
  timestamp: number;
  projectName: string;
  projectPath: string;
  isDirty: boolean;
  scenes: Scene[];
  activeSceneId: string | null;
  entities: Map<string, Entity>;
  assets: Asset[];
  engineMode: EngineWorkflowMode;
  aiMode: AIMode;
  aiEnabled: boolean;
  editor: Pick<EditorState, 'selectedEntities' | 'selectedAsset'>;
  scribProfiles: Map<string, ScribProfile>;
  activeScribEntityId: string | null;
  scribInstances: Map<string, ScribInstance>;
  automationPermissions: AutomationPermissions;
};

export type SliceCreator<T> = StateCreator<
  EngineStore,
  [['zustand/subscribeWithSelector', never]],
  [],
  T
>;
