// ============================================
// AI-FIRST-HYBRID-REY30-3D-ENGINE Type Definitions
// ============================================

// AI Mode Types
export type AIMode = 'OFF' | 'API' | 'LOCAL';
export type EngineWorkflowMode = 'MODE_MANUAL' | 'MODE_HYBRID' | 'MODE_AI_FIRST';

// Entity Component System Types
export interface Entity {
  id: string;
  name: string;
  components: Map<string, Component>;
  children: Entity[];
  parentId: string | null;
  active: boolean;
  tags: string[];
}

export interface Component {
  id: string;
  type: ComponentType;
  data: Record<string, unknown>;
  enabled: boolean;
}

export type ComponentType = 
  | 'Transform'
  | 'MeshRenderer'
  | 'Collider'
  | 'Rigidbody'
  | 'Script'
  | 'Animator'
  | 'Health'
  | 'PlayerController'
  | 'Weapon'
  | 'Light'
  | 'Camera'
  | 'AudioSource'
  | 'ParticleSystem'
  | 'Terrain';

// Transform Component
export interface TransformData {
  position: Vector3;
  rotation: Quaternion;
  scale: Vector3;
}

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface Color {
  r: number;
  g: number;
  b: number;
  a?: number;
}

// Mesh Renderer
export interface MeshRendererData {
  meshId: string | null;
  materialId: string | null;
  castShadows: boolean;
  receiveShadows: boolean;
}

// Light Component
export interface LightData {
  type: 'directional' | 'point' | 'spot' | 'ambient';
  color: Color;
  intensity: number;
  range?: number;
  spotAngle?: number;
  shadows: boolean;
}

// Camera Component
export interface CameraData {
  fov: number;
  near: number;
  far: number;
  orthographic: boolean;
  orthoSize?: number;
  clearColor: Color;
  isMain: boolean;
}

// Audio Source
export interface AudioSourceData {
  clipId: string | null;
  clip: string | null;
  volume: number;
  pitch: number;
  loop: boolean;
  playOnStart: boolean;
  spatialBlend: number;
  mixerGroup: string;
  minDistance: number;
  maxDistance: number;
  rolloffFactor: number;
}

// Collider Types
export interface ColliderData {
  type: 'box' | 'sphere' | 'capsule' | 'mesh';
  isTrigger: boolean;
  center: Vector3;
  size?: Vector3;
  radius?: number;
  height?: number;
}

// Rigidbody
export interface RigidbodyData {
  mass: number;
  drag: number;
  angularDrag: number;
  useGravity: boolean;
  isKinematic: boolean;
  velocity: Vector3;
  angularVelocity: Vector3;
}

// Script Component
export interface ScriptData {
  scriptId: string;
  parameters: Record<string, unknown>;
  enabled: boolean;
}

// Animator
export interface AnimatorData {
  controllerId: string | null;
  currentAnimation: string | null;
  parameters: Record<string, string | number | boolean>;
  editor?: Record<string, unknown>;
  runtime?: {
    time: number;
    duration: number;
    activeClipId: string | null;
    activeClipIds: string[];
    activeClipNames: string[];
    activeStripIds: string[];
    activeStripNames: string[];
    poseBoneCount: number;
  };
}

// Health
export interface HealthData {
  maxHealth: number;
  currentHealth: number;
  invulnerable?: boolean;
  attack?: number;
  defense?: number;
  speed?: number;
  team?: 'player' | 'enemy' | 'neutral';
}

export type WeaponTargetPreference = 'opposing' | 'player' | 'enemy' | 'neutral';

export interface WeaponRuntimeData {
  cooldownRemaining: number;
  lastAttackAt: number | null;
  lastAttackType: 'light' | 'heavy' | 'ai' | null;
  lastTargetEntityId: string | null;
  totalAttacks: number;
  totalHits: number;
  lastDamage: number;
}

export interface WeaponData {
  category?: 'melee' | 'ranged' | 'projectile' | 'magic';
  damage: number;
  attackSpeed: number;
  range: number;
  heavyDamage?: number;
  heavyAttackSpeed?: number;
  heavyRange?: number;
  targetTeam?: WeaponTargetPreference;
  autoAcquireTarget?: boolean;
  runtime?: Partial<WeaponRuntimeData>;
}

