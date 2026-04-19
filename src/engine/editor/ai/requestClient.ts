import type { AgenticPipelineMessageMetadata, EngineWorkflowMode } from '@/types/engine';
import type { EditorSessionSnapshot } from '@/lib/editor-session-snapshot';
import { normalizeProjectKey } from '@/lib/project-key';
import type {
  AgentExecutionRecord,
  AgentPlannerCustomTaskMetadataChange,
  AgentPlannerCustomTaskMetadataRevertBlocker,
  AgentPlannerJobRecord,
  AgentPlannerReceipt,
  AgentPlannerStageStatus,
  ClientAgentPlannerPlan,
} from '@/engine/ai/agentPlanner';
import { getActiveEditorSessionId } from '../editorSessionClient';

type JsonRecord = Record<string, any>;
type AssistantGenerateKind = 'image' | 'video' | 'model3d' | 'character';

export type McpToolCallRequest = {
  id?: string;
  name: string;
  arguments?: JsonRecord;
};

export type McpToolRouteResult = {
  toolCallId: string;
  status: 'success' | 'error';
  result?: JsonRecord;
  error?: string;
};

export type EditorSessionStateResponse = {
  success?: boolean;
  active?: boolean;
  session?: {
    sessionId: string;
    projectKey: string;
    serverMutationVersion: number;
    lastClientSyncAt: string;
    lastServerMutationAt: string | null;
  } | null;
  snapshot?: EditorSessionSnapshot;
};

export type AssistantSurfaceStatusResponse = {
  authenticated?: boolean;
  access?: {
    advancedTools?: boolean;
    configurationAccess?: boolean;
  };
  assistant?: {
    available?: boolean;
    capabilities?: {
      chat?: {
        remote?: boolean;
        local?: boolean;
      };
      image?: boolean;
      video?: {
        standard?: boolean;
        cinematic?: boolean;
      };
      model3D?: boolean;
      character?: boolean;
    };
  };
  diagnostics?: {
    checkedAt?: string;
    assistant?: {
      available?: boolean;
      level?: 'ok' | 'warn' | 'error' | 'unknown';
      message?: string;
      requiresSignIn?: boolean;
    };
    automation?: {
      available?: boolean;
      restricted?: boolean;
      level?: 'ok' | 'warn' | 'error' | 'unknown';
      message?: string;
    };
    characters?: {
      available?: boolean;
      configured?: boolean;
      restricted?: boolean;
      level?: 'ok' | 'warn' | 'error' | 'unknown';
      message?: string;
    };
  };
};

export type AIAgentPlannerResponse = {
  levels?: Array<{
    id: string;
    name: string;
    goal: string;
    inputs: string[];
    outputs: string[];
  }>;
  workflowStages?: Array<{
    id: string;
    title: string;
  }>;
  activePlan?: ClientAgentPlannerPlan | null;
  activeExecution?: AgentExecutionRecord | null;
  activeJob?: AgentPlannerJobRecord | null;
  activeReceipt?: AgentPlannerReceipt | null;
  success?: boolean;
  plan?: ClientAgentPlannerPlan;
  execution?: AgentExecutionRecord;
  job?: AgentPlannerJobRecord | null;
  receipt?: AgentPlannerReceipt | null;
  error?: string;
  code?: string;
  blocker?: AgentPlannerCustomTaskMetadataRevertBlocker;
};

export type AIAgentPlannerCustomTaskHistoryResponse = {
  success?: boolean;
  projectKey?: string;
  planId?: string;
  task?: {
    taskId: string;
    stageId: string;
    title: string;
    summary: string;
    owner: string;
    priority: 'low' | 'medium' | 'high';
    sourceBlockId: string | null;
    status: AgentPlannerStageStatus;
    updatedAt: string;
  };
  historyCount?: number;
  metadataHistory?: AgentPlannerCustomTaskMetadataChange[];
  error?: string;
  code?: string;
};

export type AIAgentPlannerCustomTaskRevertAuditsResponse = {
  success?: boolean;
  projectKey?: string;
  planId?: string;
  scope?: 'task' | 'planner';
  task?: AIAgentPlannerCustomTaskHistoryResponse['task'];
  taskCount?: number;
  counts?: {
    edits: number;
    reverts: number;
    staleConfirmed: number;
  };
  filter?: 'all' | 'staleConfirmed';
  auditCount?: number;
  totalAuditCount?: number;
  pagination?: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
    nextOffset: number | null;
  };
  audits?: Array<
    AgentPlannerCustomTaskMetadataChange & {
      task?: AIAgentPlannerCustomTaskHistoryResponse['task'];
    }
  >;
  error?: string;
  code?: string;
};

export type StaleMetadataRevertPolicyRole = 'OWNER' | 'EDITOR' | 'VIEWER';
export type StaleMetadataRevertPolicyAuditEventType =
  | 'stale_metadata_revert_allowlist_changed'
  | 'stale_metadata_revert_allowlist_reset_to_env';
export type StaleMetadataRevertPolicyAuditEventTypeFilter =
  | 'all'
  | StaleMetadataRevertPolicyAuditEventType;

export type AIAgentPlannerStaleRevertPolicyAuditEvent = {
  id: string;
  eventType: StaleMetadataRevertPolicyAuditEventType;
  at: string;
  actorUserId: string;
  actorEmail: string;
  beforeRoles: StaleMetadataRevertPolicyRole[];
  afterRoles: StaleMetadataRevertPolicyRole[];
  reason: string | null;
};

export type AIAgentPlannerStaleRevertPolicyConfig = {
  policyId: 'stale_metadata_revert_confirmation_roles';
  version: number;
  allowedRoles: StaleMetadataRevertPolicyRole[];
  updatedAt: string;
  updatedByUserId: string;
  updatedByEmail: string;
  auditTrail: AIAgentPlannerStaleRevertPolicyAuditEvent[];
};

export type AIAgentPlannerStaleRevertPolicySnapshot = {
  policyId: 'stale_metadata_revert_confirmation_roles';
  source: 'env' | 'persisted_config';
  envVarName?: string;
  defaultRoles: StaleMetadataRevertPolicyRole[];
  configuredRoles: StaleMetadataRevertPolicyRole[];
  ignoredValues: string[];
  allowedRoles: StaleMetadataRevertPolicyRole[];
  evaluatedRole: StaleMetadataRevertPolicyRole;
  allowed: boolean;
  capturedAt: string;
  configVersion?: number;
  configUpdatedAt?: string;
};

