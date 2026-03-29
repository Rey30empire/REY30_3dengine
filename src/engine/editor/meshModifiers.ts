import {
  arrayMesh,
  buildEditableMeshSignature,
  decimateMesh,
  listMeshEdges,
  mirrorMeshX,
  remeshMeshUniform,
  solidifyMesh,
  type ArrayMeshOptions,
  type EditableMesh,
} from './modelerMesh';

export type MeshModifierType =
  | 'mirror_x'
  | 'solidify'
  | 'array'
  | 'remesh'
  | 'decimate';

interface MeshModifierBase {
  id: string;
  type: MeshModifierType;
  enabled: boolean;
  label?: string;
}

export interface MirrorMeshModifier extends MeshModifierBase {
  type: 'mirror_x';
}

export interface SolidifyMeshModifier extends MeshModifierBase {
  type: 'solidify';
  thickness: number;
}

export interface ArrayMeshModifier extends MeshModifierBase {
  type: 'array';
  count: number;
  mode: 'linear' | 'radial';
  offset?: { x: number; y: number; z: number };
  axis?: 'x' | 'y' | 'z';
  radius?: number;
  angle?: number;
  rotateInstances?: boolean;
}

export interface RemeshMeshModifier extends MeshModifierBase {
  type: 'remesh';
  iterations: number;
  relaxStrength?: number;
}

export interface DecimateMeshModifier extends MeshModifierBase {
  type: 'decimate';
  ratio: number;
}

export type MeshModifier =
  | MirrorMeshModifier
  | SolidifyMeshModifier
  | ArrayMeshModifier
  | RemeshMeshModifier
  | DecimateMeshModifier;

export interface MeshModifierStackDocument {
  version: 1;
  name?: string;
  description?: string;
  exportedAt?: string;
  modifiers: MeshModifier[];
}

export interface MeshModifierPresetDefinition {
  id: string;
  name: string;
  description?: string;
  modifiers: MeshModifier[];
}

export interface MeshModifierPresetLibraryDocument {
  version: 1;
  name?: string;
  exportedAt?: string;
  presets: MeshModifierPresetDefinition[];
}

export interface MeshModifierPreviewMetrics {
  baseVertices: number;
  vertices: number;
  deltaVertices: number;
  baseFaces: number;
  faces: number;
  deltaFaces: number;
  baseEdges: number;
  edges: number;
  deltaEdges: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

function clamp(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function readVector3(value: unknown, fallback: { x: number; y: number; z: number }) {
  const record = asRecord(value);
  return {
    x: clamp(Number(record?.x), -1000, 1000, fallback.x),
    y: clamp(Number(record?.y), -1000, 1000, fallback.y),
    z: clamp(Number(record?.z), -1000, 1000, fallback.z),
  };
}

function generateModifierId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function generatePresetId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `modifier_preset_${crypto.randomUUID()}`;
  }
  return `modifier_preset_${Math.random().toString(36).slice(2, 10)}`;
}

function getModifierPrefix(type: MeshModifierType) {
  switch (type) {
    case 'mirror_x':
      return 'mirror';
    case 'solidify':
      return 'solidify';
    case 'array':
      return 'array';
    case 'remesh':
      return 'remesh';
    case 'decimate':
      return 'decimate';
    default:
      return 'modifier';
  }
}

function getModifierDefaultLabel(type: MeshModifierType) {
  switch (type) {
    case 'mirror_x':
      return 'Mirror X';
    case 'solidify':
      return 'Solidify';
    case 'array':
      return 'Array';
    case 'remesh':
      return 'Remesh';
    case 'decimate':
      return 'Decimate';
    default:
      return 'Modifier';
  }
}

export function createMirrorModifier(): MirrorMeshModifier {
  return {
    id: generateModifierId('mirror'),
    type: 'mirror_x',
    enabled: true,
    label: 'Mirror X',
  };
}

export function createSolidifyModifier(thickness = 0.12): SolidifyMeshModifier {
  return {
    id: generateModifierId('solidify'),
    type: 'solidify',
    enabled: true,
    label: 'Solidify',
    thickness: clamp(thickness, 0.001, 10, 0.12),
  };
}

export function createArrayModifier(input?: {
  count?: number;
  mode?: 'linear' | 'radial';
  offset?: { x: number; y: number; z: number };
  axis?: 'x' | 'y' | 'z';
  radius?: number;
  angle?: number;
  rotateInstances?: boolean;
}): ArrayMeshModifier {
  return {
    id: generateModifierId('array'),
    type: 'array',
    enabled: true,
    label: input?.mode === 'radial' ? 'Array Radial' : 'Array Linear',
    count: Math.max(2, Math.round(input?.count ?? 2)),
    mode: input?.mode ?? 'linear',
    offset: input?.offset ?? { x: 1.5, y: 0, z: 0 },
    axis: input?.axis ?? 'y',
    radius: clamp(Number(input?.radius), 0, 1000, 2),
    angle: clamp(Number(input?.angle), -360, 360, 360),
    rotateInstances: input?.rotateInstances ?? true,
  };
}