// Terrain
export interface TerrainData {
  width: number;
  height: number;
  depth: number;
  preset?: string;
  segments?: number;
  scale?: number;
  octaves?: number;
  erosionIterations?: number;
  seed?: number;
  heightmap: number[];
  layers: TerrainLayer[];
}

export interface TerrainLayer {
  id: string;
  name: string;
  textureId: string;
  minHeight: number;
  maxHeight: number;
}

// Scene Types
export interface Scene {
  id: string;
  name: string;
  entities: Entity[];
  rootEntities: string[];
  collections?: SceneCollection[];
  environment: EnvironmentSettings;
  createdAt: Date;
  updatedAt: Date;
}

export interface SceneCollection {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  entityIds: string[];
}

export type ShadowQualityMode = 'low' | 'medium' | 'high' | 'ultra';

export interface GlobalIlluminationSettings {
  enabled: boolean;
  intensity: number;
  bounceCount: number;
}

export interface BakedLightmapSettings {
  enabled: boolean;
}

export interface AdvancedLightingSettings {
  shadowQuality: ShadowQualityMode;
  globalIllumination: GlobalIlluminationSettings;
  bakedLightmaps: BakedLightmapSettings;
}

export interface AdvancedLightingSettingsInput {
  shadowQuality?: ShadowQualityMode;
  globalIllumination?: Partial<GlobalIlluminationSettings>;
  bakedLightmaps?: Partial<BakedLightmapSettings>;
}

export const DEFAULT_ADVANCED_LIGHTING_SETTINGS: AdvancedLightingSettings = {
  shadowQuality: 'high',
  globalIllumination: {
    enabled: false,
    intensity: 1,
    bounceCount: 1,
  },
  bakedLightmaps: {
    enabled: false,
  },
};

export function resolveAdvancedLightingSettings(
  settings?: AdvancedLightingSettingsInput | null
): AdvancedLightingSettings {
  return {
    shadowQuality:
      settings?.shadowQuality ?? DEFAULT_ADVANCED_LIGHTING_SETTINGS.shadowQuality,
    globalIllumination: {
      ...DEFAULT_ADVANCED_LIGHTING_SETTINGS.globalIllumination,
      ...settings?.globalIllumination,
    },
    bakedLightmaps: {
      ...DEFAULT_ADVANCED_LIGHTING_SETTINGS.bakedLightmaps,
      ...settings?.bakedLightmaps,
    },
  };
}

export interface EnvironmentSettings {
  skybox: string | null;
  ambientLight: Color;
  ambientIntensity?: number;
  environmentIntensity?: number;
  environmentRotation?: number;
  directionalLightIntensity?: number;
  directionalLightAzimuth?: number;
  directionalLightElevation?: number;
  advancedLighting?: AdvancedLightingSettings;
  fog: FogSettings | null;
  postProcessing: PostProcessingSettings;
}

export type ToneMappingMode = 'none' | 'linear' | 'reinhard' | 'cineon' | 'aces';

export interface FogSettings {
  enabled: boolean;
  type: 'linear' | 'exponential';
  color: Color;
  near?: number;
  far?: number;
  density?: number;
}

export interface PostProcessingSettings {
  bloom: BloomSettings;
  ssao: SSAOSettings;
  ssr: SSRSettings;
  colorGrading: ColorGradingSettings;
  vignette: VignetteSettings;
}

export interface BloomSettings {
  enabled: boolean;
  intensity: number;
  threshold: number;
  radius: number;
}

export interface SSAOSettings {
  enabled: boolean;
  radius: number;
  intensity: number;
  bias: number;
}

export interface SSRSettings {
  enabled: boolean;
  intensity: number;
  maxDistance: number;
}

export interface ColorGradingSettings {
  enabled: boolean;
  exposure: number;
  contrast: number;
  saturation: number;
  gamma: number;
  toneMapping?: ToneMappingMode;
  rendererExposure?: number;
}

export interface VignetteSettings {
  enabled: boolean;
  intensity: number;
  smoothness: number;
  roundness: number;
}

// Asset Types
export interface Asset {
  id: string;
  name: string;
  type: AssetType;
  path: string;
  size: number;
  createdAt: Date;
  metadata: AssetMetadata;
}

export type AssetType = 
  | 'mesh'
  | 'texture'
  | 'material'
  | 'modifier_preset'
  | 'character_preset'
  | 'script'
  | 'animation'
  | 'audio'
  | 'video'
  | 'prefab'
  | 'scene'
  | 'shader'
  | 'font';

