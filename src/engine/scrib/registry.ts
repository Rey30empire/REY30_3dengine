import type {
  AtomicScribType,
  ScribDefinition,
  ScribKind,
  ScribType,
  ScribValidationResult,
} from './types';

const ATOMIC_DEFINITIONS: ScribDefinition[] = [
  {
    type: 'transform',
    kind: 'atomic',
    description: 'Base transform for position/rotation/scale.',
    requires: [],
    optional: [],
    provides: ['transform'],
    defaultConfig: {},
    editableCode: false,
  },
  {
    type: 'mesh',
    kind: 'atomic',
    description: 'Attach a mesh renderer.',
    requires: ['transform'],
    optional: ['material'],
    provides: ['mesh'],
    defaultConfig: { primitive: 'cube' },
    editableCode: false,
  },
  {
    type: 'material',
    kind: 'atomic',
    description: 'Attach visual material.',
    requires: ['mesh'],
    optional: [],
    provides: ['material'],
    defaultConfig: { color: '#ffffff', roughness: 0.5, metalness: 0.1 },
    editableCode: false,
  },
  {
    type: 'movement',
    kind: 'atomic',
    description: 'Entity movement behavior.',
    requires: ['transform'],
    optional: ['collider'],
    provides: ['movement'],
    defaultConfig: { speed: 5, jump: 7 },
    editableCode: true,
  },
  {
    type: 'collider',
    kind: 'atomic',
    description: 'Collider configuration.',
    requires: ['transform'],
    optional: [],
    provides: ['collider'],
    defaultConfig: { shape: 'box', isTrigger: false },
    editableCode: false,
  },
  {
    type: 'physics',
    kind: 'atomic',
    description: 'Physics behavior.',
    requires: ['collider'],
    optional: ['movement'],
    provides: ['physics'],
    defaultConfig: { mass: 1, gravity: true },
    editableCode: false,
  },
  {
    type: 'animation',
    kind: 'atomic',
    description: 'Animation runtime controls.',
    requires: ['transform'],
    optional: ['mesh'],
    provides: ['animation'],
    defaultConfig: { state: 'idle' },
    editableCode: true,
  },
  {
    type: 'particles',
    kind: 'atomic',
    description: 'Particle effects.',
    requires: ['transform'],
    optional: [],
    provides: ['particles'],
    defaultConfig: { preset: 'smoke', rate: 30 },
    editableCode: false,
  },
  {
    type: 'audio',
    kind: 'atomic',
    description: 'Audio source controller.',
    requires: ['transform'],
    optional: [],
    provides: ['audio'],
    defaultConfig: { volume: 0.8, loop: false },
    editableCode: false,
  },
  {
    type: 'ui',
    kind: 'atomic',
    description: 'UI behavior/controller.',
    requires: [],
    optional: [],
    provides: ['ui'],
    defaultConfig: { panel: 'hud' },
    editableCode: true,
  },
  {
    type: 'ai',
    kind: 'atomic',
    description: 'AI behavior tree/controller.',
    requires: ['transform'],
    optional: ['movement'],
    provides: ['ai'],
    defaultConfig: { state: 'idle' },
    editableCode: true,
  },
  {
    type: 'cameraFollow',
    kind: 'atomic',
    description: 'Camera follows target entity.',
    requires: ['transform'],
    optional: ['movement'],
    provides: ['cameraFollow'],
    defaultConfig: { distance: 6, height: 2 },
    editableCode: true,
  },
  {
    type: 'damage',
    kind: 'atomic',
    description: 'Damage and health effects.',
    requires: ['collider'],
    optional: [],
    provides: ['damage'],
    defaultConfig: { value: 10, cooldown: 0.6 },
    editableCode: true,
  },
  {
    type: 'inventory',
    kind: 'atomic',
    description: 'Inventory capability.',
    requires: [],
    optional: ['ui'],
    provides: ['inventory'],
    defaultConfig: { slots: 12 },
    editableCode: true,
  },
];

