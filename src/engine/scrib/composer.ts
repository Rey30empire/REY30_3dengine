import type { Entity, Scene } from '@/types/engine';
import { defaultScribRegistry } from './registry';
import { engineTelemetry } from '@/engine/telemetry/engineTelemetry';
import type {
  AtomicScribType,
  ScribInstance,
  ScribValidationIssue,
} from './types';

type ComposerStageName =
  | 'collect_entities'
  | 'collect_scribs'
  | 'validate'
  | 'resolve_dependencies'
  | 'build_runtime'
  | 'init_scene'
  | 'start_loop'
  | 'render';

export interface ComposerStage {
  name: ComposerStageName;
  ok: boolean;
  detail: string;
}

export interface RuntimePlanNode {
  id: string;
  sourceScribId: string;
  type: AtomicScribType;
  target: ScribInstance['target'];
  config: Record<string, unknown>;
  code: string;
  priority: number;
  autoAdded: boolean;
  enabled: boolean;
}

export interface ComposerRuntimePlan {
  ok: boolean;
  version: string;
  sceneId: string | null;
  collectedEntityIds: string[];
  collectedScribIds: string[];
  diagnostics: ScribValidationIssue[];
  stages: ComposerStage[];
  nodes: RuntimePlanNode[];
  createdAt: string;
}

export interface ComposeRuntimeInput {
  scenes: Scene[];
  activeSceneId: string | null;
  entities: Map<string, Entity>;
  scribInstances: Map<string, ScribInstance>;
}

const PRIORITY_BY_TYPE: Record<AtomicScribType, number> = {
  transform: 10,
  mesh: 20,
  material: 30,
  collider: 40,
  physics: 50,
  movement: 60,
  ai: 70,
  animation: 80,
  cameraFollow: 90,
  damage: 100,
  inventory: 110,
  audio: 120,
  particles: 130,
  ui: 140,
};

function toTargetKey(target: ScribInstance['target']): string {
  return `${target.scope}:${target.id}`;
}

function makeStage(name: ComposerStageName, ok: boolean, detail: string): ComposerStage {
  return { name, ok, detail };
}

function cloneIssues(issues: ScribValidationIssue[]): ScribValidationIssue[] {
  return issues.map((item) => ({ ...item }));
}

function buildPlanVersion(params: {
  sceneId: string | null;
  entityIds: string[];
  scribs: ScribInstance[];
  nodeCount: number;
}): string {
  const chunks = [
    params.sceneId || 'no-scene',
    params.entityIds.slice().sort().join(','),
    params.scribs
      .map((item) =>
        [
          item.id,
          item.type,
          item.target.scope,
          item.target.id,
          item.enabled ? '1' : '0',
          item.updatedAt,
          item.code,
        ].join('|')
      )
      .sort()
      .join(';'),
    String(params.nodeCount),
  ];
  return chunks.join('::');
}

