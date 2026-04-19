import {
  CHARACTER_PIPELINE,
  createPipelinePlan,
  type AgentLevelId,
  type AgentStageId,
  type PipelinePlanInput,
} from './agent-levels';

export type AgentPlannerStatus = 'draft' | 'running' | 'completed' | 'failed' | 'canceled';
export type AgentPlannerStageStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
export type AgentPlannerStageId = AgentStageId | `custom_${string}`;
export type AgentPlannerCustomTaskPriority = 'low' | 'medium' | 'high';

export type AgentPlannerEventKind =
  | 'created'
  | 'resumed'
  | 'stage_running'
  | 'stage_completed'
  | 'stage_failed'
  | 'stage_skipped'
  | 'assistant_job_linked'
  | 'assistant_job_updated'
  | 'assistant_job_completed'
  | 'assistant_job_failed'
  | 'assistant_job_canceled'
  | 'assistant_result_applied'
  | 'custom_task_running'
  | 'custom_task_completed'
  | 'custom_task_failed'
  | 'custom_task_skipped'
  | 'custom_task_updated'
  | 'custom_task_metadata_reverted'
  | 'checkpoint_added'
  | 'canceled';

export type AgentPlannerReceiptAction =
  | 'create'
  | 'resume'
  | 'stage_status'
  | 'assistant_job'
  | 'assistant_apply'
  | 'custom_task_status'
  | 'custom_task_metadata'
  | 'custom_task_metadata_revert'
  | 'checkpoint'
  | 'cancel';

export interface AgentPlannerStageRecord {
  stageId: AgentPlannerStageId;
  title: string;
  owner: string;
  status: AgentPlannerStageStatus;
  note: string | null;
  resultSummary: string | null;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
}

export interface AgentPlannerEvent {
  id: string;
  kind: AgentPlannerEventKind;
  message: string;
  at: string;
  stageId: AgentPlannerStageId | null;
}

export interface AgentPlannerTelemetry {
  totalStages: number;
  pendingStages: number;
  runningStageId: AgentPlannerStageId | null;
  completedStages: number;
  failedStages: number;
}

export interface AgentExecutionRecord {
  state: 'idle' | 'running' | 'blocked' | 'completed' | 'canceled';
  currentStageId: AgentPlannerStageId | null;
  nextStageId: AgentPlannerStageId | null;
  progressPercent: number;
  resumable: boolean;
  lastEventKind: AgentPlannerEventKind | null;
  lastEventAt: string | null;
  lastCheckpoint: string | null;
}

export interface AgentPlannerReceipt {
  receiptId: string;
  action: AgentPlannerReceiptAction;
  message: string;
  stageId: AgentPlannerStageId | null;
  planStatus: AgentPlannerStatus;
  execution: AgentExecutionRecord;
  createdAt: string;
}

export type AgentPlannerJobStatus = 'queued' | 'running' | 'blocked' | 'completed' | 'canceled';

export interface AgentPlannerJobRecord {
  jobId: string;
  attemptNumber: number;
  planId: string;
  projectKey: string;
  status: AgentPlannerJobStatus;
  executionState: AgentExecutionRecord['state'];
  action: AgentPlannerReceiptAction;
  currentStageId: AgentPlannerStageId | null;
  nextStageId: AgentPlannerStageId | null;
  progressPercent: number;
  resumable: boolean;
  persisted: true;
  requestedAt: string;
  updatedAt: string;
  lastReceiptId: string | null;
  lastReceiptAt: string | null;
  lastMessage: string;
}

export type AgentPlannerAssistantJobKind = 'video' | 'model3d' | 'character';
export type AgentPlannerAssistantJobBackend =
  | 'openai-video'
  | 'runway-video'
  | 'meshy-model'
  | 'character-job';
export type AgentPlannerAssistantJobStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'canceled';
export type AgentPlannerAssistantResultStatus =
  | 'pending'
  | 'ready_to_finalize'
  | 'asset_ready'
  | 'finalized'
  | 'applied'
  | 'failed'
  | 'canceled';

export interface AgentPlannerAssistantJobRecord {
  taskId: string;
  kind: AgentPlannerAssistantJobKind;
  backend: AgentPlannerAssistantJobBackend;
  status: AgentPlannerAssistantJobStatus;
  stage: string | null;
  progress: number | null;
  readyToFinalize: boolean;
  asset:
    | {
        url?: string;
        thumbnailUrl?: string;
        path?: string;
      }
    | null;
  linkedAt: string;
  updatedAt: string;
  lastMessage: string;
  error: string | null;
  resultStatus: AgentPlannerAssistantResultStatus;
  resultSummary: string | null;
  lastReceiptId: string | null;
  lastReceiptAt: string | null;
}

export interface AgentPlannerCustomStageInput {
  stageId?: string;
  title: string;
  owner?: string;
  validationRules?: string[];
  source?: string;
}

export interface AgentPlannerCustomTaskInput {
  taskId?: string;
  stageId?: string;
  title: string;
  summary?: string;
  priority?: AgentPlannerCustomTaskPriority;
  owner?: string;
  evidenceRefs?: string[];
  requiredDecisions?: string[];
  sourceBlockId?: string | null;
}

export interface AgentPlannerCustomTaskMetadataChange {
  id: string;
  field: 'title' | 'summary' | 'owner' | 'priority' | 'sourceBlockId';
  before: string | null;
  after: string | null;
  changedAt: string;
  source: 'planner_patch' | 'metadata_revert';
  revertedChangeId?: string;
  staleRevertConfirmation?: AgentPlannerCustomTaskMetadataStaleRevertConfirmation;
}

export interface AgentPlannerCustomStageRecord {
  stageId: AgentPlannerStageId;
  title: string;
  owner: string;
  validationRules: string[];
  source: string;
  taskIds: string[];
}

export interface AgentPlannerCustomTaskRecord {
  taskId: string;
  stageId: AgentPlannerStageId;
  title: string;
  summary: string;
  priority: AgentPlannerCustomTaskPriority;
  owner: string;
  evidenceRefs: string[];
  requiredDecisions: string[];
  sourceBlockId: string | null;
  status: AgentPlannerStageStatus;
  metadataHistory?: AgentPlannerCustomTaskMetadataChange[];
  createdAt: string;
  updatedAt: string;
}

export interface AgentPlannerRecord {
  planId: string;
  projectKey: string;
  prompt: string;
  selectedLevel: AgentLevelId;
  style: string | null;
  target: string | null;
  rigRequired: boolean;
  status: AgentPlannerStatus;
  summary: string;
  stages: AgentPlannerStageRecord[];
  checkpoints: string[];
  events: AgentPlannerEvent[];
  receipts?: AgentPlannerReceipt[];
  jobs?: AgentPlannerJobRecord[];
  assistantJobs?: AgentPlannerAssistantJobRecord[];
  customStages?: AgentPlannerCustomStageRecord[];
  customTasks?: AgentPlannerCustomTaskRecord[];
  telemetry: AgentPlannerTelemetry;
  createdAt: string;
  updatedAt: string;
  lastResumedAt: string | null;
}

export interface ClientAgentPlannerStageRecord {
  stageId: AgentPlannerStageId;
  title: string;
  status: AgentPlannerStageStatus;
  note: string | null;
  resultSummary: string | null;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
}