export function createRemeshModifier(
  iterations = 1,
  relaxStrength = 0.12
): RemeshMeshModifier {
  return {
    id: generateModifierId('remesh'),
    type: 'remesh',
    enabled: true,
    label: 'Remesh',
    iterations: Math.max(1, Math.min(3, Math.round(iterations))),
    relaxStrength: clamp(relaxStrength, 0, 1, 0.12),
  };
}

export function createDecimateModifier(ratio = 0.5): DecimateMeshModifier {
  return {
    id: generateModifierId('decimate'),
    type: 'decimate',
    enabled: true,
    label: 'Decimate',
    ratio: clamp(ratio, 0.1, 1, 0.5),
  };
}

function parseModifier(value: unknown): MeshModifier | null {
  const record = asRecord(value);
  const type = typeof record?.type === 'string' ? record.type : '';
  const enabled = typeof record?.enabled === 'boolean' ? record.enabled : true;
  const id =
    typeof record?.id === 'string' && record.id.trim().length > 0
      ? record.id.trim()
      : generateModifierId(type || 'modifier');
  const label = typeof record?.label === 'string' ? record.label : undefined;

  switch (type) {
    case 'mirror_x':
      return { id, type, enabled, label };
    case 'solidify':
      return {
        id,
        type,
        enabled,
        label,
        thickness: clamp(Number(record?.thickness), 0.001, 10, 0.12),
      };
    case 'array': {
      const mode = record?.mode === 'radial' ? 'radial' : 'linear';
      return {
        id,
        type,
        enabled,
        label,
        count: Math.max(2, Math.round(Number(record?.count) || 2)),
        mode,
        offset: readVector3(record?.offset, { x: 1.5, y: 0, z: 0 }),
        axis:
          record?.axis === 'x' || record?.axis === 'y' || record?.axis === 'z'
            ? record.axis
            : 'y',
        radius: clamp(Number(record?.radius), 0, 1000, 2),
        angle: clamp(Number(record?.angle), -360, 360, 360),
        rotateInstances:
          typeof record?.rotateInstances === 'boolean'
            ? record.rotateInstances
            : true,
      };
    }
    case 'remesh':
      return {
        id,
        type,
        enabled,
        label,
        iterations: Math.max(1, Math.min(3, Math.round(Number(record?.iterations) || 1))),
        relaxStrength: clamp(Number(record?.relaxStrength), 0, 1, 0.12),
      };
    case 'decimate':
      return {
        id,
        type,
        enabled,
        label,
        ratio: clamp(Number(record?.ratio), 0.1, 1, 0.5),
      };
    default:
      return null;
  }
}

export function sanitizeMeshModifier(modifier: MeshModifier): MeshModifier {
  const sanitized = parseModifier(modifier);
  if (!sanitized) {
    throw new Error(`Modifier invalido: ${modifier.type}`);
  }
  return sanitized;
}

export function cloneMeshModifier(modifier: MeshModifier): MeshModifier {
  const sanitized = sanitizeMeshModifier(modifier);
  return {
    ...sanitized,
    id: generateModifierId(getModifierPrefix(sanitized.type)),
  };
}

export function cloneMeshModifierStack(modifiers: MeshModifier[]): MeshModifier[] {
  return modifiers.map(cloneMeshModifier);
}

export function parseMeshModifierStack(value: unknown): MeshModifier[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(parseModifier)
    .filter((modifier): modifier is MeshModifier => Boolean(modifier));
}

export function buildMeshModifierSignature(modifiers: MeshModifier[]) {
  return JSON.stringify(
    modifiers.map((modifier) => ({
      ...modifier,
    }))
  );
}

export function summarizeMeshModifierStack(modifiers: MeshModifier[]) {
  if (modifiers.length === 0) {
    return '0 modifiers';
  }

  const enabledCount = modifiers.filter((modifier) => modifier.enabled).length;
  const labels = Array.from(
    new Set(modifiers.map((modifier) => modifier.label ?? getModifierDefaultLabel(modifier.type)))
  );
  const preview = labels.slice(0, 3).join(' / ');
  const suffix = labels.length > 3 ? ' / ...' : '';
  return `${modifiers.length} modifiers, ${enabledCount} activos${preview ? ` · ${preview}${suffix}` : ''}`;
}

export function parseMeshModifierStackDocument(value: unknown): MeshModifierStackDocument | null {
  if (Array.isArray(value)) {
    const modifiers = parseMeshModifierStack(value);
    return modifiers.length > 0 ? { version: 1, modifiers } : null;
  }

  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const modifiers = parseMeshModifierStack(record.modifiers);
  if (modifiers.length === 0) {
    return null;
  }

  return {
    version: 1,
    name:
      typeof record.name === 'string' && record.name.trim().length > 0
        ? record.name.trim()
        : undefined,
    description:
      typeof record.description === 'string' && record.description.trim().length > 0
        ? record.description.trim()
        : undefined,
    exportedAt:
      typeof record.exportedAt === 'string' && record.exportedAt.trim().length > 0
        ? record.exportedAt.trim()
        : undefined,
    modifiers,
  };
}