export type AIAgentPlannerStaleRevertPolicyResponse = {
  success?: boolean;
  configured?: boolean;
  config?: AIAgentPlannerStaleRevertPolicyConfig | null;
  event?: AIAgentPlannerStaleRevertPolicyAuditEvent;
  policySnapshot?: AIAgentPlannerStaleRevertPolicySnapshot;
  auditTrail?: AIAgentPlannerStaleRevertPolicyAuditEvent[];
  auditCount?: number;
  totalAuditCount?: number;
  auditEventType?: StaleMetadataRevertPolicyAuditEventTypeFilter;
  eventType?: StaleMetadataRevertPolicyAuditEventTypeFilter;
  auditActorFilter?: string | null;
  actorFilter?: string | null;
  auditDateFromFilter?: string | null;
  auditDateToFilter?: string | null;
  dateFromFilter?: string | null;
  dateToFilter?: string | null;
  auditFilterOptions?: StaleMetadataRevertPolicyAuditEventTypeFilter[];
  filterOptions?: StaleMetadataRevertPolicyAuditEventTypeFilter[];
  envAllowedRoles?: StaleMetadataRevertPolicyRole[];
  auditPagination?: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
    nextOffset: number | null;
  };
  invalidValues?: string[];
  error?: string;
  code?: string;
};

export type ReviewReanalysisJobStatus = 'queued' | 'processing' | 'completed' | 'failed';
export type ReviewReanalysisBlockDecisionStatus = 'approved' | 'rejected' | 'deferred';

export type ReviewReanalysisOriginalDocumentInput = {
  id?: string;
  title?: string;
  kind?: 'markdown' | 'text' | 'json' | 'audit' | 'spec' | 'unknown';
  content: string;
  sourcePath?: string | null;
};

export type ReviewReanalysisDetectedScopeInput = {
  summary?: string;
  focusAreas?: string[];
  constraints?: string[];
  exclusions?: string[];
  confidence?: number;
  source?: string | null;
  tags?: string[];
};

export type ReviewReanalysisJobResponse = {
  success?: boolean;
  accepted?: boolean;
  nonBlocking?: boolean;
  action?: 'retry' | 'reprocess' | 'decide_block' | 'create_planner_from_approved_scope';
  projectKey?: string;
  slot?: string;
  job?: JsonRecord & {
    id?: string;
    status?: ReviewReanalysisJobStatus;
    scope?: JsonRecord | null;
    blockDecisions?: Record<string, JsonRecord & { decision?: ReviewReanalysisBlockDecisionStatus }>;
    plannerTasks?: JsonRecord[];
    plannerLink?: JsonRecord | null;
  };
  jobs?: Array<JsonRecord & { id?: string; status?: ReviewReanalysisJobStatus }>;
  tasks?: JsonRecord[];
  plan?: ClientAgentPlannerPlan;
  execution?: AgentExecutionRecord;
  plannerJob?: AgentPlannerJobRecord | null;
  decision?: JsonRecord & { decision?: ReviewReanalysisBlockDecisionStatus };
  count?: number;
  statusUrl?: string;
  code?: string;
  error?: string;
};

export type AgenticServerRunResponse = {
  success?: boolean;
  approved?: boolean;
  projectKey?: string;
  slot?: string;
  persisted?: boolean;
  error?: string;
  pipeline?: {
    id?: string;
    status?: string;
    iteration?: number;
    decision?: {
      approved: boolean;
      reason: string;
      nextPlanRequired: boolean;
      retryInstructions: string[];
    } | null;
    validation?: AgenticPipelineMessageMetadata['validation'];
    runtimeScaffold?: AgenticPipelineMessageMetadata['runtimeScaffold'];
    sharedMemory?: AgenticPipelineMessageMetadata['sharedMemory'];
    messageMetadata?: AgenticPipelineMessageMetadata;
    artifactPath?: string | null;
    tools?: Array<{
      callId: string;
      toolName: string;
      success: boolean;
      message: string;
    }>;
  };
  world?: {
    activeSceneId: string | null;
    sceneCount: number;
    entityCount: number;
    assetCount: number;
    buildReportCount: number;
  };
};

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
  recommendationExecution?: {
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
  } | null;
  snapshots: {
    before: boolean;
    after: boolean;
  };
  diff: AgenticExecutionSnapshotDiff | null;
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
  input: JsonRecord | null;
  output: JsonRecord | null;
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

export type AgenticExecutionHistoryResponse = {
  success?: boolean;
  projectKey?: string;
  slot?: string;
  history?: AgenticExecutionHistoryRecord[];
  pagination?: AgenticExecutionHistoryPagination;
  filterOptions?: AgenticExecutionHistoryFilterOptions;
  filterCounts?: AgenticExecutionHistoryFilterCounts;
  mutationIndexAudit?: AgenticMutationIndexAuditSummary;
  error?: string;
};

export type AgenticMutationIndexAuditSummary = {
  repairCount: number;
  checksumRepairCount?: number;
  historyReindexedFullCount?: number;
  historyReindexedPartialCount?: number;
  legacyHistoryReindexedCount?: number;
  latestRepairId: string | null;
  latestRepairAt: string | null;
  integrityStatus: 'valid' | 'mismatch' | 'missing';
  integrityValid: boolean;
  recommendationCount?: number;
  lastIndexedExecutionId?: string | null;
  latestIndexableExecutionId?: string | null;
  pendingIndexableExecutionCount?: number;
  pendingIndexableExecutionIds?: string[];
  indexBehind?: boolean;
  checkedAt?: string | null;
};

export type AgenticExecutionHistoryPagination = {
  limit: number;
  offset: number;
  totalRecords: number;
  filteredRecords: number;
  hasPrevious: boolean;
  hasNext: boolean;
  search: string;
  historyFilter?: AgenticExecutionHistoryFilter;
  toolFilter?: string;
  agentFilter?: string;
  traceEvent?: string;
  traceActor?: string;
  traceSeverity?: string;
};

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