export interface ClientAgentPlannerPlan {
  planId: string;
  projectKey: string;
  prompt: string;
  selectedLevel: AgentLevelId;
  style: string | null;
  target: string | null;
  rigRequired: boolean;
  status: AgentPlannerStatus;
  summary: string;
  stages: ClientAgentPlannerStageRecord[];
  checkpoints: string[];
  events: AgentPlannerEvent[];
  receipts: AgentPlannerReceipt[];
  jobs: AgentPlannerJobRecord[];
  assistantJobs: AgentPlannerAssistantJobRecord[];
  customStages: AgentPlannerCustomStageRecord[];
  customTasks: AgentPlannerCustomTaskRecord[];
  telemetry: AgentPlannerTelemetry;
  execution: AgentExecutionRecord;
  createdAt: string;
  updatedAt: string;
  lastResumedAt: string | null;
}

type CreateAgentPlannerInput = PipelinePlanInput & {
  planId: string;
  projectKey: string;
  createdAt?: string;
  customStages?: AgentPlannerCustomStageInput[];
  customTasks?: AgentPlannerCustomTaskInput[];
  customSummary?: string;
  customCheckpoints?: string[];
};

type AgentPlannerStageUpdate = {
  stageId: AgentPlannerStageId;
  status: AgentPlannerStageStatus;
  note?: string | null;
  resultSummary?: string | null;
};

type AgentPlannerCustomTaskUpdate = {
  taskId: string;
  status: AgentPlannerStageStatus;
  note?: string | null;
  resultSummary?: string | null;
};

export type AgentPlannerCustomTaskMetadataUpdate = {
  taskId: string;
  title?: string | null;
  summary?: string | null;
  owner?: string | null;
  priority?: AgentPlannerCustomTaskPriority | null;
  sourceBlockId?: string | null;
  source?: AgentPlannerCustomTaskMetadataChange['source'];
  revertedChangeId?: string | null;
  staleRevertConfirmation?: Omit<
    AgentPlannerCustomTaskMetadataStaleRevertConfirmation,
    'confirmedAt'
  >;
};

export type AgentPlannerCustomTaskMetadataRevertUpdate = {
  taskId: string;
  historyEntryId: string;
  confirmStaleRevert?: boolean;
  staleRevertConfirmation?: Omit<
    AgentPlannerCustomTaskMetadataStaleRevertConfirmation,
    'confirmedAt'
  >;
};

export type AgentPlannerCustomTaskMetadataRevertBlocker = {
  code: 'STALE_METADATA_REVERT_REQUIRES_CONFIRMATION';
  taskId: string;
  historyEntryId: string;
  field: AgentPlannerCustomTaskMetadataChange['field'];
  currentValue: string | null;
  revertToValue: string | null;
  laterChangeIds: string[];
  message: string;
};

export type AgentPlannerCustomTaskMetadataStaleRevertConfirmation = {
  confirmedAt: string;
  confirmedByUserId: string;
  confirmedByEmail: string;
  reason: string;
  blocker: AgentPlannerCustomTaskMetadataRevertBlocker;
  policySnapshot?: {
    policyId: string;
    source: 'env' | 'persisted_config' | 'admin_config';
    envVarName?: string;
    defaultRoles?: string[];
    configuredRoles?: string[];
    ignoredValues?: string[];
    allowedRoles: string[];
    evaluatedRole: string;
    allowed: boolean;
    capturedAt: string;
    configVersion?: number;
    configUpdatedAt?: string;
  };
};

function nowIso() {
  return new Date().toISOString();
}

function buildEvent(params: {
  kind: AgentPlannerEventKind;
  message: string;
  stageId?: AgentPlannerStageId | null;
  at?: string;
}): AgentPlannerEvent {
  return {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    kind: params.kind,
    message: params.message,
    at: params.at || nowIso(),
    stageId: params.stageId ?? null,
  };
}

function buildReceiptId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function buildPlannerJobId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function buildTelemetry(stages: AgentPlannerStageRecord[]): AgentPlannerTelemetry {
  const runningStage = stages.find((stage) => stage.status === 'running');
  return {
    totalStages: stages.length,
    pendingStages: stages.filter((stage) => stage.status === 'pending').length,
    runningStageId: runningStage?.stageId ?? null,
    completedStages: stages.filter((stage) => stage.status === 'completed').length,
    failedStages: stages.filter((stage) => stage.status === 'failed').length,
  };
}

function normalizeIdentifier(value: string, fallback: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || fallback;
}

function toCustomStageId(value: string, fallback: string): AgentPlannerStageId {
  const normalized = normalizeIdentifier(value, fallback);
  return normalized.startsWith('custom_')
    ? (normalized as AgentPlannerStageId)
    : (`custom_${normalized}` as AgentPlannerStageId);
}

function normalizeStringList(value: string[] | undefined, fallback: string[]) {
  const next = (Array.isArray(value) ? value : [])
    .map((entry) => entry.trim())
    .filter(Boolean);
  return next.length ? [...new Set(next)] : fallback;
}

function updateSourceBlockEvidenceRefs(
  refs: string[],
  previousSourceBlockId: string | null,
  nextSourceBlockId: string | null
) {
  const previousRef = previousSourceBlockId ? `sourceBlock:${previousSourceBlockId}` : null;
  const nextRef = nextSourceBlockId ? `sourceBlock:${nextSourceBlockId}` : null;
  const filtered = refs.filter((ref) => ref !== previousRef);
  if (nextRef && !filtered.includes(nextRef)) {
    filtered.push(nextRef);
  }
  return filtered;
}

function deriveCustomStageOwner(
  stage: AgentPlannerCustomStageRecord,
  customTasks: AgentPlannerCustomTaskRecord[]
) {
  const stageOwners = customTasks
    .filter((task) => stage.taskIds.includes(task.taskId))
    .map((task) => task.owner.trim())
    .filter(Boolean);
  const uniqueOwners = [...new Set(stageOwners)];
  if (uniqueOwners.length === 1) {
    return uniqueOwners[0];
  }
  return stage.owner;
}

function deriveCustomStageTitle(
  stage: AgentPlannerCustomStageRecord,
  customTasks: AgentPlannerCustomTaskRecord[]
) {
  if (stage.taskIds.length !== 1) {
    return stage.title;
  }
  const onlyTask = customTasks.find((task) => task.taskId === stage.taskIds[0]);
  return onlyTask?.title || stage.title;
}

function buildMetadataChange(params: {
  field: AgentPlannerCustomTaskMetadataChange['field'];
  before: string | null;
  after: string | null;
  changedAt: string;
  source?: AgentPlannerCustomTaskMetadataChange['source'];
  revertedChangeId?: string | null;
  staleRevertConfirmation?: AgentPlannerCustomTaskMetadataStaleRevertConfirmation;
}): AgentPlannerCustomTaskMetadataChange {
  const change: AgentPlannerCustomTaskMetadataChange = {
    id: `${params.changedAt}_${params.field}_${Math.random().toString(36).slice(2, 8)}`,
    field: params.field,
    before: params.before,
    after: params.after,
    changedAt: params.changedAt,
    source: params.source ?? 'planner_patch',
  };
  if (params.revertedChangeId) {
    change.revertedChangeId = params.revertedChangeId;
  }
  if (params.staleRevertConfirmation) {
    change.staleRevertConfirmation = params.staleRevertConfirmation;
  }
  return change;
}

function getCustomTaskMetadataFieldValue(
  task: AgentPlannerCustomTaskRecord,
  field: AgentPlannerCustomTaskMetadataChange['field']
) {
  if (field === 'sourceBlockId') {
    return task.sourceBlockId;
  }
  return String(task[field] ?? '');
}

