import type { Entity, EnvironmentSettings, Scene } from '@/types/engine';

export type ScriptRuntimeModuleKind = 'legacy' | 'scrib';
export type ScriptRuntimePhase = 'onStart' | 'update' | 'onStop';

export interface ScriptRuntimeVector3 {
  x: number;
  y: number;
  z: number;
}

export type ScriptRuntimeCommand =
  | {
      type: 'setTransform';
      transform: Partial<ScriptRuntimeVector3>;
    }
  | {
      type: 'setVelocity';
      velocity: ScriptRuntimeVector3;
    }
  | {
      type: 'setComponent';
      componentType: string;
      data: Record<string, unknown>;
      enabled?: boolean;
    }
  | {
      type: 'setSceneEnvironment';
      environment: Partial<EnvironmentSettings>;
    };

export interface ScriptRuntimeInvocationContext {
  deltaTime: number;
  entityId: string;
  entity: Entity;
  targetScope?: 'entity' | 'scene';
  targetId?: string;
  scribNodeId?: string;
  scribSourceId?: string;
  scribType?: string;
  config?: Record<string, unknown>;
  sceneId?: string | null;
  scene?: Scene | null;
}

export interface ScriptRuntimeAvailablePhases {
  onStart: boolean;
  update: boolean;
  onStop: boolean;
  default: boolean;
}

export interface ScriptRuntimeLoadRequest {
  type: 'load';
  requestId: string;
  moduleKey: string;
  moduleKind: ScriptRuntimeModuleKind;
  scriptId: string;
  compiledHash: string;
  compiledCode: string;
}

export interface ScriptRuntimeInvokeRequest {
  type: 'invoke';
  requestId: string;
  moduleKey: string;
  moduleKind: ScriptRuntimeModuleKind;
  phase: ScriptRuntimePhase;
  context: ScriptRuntimeInvocationContext;
  maxExecutionMs: number;
  maxExecutionTicks: number;
}

export interface ScriptRuntimeUnloadRequest {
  type: 'unload';
  requestId: string;
  moduleKey: string;
}

export type ScriptRuntimeWorkerRequest =
  | ScriptRuntimeLoadRequest
  | ScriptRuntimeInvokeRequest
  | ScriptRuntimeUnloadRequest;

export interface ScriptRuntimeLoadResponse {
  type: 'load';
  requestId: string;
  ok: true;
  availablePhases: ScriptRuntimeAvailablePhases;
}

export interface ScriptRuntimeInvokeResponse {
  type: 'invoke';
  requestId: string;
  ok: true;
  commands: ScriptRuntimeCommand[];
}

export interface ScriptRuntimeUnloadResponse {
  type: 'unload';
  requestId: string;
  ok: true;
}

export interface ScriptRuntimeErrorResponse {
  type: 'load' | 'invoke' | 'unload';
  requestId: string;
  ok: false;
  error: string;
}

export type ScriptRuntimeWorkerResponse =
  | ScriptRuntimeLoadResponse
  | ScriptRuntimeInvokeResponse
  | ScriptRuntimeUnloadResponse
  | ScriptRuntimeErrorResponse;
