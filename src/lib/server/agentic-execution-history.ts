import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'fs';
import path from 'path';
import type { EditorProjectSaveData } from '@/engine/serialization';
import { isEditorProjectSaveData } from '@/engine/serialization';
import {
  createAgenticRecommendationMutationIndexChecksum,
  createAgenticRecommendationMutationIndexIntegrity,
} from '@/engine/editor/ai/agenticRecommendationMutationIndexReport';
import type { AgenticPipelineMessageMetadata } from '@/types/engine';
import { normalizeProjectKey, sanitizeProjectKeySegment } from '@/lib/project-key';

export type AgenticExecutionHistoryRecord = {
  id: string;
  userId: string;
  projectKey: string;
  slot: string;
  prompt: string;
  approved: boolean;
  status: string;
  iteration: number;
  createdAt: string;
  completedAt: string;
  artifactPath: string | null;
  runtimeScaffold: NonNullable<AgenticPipelineMessageMetadata['runtimeScaffold']> | null;
  validation: AgenticPipelineMessageMetadata['validation'];
  toolNames: string[];
  agentRoles: string[];
  steps: AgenticPipelineMessageMetadata['steps'];
  toolStats: AgenticPipelineMessageMetadata['tools'];
  traces: AgenticPipelineMessageMetadata['traces'];
  sharedMemory?: AgenticPipelineMessageMetadata['sharedMemory'];
  toolCalls: AgenticExecutionToolCallRecord[];
  stepCount: number;
  action: 'run' | 'replay' | 'approved_recommendations';
  sourceExecutionId: string | null;
  recommendationExecution?: AgenticRecommendationExecutionLink | null;
  snapshots: {
    before: boolean;
    after: boolean;
  };
  diff: AgenticExecutionSnapshotDiff | null;
};

export type AgenticRecommendationExecutionLink = {
  sourceExecutionId: string;
  recommendationIds: string[];
  recommendationKeys: string[];
  recommendations: Array<{
    id: string;
    approvalKey: string;
    summary: string;
  }>;
  unlockedMutations: Array<{
    toolCallId: string;
    toolName: string;
    stepId: string;
    recommendationIds: string[];
    recommendationKeys: string[];
    evidenceIds: string[];
    targets: Array<{
      id: string;
      type: string;
      summary: string;
    }>;
  }>;
  partialRollback: {
    available: boolean;
    applied: boolean;
    appliedAt: string | null;
    recommendationIds: string[];
    recommendationKeys: string[];
    toolCallIds: string[];
    targetIds: string[];
  };
};

export type AgenticExecutionToolCallEvidence = {
  id: string;
  type: string;
  targetId?: string;
  summary: string;
  before?: unknown;
  after?: unknown;
  timestamp: string;
};

export type AgenticExecutionToolCallRecord = {
  callId: string;
  toolName: string;
  agentRole: string;
  stepId: string;
  success: boolean;
  message: string;
  startedAt: string;
  completedAt: string;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  error: {
    code: string;
    message: string;
    recoverable: boolean;
  } | null;
  mutatesWorld: boolean | null;
  evidenceContract: 'before_after' | 'none' | null;
  evidence: AgenticExecutionToolCallEvidence[];
};

export type AgenticSnapshotCountDiff = {
  before: number;
  after: number;
  delta: number;
};

export type AgenticNamedSnapshotChange = {
  id: string;
  name: string;
};

export type AgenticSnapshotCollectionDiff = {
  added: AgenticNamedSnapshotChange[];
  removed: AgenticNamedSnapshotChange[];
  changed: AgenticNamedSnapshotChange[];
};

export type AgenticSemanticFieldChange = {
  field: string;
  before: string;
  after: string;
};

export type AgenticSemanticComponentChange = {
  entityId: string;
  entityName: string;
  component: 'Transform' | 'Light' | 'Collider' | 'Script' | 'Material';
  changeType: 'added' | 'removed' | 'changed';
  fields: string[];
  fieldChanges: AgenticSemanticFieldChange[];
  summary: string;
};

export type AgenticRollbackPreview = {
  willRemove: {
    scenes: AgenticNamedSnapshotChange[];
    entities: AgenticNamedSnapshotChange[];
    assets: AgenticNamedSnapshotChange[];
  };
  willRestore: {
    scenes: AgenticNamedSnapshotChange[];
    entities: AgenticNamedSnapshotChange[];
    assets: AgenticNamedSnapshotChange[];
  };
  willRevert: {
    scenes: AgenticNamedSnapshotChange[];
    entities: AgenticNamedSnapshotChange[];
    assets: AgenticNamedSnapshotChange[];
    components: AgenticSemanticComponentChange[];
  };
};

export type AgenticExecutionSnapshotDiff = {
  hasChanges: boolean;
  counts: {
    scenes: AgenticSnapshotCountDiff;
    entities: AgenticSnapshotCountDiff;
    assets: AgenticSnapshotCountDiff;
    scribProfiles: AgenticSnapshotCountDiff;
    scribInstances: AgenticSnapshotCountDiff;
  };
  scenes: AgenticSnapshotCollectionDiff;
  entities: AgenticSnapshotCollectionDiff;
  assets: AgenticSnapshotCollectionDiff;
  semantic: {
    componentChanges: AgenticSemanticComponentChange[];
  };
  rollbackPreview: AgenticRollbackPreview;
};

export type AgenticExecutionHistoryPage = {
  records: AgenticExecutionHistoryRecord[];
  totalRecords: number;
  filteredRecords: number;
  limit: number;
  offset: number;
  search: string;
  historyFilter: AgenticExecutionHistoryFilter;
  toolFilter: string;
  agentFilter: string;
  traceEvent: string;
  traceActor: string;
  traceSeverity: string;
  filterOptions: AgenticExecutionHistoryFilterOptions;
  filterCounts: AgenticExecutionHistoryFilterCounts;
};

export type AgenticExecutionHistoryFilter =
  | 'all'
  | 'approved'
  | 'rejected'
  | 'replay'
  | 'rollbackable'
  | 'pending_index';

export type AgenticExecutionHistoryFilterOptions = {
  tools: string[];
  agents: string[];
};

export type AgenticExecutionHistoryFilterCounts = {
  total: number;
  approved: number;
  rejected: number;
  replay: number;
  rollbackable: number;
  pendingIndex: number;
};

export type AgenticRecommendationMutationIndex = {
  version: 1;
  projectKey: string;
  slot: string;
  updatedAt: string;
  checksum?: {
    algorithm: 'sha256';
    value: string;
    updatedAt: string;
  };
  integrityAuditTrail?: Array<{
    id: string;
    action:
      | 'checksum_recalculated'
      | 'history_reindexed'
      | 'history_reindexed_full'
      | 'history_reindexed_partial';
    actor: 'user';
    requestedBy: string;
    repairedAt: string;
    reason: string;
    previousIntegrityStatus: 'valid' | 'mismatch' | 'missing';
    previousChecksum: {
      algorithm: 'sha256';
      value: string;
      updatedAt?: string;
    } | null;
    previousComputedChecksum: {
      algorithm: 'sha256';
      value: string;
    };
  }>;
  recommendations: Record<
    string,
    {
      recommendationId: string;
      recommendationKey: string;
      summary: string;
      executions: Array<{
        executionId: string;
        sourceExecutionId: string;
        toolCalls: Array<{
          toolCallId: string;
          toolName: string;
          evidenceIds: string[];
          targetIds: string[];
        }>;
        partialRollbackAppliedAt: string | null;
      }>;
    }
  >;
};

const DEFAULT_HISTORY_LIMIT = 50;

function buildDefaultHistoryRoot() {
  if (process.env.NODE_ENV === 'test') {
    const poolId = process.env.VITEST_POOL_ID || 'default';
    return path.join(process.cwd(), '.vitest', 'agentic-executions', `${process.pid}-${poolId}`);
  }

  return path.join(process.cwd(), 'download', 'agentic-executions');
}

export function getAgenticExecutionHistoryRoot() {
  return process.env.REY30_AGENTIC_HISTORY_ROOT?.trim() || buildDefaultHistoryRoot();
}

function sanitizeSlot(value: string | null | undefined) {
  return sanitizeProjectKeySegment(value || 'editor_project_current') || 'editor_project_current';
}

function getProjectRoot(userId: string, projectKey: string) {
  return path.join(
    getAgenticExecutionHistoryRoot(),
    sanitizeProjectKeySegment(userId) || 'anonymous',
    normalizeProjectKey(projectKey)
  );
}

function getHistoryFilePath(userId: string, projectKey: string, slot: string) {
  return path.join(getProjectRoot(userId, projectKey), `${sanitizeSlot(slot)}.json`);
}

function getRecommendationMutationIndexFilePath(userId: string, projectKey: string, slot: string) {
  return path.join(
    getProjectRoot(userId, projectKey),
    `${sanitizeSlot(slot)}.recommendation-mutation-index.json`
  );
}

