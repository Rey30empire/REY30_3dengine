import type { Entity, Asset, Scene } from '@/types/engine';
import type { ScribInstance } from '@/engine/scrib';

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
}

export interface BuildManifestAsset {
  id: string;
  name: string;
  type: string;
  path: string;
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