function buildCustomPlannerSurface(
  input: CreateAgentPlannerInput,
  createdAt: string
): {
  stages: AgentPlannerStageRecord[];
  customStages: AgentPlannerCustomStageRecord[];
  customTasks: AgentPlannerCustomTaskRecord[];
  checkpoints: string[];
  summary: string;
} | null {
  const taskInputs = (input.customTasks ?? []).filter((task) => task.title?.trim());
  const stageInputs = (input.customStages ?? []).filter((stage) => stage.title?.trim());
  if (taskInputs.length === 0 && stageInputs.length === 0) {
    return null;
  }

  const customStages = new Map<AgentPlannerStageId, AgentPlannerCustomStageRecord>();
  const customTasks: AgentPlannerCustomTaskRecord[] = [];

  stageInputs.forEach((stage, index) => {
    const stageId = toCustomStageId(stage.stageId || stage.title, `stage_${index + 1}`);
    customStages.set(stageId, {
      stageId,
      title: stage.title.trim(),
      owner: stage.owner?.trim() || 'Custom Planner',
      validationRules: normalizeStringList(stage.validationRules, ['human_review_required']),
      source: stage.source?.trim() || 'custom',
      taskIds: [],
    });
  });

  taskInputs.forEach((task, index) => {
    const taskId = normalizeIdentifier(task.taskId || task.title, `task_${index + 1}`);
    const stageId = toCustomStageId(task.stageId || taskId, taskId);
    const owner = task.owner?.trim() || 'Custom Planner';
    const existingStage = customStages.get(stageId);
    customStages.set(stageId, {
      stageId,
      title: existingStage?.title || task.title.trim(),
      owner: existingStage?.owner || owner,
      validationRules: existingStage?.validationRules || normalizeStringList(task.requiredDecisions, [
        'approved_scope_block',
        'human_review_required',
      ]),
      source: existingStage?.source || 'custom_task',
      taskIds: [...(existingStage?.taskIds ?? []), taskId],
    });

    customTasks.push({
      taskId,
      stageId,
      title: task.title.trim(),
      summary: task.summary?.trim() || task.title.trim(),
      priority: task.priority || 'medium',
      owner,
      evidenceRefs: normalizeStringList(task.evidenceRefs, []),
      requiredDecisions: normalizeStringList(task.requiredDecisions, []),
      sourceBlockId: task.sourceBlockId?.trim() || null,
      status: 'pending',
      metadataHistory: [],
      createdAt,
      updatedAt: createdAt,
    });
  });

  const customStageRecords = Array.from(customStages.values());
  const stages: AgentPlannerStageRecord[] = customStageRecords.map((stage) => ({
    stageId: stage.stageId,
    title: stage.title,
    owner: stage.owner,
    status: 'pending',
    note: null,
    resultSummary: null,
    startedAt: null,
    completedAt: null,
    updatedAt: createdAt,
  }));

  const summary =
    input.customSummary?.trim() ||
    `Plan custom ${input.prompt}: ${customTasks.length} tarea(s), ${stages.length} stage(s).`;
  const checkpoints = normalizeStringList(input.customCheckpoints, [
    'Ejecutar solo customTasks presentes en el planner.',
    'No convertir bloques rechazados o diferidos en trabajo activo.',
    'Registrar evidencia de cierre por cada customStage.',
  ]);

  return {
    stages,
    customStages: customStageRecords,
    customTasks,
    checkpoints,
    summary,
  };
}

function derivePlannerStatus(stages: AgentPlannerStageRecord[]): AgentPlannerStatus {
  if (stages.some((stage) => stage.status === 'failed')) {
    return 'failed';
  }
  if (stages.every((stage) => stage.status === 'completed' || stage.status === 'skipped')) {
    return 'completed';
  }
  if (stages.some((stage) => stage.status === 'running' || stage.status === 'completed')) {
    return 'running';
  }
  return 'draft';
}

function deriveStageStatusFromTasks(tasks: AgentPlannerCustomTaskRecord[]): AgentPlannerStageStatus {
  if (tasks.some((task) => task.status === 'failed')) {
    return 'failed';
  }
  if (tasks.some((task) => task.status === 'running')) {
    return 'running';
  }
  if (tasks.length > 0 && tasks.every((task) => task.status === 'completed' || task.status === 'skipped')) {
    return 'completed';
  }
  if (tasks.some((task) => task.status === 'completed' || task.status === 'skipped')) {
    return 'running';
  }
  return 'pending';
}

function customTaskEventKind(status: AgentPlannerStageStatus): AgentPlannerEventKind {
  if (status === 'running') return 'custom_task_running';
  if (status === 'completed') return 'custom_task_completed';
  if (status === 'failed') return 'custom_task_failed';
  if (status === 'skipped') return 'custom_task_skipped';
  return 'custom_task_running';
}

function deriveExecutionState(record: AgentPlannerRecord): AgentExecutionRecord['state'] {
  if (record.status === 'completed') return 'completed';
  if (record.status === 'canceled') return 'canceled';
  if (
    record.stages.some((stage) => stage.status === 'failed') &&
    !record.stages.some((stage) => stage.status === 'running')
  ) {
    return 'blocked';
  }
  if (record.status === 'running' || record.stages.some((stage) => stage.status === 'running')) {
    return 'running';
  }
  return 'idle';
}

function mapExecutionStateToJobStatus(
  state: AgentExecutionRecord['state']
): AgentPlannerJobStatus {
  if (state === 'idle') return 'queued';
  if (state === 'running') return 'running';
  if (state === 'blocked') return 'blocked';
  if (state === 'completed') return 'completed';
  return 'canceled';
}

export function deriveAgentExecutionRecord(record: AgentPlannerRecord): AgentExecutionRecord {
  const currentStage =
    record.stages.find((stage) => stage.status === 'running') ?? null;
  const nextStage =
    record.stages.find((stage) => stage.status === 'pending') ?? null;
  const completedOrSkipped = record.stages.filter(
    (stage) => stage.status === 'completed' || stage.status === 'skipped'
  ).length;
  const progressPercent =
    record.telemetry.totalStages > 0
      ? Math.round((completedOrSkipped / record.telemetry.totalStages) * 100)
      : 0;
  const lastEvent = record.events.at(-1) ?? null;

  return {
    state: deriveExecutionState(record),
    currentStageId: currentStage?.stageId ?? null,
    nextStageId: nextStage?.stageId ?? null,
    progressPercent,
    resumable:
      record.status !== 'completed' &&
      record.status !== 'canceled' &&
      (record.status === 'failed' ||
        record.stages.some(
          (stage) => stage.status === 'pending' || stage.status === 'failed'
        )),
    lastEventKind: lastEvent?.kind ?? null,
    lastEventAt: lastEvent?.at ?? null,
    lastCheckpoint: record.checkpoints.at(-1) ?? null,
  };
}

export function getLatestAgentPlannerJob(record: AgentPlannerRecord | null): AgentPlannerJobRecord | null {
  return record?.jobs?.at(-1) ?? null;
}