function getSnapshotFilePath(
  userId: string,
  projectKey: string,
  slot: string,
  executionId: string,
  kind: 'before' | 'after'
) {
  return path.join(
    getProjectRoot(userId, projectKey),
    `${sanitizeSlot(slot)}.snapshots`,
    `${sanitizeProjectKeySegment(executionId) || 'execution'}.${kind}.json`
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isStoredStep(value: unknown): value is AgenticPipelineMessageMetadata['steps'][number] {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.agentRole === 'string' &&
    typeof value.status === 'string' &&
    typeof value.evidenceCount === 'number' &&
    Number.isFinite(value.evidenceCount) &&
    typeof value.errorCount === 'number' &&
    Number.isFinite(value.errorCount)
  );
}

function isStoredToolStat(value: unknown): value is AgenticPipelineMessageMetadata['tools'][number] {
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    typeof value.successCount === 'number' &&
    Number.isFinite(value.successCount) &&
    typeof value.failureCount === 'number' &&
    Number.isFinite(value.failureCount)
  );
}

function isStoredTrace(value: unknown): value is AgenticPipelineMessageMetadata['traces'][number] {
  return (
    isRecord(value) &&
    typeof value.eventType === 'string' &&
    typeof value.severity === 'string' &&
    typeof value.actor === 'string' &&
    typeof value.message === 'string' &&
    typeof value.timestamp === 'string' &&
    (typeof value.stepId === 'string' || value.stepId === undefined) &&
    (typeof value.toolCallId === 'string' || value.toolCallId === undefined) &&
    (isRecord(value.data) || value.data === undefined)
  );
}

function normalizeOptionalObject(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function normalizeAction(value: unknown): AgenticExecutionHistoryRecord['action'] {
  if (value === 'replay' || value === 'approved_recommendations') {
    return value;
  }
  return 'run';
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function normalizeRecommendationExecutionLink(value: unknown): AgenticRecommendationExecutionLink | null {
  if (!isRecord(value)) {
    return null;
  }
  const sourceExecutionId = typeof value.sourceExecutionId === 'string' ? value.sourceExecutionId.trim() : '';
  if (!sourceExecutionId) {
    return null;
  }
  const recommendations = Array.isArray(value.recommendations)
    ? value.recommendations.flatMap((item) => {
        if (!isRecord(item) || typeof item.id !== 'string' || typeof item.approvalKey !== 'string') {
          return [];
        }
        return [{
          id: item.id,
          approvalKey: item.approvalKey,
          summary: typeof item.summary === 'string' ? item.summary : '',
        }];
      })
    : [];
  const unlockedMutations = Array.isArray(value.unlockedMutations)
    ? value.unlockedMutations.flatMap((item) => {
        if (!isRecord(item) || typeof item.toolCallId !== 'string' || typeof item.toolName !== 'string') {
          return [];
        }
        const targets = Array.isArray(item.targets)
          ? item.targets.flatMap((target) => {
              if (!isRecord(target) || typeof target.id !== 'string' || typeof target.type !== 'string') {
                return [];
              }
              return [{
                id: target.id,
                type: target.type,
                summary: typeof target.summary === 'string' ? target.summary : '',
              }];
            })
          : [];
        return [{
          toolCallId: item.toolCallId,
          toolName: item.toolName,
          stepId: typeof item.stepId === 'string' ? item.stepId : '',
          recommendationIds: normalizeStringArray(item.recommendationIds),
          recommendationKeys: normalizeStringArray(item.recommendationKeys),
          evidenceIds: normalizeStringArray(item.evidenceIds),
          targets,
        }];
      })
    : [];
  const rawPartialRollback = isRecord(value.partialRollback) ? value.partialRollback : {};

  return {
    sourceExecutionId,
    recommendationIds: normalizeStringArray(value.recommendationIds),
    recommendationKeys: normalizeStringArray(value.recommendationKeys),
    recommendations,
    unlockedMutations,
    partialRollback: {
      available: rawPartialRollback.available === true,
      applied: rawPartialRollback.applied === true,
      appliedAt: typeof rawPartialRollback.appliedAt === 'string' ? rawPartialRollback.appliedAt : null,
      recommendationIds: normalizeStringArray(rawPartialRollback.recommendationIds),
      recommendationKeys: normalizeStringArray(rawPartialRollback.recommendationKeys),
      toolCallIds: normalizeStringArray(rawPartialRollback.toolCallIds),
      targetIds: normalizeStringArray(rawPartialRollback.targetIds),
    },
  };
}

function normalizeSharedMemoryRecommendation(value: unknown): NonNullable<AgenticPipelineMessageMetadata['sharedMemory']>['actionableRecommendations'][number] | null {
  if (!isRecord(value)) {
    return null;
  }
  const suggestedCapabilities = Array.isArray(value.suggestedCapabilities)
    ? value.suggestedCapabilities.filter((item): item is string => typeof item === 'string')
    : [];
  const suggestedToolNames = Array.isArray(value.suggestedToolNames)
    ? value.suggestedToolNames.filter((item): item is string => typeof item === 'string')
    : [];
  const approvalStatus =
    value.approvalStatus === 'approved' || value.approvalStatus === 'rejected'
      ? value.approvalStatus
      : 'pending';
  return {
    id: typeof value.id === 'string' ? value.id : '',
    approvalKey: typeof value.approvalKey === 'string' ? value.approvalKey : '',
    sourceToolName: typeof value.sourceToolName === 'string' ? value.sourceToolName : '',
    sourceCallId: typeof value.sourceCallId === 'string' ? value.sourceCallId : '',
    summary: typeof value.summary === 'string' ? value.summary : '',
    rationale: typeof value.rationale === 'string' ? value.rationale : '',
    priority:
      value.priority === 'critical' || value.priority === 'normal' || value.priority === 'optional'
        ? value.priority
        : 'normal',
    suggestedDomain: typeof value.suggestedDomain === 'string' ? value.suggestedDomain : 'maintenance',
    suggestedCapabilities,
    suggestedToolNames,
    input: isRecord(value.input) ? value.input : {},
    confidence: typeof value.confidence === 'number' && Number.isFinite(value.confidence) ? value.confidence : 0.5,
    approvalStatus,
  };
}

function normalizeSharedMemory(value: unknown): AgenticPipelineMessageMetadata['sharedMemory'] {
  if (!isRecord(value)) {
    return {
      analyses: [],
      actionableRecommendations: [],
    };
  }
  const actionableRecommendations = Array.isArray(value.actionableRecommendations)
    ? value.actionableRecommendations
        .map(normalizeSharedMemoryRecommendation)
        .filter((item): item is NonNullable<AgenticPipelineMessageMetadata['sharedMemory']>['actionableRecommendations'][number] => Boolean(item))
    : [];
  const analyses = Array.isArray(value.analyses)
    ? value.analyses.reduce<NonNullable<AgenticPipelineMessageMetadata['sharedMemory']>['analyses']>((items, analysis) => {
        if (!isRecord(analysis)) {
          return items;
        }
        items.push({
          id: typeof analysis.id === 'string' ? analysis.id : '',
          toolName: typeof analysis.toolName === 'string' ? analysis.toolName : '',
          callId: typeof analysis.callId === 'string' ? analysis.callId : '',
          stepId: typeof analysis.stepId === 'string' ? analysis.stepId : '',
          agentRole: typeof analysis.agentRole === 'string' ? analysis.agentRole : '',
          scope: typeof analysis.scope === 'string' ? analysis.scope : '',
          summary: typeof analysis.summary === 'string' ? analysis.summary : '',
          output: isRecord(analysis.output) ? analysis.output : {},
          actionableRecommendations: Array.isArray(analysis.actionableRecommendations)
            ? analysis.actionableRecommendations
                .map(normalizeSharedMemoryRecommendation)
                .filter((item): item is NonNullable<AgenticPipelineMessageMetadata['sharedMemory']>['actionableRecommendations'][number] => Boolean(item))
            : [],
          createdAt: typeof analysis.createdAt === 'string' ? analysis.createdAt : '',
        });
        return items;
      }, [])
    : [];

  return {
    analyses,
    actionableRecommendations,
  };
}

function isStoredToolCallEvidence(value: unknown): value is AgenticExecutionToolCallEvidence {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.type === 'string' &&
    typeof value.summary === 'string' &&
    typeof value.timestamp === 'string' &&
    (typeof value.targetId === 'string' || value.targetId === undefined)
  );
}

function normalizeToolCallEvidence(value: AgenticExecutionToolCallEvidence): AgenticExecutionToolCallEvidence {
  return {
    id: value.id,
    type: value.type,
    targetId: typeof value.targetId === 'string' ? value.targetId : undefined,
    summary: value.summary,
    before: value.before,
    after: value.after,
    timestamp: value.timestamp,
  };
}

function isStoredToolCallRecord(value: unknown): value is AgenticExecutionToolCallRecord {
  return (
    isRecord(value) &&
    typeof value.callId === 'string' &&
    typeof value.toolName === 'string' &&
    typeof value.agentRole === 'string' &&
    typeof value.stepId === 'string' &&
    typeof value.success === 'boolean' &&
    typeof value.message === 'string' &&
    typeof value.startedAt === 'string' &&
    typeof value.completedAt === 'string' &&
    Array.isArray(value.evidence)
  );
}

function normalizeToolCallRecord(record: AgenticExecutionToolCallRecord): AgenticExecutionToolCallRecord {
  const rawError = isRecord(record.error) ? record.error : null;
  return {
    callId: record.callId,
    toolName: record.toolName,
    agentRole: record.agentRole,
    stepId: record.stepId,
    success: record.success,
    message: record.message,
    startedAt: record.startedAt,
    completedAt: record.completedAt,
    input: normalizeOptionalObject(record.input),
    output: normalizeOptionalObject(record.output),
    error:
      rawError &&
      typeof rawError.code === 'string' &&
      typeof rawError.message === 'string' &&
      typeof rawError.recoverable === 'boolean'
        ? {
            code: rawError.code,
            message: rawError.message,
            recoverable: rawError.recoverable,
          }
        : null,
    mutatesWorld: typeof record.mutatesWorld === 'boolean' ? record.mutatesWorld : null,
    evidenceContract:
      record.evidenceContract === 'before_after' || record.evidenceContract === 'none'
        ? record.evidenceContract
        : null,
    evidence: Array.isArray(record.evidence)
      ? record.evidence.filter(isStoredToolCallEvidence).map(normalizeToolCallEvidence)
      : [],
  };
}

function isCompleteSnapshotDiff(value: unknown): value is AgenticExecutionSnapshotDiff {
  if (!isRecord(value) || !isRecord(value.semantic) || !isRecord(value.rollbackPreview)) {
    return false;
  }

  const componentChanges = value.semantic.componentChanges;
  return (
    Array.isArray(componentChanges) &&
    componentChanges.every((change) => isRecord(change) && Array.isArray(change.fieldChanges))
  );
}

function createCountDiff(before: number, after: number): AgenticSnapshotCountDiff {
  return {
    before,
    after,
    delta: after - before,
  };
}

function summarizeNamedItem(value: { id: string; name?: string }, fallbackName: string) {
  return {
    id: value.id,
    name: value.name || fallbackName,
  };
}

function normalizeForSignature(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeForSignature);
  }
  if (!isRecord(value)) {
    return value;
  }

  return Object.keys(value)
    .sort()
    .reduce<Record<string, unknown>>((accumulator, key) => {
      accumulator[key] = normalizeForSignature(value[key]);
      return accumulator;
    }, {});
}

