export const REQUIRED_MODULAR_PART_TYPES = [
  'head',
  'neck',
  'torso',
  'left_arm',
  'right_arm',
  'left_forearm',
  'right_forearm',
  'left_hand',
  'right_hand',
  'pelvis',
  'left_leg',
  'right_leg',
  'left_calf',
  'right_calf',
  'left_foot',
  'right_foot',
] as const;

export const OPTIONAL_MODULAR_PART_TYPES = [
  'hair',
  'helmet',
  'glasses',
  'upper_clothing',
  'lower_clothing',
  'shoulder_pads',
  'gloves',
  'boots',
  'accessory',
] as const;

export const MODULAR_PART_TYPES = [
  ...REQUIRED_MODULAR_PART_TYPES,
  ...OPTIONAL_MODULAR_PART_TYPES,
] as const;

export type RequiredModularPartType = (typeof REQUIRED_MODULAR_PART_TYPES)[number];
export type OptionalModularPartType = (typeof OPTIONAL_MODULAR_PART_TYPES)[number];
export type ModularPartType = (typeof MODULAR_PART_TYPES)[number];

export type SupportedModelFormat = 'fbx' | 'obj' | 'glb' | 'gltf';
export type FragmentationMode = 'auto' | 'manual';
export type ModularExportProfile = 'unity-ready' | 'static-modular' | 'rigged-modular';
export type ModularProcessingState =
  | 'idle'
  | 'uploading'
  | 'processing'
  | 'fragmenting'
  | 'saving'
  | 'ready'
  | 'error';

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface BoundsLike {
  min: Vec3Like;
  max: Vec3Like;
  size: Vec3Like;
  center: Vec3Like;
}

export interface UploadedSourceFileDescriptor {
  fileName: string;
  mimeType: string;
  size: number;
  isPrimary: boolean;
}

export interface MaterialRecord {
  id: string;
  name: string;
  textureNames: string[];
}

export interface SkeletonNodeRecord {
  id: string;
  name: string;
  path: string;
  parentPath: string | null;
  position: Vec3Like;
}

export interface MeshNodeRecord {
  id: string;
  name: string;
  path: string;
  parentPath: string | null;
  materialNames: string[];
  textureNames: string[];
  vertexCount: number;
  triangleCount: number;
  hasRig: boolean;
  boneNames: string[];
  boundingBox: BoundsLike;
  pivot: Vec3Like;
  visible: boolean;
}

export interface ModularConnectionPoint {
  id: string;
  label: string;
  targetPartType: ModularPartType | 'root';
  position: Vec3Like;
  orientation: Vec3Like;
}

export interface ModularCompatibilityIssue {
  code: string;
  severity: 'info' | 'warn' | 'error';
  message: string;
}

export interface ModularCompatibilityReport {
  ok: boolean;
  issues: ModularCompatibilityIssue[];
}

export interface PartAssignmentDraft {
  id: string;
  partType: ModularPartType;
  label: string;
  mode: FragmentationMode;
  nodePaths: string[];
  sourceMeshNames: string[];
  confidence: number;
  notes: string | null;
  boundingBox: BoundsLike;
  pivot: Vec3Like;
  materialNames: string[];
  textureNames: string[];
  boneNames: string[];
  hasRig: boolean;
  connectionPoints: ModularConnectionPoint[];
  compatibility: ModularCompatibilityReport;
  exportFileName: string;
}

export interface ModelAnalysisSummary {
  sourceName: string;
  sourceFormat: SupportedModelFormat;
  sourceFiles: UploadedSourceFileDescriptor[];
  sourcePrimaryFileName: string;
  sourceSize: number;
  uploadedAt: string;
  meshCount: number;
  materialCount: number;
  boneCount: number;
  animationCount: number;
  hasRig: boolean;
  hasAnimations: boolean;
  materials: MaterialRecord[];
  meshes: MeshNodeRecord[];
  skeleton: SkeletonNodeRecord[];
  boundingBox: BoundsLike;
}

export interface ModularPartManifestRecord {
  id: string;
  name: string;
  slug: string;
  partType: ModularPartType;
  exportFormat: SupportedModelFormat | 'glb';
  originalFormat: SupportedModelFormat;
  sourceNodePaths: string[];
  materialNames: string[];
  textureNames: string[];
  hasRig: boolean;
  boneNames: string[];
  pivot: Vec3Like;
  scale: Vec3Like;
  boundingBox: BoundsLike;
  connectionPoints: ModularConnectionPoint[];
  compatibility: ModularCompatibilityReport;
  storagePath: string;
  metadataPath: string;
  previewPath: string | null;
}

export interface ModularCharacterMetadataRecord {
  id: string;
  projectId: string;
  projectSlug: string;
  name: string;
  slug: string;
  exportProfile: ModularExportProfile;
  sourceFormat: SupportedModelFormat;
  originalDownloadMode: 'single-file' | 'bundle';
  storageBackend: 'filesystem' | 'netlify-blobs';
  uploadedAt: string;
  updatedAt: string;
  sourceFiles: UploadedSourceFileDescriptor[];
  previewPath: string | null;
  originalPath: string;
  originalFiles: string[];
  manifestPath: string;
  unityManifestPath: string;
  analysis: ModelAnalysisSummary;
  parts: ModularPartManifestRecord[];
}

export interface ModularCharacterCreatePayload {
  name: string;
  projectName?: string;
  projectSlug?: string;
  exportProfile: ModularExportProfile;
  sourcePrimaryFileName: string;
  analysis: ModelAnalysisSummary;
  assignments: PartAssignmentDraft[];
}

export interface SavedModularCharacterPartSummary {
  id: string;
  name: string;
  slug: string;
  partType: ModularPartType;
  hasRig: boolean;
  materialNames: string[];
  boneNames: string[];
  downloadUrl: string;
}

export interface SavedModularCharacterSummary {
  id: string;
  projectId: string | null;
  projectName: string;
  projectSlug: string;
  name: string;
  slug: string;
  exportProfile: ModularExportProfile;
  sourceFormat: SupportedModelFormat;
  meshCount: number;
  materialCount: number;
  animationCount: number;
  hasRig: boolean;
  partCount: number;
  createdAt: string;
  updatedAt: string;
  downloadUrl: string;
  originalDownloadUrl: string;
  parts: SavedModularCharacterPartSummary[];
}

export interface SavedModularCharacterDetail extends SavedModularCharacterSummary {
  metadata: ModularCharacterMetadataRecord;
}

export interface ModularCharacterListResponse {
  items: SavedModularCharacterSummary[];
}

export interface ModularCharacterDetailResponse {
  item: SavedModularCharacterDetail;
}