function parseMeshModifierPresetDefinition(value: unknown): MeshModifierPresetDefinition | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const name =
    typeof record.name === 'string' && record.name.trim().length > 0
      ? record.name.trim()
      : null;
  if (!name) {
    return null;
  }

  const modifiers = parseMeshModifierStack(record.modifiers);
  if (modifiers.length === 0) {
    return null;
  }

  return {
    id:
      typeof record.id === 'string' && record.id.trim().length > 0
        ? record.id.trim()
        : generatePresetId(),
    name,
    description:
      typeof record.description === 'string' && record.description.trim().length > 0
        ? record.description.trim()
        : undefined,
    modifiers,
  };
}

export function serializeMeshModifierStackDocument(input: {
  modifiers: MeshModifier[];
  name?: string;
  description?: string;
}) {
  const document: MeshModifierStackDocument = {
    version: 1,
    modifiers: cloneMeshModifierStack(input.modifiers),
    exportedAt: new Date().toISOString(),
  };

  if (input.name?.trim()) {
    document.name = input.name.trim();
  }

  if (input.description?.trim()) {
    document.description = input.description.trim();
  }

  return JSON.stringify(document, null, 2);
}

export function parseMeshModifierPresetLibraryDocument(
  value: unknown
): MeshModifierPresetLibraryDocument | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const presets = Array.isArray(record.presets)
    ? record.presets
        .map(parseMeshModifierPresetDefinition)
        .filter((preset): preset is MeshModifierPresetDefinition => Boolean(preset))
    : [];
  if (presets.length === 0) {
    return null;
  }

  return {
    version: 1,
    name:
      typeof record.name === 'string' && record.name.trim().length > 0
        ? record.name.trim()
        : undefined,
    exportedAt:
      typeof record.exportedAt === 'string' && record.exportedAt.trim().length > 0
        ? record.exportedAt.trim()
        : undefined,
    presets,
  };
}

export function serializeMeshModifierPresetLibraryDocument(input: {
  presets: Array<{
    id?: string;
    name: string;
    description?: string;
    modifiers: MeshModifier[];
  }>;
  name?: string;
}) {
  const document: MeshModifierPresetLibraryDocument = {
    version: 1,
    exportedAt: new Date().toISOString(),
    presets: input.presets.flatMap((preset) => {
      if (!preset.name.trim() || preset.modifiers.length === 0) {
        return [];
      }

      return [
        {
          id: preset.id?.trim() || generatePresetId(),
          name: preset.name.trim(),
          description: preset.description?.trim() || undefined,
          modifiers: cloneMeshModifierStack(preset.modifiers),
        } satisfies MeshModifierPresetDefinition,
      ];
    }),
  };

  if (input.name?.trim()) {
    document.name = input.name.trim();
  }

  return JSON.stringify(document, null, 2);
}

export function applyMeshModifierStack(
  mesh: EditableMesh,
  modifiers: MeshModifier[]
): EditableMesh {
  return modifiers.reduce((currentMesh, modifier) => {
    if (!modifier.enabled) {
      return currentMesh;
    }

    switch (modifier.type) {
      case 'mirror_x':
        return mirrorMeshX(currentMesh);
      case 'solidify':
        return solidifyMesh(currentMesh, modifier.thickness);
      case 'array': {
        const options: ArrayMeshOptions =
          modifier.mode === 'radial'
            ? {
                mode: 'radial',
                axis: modifier.axis,
                radius: modifier.radius,
                angle: modifier.angle,
                rotateInstances: modifier.rotateInstances,
              }
            : {
                mode: 'linear',
                offset: modifier.offset,
              };
        return arrayMesh(currentMesh, modifier.count, options);
      }
      case 'remesh':
        return remeshMeshUniform(
          currentMesh,
          modifier.iterations,
          modifier.relaxStrength ?? 0.12
        );
      case 'decimate':
        return decimateMesh(currentMesh, modifier.ratio);
      default:
        return currentMesh;
    }
  }, mesh);
}

export function buildMeshModifierPreviewMetrics(
  mesh: EditableMesh,
  modifiers: MeshModifier[]
): MeshModifierPreviewMetrics {
  const preview = modifiers.length > 0 ? applyMeshModifierStack(mesh, modifiers) : mesh;
  const baseEdges = listMeshEdges(mesh).length;
  const previewEdges = listMeshEdges(preview).length;

  return {
    baseVertices: mesh.vertices.length,
    vertices: preview.vertices.length,
    deltaVertices: preview.vertices.length - mesh.vertices.length,
    baseFaces: mesh.faces.length,
    faces: preview.faces.length,
    deltaFaces: preview.faces.length - mesh.faces.length,
    baseEdges,
    edges: previewEdges,
    deltaEdges: previewEdges - baseEdges,
  };
}

export function applyMeshModifierStackAndBuildSignature(
  mesh: EditableMesh,
  modifiers: MeshModifier[]
) {
  const nextMesh = applyMeshModifierStack(mesh, modifiers);
  return {
    mesh: nextMesh,
    signature: `${buildEditableMeshSignature(nextMesh)}:${buildMeshModifierSignature(modifiers)}`,
  };
}