function createStableSignature(value: unknown) {
  return JSON.stringify(normalizeForSignature(value));
}

function createCollectionDiff<T extends { id: string; name?: string }>(
  beforeItems: T[],
  afterItems: T[],
  fallbackName: string
): AgenticSnapshotCollectionDiff {
  const beforeMap = new Map(beforeItems.map((item) => [item.id, item]));
  const afterMap = new Map(afterItems.map((item) => [item.id, item]));
  const added: AgenticNamedSnapshotChange[] = [];
  const removed: AgenticNamedSnapshotChange[] = [];
  const changed: AgenticNamedSnapshotChange[] = [];

  for (const item of afterItems) {
    if (!beforeMap.has(item.id)) {
      added.push(summarizeNamedItem(item, fallbackName));
    }
  }

  for (const item of beforeItems) {
    const next = afterMap.get(item.id);
    if (!next) {
      removed.push(summarizeNamedItem(item, fallbackName));
      continue;
    }
    if (createStableSignature(item) !== createStableSignature(next)) {
      changed.push(summarizeNamedItem(next, fallbackName));
    }
  }

  return { added, removed, changed };
}

type SnapshotComponent = {
  type: string;
  data: Record<string, unknown>;
  enabled: boolean;
};

type SnapshotEntity = {
  id: string;
  name: string;
  components: SnapshotComponent[];
};

const semanticComponentLabels = {
  Transform: 'Transform',
  Light: 'Light',
  Collider: 'Collider',
  Script: 'Script',
  MeshRenderer: 'Material',
} as const;

function isSemanticComponentType(type: string): type is keyof typeof semanticComponentLabels {
  return type in semanticComponentLabels;
}

function createComponentMap(entity: SnapshotEntity) {
  return new Map(entity.components.map((component) => [component.type, component]));
}

function changedTopLevelFields(
  beforeData: Record<string, unknown>,
  afterData: Record<string, unknown>
) {
  const keys = new Set([...Object.keys(beforeData), ...Object.keys(afterData)]);
  return [...keys].filter(
    (key) => createStableSignature(beforeData[key]) !== createStableSignature(afterData[key])
  );
}

function componentFieldsForChange(
  beforeComponent: SnapshotComponent | null,
  afterComponent: SnapshotComponent | null
) {
  if (beforeComponent && afterComponent) {
    const fields = changedTopLevelFields(beforeComponent.data, afterComponent.data);
    if (beforeComponent.enabled !== afterComponent.enabled) {
      fields.push('enabled');
    }
    return fields;
  }

  const component = beforeComponent ?? afterComponent;
  return component ? Object.keys(component.data).concat('enabled') : [];
}

function formatSemanticFieldValue(value: unknown): string {
  if (value === undefined) return '(missing)';
  if (value === null) return 'null';
  if (typeof value === 'string') return value.length > 80 ? `${value.slice(0, 77)}...` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  try {
    const serialized = JSON.stringify(normalizeForSignature(value));
    return serialized.length > 120 ? `${serialized.slice(0, 117)}...` : serialized;
  } catch {
    return String(value);
  }
}

function readComponentField(component: SnapshotComponent | null, field: string) {
  if (!component) return undefined;
  if (field === 'enabled') return component.enabled;
  return component.data[field];
}

function componentFieldChangesForChange(
  beforeComponent: SnapshotComponent | null,
  afterComponent: SnapshotComponent | null
): AgenticSemanticFieldChange[] {
  return componentFieldsForChange(beforeComponent, afterComponent).map((field) => ({
    field,
    before: formatSemanticFieldValue(readComponentField(beforeComponent, field)),
    after: formatSemanticFieldValue(readComponentField(afterComponent, field)),
  }));
}

function summarizeComponentChange(change: {
  entityName: string;
  component: AgenticSemanticComponentChange['component'];
  changeType: AgenticSemanticComponentChange['changeType'];
  fields: string[];
}) {
  const action =
    change.changeType === 'added'
      ? 'agregado'
      : change.changeType === 'removed'
        ? 'eliminado'
        : 'modificado';
  const fields = change.fields.length ? `: ${change.fields.slice(0, 5).join(', ')}` : '';
  return `${change.component} ${action} en ${change.entityName}${fields}`;
}

function createSemanticComponentDiff(
  beforeEntities: SnapshotEntity[],
  afterEntities: SnapshotEntity[]
) {
  const beforeMap = new Map(beforeEntities.map((entity) => [entity.id, entity]));
  const afterMap = new Map(afterEntities.map((entity) => [entity.id, entity]));
  const changes: AgenticSemanticComponentChange[] = [];

  for (const entity of afterEntities) {
    const previous = beforeMap.get(entity.id) ?? null;
    const beforeComponents = previous ? createComponentMap(previous) : new Map<string, SnapshotComponent>();
    const afterComponents = createComponentMap(entity);

    for (const [type, afterComponent] of afterComponents) {
      if (!isSemanticComponentType(type)) continue;
      const beforeComponent = beforeComponents.get(type) ?? null;
      const changeType = beforeComponent ? 'changed' : 'added';
      if (changeType === 'changed' && createStableSignature(beforeComponent) === createStableSignature(afterComponent)) {
        continue;
      }

      const component = semanticComponentLabels[type];
      const fieldChanges = componentFieldChangesForChange(beforeComponent, afterComponent);
      const fields = fieldChanges.map((fieldChange) => fieldChange.field);
      changes.push({
        entityId: entity.id,
        entityName: entity.name,
        component,
        changeType,
        fields,
        fieldChanges,
        summary: summarizeComponentChange({
          entityName: entity.name,
          component,
          changeType,
          fields,
        }),
      });
    }
  }

  for (const entity of beforeEntities) {
    const next = afterMap.get(entity.id);
    const nextComponents = next ? createComponentMap(next) : new Map<string, SnapshotComponent>();
    for (const component of entity.components) {
      if (!isSemanticComponentType(component.type) || nextComponents.has(component.type)) {
        continue;
      }
      const label = semanticComponentLabels[component.type];
      const fieldChanges = componentFieldChangesForChange(component, null);
      const fields = fieldChanges.map((fieldChange) => fieldChange.field);
      changes.push({
        entityId: entity.id,
        entityName: entity.name,
        component: label,
        changeType: 'removed',
        fields,
        fieldChanges,
        summary: summarizeComponentChange({
          entityName: entity.name,
          component: label,
          changeType: 'removed',
          fields,
        }),
      });
    }
  }

  return changes;
}