const COMPOSED_DEFINITIONS: ScribDefinition[] = [
  {
    type: 'characterBasic',
    kind: 'composed',
    description: 'Character starter recipe.',
    requires: [],
    optional: [],
    provides: ['transform', 'mesh', 'collider', 'movement', 'animation', 'cameraFollow'],
    composedOf: ['transform', 'mesh', 'collider', 'movement', 'animation', 'cameraFollow'],
    defaultConfig: {},
    editableCode: false,
  },
  {
    type: 'enemyBasic',
    kind: 'composed',
    description: 'Enemy starter recipe.',
    requires: [],
    optional: [],
    provides: ['transform', 'mesh', 'collider', 'movement', 'ai', 'damage'],
    composedOf: ['transform', 'mesh', 'collider', 'movement', 'ai', 'damage'],
    defaultConfig: {},
    editableCode: false,
  },
  {
    type: 'terrainBasic',
    kind: 'composed',
    description: 'Terrain starter recipe.',
    requires: [],
    optional: [],
    provides: ['transform', 'mesh', 'material', 'collider', 'particles'],
    composedOf: ['transform', 'mesh', 'material', 'collider', 'particles'],
    defaultConfig: {},
    editableCode: false,
  },
  {
    type: 'weaponBasic',
    kind: 'composed',
    description: 'Weapon starter recipe.',
    requires: [],
    optional: [],
    provides: ['transform', 'mesh', 'damage', 'audio'],
    composedOf: ['transform', 'mesh', 'damage', 'audio'],
    defaultConfig: {},
    editableCode: false,
  },
  {
    type: 'doorBasic',
    kind: 'composed',
    description: 'Door with collider and animation.',
    requires: [],
    optional: [],
    provides: ['transform', 'mesh', 'collider', 'animation'],
    composedOf: ['transform', 'mesh', 'collider', 'animation'],
    defaultConfig: {},
    editableCode: false,
  },
  {
    type: 'vehicleBasic',
    kind: 'composed',
    description: 'Vehicle starter recipe.',
    requires: [],
    optional: [],
    provides: ['transform', 'mesh', 'collider', 'physics', 'movement'],
    composedOf: ['transform', 'mesh', 'collider', 'physics', 'movement'],
    defaultConfig: {},
    editableCode: false,
  },
];

const ALL_DEFINITIONS = [...ATOMIC_DEFINITIONS, ...COMPOSED_DEFINITIONS];

export class ScribRegistry {
  private readonly defs = new Map<ScribType, ScribDefinition>();

  register(def: ScribDefinition): void {
    this.defs.set(def.type, def);
  }

  get(type: ScribType): ScribDefinition | undefined {
    return this.defs.get(type);
  }

  list(kind?: ScribKind): ScribDefinition[] {
    const values = Array.from(this.defs.values());
    if (!kind) return values;
    return values.filter((item) => item.kind === kind);
  }

  has(type: ScribType): boolean {
    return this.defs.has(type);
  }

  expandToAtomic(type: ScribType): AtomicScribType[] {
    const def = this.get(type);
    if (!def) return [];
    if (def.kind === 'atomic') return [def.type as AtomicScribType];
    return def.composedOf ? [...def.composedOf] : [];
  }

  validate(type: ScribType): ScribValidationResult {
    const issues: ScribValidationResult['issues'] = [];
    const def = this.get(type);
    if (!def) {
      issues.push({
        level: 'error',
        code: 'SCRIB_UNKNOWN_TYPE',
        message: `Scrib type no registrado: ${type}`,
      });
      return { ok: false, issues };
    }

    if (def.kind === 'composed') {
      const composed = def.composedOf || [];
      if (composed.length === 0) {
        issues.push({
          level: 'error',
          code: 'SCRIB_EMPTY_RECIPE',
          message: `Recipe compuesta sin componentes: ${def.type}`,
        });
      }

      composed.forEach((atomicType) => {
        const atomicDef = this.get(atomicType);
        if (!atomicDef || atomicDef.kind !== 'atomic') {
          issues.push({
            level: 'error',
            code: 'SCRIB_RECIPE_ATOMIC_MISSING',
            message: `Recipe ${def.type} referencia atomic faltante: ${atomicType}`,
          });
        }
      });
    }

    return {
      ok: !issues.some((item) => item.level === 'error'),
      issues,
    };
  }
}

export function createDefaultScribRegistry(): ScribRegistry {
  const registry = new ScribRegistry();
  ALL_DEFINITIONS.forEach((def) => registry.register(def));
  return registry;
}

export const defaultScribRegistry = createDefaultScribRegistry();

