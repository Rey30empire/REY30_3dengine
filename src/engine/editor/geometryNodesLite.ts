import {
  createArrayModifier,
  createDecimateModifier,
  createMirrorModifier,
  createRemeshModifier,
  createSolidifyModifier,
  sanitizeMeshModifier,
  type MeshModifier,
} from './meshModifiers';

export type GeometryNodeLiteType =
  | 'mirror_x'
  | 'solidify'
  | 'array_linear'
  | 'array_radial'
  | 'remesh'
  | 'decimate';

interface GeometryNodeLiteBase {
  id: string;
  type: GeometryNodeLiteType;
  enabled: boolean;
  label?: string;
}

export interface GeometryNodeMirrorLite extends GeometryNodeLiteBase {
  type: 'mirror_x';
}

export interface GeometryNodeSolidifyLite extends GeometryNodeLiteBase {
  type: 'solidify';
  thickness: number;
}

export interface GeometryNodeArrayLinearLite extends GeometryNodeLiteBase {
  type: 'array_linear';
  count: number;
  offset: { x: number; y: number; z: number };
}

export interface GeometryNodeArrayRadialLite extends GeometryNodeLiteBase {
  type: 'array_radial';
  count: number;
  axis: 'x' | 'y' | 'z';
  radius: number;
  angle: number;
  rotateInstances: boolean;
}

export interface GeometryNodeRemeshLite extends GeometryNodeLiteBase {
  type: 'remesh';
  iterations: number;
  relaxStrength: number;
}

export interface GeometryNodeDecimateLite extends GeometryNodeLiteBase {
  type: 'decimate';
  ratio: number;
}

export type GeometryNodeLite =
  | GeometryNodeMirrorLite
  | GeometryNodeSolidifyLite
  | GeometryNodeArrayLinearLite
  | GeometryNodeArrayRadialLite
  | GeometryNodeRemeshLite
  | GeometryNodeDecimateLite;

export interface GeometryNodeGraphDocument {
  version: 1;
  name?: string;
  description?: string;
  exportedAt?: string;
  nodes: GeometryNodeLite[];
}