function buildRollbackPreview(params: {
  scenes: AgenticSnapshotCollectionDiff;
  entities: AgenticSnapshotCollectionDiff;
  assets: AgenticSnapshotCollectionDiff;
  componentChanges: AgenticSemanticComponentChange[];
}): AgenticRollbackPreview {
  return {
    willRemove: {
      scenes: params.scenes.added,
      entities: params.entities.added,
      assets: params.assets.added,
    },
    willRestore: {
      scenes: params.scenes.removed,
      entities: params.entities.removed,
      assets: params.assets.removed,
    },
    willRevert: {
      scenes: params.scenes.changed,
      entities: params.entities.changed,
      assets: params.assets.changed,
      components: params.componentChanges,
    },
  };
}

export function buildAgenticExecutionSnapshotDiff(
  before: EditorProjectSaveData,
  after: EditorProjectSaveData
): AgenticExecutionSnapshotDiff {
  const beforeSession = before.custom.snapshot.session;
  const afterSession = after.custom.snapshot.session;
  const scenes = createCollectionDiff(beforeSession.scenes, afterSession.scenes, 'Scene');
  const entities = createCollectionDiff(beforeSession.entities, afterSession.entities, 'Entity');
  const assets = createCollectionDiff(beforeSession.assets, afterSession.assets, 'Asset');
  const componentChanges = createSemanticComponentDiff(
    beforeSession.entities,
    afterSession.entities
  );
  const counts = {
    scenes: createCountDiff(before.custom.sceneCount, after.custom.sceneCount),
    entities: createCountDiff(before.custom.entityCount, after.custom.entityCount),
    assets: createCountDiff(before.custom.assetCount, after.custom.assetCount),
    scribProfiles: createCountDiff(before.custom.scribProfileCount, after.custom.scribProfileCount),
    scribInstances: createCountDiff(before.custom.scribInstanceCount, after.custom.scribInstanceCount),
  };
  const hasCollectionChanges = [scenes, entities, assets].some(
    (item) => item.added.length > 0 || item.removed.length > 0 || item.changed.length > 0
  );
  const hasCountChanges = Object.values(counts).some((item) => item.delta !== 0);
  const rollbackPreview = buildRollbackPreview({
    scenes,
    entities,
    assets,
    componentChanges,
  });

  return {
    hasChanges: hasCollectionChanges || hasCountChanges || componentChanges.length > 0,
    counts,
    scenes,
    entities,
    assets,
    semantic: {
      componentChanges,
    },
    rollbackPreview,
  };
}

function isHistoryRecord(value: unknown): value is AgenticExecutionHistoryRecord {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.userId === 'string' &&
    typeof value.projectKey === 'string' &&
    typeof value.slot === 'string' &&
    typeof value.prompt === 'string' &&
    typeof value.approved === 'boolean' &&
    typeof value.status === 'string' &&
    typeof value.iteration === 'number' &&
    Number.isFinite(value.iteration) &&
    typeof value.createdAt === 'string' &&
    typeof value.completedAt === 'string' &&
    (typeof value.artifactPath === 'string' || value.artifactPath === null) &&
    (isRecord(value.runtimeScaffold) || value.runtimeScaffold === null) &&
    (isRecord(value.validation) || value.validation === null) &&
    isStringArray(value.toolNames) &&
    typeof value.stepCount === 'number' &&
    Number.isFinite(value.stepCount)
  );
}

function normalizeStoredRecord(record: AgenticExecutionHistoryRecord): AgenticExecutionHistoryRecord {
  const rawSnapshots: Record<string, unknown> = isRecord(record.snapshots) ? record.snapshots : {};
  const action = normalizeAction(record.action);
  const toolNames = [...new Set(isStringArray(record.toolNames) ? record.toolNames : [])].sort();
  return {
    ...record,
    action,
    sourceExecutionId:
      typeof record.sourceExecutionId === 'string' && record.sourceExecutionId.trim()
        ? record.sourceExecutionId.trim()
        : null,
    recommendationExecution: normalizeRecommendationExecutionLink(record.recommendationExecution),
    snapshots: {
      before: rawSnapshots.before === true,
      after: rawSnapshots.after === true,
    },
    toolNames,
    agentRoles: [...new Set(isStringArray(record.agentRoles) ? record.agentRoles : [])].sort(),
    steps: Array.isArray(record.steps) ? record.steps.filter(isStoredStep) : [],
    toolStats: Array.isArray(record.toolStats)
      ? record.toolStats.filter(isStoredToolStat)
      : toolNames.map((name) => ({
          name,
          successCount: 0,
          failureCount: 0,
        })),
    traces: Array.isArray(record.traces) ? record.traces.filter(isStoredTrace) : [],
    sharedMemory: normalizeSharedMemory(record.sharedMemory),
    toolCalls: Array.isArray(record.toolCalls)
      ? record.toolCalls.filter(isStoredToolCallRecord).map(normalizeToolCallRecord)
      : [],
    diff: isCompleteSnapshotDiff(record.diff) ? record.diff : null,
  };
}

function readHistoryFile(filePath: string): AgenticExecutionHistoryRecord[] {
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter(isHistoryRecord).map(normalizeStoredRecord)
      : [];
  } catch {
    return [];
  }
}

function writeHistoryFile(filePath: string, records: AgenticExecutionHistoryRecord[]) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  writeFileSync(tempPath, JSON.stringify(records, null, 2), 'utf-8');
  try {
    renameSync(tempPath, filePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === 'EEXIST' || code === 'EPERM' || code === 'ENOTEMPTY') {
      rmSync(filePath, { force: true });
      renameSync(tempPath, filePath);
      return;
    }
    rmSync(tempPath, { force: true });
    throw error;
  }
}

function writeJsonFile(filePath: string, value: unknown) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  writeFileSync(tempPath, JSON.stringify(value, null, 2), 'utf-8');
  try {
    renameSync(tempPath, filePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === 'EEXIST' || code === 'EPERM' || code === 'ENOTEMPTY') {
      rmSync(filePath, { force: true });
      renameSync(tempPath, filePath);
      return;
    }
    rmSync(tempPath, { force: true });
    throw error;
  }
}

function emptyRecommendationMutationIndex(projectKey: string, slot: string): AgenticRecommendationMutationIndex {
  return {
    version: 1,
    projectKey: normalizeProjectKey(projectKey),
    slot: sanitizeSlot(slot),
    updatedAt: new Date(0).toISOString(),
    recommendations: {},
  };
}

function withRecommendationMutationIndexChecksum(
  index: AgenticRecommendationMutationIndex
): AgenticRecommendationMutationIndex {
  const checksum = createAgenticRecommendationMutationIndexChecksum(index);
  return {
    ...index,
    checksum: {
      ...checksum,
      updatedAt: new Date().toISOString(),
    },
  };
}

function isRecommendationMutationIndexAuditTrail(
  value: unknown
): value is NonNullable<AgenticRecommendationMutationIndex['integrityAuditTrail']> {
  return (
    value === undefined ||
    (
      Array.isArray(value) &&
      value.every((item) =>
        isRecord(item) &&
        typeof item.id === 'string' &&
        (
          item.action === 'checksum_recalculated' ||
          item.action === 'history_reindexed' ||
          item.action === 'history_reindexed_full' ||
          item.action === 'history_reindexed_partial'
        ) &&
        item.actor === 'user' &&
        typeof item.requestedBy === 'string' &&
        typeof item.repairedAt === 'string' &&
        typeof item.reason === 'string' &&
        (
          item.previousIntegrityStatus === 'valid' ||
          item.previousIntegrityStatus === 'mismatch' ||
          item.previousIntegrityStatus === 'missing'
        ) &&
        (
          item.previousChecksum === null ||
          (
            isRecord(item.previousChecksum) &&
            item.previousChecksum.algorithm === 'sha256' &&
            typeof item.previousChecksum.value === 'string' &&
            (
              typeof item.previousChecksum.updatedAt === 'string' ||
              item.previousChecksum.updatedAt === undefined
            )
          )
        ) &&
        isRecord(item.previousComputedChecksum) &&
        item.previousComputedChecksum.algorithm === 'sha256' &&
        typeof item.previousComputedChecksum.value === 'string'
      )
    )
  );
}

function isRecommendationMutationIndex(value: unknown): value is AgenticRecommendationMutationIndex {
  return (
    isRecord(value) &&
    value.version === 1 &&
    typeof value.projectKey === 'string' &&
    typeof value.slot === 'string' &&
    typeof value.updatedAt === 'string' &&
    (
      value.checksum === undefined ||
      (
        isRecord(value.checksum) &&
        value.checksum.algorithm === 'sha256' &&
        typeof value.checksum.value === 'string' &&
        typeof value.checksum.updatedAt === 'string'
      )
    ) &&
    isRecommendationMutationIndexAuditTrail(value.integrityAuditTrail) &&
    isRecord(value.recommendations)
  );
}

