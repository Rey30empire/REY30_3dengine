import type { EditableMesh, EditableVec3 } from '@/engine/editor/modelerMesh';

export type CreationMode = 'template' | 'intent_driven';
export type TemplateType =
  | 'chair'
  | 'bed'
  | 'table'
  | 'vehicle'
  | 'humanoid'
  | 'animal'
  | 'generic';

export interface TopologyVertex {
  id: string;
  position: EditableVec3;
}

export interface TopologyEdge {
  id: string;
  a: string;
  b: string;
}

export interface TopologyFace {
  id: string;
  vertexIds: string[];
}

export interface TopologyMesh {
  vertices: TopologyVertex[];
  edges: TopologyEdge[];
  faces: TopologyFace[];
  metadata?: Record<string, unknown>;
}

export interface TopologyTemplateParameters {
  width?: number;
  height?: number;
  depth?: number;
  segments?: number;
  symmetry?: boolean;
}

export interface TopologyBrushInput {
  screenX: number;
  screenY: number;
  timestamp: number;
  pressure?: number;
  worldPosition?: EditableVec3 | null;
  shiftKey?: boolean;
  altKey?: boolean;
}

export interface SurfaceHit {
  position: EditableVec3;
  normal: EditableVec3;
  entityId?: string;
}

export interface CursorSpaceResolution {
  worldPosition: EditableVec3;
  snapped: boolean;
  source: 'surface' | 'work_plane' | 'fallback';
  surfaceHit: SurfaceHit | null;
}

export type TopologyIntentKind =
  | 'create_vertex'
  | 'create_edge'
  | 'create_face'
  | 'extend_border'
  | 'surface_retopo'
  | 'template_proxy';

export interface IntentHypothesis {
  kind: TopologyIntentKind;
  confidence: number;
  reason: string;
}

export interface IntentSuggestion {
  id: string;
  createdAt: string;
  hypotheses: IntentHypothesis[];
  preview: TopologyMesh | null;
  accepted: boolean;
  rejected: boolean;
}

export interface TopologyValidationIssue {
  code: string;
  severity: 'warn' | 'error';
  message: string;
}

export interface TopologyProjectionAdapter {
  projectCursorToSurface(input: TopologyBrushInput): SurfaceHit | null;
  projectCursorToWorkPlane(input: TopologyBrushInput): EditableVec3;
  detectSurfaceHit(input: TopologyBrushInput): SurfaceHit | null;
}

export interface TopologyBrushSnapshot {
  mode: CreationMode;
  activeTemplateType: TemplateType | null;
  mesh: TopologyMesh;
  templateParameters: TopologyTemplateParameters;
  currentStroke: TopologyBrushInput[];
  currentSuggestion: IntentSuggestion | null;
}

export interface TopologyCommand {
  id: string;
  label: string;
  before: TopologyMesh;
  after: TopologyMesh;
}

export interface TemplateMeshResult {
  templateType: TemplateType;
  mesh: TopologyMesh;
}

export interface EditableTopologyResult {
  topology: TopologyMesh;
  editableMesh: EditableMesh;
}