export interface GeometryNodeRecipe {
  id: string;
  name: string;
  description: string;
  nodes: GeometryNodeLite[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function clamp(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function generateNodeId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function readVector3(value: unknown, fallback: { x: number; y: number; z: number }) {
  const record = asRecord(value);
  return {
    x: clamp(Number(record?.x), -1000, 1000, fallback.x),
    y: clamp(Number(record?.y), -1000, 1000, fallback.y),
    z: clamp(Number(record?.z), -1000, 1000, fallback.z),
  };
}

function parseGeometryNodeLite(value: unknown): GeometryNodeLite | null {
  const record = asRecord(value);
  if (!record) return null;

  const type = typeof record.type === 'string' ? record.type : '';
  const enabled = typeof record.enabled === 'boolean' ? record.enabled : true;
  const id =
    typeof record.id === 'string' && record.id.trim().length > 0
      ? record.id.trim()
      : generateNodeId(type || 'node');
  const label = typeof record.label === 'string' ? record.label : undefined;

  switch (type) {
    case 'mirror_x':
      return { id, type, enabled, label };
    case 'solidify':
      return {
        id,
        type,
        enabled,
        label,
        thickness: clamp(Number(record.thickness), 0.001, 10, 0.12),
      };
    case 'array_linear':
      return {
        id,
        type,
        enabled,
        label,
        count: Math.max(2, Math.round(Number(record.count) || 2)),
        offset: readVector3(record.offset, { x: 1.5, y: 0, z: 0 }),
      };
    case 'array_radial':
      return {
        id,
        type,
        enabled,
        label,
        count: Math.max(2, Math.round(Number(record.count) || 2)),
        axis:
          record.axis === 'x' || record.axis === 'y' || record.axis === 'z'
            ? record.axis
            : 'y',
        radius: clamp(Number(record.radius), 0, 1000, 2),
        angle: clamp(Number(record.angle), -360, 360, 360),
        rotateInstances:
          typeof record.rotateInstances === 'boolean' ? record.rotateInstances : true,
      };
    case 'remesh':
      return {
        id,
        type,
        enabled,
        label,
        iterations: Math.max(1, Math.min(3, Math.round(Number(record.iterations) || 1))),
        relaxStrength: clamp(Number(record.relaxStrength), 0, 1, 0.12),
      };
    case 'decimate':
      return {
        id,
        type,
        enabled,
        label,
        ratio: clamp(Number(record.ratio), 0.1, 1, 0.5),
      };
    default:
      return null;
  }
}

export function parseGeometryNodeGraphDocument(value: unknown): GeometryNodeGraphDocument | null {
  const record = asRecord(value);
  if (!record) return null;

  const nodes = Array.isArray(record.nodes)
    ? record.nodes
        .map((entry) => parseGeometryNodeLite(entry))
        .filter((entry): entry is GeometryNodeLite => Boolean(entry))
    : [];
  if (nodes.length === 0) return null;

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
    nodes,
  };
}

export function serializeGeometryNodeGraphDocument(input: {
  nodes: GeometryNodeLite[];
  name?: string;
  description?: string;
}) {
  const document: GeometryNodeGraphDocument = {
    version: 1,
    exportedAt: new Date().toISOString(),
    nodes: input.nodes.map((node) => ({ ...node })),
  };

  if (input.name?.trim()) {
    document.name = input.name.trim();
  }
  if (input.description?.trim()) {
    document.description = input.description.trim();
  }

  return JSON.stringify(document, null, 2);
}

export function geometryNodesToModifierStack(nodes: GeometryNodeLite[]): MeshModifier[] {
  return nodes.map((node) => {
    switch (node.type) {
      case 'mirror_x':
        return {
          ...createMirrorModifier(),
          id: node.id,
          enabled: node.enabled,
          label: node.label ?? 'Mirror X',
        };
      case 'solidify':
        return {
          ...createSolidifyModifier(node.thickness),
          id: node.id,
          enabled: node.enabled,
          label: node.label ?? 'Solidify',
        };
      case 'array_linear':
        return {
          ...createArrayModifier({
            count: node.count,
            mode: 'linear',
            offset: node.offset,
          }),
          id: node.id,
          enabled: node.enabled,
          label: node.label ?? 'Array Linear',
        };
      case 'array_radial':
        return {
          ...createArrayModifier({
            count: node.count,
            mode: 'radial',
            axis: node.axis,
            radius: node.radius,
            angle: node.angle,
            rotateInstances: node.rotateInstances,
          }),
          id: node.id,
          enabled: node.enabled,
          label: node.label ?? 'Array Radial',
        };
      case 'remesh':
        return {
          ...createRemeshModifier(node.iterations, node.relaxStrength),
          id: node.id,
          enabled: node.enabled,
          label: node.label ?? 'Remesh',
        };
      case 'decimate':
        return {
          ...createDecimateModifier(node.ratio),
          id: node.id,
          enabled: node.enabled,
          label: node.label ?? 'Decimate',
        };
      default:
        return createMirrorModifier();
    }
  });
}

export function modifierStackToGeometryNodes(modifiers: MeshModifier[]): GeometryNodeLite[] {
  return modifiers.map((modifier) => sanitizeMeshModifier(modifier)).map((modifier) => {
    switch (modifier.type) {
      case 'mirror_x':
        return {
          id: modifier.id,
          type: 'mirror_x',
          enabled: modifier.enabled,
          label: modifier.label ?? 'Mirror X',
        };
      case 'solidify':
        return {
          id: modifier.id,
          type: 'solidify',
          enabled: modifier.enabled,
          label: modifier.label ?? 'Solidify',
          thickness: modifier.thickness,
        };
      case 'array':
        return modifier.mode === 'radial'
          ? {
              id: modifier.id,
              type: 'array_radial',
              enabled: modifier.enabled,
              label: modifier.label ?? 'Array Radial',
              count: modifier.count,
              axis: modifier.axis ?? 'y',
              radius: modifier.radius ?? 2,
              angle: modifier.angle ?? 360,
              rotateInstances: modifier.rotateInstances ?? true,
            }
          : {
              id: modifier.id,
              type: 'array_linear',
              enabled: modifier.enabled,
              label: modifier.label ?? 'Array Linear',
              count: modifier.count,
              offset: modifier.offset ?? { x: 1.5, y: 0, z: 0 },
            };
      case 'remesh':
        return {
          id: modifier.id,
          type: 'remesh',
          enabled: modifier.enabled,
          label: modifier.label ?? 'Remesh',
          iterations: modifier.iterations,
          relaxStrength: modifier.relaxStrength ?? 0.12,
        };
      case 'decimate':
        return {
          id: modifier.id,
          type: 'decimate',
          enabled: modifier.enabled,
          label: modifier.label ?? 'Decimate',
          ratio: modifier.ratio,
        };
      default:
        return {
          id: generateNodeId('mirror'),
          type: 'mirror_x',
          enabled: true,
          label: 'Mirror X',
        };
    }
  });
}

export function summarizeGeometryNodeGraph(nodes: GeometryNodeLite[]) {
  if (nodes.length === 0) {
    return '0 nodos';
  }
  const enabledCount = nodes.filter((node) => node.enabled).length;
  const preview = nodes
    .slice(0, 3)
    .map((node) => node.label ?? node.type)
    .join(' / ');
  const suffix = nodes.length > 3 ? ' / ...' : '';
  return `${nodes.length} nodos, ${enabledCount} activos${preview ? ` · ${preview}${suffix}` : ''}`;
}

export const BUILTIN_GEOMETRY_NODE_RECIPES: GeometryNodeRecipe[] = [
  {
    id: 'gn_mirror_shell',
    name: 'Mirror Shell',
    description: 'Simetría no destructiva con grosor base para hard surface.',
    nodes: modifierStackToGeometryNodes([
      createMirrorModifier(),
      createSolidifyModifier(0.08),
    ]),
  },
  {
    id: 'gn_radial_kit',
    name: 'Radial Kit',
    description: 'Clonado circular para props, rosetas y módulos repetitivos.',
    nodes: modifierStackToGeometryNodes([
      createArrayModifier({
        count: 8,
        mode: 'radial',
        axis: 'y',
        radius: 2,
        angle: 360,
        rotateInstances: true,
      }),
    ]),
  },
  {
    id: 'gn_panel_run',
    name: 'Panel Run',
    description: 'Grosor + array lineal para paneles repetidos o pasillos modulares.',
    nodes: modifierStackToGeometryNodes([
      createSolidifyModifier(0.06),
      createArrayModifier({
        count: 4,
        mode: 'linear',
        offset: { x: 1.2, y: 0, z: 0 },
      }),
    ]),
  },
  {
    id: 'gn_proxy_lod',
    name: 'Proxy LOD',
    description: 'Remesh suave y decimate controlado para sacar un proxy rápido.',
    nodes: modifierStackToGeometryNodes([
      createRemeshModifier(1, 0.12),
      createDecimateModifier(0.55),
    ]),
  },
];
