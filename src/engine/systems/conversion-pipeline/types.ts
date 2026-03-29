import type { EditableMesh, EditableVec3 } from '@/engine/editor/modelerMesh';

export type ConversionMode =
  | 'Sketch2DTo3D_SingleView'
  | 'Sketch2DTo3D_MultiView'
  | 'ImageTo3D_SingleImage'
  | 'ImageTo3D_MultiView'
  | 'PhotoScanTo3D_Object'
  | 'VideoScanTo3D_Object'
  | 'SceneScanTo3D_Environment';

export type ConversionTarget = 'object' | 'scene';
export type InputSourceType = 'sketch' | 'image' | 'photo' | 'video' | 'scan_frame';
export type ViewLabel =
  | 'front'
  | 'side'
  | 'back'
  | 'perspective'
  | 'top'
  | 'bottom'
  | 'unknown';
export type QualityLevel = 'Low' | 'Medium' | 'High';
export type PreferredResultKind = 'blockout' | 'editable_mesh' | 'editable_scene';
export type IntentCategory =
  | 'human'
  | 'animal'
  | 'chair'
  | 'table'
  | 'bed'
  | 'vehicle'
  | 'mechanical_object'
  | 'furniture'
  | 'architecture'
  | 'room_scene'
  | 'generic_object';

export interface SketchStrokePoint {
  x: number;
  y: number;
  pressure?: number;
}

export interface SketchStroke {
  points: SketchStrokePoint[];
}

export interface SourceReference {
  id: string;
  type: InputSourceType;
  label: string;
  path?: string;
  viewLabel?: ViewLabel;
  width?: number;
  height?: number;
  durationSeconds?: number;
  bytes?: number;
  prompt?: string;
  tags?: string[];
  backgroundComplexity?: number;
  sharpnessEstimate?: number;
  coverageAngleDegrees?: number;
  strokes?: SketchStroke[];
  metadata?: Record<string, unknown>;
}

export interface ExtractedSilhouette {
  widthRatio: number;
  heightRatio: number;
  closed: boolean;
  symmetry: 'none' | 'approximate' | 'strong';
}

export interface FeaturePoint {
  id: string;
  x: number;
  y: number;
  strength: number;
}

export interface FeatureLine {
  id: string;
  points: Array<{ x: number; y: number }>;
  strength: number;
}

export interface PreprocessedInput {
  sourceId: string;
  sourceType: InputSourceType;
  inferredViewLabel: ViewLabel;
  normalizedWidth: number;
  normalizedHeight: number;
  silhouette: ExtractedSilhouette;
  featurePoints: FeaturePoint[];
  featureLines: FeatureLine[];
  backgroundRemoved: boolean;
  notes: string[];
}

export interface ViewAlignmentResult {
  alignedViewLabels: Record<string, ViewLabel>;
  coverageScore: number;
  consistencyScore: number;
}

export interface InputQualityReport {
  overall: QualityLevel;
  score: number;
  inputCompleteness: number;
  angularCoverage: number;
  sharpness: number;
  backgroundPenalty: number;
  issues: string[];
  missingViews: ViewLabel[];
  recommendedPipeline: ConversionMode;
  preferredResult: PreferredResultKind;
  templateRecommended: boolean;
}

export interface IntentHypothesis {
  category: IntentCategory;
  target: ConversionTarget;
  confidence: number;
  reason: string;
  semanticParts: string[];
}

export interface TemplateSuggestion {
  id: string;
  category: IntentCategory;
  templateType: string;
  confidence: number;
  reason: string;
}

export interface Transform3D {
  position: EditableVec3;
  rotationEuler: EditableVec3;
  scale: EditableVec3;
}

export interface ReconstructionMetadata {
  pipeline: ConversionMode;
  sourceInputIds: string[];
  qualityLevel: QualityLevel;
  confidence: number;
  notes: string[];
  templateType?: string | null;
  blockoutOnly?: boolean;
  angularCoverage?: number;
}

export interface EditableObject3D {
  id: string;
  name: string;
  mesh: EditableMesh;
  transform: Transform3D;
  metadata: ReconstructionMetadata;
}

export interface EditableSceneNode {
  id: string;
  name: string;
  kind: 'group' | 'mesh' | 'camera' | 'light';
  transform: Transform3D;
  childIds: string[];
  mesh?: EditableMesh;
  metadata?: Record<string, unknown>;
}

export interface EditableScene3D {
  id: string;
  name: string;
  nodes: EditableSceneNode[];
  rootNodeIds: string[];
  metadata: ReconstructionMetadata;
}

export interface ConversionPreview {
  id: string;
  kind: 'object' | 'scene';
  summary: string;
  quality: InputQualityReport;
  hypotheses: IntentHypothesis[];
  object?: EditableObject3D;
  scene?: EditableScene3D;
}

export interface AcceptedConversion {
  kind: 'object' | 'scene';
  metadata: ReconstructionMetadata;
  object?: EditableObject3D;
  scene?: EditableScene3D;
}

export interface ConversionSession {
  id: string;
  mode: ConversionMode;
  target: ConversionTarget;
  status: 'draft' | 'preprocessed' | 'preview_ready' | 'accepted' | 'rejected';
  name: string;
  inputs: SourceReference[];
  preprocessedInputs: PreprocessedInput[];
  quality: InputQualityReport | null;
  alignment: ViewAlignmentResult | null;
  hypotheses: IntentHypothesis[];
  templateSuggestion: TemplateSuggestion | null;
  preview: ConversionPreview | null;
  acceptedResult: AcceptedConversion | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConversionCommand {
  id: string;
  label: string;
  sessionId: string;
  before: ConversionSession;
  after: ConversionSession;
}

export interface ConversionEngineAdapter {
  showMessage?: (text: string) => void;
  commitEditableObject?: (object: EditableObject3D) => Promise<void> | void;
  commitEditableScene?: (scene: EditableScene3D) => Promise<void> | void;
  saveSession?: (sessionId: string, serialized: string) => Promise<void> | void;
}

export function createTransform3D(): Transform3D {
  return {
    position: { x: 0, y: 0, z: 0 },
    rotationEuler: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  };
}

export function cloneTransform3D(transform: Transform3D): Transform3D {
  return {
    position: { ...transform.position },
    rotationEuler: { ...transform.rotationEuler },
    scale: { ...transform.scale },
  };
}

export function deepClone<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}
