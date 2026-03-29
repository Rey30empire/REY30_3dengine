import { v4 as uuidv4 } from 'uuid';
import { defaultScribRegistry } from './registry';
import type {
  AssignScribResult,
  AtomicScribType,
  CreateScribInstanceInput,
  ScribInstance,
  ScribTargetRef,
  ScribType,
  ScribValidationIssue,
} from './types';

function createCodePath(type: AtomicScribType): string {
  return `scribs/${type}.scrib.ts`;
}

function mergeConfig(
  base: Record<string, unknown>,
  override?: Record<string, unknown>
): Record<string, unknown> {
  return {
    ...base,
    ...(override || {}),
  };
}

function buildInstance(input: CreateScribInstanceInput): ScribInstance {
  const def = defaultScribRegistry.get(input.type);
  if (!def) {
    throw new Error(`Scrib type no registrado: ${input.type}`);
  }
  const now = new Date().toISOString();
  return {
    id: uuidv4(),
    type: input.type,
    kind: def.kind,
    target: input.target,
    config: mergeConfig(def.defaultConfig, input.config),
    code: input.code || (def.kind === 'atomic' ? createCodePath(def.type as AtomicScribType) : ''),
    requires: [...def.requires],
    optional: [...def.optional],
    provides: [...def.provides],
    enabled: true,
    origin: input.origin || 'manual',
    createdAt: now,
    updatedAt: now,
  };
}

function getTargetInstances(
  target: ScribTargetRef,
  allInstances: Map<string, ScribInstance>
): ScribInstance[] {
  return Array.from(allInstances.values()).filter(
    (item) => item.target.scope === target.scope && item.target.id === target.id
  );
}

function missingRequirements(
  requires: AtomicScribType[],
  existing: Set<AtomicScribType>
): AtomicScribType[] {
  return requires.filter((req) => !existing.has(req));
}

export function assignScribToTarget(
  input: {
    target: ScribTargetRef;
    type: ScribType;
    config?: Record<string, unknown>;
    origin?: ScribInstance['origin'];
  },
  allInstances: Map<string, ScribInstance>
): AssignScribResult {
  const issues: ScribValidationIssue[] = [];
  const assigned: ScribInstance[] = [];
  const autoAdded: ScribInstance[] = [];

  const targetInstances = getTargetInstances(input.target, allInstances);
  const provided = new Set<AtomicScribType>();
  targetInstances.forEach((item) => {
    item.provides.forEach((cap) => provided.add(cap));
  });

  const validation = defaultScribRegistry.validate(input.type);
  if (!validation.ok) {
    return {
      ok: false,
      assigned,
      autoAdded,
      issues: validation.issues,
    };
  }

  const typesToAssign = defaultScribRegistry.expandToAtomic(input.type);
  if (typesToAssign.length === 0) {
    return {
      ok: false,
      assigned,
      autoAdded,
      issues: [
        {
          level: 'error',
          code: 'SCRIB_ASSIGN_EMPTY',
          message: `No hay tipos atomic para asignar desde ${input.type}`,
        },
      ],
    };
  }

  const alreadyAssigned = new Set(
    targetInstances
      .flatMap((item) => defaultScribRegistry.expandToAtomic(item.type))
      .filter(Boolean)
  );

  const queue: AtomicScribType[] = [...typesToAssign];
  while (queue.length > 0) {
    const nextType = queue.shift()!;
    if (alreadyAssigned.has(nextType)) continue;

    const def = defaultScribRegistry.get(nextType);
    if (!def) {
      issues.push({
        level: 'error',
        code: 'SCRIB_TYPE_MISSING',
        message: `Tipo atomic no registrado: ${nextType}`,
      });
      continue;
    }

    const missing = missingRequirements(def.requires, provided);
    missing.forEach((req) => {
      if (!alreadyAssigned.has(req)) {
        queue.unshift(req);
      }
    });

    if (missing.length > 0) {
      const stillMissing = missing.filter((req) => !provided.has(req));
      if (stillMissing.length > 0 && queue[0] !== nextType) {
        queue.push(nextType);
        continue;
      }
    }

    const instance = buildInstance({
      type: nextType,
      target: input.target,
      config: nextType === typesToAssign[0] ? input.config : undefined,
      origin: input.origin,
    });

    if (typesToAssign.includes(nextType)) {
      assigned.push(instance);
    } else {
      autoAdded.push(instance);
    }
    alreadyAssigned.add(nextType);
    def.provides.forEach((cap) => provided.add(cap));
  }

  if (issues.some((item) => item.level === 'error')) {
    return {
      ok: false,
      assigned: [],
      autoAdded: [],
      issues,
    };
  }

  return {
    ok: true,
    assigned,
    autoAdded,
    issues,
  };
}

export function removeScribInstance(
  instanceId: string,
  allInstances: Map<string, ScribInstance>
): Map<string, ScribInstance> {
  const next = new Map(allInstances);
  next.delete(instanceId);
  return next;
}

export function getScribsForTarget(
  target: ScribTargetRef,
  allInstances: Map<string, ScribInstance>
): ScribInstance[] {
  return getTargetInstances(target, allInstances);
}