export function composeRuntimePlan(input: ComposeRuntimeInput): ComposerRuntimePlan {
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const stages: ComposerStage[] = [];
  const diagnostics: ScribValidationIssue[] = [];

  const entities = Array.from(input.entities.values());
  const activeScene = input.scenes.find((scene) => scene.id === input.activeSceneId) || null;

  const collectedEntityIds = entities.map((entity) => entity.id);
  stages.push(
    makeStage(
      'collect_entities',
      true,
      `Collected ${collectedEntityIds.length} entities${activeScene ? ` for ${activeScene.name}` : ''}.`
    )
  );

  const rawScribs = Array.from(input.scribInstances.values()).filter((scrib) => {
    if (scrib.target.scope === 'entity') return input.entities.has(scrib.target.id);
    if (scrib.target.scope === 'scene') {
      if (!input.activeSceneId) return true;
      return scrib.target.id === input.activeSceneId;
    }
    return false;
  });
  stages.push(
    makeStage('collect_scribs', true, `Collected ${rawScribs.length} scrib instances for composer.`)
  );

  rawScribs.forEach((scrib) => {
    const validation = defaultScribRegistry.validate(scrib.type);
    if (!validation.ok) {
      diagnostics.push(...cloneIssues(validation.issues));
    }
  });
  stages.push(
    makeStage(
      'validate',
      diagnostics.filter((item) => item.level === 'error').length === 0,
      diagnostics.length === 0
        ? 'Scrib definitions validated.'
        : `Validation produced ${diagnostics.length} diagnostic issue(s).`
    )
  );

  const grouped = new Map<string, ScribInstance[]>();
  rawScribs.forEach((scrib) => {
    const key = toTargetKey(scrib.target);
    const current = grouped.get(key) || [];
    current.push(scrib);
    grouped.set(key, current);
  });

  const nodes: RuntimePlanNode[] = [];

  grouped.forEach((group) => {
    const provided = new Set<AtomicScribType>();

    group.forEach((scrib) => {
      if (!scrib.enabled) return;
      const atomic = defaultScribRegistry.expandToAtomic(scrib.type);
      atomic.forEach((type) => {
        const def = defaultScribRegistry.get(type);
        if (!def) return;
        nodes.push({
          id: `${scrib.id}:${type}`,
          sourceScribId: scrib.id,
          type,
          target: scrib.target,
          config: { ...def.defaultConfig, ...scrib.config },
          code: scrib.code,
          priority: PRIORITY_BY_TYPE[type],
          autoAdded: false,
          enabled: true,
        });
        def.provides.forEach((cap) => provided.add(cap));
      });
    });

    let guard = 0;
    while (guard < 16) {
      guard += 1;
      const missingPerTarget: AtomicScribType[] = [];
      nodes
        .filter((node) => toTargetKey(node.target) === toTargetKey(group[0].target) && node.enabled)
        .forEach((node) => {
          const def = defaultScribRegistry.get(node.type);
          if (!def) return;
          def.requires.forEach((required) => {
            if (!provided.has(required)) {
              missingPerTarget.push(required);
            }
          });
        });

      const missingUnique = Array.from(new Set(missingPerTarget));
      if (missingUnique.length === 0) break;

      let added = 0;
      missingUnique.forEach((required) => {
        if (provided.has(required)) return;
        const reqDef = defaultScribRegistry.get(required);
        if (!reqDef || reqDef.kind !== 'atomic') {
          diagnostics.push({
            level: 'error',
            code: 'SCRIB_MISSING_DEPENDENCY',
            message: `Missing dependency ${required} and no atomic definition found.`,
          });
          return;
        }
        const autoId = `auto:${toTargetKey(group[0].target)}:${required}`;
        if (nodes.some((item) => item.id === autoId)) return;
        nodes.push({
          id: autoId,
          sourceScribId: autoId,
          type: required,
          target: group[0].target,
          config: { ...reqDef.defaultConfig },
          code: `scribs/${required}.scrib.ts`,
          priority: PRIORITY_BY_TYPE[required],
          autoAdded: true,
          enabled: true,
        });
        reqDef.provides.forEach((cap) => provided.add(cap));
        diagnostics.push({
          level: 'warning',
          code: 'SCRIB_AUTO_ADDED_DEPENDENCY',
          message: `Auto-added dependency ${required} for target ${toTargetKey(group[0].target)}.`,
        });
        added += 1;
      });

      if (added === 0) break;
    }
  });

  const unresolvedDiagnostics: ScribValidationIssue[] = [];
  grouped.forEach((group) => {
    const targetKey = toTargetKey(group[0].target);
    const targetNodes = nodes.filter((node) => toTargetKey(node.target) === targetKey && node.enabled);
    const provided = new Set<AtomicScribType>();
    targetNodes.forEach((node) => provided.add(node.type));

    targetNodes.forEach((node) => {
      const def = defaultScribRegistry.get(node.type);
      if (!def) return;
      def.requires.forEach((required) => {
        if (!provided.has(required)) {
          unresolvedDiagnostics.push({
            level: 'error',
            code: 'SCRIB_UNRESOLVED_REQUIREMENT',
            message: `Target ${targetKey} still missing required capability "${required}" for ${node.type}.`,
          });
        }
      });
    });
  });
  diagnostics.push(...unresolvedDiagnostics);
  stages.push(
    makeStage(
      'resolve_dependencies',
      unresolvedDiagnostics.length === 0,
      unresolvedDiagnostics.length === 0
        ? 'Dependencies resolved.'
        : `${unresolvedDiagnostics.length} unresolved dependency issue(s).`
    )
  );

  nodes.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    const scopeA = a.target.scope === 'scene' ? 0 : 1;
    const scopeB = b.target.scope === 'scene' ? 0 : 1;
    if (scopeA !== scopeB) return scopeA - scopeB;
    if (a.target.id !== b.target.id) return a.target.id.localeCompare(b.target.id);
    return a.id.localeCompare(b.id);
  });
  stages.push(makeStage('build_runtime', true, `Runtime plan built with ${nodes.length} node(s).`));

  stages.push(makeStage('init_scene', true, 'Scene initialization phase prepared.'));
  stages.push(makeStage('start_loop', true, 'Runtime loop ready.'));
  stages.push(makeStage('render', true, 'Render stage ready.'));

  const hasErrors = diagnostics.some((item) => item.level === 'error');
  const version = buildPlanVersion({
    sceneId: input.activeSceneId,
    entityIds: collectedEntityIds,
    scribs: rawScribs,
    nodeCount: nodes.length,
  });

  const plan = {
    ok: !hasErrors,
    version,
    sceneId: input.activeSceneId,
    collectedEntityIds,
    collectedScribIds: rawScribs.map((item) => item.id),
    diagnostics,
    stages,
    nodes,
    createdAt: new Date().toISOString(),
  };

  const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt;
  engineTelemetry.recordComposeDuration(elapsed, {
    sceneId: input.activeSceneId || 'none',
    nodeCount: nodes.length,
    diagnostics: diagnostics.length,
    ok: !hasErrors,
  });

  return plan;
}
