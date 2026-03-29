import { MODULAR_PART_CATALOG, MODULAR_PART_DEFINITION_MAP } from './catalog';
import type {
  BoundsLike,
  MeshNodeRecord,
  ModelAnalysisSummary,
  ModularCompatibilityIssue,
  ModularCompatibilityReport,
  ModularConnectionPoint,
  ModularExportProfile,
  ModularPartType,
  PartAssignmentDraft,
  Vec3Like,
} from './types';
import { slugifyModularName } from './shared';

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function combineBounds(nodes: MeshNodeRecord[]): BoundsLike {
  const min = {
    x: Math.min(...nodes.map((node) => node.boundingBox.min.x)),
    y: Math.min(...nodes.map((node) => node.boundingBox.min.y)),
    z: Math.min(...nodes.map((node) => node.boundingBox.min.z)),
  };
  const max = {
    x: Math.max(...nodes.map((node) => node.boundingBox.max.x)),
    y: Math.max(...nodes.map((node) => node.boundingBox.max.y)),
    z: Math.max(...nodes.map((node) => node.boundingBox.max.z)),
  };
  const size = {
    x: max.x - min.x,
    y: max.y - min.y,
    z: max.z - min.z,
  };
  const center = {
    x: min.x + size.x / 2,
    y: min.y + size.y / 2,
    z: min.z + size.z / 2,
  };

  return { min, max, size, center };
}

function buildConnectionPoints(partType: ModularPartType, bounds: BoundsLike): ModularConnectionPoint[] {
  const definition = MODULAR_PART_DEFINITION_MAP.get(partType);
  if (!definition) return [];

  const center = bounds.center;
  const min = bounds.min;
  const max = bounds.max;

  const pointForSocket = (): Vec3Like => {
    if (definition.parentSocketId === 'root') return center;
    if (definition.socketId.includes('head') || definition.parentSocketId.includes('neck')) {
      return { x: center.x, y: min.y, z: center.z };
    }
    if (definition.socketId.includes('shoulder')) {
      return { x: center.x, y: max.y, z: center.z };
    }
    if (definition.socketId.includes('elbow') || definition.socketId.includes('wrist')) {
      return { x: center.x, y: center.y, z: center.z };
    }
    if (definition.socketId.includes('hip') || definition.socketId.includes('pelvis')) {
      return { x: center.x, y: max.y, z: center.z };
    }
    if (definition.socketId.includes('knee') || definition.socketId.includes('ankle')) {
      return { x: center.x, y: min.y, z: center.z };
    }
    return center;
  };

  return [
    {
      id: definition.socketId,
      label: definition.label,
      targetPartType: definition.parentSocketId === 'root' ? 'root' : partType,
      position: pointForSocket(),
      orientation: { x: 0, y: 0, z: 1 },
    },
  ];
}

function normalizeName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ');
}

function computeNameScore(partType: ModularPartType, node: MeshNodeRecord): number {
  const definition = MODULAR_PART_DEFINITION_MAP.get(partType);
  if (!definition) return 0;

  const haystack = normalizeName(`${node.name} ${node.path} ${node.boneNames.join(' ')}`);
  return definition.aliases.reduce((score, alias) => {
    const token = normalizeName(alias);
    return haystack.includes(token) ? score + 3 : score;
  }, 0);
}

function computeSpatialScore(
  partType: ModularPartType,
  node: MeshNodeRecord,
  overallBounds: BoundsLike
): number {
  const center = node.boundingBox.center;
  const relativeY =
    overallBounds.size.y > 0
      ? (center.y - overallBounds.min.y) / overallBounds.size.y
      : 0;
  const relativeX =
    overallBounds.size.x > 0
      ? (center.x - overallBounds.center.x) / overallBounds.size.x
      : 0;

  switch (partType) {
    case 'head':
    case 'hair':
    case 'helmet':
    case 'glasses':
      return relativeY > 0.72 ? 2 : 0;
    case 'neck':
      return relativeY > 0.62 && relativeY <= 0.78 ? 1.5 : 0;
    case 'torso':
    case 'upper_clothing':
    case 'shoulder_pads':
      return relativeY > 0.4 && relativeY <= 0.72 ? 1.5 : 0;
    case 'pelvis':
    case 'lower_clothing':
      return relativeY > 0.24 && relativeY <= 0.48 ? 1.5 : 0;
    case 'left_arm':
    case 'left_forearm':
    case 'left_hand':
      return relativeX < -0.08 ? 1.25 : 0;
    case 'right_arm':
    case 'right_forearm':
    case 'right_hand':
      return relativeX > 0.08 ? 1.25 : 0;
    case 'left_leg':
    case 'left_calf':
    case 'left_foot':
      return relativeX < -0.03 && relativeY <= 0.42 ? 1.25 : 0;
    case 'right_leg':
    case 'right_calf':
    case 'right_foot':
      return relativeX > 0.03 && relativeY <= 0.42 ? 1.25 : 0;
    case 'gloves':
      return Math.abs(relativeX) > 0.1 && relativeY > 0.18 && relativeY < 0.54 ? 1 : 0;
    case 'boots':
      return relativeY < 0.14 ? 1.25 : 0;
    case 'accessory':
      return 0.4;
    default:
      return 0;
  }
}