export function syncAgentPlannerAssistantJob(
  record: AgentPlannerRecord,
  params: {
    taskId: string;
    kind: AgentPlannerAssistantJobKind;
    backend: AgentPlannerAssistantJobBackend;
    status: AgentPlannerAssistantJobStatus;
    stage?: string | null;
    progress?: number | null;
    readyToFinalize?: boolean;
    asset?: AgentPlannerAssistantJobRecord['asset'];
    updatedAt?: string;
    message?: string;
    error?: string | null;
  }
): AgentPlannerRecord {
  const updatedAt = params.updatedAt || nowIso();
  const result = deriveAssistantJobResult({
    kind: params.kind,
    status: params.status,
    stage: params.stage ?? null,
    readyToFinalize: params.readyToFinalize === true,
    asset: params.asset ?? null,
    error: params.error ?? null,
  });

  return upsertAssistantJob(record, {
    taskId: params.taskId,
    kind: params.kind,
    backend: params.backend,
    status: params.status,
    stage: params.stage ?? null,
    progress:
      typeof params.progress === 'number'
        ? params.progress
        : params.status === 'completed'
          ? 100
          : null,
    readyToFinalize: params.readyToFinalize === true,
    asset: params.asset ?? null,
    linkedAt:
      record.assistantJobs?.find((job) => job.taskId === params.taskId)?.linkedAt || updatedAt,
    updatedAt,
    lastMessage:
      params.message ||
      buildAssistantJobMessage({
        kind: params.kind,
        backend: params.backend,
        status: params.status,
        stage: params.stage ?? null,
      }),
    error: params.error ?? null,
    resultStatus: result.status,
    resultSummary: result.summary,
    lastReceiptId:
      record.assistantJobs?.find((job) => job.taskId === params.taskId)?.lastReceiptId || null,
    lastReceiptAt:
      record.assistantJobs?.find((job) => job.taskId === params.taskId)?.lastReceiptAt || null,
  });
}

export function applyAgentPlannerAssistantResult(
  record: AgentPlannerRecord,
  params: {
    taskId: string;
    kind?: AgentPlannerAssistantJobKind;
    backend?: AgentPlannerAssistantJobBackend;
    asset?: AgentPlannerAssistantJobRecord['asset'];
    updatedAt?: string;
    summary?: string | null;
  }
): AgentPlannerRecord {
  const updatedAt = params.updatedAt || nowIso();
  const existingJobs = [...(record.assistantJobs ?? [])];
  const existingIndex = existingJobs.findIndex((job) => job.taskId === params.taskId);
  const current = existingIndex >= 0 ? existingJobs[existingIndex]! : null;

  if (!current && (!params.kind || !params.backend)) {
    return record;
  }

  const fallbackAsset = params.asset ?? null;
  const nextAsset = params.asset ?? current?.asset ?? null;
  const nextKind = current?.kind ?? params.kind!;
  const nextBackend = current?.backend ?? params.backend!;
  const nextSummary =
    params.summary?.trim() ||
    (summarizeAssistantAsset(nextAsset)
      ? `El resultado ${nextKind} quedó aplicado al proyecto desde ${summarizeAssistantAsset(nextAsset)}.`
      : `El resultado ${nextKind} quedó aplicado al proyecto y listo para edición.`);
  const nextMessage = `Assistant result ${nextKind} aplicado al proyecto.`;

  const nextJob: AgentPlannerAssistantJobRecord = current
    ? {
        ...current,
        asset: nextAsset,
        updatedAt,
        lastMessage: nextMessage,
        resultStatus: 'applied',
        resultSummary: nextSummary,
      }
    : {
        taskId: params.taskId,
        kind: nextKind,
        backend: nextBackend,
        status: 'completed',
        stage: fallbackAsset?.path ? 'imported' : 'completed',
        progress: 100,
        readyToFinalize: false,
        asset: nextAsset,
        linkedAt: updatedAt,
        updatedAt,
        lastMessage: nextMessage,
        error: null,
        resultStatus: 'applied',
        resultSummary: nextSummary,
        lastReceiptId: null,
        lastReceiptAt: null,
      };

  if (
    current &&
    current.resultStatus === 'applied' &&
    current.resultSummary === nextSummary &&
    current.lastMessage === nextMessage &&
    sameAssistantAsset(current.asset, nextAsset)
  ) {
    return record;
  }

  if (existingIndex >= 0) {
    existingJobs[existingIndex] = nextJob;
  } else {
    existingJobs.push(nextJob);
  }

  const updatedRecord: AgentPlannerRecord = {
    ...record,
    assistantJobs: existingJobs.slice(-12),
    updatedAt,
    events: [
      ...record.events,
      buildEvent({
        kind: 'assistant_result_applied',
        message: nextSummary,
        at: updatedAt,
      }),
    ].slice(-80),
  };

  const withReceipt = appendReceipt(updatedRecord, {
    action: 'assistant_apply',
    message: nextSummary,
    createdAt: updatedAt,
  });
  const latestReceipt = withReceipt.receipts?.at(-1) ?? null;
  if (!latestReceipt) {
    return withReceipt;
  }

  const receiptJobs = [...(withReceipt.assistantJobs ?? [])];
  const receiptIndex = receiptJobs.findIndex((job) => job.taskId === params.taskId);
  if (receiptIndex < 0) {
    return withReceipt;
  }

  receiptJobs[receiptIndex] = {
    ...receiptJobs[receiptIndex]!,
    lastReceiptId: latestReceipt.receiptId,
    lastReceiptAt: latestReceipt.createdAt,
  };

  return {
    ...withReceipt,
    assistantJobs: receiptJobs,
  };
}

function sameAssistantAsset(
  left: AgentPlannerAssistantJobRecord['asset'],
  right: AgentPlannerAssistantJobRecord['asset']
) {
  return (
    (left?.url ?? null) === (right?.url ?? null) &&
    (left?.thumbnailUrl ?? null) === (right?.thumbnailUrl ?? null) &&
    (left?.path ?? null) === (right?.path ?? null)
  );
}

function buildAssistantJobMessage(job: {
  kind: AgentPlannerAssistantJobKind;
  backend: AgentPlannerAssistantJobBackend;
  status: AgentPlannerAssistantJobStatus;
  stage: string | null;
}) {
  const stage = job.stage?.trim() ? ` · ${job.stage.trim()}` : '';
  return `Assistant job ${job.kind} (${job.backend}) ${job.status}${stage}`;
}

function summarizeAssistantAsset(asset: AgentPlannerAssistantJobRecord['asset']) {
  const path = asset?.path?.trim();
  if (path) return path.replace(/^\/+/, '');
  const url = asset?.url?.trim();
  if (url) return url;
  const thumbnailUrl = asset?.thumbnailUrl?.trim();
  if (thumbnailUrl) return thumbnailUrl;
  return null;
}

function deriveAssistantJobResult(params: {
  kind: AgentPlannerAssistantJobKind;
  status: AgentPlannerAssistantJobStatus;
  stage: string | null;
  readyToFinalize: boolean;
  asset: AgentPlannerAssistantJobRecord['asset'];
  error: string | null;
}): {
  status: AgentPlannerAssistantResultStatus;
  summary: string | null;
} {
  if (params.status === 'failed') {
    return {
      status: 'failed',
      summary: params.error?.trim() || `El job ${params.kind} falló y requiere revisión manual.`,
    };
  }

  if (params.status === 'canceled') {
    return {
      status: 'canceled',
      summary: `El job ${params.kind} fue cancelado antes de entregar un resultado durable.`,
    };
  }

  if (params.status !== 'completed') {
    return { status: 'pending', summary: null };
  }

  if (params.kind === 'character' && params.readyToFinalize) {
    return {
      status: 'ready_to_finalize',
      summary: 'El personaje remoto quedó listo para finalizar e importar al proyecto.',
    };
  }

  const assetSummary = summarizeAssistantAsset(params.asset);
  const normalizedStage = params.stage?.trim().toLowerCase() || '';
  if (
    params.kind === 'character' &&
    !params.readyToFinalize &&
    (normalizedStage === 'finalized' || normalizedStage === 'done' || Boolean(params.asset?.path))
  ) {
    return {
      status: 'finalized',
      summary: assetSummary
        ? `El paquete final del personaje quedó listo en ${assetSummary}.`
        : 'El paquete final del personaje quedó listo para usarse en el editor.',
    };
  }

  if (assetSummary) {
    return {
      status: 'asset_ready',
      summary: `El resultado ${params.kind} quedó listo y durable en ${assetSummary}.`,
    };
  }

  return {
    status: 'asset_ready',
    summary: `El job ${params.kind} se completó y dejó un resultado durable listo para revisión.`,
  };
}