export function readAgenticRecommendationMutationIndex(params: {
  userId: string;
  projectKey: string;
  slot: string;
}): AgenticRecommendationMutationIndex {
  const projectKey = normalizeProjectKey(params.projectKey);
  const slot = sanitizeSlot(params.slot);
  try {
    const parsed = JSON.parse(
      readFileSync(getRecommendationMutationIndexFilePath(params.userId, projectKey, slot), 'utf-8')
    ) as unknown;
    return isRecommendationMutationIndex(parsed)
      ? parsed
      : emptyRecommendationMutationIndex(projectKey, slot);
  } catch {
    return emptyRecommendationMutationIndex(projectKey, slot);
  }
}

function indexedRecommendationExecutionIds(index: AgenticRecommendationMutationIndex) {
  return Object.values(index.recommendations).flatMap((entry) =>
    entry.executions.map((execution) => execution.executionId)
  );
}

function latestIndexableRecommendationExecutionId(records: AgenticExecutionHistoryRecord[]) {
  return (
    records.find(
      (record) =>
        record.action === 'approved_recommendations' &&
        (record.recommendationExecution?.unlockedMutations.length ?? 0) > 0
    )?.id ?? null
  );
}

function indexableRecommendationExecutionIds(records: AgenticExecutionHistoryRecord[]) {
  return records
    .filter(
      (record) =>
        record.action === 'approved_recommendations' &&
        (record.recommendationExecution?.unlockedMutations.length ?? 0) > 0
    )
    .map((record) => record.id);
}

function latestIndexedRecommendationExecutionId(
  index: AgenticRecommendationMutationIndex,
  records: AgenticExecutionHistoryRecord[]
) {
  const executionIds = indexedRecommendationExecutionIds(index);
  const indexedIds = new Set(executionIds);
  return records.find((record) => indexedIds.has(record.id))?.id ?? executionIds[0] ?? null;
}

function countRecommendationMutationIndexAuditActions(
  auditTrail: AgenticRecommendationMutationIndex['integrityAuditTrail']
) {
  const counts = {
    checksumRepairCount: 0,
    historyReindexedFullCount: 0,
    historyReindexedPartialCount: 0,
    legacyHistoryReindexedCount: 0,
  };

  for (const entry of auditTrail ?? []) {
    if (entry.action === 'checksum_recalculated') {
      counts.checksumRepairCount += 1;
    } else if (entry.action === 'history_reindexed_full') {
      counts.historyReindexedFullCount += 1;
    } else if (entry.action === 'history_reindexed_partial') {
      counts.historyReindexedPartialCount += 1;
    } else if (entry.action === 'history_reindexed') {
      counts.legacyHistoryReindexedCount += 1;
    }
  }

  return counts;
}

export function createAgenticRecommendationMutationIndexStatus(params: {
  index: AgenticRecommendationMutationIndex;
  records: AgenticExecutionHistoryRecord[];
  requireStoredChecksum?: boolean;
}) {
  const integrity = createAgenticRecommendationMutationIndexIntegrity(params.index, {
    requireStoredChecksum: params.requireStoredChecksum ?? true,
  });
  const latestRepair = params.index.integrityAuditTrail?.[0] ?? null;
  const recommendationCount = Object.keys(params.index.recommendations).length;
  const lastIndexedExecutionId = latestIndexedRecommendationExecutionId(params.index, params.records);
  const latestIndexableExecutionId = latestIndexableRecommendationExecutionId(params.records);
  const indexedIds = new Set(indexedRecommendationExecutionIds(params.index));
  const pendingIndexableExecutionIds = indexableRecommendationExecutionIds(params.records).filter(
    (executionId) => !indexedIds.has(executionId)
  );
  const pendingIndexableExecutionCount = pendingIndexableExecutionIds.length;
  const indexBehind = pendingIndexableExecutionCount > 0;
  const auditActionCounts = countRecommendationMutationIndexAuditActions(params.index.integrityAuditTrail);

  return {
    recommendationCount,
    lastIndexedExecutionId,
    latestIndexableExecutionId,
    pendingIndexableExecutionCount,
    pendingIndexableExecutionIds,
    indexBehind,
    integrity,
    mutationIndexAudit: {
      repairCount: params.index.integrityAuditTrail?.length ?? 0,
      ...auditActionCounts,
      latestRepairId: latestRepair?.id ?? null,
      latestRepairAt: latestRepair?.repairedAt ?? null,
      integrityStatus: integrity.status,
      integrityValid: integrity.valid,
      recommendationCount,
      lastIndexedExecutionId,
      latestIndexableExecutionId,
      pendingIndexableExecutionCount,
      pendingIndexableExecutionIds,
      indexBehind,
    },
  };
}

export function writeAgenticRecommendationMutationIndexEntry(params: {
  userId: string;
  projectKey: string;
  slot: string;
  executionId: string;
  sourceExecutionId: string;
  recommendationId: string;
  recommendationKey: string;
  summary: string;
  toolCalls: Array<{
    toolCallId: string;
    toolName: string;
    evidenceIds: string[];
    targetIds: string[];
  }>;
}) {
  const projectKey = normalizeProjectKey(params.projectKey);
  const slot = sanitizeSlot(params.slot);
  const index = readAgenticRecommendationMutationIndex({
    userId: params.userId,
    projectKey,
    slot,
  });
  const key = params.recommendationKey || params.recommendationId;
  const current = index.recommendations[key] ?? {
    recommendationId: params.recommendationId,
    recommendationKey: key,
    summary: params.summary,
    executions: [],
  };
  const nextExecution = {
    executionId: params.executionId,
    sourceExecutionId: params.sourceExecutionId,
    toolCalls: params.toolCalls,
    partialRollbackAppliedAt: null,
  };
  index.recommendations[key] = {
    ...current,
    recommendationId: params.recommendationId,
    recommendationKey: key,
    summary: params.summary || current.summary,
    executions: [
      nextExecution,
      ...current.executions.filter((execution) => execution.executionId !== params.executionId),
    ],
  };
  index.updatedAt = new Date().toISOString();
  const nextIndex = withRecommendationMutationIndexChecksum(index);
  writeJsonFile(getRecommendationMutationIndexFilePath(params.userId, projectKey, slot), nextIndex);
  return nextIndex;
}

function approvedRecommendationEntriesForRecord(record: AgenticExecutionHistoryRecord) {
  const link = record.recommendationExecution;
  if (record.action !== 'approved_recommendations' || !link) {
    return [];
  }
  const fallbackRecommendations = link.recommendationKeys.map((key, index) => ({
    id: link.recommendationIds[index] ?? key,
    approvalKey: key,
    summary: `Approved recommendation ${key}`,
  }));
  const recommendations = link.recommendations.length > 0
    ? link.recommendations
    : fallbackRecommendations;
  const singleRecommendation = recommendations.length === 1 ? recommendations[0] : null;

  return recommendations.flatMap((recommendation) => {
    const key = recommendation.approvalKey || recommendation.id;
    const toolCalls = link.unlockedMutations
      .filter((mutation) =>
        mutation.recommendationKeys.includes(key) ||
        mutation.recommendationIds.includes(recommendation.id) ||
        (
          Boolean(singleRecommendation) &&
          mutation.recommendationKeys.length === 0 &&
          mutation.recommendationIds.length === 0
        )
      )
      .map((mutation) => ({
        toolCallId: mutation.toolCallId,
        toolName: mutation.toolName,
        evidenceIds: mutation.evidenceIds,
        targetIds: mutation.targets.map((target) => target.id),
      }));
    if (toolCalls.length === 0) {
      return [];
    }
    const partialRollbackAppliedAt =
      link.partialRollback.applied &&
      (
        link.partialRollback.recommendationKeys.includes(key) ||
        link.partialRollback.recommendationIds.includes(recommendation.id)
      )
        ? link.partialRollback.appliedAt
        : null;

    return [
      {
        recommendationId: recommendation.id,
        recommendationKey: key,
        summary: recommendation.summary,
        execution: {
          executionId: record.id,
          sourceExecutionId: link.sourceExecutionId || record.sourceExecutionId || '',
          toolCalls,
          partialRollbackAppliedAt,
        },
      },
    ];
  });
}

