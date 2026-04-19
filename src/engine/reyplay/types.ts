import type { Entity, Asset, Scene, TerrainData, WeaponTargetPreference } from '@/types/engine';
import type { ScribInstance } from '@/engine/scrib';
import type { SceneRenderProfile } from '@/engine/rendering/renderEnvironmentProfile';
import type {
  EditorMaterialDefinition,
  EditorMaterialTextureSlot,
} from '@/engine/editor/editorMaterials';
import type { AnimatorEditorState } from '@/engine/editor/animationEditorState';
import type { EditableMesh } from '@/engine/editor/modelerMesh';
import type { CharacterPackage, CharacterPackageSummary } from '@/lib/character-package';

export type PlayRuntimeState = 'IDLE' | 'PLAYING' | 'PAUSED';

export type ScribMode = 'manual' | 'ai';

export type ScribTargetType =
  | 'scene'
  | 'terrain'
  | 'player'
  | 'enemy'
  | 'weapon'
  | 'ability'
  | 'ui'
  | 'custom';

export interface ScribProfile {
  entityId: string;
  targetType: ScribTargetType;
  mode: ScribMode;
  prompt: string;
  status: 'draft' | 'generating' | 'ready' | 'error';
  manifestPath?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BuildDiagnostic {
  id: string;
  stage: 'schema' | 'assets' | 'input' | 'runtime';
  code: string;
  level: 'error' | 'warning' | 'info';
  message: string;
  hint?: string;
  target?: string;
  path?: string;
}

export interface BuildReport {
  ok: boolean;
  sceneCount: number;
  assetCount: number;
  entityCount: number;
  diagnostics: BuildDiagnostic[];
  summary: string;
  generatedAt: string;
}

export interface BuildTemplate {
  id: string;
  name: string;
  description: string;
  tags: string[];
  recommendedObjects: string[];
  allowTerrain: boolean;
}

export interface BuildManifestScene {
  sceneId: string;
  name: string;
  rootEntityIds: string[];
  entityCount: number;
  tags: string[];
  renderProfile: SceneRenderProfile;
}

export interface BuildManifestAsset {
  id: string;
  name: string;
  type: string;
  path: string;
  source?:
    | 'project_asset'
    | 'generated_modeler_mesh'
    | 'generated_terrain'
    | 'generated_animation'
    | 'generated_character';
  entityId?: string | null;
  entityName?: string | null;
  meshSummary?: {
    vertexCount: number;
    faceCount: number;
    uvCount: number;
    colorCount: number;
    modifierCount: number;
  } | null;
  terrainSummary?: {
    width: number;
    depth: number;
    height: number;
    segments: number;
    layerCount: number;
    minHeight: number;
    maxHeight: number;
  } | null;
  animationSummary?: {
    clipCount: number;
    trackCount: number;
    boneCount: number;
    nlaStripCount: number;
    timelineDuration: number;
    hasRootMotion: boolean;
  } | null;
  characterSummary?: CharacterPackageSummary | null;
}

export interface BuildManifestMaterialTextureReference {
  slot: EditorMaterialTextureSlot;
  assetPath: string;
  assetId: string | null;
  texturePaint: boolean;
}

export interface BuildManifestMaterial {
  entityId: string;
  entityName: string;
  materialId: string;
  name: string;
  summary: string;
  definition: EditorMaterialDefinition;
  textureReferences: BuildManifestMaterialTextureReference[];
}

export interface BuildManifestGeneratedModelerMesh {
  assetId: string;
  entityId: string;
  entityName: string;
  path: string;
  modifierCount: number;
  mesh: EditableMesh;
  summary: {
    baseVertexCount: number;
    baseFaceCount: number;
    vertexCount: number;
    faceCount: number;
    uvCount: number;
    colorCount: number;
  };
}

export interface BuildManifestGeneratedTerrain {
  assetId: string;
  entityId: string;
  entityName: string;
  path: string;
  terrain: TerrainData;
  summary: {
    width: number;
    depth: number;
    height: number;
    segments: number;
    layerCount: number;
    pointCount: number;
    minHeight: number;
    maxHeight: number;
  };
}

export interface BuildManifestGeneratedAnimation {
  assetId: string;
  entityId: string;
  entityName: string;
  path: string;
  source: 'editor' | 'defaulted';
  state: AnimatorEditorState;
  summary: {
    clipCount: number;
    trackCount: number;
    boneCount: number;
    ikChainCount: number;
    constraintCount: number;
    shapeKeyCount: number;
    nlaStripCount: number;
    timelineDuration: number;
    activeClipId: string | null;
    activeClipName: string | null;
    hasRootMotion: boolean;
  };
}

export interface BuildManifestGeneratedCharacter {
  assetId: string;
  assetPath: string;
  assetName: string;
  path: string;
  package: CharacterPackage;
  summary: CharacterPackageSummary;
}

export interface BuildManifestCombatActor {
  entityId: string;
  entityName: string;
  team: 'player' | 'enemy' | 'neutral';
  maxHealth: number;
  currentHealth: number;
  attack: number;
  defense: number;
  speed: number;
  hasWeapon: boolean;
  hasPlayerController: boolean;
}

export interface BuildManifestCombatWeapon {
  entityId: string;
  entityName: string;
  ownerEntityId: string | null;
  ownerEntityName: string | null;
  damage: number;
  attackSpeed: number;
  range: number;
  heavyDamage: number;
  heavyAttackSpeed: number;
  heavyRange: number;
  autoAcquireTarget: boolean;
  targetTeam: WeaponTargetPreference;
}

export interface BuildManifest {
  schema: 'reypaly-1.0';
  buildId: string;
  projectName: string;
  createdAt: string;
  activeSceneId: string | null;
  scenes: BuildManifestScene[];
  entities: Array<{
    id: string;
    name: string;
    tags: string[];
    components: string[];
  }>;
  assets: BuildManifestAsset[];
  materials: BuildManifestMaterial[];
  generatedModelerMeshes: BuildManifestGeneratedModelerMesh[];
  generatedTerrains: BuildManifestGeneratedTerrain[];
  generatedAnimations: BuildManifestGeneratedAnimation[];
  generatedCharacters: BuildManifestGeneratedCharacter[];
  combatActors: BuildManifestCombatActor[];
  combatWeapons: BuildManifestCombatWeapon[];
  scribs: Omit<ScribProfile, 'createdAt' | 'updatedAt'>[];
  scribComponents: Array<{
    id: string;
    type: string;
    kind: 'atomic' | 'composed';
    targetScope: 'entity' | 'scene';
    targetId: string;
    enabled: boolean;
  }>;
  compileMeta: {
    entityCount: number;
    assetCount: number;
    materialCount: number;
    textureReferenceCount: number;
    paintedTextureCount: number;
    generatedModelerMeshCount: number;
    generatedTerrainCount: number;
    generatedAnimationCount: number;
    generatedCharacterCount: number;
    combatActorCount: number;
    combatWeaponCount: number;
    diagnosticCount: number;
  };
}

export interface ValidateProjectInput {
  scenes: Scene[];
  entities: Map<string, Entity>;
  assets: Asset[];
  scribProfiles: Map<string, ScribProfile>;
  scribInstances: Map<string, ScribInstance>;
  activeSceneId: string | null;
  projectName: string;
}

export interface BuildGenerationInput {
  scenes: Scene[];
  entities: Map<string, Entity>;
  assets: Asset[];
  scribProfiles: Map<string, ScribProfile>;
  scribInstances: Map<string, ScribInstance>;
  activeSceneId: string | null;
  projectName: string;
}

export const PLAY_DIAGNOSTIC_STAGE = {
  SCHEMA: 'schema' as const,
  ASSETS: 'assets' as const,
  INPUT: 'input' as const,
  RUNTIME: 'runtime' as const,
};

export const REYPLAY_BUILD_SCHEMA = 'reypaly-1.0';