function appendReceipt(
  record: AgentPlannerRecord,
  params: {
    action: AgentPlannerReceiptAction;
    message: string;
    stageId?: AgentPlannerStageId | null;
    createdAt?: string;
  }
): AgentPlannerRecord {
  const nextReceipt: AgentPlannerReceipt = {
    receiptId: buildReceiptId(),
    action: params.action,
    message: params.message,
    stageId: params.stageId ?? null,
    planStatus: record.status,
    execution: deriveAgentExecutionRecord(record),
    createdAt: params.createdAt || nowIso(),
  };

  return {
    ...record,
    receipts: [...(record.receipts ?? []), nextReceipt].slice(-40),
  };
}

function upsertAssistantJob(
  record: AgentPlannerRecord,
  job: AgentPlannerAssistantJobRecord
): AgentPlannerRecord {
  const existingJobs = [...(record.assistantJobs ?? [])];
  const existingIndex = existingJobs.findIndex((entry) => entry.taskId === job.taskId);
  const previous = existingIndex >= 0 ? existingJobs[existingIndex] : null;

  if (
    previous &&
    previous.status === job.status &&
    previous.stage === job.stage &&
    previous.progress === job.progress &&
    previous.readyToFinalize === job.readyToFinalize &&
    previous.lastMessage === job.lastMessage &&
    previous.error === job.error &&
    previous.resultStatus === job.resultStatus &&
    previous.resultSummary === job.resultSummary &&
    sameAssistantAsset(previous.asset, job.asset)
  ) {
    return record;
  }

  const eventKind: AgentPlannerEventKind =
    existingIndex < 0
      ? 'assistant_job_linked'
      : job.status === 'completed'
        ? 'assistant_job_completed'
        : job.status === 'failed'
          ? 'assistant_job_failed'
          : job.status === 'canceled'
            ? 'assistant_job_canceled'
            : 'assistant_job_updated';
  const message = job.lastMessage || buildAssistantJobMessage(job);
  const receiptMessage = job.resultSummary ? `${message}. ${job.resultSummary}` : message;

  if (existingIndex >= 0) {
    existingJobs[existingIndex] = {
      ...existingJobs[existingIndex]!,
      ...job,
      linkedAt: existingJobs[existingIndex]!.linkedAt,
    };
  } else {
    existingJobs.push(job);
  }

  const updatedRecord: AgentPlannerRecord = {
    ...record,
    assistantJobs: existingJobs.slice(-12),
    updatedAt: job.updatedAt,
    events: [
      ...record.events,
      buildEvent({
        kind: eventKind,
        message,
        at: job.updatedAt,
      }),
    ].slice(-80),
  };

  const withReceipt = appendReceipt(updatedRecord, {
    action: 'assistant_job',
    message: receiptMessage,
    createdAt: job.updatedAt,
  });
  const latestReceipt = withReceipt.receipts?.at(-1) ?? null;
  if (!latestReceipt) {
    return withReceipt;
  }

  const assistantJobs = [...(withReceipt.assistantJobs ?? [])];
  const receiptJobIndex = assistantJobs.findIndex((entry) => entry.taskId === job.taskId);
  if (receiptJobIndex < 0) {
    return withReceipt;
  }

  assistantJobs[receiptJobIndex] = {
    ...assistantJobs[receiptJobIndex]!,
    lastReceiptId: latestReceipt.receiptId,
    lastReceiptAt: latestReceipt.createdAt,
  };

  return {
    ...withReceipt,
    assistantJobs,
  };
}