export function reindexAgenticRecommendationMutationIndexFromHistory(params: {
  userId: string;
  projectKey: string;
  slot: string;
  reason?: string;
  executionId?: string;
}) {
  const projectKey = normalizeProjectKey(params.projectKey);
  const slot = sanitizeSlot(params.slot);
  const reindexedAt = new Date().toISOString();
  const previousIndex = readAgenticRecommendationMutationIndex({
    userId: params.userId,
    projectKey,
    slot,
  });
  const previousIntegrity = createAgenticRecommendationMutationIndexIntegrity(previousIndex, {
    requireStoredChecksum: true,
  });
  const records = readHistoryFile(getHistoryFilePath(params.userId, projectKey, slot));
  const selectedExecutionId = params.executionId?.trim() || '';
  const recordsToIndex = selectedExecutionId
    ? records.filter((record) => record.id === selectedExecutionId)
    : records;
  const nextIndex = selectedExecutionId
    ? {
        ...previousIndex,
        recommendations: Object.fromEntries(
          Object.entries(previousIndex.recommendations).flatMap(([key, entry]) => {
            const executions = entry.executions.filter(
              (execution) => execution.executionId !== selectedExecutionId
            );
            return executions.length > 0
              ? [[key, { ...entry, executions }]]
              : [];
          })
        ),
      }
    : emptyRecommendationMutationIndex(projectKey, slot);
  const indexedExecutionIds = new Set<string>();

  for (const record of recordsToIndex) {
    for (const entry of approvedRecommendationEntriesForRecord(record)) {
      const current = nextIndex.recommendations[entry.recommendationKey] ?? {
        recommendationId: entry.recommendationId,
        recommendationKey: entry.recommendationKey,
        summary: entry.summary,
        executions: [],
      };
      if (current.executions.some((execution) => execution.executionId === entry.execution.executionId)) {
        continue;
      }
      nextIndex.recommendations[entry.recommendationKey] = {
        ...current,
        recommendationId: entry.recommendationId,
        recommendationKey: entry.recommendationKey,
        summary: entry.summary || current.summary,
        executions: [
          ...current.executions,
          entry.execution,
        ],
      };
      indexedExecutionIds.add(entry.execution.executionId);
    }
  }

  const auditEntry: NonNullable<AgenticRecommendationMutationIndex['integrityAuditTrail']>[number] = {
    id: `mutation-index-reindex-${reindexedAt.replace(/[^0-9a-z]/gi, '')}`,
    action: selectedExecutionId ? 'history_reindexed_partial' : 'history_reindexed_full',
    actor: 'user',
    requestedBy: params.userId,
    repairedAt: reindexedAt,
    reason: params.reason?.trim() || 'manual_history_reindex',
    previousIntegrityStatus: previousIntegrity.status,
    previousChecksum: previousIntegrity.stored,
    previousComputedChecksum: previousIntegrity.computed,
  };
  const indexedIndex = withRecommendationMutationIndexChecksum({
    ...nextIndex,
    updatedAt: reindexedAt,
    integrityAuditTrail: [
      auditEntry,
      ...(previousIndex.integrityAuditTrail ?? []),
    ].slice(0, 100),
  });
  writeJsonFile(getRecommendationMutationIndexFilePath(params.userId, projectKey, slot), indexedIndex);

  return {
    index: indexedIndex,
    previousIntegrity,
    integrity: createAgenticRecommendationMutationIndexIntegrity(indexedIndex, {
      requireStoredChecksum: true,
    }),
    auditEntry,
    indexedExecutionCount: indexedExecutionIds.size,
    indexedExecutionIds: [...indexedExecutionIds],
    recommendationCount: Object.keys(indexedIndex.recommendations).length,
  };
}

export function repairAgenticRecommendationMutationIndexChecksum(params: {
  userId: string;
  projectKey: string;
  slot: string;
  reason?: string;
}) {
  const projectKey = normalizeProjectKey(params.projectKey);
  const slot = sanitizeSlot(params.slot);
  const repairedAt = new Date().toISOString();
  const index = readAgenticRecommendationMutationIndex({
    userId: params.userId,
    projectKey,
    slot,
  });
  const previousIntegrity = createAgenticRecommendationMutationIndexIntegrity(index, {
    requireStoredChecksum: true,
  });
  const auditEntry: NonNullable<AgenticRecommendationMutationIndex['integrityAuditTrail']>[number] = {
    id: `mutation-index-repair-${repairedAt.replace(/[^0-9a-z]/gi, '')}`,
    action: 'checksum_recalculated',
    actor: 'user',
    requestedBy: params.userId,
    repairedAt,
    reason: params.reason?.trim() || 'manual_integrity_repair',
    previousIntegrityStatus: previousIntegrity.status,
    previousChecksum: previousIntegrity.stored,
    previousComputedChecksum: previousIntegrity.computed,
  };
  const nextIndex = withRecommendationMutationIndexChecksum({
    ...index,
    updatedAt: repairedAt,
    integrityAuditTrail: [
      auditEntry,
      ...(index.integrityAuditTrail ?? []),
    ].slice(0, 100),
  });
  writeJsonFile(getRecommendationMutationIndexFilePath(params.userId, projectKey, slot), nextIndex);

  return {
    index: nextIndex,
    previousIntegrity,
    integrity: createAgenticRecommendationMutationIndexIntegrity(nextIndex, {
      requireStoredChecksum: true,
    }),
    auditEntry,
  };
}

export function markAgenticRecommendationMutationIndexRollback(params: {
  userId: string;
  projectKey: string;
  slot: string;
  executionId: string;
  recommendationKeys: string[];
  appliedAt: string;
}) {
  const projectKey = normalizeProjectKey(params.projectKey);
  const slot = sanitizeSlot(params.slot);
  const index = readAgenticRecommendationMutationIndex({
    userId: params.userId,
    projectKey,
    slot,
  });
  const keys = new Set(params.recommendationKeys);
  for (const [key, entry] of Object.entries(index.recommendations)) {
    if (keys.size > 0 && !keys.has(key)) {
      continue;
    }
    index.recommendations[key] = {
      ...entry,
      executions: entry.executions.map((execution) =>
        execution.executionId === params.executionId
          ? {
              ...execution,
              partialRollbackAppliedAt: params.appliedAt,
            }
          : execution
      ),
    };
  }
  index.updatedAt = params.appliedAt;
  const nextIndex = withRecommendationMutationIndexChecksum(index);
  writeJsonFile(getRecommendationMutationIndexFilePath(params.userId, projectKey, slot), nextIndex);
  return nextIndex;
}

function normalizeRecord(record: AgenticExecutionHistoryRecord): AgenticExecutionHistoryRecord {
  return {
    ...record,
    projectKey: normalizeProjectKey(record.projectKey),
    slot: sanitizeSlot(record.slot),
    toolNames: [...new Set(record.toolNames)].sort(),
    agentRoles: [...new Set(isStringArray(record.agentRoles) ? record.agentRoles : [])].sort(),
    steps: Array.isArray(record.steps) ? record.steps.filter(isStoredStep) : [],
    toolStats: Array.isArray(record.toolStats)
      ? record.toolStats.filter(isStoredToolStat).sort((left, right) => left.name.localeCompare(right.name))
      : [],
    traces: Array.isArray(record.traces) ? record.traces.filter(isStoredTrace) : [],
    sharedMemory: normalizeSharedMemory(record.sharedMemory),
    toolCalls: Array.isArray(record.toolCalls)
      ? record.toolCalls.filter(isStoredToolCallRecord).map(normalizeToolCallRecord)
      : [],
    prompt: record.prompt.trim(),
    action: normalizeAction(record.action),
    sourceExecutionId: record.sourceExecutionId?.trim() || null,
    recommendationExecution: normalizeRecommendationExecutionLink(record.recommendationExecution),
    snapshots: {
      before: record.snapshots?.before === true,
      after: record.snapshots?.after === true,
    },
    diff: record.diff ?? null,
  };
}

function normalizeSearchTerm(value: string | null | undefined) {
  return (value || '').trim().toLowerCase().slice(0, 160);
}

function normalizeHistoryFilter(value: string | null | undefined): AgenticExecutionHistoryFilter {
  const normalized = (value || '').trim().toLowerCase();
  if (
    normalized === 'approved' ||
    normalized === 'rejected' ||
    normalized === 'replay' ||
    normalized === 'rollbackable' ||
    normalized === 'pending_index'
  ) {
    return normalized;
  }
  return 'all';
}

function recordMatchesHistoryFilter(
  record: AgenticExecutionHistoryRecord,
  historyFilter: AgenticExecutionHistoryFilter,
  pendingIndexableExecutionIds: Set<string>
) {
  if (historyFilter === 'approved') {
    return record.approved;
  }
  if (historyFilter === 'rejected') {
    return !record.approved;
  }
  if (historyFilter === 'replay') {
    return record.action === 'replay';
  }
  if (historyFilter === 'rollbackable') {
    return record.snapshots?.before === true;
  }
  if (historyFilter === 'pending_index') {
    return pendingIndexableExecutionIds.has(record.id);
  }
  return true;
}

