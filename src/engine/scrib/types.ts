export type ScribTargetScope = 'entity' | 'scene';

export type AtomicScribType =
  | 'transform'
  | 'mesh'
  | 'material'
  | 'movement'
  | 'collider'
  | 'physics'
  | 'animation'
  | 'particles'
  | 'audio'
  | 'ui'
  | 'ai'
  | 'cameraFollow'
  | 'damage'
  | 'inventory';

export type ComposedScribType =
  | 'characterBasic'
  | 'enemyBasic'
  | 'terrainBasic'
  | 'weaponBasic'
  | 'doorBasic'
  | 'vehicleBasic';

export type ScribType = AtomicScribType | ComposedScribType;

export type ScribKind = 'atomic' | 'composed';

export interface ScribTargetRef {
  scope: ScribTargetScope;
  id: string;
}

export interface ScribDefinition {
  type: ScribType;
  kind: ScribKind;
  description: string;
  requires: AtomicScribType[];
  optional: AtomicScribType[];
  provides: AtomicScribType[];
  defaultConfig: Record<string, unknown>;
  composedOf?: AtomicScribType[];
  editableCode: boolean;
}

export interface ScribInstance {
  id: string;
  type: ScribType;
  kind: ScribKind;
  target: ScribTargetRef;
  config: Record<string, unknown>;
  code: string;
  requires: AtomicScribType[];
  optional: AtomicScribType[];
  provides: AtomicScribType[];
  enabled: boolean;
  origin: 'manual' | 'hybrid' | 'ai';
  createdAt: string;
  updatedAt: string;
}

export interface ScribValidationIssue {
  level: 'error' | 'warning';
  code: string;
  message: string;
}

export interface ScribValidationResult {
  ok: boolean;
  issues: ScribValidationIssue[];
}

export interface CreateScribInstanceInput {
  type: ScribType;
  target: ScribTargetRef;
  config?: Record<string, unknown>;
  code?: string;
  origin?: ScribInstance['origin'];
}

export interface AssignScribResult {
  ok: boolean;
  assigned: ScribInstance[];
  autoAdded: ScribInstance[];
  issues: ScribValidationIssue[];
}