function syncAgentPlannerJob(
  record: AgentPlannerRecord,
  params: {
    action: AgentPlannerReceiptAction;
    message: string;
    startNewAttempt?: boolean;
    createdAt?: string;
  }
): AgentPlannerRecord {
  const execution = deriveAgentExecutionRecord(record);
  const latestReceipt = record.receipts?.at(-1) ?? null;
  const existingJobs = [...(record.jobs ?? [])];
  const latestJob = existingJobs.at(-1) ?? null;
  const shouldCreateNew =
    params.startNewAttempt === true ||
    !latestJob;
  const updatedAt = latestReceipt?.createdAt || params.createdAt || nowIso();

  const nextJob: AgentPlannerJobRecord = {
    jobId: shouldCreateNew ? buildPlannerJobId() : latestJob!.jobId,
    attemptNumber: shouldCreateNew ? (latestJob?.attemptNumber ?? 0) + 1 : latestJob!.attemptNumber,
    planId: record.planId,
    projectKey: record.projectKey,
    status: mapExecutionStateToJobStatus(execution.state),
    executionState: execution.state,
    action: params.action,
    currentStageId: execution.currentStageId,
    nextStageId: execution.nextStageId,
    progressPercent: execution.progressPercent,
    resumable: execution.resumable,
    persisted: true,
    requestedAt: shouldCreateNew ? updatedAt : latestJob!.requestedAt,
    updatedAt,
    lastReceiptId: latestReceipt?.receiptId ?? latestJob?.lastReceiptId ?? null,
    lastReceiptAt: latestReceipt?.createdAt ?? latestJob?.lastReceiptAt ?? null,
    lastMessage: params.message,
  };

  const jobs = shouldCreateNew
    ? [...existingJobs, nextJob].slice(-12)
    : [...existingJobs.slice(0, -1), nextJob];

  return {
    ...record,
    jobs,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isStageStatus(value: unknown): value is AgentPlannerStageStatus {
  return (
    value === 'pending' ||
    value === 'running' ||
    value === 'completed' ||
    value === 'failed' ||
    value === 'skipped'
  );
}

function isPlannerStatus(value: unknown): value is AgentPlannerStatus {
  return (
    value === 'draft' ||
    value === 'running' ||
    value === 'completed' ||
    value === 'failed' ||
    value === 'canceled'
  );
}

export function createAgentPlannerRecord(input: CreateAgentPlannerInput): AgentPlannerRecord {
  const createdAt = input.createdAt || nowIso();
  const plan = createPipelinePlan(input);
  const customSurface = buildCustomPlannerSurface(input, createdAt);
  const stages: AgentPlannerStageRecord[] =
    customSurface?.stages ??
    CHARACTER_PIPELINE.map((stage) => ({
      stageId: stage.id,
      title: stage.title,
      owner: stage.owner,
      status: 'pending',
      note: null,
      resultSummary: null,
      startedAt: null,
      completedAt: null,
      updatedAt: createdAt,
    }));

  const record: AgentPlannerRecord = {
    planId: input.planId,
    projectKey: input.projectKey,
    prompt: input.prompt,
    selectedLevel: plan.selectedLevel,
    style: input.style || null,
    target: input.target || null,
    rigRequired: input.rigRequired !== false,
    status: 'draft',
    summary: customSurface?.summary ?? plan.summary,
    stages,
    checkpoints: customSurface?.checkpoints ?? [...plan.checkpoints],
    events: [
      buildEvent({
        kind: 'created',
        message: customSurface ? 'Plan custom de agentes creado.' : 'Plan de agentes creado.',
        at: createdAt,
      }),
      ],
      receipts: [],
      jobs: [],
      assistantJobs: [],
      customStages: customSurface?.customStages ?? [],
      customTasks: customSurface?.customTasks ?? [],
      telemetry: buildTelemetry(stages),
    createdAt,
    updatedAt: createdAt,
    lastResumedAt: null,
  };

  const withReceipt = appendReceipt(record, {
    action: 'create',
    message: 'Planner durable creado y listo para ejecución.',
    createdAt,
  });
  return syncAgentPlannerJob(withReceipt, {
    action: 'create',
    message: 'Planner durable creado y listo para ejecución.',
    startNewAttempt: true,
    createdAt,
  });
}

export function resumeAgentPlanner(record: AgentPlannerRecord): AgentPlannerRecord {
  if (record.status === 'completed' || record.status === 'canceled') {
    return record;
  }

  const updatedAt = nowIso();
  const nextRecord: AgentPlannerRecord = {
    ...record,
    status: record.stages.every((stage) => stage.status === 'pending') ? 'draft' : 'running',
    updatedAt,
    lastResumedAt: updatedAt,
    events: [
      ...record.events,
      buildEvent({
        kind: 'resumed',
        message: 'Plan reanudado desde el editor.',
        at: updatedAt,
      }),
    ].slice(-80),
  };

  const withReceipt = appendReceipt(nextRecord, {
    action: 'resume',
    message: 'Planner reanudado con estado de ejecución actualizado.',
    createdAt: updatedAt,
  });
  const latestJob = getLatestAgentPlannerJob(record);
  const shouldCreateNewAttempt =
    !latestJob ||
    latestJob.progressPercent > 0 ||
    latestJob.status === 'blocked' ||
    latestJob.status === 'completed' ||
    latestJob.status === 'canceled';
  return syncAgentPlannerJob(withReceipt, {
    action: 'resume',
    message: 'Planner reanudado con estado de ejecución actualizado.',
    startNewAttempt: shouldCreateNewAttempt,
    createdAt: updatedAt,
  });
}

export function addAgentPlannerCheckpoint(
  record: AgentPlannerRecord,
  checkpoint: string
): AgentPlannerRecord {
  const value = checkpoint.trim();
  if (!value) {
    return record;
  }

  const updatedAt = nowIso();
  const nextRecord: AgentPlannerRecord = {
    ...record,
    checkpoints: [...record.checkpoints, value],
    updatedAt,
    events: [
      ...record.events,
      buildEvent({
        kind: 'checkpoint_added',
        message: `Checkpoint agregado: ${value}`,
        at: updatedAt,
      }),
    ].slice(-80),
  };

  const withReceipt = appendReceipt(nextRecord, {
    action: 'checkpoint',
    message: `Checkpoint durable registrado: ${value}`,
    createdAt: updatedAt,
  });
  return syncAgentPlannerJob(withReceipt, {
    action: 'checkpoint',
    message: `Checkpoint durable registrado: ${value}`,
    createdAt: updatedAt,
  });
}

export function cancelAgentPlanner(record: AgentPlannerRecord, note?: string | null): AgentPlannerRecord {
  const updatedAt = nowIso();
  const nextRecord: AgentPlannerRecord = {
    ...record,
    status: 'canceled',
    updatedAt,
    events: [
      ...record.events,
      buildEvent({
        kind: 'canceled',
        message: note?.trim() || 'Plan cancelado desde el editor.',
        at: updatedAt,
      }),
    ].slice(-80),
  };

  const withReceipt = appendReceipt(nextRecord, {
    action: 'cancel',
    message: note?.trim() || 'Planner cancelado y sellado para revisión manual.',
    createdAt: updatedAt,
  });
  return syncAgentPlannerJob(withReceipt, {
    action: 'cancel',
    message: note?.trim() || 'Planner cancelado y sellado para revisión manual.',
    createdAt: updatedAt,
  });
}

export function applyAgentPlannerStageUpdate(
  record: AgentPlannerRecord,
  update: AgentPlannerStageUpdate
): AgentPlannerRecord {
  const updatedAt = nowIso();
  const stages = record.stages.map((stage) => {
    if (stage.stageId !== update.stageId) {
      return stage;
    }

    const startedAt =
      update.status === 'running'
        ? stage.startedAt || updatedAt
        : stage.startedAt;
    const completedAt =
      update.status === 'completed' || update.status === 'failed' || update.status === 'skipped'
        ? updatedAt
        : update.status === 'pending'
          ? null
          : stage.completedAt;

    return {
      ...stage,
      status: update.status,
      note: update.note === undefined ? stage.note : update.note,
      resultSummary:
        update.resultSummary === undefined ? stage.resultSummary : update.resultSummary,
      startedAt,
      completedAt,
      updatedAt,
    };
  });

  const telemetry = buildTelemetry(stages);
  const status = derivePlannerStatus(stages);
  const customTasks = (record.customTasks ?? []).map((task) =>
    task.stageId === update.stageId
      ? {
          ...task,
          status: update.status,
          updatedAt,
        }
      : task
  );
  const eventKind: AgentPlannerEventKind =
    update.status === 'running'
      ? 'stage_running'
      : update.status === 'completed'
        ? 'stage_completed'
        : update.status === 'failed'
          ? 'stage_failed'
          : 'stage_skipped';
  const statusMessage =
    update.status === 'running'
      ? 'iniciada'
      : update.status === 'completed'
        ? 'completada'
        : update.status === 'failed'
          ? 'falló'
          : 'omitida';

  const nextRecord: AgentPlannerRecord = {
    ...record,
    status,
    stages,
    customTasks,
    telemetry,
    updatedAt,
    events: [
      ...record.events,
      buildEvent({
        kind: eventKind,
        stageId: update.stageId,
        message: `Etapa ${update.stageId} ${statusMessage}.`,
        at: updatedAt,
      }),
    ].slice(-80),
  };

  const receiptMessage = `Receipt durable para ${update.stageId}: ${statusMessage}.`;
  const withReceipt = appendReceipt(nextRecord, {
    action: 'stage_status',
    message: receiptMessage,
    stageId: update.stageId,
    createdAt: updatedAt,
  });
  return syncAgentPlannerJob(withReceipt, {
    action: 'stage_status',
    message: receiptMessage,
    createdAt: updatedAt,
  });
}

export function applyAgentPlannerCustomTaskUpdate(
  record: AgentPlannerRecord,
  update: AgentPlannerCustomTaskUpdate
): AgentPlannerRecord {
  const taskId = update.taskId.trim();
  if (!taskId) {
    return record;
  }
  const existingTask = (record.customTasks ?? []).find((task) => task.taskId === taskId);
  if (!existingTask) {
    return record;
  }

  const updatedAt = nowIso();
  const customTasks = (record.customTasks ?? []).map((task) =>
    task.taskId === taskId
      ? {
          ...task,
          status: update.status,
          summary: update.resultSummary?.trim() || task.summary,
          updatedAt,
        }
      : task
  );
  const stageTasks = customTasks.filter((task) => task.stageId === existingTask.stageId);
  const stageStatus = deriveStageStatusFromTasks(stageTasks);
  const statusMessage =
    update.status === 'running'
      ? 'iniciada'
      : update.status === 'completed'
        ? 'completada'
        : update.status === 'failed'
          ? 'falló'
          : update.status === 'skipped'
            ? 'omitida'
            : 'pendiente';

  const stages = record.stages.map((stage) => {
    if (stage.stageId !== existingTask.stageId) {
      return stage;
    }

    const startedAt =
      stageStatus === 'running'
        ? stage.startedAt || updatedAt
        : stage.startedAt;
    const completedAt =
      stageStatus === 'completed' || stageStatus === 'failed' || stageStatus === 'skipped'
        ? updatedAt
        : stageStatus === 'pending'
          ? null
          : stage.completedAt;

    return {
      ...stage,
      status: stageStatus,
      note: update.note === undefined ? stage.note : update.note,
      resultSummary:
        update.resultSummary?.trim() ||
        `${existingTask.title} ${statusMessage} desde acción directa de custom task.`,
      startedAt,
      completedAt,
      updatedAt,
    };
  });

  const nextRecord: AgentPlannerRecord = {
    ...record,
    status: derivePlannerStatus(stages),
    stages,
    customTasks,
    telemetry: buildTelemetry(stages),
    updatedAt,
    events: [
      ...record.events,
      buildEvent({
        kind: customTaskEventKind(update.status),
        stageId: existingTask.stageId,
        message: `Custom task ${taskId} ${statusMessage}.`,
        at: updatedAt,
      }),
    ].slice(-80),
  };

  const receiptMessage = `Receipt durable para custom task ${taskId}: ${statusMessage}.`;
  const withReceipt = appendReceipt(nextRecord, {
    action: 'custom_task_status',
    message: receiptMessage,
    stageId: existingTask.stageId,
    createdAt: updatedAt,
  });
  return syncAgentPlannerJob(withReceipt, {
    action: 'custom_task_status',
    message: receiptMessage,
    createdAt: updatedAt,
  });
}

export function applyAgentPlannerCustomTaskMetadataUpdate(
  record: AgentPlannerRecord,
  update: AgentPlannerCustomTaskMetadataUpdate
): AgentPlannerRecord {
  const taskId = update.taskId.trim();
  if (!taskId) {
    return record;
  }
  const existingTask = (record.customTasks ?? []).find((task) => task.taskId === taskId);
  if (!existingTask) {
    return record;
  }

  const updatedAt = nowIso();
  const nextTitle =
    update.title !== undefined
      ? update.title?.trim() || existingTask.title
      : existingTask.title;
  const nextSummary =
    update.summary !== undefined
      ? update.summary?.trim() || existingTask.summary
      : existingTask.summary;
  const nextOwner =
    update.owner !== undefined
      ? update.owner?.trim() || existingTask.owner
      : existingTask.owner;
  const nextPriority = update.priority || existingTask.priority;
  const nextSourceBlockId =
    update.sourceBlockId !== undefined
      ? update.sourceBlockId?.trim() || null
      : existingTask.sourceBlockId;
  const staleRevertConfirmation = update.staleRevertConfirmation
    ? {
        ...update.staleRevertConfirmation,
        reason: update.staleRevertConfirmation.reason.trim(),
        confirmedAt: updatedAt,
        blocker: {
          ...update.staleRevertConfirmation.blocker,
          laterChangeIds: [...update.staleRevertConfirmation.blocker.laterChangeIds],
        },
      }
    : undefined;

  const changes: AgentPlannerCustomTaskMetadataChange[] = [];
  const registerChange = (
    field: AgentPlannerCustomTaskMetadataChange['field'],
    before: string | null,
    after: string | null
  ) => {
    if (before === after) {
      return;
    }
    changes.push(
      buildMetadataChange({
        field,
        before,
        after,
        changedAt: updatedAt,
        source: update.source,
        revertedChangeId: update.revertedChangeId,
        staleRevertConfirmation,
      })
    );
  };
  registerChange('title', existingTask.title, nextTitle);
  registerChange('summary', existingTask.summary, nextSummary);
  registerChange('owner', existingTask.owner, nextOwner);
  registerChange('priority', existingTask.priority, nextPriority);
  registerChange('sourceBlockId', existingTask.sourceBlockId, nextSourceBlockId);

  if (changes.length === 0) {
    return record;
  }

  const customTasks = (record.customTasks ?? []).map((task) =>
    task.taskId === taskId
      ? {
          ...task,
          title: nextTitle,
          summary: nextSummary,
          owner: nextOwner,
          priority: nextPriority,
          sourceBlockId: nextSourceBlockId,
          evidenceRefs: updateSourceBlockEvidenceRefs(
            task.evidenceRefs,
            task.sourceBlockId,
            nextSourceBlockId
          ),
          metadataHistory: [...(task.metadataHistory ?? []), ...changes].slice(-40),
          updatedAt,
        }
      : task
  );

  const customStages = (record.customStages ?? []).map((stage) =>
    stage.taskIds.includes(taskId)
      ? {
          ...stage,
          title: deriveCustomStageTitle(stage, customTasks),
          owner: deriveCustomStageOwner(stage, customTasks),
        }
      : stage
  );

  const stages = record.stages.map((stage) => {
    const matchingCustomStage = customStages.find((customStage) => customStage.stageId === stage.stageId);
    if (!matchingCustomStage?.taskIds.includes(taskId)) {
      return stage;
    }
    return {
      ...stage,
      title: matchingCustomStage.title,
      owner: matchingCustomStage.owner,
      note: `Metadata actualizada para custom task ${taskId}: ${changes.map((change) => change.field).join(', ')}.`,
      updatedAt,
    };
  });

  const nextRecord: AgentPlannerRecord = {
    ...record,
    stages,
    customStages,
    customTasks,
    telemetry: buildTelemetry(stages),
    updatedAt,
    events: [
      ...record.events,
      buildEvent({
        kind: update.source === 'metadata_revert' ? 'custom_task_metadata_reverted' : 'custom_task_updated',
        stageId: existingTask.stageId,
        message: `Custom task ${taskId} actualizada: ${changes.map((change) => `${change.field}=${change.after || 'none'}`).join(', ')}.`,
        at: updatedAt,
      }),
    ].slice(-80),
  };

  const receiptAction =
    update.source === 'metadata_revert'
      ? 'custom_task_metadata_revert'
      : 'custom_task_metadata';
  const receiptMessage =
    update.source === 'metadata_revert'
      ? staleRevertConfirmation
        ? `Receipt durable para revert metadata custom task ${taskId}; confirmado por ${staleRevertConfirmation.confirmedByEmail}.`
        : `Receipt durable para revert metadata custom task ${taskId}.`
      : `Receipt durable para metadata custom task ${taskId}.`;
  const withReceipt = appendReceipt(nextRecord, {
    action: receiptAction,
    message: receiptMessage,
    stageId: existingTask.stageId,
    createdAt: updatedAt,
  });
  return syncAgentPlannerJob(withReceipt, {
    action: receiptAction,
    message: receiptMessage,
    createdAt: updatedAt,
  });
}

export function applyAgentPlannerCustomTaskMetadataRevert(
  record: AgentPlannerRecord,
  update: AgentPlannerCustomTaskMetadataRevertUpdate
): AgentPlannerRecord {
  const taskId = update.taskId.trim();
  const historyEntryId = update.historyEntryId.trim();
  if (!taskId || !historyEntryId) {
    return record;
  }

  const task = (record.customTasks ?? []).find((entry) => entry.taskId === taskId);
  const historyEntry = task?.metadataHistory?.find((entry) => entry.id === historyEntryId);
  if (!task || !historyEntry) {
    return record;
  }

  const revertUpdate: AgentPlannerCustomTaskMetadataUpdate = {
    taskId,
    source: 'metadata_revert',
    revertedChangeId: historyEntry.id,
    staleRevertConfirmation: update.staleRevertConfirmation,
  };
  if (historyEntry.field === 'title') {
    revertUpdate.title = historyEntry.before;
  } else if (historyEntry.field === 'summary') {
    revertUpdate.summary = historyEntry.before;
  } else if (historyEntry.field === 'owner') {
    revertUpdate.owner = historyEntry.before;
  } else if (historyEntry.field === 'priority') {
    revertUpdate.priority =
      historyEntry.before === 'low' ||
      historyEntry.before === 'medium' ||
      historyEntry.before === 'high'
        ? historyEntry.before
        : undefined;
  } else if (historyEntry.field === 'sourceBlockId') {
    revertUpdate.sourceBlockId = historyEntry.before;
  }

  return applyAgentPlannerCustomTaskMetadataUpdate(record, revertUpdate);
}

export function findAgentPlannerCustomTaskMetadataRevertBlocker(
  record: AgentPlannerRecord,
  update: AgentPlannerCustomTaskMetadataRevertUpdate
): AgentPlannerCustomTaskMetadataRevertBlocker | null {
  if (update.confirmStaleRevert) {
    return null;
  }

  return findAgentPlannerCustomTaskMetadataStaleRevert(record, update);
}

export function findAgentPlannerCustomTaskMetadataStaleRevert(
  record: AgentPlannerRecord,
  update: Pick<AgentPlannerCustomTaskMetadataRevertUpdate, 'taskId' | 'historyEntryId'>
): AgentPlannerCustomTaskMetadataRevertBlocker | null {

  const taskId = update.taskId.trim();
  const historyEntryId = update.historyEntryId.trim();
  const task = (record.customTasks ?? []).find((entry) => entry.taskId === taskId);
  const history = task?.metadataHistory ?? [];
  const historyIndex = history.findIndex((entry) => entry.id === historyEntryId);
  if (!task || historyIndex < 0) {
    return null;
  }

  const historyEntry = history[historyIndex];
  const laterChanges = history
    .slice(historyIndex + 1)
    .filter((entry) => entry.field === historyEntry.field);
  if (laterChanges.length === 0) {
    return null;
  }

  return {
    code: 'STALE_METADATA_REVERT_REQUIRES_CONFIRMATION',
    taskId,
    historyEntryId,
    field: historyEntry.field,
    currentValue: getCustomTaskMetadataFieldValue(task, historyEntry.field),
    revertToValue: historyEntry.before,
    laterChangeIds: laterChanges.map((entry) => entry.id),
    message:
      `El campo ${historyEntry.field} cambió ${laterChanges.length} vez/veces después de esta entrada. ` +
      'Confirma explícitamente para revertir a un valor potencialmente obsoleto.',
  };
}

export function toClientAgentPlannerPlan(record: AgentPlannerRecord): ClientAgentPlannerPlan {
  return {
    planId: record.planId,
    projectKey: record.projectKey,
    prompt: record.prompt,
    selectedLevel: record.selectedLevel,
    style: record.style,
    target: record.target,
    rigRequired: record.rigRequired,
    status: record.status,
    summary: record.summary,
    stages: record.stages.map((stage) => ({
      stageId: stage.stageId,
      title: stage.title,
      status: stage.status,
      note: stage.note,
      resultSummary: stage.resultSummary,
      startedAt: stage.startedAt,
      completedAt: stage.completedAt,
      updatedAt: stage.updatedAt,
    })),
    checkpoints: [...record.checkpoints],
    events: record.events.map((event) => ({ ...event })),
    receipts: (record.receipts ?? []).map((receipt) => ({
      ...receipt,
      execution: { ...receipt.execution },
    })),
    jobs: (record.jobs ?? []).map((job) => ({ ...job })),
    assistantJobs: (record.assistantJobs ?? []).map((job) => ({
      ...job,
      asset: job.asset ? { ...job.asset } : null,
    })),
    customStages: (record.customStages ?? []).map((stage) => ({
      ...stage,
      validationRules: [...stage.validationRules],
      taskIds: [...stage.taskIds],
    })),
    customTasks: (record.customTasks ?? []).map((task) => ({
      ...task,
      evidenceRefs: [...task.evidenceRefs],
      requiredDecisions: [...task.requiredDecisions],
      metadataHistory: (task.metadataHistory ?? []).map((entry) => ({ ...entry })),
    })),
    telemetry: { ...record.telemetry },
    execution: deriveAgentExecutionRecord(record),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastResumedAt: record.lastResumedAt,
  };
}

export function isAgentPlannerRecord(value: unknown): value is AgentPlannerRecord {
  if (!isRecord(value)) return false;
  return (
    typeof value.planId === 'string' &&
    typeof value.projectKey === 'string' &&
    typeof value.prompt === 'string' &&
    typeof value.selectedLevel === 'string' &&
    isPlannerStatus(value.status) &&
    typeof value.summary === 'string' &&
    Array.isArray(value.stages) &&
    value.stages.every((stage) =>
      isRecord(stage) &&
      typeof stage.stageId === 'string' &&
      typeof stage.title === 'string' &&
      typeof stage.owner === 'string' &&
      isStageStatus(stage.status)
    ) &&
    Array.isArray(value.checkpoints) &&
    Array.isArray(value.events) &&
    (value.receipts === undefined ||
      (Array.isArray(value.receipts) &&
        value.receipts.every(
          (receipt) =>
            isRecord(receipt) &&
            typeof receipt.receiptId === 'string' &&
            typeof receipt.action === 'string' &&
            typeof receipt.message === 'string' &&
            (receipt.stageId === null || typeof receipt.stageId === 'string') &&
            isPlannerStatus(receipt.planStatus) &&
            isRecord(receipt.execution) &&
            typeof receipt.createdAt === 'string'
        ))) &&
      (value.jobs === undefined ||
        (Array.isArray(value.jobs) &&
          value.jobs.every(
          (job) =>
            isRecord(job) &&
            typeof job.jobId === 'string' &&
            typeof job.attemptNumber === 'number' &&
            typeof job.planId === 'string' &&
            typeof job.projectKey === 'string' &&
            typeof job.status === 'string' &&
            typeof job.executionState === 'string' &&
            typeof job.action === 'string' &&
            (job.currentStageId === null || typeof job.currentStageId === 'string') &&
            (job.nextStageId === null || typeof job.nextStageId === 'string') &&
            typeof job.progressPercent === 'number' &&
            typeof job.resumable === 'boolean' &&
            job.persisted === true &&
            typeof job.requestedAt === 'string' &&
            typeof job.updatedAt === 'string' &&
            (job.lastReceiptId === null || typeof job.lastReceiptId === 'string') &&
              (job.lastReceiptAt === null || typeof job.lastReceiptAt === 'string') &&
              typeof job.lastMessage === 'string'
          ))) &&
      (value.assistantJobs === undefined ||
        (Array.isArray(value.assistantJobs) &&
          value.assistantJobs.every(
            (job) =>
              isRecord(job) &&
              typeof job.taskId === 'string' &&
              typeof job.kind === 'string' &&
              typeof job.backend === 'string' &&
              typeof job.status === 'string' &&
              (job.stage === null || typeof job.stage === 'string') &&
              (job.progress === null || typeof job.progress === 'number') &&
              typeof job.readyToFinalize === 'boolean' &&
              (job.asset === null || isRecord(job.asset)) &&
              typeof job.linkedAt === 'string' &&
              typeof job.updatedAt === 'string' &&
              typeof job.lastMessage === 'string' &&
              (job.error === null || typeof job.error === 'string') &&
              typeof job.resultStatus === 'string' &&
              (job.resultSummary === null || typeof job.resultSummary === 'string') &&
              (job.lastReceiptId === null || typeof job.lastReceiptId === 'string') &&
              (job.lastReceiptAt === null || typeof job.lastReceiptAt === 'string')
          ))) &&
      isRecord(value.telemetry) &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string'
  );
}