function recordMatchesToolAndAgentFilters(
  record: AgenticExecutionHistoryRecord,
  filters: {
    toolFilter: string;
    agentFilter: string;
  }
) {
  const matchesTool =
    !filters.toolFilter ||
    filters.toolFilter === 'all' ||
    (record.toolNames ?? []).some((toolName) => toolName.toLowerCase() === filters.toolFilter) ||
    (record.toolCalls ?? []).some((toolCall) => toolCall.toolName.toLowerCase() === filters.toolFilter) ||
    (record.toolStats ?? []).some((tool) => tool.name.toLowerCase() === filters.toolFilter);
  const matchesAgent =
    !filters.agentFilter ||
    filters.agentFilter === 'all' ||
    (record.agentRoles ?? []).some((agentRole) => agentRole.toLowerCase() === filters.agentFilter) ||
    (record.steps ?? []).some((step) => step.agentRole.toLowerCase() === filters.agentFilter) ||
    (record.toolCalls ?? []).some((toolCall) => toolCall.agentRole.toLowerCase() === filters.agentFilter);
  return matchesTool && matchesAgent;
}

function toolFilterValuesForRecord(record: AgenticExecutionHistoryRecord) {
  return [
    ...(record.toolNames ?? []),
    ...(record.toolStats ?? []).map((tool) => tool.name),
    ...(record.toolCalls ?? []).map((toolCall) => toolCall.toolName),
  ].filter((value) => value.trim().length > 0);
}

function agentFilterValuesForRecord(record: AgenticExecutionHistoryRecord) {
  return [
    ...(record.agentRoles ?? []),
    ...(record.steps ?? []).map((step) => step.agentRole),
    ...(record.toolCalls ?? []).map((toolCall) => toolCall.agentRole),
  ].filter((value) => value.trim().length > 0);
}

function createHistoryFilterOptions(records: AgenticExecutionHistoryRecord[]): AgenticExecutionHistoryFilterOptions {
  return {
    tools: [...new Set(records.flatMap(toolFilterValuesForRecord))].sort(),
    agents: [...new Set(records.flatMap(agentFilterValuesForRecord))].sort(),
  };
}

function createHistoryFilterCounts(
  records: AgenticExecutionHistoryRecord[],
  pendingIndexableExecutionIds: Set<string>
): AgenticExecutionHistoryFilterCounts {
  return records.reduce<AgenticExecutionHistoryFilterCounts>(
    (counts, record) => {
      counts.total += 1;
      if (record.approved) {
        counts.approved += 1;
      } else {
        counts.rejected += 1;
      }
      if (record.action === 'replay') {
        counts.replay += 1;
      }
      if (record.snapshots?.before === true) {
        counts.rollbackable += 1;
      }
      if (pendingIndexableExecutionIds.has(record.id)) {
        counts.pendingIndex += 1;
      }
      return counts;
    },
    {
      total: 0,
      approved: 0,
      rejected: 0,
      replay: 0,
      rollbackable: 0,
      pendingIndex: 0,
    }
  );
}

function recordMatchesTraceFilters(record: AgenticExecutionHistoryRecord, filters: {
  traceEvent: string;
  traceActor: string;
  traceSeverity: string;
}) {
  if (!filters.traceEvent && !filters.traceActor && !filters.traceSeverity) {
    return true;
  }

  return (record.traces ?? []).some((trace) => {
    const eventMatches =
      !filters.traceEvent || trace.eventType.toLowerCase().includes(filters.traceEvent);
    const actorMatches =
      !filters.traceActor || trace.actor.toLowerCase().includes(filters.traceActor);
    const severityMatches =
      !filters.traceSeverity || trace.severity.toLowerCase() === filters.traceSeverity;
    return eventMatches && actorMatches && severityMatches;
  });
}

function searchTextForRecord(record: AgenticExecutionHistoryRecord) {
  const validation = record.validation;
  const diffSummaries = record.diff?.semantic.componentChanges.map((change) => change.summary) ?? [];
  return [
    record.id,
    record.prompt,
    record.projectKey,
    record.slot,
    record.status,
    record.action,
    record.sourceExecutionId ?? '',
    record.recommendationExecution?.sourceExecutionId ?? '',
    ...(record.recommendationExecution?.recommendations ?? []).flatMap((recommendation) => [
      recommendation.id,
      recommendation.approvalKey,
      recommendation.summary,
    ]),
    ...(record.recommendationExecution?.unlockedMutations ?? []).flatMap((mutation) => [
      mutation.toolCallId,
      mutation.toolName,
      mutation.stepId,
      ...mutation.recommendationIds,
      ...mutation.recommendationKeys,
      ...mutation.evidenceIds,
      ...mutation.targets.flatMap((target) => [target.id, target.type, target.summary]),
    ]),
    record.artifactPath ?? '',
    ...record.toolNames,
    ...record.agentRoles,
    ...(record.steps ?? []).flatMap((step) => [step.title, step.agentRole, step.status]),
    ...(record.toolStats ?? []).map((tool) => tool.name),
    ...(record.toolCalls ?? []).flatMap((toolCall) => [
      toolCall.callId,
      toolCall.toolName,
      toolCall.agentRole,
      toolCall.stepId,
      toolCall.success ? 'success' : 'failure',
      toolCall.message,
      ...(toolCall.evidence ?? []).flatMap((evidence) => [
        evidence.id,
        evidence.type,
        evidence.targetId ?? '',
        evidence.summary,
      ]),
    ]),
    ...(record.traces ?? []).flatMap((trace) => [
      trace.eventType,
      trace.severity,
      trace.actor,
      trace.message,
      trace.stepId ?? '',
      trace.toolCallId ?? '',
    ]),
    ...(record.sharedMemory?.analyses ?? []).flatMap((analysis) => [
      analysis.toolName,
      analysis.agentRole,
      analysis.scope,
      analysis.summary,
    ]),
    ...(record.sharedMemory?.actionableRecommendations ?? []).flatMap((recommendation) => [
      recommendation.id,
      recommendation.approvalKey,
      recommendation.approvalStatus,
      recommendation.summary,
      recommendation.rationale,
      recommendation.suggestedDomain,
      ...recommendation.suggestedToolNames,
    ]),
    ...(validation?.matchedRequirements ?? []),
    ...(validation?.missingRequirements ?? []),
    ...(validation?.incorrectOutputs ?? []),
    ...diffSummaries,
  ].join(' ').toLowerCase();
}

function recordMatchesSearch(record: AgenticExecutionHistoryRecord, search: string) {
  if (!search) return true;
  return searchTextForRecord(record).includes(search);
}

export function appendAgenticExecutionHistoryRecord(
  record: AgenticExecutionHistoryRecord,
  limit = DEFAULT_HISTORY_LIMIT
) {
  const normalized = normalizeRecord(record);
  const filePath = getHistoryFilePath(normalized.userId, normalized.projectKey, normalized.slot);
  const current = readHistoryFile(filePath);
  const next = [
    normalized,
    ...current.filter((item) => item.id !== normalized.id),
  ].slice(0, Math.max(1, limit));
  writeHistoryFile(filePath, next);
  return normalized;
}

export function updateAgenticExecutionHistoryRecord(params: {
  userId: string;
  projectKey: string;
  slot: string;
  executionId: string;
  update: (record: AgenticExecutionHistoryRecord) => AgenticExecutionHistoryRecord;
}) {
  const projectKey = normalizeProjectKey(params.projectKey);
  const slot = sanitizeSlot(params.slot);
  const filePath = getHistoryFilePath(params.userId, projectKey, slot);
  const current = readHistoryFile(filePath);
  let updatedRecord: AgenticExecutionHistoryRecord | null = null;
  const next = current.map((record) => {
    if (record.id !== params.executionId) {
      return record;
    }
    updatedRecord = normalizeRecord(params.update(record));
    return updatedRecord;
  });

  if (!updatedRecord) {
    return null;
  }

  writeHistoryFile(filePath, next);
  return updatedRecord;
}

export type AgenticRecommendationDecision = 'approved' | 'rejected';

export type AgenticRecommendationDecisionUpdateResult = {
  record: AgenticExecutionHistoryRecord;
  recommendation: NonNullable<AgenticPipelineMessageMetadata['sharedMemory']>['actionableRecommendations'][number];
};

function recommendationMatches(
  recommendation: NonNullable<AgenticPipelineMessageMetadata['sharedMemory']>['actionableRecommendations'][number],
  recommendationId: string
) {
  return recommendation.id === recommendationId || recommendation.approvalKey === recommendationId;
}

function updateSharedMemoryRecommendationDecision(
  memory: AgenticPipelineMessageMetadata['sharedMemory'],
  recommendationId: string,
  decision: AgenticRecommendationDecision
): {
  sharedMemory: AgenticPipelineMessageMetadata['sharedMemory'];
  recommendation: NonNullable<AgenticPipelineMessageMetadata['sharedMemory']>['actionableRecommendations'][number] | null;
} {
  const normalizedMemory = normalizeSharedMemory(memory) ?? {
    analyses: [],
    actionableRecommendations: [],
  };
  let updatedRecommendation: NonNullable<AgenticPipelineMessageMetadata['sharedMemory']>['actionableRecommendations'][number] | null = null;
  const updateRecommendation = (
    recommendation: NonNullable<AgenticPipelineMessageMetadata['sharedMemory']>['actionableRecommendations'][number]
  ) => {
    if (!recommendationMatches(recommendation, recommendationId)) {
      return recommendation;
    }
    const updated = {
      ...recommendation,
      approvalStatus: decision,
    };
    updatedRecommendation = updated;
    return updated;
  };

  const actionableRecommendations = normalizedMemory.actionableRecommendations.map(updateRecommendation);
  const analyses = normalizedMemory.analyses.map((analysis) => ({
    ...analysis,
    actionableRecommendations: analysis.actionableRecommendations.map(updateRecommendation),
  }));

  return {
    sharedMemory: {
      analyses,
      actionableRecommendations,
    },
    recommendation: updatedRecommendation,
  };
}