export type AgenticExecutionHistoryFilter =
  | 'all'
  | 'approved'
  | 'rejected'
  | 'replay'
  | 'rollbackable'
  | 'pending_index';

export type AgenticServerHistoryMutationResponse = AgenticServerRunResponse & {
  action?: 'rollback';
  executionId?: string;
  restoredFrom?: string;
  replayedFrom?: string;
  summary?: JsonRecord;
};

export type AgenticRecommendationDecisionResponse = {
  success?: boolean;
  projectKey?: string;
  slot?: string;
  executionId?: string;
  recommendation?: NonNullable<AgenticExecutionHistoryRecord['sharedMemory']>['actionableRecommendations'][number];
  record?: AgenticExecutionHistoryRecord;
  error?: string;
};

export type AgenticExecuteApprovedRecommendationsResponse = AgenticServerRunResponse & {
  executedApprovedRecommendations?: boolean;
  sourceExecutionId?: string;
  approvedRecommendationIds?: string[];
  approvedRecommendationKeys?: string[];
  recommendationExecution?: AgenticExecutionHistoryRecord['recommendationExecution'];
  historyRecord?: AgenticExecutionHistoryRecord;
};

export type AgenticPartialRecommendationRollbackResponse = {
  success?: boolean;
  action?: 'partial_rollback';
  projectKey?: string;
  slot?: string;
  executionId?: string;
  recommendationId?: string | null;
  summary?: JsonRecord;
  record?: AgenticExecutionHistoryRecord | null;
  error?: string;
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

export type AgenticRecommendationMutationIndexIntegrity = {
  valid: boolean;
  status: 'valid' | 'mismatch' | 'missing';
  stored: {
    algorithm: 'sha256';
    value: string;
    updatedAt?: string;
  } | null;
  computed: {
    algorithm: 'sha256';
    value: string;
    updatedAt?: string;
  };
};

export type AgenticRecommendationMutationIndexResponse = {
  success?: boolean;
  projectKey?: string;
  slot?: string;
  recommendationKey?: string;
  index?: AgenticRecommendationMutationIndex;
  integrity?: AgenticRecommendationMutationIndexIntegrity;
  error?: string;
};

export type AgenticMutationIndexStatusResponse = {
  success?: boolean;
  projectKey?: string;
  slot?: string;
  checkedAt?: string;
  recommendationCount?: number;
  lastIndexedExecutionId?: string | null;
  latestIndexableExecutionId?: string | null;
  pendingIndexableExecutionCount?: number;
  pendingIndexableExecutionIds?: string[];
  indexBehind?: boolean;
  mutationIndexAudit?: AgenticMutationIndexAuditSummary;
  integrity?: AgenticRecommendationMutationIndexIntegrity;
  error?: string;
};

export type AgenticRecommendationMutationIndexRepairResponse = AgenticRecommendationMutationIndexResponse & {
  action?: 'repair_checksum' | 'reindex_from_history';
  previousIntegrity?: AgenticRecommendationMutationIndexIntegrity;
  auditEntry?: NonNullable<AgenticRecommendationMutationIndex['integrityAuditTrail']>[number];
  indexedExecutionCount?: number;
  indexedExecutionIds?: string[];
  recommendationCount?: number;
  code?: string;
};

function buildRequestHeaders(options?: {
  projectName?: string;
  includeContentType?: boolean;
}): Record<string, string> {
  const headers: Record<string, string> = {};

  if (options?.includeContentType !== false) {
    headers['Content-Type'] = 'application/json';
  }

  if (options?.projectName?.trim()) {
    headers['x-rey30-project'] = normalizeProjectKey(options.projectName);
  }

  const editorSessionId = getActiveEditorSessionId();
  if (editorSessionId) {
    headers['x-rey30-editor-session'] = editorSessionId;
  }

  return headers;
}

export async function requestAIChat(params: {
  command: string;
  engineMode: EngineWorkflowMode;
  projectName: string;
}): Promise<{ response: Response; data: JsonRecord; text: string }> {
  const response = await fetch('/api/ai-chat', {
    method: 'POST',
    headers: {
      ...buildRequestHeaders({ projectName: params.projectName }),
      'x-rey30-engine-mode': params.engineMode,
      'x-rey30-project': normalizeProjectKey(params.projectName),
    },
    body: JSON.stringify({
      prompt: params.command,
      messages: [
        {
          role: 'user',
          content: params.command,
        },
      ],
    }),
  });

  const data = await response.json().catch(() => ({}));
  const text = data.text || data.output_text || data.choices?.[0]?.message?.content || '';

  return { response, data, text };
}

export async function requestAgenticServerRun(params: {
  command: string;
  projectName: string;
  slot?: string;
  maxIterations?: number;
  persist?: boolean;
  requireRecommendationApproval?: boolean;
  recommendationApprovals?: Record<string, 'approved' | 'rejected'>;
}): Promise<{ response: Response; data: AgenticServerRunResponse }> {
  const response = await fetch('/api/agentic', {
    method: 'POST',
    headers: buildRequestHeaders({ projectName: params.projectName }),
    body: JSON.stringify({
      prompt: params.command,
      projectKey: normalizeProjectKey(params.projectName),
      slot: params.slot,
      maxIterations: params.maxIterations,
      persist: params.persist,
      requireRecommendationApproval: params.requireRecommendationApproval,
      recommendationApprovals: params.recommendationApprovals,
    }),
  });
  const data = (await response.json().catch(() => ({}))) as AgenticServerRunResponse;
  return { response, data };
}

export async function requestAgenticServerHistory(params: {
  projectName: string;
  slot?: string;
  limit?: number;
  offset?: number;
  search?: string;
  historyFilter?: AgenticExecutionHistoryFilter;
  toolFilter?: string;
  agentFilter?: string;
  traceEvent?: string;
  traceActor?: string;
  traceSeverity?: string;
}): Promise<{ response: Response; data: AgenticExecutionHistoryResponse }> {
  const search = new URLSearchParams();
  search.set('projectKey', normalizeProjectKey(params.projectName));
  if (params.slot?.trim()) {
    search.set('slot', params.slot.trim());
  }
  if (params.limit) {
    search.set('limit', String(params.limit));
  }
  if (params.offset) {
    search.set('offset', String(params.offset));
  }
  if (params.search?.trim()) {
    search.set('search', params.search.trim());
  }
  if (params.historyFilter?.trim()) {
    search.set('historyFilter', params.historyFilter.trim());
  }
  if (params.toolFilter?.trim() && params.toolFilter !== 'all') {
    search.set('toolFilter', params.toolFilter.trim());
  }
  if (params.agentFilter?.trim() && params.agentFilter !== 'all') {
    search.set('agentFilter', params.agentFilter.trim());
  }
  if (params.traceEvent?.trim()) {
    search.set('traceEvent', params.traceEvent.trim());
  }
  if (params.traceActor?.trim()) {
    search.set('traceActor', params.traceActor.trim());
  }
  if (params.traceSeverity?.trim() && params.traceSeverity !== 'all') {
    search.set('traceSeverity', params.traceSeverity.trim());
  }

  const response = await fetch(`/api/agentic?${search.toString()}`, {
    cache: 'no-store',
    headers: buildRequestHeaders({
      projectName: params.projectName,
      includeContentType: false,
    }),
  });
  const data = (await response.json().catch(() => ({}))) as AgenticExecutionHistoryResponse;
  return { response, data };
}

export async function requestAgenticServerHistoryMutation(params: {
  action: 'rollback' | 'replay';
  executionId: string;
  projectName: string;
  slot?: string;
  maxIterations?: number;
  requireRecommendationApproval?: boolean;
  recommendationApprovals?: Record<string, 'approved' | 'rejected'>;
}): Promise<{ response: Response; data: AgenticServerHistoryMutationResponse }> {
  const response = await fetch('/api/agentic', {
    method: 'PATCH',
    headers: buildRequestHeaders({ projectName: params.projectName }),
    body: JSON.stringify({
      action: params.action,
      executionId: params.executionId,
      projectKey: normalizeProjectKey(params.projectName),
      slot: params.slot,
      maxIterations: params.maxIterations,
      requireRecommendationApproval: params.requireRecommendationApproval,
      recommendationApprovals: params.recommendationApprovals,
    }),
  });
  const data = (await response.json().catch(() => ({}))) as AgenticServerHistoryMutationResponse;
  return { response, data };
}

export async function requestAgenticRecommendationDecision(params: {
  recommendationId: string;
  decision: 'approved' | 'rejected';
  executionId: string;
  projectName: string;
  slot?: string;
}): Promise<{ response: Response; data: AgenticRecommendationDecisionResponse }> {
  const response = await fetch(`/api/agentic/recommendations/${encodeURIComponent(params.recommendationId)}`, {
    method: 'PATCH',
    headers: buildRequestHeaders({ projectName: params.projectName }),
    body: JSON.stringify({
      decision: params.decision,
      executionId: params.executionId,
      projectKey: normalizeProjectKey(params.projectName),
      slot: params.slot,
    }),
  });
  const data = (await response.json().catch(() => ({}))) as AgenticRecommendationDecisionResponse;
  return { response, data };
}

export async function requestAgenticExecuteApprovedRecommendations(params: {
  executionId: string;
  projectName: string;
  slot?: string;
  maxIterations?: number;
  recommendationIds?: string[];
}): Promise<{ response: Response; data: AgenticExecuteApprovedRecommendationsResponse }> {
  const response = await fetch('/api/agentic/recommendations/execute-approved', {
    method: 'POST',
    headers: buildRequestHeaders({ projectName: params.projectName }),
    body: JSON.stringify({
      executionId: params.executionId,
      projectKey: normalizeProjectKey(params.projectName),
      slot: params.slot,
      maxIterations: params.maxIterations,
      recommendationIds: params.recommendationIds,
    }),
  });
  const data = (await response.json().catch(() => ({}))) as AgenticExecuteApprovedRecommendationsResponse;
  return { response, data };
}

export async function requestAgenticPartialRecommendationRollback(params: {
  executionId: string;
  projectName: string;
  slot?: string;
  recommendationId?: string;
}): Promise<{ response: Response; data: AgenticPartialRecommendationRollbackResponse }> {
  const response = await fetch('/api/agentic/recommendations/rollback-approved', {
    method: 'POST',
    headers: buildRequestHeaders({ projectName: params.projectName }),
    body: JSON.stringify({
      executionId: params.executionId,
      recommendationId: params.recommendationId,
      projectKey: normalizeProjectKey(params.projectName),
      slot: params.slot,
    }),
  });
  const data = (await response.json().catch(() => ({}))) as AgenticPartialRecommendationRollbackResponse;
  return { response, data };
}

export async function requestAgenticRecommendationMutationIndex(params: {
  projectName: string;
  slot?: string;
  recommendationKey?: string;
}): Promise<{ response: Response; data: AgenticRecommendationMutationIndexResponse }> {
  const search = new URLSearchParams();
  search.set('projectKey', normalizeProjectKey(params.projectName));
  if (params.slot?.trim()) {
    search.set('slot', params.slot.trim());
  }
  if (params.recommendationKey?.trim()) {
    search.set('recommendationKey', params.recommendationKey.trim());
  }

  const response = await fetch(`/api/agentic/recommendations/mutation-index?${search.toString()}`, {
    cache: 'no-store',
    headers: buildRequestHeaders({
      projectName: params.projectName,
      includeContentType: false,
    }),
  });
  const data = (await response.json().catch(() => ({}))) as AgenticRecommendationMutationIndexResponse;
  return { response, data };
}

export async function requestAgenticMutationIndexStatus(params: {
  projectName: string;
  slot?: string;
}): Promise<{ response: Response; data: AgenticMutationIndexStatusResponse }> {
  const search = new URLSearchParams();
  search.set('projectKey', normalizeProjectKey(params.projectName));
  if (params.slot?.trim()) {
    search.set('slot', params.slot.trim());
  }

  const response = await fetch(`/api/agentic/mutation-index/status?${search.toString()}`, {
    cache: 'no-store',
    headers: buildRequestHeaders({
      projectName: params.projectName,
      includeContentType: false,
    }),
  });
  const data = (await response.json().catch(() => ({}))) as AgenticMutationIndexStatusResponse;
  return { response, data };
}

export async function requestAgenticRecommendationMutationIndexRepair(params: {
  projectName: string;
  slot?: string;
  reason?: string;
  confirmRepair: true;
}): Promise<{ response: Response; data: AgenticRecommendationMutationIndexRepairResponse }> {
  const response = await fetch('/api/agentic/recommendations/mutation-index', {
    method: 'POST',
    cache: 'no-store',
    headers: buildRequestHeaders({ projectName: params.projectName }),
    body: JSON.stringify({
      projectKey: normalizeProjectKey(params.projectName),
      slot: params.slot,
      reason: params.reason,
      confirmRepair: params.confirmRepair,
    }),
  });
  const data = (await response.json().catch(() => ({}))) as AgenticRecommendationMutationIndexRepairResponse;
  return { response, data };
}

export async function requestAgenticRecommendationMutationIndexReindex(params: {
  projectName: string;
  slot?: string;
  reason?: string;
  confirmReindex: true;
  executionId?: string;
}): Promise<{ response: Response; data: AgenticRecommendationMutationIndexRepairResponse }> {
  const response = await fetch('/api/agentic/mutation-index/reindex', {
    method: 'POST',
    cache: 'no-store',
    headers: buildRequestHeaders({ projectName: params.projectName }),
    body: JSON.stringify({
      projectKey: normalizeProjectKey(params.projectName),
      slot: params.slot,
      executionId: params.executionId,
      reason: params.reason,
      confirmReindex: params.confirmReindex,
    }),
  });
  const data = (await response.json().catch(() => ({}))) as AgenticRecommendationMutationIndexRepairResponse;
  return { response, data };
}

async function requestAssistantGenerate(params: {
  kind: AssistantGenerateKind;
  prompt?: string;
  projectName?: string;
  planId?: string | null;
  style?: string;
  duration?: number;
  ratio?: string;
  taskToken?: string;
  references?: string[];
  operation?: 'start' | 'finalize';
  signal?: AbortSignal;
}): Promise<{ response: Response; data: JsonRecord }> {
  const response = await fetch('/api/assistant/generate', {
    method: 'POST',
    headers: buildRequestHeaders({ projectName: params.projectName }),
    signal: params.signal,
    body: JSON.stringify({
      kind: params.kind,
      prompt: params.prompt,
      planId: params.planId,
      style: params.style,
      duration: params.duration,
      ratio: params.ratio,
      taskToken: params.taskToken,
      references: params.references,
      operation: params.operation,
    }),
  });

  const data = await response.json().catch(() => ({}));
  return { response, data };
}

export async function requestAssistantTaskStatus(
  taskToken: string
): Promise<{ response: Response; data: JsonRecord }> {
  const response = await fetch(`/api/assistant/generate?taskToken=${encodeURIComponent(taskToken)}`, {
    headers: buildRequestHeaders({ includeContentType: false }),
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

export async function requestAssistantStatus(options?: {
  includeDiagnostics?: boolean;
}): Promise<{
  response: Response;
  data: AssistantSurfaceStatusResponse;
}> {
  const search = options?.includeDiagnostics ? '?includeDiagnostics=1' : '';
  const response = await fetch(`/api/assistant/status${search}`, {
    cache: 'no-store',
  });
  const data = (await response.json().catch(() => ({}))) as AssistantSurfaceStatusResponse;
  return { response, data };
}

export async function requestAssistantReviewReanalysisCreate(params: {
  projectName: string;
  slot?: string;
  originalDocuments: ReviewReanalysisOriginalDocumentInput[];
  detectedScope?: ReviewReanalysisDetectedScopeInput;
  reason?: string | null;
}): Promise<{ response: Response; data: ReviewReanalysisJobResponse }> {
  const response = await fetch('/api/assistant/reanalysis', {
    method: 'POST',
    headers: buildRequestHeaders({ projectName: params.projectName }),
    body: JSON.stringify({
      projectKey: normalizeProjectKey(params.projectName),
      slot: params.slot,
      originalDocuments: params.originalDocuments,
      detectedScope: params.detectedScope,
      reason: params.reason,
    }),
  });
  const data = (await response.json().catch(() => ({}))) as ReviewReanalysisJobResponse;
  return { response, data };
}

export async function requestAssistantReviewReanalysisJob(params: {
  projectName: string;
  slot?: string;
  jobId?: string;
  limit?: number;
}): Promise<{ response: Response; data: ReviewReanalysisJobResponse }> {
  const search = new URLSearchParams();
  search.set('projectKey', normalizeProjectKey(params.projectName));
  if (params.slot?.trim()) {
    search.set('slot', params.slot.trim());
  }
  if (params.jobId?.trim()) {
    search.set('jobId', params.jobId.trim());
  }
  if (params.limit) {
    search.set('limit', String(params.limit));
  }

  const response = await fetch(`/api/assistant/reanalysis?${search.toString()}`, {
    cache: 'no-store',
    headers: buildRequestHeaders({
      projectName: params.projectName,
      includeContentType: false,
    }),
  });
  const data = (await response.json().catch(() => ({}))) as ReviewReanalysisJobResponse;
  return { response, data };
}

export async function requestAssistantReviewReanalysisUpdate(params: {
  projectName: string;
  jobId: string;
  action: 'retry' | 'reprocess' | 'decide_block' | 'create_planner_from_approved_scope';
  slot?: string;
  blockId?: string;
  decision?: ReviewReanalysisBlockDecisionStatus;
  note?: string | null;
  force?: boolean;
  forceNew?: boolean;
  staleAfterMs?: number;
  approvedBlockIds?: string[];
}): Promise<{ response: Response; data: ReviewReanalysisJobResponse }> {
  const response = await fetch('/api/assistant/reanalysis', {
    method: 'PATCH',
    headers: buildRequestHeaders({ projectName: params.projectName }),
    body: JSON.stringify({
      projectKey: normalizeProjectKey(params.projectName),
      slot: params.slot,
      jobId: params.jobId,
      action: params.action,
      blockId: params.blockId,
      decision: params.decision,
      note: params.note,
      force: params.force,
      forceNew: params.forceNew,
      staleAfterMs: params.staleAfterMs,
      approvedBlockIds: params.approvedBlockIds,
    }),
  });
  const data = (await response.json().catch(() => ({}))) as ReviewReanalysisJobResponse;
  return { response, data };
}

export async function requestAssistantVideo(params: {
  prompt: string;
  projectName: string;
  planId?: string | null;
  duration?: number;
  ratio?: string;
}): Promise<{ response: Response; data: JsonRecord }> {
  return requestAssistantGenerate({
    kind: 'video',
    prompt: params.prompt,
    projectName: params.projectName,
    planId: params.planId,
    duration: params.duration,
    ratio: params.ratio,
  });
}

export async function requestAssistantImage(params: {
  prompt: string;
  projectName: string;
}): Promise<{ response: Response; data: JsonRecord }> {
  return requestAssistantGenerate({
    kind: 'image',
    prompt: params.prompt,
    projectName: params.projectName,
  });
}

export async function requestAssistantModel3D(params: {
  prompt: string;
  artStyle?: string;
  projectName: string;
  planId?: string | null;
}): Promise<{ response: Response; data: JsonRecord }> {
  return requestAssistantGenerate({
    kind: 'model3d',
    prompt: params.prompt,
    style: params.artStyle,
    projectName: params.projectName,
    planId: params.planId,
  });
}

export async function requestCharacterJobStart(params: {
  prompt: string;
  planId?: string | null;
  style?: string;
  targetEngine?: 'unity' | 'unreal' | 'generic';
  includeAnimations?: boolean;
  includeBlendshapes?: boolean;
  references?: string[];
}): Promise<{ response: Response; data: JsonRecord }> {
  return requestAssistantGenerate({
    kind: 'character',
    prompt: params.prompt,
    planId: params.planId,
    style: params.style || 'realista',
    references: Array.isArray(params.references) ? params.references.slice(0, 6) : [],
  });
}

export async function requestCharacterJobStatus(jobId: string): Promise<{ response: Response; data: JsonRecord }> {
  return requestAssistantTaskStatus(jobId);
}

export async function requestCharacterJobCancel(jobId: string): Promise<{ response: Response; data: JsonRecord }> {
  const response = await fetch(`/api/assistant/generate?taskToken=${encodeURIComponent(jobId)}`, {
    method: 'DELETE',
    headers: buildRequestHeaders({ includeContentType: false }),
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

export async function requestMcpToolCalls(params: {
  toolCalls: McpToolCallRequest[];
  projectName?: string;
  simple?: boolean;
}): Promise<{ response: Response; data: { results?: McpToolRouteResult[]; error?: string } & JsonRecord }> {
  const response = await fetch(params.simple ? '/api/simple-mcp' : '/api/mcp', {
    method: 'POST',
    headers: buildRequestHeaders({ projectName: params.projectName }),
    body: JSON.stringify({
      toolCalls: params.toolCalls.map((toolCall, index) => ({
        id: toolCall.id || `client_tool_${index + 1}`,
        name: toolCall.name,
        arguments: toolCall.arguments || {},
      })),
    }),
  });

  const data = await response.json().catch(() => ({}));
  return { response, data };
}

export async function requestEditorSessionState(params?: {
  projectName?: string;
  sessionId?: string | null;
  includeSnapshot?: boolean;
}): Promise<{ response: Response; data: EditorSessionStateResponse }> {
  const search = new URLSearchParams();
  const sessionId = params?.sessionId ?? getActiveEditorSessionId();
  if (sessionId) {
    search.set('sessionId', sessionId);
  }
  if (params?.projectName?.trim()) {
    search.set('projectKey', normalizeProjectKey(params.projectName));
  }
  if (params?.includeSnapshot) {
    search.set('includeSnapshot', '1');
  }

  const query = search.toString();
  const response = await fetch(`/api/editor-session${query ? `?${query}` : ''}`, {
    cache: 'no-store',
    headers: buildRequestHeaders({
      projectName: params?.projectName,
      includeContentType: false,
    }),
  });
  const data = (await response.json().catch(() => ({}))) as EditorSessionStateResponse;
  return { response, data };
}

export async function requestCharacterFinalize(params: {
  taskToken?: string;
  prompt: string;
  planId?: string | null;
  style?: string;
  references?: string[];
  signal?: AbortSignal;
}): Promise<{ response: Response; data: JsonRecord }> {
  return requestAssistantGenerate({
    kind: 'character',
    operation: 'finalize',
    taskToken: params.taskToken,
    prompt: params.prompt,
    planId: params.planId,
    style: params.style || 'realista',
    references: Array.isArray(params.references) ? params.references.slice(0, 6) : [],
    signal: params.signal,
  });
}

export async function requestAIAgentPlannerState(params?: {
  projectName?: string;
  planId?: string;
}): Promise<{ response: Response; data: AIAgentPlannerResponse }> {
  const search = new URLSearchParams();
  if (params?.planId?.trim()) {
    search.set('planId', params.planId.trim());
  }
  if (params?.projectName?.trim()) {
    search.set('projectKey', normalizeProjectKey(params.projectName));
  }

  const query = search.toString();
  const response = await fetch(`/api/ai-agents${query ? `?${query}` : ''}`, {
    cache: 'no-store',
    headers: buildRequestHeaders({
      projectName: params?.projectName,
      includeContentType: false,
    }),
  });
  const data = (await response.json().catch(() => ({}))) as AIAgentPlannerResponse;
  return { response, data };
}

export async function requestAIAgentPlannerCustomTaskHistory(params: {
  projectName: string;
  planId: string;
  taskId: string;
}): Promise<{ response: Response; data: AIAgentPlannerCustomTaskHistoryResponse }> {
  const search = new URLSearchParams();
  search.set('projectKey', normalizeProjectKey(params.projectName));
  search.set('planId', params.planId);
  search.set('taskId', params.taskId);

  const response = await fetch(`/api/ai-agents/custom-task-history?${search.toString()}`, {
    cache: 'no-store',
    headers: buildRequestHeaders({
      projectName: params.projectName,
      includeContentType: false,
    }),
  });
  const data = (await response.json().catch(() => ({}))) as AIAgentPlannerCustomTaskHistoryResponse;
  return { response, data };
}

export function createAIAgentPlannerCustomTaskHistoryExportUrl(params: {
  projectName: string;
  planId: string;
  taskId: string;
  format: 'json' | 'markdown';
}) {
  const search = new URLSearchParams();
  search.set('projectKey', normalizeProjectKey(params.projectName));
  search.set('planId', params.planId);
  search.set('taskId', params.taskId);
  search.set('format', params.format);
  return `/api/ai-agents/custom-task-history/export?${search.toString()}`;
}

export async function requestAIAgentPlannerCustomTaskRevertAudits(params: {
  projectName: string;
  planId: string;
  taskId?: string;
  filter?: 'all' | 'staleConfirmed';
  limit?: number;
  offset?: number;
}): Promise<{ response: Response; data: AIAgentPlannerCustomTaskRevertAuditsResponse }> {
  const search = new URLSearchParams();
  search.set('projectKey', normalizeProjectKey(params.projectName));
  search.set('planId', params.planId);
  if (params.taskId) {
    search.set('taskId', params.taskId);
  }
  search.set('filter', params.filter ?? 'all');
  if (typeof params.limit === 'number') {
    search.set('limit', String(params.limit));
  }
  if (typeof params.offset === 'number') {
    search.set('offset', String(params.offset));
  }

  const response = await fetch(`/api/ai-agents/custom-task-history/revert-audits?${search.toString()}`, {
    cache: 'no-store',
    headers: buildRequestHeaders({
      projectName: params.projectName,
      includeContentType: false,
    }),
  });
  const data = (await response.json().catch(() => ({}))) as AIAgentPlannerCustomTaskRevertAuditsResponse;
  return { response, data };
}

export function createAIAgentPlannerCustomTaskRevertAuditsExportUrl(params: {
  projectName: string;
  planId: string;
  taskId?: string;
  filter?: 'all' | 'staleConfirmed';
  limit?: number;
  offset?: number;
  exportScope?: 'page' | 'all';
  format: 'json' | 'markdown';
}) {
  const search = new URLSearchParams();
  search.set('projectKey', normalizeProjectKey(params.projectName));
  search.set('planId', params.planId);
  if (params.taskId) {
    search.set('taskId', params.taskId);
  }
  search.set('filter', params.filter ?? 'all');
  if (typeof params.limit === 'number') {
    search.set('limit', String(params.limit));
  }
  if (typeof params.offset === 'number') {
    search.set('offset', String(params.offset));
  }
  search.set('exportScope', params.exportScope ?? 'page');
  search.set('format', params.format);
  search.set('download', 'true');
  return `/api/ai-agents/custom-task-history/revert-audits?${search.toString()}`;
}

export async function requestAIAgentPlannerStaleRevertPolicy(params?: {
  projectName?: string;
  auditLimit?: number;
  auditOffset?: number;
  eventType?: StaleMetadataRevertPolicyAuditEventTypeFilter;
  actor?: string;
  from?: string;
  to?: string;
}): Promise<{ response: Response; data: AIAgentPlannerStaleRevertPolicyResponse }> {
  const search = new URLSearchParams();
  if (typeof params?.auditLimit === 'number') {
    search.set('auditLimit', String(params.auditLimit));
  }
  if (typeof params?.auditOffset === 'number') {
    search.set('auditOffset', String(params.auditOffset));
  }
  if (params?.eventType) {
    search.set('eventType', params.eventType);
  }
  if (params?.actor?.trim()) {
    search.set('actor', params.actor.trim());
  }
  if (params?.from?.trim()) {
    search.set('from', params.from.trim());
  }
  if (params?.to?.trim()) {
    search.set('to', params.to.trim());
  }
  const query = search.toString();
  const response = await fetch(`/api/ai-agents/stale-revert-policy${query ? `?${query}` : ''}`, {
    cache: 'no-store',
    headers: buildRequestHeaders({
      projectName: params?.projectName,
      includeContentType: false,
    }),
  });
  const data = (await response.json().catch(() => ({}))) as AIAgentPlannerStaleRevertPolicyResponse;
  return { response, data };
}

export async function requestAIAgentPlannerStaleRevertPolicyAudit(params?: {
  projectName?: string;
  limit?: number;
  offset?: number;
  eventType?: StaleMetadataRevertPolicyAuditEventTypeFilter;
  actor?: string;
  from?: string;
  to?: string;
}): Promise<{ response: Response; data: AIAgentPlannerStaleRevertPolicyResponse }> {
  const search = new URLSearchParams();
  if (typeof params?.limit === 'number') {
    search.set('limit', String(params.limit));
  }
  if (typeof params?.offset === 'number') {
    search.set('offset', String(params.offset));
  }
  if (params?.eventType) {
    search.set('eventType', params.eventType);
  }
  if (params?.actor?.trim()) {
    search.set('actor', params.actor.trim());
  }
  if (params?.from?.trim()) {
    search.set('from', params.from.trim());
  }
  if (params?.to?.trim()) {
    search.set('to', params.to.trim());
  }
  const query = search.toString();
  const response = await fetch(`/api/ai-agents/stale-revert-policy/audit${query ? `?${query}` : ''}`, {
    cache: 'no-store',
    headers: buildRequestHeaders({
      projectName: params?.projectName,
      includeContentType: false,
    }),
  });
  const data = (await response.json().catch(() => ({}))) as AIAgentPlannerStaleRevertPolicyResponse;
  return { response, data };
}

export async function requestAIAgentPlannerStaleRevertPolicyUpdate(params: {
  projectName?: string;
  allowedRoles: StaleMetadataRevertPolicyRole[];
  reason?: string;
  auditLimit?: number;
  auditOffset?: number;
  eventType?: StaleMetadataRevertPolicyAuditEventTypeFilter;
  actor?: string;
  from?: string;
  to?: string;
}): Promise<{ response: Response; data: AIAgentPlannerStaleRevertPolicyResponse }> {
  const search = new URLSearchParams();
  if (typeof params.auditLimit === 'number') {
    search.set('auditLimit', String(params.auditLimit));
  }
  if (typeof params.auditOffset === 'number') {
    search.set('auditOffset', String(params.auditOffset));
  }
  if (params.eventType) {
    search.set('eventType', params.eventType);
  }
  if (params.actor?.trim()) {
    search.set('actor', params.actor.trim());
  }
  if (params.from?.trim()) {
    search.set('from', params.from.trim());
  }
  if (params.to?.trim()) {
    search.set('to', params.to.trim());
  }
  const query = search.toString();
  const response = await fetch(`/api/ai-agents/stale-revert-policy${query ? `?${query}` : ''}`, {
    method: 'PATCH',
    headers: buildRequestHeaders({ projectName: params.projectName }),
    body: JSON.stringify({
      allowedRoles: params.allowedRoles,
      reason: params.reason,
    }),
  });
  const data = (await response.json().catch(() => ({}))) as AIAgentPlannerStaleRevertPolicyResponse;
  return { response, data };
}

export async function requestAIAgentPlannerStaleRevertPolicyReset(params: {
  projectName?: string;
  reason: string;
  auditLimit?: number;
  auditOffset?: number;
  eventType?: StaleMetadataRevertPolicyAuditEventTypeFilter;
  actor?: string;
  from?: string;
  to?: string;
}): Promise<{ response: Response; data: AIAgentPlannerStaleRevertPolicyResponse }> {
  const search = new URLSearchParams();
  if (typeof params.auditLimit === 'number') {
    search.set('auditLimit', String(params.auditLimit));
  }
  if (typeof params.auditOffset === 'number') {
    search.set('auditOffset', String(params.auditOffset));
  }
  if (params.eventType) {
    search.set('eventType', params.eventType);
  }
  if (params.actor?.trim()) {
    search.set('actor', params.actor.trim());
  }
  if (params.from?.trim()) {
    search.set('from', params.from.trim());
  }
  if (params.to?.trim()) {
    search.set('to', params.to.trim());
  }
  const query = search.toString();
  const response = await fetch(`/api/ai-agents/stale-revert-policy${query ? `?${query}` : ''}`, {
    method: 'DELETE',
    headers: buildRequestHeaders({ projectName: params.projectName }),
    body: JSON.stringify({
      reason: params.reason,
    }),
  });
  const data = (await response.json().catch(() => ({}))) as AIAgentPlannerStaleRevertPolicyResponse;
  return { response, data };
}

export function createAIAgentPlannerStaleRevertPolicyAuditExportUrl(params: {
  format: 'json' | 'markdown';
  eventType?: StaleMetadataRevertPolicyAuditEventTypeFilter;
  actor?: string;
  from?: string;
  to?: string;
  exportScope?: 'page' | 'all';
  limit?: number;
  offset?: number;
}) {
  const search = new URLSearchParams();
  search.set('format', params.format);
  search.set('eventType', params.eventType ?? 'all');
  search.set('exportScope', params.exportScope ?? 'all');
  if (typeof params.limit === 'number') {
    search.set('limit', String(params.limit));
  }
  if (typeof params.offset === 'number') {
    search.set('offset', String(params.offset));
  }
  if (params.actor?.trim()) {
    search.set('actor', params.actor.trim());
  }
  if (params.from?.trim()) {
    search.set('from', params.from.trim());
  }
  if (params.to?.trim()) {
    search.set('to', params.to.trim());
  }
  search.set('download', 'true');
  return `/api/ai-agents/stale-revert-policy/export?${search.toString()}`;
}

export async function requestAIAgentPlannerCreate(params: {
  prompt: string;
  projectName: string;
  level?: 'level1_copilot' | 'level2_basemesh' | 'level3_full_character';
  style?: string;
  target?: string;
  rigRequired?: boolean;
  customSummary?: string;
  customCheckpoints?: string[];
  customStages?: Array<{
    stageId?: string;
    title: string;
    owner?: string;
    validationRules?: string[];
    source?: string;
  }>;
  customTasks?: Array<{
    taskId?: string;
    stageId?: string;
    title: string;
    summary?: string;
    priority?: 'low' | 'medium' | 'high';
    owner?: string;
    evidenceRefs?: string[];
    requiredDecisions?: string[];
    sourceBlockId?: string | null;
  }>;
}): Promise<{ response: Response; data: AIAgentPlannerResponse }> {
  const response = await fetch('/api/ai-agents', {
    method: 'POST',
    headers: buildRequestHeaders({ projectName: params.projectName }),
    body: JSON.stringify({
      prompt: params.prompt,
      level: params.level,
      style: params.style,
      target: params.target,
      rigRequired: params.rigRequired,
      customSummary: params.customSummary,
      customCheckpoints: params.customCheckpoints,
      customStages: params.customStages,
      customTasks: params.customTasks,
    }),
  });
  const data = (await response.json().catch(() => ({}))) as AIAgentPlannerResponse;
  return { response, data };
}

export async function requestAIAgentPlannerUpdate(params: {
  projectName: string;
  planId: string;
  action:
    | 'resume'
    | 'stage_status'
    | 'custom_task_status'
    | 'custom_task_metadata'
    | 'custom_task_metadata_revert'
    | 'checkpoint'
    | 'assistant_apply'
    | 'cancel';
  stageId?: string;
  status?: AgentPlannerStageStatus;
  note?: string;
  resultSummary?: string;
  checkpoint?: string;
  taskId?: string;
  historyEntryId?: string;
  confirmStaleRevert?: boolean;
  staleRevertReason?: string;
  title?: string | null;
  summary?: string | null;
  owner?: string | null;
  priority?: 'low' | 'medium' | 'high' | null;
  sourceBlockId?: string | null;
  kind?: 'video' | 'model3d' | 'character';
  backend?: 'openai-video' | 'runway-video' | 'meshy-model' | 'character-job';
  asset?: {
    url?: string;
    thumbnailUrl?: string;
    path?: string;
  } | null;
}): Promise<{ response: Response; data: AIAgentPlannerResponse }> {
  const response = await fetch('/api/ai-agents', {
    method: 'PATCH',
    headers: buildRequestHeaders({ projectName: params.projectName }),
    body: JSON.stringify({
      planId: params.planId,
      action: params.action,
      stageId: params.stageId,
      status: params.status,
      note: params.note,
      resultSummary: params.resultSummary,
      checkpoint: params.checkpoint,
      taskId: params.taskId,
      historyEntryId: params.historyEntryId,
      confirmStaleRevert: params.confirmStaleRevert,
      staleRevertReason: params.staleRevertReason,
      title: params.title,
      summary: params.summary,
      owner: params.owner,
      priority: params.priority,
      sourceBlockId: params.sourceBlockId,
      kind: params.kind,
      backend: params.backend,
      asset: params.asset,
    }),
  });
  const data = (await response.json().catch(() => ({}))) as AIAgentPlannerResponse;
  return { response, data };
}
