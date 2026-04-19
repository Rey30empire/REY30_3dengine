import type { ColorRGBA, JsonObject, Vector3 } from './common';

export type AgenticComponentType =
  | 'Transform'
  | 'MeshRenderer'
  | 'Collider'
  | 'Rigidbody'
  | 'Script'
  | 'Animator'
  | 'Light'
  | 'Camera'
  | 'PatrolRoute'
  | 'Trigger';

export interface AgenticTransform {
  position: Vector3;
  rotation: Vector3;
  scale: Vector3;
}

export interface AgenticComponent {
  id: string;
  type: AgenticComponentType;
  data: JsonObject;
  enabled: boolean;
}

export interface AgenticEntity {
  id: string;
  sceneId: string;
  name: string;
  type: 'empty' | 'group' | 'mesh' | 'npc' | 'light' | 'camera' | 'trigger';
  parentId: string | null;
  childIds: string[];
  transform: AgenticTransform;
  components: Record<string, AgenticComponent>;
  tags: string[];
  metadata: JsonObject;
}

export interface AgenticFog {
  enabled: boolean;
  type: 'linear' | 'exponential';
  color: ColorRGBA;
  near?: number;
  far?: number;
  density?: number;
}

export interface AgenticEnvironment {
  skybox: string | null;
  mood: 'neutral' | 'bright' | 'dark' | 'cinematic' | 'foggy';
  ambientLight: ColorRGBA;
  ambientIntensity: number;
  directionalLightIntensity: number;
  fog: AgenticFog | null;
}

export interface AgenticScene {
  id: string;
  name: string;
  rootEntityIds: string[];
  entityIds: string[];
  environment: AgenticEnvironment;
  layoutGroups: string[];
  metadata: JsonObject;
  createdAt: string;
  updatedAt: string;
}

export interface AgenticMaterial {
  id: string;
  name: string;
  color: ColorRGBA;
  roughness: number;
  metallic: number;
  metadata: JsonObject;
}

export interface AgenticAsset {
  id: string;
  name: string;
  type: 'mesh' | 'texture' | 'material' | 'script' | 'animation' | 'audio' | 'scene' | 'unknown';
  path: string;
  valid: boolean;
  metadata: JsonObject;
}

export interface AgenticScript {
  id: string;
  name: string;
  language: 'typescript' | 'javascript' | 'visual';
  source: string;
  parameters: JsonObject;
  metadata: JsonObject;
}

export interface AgenticAnimationClip {
  id: string;
  name: string;
  duration: number;
  targetEntityId?: string;
  tracks: JsonObject[];
  metadata: JsonObject;
}

export interface AgenticBuildReport {
  id: string;
  status: 'valid' | 'invalid' | 'exported';
  summary: string;
  issues: string[];
  artifactPath?: string;
  createdAt: string;
}

export interface WorldState {
  id: string;
  activeSceneId: string | null;
  scenes: Record<string, AgenticScene>;
  entities: Record<string, AgenticEntity>;
  materials: Record<string, AgenticMaterial>;
  assets: Record<string, AgenticAsset>;
  scripts: Record<string, AgenticScript>;
  animations: Record<string, AgenticAnimationClip>;
  buildReports: Record<string, AgenticBuildReport>;
  updatedAt: string;
}