export function updateAgenticExecutionRecommendationDecision(params: {
  userId: string;
  projectKey: string;
  slot: string;
  executionId?: string | null;
  recommendationId: string;
  decision: AgenticRecommendationDecision;
}): AgenticRecommendationDecisionUpdateResult | null {
  const projectKey = normalizeProjectKey(params.projectKey);
  const slot = sanitizeSlot(params.slot);
  const recommendationId = decodeURIComponent(params.recommendationId).trim();
  if (!recommendationId) {
    return null;
  }

  const filePath = getHistoryFilePath(params.userId, projectKey, slot);
  const current = readHistoryFile(filePath);
  let updatedResult: AgenticRecommendationDecisionUpdateResult | null = null;
  const next = current.map((record) => {
    if (updatedResult || (params.executionId && record.id !== params.executionId)) {
      return record;
    }
    const updated = updateSharedMemoryRecommendationDecision(
      record.sharedMemory,
      recommendationId,
      params.decision
    );
    if (!updated.recommendation) {
      return record;
    }

    const timestamp = new Date().toISOString();
    const updatedRecord = normalizeRecord({
      ...record,
      sharedMemory: updated.sharedMemory,
      traces: [
        ...(record.traces ?? []),
        {
          eventType: params.decision === 'approved' ? 'recommendation.approved' : 'recommendation.rejected',
          severity: 'info',
          actor: 'user',
          message: `Recommendation ${updated.recommendation.approvalKey || updated.recommendation.id} ${params.decision}.`,
          data: {
            recommendationId: updated.recommendation.id,
            approvalKey: updated.recommendation.approvalKey,
            decision: params.decision,
            suggestedToolNames: updated.recommendation.suggestedToolNames,
          },
          timestamp,
        },
      ],
    });
    updatedResult = {
      record: updatedRecord,
      recommendation: updated.recommendation,
    };
    return updatedRecord;
  });

  if (!updatedResult) {
    return null;
  }

  writeHistoryFile(filePath, next);
  return updatedResult;
}

export function listAgenticExecutionHistoryRecords(params: {
  userId: string;
  projectKey: string;
  slot: string;
  limit?: number;
}) {
  return listAgenticExecutionHistoryPage({
    ...params,
    offset: 0,
  }).records;
}

export function listAgenticExecutionHistoryPage(params: {
  userId: string;
  projectKey: string;
  slot: string;
  limit?: number;
  offset?: number;
  search?: string;
  historyFilter?: string;
  toolFilter?: string;
  agentFilter?: string;
  pendingIndexableExecutionIds?: string[];
  traceEvent?: string;
  traceActor?: string;
  traceSeverity?: string;
}): AgenticExecutionHistoryPage {
  const filePath = getHistoryFilePath(
    params.userId,
    normalizeProjectKey(params.projectKey),
    sanitizeSlot(params.slot)
  );
  const limit = Math.max(1, Math.min(200, params.limit ?? DEFAULT_HISTORY_LIMIT));
  const offset = Math.max(0, Math.floor(params.offset ?? 0));
  const search = normalizeSearchTerm(params.search);
  const historyFilter = normalizeHistoryFilter(params.historyFilter);
  const toolFilter = normalizeSearchTerm(params.toolFilter);
  const agentFilter = normalizeSearchTerm(params.agentFilter);
  const pendingIndexableExecutionIds = new Set(params.pendingIndexableExecutionIds ?? []);
  const traceEvent = normalizeSearchTerm(params.traceEvent);
  const traceActor = normalizeSearchTerm(params.traceActor);
  const traceSeverity = normalizeSearchTerm(params.traceSeverity);
  const records = readHistoryFile(filePath);
  const recordsForFilterOptions = records.filter(
    (record) =>
      recordMatchesSearch(record, search) &&
      recordMatchesHistoryFilter(record, historyFilter, pendingIndexableExecutionIds) &&
      recordMatchesTraceFilters(record, { traceEvent, traceActor, traceSeverity })
  );
  const recordsForFilterCounts = records.filter(
    (record) =>
      recordMatchesSearch(record, search) &&
      recordMatchesToolAndAgentFilters(record, { toolFilter, agentFilter }) &&
      recordMatchesTraceFilters(record, { traceEvent, traceActor, traceSeverity })
  );
  const filtered = records.filter(
    (record) =>
      recordMatchesSearch(record, search) &&
      recordMatchesHistoryFilter(record, historyFilter, pendingIndexableExecutionIds) &&
      recordMatchesToolAndAgentFilters(record, { toolFilter, agentFilter }) &&
      recordMatchesTraceFilters(record, { traceEvent, traceActor, traceSeverity })
  );
  return {
    records: filtered.slice(offset, offset + limit).map((record) =>
    record.diff ? record : enrichRecordWithSnapshotDiff(record)
    ),
    totalRecords: records.length,
    filteredRecords: filtered.length,
    limit,
    offset,
    search,
    historyFilter,
    toolFilter,
    agentFilter,
    traceEvent,
    traceActor,
    traceSeverity,
    filterOptions: createHistoryFilterOptions(recordsForFilterOptions),
    filterCounts: createHistoryFilterCounts(recordsForFilterCounts, pendingIndexableExecutionIds),
  };
}

function enrichRecordWithSnapshotDiff(record: AgenticExecutionHistoryRecord) {
  if (!record.snapshots.before || !record.snapshots.after) {
    return record;
  }

  const before = readAgenticExecutionSnapshot({
    userId: record.userId,
    projectKey: record.projectKey,
    slot: record.slot,
    executionId: record.id,
    kind: 'before',
  });
  const after = readAgenticExecutionSnapshot({
    userId: record.userId,
    projectKey: record.projectKey,
    slot: record.slot,
    executionId: record.id,
    kind: 'after',
  });

  return {
    ...record,
    diff: before && after ? buildAgenticExecutionSnapshotDiff(before, after) : null,
  };
}

export function findAgenticExecutionHistoryRecord(params: {
  userId: string;
  projectKey: string;
  slot: string;
  executionId: string;
}) {
  return listAgenticExecutionHistoryRecords({
    userId: params.userId,
    projectKey: params.projectKey,
    slot: params.slot,
    limit: 200,
  }).find((record) => record.id === params.executionId) ?? null;
}

export function writeAgenticExecutionSnapshot(params: {
  userId: string;
  projectKey: string;
  slot: string;
  executionId: string;
  kind: 'before' | 'after';
  saveData: EditorProjectSaveData;
}) {
  const normalizedProjectKey = normalizeProjectKey(params.projectKey);
  const normalizedSlot = sanitizeSlot(params.slot);
  const filePath = getSnapshotFilePath(
    params.userId,
    normalizedProjectKey,
    normalizedSlot,
    params.executionId,
    params.kind
  );
  mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  writeFileSync(tempPath, JSON.stringify(params.saveData, null, 2), 'utf-8');
  try {
    renameSync(tempPath, filePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === 'EEXIST' || code === 'EPERM' || code === 'ENOTEMPTY') {
      rmSync(filePath, { force: true });
      renameSync(tempPath, filePath);
      return true;
    }
    rmSync(tempPath, { force: true });
    throw error;
  }
  return true;
}

export function hasAgenticExecutionSnapshot(params: {
  userId: string;
  projectKey: string;
  slot: string;
  executionId: string;
  kind: 'before' | 'after';
}) {
  return existsSync(
    getSnapshotFilePath(
      params.userId,
      normalizeProjectKey(params.projectKey),
      sanitizeSlot(params.slot),
      params.executionId,
      params.kind
    )
  );
}

export function readAgenticExecutionSnapshot(params: {
  userId: string;
  projectKey: string;
  slot: string;
  executionId: string;
  kind: 'before' | 'after';
}) {
  try {
    const parsed = JSON.parse(
      readFileSync(
        getSnapshotFilePath(
          params.userId,
          normalizeProjectKey(params.projectKey),
          sanitizeSlot(params.slot),
          params.executionId,
          params.kind
        ),
        'utf-8'
      )
    ) as unknown;
    return isEditorProjectSaveData(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearAgenticExecutionHistoryForTest() {
  rmSync(getAgenticExecutionHistoryRoot(), { recursive: true, force: true });
}