function rankPartType(node: MeshNodeRecord, analysis: ModelAnalysisSummary) {
  const ranked = MODULAR_PART_CATALOG.map((definition) => {
    const nameScore = computeNameScore(definition.type, node);
    const spatialScore = computeSpatialScore(definition.type, node, analysis.boundingBox);
    const rigBonus = definition.boneHints.some((hint) =>
      node.boneNames.some((boneName) => boneName.toLowerCase().includes(hint.toLowerCase()))
    )
      ? 2
      : 0;

    return {
      partType: definition.type,
      score: nameScore + spatialScore + rigBonus,
    };
  }).sort((left, right) => right.score - left.score);

  return ranked[0] ?? null;
}

export function buildCompatibilityReport(params: {
  partType: ModularPartType;
  analysis: ModelAnalysisSummary;
  nodes: MeshNodeRecord[];
  exportProfile: ModularExportProfile;
}): ModularCompatibilityReport {
  const definition = MODULAR_PART_DEFINITION_MAP.get(params.partType);
  const issues: ModularCompatibilityIssue[] = [];
  const bounds = combineBounds(params.nodes);
  const hasRig = params.nodes.some((node) => node.hasRig);
  const hasZeroScale = bounds.size.x <= 0 || bounds.size.y <= 0 || bounds.size.z <= 0;

  if (hasZeroScale) {
    issues.push({
      code: 'empty_bounds',
      severity: 'error',
      message: 'La parte no tiene bounding box valida para ensamblaje.',
    });
  }

  if (params.exportProfile === 'rigged-modular' && !hasRig) {
    issues.push({
      code: 'missing_rig',
      severity: 'warn',
      message: 'La pieza se exportara sin rig aunque el perfil pide modular rigged.',
    });
  }

  if (definition?.required && params.nodes.length === 0) {
    issues.push({
      code: 'required_part_missing',
      severity: 'error',
      message: `Falta asignacion para la parte requerida ${definition.label}.`,
    });
  }

  const averageMaterialCount = average(
    params.analysis.meshes.map((mesh) => Math.max(mesh.materialNames.length, 1))
  );
  const currentMaterialCount = average(
    params.nodes.map((mesh) => Math.max(mesh.materialNames.length, 1))
  );
  if (currentMaterialCount > averageMaterialCount * 2.5) {
    issues.push({
      code: 'high_material_variance',
      severity: 'info',
      message: 'La pieza tiene mas materiales que el promedio; revisa draw calls antes de Unity.',
    });
  }

  return {
    ok: !issues.some((issue) => issue.severity === 'error'),
    issues,
  };
}

export function buildAssignmentDraft(params: {
  partType: ModularPartType;
  analysis: ModelAnalysisSummary;
  nodes: MeshNodeRecord[];
  confidence: number;
  mode: 'auto' | 'manual';
  exportProfile?: ModularExportProfile;
}): PartAssignmentDraft {
  const definition = MODULAR_PART_DEFINITION_MAP.get(params.partType);
  const bounds = combineBounds(params.nodes);
  const partSlug = slugifyModularName(`${params.partType}_${definition?.label || params.partType}`);
  const materialNames = [...new Set(params.nodes.flatMap((node) => node.materialNames))];
  const textureNames = [...new Set(params.nodes.flatMap((node) => node.textureNames))];
  const boneNames = [...new Set(params.nodes.flatMap((node) => node.boneNames))];
  const compatibility = buildCompatibilityReport({
    partType: params.partType,
    analysis: params.analysis,
    nodes: params.nodes,
    exportProfile: params.exportProfile ?? 'unity-ready',
  });

  return {
    id: `${params.partType}_${partSlug}`,
    partType: params.partType,
    label: definition?.label || params.partType,
    mode: params.mode,
    nodePaths: params.nodes.map((node) => node.path),
    sourceMeshNames: params.nodes.map((node) => node.name),
    confidence: params.confidence,
    notes: params.mode === 'auto' ? 'Asignacion sugerida por heuristicas.' : 'Asignacion manual.',
    boundingBox: bounds,
    pivot: bounds.center,
    materialNames,
    textureNames,
    boneNames,
    hasRig: params.nodes.some((node) => node.hasRig),
    connectionPoints: buildConnectionPoints(params.partType, bounds),
    compatibility,
    exportFileName: `${partSlug}.glb`,
  };
}

export function suggestPartAssignments(
  analysis: ModelAnalysisSummary,
  exportProfile: ModularExportProfile = 'unity-ready'
): PartAssignmentDraft[] {
  const grouped = new Map<ModularPartType, MeshNodeRecord[]>();
  const scored = new Map<ModularPartType, number[]>();

  for (const node of analysis.meshes) {
    const ranking = rankPartType(node, analysis);
    if (!ranking || ranking.score <= 0.6) continue;

    const existingNodes = grouped.get(ranking.partType) ?? [];
    existingNodes.push(node);
    grouped.set(ranking.partType, existingNodes);

    const existingScores = scored.get(ranking.partType) ?? [];
    existingScores.push(ranking.score);
    scored.set(ranking.partType, existingScores);
  }

  return [...grouped.entries()]
    .map(([partType, nodes]) =>
      buildAssignmentDraft({
        partType,
        analysis,
        nodes,
        confidence: Math.min(1, average(scored.get(partType) ?? [1]) / 5),
        mode: 'auto',
        exportProfile,
      })
    )
    .sort((left, right) => left.label.localeCompare(right.label));
}
