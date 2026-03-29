import type { EditableMesh, EditableVec2 } from '@/engine/editor/modelerMesh';
import { cloneEditableMesh, sanitizeEditableMesh } from '@/engine/editor/modelerMesh';
import {
  convertTopologyToEditableMesh,
  generateTemplateMesh,
  type TemplateType,
} from '@/engine/systems/topology-authoring';
import type {
  ConversionCommand,
  ConversionEngineAdapter,
  ConversionMode,
  ConversionPreview,
  ConversionSession,
  ConversionTarget,
  EditableObject3D,
  EditableScene3D,
  EditableSceneNode,
  ExtractedSilhouette,
  FeatureLine,
  FeaturePoint,
  InputQualityReport,
  IntentCategory,
  IntentHypothesis,
  PreprocessedInput,
  ReconstructionMetadata,
  SourceReference,
  TemplateSuggestion,
  Transform3D,
  ViewAlignmentResult,
  ViewLabel,
} from './types';
import { cloneTransform3D, createTransform3D, deepClone } from './types';

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function average(values: number[], fallback = 0) {
  if (values.length === 0) return fallback;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeViewLabel(label?: ViewLabel | string): ViewLabel {
  const lowered = (label ?? 'unknown').toString().toLowerCase();
  if (
    lowered === 'front' ||
    lowered === 'side' ||
    lowered === 'back' ||
    lowered === 'perspective' ||
    lowered === 'top' ||
    lowered === 'bottom'
  ) {
    return lowered;
  }
  return 'unknown';
}

function inferTargetFromMode(mode: ConversionMode): ConversionTarget {
  return mode === 'SceneScanTo3D_Environment' ? 'scene' : 'object';
}

function expectedInputCount(mode: ConversionMode) {
  switch (mode) {
    case 'Sketch2DTo3D_MultiView':
    case 'ImageTo3D_MultiView':
      return 4;
    case 'PhotoScanTo3D_Object':
      return 12;
    case 'VideoScanTo3D_Object':
      return 1;
    case 'SceneScanTo3D_Environment':
      return 6;
    case 'Sketch2DTo3D_SingleView':
    case 'ImageTo3D_SingleImage':
    default:
      return 1;
  }
}

function requiredViews(mode: ConversionMode): Array<Exclude<ViewLabel, 'unknown'>> {
  switch (mode) {
    case 'Sketch2DTo3D_MultiView':
    case 'ImageTo3D_MultiView':
      return ['front', 'side', 'back'];
    case 'SceneScanTo3D_Environment':
      return ['front', 'side', 'back', 'perspective'];
    default:
      return [];
  }
}

function qualityFromScore(score: number) {
  if (score >= 0.78) return 'High' as const;
  if (score >= 0.5) return 'Medium' as const;
  return 'Low' as const;
}

function cloneMesh(mesh: EditableMesh) {
  return cloneEditableMesh(mesh);
}

function createBoxMesh(size: { width: number; height: number; depth: number }): EditableMesh {
  const halfWidth = size.width / 2;
  const halfHeight = size.height / 2;
  const halfDepth = size.depth / 2;
  return {
    vertices: [
      { x: -halfWidth, y: 0, z: -halfDepth },
      { x: halfWidth, y: 0, z: -halfDepth },
      { x: halfWidth, y: size.height, z: -halfDepth },
      { x: -halfWidth, y: size.height, z: -halfDepth },
      { x: -halfWidth, y: 0, z: halfDepth },
      { x: halfWidth, y: 0, z: halfDepth },
      { x: halfWidth, y: size.height, z: halfDepth },
      { x: -halfWidth, y: size.height, z: halfDepth },
    ],
    faces: [
      [0, 1, 2], [0, 2, 3],
      [4, 5, 6], [4, 6, 7],
      [0, 1, 5], [0, 5, 4],
      [1, 2, 6], [1, 6, 5],
      [2, 3, 7], [2, 7, 6],
      [3, 0, 4], [3, 4, 7],
    ],
  };
}

function createObject3D(params: {
  name: string;
  mesh: EditableMesh;
  metadata: ReconstructionMetadata;
  transform?: Transform3D;
}): EditableObject3D {
  return {
    id: crypto.randomUUID(),
    name: params.name,
    mesh: sanitizeEditableMesh(cloneMesh(params.mesh)),
    transform: params.transform ? cloneTransform3D(params.transform) : createTransform3D(),
    metadata: deepClone(params.metadata),
  };
}

function createSceneNode(params: {
  name: string;
  kind: EditableSceneNode['kind'];
  mesh?: EditableMesh;
  metadata?: Record<string, unknown>;
  transform?: Transform3D;
  childIds?: string[];
}): EditableSceneNode {
  return {
    id: crypto.randomUUID(),
    name: params.name,
    kind: params.kind,
    transform: params.transform ? cloneTransform3D(params.transform) : createTransform3D(),
    childIds: params.childIds ? [...params.childIds] : [],
    mesh: params.mesh ? sanitizeEditableMesh(cloneMesh(params.mesh)) : undefined,
    metadata: params.metadata ? deepClone(params.metadata) : undefined,
  };
}

function cloneSession(session: ConversionSession) {
  return deepClone(session);
}

function mapIntentToTemplateType(category: IntentCategory): TemplateType {
  switch (category) {
    case 'human':
      return 'humanoid';
    case 'animal':
      return 'animal';
    case 'chair':
      return 'chair';
    case 'table':
      return 'table';
    case 'bed':
      return 'bed';
    case 'vehicle':
    case 'mechanical_object':
      return 'vehicle';
    case 'furniture':
      return 'table';
    case 'architecture':
    case 'room_scene':
    case 'generic_object':
    default:
      return 'generic';
  }
}

function buildUvSeed(mesh: EditableMesh): EditableVec2[] | undefined {
  if (mesh.vertices.length === 0) return undefined;
  const xs = mesh.vertices.map((vertex) => vertex.x);
  const zs = mesh.vertices.map((vertex) => vertex.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const spanX = Math.max(maxX - minX, 0.001);
  const spanZ = Math.max(maxZ - minZ, 0.001);
  return mesh.vertices.map((vertex) => ({
    u: (vertex.x - minX) / spanX,
    v: (vertex.z - minZ) / spanZ,
  }));
}

function compactMesh(mesh: EditableMesh): EditableMesh {
  const usedVertexIndices = new Set(mesh.faces.flatMap((face) => face));
  const ordered = Array.from(usedVertexIndices).sort((left, right) => left - right);
  if (ordered.length === 0) {
    return { vertices: [], faces: [] };
  }

  const remap = new Map<number, number>();
  const vertices = ordered.map((vertexIndex, nextIndex) => {
    remap.set(vertexIndex, nextIndex);
    return { ...mesh.vertices[vertexIndex]! };
  });
  const faces = mesh.faces
    .map((face) => {
      const remapped = face.map((vertexIndex) => remap.get(vertexIndex));
      return remapped.every((vertexIndex) => typeof vertexIndex === 'number')
        ? (remapped as [number, number, number])
        : null;
    })
    .filter((face): face is [number, number, number] => Boolean(face));
  return sanitizeEditableMesh({
    vertices,
    faces,
    uvs: mesh.uvs
      ? ordered.map((vertexIndex) => mesh.uvs?.[vertexIndex] ?? { u: 0, v: 0 })
      : buildUvSeed({ vertices, faces }),
  });
}

function sceneFromObject(object: EditableObject3D): EditableScene3D {
  const root = createSceneNode({
    name: `${object.name} Root`,
    kind: 'group',
    childIds: [],
  });
  const meshNode = createSceneNode({
    name: object.name,
    kind: 'mesh',
    mesh: object.mesh,
    transform: object.transform,
    metadata: {
      sourceObjectId: object.id,
    },
  });
  root.childIds = [meshNode.id];

  return {
    id: crypto.randomUUID(),
    name: `${object.name} Scene`,
    nodes: [root, meshNode],
    rootNodeIds: [root.id],
    metadata: deepClone(object.metadata),
  };
}

export class SketchInputSystem {
  CreateSketchSession(params: {
    name?: string;
    sketches: Array<{
      label: string;
      viewLabel?: ViewLabel;
      strokes: SourceReference['strokes'];
      width?: number;
      height?: number;
      tags?: string[];
    }>;
  }): SourceReference[] {
    return params.sketches.map((entry) => ({
      id: crypto.randomUUID(),
      type: 'sketch',
      label: entry.label,
      viewLabel: normalizeViewLabel(entry.viewLabel),
      width: entry.width ?? 1024,
      height: entry.height ?? 1024,
      strokes: deepClone(entry.strokes ?? []),
      tags: [...(entry.tags ?? [])],
      sharpnessEstimate: 1,
      backgroundComplexity: 0,
      metadata: {
        sessionName: params.name ?? 'Sketch Session',
      },
    }));
  }
}

export class ImageImportSystem {
  ImportSingleImage(params: {
    label: string;
    path?: string;
    width?: number;
    height?: number;
    tags?: string[];
    backgroundComplexity?: number;
    sharpnessEstimate?: number;
  }): SourceReference {
    return {
      id: crypto.randomUUID(),
      type: 'image',
      label: params.label,
      path: params.path,
      width: params.width ?? 1024,
      height: params.height ?? 1024,
      tags: [...(params.tags ?? [])],
      backgroundComplexity: clamp(params.backgroundComplexity ?? 0.35, 0, 1),
      sharpnessEstimate: clamp(params.sharpnessEstimate ?? 0.72, 0, 1),
    };
  }
}

export class MultiViewInputManager {
  ImportMultiViewImages(params: {
    label?: string;
    images: Array<{
      label: string;
      path?: string;
      viewLabel?: ViewLabel;
      width?: number;
      height?: number;
      tags?: string[];
      backgroundComplexity?: number;
      sharpnessEstimate?: number;
      coverageAngleDegrees?: number;
    }>;
  }): SourceReference[] {
    return params.images.map((entry, index) => ({
      id: crypto.randomUUID(),
      type: 'image',
      label: entry.label || `${params.label ?? 'MultiView'} ${index + 1}`,
      path: entry.path,
      viewLabel: normalizeViewLabel(entry.viewLabel),
      width: entry.width ?? 1024,
      height: entry.height ?? 1024,
      tags: [...(entry.tags ?? [])],
      backgroundComplexity: clamp(entry.backgroundComplexity ?? 0.28, 0, 1),
      sharpnessEstimate: clamp(entry.sharpnessEstimate ?? 0.82, 0, 1),
      coverageAngleDegrees: entry.coverageAngleDegrees,
    }));
  }
}

export class PhotoSetImportSystem {
  ImportPhotoSet(params: {
    label: string;
    photos: Array<{
      path?: string;
      viewLabel?: ViewLabel;
      width?: number;
      height?: number;
      tags?: string[];
      backgroundComplexity?: number;
      sharpnessEstimate?: number;
      coverageAngleDegrees?: number;
    }>;
  }): SourceReference[] {
    return params.photos.map((entry, index) => ({
      id: crypto.randomUUID(),
      type: 'photo',
      label: `${params.label} Photo ${index + 1}`,
      path: entry.path,
      viewLabel: normalizeViewLabel(entry.viewLabel),
      width: entry.width ?? 1600,
      height: entry.height ?? 1200,
      tags: [...(entry.tags ?? [])],
      backgroundComplexity: clamp(entry.backgroundComplexity ?? 0.22, 0, 1),
      sharpnessEstimate: clamp(entry.sharpnessEstimate ?? 0.85, 0, 1),
      coverageAngleDegrees: entry.coverageAngleDegrees ?? index * (360 / Math.max(params.photos.length, 1)),
    }));
  }
}

export class VideoImportSystem {
  ImportVideoForReconstruction(params: {
    label: string;
    path?: string;
    durationSeconds?: number;
    width?: number;
    height?: number;
    tags?: string[];
    sharpnessEstimate?: number;
  }): SourceReference {
    return {
      id: crypto.randomUUID(),
      type: 'video',
      label: params.label,
      path: params.path,
      durationSeconds: params.durationSeconds ?? 12,
      width: params.width ?? 1920,
      height: params.height ?? 1080,
      tags: [...(params.tags ?? [])],
      backgroundComplexity: 0.28,
      sharpnessEstimate: clamp(params.sharpnessEstimate ?? 0.76, 0, 1),
    };
  }
}

export class ScanSessionManager {
  StartSceneScanSession(params: {
    label: string;
    captures: Array<{
      type?: 'photo' | 'image';
      path?: string;
      viewLabel?: ViewLabel;
      width?: number;
      height?: number;
      sharpnessEstimate?: number;
      backgroundComplexity?: number;
      tags?: string[];
    }>;
  }): SourceReference[] {
    return params.captures.map((entry, index) => ({
      id: crypto.randomUUID(),
      type: entry.type ?? 'photo',
      label: `${params.label} Capture ${index + 1}`,
      path: entry.path,
      viewLabel: normalizeViewLabel(entry.viewLabel),
      width: entry.width ?? 1920,
      height: entry.height ?? 1080,
      sharpnessEstimate: clamp(entry.sharpnessEstimate ?? 0.74, 0, 1),
      backgroundComplexity: clamp(entry.backgroundComplexity ?? 0.45, 0, 1),
      tags: [...(entry.tags ?? [])],
      coverageAngleDegrees: index * (360 / Math.max(params.captures.length, 1)),
    }));
  }
}

export class BackgroundRemovalModule {
  remove(reference: SourceReference): SourceReference {
    return {
      ...reference,
      backgroundComplexity: clamp((reference.backgroundComplexity ?? 0.35) * 0.5, 0, 1),
      metadata: {
        ...(reference.metadata ?? {}),
        backgroundRemoved: true,
      },
    };
  }
}

export class SilhouetteExtractor {
  extract(reference: SourceReference): ExtractedSilhouette {
    const width = reference.width ?? 1024;
    const height = reference.height ?? 1024;
    const baseRatio = clamp(width / Math.max(height, 1), 0.35, 2.4);
    if (reference.type === 'sketch' && reference.strokes && reference.strokes.length > 0) {
      const points = reference.strokes.flatMap((stroke) => stroke.points);
      if (points.length > 0) {
        const xs = points.map((point) => point.x);
        const ys = points.map((point) => point.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        const closed =
          reference.strokes.some((stroke) => {
            const first = stroke.points[0];
            const last = stroke.points[stroke.points.length - 1];
            if (!first || !last) return false;
            return Math.hypot(last.x - first.x, last.y - first.y) <= 0.08;
          }) || false;
        const symmetry =
          reference.viewLabel === 'front' || reference.viewLabel === 'back'
            ? 'strong'
            : closed
              ? 'approximate'
              : 'none';
        return {
          widthRatio: clamp(maxX - minX, 0.12, 0.98),
          heightRatio: clamp(maxY - minY, 0.12, 0.98),
          closed,
          symmetry,
        };
      }
    }

    return {
      widthRatio: clamp(baseRatio / 1.5, 0.2, 0.95),
      heightRatio: clamp(1 / Math.max(baseRatio, 0.75), 0.25, 0.98),
      closed: reference.type !== 'video',
      symmetry:
        reference.viewLabel === 'front' || reference.viewLabel === 'back'
          ? 'strong'
          : baseRatio < 1.35
            ? 'approximate'
            : 'none',
    };
  }
}

export class EdgeExtractor {
  extract(reference: SourceReference): FeatureLine[] {
    if (reference.type === 'sketch' && reference.strokes && reference.strokes.length > 0) {
      return reference.strokes.map((stroke, index) => ({
        id: `${reference.id}_line_${index}`,
        points: stroke.points.map((point) => ({ x: point.x, y: point.y })),
        strength: average(stroke.points.map((point) => point.pressure ?? 1), 1),
      }));
    }

    return [
      {
        id: `${reference.id}_outline`,
        points: [
          { x: 0.15, y: 0.15 },
          { x: 0.85, y: 0.15 },
          { x: 0.85, y: 0.85 },
          { x: 0.15, y: 0.85 },
        ],
        strength: clamp(reference.sharpnessEstimate ?? 0.65, 0.2, 1),
      },
    ];
  }
}

export class FeatureDetector {
  extract(reference: SourceReference): FeaturePoint[] {
    const sharpness = clamp(reference.sharpnessEstimate ?? 0.7, 0, 1);
    const count = Math.max(4, Math.round(4 + sharpness * 8));
    return Array.from({ length: count }, (_unused, index) => ({
      id: `${reference.id}_feature_${index}`,
      x: (index % 4) / 3,
      y: Math.floor(index / 4) / Math.max(Math.ceil(count / 4) - 1, 1),
      strength: clamp(sharpness - index * 0.03, 0.15, 1),
    }));
  }
}

export class SketchPreprocessor {
  constructor(
    private readonly silhouetteExtractor: SilhouetteExtractor,
    private readonly edgeExtractor: EdgeExtractor,
    private readonly featureDetector: FeatureDetector
  ) {}

  preprocess(reference: SourceReference): PreprocessedInput {
    const silhouette = this.silhouetteExtractor.extract(reference);
    return {
      sourceId: reference.id,
      sourceType: reference.type,
      inferredViewLabel: normalizeViewLabel(reference.viewLabel),
      normalizedWidth: (reference.width ?? 1024) / 1024,
      normalizedHeight: (reference.height ?? 1024) / 1024,
      silhouette,
      featureLines: this.edgeExtractor.extract(reference),
      featurePoints: this.featureDetector.extract(reference),
      backgroundRemoved: true,
      notes: ['sketch_preprocessed'],
    };
  }
}

export class ImagePreprocessor {
  constructor(
    private readonly backgroundRemoval: BackgroundRemovalModule,
    private readonly silhouetteExtractor: SilhouetteExtractor,
    private readonly edgeExtractor: EdgeExtractor,
    private readonly featureDetector: FeatureDetector
  ) {}

  preprocess(reference: SourceReference): PreprocessedInput {
    const cleaned = this.backgroundRemoval.remove(reference);
    const silhouette = this.silhouetteExtractor.extract(cleaned);
    return {
      sourceId: cleaned.id,
      sourceType: cleaned.type,
      inferredViewLabel: normalizeViewLabel(cleaned.viewLabel),
      normalizedWidth: (cleaned.width ?? 1024) / 1024,
      normalizedHeight: (cleaned.height ?? 1024) / 1024,
      silhouette,
      featureLines: this.edgeExtractor.extract(cleaned),
      featurePoints: this.featureDetector.extract(cleaned),
      backgroundRemoved: true,
      notes: ['image_preprocessed'],
    };
  }
}

export class FrameExtractorFromVideo {
  extractFrames(reference: SourceReference): SourceReference[] {
    const duration = Math.max(reference.durationSeconds ?? 8, 2);
    const frameCount = clamp(Math.round(duration / 1.5), 4, 12);
    const labels: ViewLabel[] = ['front', 'side', 'back', 'perspective', 'side', 'top'];
    return Array.from({ length: frameCount }, (_unused, index) => ({
      id: `${reference.id}_frame_${index}`,
      type: 'scan_frame',
      label: `${reference.label} Frame ${index + 1}`,
      width: reference.width ?? 1920,
      height: reference.height ?? 1080,
      sharpnessEstimate: clamp((reference.sharpnessEstimate ?? 0.72) - index * 0.01, 0.4, 1),
      backgroundComplexity: clamp(reference.backgroundComplexity ?? 0.3, 0, 1),
      coverageAngleDegrees: index * (360 / frameCount),
      viewLabel: labels[index % labels.length] ?? 'perspective',
      tags: [...(reference.tags ?? []), 'video_frame'],
      metadata: {
        sourceVideoId: reference.id,
      },
    }));
  }
}

export class ViewAlignmentHelper {
  align(inputs: SourceReference[], preprocessedInputs: PreprocessedInput[]): ViewAlignmentResult {
    const alignedViewLabels: Record<string, ViewLabel> = {};
    const silhouetteWidths = preprocessedInputs.map((entry) => entry.silhouette.widthRatio);
    const silhouetteHeights = preprocessedInputs.map((entry) => entry.silhouette.heightRatio);
    const avgWidth = average(silhouetteWidths, 0.6);
    const avgHeight = average(silhouetteHeights, 0.7);

    inputs.forEach((input, index) => {
      const preprocessed = preprocessedInputs[index];
      const inferred =
        normalizeViewLabel(input.viewLabel) !== 'unknown'
          ? normalizeViewLabel(input.viewLabel)
          : (['front', 'side', 'back', 'perspective'][index % 4] as ViewLabel);
      alignedViewLabels[input.id] = preprocessed?.inferredViewLabel ?? inferred;
    });

    const widthVariance =
      silhouetteWidths.length > 1
        ? average(silhouetteWidths.map((value) => Math.abs(value - avgWidth)), 0)
        : 0;
    const heightVariance =
      silhouetteHeights.length > 1
        ? average(silhouetteHeights.map((value) => Math.abs(value - avgHeight)), 0)
        : 0;
    const consistencyScore = clamp(1 - (widthVariance + heightVariance), 0, 1);
    const coverageLabels = new Set(Object.values(alignedViewLabels));
    const coverageScore = clamp(coverageLabels.size / 4, 0.25, 1);

    return {
      alignedViewLabels,
      coverageScore,
      consistencyScore,
    };
  }
}

export class InputQualityAnalyzer {
  analyze(params: {
    mode: ConversionMode;
    inputs: SourceReference[];
    preprocessedInputs: PreprocessedInput[];
    alignment: ViewAlignmentResult | null;
  }): InputQualityReport {
    const expected = expectedInputCount(params.mode);
    const inputCompleteness = clamp(params.inputs.length / expected, 0, 1);
    const sharpness = average(
      params.inputs.map((input) => clamp(input.sharpnessEstimate ?? 0.7, 0, 1)),
      0.7
    );
    const backgroundPenalty = average(
      params.inputs.map((input) => clamp(input.backgroundComplexity ?? 0.3, 0, 1)),
      0.3
    );
    const angularCoverage = params.alignment?.coverageScore ?? clamp(params.inputs.length / 4, 0.2, 1);
    const score = clamp(
      inputCompleteness * 0.38 +
        angularCoverage * 0.27 +
        sharpness * 0.25 +
        (1 - backgroundPenalty) * 0.1,
      0,
      1
    );
    const missingViews = requiredViews(params.mode).filter((view) => {
      const seen = new Set(
        params.inputs
          .map((input) => normalizeViewLabel(input.viewLabel))
          .filter(
            (
              label
            ): label is Exclude<ViewLabel, 'unknown'> => label !== 'unknown'
          )
      );
      return !seen.has(view);
    });
    const issues: string[] = [];
    if (inputCompleteness < 0.6) {
      issues.push('Faltan entradas para una reconstruccion mas estable.');
    }
    if (backgroundPenalty > 0.45) {
      issues.push('El fondo puede contaminar la segmentacion.');
    }
    if (sharpness < 0.58) {
      issues.push('La nitidez de entrada reduce la confianza de reconstruccion.');
    }
    if (missingViews.length > 0) {
      issues.push(`Faltan vistas recomendadas: ${missingViews.join(', ')}.`);
    }

    const preferredResult =
      params.mode === 'SceneScanTo3D_Environment'
        ? 'editable_scene'
        : score < 0.58
          ? 'blockout'
          : 'editable_mesh';

    return {
      overall: qualityFromScore(score),
      score,
      inputCompleteness,
      angularCoverage,
      sharpness,
      backgroundPenalty,
      issues,
      missingViews,
      recommendedPipeline: params.mode,
      preferredResult,
      templateRecommended:
        params.mode === 'Sketch2DTo3D_SingleView' ||
        params.mode === 'ImageTo3D_SingleImage' ||
        score < 0.7,
    };
  }
}

function inferCategoryCandidates(inputs: SourceReference[]): IntentCategory[] {
  const haystack = inputs
    .flatMap((input) => [input.label, input.path, ...(input.tags ?? [])])
    .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    .join(' ')
    .toLowerCase();

  const candidates: IntentCategory[] = [];
  const push = (category: IntentCategory) => {
    if (!candidates.includes(category)) candidates.push(category);
  };

  if (
    haystack.includes('personaje') ||
    haystack.includes('character') ||
    haystack.includes('human') ||
    haystack.includes('humanoid')
  ) {
    push('human');
  }
  if (haystack.includes('animal') || haystack.includes('wolf') || haystack.includes('dog')) {
    push('animal');
  }
  if (haystack.includes('chair') || haystack.includes('silla')) {
    push('chair');
  }
  if (haystack.includes('table') || haystack.includes('mesa')) {
    push('table');
  }
  if (haystack.includes('bed') || haystack.includes('cama')) {
    push('bed');
  }
  if (haystack.includes('car') || haystack.includes('carro') || haystack.includes('vehicle')) {
    push('vehicle');
  }
  if (haystack.includes('room') || haystack.includes('habitacion') || haystack.includes('interior')) {
    push('room_scene');
  }
  if (haystack.includes('mechanic') || haystack.includes('mech')) {
    push('mechanical_object');
  }
  if (haystack.includes('furniture') || haystack.includes('mueble')) {
    push('furniture');
  }
  if (haystack.includes('house') || haystack.includes('building') || haystack.includes('arquitect')) {
    push('architecture');
  }

  if (candidates.length === 0) {
    push('generic_object');
  }
  return candidates;
}

export class ShapeCategoryClassifier {
  classify(inputs: SourceReference[], quality: InputQualityReport | null): IntentHypothesis[] {
    const candidates = inferCategoryCandidates(inputs);
    return candidates.map((category, index) => ({
      category,
      target: category === 'room_scene' ? 'scene' : 'object',
      confidence: clamp(
        (quality?.score ?? 0.6) - index * 0.14 + (category === 'room_scene' ? 0.12 : 0),
        0.2,
        0.96
      ),
      reason: `Hipotesis generada desde etiquetas, nombre de archivo y calidad de entrada para ${category}.`,
      semanticParts: [],
    }));
  }
}

export class CharacterVsObjectDetector {
  resolveTarget(hypotheses: IntentHypothesis[], fallback: ConversionTarget): ConversionTarget {
    const best = hypotheses[0];
    return best?.target ?? fallback;
  }
}

export class MultiViewConsistencyAnalyzer {
  analyze(alignment: ViewAlignmentResult | null, quality: InputQualityReport | null) {
    const score = clamp(
      (alignment?.consistencyScore ?? 0.5) * 0.65 + (quality?.angularCoverage ?? 0.5) * 0.35,
      0,
      1
    );
    const stable = score >= 0.58;
    return {
      score,
      stable,
      issues: stable ? [] : ['Las vistas no parecen lo bastante consistentes para una reconstruccion fina.'],
    };
  }
}

export class SemanticPartEstimator {
  estimate(category: IntentCategory): string[] {
    switch (category) {
      case 'human':
        return ['head', 'torso', 'arms', 'legs'];
      case 'animal':
        return ['head', 'body', 'legs', 'tail'];
      case 'chair':
        return ['seat', 'back', 'legs'];
      case 'table':
        return ['top', 'legs'];
      case 'bed':
        return ['base', 'headboard'];
      case 'vehicle':
      case 'mechanical_object':
        return ['body', 'support', 'details'];
      case 'room_scene':
        return ['floor', 'walls', 'ceiling', 'furniture'];
      case 'architecture':
        return ['floor', 'walls', 'openings'];
      case 'furniture':
        return ['body', 'supports'];
      case 'generic_object':
      default:
        return ['main_volume'];
    }
  }
}

export class TemplateSuggestionEngine {
  suggest(hypotheses: IntentHypothesis[], quality: InputQualityReport | null): TemplateSuggestion | null {
    const best = hypotheses[0];
    if (!best || best.target === 'scene') return null;
    const confidence = clamp(best.confidence + (quality?.templateRecommended ? 0.1 : -0.05), 0, 1);
    if (confidence < 0.45) return null;
    return {
      id: crypto.randomUUID(),
      category: best.category,
      templateType: mapIntentToTemplateType(best.category),
      confidence,
      reason: `Sugerencia parametrica basada en intencion ${best.category} y calidad ${quality?.overall ?? 'Medium'}.`,
    };
  }
}

export class DepthEstimationModule {
  estimate(inputs: PreprocessedInput[]): { width: number; height: number; depth: number } {
    const frontViews = inputs.filter((input) => input.inferredViewLabel === 'front' || input.inferredViewLabel === 'back');
    const sideViews = inputs.filter((input) => input.inferredViewLabel === 'side');
    const topViews = inputs.filter((input) => input.inferredViewLabel === 'top');
    const averageWidth = average(frontViews.map((entry) => entry.silhouette.widthRatio), average(inputs.map((entry) => entry.silhouette.widthRatio), 0.6));
    const averageHeight = average(frontViews.map((entry) => entry.silhouette.heightRatio), average(inputs.map((entry) => entry.silhouette.heightRatio), 0.8));
    const averageDepth = average(
      sideViews.map((entry) => entry.silhouette.widthRatio),
      average(topViews.map((entry) => entry.silhouette.heightRatio), Math.max(averageWidth * 0.6, 0.35))
    );
    return {
      width: clamp(averageWidth * 2.2, 0.6, 3.4),
      height: clamp(averageHeight * 2.4, 0.8, 4.0),
      depth: clamp(averageDepth * 2.1, 0.4, 3.2),
    };
  }
}

export class SketchVolumeBuilder {
  build(input: PreprocessedInput, metadata: ReconstructionMetadata): EditableObject3D {
    const width = clamp(input.silhouette.widthRatio * 2.2, 0.5, 3);
    const height = clamp(input.silhouette.heightRatio * 2.6, 0.8, 4);
    const depth = clamp(
      (input.silhouette.symmetry === 'strong' ? input.silhouette.widthRatio * 0.75 : input.silhouette.widthRatio * 0.55) * 2,
      0.35,
      2.2
    );
    return createObject3D({
      name: 'Sketch Proxy',
      mesh: createBoxMesh({ width, height, depth }),
      metadata,
    });
  }
}

export class SilhouetteToVolumeBuilder {
  build(input: PreprocessedInput, metadata: ReconstructionMetadata): EditableObject3D {
    const width = clamp(input.normalizedWidth * input.silhouette.widthRatio * 2, 0.5, 3);
    const height = clamp(input.normalizedHeight * input.silhouette.heightRatio * 2.4, 0.7, 3.8);
    const depth = clamp(width * 0.7, 0.35, 2.5);
    return createObject3D({
      name: 'Image Proxy',
      mesh: createBoxMesh({ width, height, depth }),
      metadata,
    });
  }
}

export class SingleViewProxyBuilder {
  constructor(
    private readonly sketchVolumeBuilder: SketchVolumeBuilder,
    private readonly silhouetteToVolumeBuilder: SilhouetteToVolumeBuilder
  ) {}

  build(params: {
    input: PreprocessedInput;
    metadata: ReconstructionMetadata;
  }): EditableObject3D {
    return params.input.sourceType === 'sketch'
      ? this.sketchVolumeBuilder.build(params.input, params.metadata)
      : this.silhouetteToVolumeBuilder.build(params.input, params.metadata);
  }
}

export class MultiViewReconstructor {
  constructor(private readonly depthEstimator: DepthEstimationModule) {}

  build(params: {
    inputs: PreprocessedInput[];
    metadata: ReconstructionMetadata;
    name: string;
  }): EditableObject3D {
    const size = this.depthEstimator.estimate(params.inputs);
    return createObject3D({
      name: params.name,
      mesh: createBoxMesh(size),
      metadata: {
        ...params.metadata,
        notes: [...params.metadata.notes, 'multi_view_proxy'],
      },
    });
  }
}

export class SurfaceFusionModule {
  fuse(meshes: EditableMesh[]): EditableMesh {
    if (meshes.length === 0) {
      return { vertices: [], faces: [] };
    }
    if (meshes.length === 1) {
      return compactMesh(meshes[0]!);
    }

    const combined: EditableMesh = meshes.reduce<EditableMesh>(
      (acc, mesh) => {
        const vertexOffset = acc.vertices.length;
        acc.vertices.push(...mesh.vertices.map((vertex) => ({ ...vertex })));
        acc.faces.push(
          ...mesh.faces.map(
            (face) =>
              [face[0] + vertexOffset, face[1] + vertexOffset, face[2] + vertexOffset] as [
                number,
                number,
                number,
              ]
          )
        );
        return acc;
      },
      { vertices: [], faces: [] }
    );
    combined.uvs = buildUvSeed(combined);
    return compactMesh(combined);
  }
}

export class PhotoGrammetryReconstructor {
  constructor(
    private readonly depthEstimator: DepthEstimationModule,
    private readonly fusion: SurfaceFusionModule
  ) {}

  reconstruct(params: {
    inputs: PreprocessedInput[];
    metadata: ReconstructionMetadata;
    templateObject?: EditableObject3D | null;
  }): EditableObject3D {
    const size = this.depthEstimator.estimate(params.inputs);
    const proxyMesh = createBoxMesh({
      width: size.width,
      height: size.height,
      depth: size.depth,
    });
    const fusedMesh = params.templateObject
      ? this.fusion.fuse([proxyMesh, params.templateObject.mesh])
      : proxyMesh;
    return createObject3D({
      name: 'Photogrammetry Proxy',
      mesh: fusedMesh,
      metadata: {
        ...params.metadata,
        notes: [...params.metadata.notes, 'photogrammetry_proxy'],
      },
    });
  }
}

export class VideoToFramesReconstructor {
  constructor(
    private readonly frameExtractor: FrameExtractorFromVideo,
    private readonly photoReconstructor: PhotoGrammetryReconstructor,
    private readonly imagePreprocessor: ImagePreprocessor
  ) {}

  reconstruct(reference: SourceReference, metadata: ReconstructionMetadata): EditableObject3D {
    const frames = this.frameExtractor.extractFrames(reference);
    const preprocessed = frames.map((frame) => this.imagePreprocessor.preprocess(frame));
    return this.photoReconstructor.reconstruct({
      inputs: preprocessed,
      metadata: {
        ...metadata,
        notes: [...metadata.notes, 'video_frames_reconstruction'],
        angularCoverage: 1,
      },
    });
  }
}

export class SceneReconstructionModule {
  reconstruct(params: {
    metadata: ReconstructionMetadata;
    quality: InputQualityReport;
  }): EditableScene3D {
    const floor = createSceneNode({
      name: 'Floor',
      kind: 'mesh',
      mesh: createBoxMesh({ width: 6.5, height: 0.08, depth: 6.5 }),
      transform: {
        position: { x: 0, y: 0, z: 0 },
        rotationEuler: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      metadata: { semanticRole: 'floor' },
    });
    const backWall = createSceneNode({
      name: 'Back Wall',
      kind: 'mesh',
      mesh: createBoxMesh({ width: 6.5, height: 2.9, depth: 0.08 }),
      transform: {
        position: { x: 0, y: 1.45, z: -3.2 },
        rotationEuler: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      metadata: { semanticRole: 'wall' },
    });
    const sideWall = createSceneNode({
      name: 'Side Wall',
      kind: 'mesh',
      mesh: createBoxMesh({ width: 0.08, height: 2.9, depth: 6.5 }),
      transform: {
        position: { x: -3.2, y: 1.45, z: 0 },
        rotationEuler: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      metadata: { semanticRole: 'wall' },
    });
    const roomRoot = createSceneNode({
      name: 'Scene Scan Root',
      kind: 'group',
      childIds: [floor.id, backWall.id, sideWall.id],
    });

    return {
      id: crypto.randomUUID(),
      name: 'Scene Scan Result',
      nodes: [roomRoot, floor, backWall, sideWall],
      rootNodeIds: [roomRoot.id],
      metadata: {
        ...params.metadata,
        notes: [...params.metadata.notes, `scene_quality_${params.quality.overall.toLowerCase()}`],
      },
    };
  }
}

export class Template3DGenerator {
  generate(suggestion: TemplateSuggestion, metadata: ReconstructionMetadata): EditableObject3D {
    const topology = generateTemplateMesh(mapIntentToTemplateType(suggestion.category), {});
    const editable = convertTopologyToEditableMesh(topology.mesh).editableMesh;
    return createObject3D({
      name: `${suggestion.category} Template`,
      mesh: editable,
      metadata: {
        ...metadata,
        templateType: suggestion.templateType,
        notes: [...metadata.notes, 'template_generated'],
      },
    });
  }
}

export class MeshCleanupSystem {
  cleanup(mesh: EditableMesh): EditableMesh {
    const validFaces = mesh.faces.filter((face) => {
      const unique = new Set(face);
      return unique.size === 3 && face.every((vertexIndex) => vertexIndex >= 0 && vertexIndex < mesh.vertices.length);
    });
    const cleaned = compactMesh({
      vertices: mesh.vertices.map((vertex) => ({ ...vertex })),
      faces: validFaces.map((face) => [...face] as [number, number, number]),
      uvs: mesh.uvs ? mesh.uvs.map((uv) => ({ ...uv })) : undefined,
    });
    return sanitizeEditableMesh({
      ...cleaned,
      uvs: cleaned.uvs ?? buildUvSeed(cleaned),
    });
  }
}

export class HoleFillSystem {
  fill(mesh: EditableMesh): EditableMesh {
    if (mesh.faces.length > 0) {
      return sanitizeEditableMesh(cloneMesh(mesh));
    }
    if (mesh.vertices.length < 3) {
      return sanitizeEditableMesh(cloneMesh(mesh));
    }
    const faces: EditableMesh['faces'] = [];
    for (let index = 1; index < mesh.vertices.length - 1; index += 1) {
      faces.push([0, index, index + 1]);
    }
    return sanitizeEditableMesh({
      vertices: mesh.vertices.map((vertex) => ({ ...vertex })),
      faces,
      uvs: buildUvSeed({
        vertices: mesh.vertices.map((vertex) => ({ ...vertex })),
        faces,
      }),
    });
  }
}

export class RemeshSystem {
  remesh(mesh: EditableMesh): EditableMesh {
    return sanitizeEditableMesh(cloneMesh(mesh));
  }
}

export class RetopoAssistSystem {
  prepareEditable(mesh: EditableMesh): EditableMesh {
    return sanitizeEditableMesh(cloneMesh(mesh));
  }
}

export class NormalCorrectionSystem {
  correct(mesh: EditableMesh): EditableMesh {
    return sanitizeEditableMesh(cloneMesh(mesh));
  }
}

export class UVSeedGenerator {
  generate(mesh: EditableMesh): EditableMesh {
    return sanitizeEditableMesh({
      ...cloneMesh(mesh),
      uvs: buildUvSeed(mesh),
    });
  }
}

export class MaterialSeedGenerator {
  generate(category: IntentCategory) {
    const palette = {
      human: ['skin_base', 'cloth_neutral'],
      animal: ['fur_base'],
      chair: ['wood_oak', 'fabric_dark'],
      table: ['wood_light'],
      bed: ['fabric_light', 'wood_dark'],
      vehicle: ['metal_painted', 'rubber'],
      mechanical_object: ['metal_raw'],
      furniture: ['wood_neutral'],
      architecture: ['plaster', 'concrete'],
      room_scene: ['wall_paint', 'floor_wood'],
      generic_object: ['default_surface'],
    } satisfies Record<IntentCategory, string[]>;
    return palette[category] ?? ['default_surface'];
  }
}

export class SceneCleanupSystem {
  cleanup(scene: EditableScene3D): EditableScene3D {
    const nodeIds = new Set(scene.nodes.map((node) => node.id));
    return {
      ...deepClone(scene),
      nodes: scene.nodes.map((node) => ({
        ...deepClone(node),
        childIds: node.childIds.filter((childId) => nodeIds.has(childId)),
      })),
      rootNodeIds: scene.rootNodeIds.filter((rootId) => nodeIds.has(rootId)),
    };
  }
}

class ConversionHistory {
  private historyBySession = new Map<
    string,
    {
      past: ConversionCommand[];
      future: ConversionCommand[];
    }
  >();

  private getState(sessionId: string) {
    const existing = this.historyBySession.get(sessionId);
    if (existing) return existing;
    const next = { past: [], future: [] };
    this.historyBySession.set(sessionId, next);
    return next;
  }

  push(command: ConversionCommand) {
    const state = this.getState(command.sessionId);
    state.past.push({
      ...command,
      before: cloneSession(command.before),
      after: cloneSession(command.after),
    });
    state.future = [];
  }

  undo(sessionId: string, current: ConversionSession) {
    const state = this.getState(sessionId);
    const command = state.past.pop();
    if (!command) return null;
    state.future.push({
      ...command,
      before: cloneSession(command.before),
      after: cloneSession(current),
    });
    return cloneSession(command.before);
  }

  redo(sessionId: string, current: ConversionSession) {
    const state = this.getState(sessionId);
    const command = state.future.pop();
    if (!command) return null;
    state.past.push({
      ...command,
      before: cloneSession(current),
      after: cloneSession(command.after),
    });
    return cloneSession(command.after);
  }
}

export class ReconstructionSessionSerializer {
  static serialize(session: ConversionSession) {
    return JSON.stringify(session);
  }

  static deserialize(payload: string) {
    return JSON.parse(payload) as ConversionSession;
  }
}

export class SketchSessionSerializer {
  static serialize(session: ConversionSession) {
    return JSON.stringify({
      id: session.id,
      mode: session.mode,
      name: session.name,
      inputs: session.inputs.filter((input) => input.type === 'sketch'),
    });
  }
}

export class EditableMeshSerializer {
  static serialize(mesh: EditableMesh) {
    return JSON.stringify(mesh);
  }
}

export class EditableSceneSerializer {
  static serialize(scene: EditableScene3D) {
    return JSON.stringify(scene);
  }
}

export class SourceReferenceSerializer {
  static serialize(reference: SourceReference) {
    return JSON.stringify(reference);
  }
}

export class ConversionPipelineSystem {
  readonly sketchInputSystem = new SketchInputSystem();
  readonly imageImportSystem = new ImageImportSystem();
  readonly multiViewInputManager = new MultiViewInputManager();
  readonly photoSetImportSystem = new PhotoSetImportSystem();
  readonly videoImportSystem = new VideoImportSystem();
  readonly scanSessionManager = new ScanSessionManager();
  readonly backgroundRemovalModule = new BackgroundRemovalModule();
  readonly silhouetteExtractor = new SilhouetteExtractor();
  readonly edgeExtractor = new EdgeExtractor();
  readonly featureDetector = new FeatureDetector();
  readonly sketchPreprocessor = new SketchPreprocessor(
    this.silhouetteExtractor,
    this.edgeExtractor,
    this.featureDetector
  );
  readonly imagePreprocessor = new ImagePreprocessor(
    this.backgroundRemovalModule,
    this.silhouetteExtractor,
    this.edgeExtractor,
    this.featureDetector
  );
  readonly frameExtractorFromVideo = new FrameExtractorFromVideo();
  readonly viewAlignmentHelper = new ViewAlignmentHelper();
  readonly inputQualityAnalyzer = new InputQualityAnalyzer();
  readonly shapeCategoryClassifier = new ShapeCategoryClassifier();
  readonly characterVsObjectDetector = new CharacterVsObjectDetector();
  readonly multiViewConsistencyAnalyzer = new MultiViewConsistencyAnalyzer();
  readonly semanticPartEstimator = new SemanticPartEstimator();
  readonly templateSuggestionEngine = new TemplateSuggestionEngine();
  readonly depthEstimationModule = new DepthEstimationModule();
  readonly sketchVolumeBuilder = new SketchVolumeBuilder();
  readonly silhouetteToVolumeBuilder = new SilhouetteToVolumeBuilder();
  readonly singleViewProxyBuilder = new SingleViewProxyBuilder(
    this.sketchVolumeBuilder,
    this.silhouetteToVolumeBuilder
  );
  readonly surfaceFusionModule = new SurfaceFusionModule();
  readonly multiViewReconstructor = new MultiViewReconstructor(this.depthEstimationModule);
  readonly photoGrammetryReconstructor = new PhotoGrammetryReconstructor(
    this.depthEstimationModule,
    this.surfaceFusionModule
  );
  readonly videoToFramesReconstructor = new VideoToFramesReconstructor(
    this.frameExtractorFromVideo,
    this.photoGrammetryReconstructor,
    this.imagePreprocessor
  );
  readonly sceneReconstructionModule = new SceneReconstructionModule();
  readonly template3DGenerator = new Template3DGenerator();
  readonly meshCleanupSystem = new MeshCleanupSystem();
  readonly holeFillSystem = new HoleFillSystem();
  readonly remeshSystem = new RemeshSystem();
  readonly retopoAssistSystem = new RetopoAssistSystem();
  readonly normalCorrectionSystem = new NormalCorrectionSystem();
  readonly uvSeedGenerator = new UVSeedGenerator();
  readonly materialSeedGenerator = new MaterialSeedGenerator();
  readonly sceneCleanupSystem = new SceneCleanupSystem();

  readonly sessions = new Map<string, ConversionSession>();
  activeSessionId: string | null = null;

  private readonly history = new ConversionHistory();

  constructor(private readonly adapter: ConversionEngineAdapter = {}) {}

  InitializeConversionSystem() {
    return {
      sessionCount: this.sessions.size,
      activeSessionId: this.activeSessionId,
    };
  }

  private createSession(params: {
    mode: ConversionMode;
    name: string;
    inputs: SourceReference[];
  }) {
    const session: ConversionSession = {
      id: crypto.randomUUID(),
      mode: params.mode,
      target: inferTargetFromMode(params.mode),
      status: 'draft',
      name: params.name,
      inputs: deepClone(params.inputs),
      preprocessedInputs: [],
      quality: null,
      alignment: null,
      hypotheses: [],
      templateSuggestion: null,
      preview: null,
      acceptedResult: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.sessions.set(session.id, session);
    this.activeSessionId = session.id;
    return cloneSession(session);
  }

  private resolveSession(sessionId?: string) {
    const resolvedId = sessionId ?? this.activeSessionId;
    if (!resolvedId) {
      throw new Error('No hay una sesion de conversion activa.');
    }
    const session = this.sessions.get(resolvedId);
    if (!session) {
      throw new Error(`No existe la sesion de conversion ${resolvedId}.`);
    }
    return session;
  }

  private commitSessionChange(sessionId: string, label: string, mutate: (draft: ConversionSession) => void) {
    const current = this.resolveSession(sessionId);
    const before = cloneSession(current);
    const draft = cloneSession(current);
    mutate(draft);
    draft.updatedAt = nowIso();
    this.sessions.set(sessionId, draft);
    this.history.push({
      id: crypto.randomUUID(),
      label,
      sessionId,
      before,
      after: cloneSession(draft),
    });
    return cloneSession(draft);
  }

  private preprocessSession(sessionId?: string) {
    const session = this.resolveSession(sessionId);
    return this.commitSessionChange(session.id, 'preprocess', (draft) => {
      draft.preprocessedInputs = draft.inputs.map((input) =>
        input.type === 'sketch'
          ? this.sketchPreprocessor.preprocess(input)
          : this.imagePreprocessor.preprocess(input)
      );
      draft.alignment =
        draft.inputs.length > 1
          ? this.viewAlignmentHelper.align(draft.inputs, draft.preprocessedInputs)
          : {
              alignedViewLabels: Object.fromEntries(
                draft.inputs.map((input) => [input.id, normalizeViewLabel(input.viewLabel)])
              ),
              coverageScore: clamp(draft.inputs.length / 4, 0.25, 1),
              consistencyScore: 1,
            };
      draft.status = 'preprocessed';
    });
  }

  private buildMetadata(session: ConversionSession, notes: string[]): ReconstructionMetadata {
    return {
      pipeline: session.mode,
      sourceInputIds: session.inputs.map((input) => input.id),
      qualityLevel: session.quality?.overall ?? 'Medium',
      confidence: session.hypotheses[0]?.confidence ?? session.quality?.score ?? 0.5,
      notes,
      templateType: session.templateSuggestion?.templateType ?? null,
      blockoutOnly: session.quality?.preferredResult === 'blockout',
      angularCoverage: session.quality?.angularCoverage,
    };
  }

  private ensureQualityAndIntent(sessionId?: string) {
    const preprocessed = this.preprocessSession(sessionId);
    const withQuality = this.AnalyzeInputQuality(preprocessed.id);
    const withIntent = this.ClassifyIntent(withQuality.id);
    return this.SuggestTemplate(withIntent.id);
  }

  private highestHypothesis(session: ConversionSession) {
    return session.hypotheses[0] ?? {
      category: 'generic_object' as const,
      target: session.target,
      confidence: session.quality?.score ?? 0.5,
      reason: 'Fallback generico.',
      semanticParts: ['main_volume'],
    };
  }

  private setPreview(sessionId: string, preview: ConversionPreview) {
    return this.commitSessionChange(sessionId, 'set_preview', (draft) => {
      draft.preview = deepClone(preview);
      draft.status = 'preview_ready';
    });
  }

  CreateSketchSession(params: {
    name?: string;
    sketches: Array<{
      label: string;
      viewLabel?: ViewLabel;
      strokes: SourceReference['strokes'];
      width?: number;
      height?: number;
      tags?: string[];
    }>;
  }) {
    const inputs = this.sketchInputSystem.CreateSketchSession({
      name: params.name,
      sketches: params.sketches,
    });
    return this.createSession({
      mode: inputs.length > 1 ? 'Sketch2DTo3D_MultiView' : 'Sketch2DTo3D_SingleView',
      name: params.name ?? 'Sketch Conversion',
      inputs,
    });
  }

  ImportSingleImage(params: {
    label: string;
    path?: string;
    width?: number;
    height?: number;
    tags?: string[];
    backgroundComplexity?: number;
    sharpnessEstimate?: number;
  }) {
    const input = this.imageImportSystem.ImportSingleImage(params);
    return this.createSession({
      mode: 'ImageTo3D_SingleImage',
      name: params.label,
      inputs: [input],
    });
  }

  ImportMultiViewImages(params: {
    label?: string;
    images: Array<{
      label: string;
      path?: string;
      viewLabel?: ViewLabel;
      width?: number;
      height?: number;
      tags?: string[];
      backgroundComplexity?: number;
      sharpnessEstimate?: number;
      coverageAngleDegrees?: number;
    }>;
  }) {
    const inputs = this.multiViewInputManager.ImportMultiViewImages(params);
    return this.createSession({
      mode: 'ImageTo3D_MultiView',
      name: params.label ?? 'Multi View Conversion',
      inputs,
    });
  }

  ImportPhotoSet(params: {
    label: string;
    photos: Array<{
      path?: string;
      viewLabel?: ViewLabel;
      width?: number;
      height?: number;
      tags?: string[];
      backgroundComplexity?: number;
      sharpnessEstimate?: number;
      coverageAngleDegrees?: number;
    }>;
  }) {
    return this.createSession({
      mode: 'PhotoScanTo3D_Object',
      name: params.label,
      inputs: this.photoSetImportSystem.ImportPhotoSet(params),
    });
  }

  ImportVideoForReconstruction(params: {
    label: string;
    path?: string;
    durationSeconds?: number;
    width?: number;
    height?: number;
    tags?: string[];
    sharpnessEstimate?: number;
  }) {
    return this.createSession({
      mode: 'VideoScanTo3D_Object',
      name: params.label,
      inputs: [this.videoImportSystem.ImportVideoForReconstruction(params)],
    });
  }

  StartSceneScanSession(params: {
    label: string;
    captures: Array<{
      type?: 'photo' | 'image';
      path?: string;
      viewLabel?: ViewLabel;
      width?: number;
      height?: number;
      sharpnessEstimate?: number;
      backgroundComplexity?: number;
      tags?: string[];
    }>;
  }) {
    return this.createSession({
      mode: 'SceneScanTo3D_Environment',
      name: params.label,
      inputs: this.scanSessionManager.StartSceneScanSession(params),
    });
  }

  PreprocessSketch(sessionId?: string) {
    return this.preprocessSession(sessionId);
  }

  PreprocessImage(sessionId?: string) {
    return this.preprocessSession(sessionId);
  }

  ExtractSilhouette(sourceId: string, sessionId?: string) {
    const session = this.resolveSession(sessionId);
    const source = session.inputs.find((input) => input.id === sourceId);
    return source ? this.silhouetteExtractor.extract(source) : null;
  }

  ExtractKeyFeatures(sourceId: string, sessionId?: string) {
    const session = this.resolveSession(sessionId);
    const source = session.inputs.find((input) => input.id === sourceId);
    return source ? this.featureDetector.extract(source) : [];
  }

  AnalyzeInputQuality(sessionId?: string) {
    const session = this.resolveSession(sessionId);
    const ensured =
      session.preprocessedInputs.length > 0
        ? session
        : this.resolveSession(this.preprocessSession(session.id).id);
    return this.commitSessionChange(ensured.id, 'analyze_quality', (draft) => {
      draft.quality = this.inputQualityAnalyzer.analyze({
        mode: draft.mode,
        inputs: draft.inputs,
        preprocessedInputs: draft.preprocessedInputs,
        alignment: draft.alignment,
      });
    });
  }

  ClassifyIntent(sessionId?: string) {
    const session = this.resolveSession(sessionId);
    const ensured = session.quality ? session : this.resolveSession(this.AnalyzeInputQuality(session.id).id);
    return this.commitSessionChange(ensured.id, 'classify_intent', (draft) => {
      const rawHypotheses = this.shapeCategoryClassifier.classify(draft.inputs, draft.quality);
      draft.hypotheses = rawHypotheses.map((hypothesis) => ({
        ...hypothesis,
        semanticParts: this.semanticPartEstimator.estimate(hypothesis.category),
        target: this.characterVsObjectDetector.resolveTarget(rawHypotheses, draft.target),
      }));
      draft.target = this.characterVsObjectDetector.resolveTarget(draft.hypotheses, draft.target);
    });
  }

  SuggestTemplate(sessionId?: string) {
    const session = this.resolveSession(sessionId);
    const ensured = session.hypotheses.length > 0 ? session : this.resolveSession(this.ClassifyIntent(session.id).id);
    return this.commitSessionChange(ensured.id, 'suggest_template', (draft) => {
      draft.templateSuggestion = this.templateSuggestionEngine.suggest(draft.hypotheses, draft.quality);
    });
  }

  BuildSingleViewProxy(sessionId?: string) {
    const session = this.resolveSession(this.ensureQualityAndIntent(sessionId).id);
    const primaryInput = session.preprocessedInputs[0];
    if (!primaryInput) {
      throw new Error('La sesion no tiene input preprocesado para single view.');
    }
    const object = this.singleViewProxyBuilder.build({
      input: primaryInput,
      metadata: this.buildMetadata(session, ['single_view_proxy']),
    });
    const preview: ConversionPreview = {
      id: crypto.randomUUID(),
      kind: 'object',
      summary: `Preview single-view ${session.quality?.preferredResult ?? 'editable_mesh'} con confianza ${session.quality?.overall ?? 'Medium'}.`,
      quality: deepClone(session.quality!),
      hypotheses: deepClone(session.hypotheses),
      object,
    };
    return this.setPreview(session.id, preview);
  }

  BuildMultiViewProxy(sessionId?: string) {
    const session = this.resolveSession(this.ensureQualityAndIntent(sessionId).id);
    const consistency = this.multiViewConsistencyAnalyzer.analyze(session.alignment, session.quality);
    const metadata = this.buildMetadata(session, [
      'multi_view_proxy',
      ...consistency.issues,
    ]);
    const object = this.multiViewReconstructor.build({
      inputs: session.preprocessedInputs,
      metadata,
      name: 'Multi View Proxy',
    });
    const preview: ConversionPreview = {
      id: crypto.randomUUID(),
      kind: 'object',
      summary: `Preview multi-view con consistencia ${Math.round(consistency.score * 100)}%.`,
      quality: deepClone(session.quality!),
      hypotheses: deepClone(session.hypotheses),
      object,
    };
    return this.setPreview(session.id, preview);
  }

  ReconstructFromPhotoSet(sessionId?: string) {
    const session = this.resolveSession(this.ensureQualityAndIntent(sessionId).id);
    const templateObject = session.templateSuggestion
      ? this.template3DGenerator.generate(
          session.templateSuggestion,
          this.buildMetadata(session, ['template_seed_for_photogrammetry'])
        )
      : null;
    const object = this.photoGrammetryReconstructor.reconstruct({
      inputs: session.preprocessedInputs,
      metadata: this.buildMetadata(session, ['photo_scan_reconstruction']),
      templateObject,
    });
    const preview: ConversionPreview = {
      id: crypto.randomUUID(),
      kind: 'object',
      summary: `Reconstruccion desde fotos con calidad ${session.quality?.overall ?? 'Medium'}.`,
      quality: deepClone(session.quality!),
      hypotheses: deepClone(session.hypotheses),
      object,
    };
    return this.setPreview(session.id, preview);
  }

  ReconstructFromVideoFrames(sessionId?: string) {
    const session = this.resolveSession(this.ensureQualityAndIntent(sessionId).id);
    const video = session.inputs.find((input) => input.type === 'video');
    if (!video) {
      throw new Error('La sesion no contiene un video.');
    }
    const object = this.videoToFramesReconstructor.reconstruct(
      video,
      this.buildMetadata(session, ['video_scan_reconstruction'])
    );
    const preview: ConversionPreview = {
      id: crypto.randomUUID(),
      kind: 'object',
      summary: `Reconstruccion desde video con ${session.quality?.overall ?? 'Medium'} de confianza base.`,
      quality: deepClone(session.quality!),
      hypotheses: deepClone(session.hypotheses),
      object,
    };
    return this.setPreview(session.id, preview);
  }

  ReconstructSceneFromCaptures(sessionId?: string) {
    const session = this.resolveSession(this.ensureQualityAndIntent(sessionId).id);
    const sceneResult = this.sceneReconstructionModule.reconstruct({
      metadata: this.buildMetadata(session, ['scene_scan_reconstruction']),
      quality: session.quality!,
    });
    const preview: ConversionPreview = {
      id: crypto.randomUUID(),
      kind: 'scene',
      summary: `Escaneo de escena base editable con calidad ${session.quality?.overall ?? 'Medium'}.`,
      quality: deepClone(session.quality!),
      hypotheses: deepClone(session.hypotheses),
      scene: sceneResult,
    };
    return this.setPreview(session.id, preview);
  }

  GenerateTemplateFromIntent(sessionId?: string) {
    const session = this.resolveSession(this.ensureQualityAndIntent(sessionId).id);
    if (!session.templateSuggestion) {
      return null;
    }
    return this.template3DGenerator.generate(
      session.templateSuggestion,
      this.buildMetadata(session, ['template_from_intent'])
    );
  }

  FuseReconstructionWithTemplate(sessionId?: string) {
    const session = this.resolveSession(this.ensureQualityAndIntent(sessionId).id);
    const templateObject = this.GenerateTemplateFromIntent(session.id);
    const previewObject = session.preview?.object;
    if (!templateObject || !previewObject) {
      return cloneSession(session);
    }
    const fusedMesh = this.surfaceFusionModule.fuse([previewObject.mesh, templateObject.mesh]);
    const fusedObject = createObject3D({
      name: `${previewObject.name} Assisted`,
      mesh: fusedMesh,
      metadata: {
        ...previewObject.metadata,
        templateType: session.templateSuggestion?.templateType ?? previewObject.metadata.templateType,
        notes: [...previewObject.metadata.notes, 'template_fused'],
      },
      transform: previewObject.transform,
    });
    const preview: ConversionPreview = {
      id: crypto.randomUUID(),
      kind: 'object',
      summary: `${session.preview?.summary ?? 'Preview'} con soporte parametrico fusionado.`,
      quality: deepClone(session.quality!),
      hypotheses: deepClone(session.hypotheses),
      object: fusedObject,
    };
    return this.setPreview(session.id, preview);
  }

  CleanupGeneratedMesh(mesh: EditableMesh) {
    return this.meshCleanupSystem.cleanup(mesh);
  }

  FillHolesIfSafe(mesh: EditableMesh) {
    return this.holeFillSystem.fill(mesh);
  }

  ConvertToEditableMesh(sessionId?: string) {
    const session = this.resolveSession(sessionId);
    const object = session.acceptedResult?.object ?? session.preview?.object;
    if (!object) {
      return null;
    }
    const corrected = this.normalCorrectionSystem.correct(object.mesh);
    const cleaned = this.meshCleanupSystem.cleanup(corrected);
    const holesFilled = this.holeFillSystem.fill(cleaned);
    const retopoReady = this.retopoAssistSystem.prepareEditable(holesFilled);
    return this.uvSeedGenerator.generate(this.remeshSystem.remesh(retopoReady));
  }

  ConvertToEditableScene(sessionId?: string) {
    const session = this.resolveSession(sessionId);
    const acceptedScene = session.acceptedResult?.scene ?? session.preview?.scene;
    if (acceptedScene) {
      return this.sceneCleanupSystem.cleanup(acceptedScene);
    }
    const object = session.acceptedResult?.object ?? session.preview?.object;
    return object ? sceneFromObject(object) : null;
  }

  GeneratePreview(sessionId?: string) {
    const session = this.resolveSession(sessionId);
    switch (session.mode) {
      case 'Sketch2DTo3D_SingleView':
      case 'ImageTo3D_SingleImage': {
        const previewReady = this.BuildSingleViewProxy(session.id);
        const ready = this.resolveSession(previewReady.id);
        return ready.templateSuggestion && ready.quality?.templateRecommended
          ? this.FuseReconstructionWithTemplate(ready.id)
          : previewReady;
      }
      case 'Sketch2DTo3D_MultiView':
      case 'ImageTo3D_MultiView': {
        const previewReady = this.BuildMultiViewProxy(session.id);
        const ready = this.resolveSession(previewReady.id);
        return ready.templateSuggestion && ready.quality?.templateRecommended
          ? this.FuseReconstructionWithTemplate(ready.id)
          : previewReady;
      }
      case 'PhotoScanTo3D_Object':
        return this.ReconstructFromPhotoSet(session.id);
      case 'VideoScanTo3D_Object':
        return this.ReconstructFromVideoFrames(session.id);
      case 'SceneScanTo3D_Environment':
        return this.ReconstructSceneFromCaptures(session.id);
      default:
        return cloneSession(session);
    }
  }

  async AcceptConversion(sessionId?: string) {
    const session = this.resolveSession(sessionId);
    const ensured = session.preview ? session : this.resolveSession(this.GeneratePreview(session.id).id);
    const preview = ensured.preview;
    if (!preview) {
      throw new Error('No existe preview para aceptar.');
    }

    const acceptedResult =
      preview.kind === 'scene'
        ? {
            kind: 'scene' as const,
            metadata: deepClone(preview.scene?.metadata ?? this.buildMetadata(ensured, ['accepted_scene'])),
            scene: preview.scene ? this.sceneCleanupSystem.cleanup(preview.scene) : undefined,
          }
        : {
            kind: 'object' as const,
            metadata: deepClone(preview.object?.metadata ?? this.buildMetadata(ensured, ['accepted_object'])),
            object: preview.object
              ? {
                  ...preview.object,
                  mesh: this.ConvertToEditableMesh(ensured.id) ?? preview.object.mesh,
                }
              : undefined,
          };

    const committed = this.commitSessionChange(ensured.id, 'accept_conversion', (draft) => {
      draft.acceptedResult = deepClone(acceptedResult);
      draft.status = 'accepted';
    });

    if (acceptedResult.kind === 'object' && acceptedResult.object) {
      await this.adapter.commitEditableObject?.(acceptedResult.object);
      this.adapter.showMessage?.(`Conversion aceptada: ${acceptedResult.object.name}.`);
    }
    if (acceptedResult.kind === 'scene' && acceptedResult.scene) {
      await this.adapter.commitEditableScene?.(acceptedResult.scene);
      this.adapter.showMessage?.(`Escaneo de escena aceptado: ${acceptedResult.scene.name}.`);
    }
    return committed;
  }

  RejectConversion(sessionId?: string) {
    const session = this.resolveSession(sessionId);
    return this.commitSessionChange(session.id, 'reject_conversion', (draft) => {
      draft.preview = null;
      draft.acceptedResult = null;
      draft.status = 'rejected';
    });
  }

  async SaveConversionSession(sessionId?: string) {
    const session = this.resolveSession(sessionId);
    const serialized = ReconstructionSessionSerializer.serialize(session);
    await this.adapter.saveSession?.(session.id, serialized);
    this.adapter.showMessage?.(`Sesion de conversion guardada: ${session.name}.`);
    return serialized;
  }

  undo(sessionId?: string) {
    const session = this.resolveSession(sessionId);
    const previous = this.history.undo(session.id, session);
    if (!previous) return null;
    previous.updatedAt = nowIso();
    this.sessions.set(session.id, previous);
    return cloneSession(previous);
  }

  redo(sessionId?: string) {
    const session = this.resolveSession(sessionId);
    const next = this.history.redo(session.id, session);
    if (!next) return null;
    next.updatedAt = nowIso();
    this.sessions.set(session.id, next);
    return cloneSession(next);
  }

  snapshot(sessionId?: string) {
    return cloneSession(this.resolveSession(sessionId));
  }

  getMaterialSeeds(sessionId?: string) {
    const session = this.resolveSession(this.ensureQualityAndIntent(sessionId).id);
    return this.materialSeedGenerator.generate(this.highestHypothesis(session).category);
  }
}

export function InitializeConversionSystem(adapter?: ConversionEngineAdapter) {
  return new ConversionPipelineSystem(adapter);
}