export interface AssetMetadata {
  [key: string]: unknown;
  width?: number;
  height?: number;
  format?: string;
  vertices?: number;
  triangles?: number;
  bones?: number;
  duration?: number;
  channels?: number;
  prompt?: string;
  generatedBy?: string;
  source?: string;
  workflowMode?: string;
  workflow?: string;
  template?: string;
  revisedPrompt?: string;
  url?: string;
}

// Agent System Types
export type AgentType = 
  | 'orchestrator'
  | 'world_builder'
  | 'model_generator'
  | 'animation'
  | 'gameplay'
  | 'ui'
  | 'optimization'
  | 'terrain';

export interface Agent {
  id: string;
  type: AgentType;
  name: string;
  status: AgentStatus;
  tools: AgentTool[];
  currentTask: AgentTask | null;
}

export type AgentStatus = 'idle' | 'working' | 'error' | 'disabled';

export interface AgentTool {
  id: string;
  name: string;
  description: string;
  parameters: ToolParameter[];
  execute: (params: Record<string, unknown>) => Promise<unknown>;
}

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  description: string;
}

export interface AgentTask {
  id: string;
  agentId: string;
  type: string;
  prompt: string;
  status: TaskStatus;
  result: unknown;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

export type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed';

// Chat Types
export interface AgenticPipelineMessageMetadata {
  pipelineId: string;
  approved: boolean;
  iteration: number;
  status: string;
  steps: Array<{
    id: string;
    title: string;
    agentRole: string;
    status: string;
    evidenceCount: number;
    errorCount: number;
  }>;
  tools: Array<{
    name: string;
    successCount: number;
    failureCount: number;
  }>;
  validation: {
    approved: boolean;
    confidence: number;
    matchedRequirements: string[];
    missingRequirements: string[];
    incorrectOutputs: string[];
    retryInstructions: string[];
  } | null;
  runtimeScaffold?: {
    createdCamera: boolean;
    createdPlayer: boolean;
    entityIds: string[];
    summaries: string[];
    sourceTool: string;
  } | null;
  sharedMemory?: {
    analyses: Array<{
      id: string;
      toolName: string;
      callId: string;
      stepId: string;
      agentRole: string;
      scope: string;
      summary: string;
      output: Record<string, unknown>;
      actionableRecommendations: Array<{
        id: string;
        approvalKey: string;
        sourceToolName: string;
        sourceCallId: string;
        summary: string;
        rationale: string;
        priority: 'critical' | 'normal' | 'optional';
        suggestedDomain: string;
        suggestedCapabilities: string[];
        suggestedToolNames: string[];
        input: Record<string, unknown>;
        confidence: number;
        approvalStatus: 'pending' | 'approved' | 'rejected';
      }>;
      createdAt: string;
    }>;
    actionableRecommendations: Array<{
      id: string;
      approvalKey: string;
      sourceToolName: string;
      sourceCallId: string;
      summary: string;
      rationale: string;
      priority: 'critical' | 'normal' | 'optional';
      suggestedDomain: string;
      suggestedCapabilities: string[];
      suggestedToolNames: string[];
      input: Record<string, unknown>;
      confidence: number;
      approvalStatus: 'pending' | 'approved' | 'rejected';
    }>;
  };
  traces: Array<{
    eventType: string;
    severity: string;
    actor: string;
    message: string;
    stepId?: string;
    toolCallId?: string;
    data?: Record<string, unknown>;
    timestamp: string;
  }>;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: {
    taskId?: string;
    agentType?: AgentType;
    actions?: ChatAction[];
    toolCalls?: MCPToolCallInfo[];
    results?: unknown;
    agenticPipeline?: AgenticPipelineMessageMetadata;
    type?: string;
    modelUrl?: string;
    thumbnailUrl?: string;
  };
}

export interface MCPToolCallInfo {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatAction {
  id: string;
  label: string;
  type: 'create' | 'modify' | 'delete' | 'query';
  target: string;
  params: Record<string, unknown>;
}

// Build Types
export interface BuildConfig {
  platform: 'windows' | 'linux' | 'macos' | 'android' | 'ios' | 'web';
  architecture: 'x64' | 'arm64';
  debugMode: boolean;
  compression: boolean;
  scenes: string[];
  excludeAssets: string[];
}

export interface BuildArtifact {
  id: string;
  target: string;
  path: string;
  size: number;
  createdAt: string;
  kind?: 'bundle' | 'installer' | 'manifest' | 'log';
  checksum?: string;
}

// Automation Permissions
export type AutomationAction =
  | 'filesystem_write'
  | 'scene_edit'
  | 'asset_delete'
  | 'build_project'
  | 'run_command'
  | 'mcp_tool';

export interface AutomationPermission {
  action: AutomationAction;
  allowed: boolean;
  requireConfirm: boolean;
  updatedAt: string;
  note?: string;
}

export type AutomationPermissions = Record<AutomationAction, AutomationPermission>;

// Profiler Types
export interface ProfilerData {
  fps: number;
  frameTime: number;
  cpuTime: number;
  gpuTime: number;
  memory: MemoryStats;
  drawCalls: number;
  triangles: number;
  vertices: number;
}

export interface MemoryStats {
  used: number;
  allocated: number;
  textures: number;
  meshes: number;
  audio: number;
}

// Editor State
export interface EditorState {
  selectedEntities: string[];
  selectedAsset: string | null;
  characterBuilderFocusRequest?: {
    category: string | null;
    token: number;
  } | null;
  lightingBakeRequest?: {
    sceneId: string;
    token: number;
  } | null;
  tool: EditorTool;
  mode: EditorMode;
  gridVisible: boolean;
  snapEnabled: boolean;
  snapValue: number;
  snapTarget?: 'grid' | 'vertex' | 'surface';
  gizmoMode: 'translate' | 'rotate' | 'scale';
  cameraSpeed: number;
  navigationMode?: 'orbit' | 'fly' | 'walk';
  viewportCameraMode?: 'perspective' | 'orthographic' | 'top' | 'front' | 'side';
  viewportCameraEntityId?: string | null;
  viewportFov?: number;
  showColliders: boolean;
  showLights: boolean;
  paintEnabled?: boolean;
  paintMode?:
    | 'vertex'
    | 'texture'
    | 'weight'
    | 'sculpt_draw'
    | 'sculpt_clay'
    | 'sculpt_grab'
    | 'sculpt_smooth'
    | 'sculpt_crease';
  paintColor?: string;
  paintSize?: number;
  paintStrength?: number;
  paintTextureSlot?: 'albedo' | 'normal' | 'roughness' | 'metallic' | 'emissive' | 'occlusion' | 'alpha';
  paintTextureResolution?: number;
  paintWeightBone?: string;
  paintWeightMirror?: boolean;
  paintWeightSmooth?: boolean;
  paintWeightNormalize?: boolean;
  paintWeightErase?: boolean;
  sculptSymmetryX?: boolean;
  sculptDyntopo?: boolean;
  sculptRemeshIterations?: number;
  sculptMultiresLevels?: number;
  sculptVoxelSize?: number;
  modelerMode?: 'object' | 'vertex' | 'edge' | 'face';
  modelerSelectedElements?: number[];
  topologyViewportEnabled?: boolean;
  topologyViewportMode?: 'template' | 'intent_driven';
  topologyViewportTemplateType?:
    | 'chair'
    | 'bed'
    | 'table'
    | 'vehicle'
    | 'humanoid'
    | 'animal'
    | 'generic';
}

export type EditorTool = 'select' | 'move' | 'rotate' | 'scale' | 'brush';
export type EditorMode = 'scene' | 'game';

// Addon Types
export interface Addon {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  enabled: boolean;
  entryPoint: string;
  dependencies: string[];
  permissions: AddonPermission[];
  category?: string;
  workspaceHints?: string[];
  installedAt?: string;
  updatedAt?: string;
  sourcePackagePath?: string | null;
  assetCount?: number;
  checksum?: string;
  storageLocation?: 'filesystem' | 'netlify-blobs';
}

export type AddonPermission = 
  | 'filesystem'
  | 'network'
  | 'rendering'
  | 'scene'
  | 'assets'
  | 'ai';

// Project Types
export interface Project {
  id: string;
  name: string;
  description: string;
  version: string;
  scenes: Scene[];
  assets: Asset[];
  addons: Addon[];
  settings: ProjectSettings;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectSettings {
  renderPipeline: 'forward' | 'deferred';
  physicsEngine: 'jolt' | 'bullet';
  aiMode: AIMode;
  defaultScene: string;
  buildTargets: BuildConfig[];
}
