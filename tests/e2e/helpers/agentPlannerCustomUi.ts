import { expect } from 'vitest';
import type { Locator, Page } from 'playwright';
import {
  countCustomTaskMetadataHistory,
  createCustomTaskMetadataHistoryReport,
  createCustomTaskMetadataHistoryReportFilename,
  createCustomTaskMetadataRevertAuditReport,
  createCustomTaskMetadataRevertAuditReportFilename,
  filterCustomTaskMetadataRevertAudits,
  sumCustomTaskMetadataHistoryCounts,
} from '../../../src/engine/ai/agentPlannerMetadataHistoryReport';
import {
  createStaleMetadataRevertPolicyAuditReport,
  createStaleMetadataRevertPolicyAuditReportFilename,
  type StaleMetadataRevertPolicyConfigRecord,
  type StaleMetadataRevertPolicyAuditEvent,
  type StaleMetadataRevertPolicySnapshot,
} from '../../../src/lib/server/stale-metadata-revert-policy';
import { fulfillJson } from './nextDevServer';

export type PlannerStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export type AgentPlannerCustomUiRouteState = {
  currentPlan: any;
  patchStatuses: PlannerStatus[];
  metadataSources: string[];
  staleRevertConfirmations: Array<{
    taskId: string;
    historyEntryId: string;
    reason: string;
    confirmedByEmail: string;
  }>;
  staleRevertPolicyConfig: StaleMetadataRevertPolicyConfigRecord | null;
  staleRevertPolicyAuditTrail: StaleMetadataRevertPolicyAuditEvent[];
  reanalysisCreateBlockSelections: string[][];
};

function createExecution(plan: any) {
  const currentStage = plan.stages.find((stage: any) => stage.status === 'running') ?? null;
  const nextStage = plan.stages.find((stage: any) => stage.status === 'pending') ?? null;
  const completedStages = plan.stages.filter(
    (stage: any) => stage.status === 'completed' || stage.status === 'skipped'
  ).length;
  const progressPercent =
    plan.stages.length > 0 ? Math.round((completedStages / plan.stages.length) * 100) : 0;

  return {
    state: plan.status === 'failed' ? 'blocked' : currentStage ? 'running' : 'idle',
    currentStageId: currentStage?.stageId ?? null,
    nextStageId: nextStage?.stageId ?? null,
    progressPercent,
    resumable: plan.status !== 'completed' && plan.status !== 'canceled',
    lastEventKind: plan.events.at(-1)?.kind ?? null,
    lastEventAt: plan.events.at(-1)?.at ?? null,
    lastCheckpoint: plan.checkpoints.at(-1) ?? null,
  };
}

function createTelemetry(plan: any) {
  return {
    totalStages: plan.stages.length,
    pendingStages: plan.stages.filter((stage: any) => stage.status === 'pending').length,
    runningStageId: plan.stages.find((stage: any) => stage.status === 'running')?.stageId ?? null,
    completedStages: plan.stages.filter((stage: any) => stage.status === 'completed').length,
    failedStages: plan.stages.filter((stage: any) => stage.status === 'failed').length,
  };
}

export function createPlannerFromPayload(payload: any) {
  const now = '2026-04-18T00:00:00.000Z';
  const tasks = (payload.customTasks ?? []).map((task: any, index: number) => {
    const taskId = task.taskId || `custom_task_${index + 1}`;
    return {
      taskId,
      stageId: `custom_${taskId}`,
      title: task.title,
      summary: task.summary || task.title,
      priority: task.priority || 'medium',
      owner: task.owner || 'technical_lead',
      evidenceRefs: task.evidenceRefs || [],
      requiredDecisions: task.requiredDecisions || [],
      sourceBlockId: task.sourceBlockId || null,
      status: 'pending' as PlannerStatus,
      metadataHistory: [],
      createdAt: now,
      updatedAt: now,
    };
  });
  const stages = tasks.map((task: any) => ({
    stageId: task.stageId,
    title: task.title,
    status: task.status,
    note: null,
    resultSummary: null,
    startedAt: null,
    completedAt: null,
    updatedAt: now,
  }));
  const plan: any = {
    planId: 'custom-ui-plan',
    projectKey: 'untitled_project',
    prompt: payload.prompt,
    selectedLevel: payload.level || 'level1_copilot',
    style: payload.style || null,
    target: payload.target || null,
    rigRequired: payload.rigRequired !== false,
    status: 'draft',
    summary: payload.customSummary || `Custom planner: ${payload.prompt}`,
    stages,
    checkpoints: payload.customCheckpoints || [],
    events: [
      {
        id: 'event-created',
        kind: 'created',
        message: 'Plan custom de agentes creado.',
        at: now,
        stageId: null,
      },
    ],
    receipts: [
      {
        receiptId: 'receipt-created',
        action: 'create',
        message: 'Planner durable creado y listo para ejecución.',
        stageId: null,
        planStatus: 'draft',
        execution: {
          state: 'idle',
          currentStageId: null,
          nextStageId: stages[0]?.stageId ?? null,
          progressPercent: 0,
          resumable: true,
          lastEventKind: 'created',
          lastEventAt: now,
          lastCheckpoint: null,
        },
        createdAt: now,
      },
    ],
    jobs: [
      {
        jobId: 'planner-job-created',
        attemptNumber: 1,
        planId: 'custom-ui-plan',
        projectKey: 'untitled_project',
        status: 'queued',
        executionState: 'idle',
        action: 'create',
        currentStageId: null,
        nextStageId: stages[0]?.stageId ?? null,
        progressPercent: 0,
        resumable: true,
        persisted: true,
        requestedAt: now,
        updatedAt: now,
        lastReceiptId: 'receipt-created',
        lastReceiptAt: now,
        lastMessage: 'Planner durable creado y listo para ejecución.',
      },
    ],
    assistantJobs: [],
    customStages: tasks.map((task: any) => ({
      stageId: task.stageId,
      title: task.title,
      owner: task.owner,
      validationRules: task.requiredDecisions,
      source: 'custom_task',
      taskIds: [task.taskId],
    })),
    customTasks: tasks,
    telemetry: {
      totalStages: stages.length,
      pendingStages: stages.length,
      runningStageId: null,
      completedStages: 0,
      failedStages: 0,
    },
    execution: {
      state: 'idle',
      currentStageId: null,
      nextStageId: stages[0]?.stageId ?? null,
      progressPercent: 0,
      resumable: true,
      lastEventKind: 'created',
      lastEventAt: now,
      lastCheckpoint: null,
    },
    createdAt: now,
    updatedAt: now,
    lastResumedAt: null,
  };
  return plan;
}

function updateCustomTask(plan: any, taskId: string, status: PlannerStatus, resultSummary: string) {
  const now = new Date().toISOString();
  const task = plan.customTasks.find((entry: any) => entry.taskId === taskId);
  if (!task) return plan;
  const nextTasks = plan.customTasks.map((entry: any) =>
    entry.taskId === taskId ? { ...entry, status, summary: resultSummary, updatedAt: now } : entry
  );
  const nextStages = plan.stages.map((stage: any) =>
    stage.stageId === task.stageId
      ? {
          ...stage,
          status,
          resultSummary,
          startedAt: status === 'running' ? stage.startedAt || now : stage.startedAt,
          completedAt: status === 'completed' || status === 'failed' ? now : stage.completedAt,
          updatedAt: now,
        }
      : stage
  );
  const nextPlan = {
    ...plan,
    status:
      status === 'failed'
        ? 'failed'
        : nextStages.every((stage: any) => stage.status === 'completed')
          ? 'completed'
          : 'running',
    stages: nextStages,
    customTasks: nextTasks,
    updatedAt: now,
    events: [
      ...plan.events,
      {
        id: `event-${status}-${taskId}`,
        kind:
          status === 'failed'
            ? 'custom_task_failed'
            : status === 'completed'
              ? 'custom_task_completed'
              : 'custom_task_running',
        message: `Custom task ${taskId} ${status}.`,
        at: now,
        stageId: task.stageId,
      },
    ],
  };
  nextPlan.telemetry = createTelemetry(nextPlan);
  nextPlan.execution = createExecution(nextPlan);
  nextPlan.receipts = [
    ...plan.receipts,
    {
      receiptId: `receipt-${status}-${taskId}`,
      action: 'custom_task_status',
      message: `Receipt durable para custom task ${taskId}: ${status}.`,
      stageId: task.stageId,
      planStatus: nextPlan.status,
      execution: nextPlan.execution,
      createdAt: now,
    },
  ];
  nextPlan.jobs = [
    {
      ...plan.jobs.at(-1),
      action: 'custom_task_status',
      status:
        nextPlan.execution.state === 'blocked'
          ? 'blocked'
          : nextPlan.execution.state === 'running'
            ? 'running'
            : 'completed',
      executionState: nextPlan.execution.state,
      currentStageId: nextPlan.execution.currentStageId,
      nextStageId: nextPlan.execution.nextStageId,
      progressPercent: nextPlan.execution.progressPercent,
      updatedAt: now,
      lastReceiptId: nextPlan.receipts.at(-1).receiptId,
      lastReceiptAt: now,
      lastMessage: `Receipt durable para custom task ${taskId}: ${status}.`,
    },
  ];
  return nextPlan;
}

function updateCustomTaskMetadata(plan: any, payload: any) {
  const now = new Date().toISOString();
  const task = plan.customTasks.find((entry: any) => entry.taskId === payload.taskId);
  if (!task) return plan;
  const nextTask = {
    ...task,
    title: payload.title || task.title,
    summary: payload.summary || task.summary,
    owner: payload.owner || task.owner,
    priority: payload.priority || task.priority,
    sourceBlockId: payload.sourceBlockId || null,
  };
  const changes = (['title', 'summary', 'owner', 'priority', 'sourceBlockId'] as const)
    .filter((field) => task[field] !== nextTask[field])
    .map((field) => ({
      id: `history-${field}-${now}`,
      field,
      before: task[field] ?? null,
      after: nextTask[field] ?? null,
      changedAt: now,
      source: payload.source || 'planner_patch',
      revertedChangeId: payload.revertedChangeId,
      staleRevertConfirmation: payload.staleRevertConfirmation
        ? {
            ...payload.staleRevertConfirmation,
            confirmedAt: now,
          }
        : undefined,
    }));
  const nextTasks = plan.customTasks.map((entry: any) =>
    entry.taskId === payload.taskId
      ? {
          ...entry,
          ...nextTask,
          evidenceRefs: [
            ...entry.evidenceRefs.filter((ref: string) => !ref.startsWith('sourceBlock:')),
            ...(payload.sourceBlockId ? [`sourceBlock:${payload.sourceBlockId}`] : []),
          ],
          metadataHistory: [...(entry.metadataHistory ?? []), ...changes],
          updatedAt: now,
        }
      : entry
  );
  const nextPlan = {
    ...plan,
    customTasks: nextTasks,
    customStages: plan.customStages.map((stage: any) =>
      stage.taskIds.includes(payload.taskId)
        ? {
            ...stage,
            title: nextTask.title,
            owner: payload.owner || stage.owner,
          }
        : stage
    ),
    stages: plan.stages.map((stage: any) =>
      stage.stageId === task.stageId
        ? {
            ...stage,
            title: nextTask.title,
            owner: payload.owner || stage.owner,
            note: `Metadata actualizada para custom task ${payload.taskId}.`,
            updatedAt: now,
          }
        : stage
    ),
    updatedAt: now,
    events: [
      ...plan.events,
      {
        id: `event-metadata-${payload.taskId}`,
        kind:
          payload.source === 'metadata_revert'
            ? 'custom_task_metadata_reverted'
            : 'custom_task_updated',
        message: `Custom task ${payload.taskId} metadata updated.`,
        at: now,
        stageId: task.stageId,
      },
    ],
  };
  nextPlan.telemetry = createTelemetry(nextPlan);
  nextPlan.execution = createExecution(nextPlan);
  nextPlan.receipts = [
    ...plan.receipts,
    {
      receiptId: `receipt-metadata-${payload.taskId}`,
      action:
        payload.source === 'metadata_revert'
          ? 'custom_task_metadata_revert'
          : 'custom_task_metadata',
      message: `Receipt durable para metadata custom task ${payload.taskId}.`,
      stageId: task.stageId,
      planStatus: nextPlan.status,
      execution: nextPlan.execution,
      createdAt: now,
    },
  ];
  nextPlan.jobs = [
    {
      ...plan.jobs.at(-1),
      action:
        payload.source === 'metadata_revert'
          ? 'custom_task_metadata_revert'
          : 'custom_task_metadata',
      updatedAt: now,
      lastReceiptId: nextPlan.receipts.at(-1).receiptId,
      lastReceiptAt: now,
      lastMessage: `Receipt durable para metadata custom task ${payload.taskId}.`,
    },
  ];
  return nextPlan;
}

function revertCustomTaskMetadata(plan: any, payload: any) {
  const task = plan.customTasks.find((entry: any) => entry.taskId === payload.taskId);
  const historyEntry = task?.metadataHistory?.find(
    (entry: any) => entry.id === payload.historyEntryId
  );
  if (!task || !historyEntry) return plan;

  return updateCustomTaskMetadata(plan, {
    taskId: payload.taskId,
    title: historyEntry.field === 'title' ? historyEntry.before : task.title,
    summary: historyEntry.field === 'summary' ? historyEntry.before : task.summary,
    owner: historyEntry.field === 'owner' ? historyEntry.before : task.owner,
    priority: historyEntry.field === 'priority' ? historyEntry.before : task.priority,
    sourceBlockId:
      historyEntry.field === 'sourceBlockId' ? historyEntry.before : task.sourceBlockId,
    source: 'metadata_revert',
    revertedChangeId: historyEntry.id,
    staleRevertConfirmation: payload.staleRevertConfirmation,
  });
}

function findStaleMetadataRevertBlocker(plan: any, payload: any) {
  const task = plan?.customTasks?.find((entry: any) => entry.taskId === payload.taskId);
  const history = task?.metadataHistory ?? [];
  const historyIndex = history.findIndex((entry: any) => entry.id === payload.historyEntryId);
  if (!task || historyIndex < 0) {
    return null;
  }
  const historyEntry = history[historyIndex];
  const laterChanges = history
    .slice(historyIndex + 1)
    .filter((entry: any) => entry.field === historyEntry.field);
  if (laterChanges.length === 0) {
    return null;
  }
  return {
    code: 'STALE_METADATA_REVERT_REQUIRES_CONFIRMATION',
    taskId: payload.taskId,
    historyEntryId: payload.historyEntryId,
    field: historyEntry.field,
    currentValue: task[historyEntry.field] ?? null,
    revertToValue: historyEntry.before ?? null,
    laterChangeIds: laterChanges.map((entry: any) => entry.id),
    message:
      `El campo ${historyEntry.field} cambió ${laterChanges.length} vez/veces después de esta entrada. ` +
      'Confirma explícitamente para revertir a un valor potencialmente obsoleto.',
  };
}

function createReanalysisApprovedPlan(blockIds: string[] = ['approved_scope_block']) {
  const allTasks = [
    {
      taskId: 'p2_task_approved_scope',
      title: 'Scope aprobado desde reanalysis',
      summary: 'Convertir bloque aprobado en tarea custom.',
      priority: 'high',
      owner: 'agentic_orchestrator',
      evidenceRefs: ['reviewBlocks.scope', 'sourceBlock:approved_scope_block'],
      requiredDecisions: ['approved'],
      sourceBlockId: 'approved_scope_block',
    },
    {
      taskId: 'p2_task_optional_ui',
      title: 'Bloque UI opcional desde reanalysis',
      summary: 'Convertir bloque UI aprobado si el usuario lo selecciona.',
      priority: 'medium',
      owner: 'technical_lead',
      evidenceRefs: ['reviewBlocks.ui', 'sourceBlock:approved_ui_block'],
      requiredDecisions: ['approved'],
      sourceBlockId: 'approved_ui_block',
    },
  ];
  return createPlannerFromPayload({
    prompt: 'P2 review-to-reanalysis aprobado',
    level: 'level1_copilot',
    style: 'p2-review-to-reanalysis',
    target: 'agentic-editor',
    rigRequired: false,
    customSummary: 'P2 planner desde reanalysis: 1 tarea aprobada.',
    customCheckpoints: ['Ejecutar solo customTasks aprobadas desde el scope revisable.'],
    customTasks: allTasks.filter((task) => blockIds.includes(task.sourceBlockId)),
  });
}

export async function installAgentPlannerCustomUiRoutes(page: Page) {
  const state: AgentPlannerCustomUiRouteState = {
    currentPlan: null,
    patchStatuses: [],
    metadataSources: [],
    staleRevertConfirmations: [],
    staleRevertPolicyConfig: null,
    staleRevertPolicyAuditTrail: [],
    reanalysisCreateBlockSelections: [],
  };

  await page.route('**/api/auth/session', (route) =>
    fulfillJson(route, {
      authenticated: true,
      accessMode: 'user_session',
      user: { id: 'editor-1', role: 'OWNER', email: 'editor@example.com' },
      editorAccess: {
        shellMode: 'advanced',
        permissions: {
          advancedShell: true,
          admin: true,
          compile: true,
          advancedWorkspaces: true,
          debugTools: true,
          editorSessionBridge: true,
          terminalActions: false,
        },
      },
    })
  );

  await page.route('**/api/editor-session**', (route) =>
    fulfillJson(route, { success: true, active: false, session: null })
  );

  await page.route('**/api/assistant/reanalysis**', async (route) => {
    const payload = JSON.parse(route.request().postData() || '{}');
    if (route.request().method() === 'GET') {
      await fulfillJson(route, {
        success: true,
        jobs: [
          {
            id: 'reanalysis-approved-e2e',
            status: 'completed',
            scope: {
              reviewBlocks: [
                {
                  id: 'approved_scope_block',
                  title: 'Approved scope block',
                  summary: 'Bloque principal aprobado.',
                  priority: 'high',
                  suggestedOwner: 'agentic_orchestrator',
                },
                {
                  id: 'approved_ui_block',
                  title: 'Approved UI block',
                  summary: 'Bloque UI aprobado y seleccionable.',
                  priority: 'medium',
                  suggestedOwner: 'technical_lead',
                },
              ],
            },
            blockDecisions: {
              approved_scope_block: {
                decision: 'approved',
              },
              approved_ui_block: {
                decision: 'approved',
              },
            },
            plannerLink: null,
          },
        ],
        count: 1,
      });
      return;
    }
    if (route.request().method() === 'PATCH') {
      expect(payload.action).toBe('create_planner_from_approved_scope');
      state.reanalysisCreateBlockSelections.push(payload.approvedBlockIds ?? []);
      state.currentPlan = createReanalysisApprovedPlan(payload.approvedBlockIds);
      await fulfillJson(route, {
        success: true,
        action: 'create_planner_from_approved_scope',
        job: {
          id: 'reanalysis-approved-e2e',
          status: 'completed',
        },
        tasks: state.currentPlan.customTasks,
        plan: state.currentPlan,
        execution: state.currentPlan.execution,
        plannerJob: state.currentPlan.jobs.at(-1),
      });
      return;
    }
    await fulfillJson(route, { error: 'unsupported method' }, 405);
  });

  await page.route('**/api/ai-agents**', async (route) => {
    const requestUrl = new URL(route.request().url());
    const resolvePolicyAuditEventType = () => {
      const eventType = requestUrl.searchParams.get('eventType') || 'all';
      return eventType === 'stale_metadata_revert_allowlist_changed' ||
        eventType === 'stale_metadata_revert_allowlist_reset_to_env'
        ? eventType
        : 'all';
    };
    const resolvePolicyAuditActor = () =>
      (requestUrl.searchParams.get('actor') || requestUrl.searchParams.get('actorEmail') || '').trim();
    const resolvePolicyAuditDateRange = () => {
      const from = (requestUrl.searchParams.get('from') || requestUrl.searchParams.get('dateFrom') || '').trim();
      const to = (requestUrl.searchParams.get('to') || requestUrl.searchParams.get('dateTo') || '').trim();
      return {
        from,
        to,
        fromMs: from ? Date.parse(from) : null,
        toMs: to ? Date.parse(to) : null,
      };
    };
    const buildPolicyAuditPayload = (
      limit: number,
      offset: number,
      eventType = 'all',
      actor = '',
      dateRange = { from: '', to: '', fromMs: null as number | null, toMs: null as number | null }
    ) => {
      const actorFilter = actor.trim().toLowerCase();
      const eventTypeFilteredAuditTrail =
        eventType === 'all'
          ? state.staleRevertPolicyAuditTrail
          : state.staleRevertPolicyAuditTrail.filter((event) => event.eventType === eventType);
      const actorFilteredAuditTrail = actorFilter
        ? eventTypeFilteredAuditTrail.filter(
            (event) =>
              event.actorUserId.toLowerCase().includes(actorFilter) ||
              event.actorEmail.toLowerCase().includes(actorFilter)
          )
        : eventTypeFilteredAuditTrail;
      const filteredAuditTrail = actorFilteredAuditTrail.filter((event) => {
        if (dateRange.fromMs === null && dateRange.toMs === null) {
          return true;
        }
        const eventMs = Date.parse(event.at);
        return (
          Number.isFinite(eventMs) &&
          (dateRange.fromMs === null || eventMs >= dateRange.fromMs) &&
          (dateRange.toMs === null || eventMs <= dateRange.toMs)
        );
      });
      const orderedAuditTrail = [...filteredAuditTrail].reverse();
      const auditTrail = orderedAuditTrail.slice(offset, offset + limit);
      return {
        auditTrail,
        auditCount: auditTrail.length,
        totalAuditCount: filteredAuditTrail.length,
        auditPagination: {
          limit,
          offset,
          total: filteredAuditTrail.length,
          hasMore: offset + limit < filteredAuditTrail.length,
          nextOffset: offset + limit < filteredAuditTrail.length ? offset + limit : null,
        },
        eventType,
        auditEventType: eventType,
        actorFilter: actor.trim() || null,
        auditActorFilter: actor.trim() || null,
        dateFromFilter: dateRange.from || null,
        dateToFilter: dateRange.to || null,
        auditDateFromFilter: dateRange.from || null,
        auditDateToFilter: dateRange.to || null,
        filterOptions: [
          'all',
          'stale_metadata_revert_allowlist_changed',
          'stale_metadata_revert_allowlist_reset_to_env',
        ],
        auditFilterOptions: [
          'all',
          'stale_metadata_revert_allowlist_changed',
          'stale_metadata_revert_allowlist_reset_to_env',
        ],
      };
    };
    if (requestUrl.pathname.endsWith('/api/ai-agents/stale-revert-policy/audit')) {
      const limit = Math.min(Number.parseInt(requestUrl.searchParams.get('limit') || '50', 10), 250);
      const offset = Number.parseInt(requestUrl.searchParams.get('offset') || '0', 10);
      await fulfillJson(route, {
        success: true,
        ...buildPolicyAuditPayload(
          limit,
          offset,
          resolvePolicyAuditEventType(),
          resolvePolicyAuditActor(),
          resolvePolicyAuditDateRange()
        ),
      });
      return;
    }
    if (requestUrl.pathname.endsWith('/api/ai-agents/stale-revert-policy/export')) {
      const formatParam = requestUrl.searchParams.get('format');
      const format = formatParam === 'markdown' || formatParam === 'md' ? 'markdown' : 'json';
      const eventType = resolvePolicyAuditEventType();
      const actor = resolvePolicyAuditActor();
      const dateRange = resolvePolicyAuditDateRange();
      const exportScope = requestUrl.searchParams.get('exportScope') === 'page' ? 'page' : 'all';
      const limit = Math.min(Number.parseInt(requestUrl.searchParams.get('limit') || '50', 10), 250);
      const offset = Number.parseInt(requestUrl.searchParams.get('offset') || '0', 10);
      const auditPayload = buildPolicyAuditPayload(limit, offset, eventType, actor, dateRange);
      const reportAuditTrail =
        exportScope === 'page'
          ? auditPayload.auditTrail
          : [...state.staleRevertPolicyAuditTrail]
              .filter((event) => (eventType === 'all' ? true : event.eventType === eventType))
              .filter((event) => {
                const actorFilter = actor.toLowerCase();
                return actorFilter
                  ? event.actorUserId.toLowerCase().includes(actorFilter) ||
                      event.actorEmail.toLowerCase().includes(actorFilter)
                  : true;
              })
              .filter((event) => {
                if (dateRange.fromMs === null && dateRange.toMs === null) {
                  return true;
                }
                const eventMs = Date.parse(event.at);
                return (
                  Number.isFinite(eventMs) &&
                  (dateRange.fromMs === null || eventMs >= dateRange.fromMs) &&
                  (dateRange.toMs === null || eventMs <= dateRange.toMs)
                );
              })
              .reverse();
      const policySnapshot: StaleMetadataRevertPolicySnapshot = {
        policyId: 'stale_metadata_revert_confirmation_roles' as const,
        source: state.staleRevertPolicyConfig ? ('persisted_config' as const) : ('env' as const),
        defaultRoles: ['OWNER'],
        configuredRoles: state.staleRevertPolicyConfig?.allowedRoles ?? [],
        ignoredValues: [],
        allowedRoles: state.staleRevertPolicyConfig?.allowedRoles ?? ['OWNER'],
        evaluatedRole: 'OWNER' as const,
        allowed: true,
        capturedAt: new Date().toISOString(),
        configVersion: state.staleRevertPolicyConfig?.version,
        configUpdatedAt: state.staleRevertPolicyConfig?.updatedAt,
      };
      const body = createStaleMetadataRevertPolicyAuditReport({
        config: state.staleRevertPolicyConfig,
        policySnapshot,
        auditTrail: reportAuditTrail,
        eventTypeFilter: eventType,
        actorFilter: actor,
        dateFromFilter: dateRange.from || null,
        dateToFilter: dateRange.to || null,
        fromMs: dateRange.fromMs,
        toMs: dateRange.toMs,
        exportScope,
        totalAuditCount: auditPayload.totalAuditCount,
        pagination:
          exportScope === 'page'
            ? auditPayload.auditPagination
            : {
                limit: auditPayload.totalAuditCount,
                offset: 0,
                total: auditPayload.totalAuditCount,
                hasMore: false,
                nextOffset: null,
              },
        format,
      });
      const filename = createStaleMetadataRevertPolicyAuditReportFilename(format);
      await route.fulfill({
        status: 200,
        contentType: format === 'json' ? 'application/json' : 'text/markdown',
        headers: {
          'content-disposition': `attachment; filename="${filename}"`,
        },
        body,
      });
      return;
    }
    if (requestUrl.pathname.endsWith('/api/ai-agents/stale-revert-policy')) {
      const auditLimit = Math.min(
        Number.parseInt(requestUrl.searchParams.get('auditLimit') || '50', 10),
        250
      );
      const auditOffset = Number.parseInt(requestUrl.searchParams.get('auditOffset') || '0', 10);
      const eventType = resolvePolicyAuditEventType();
      const actor = resolvePolicyAuditActor();
      const dateRange = resolvePolicyAuditDateRange();
      const buildAuditPayload = () =>
        buildPolicyAuditPayload(auditLimit, auditOffset, eventType, actor, dateRange);
      const policySnapshot: StaleMetadataRevertPolicySnapshot = {
        policyId: 'stale_metadata_revert_confirmation_roles' as const,
        source: state.staleRevertPolicyConfig ? ('persisted_config' as const) : ('env' as const),
        envVarName: state.staleRevertPolicyConfig
          ? undefined
          : 'REY30_STALE_METADATA_REVERT_CONFIRM_ROLES',
        defaultRoles: ['OWNER'],
        configuredRoles: state.staleRevertPolicyConfig?.allowedRoles ?? [],
        ignoredValues: [],
        allowedRoles: state.staleRevertPolicyConfig?.allowedRoles ?? ['OWNER'],
        evaluatedRole: 'OWNER' as const,
        allowed: true,
        capturedAt: new Date().toISOString(),
        configVersion: state.staleRevertPolicyConfig?.version,
        configUpdatedAt: state.staleRevertPolicyConfig?.updatedAt,
      };
      if (route.request().method() === 'GET') {
        const auditPayload = buildAuditPayload();
        await fulfillJson(route, {
          success: true,
          configured: Boolean(state.staleRevertPolicyConfig),
          config: state.staleRevertPolicyConfig
            ? {
                ...state.staleRevertPolicyConfig,
                auditTrail: auditPayload.auditTrail,
              }
            : null,
          ...auditPayload,
          envAllowedRoles: ['OWNER'],
          policySnapshot,
        });
        return;
      }
      if (route.request().method() === 'PATCH') {
        const payload = JSON.parse(route.request().postData() || '{}');
        const afterRoles = [
          ...new Set(['OWNER', ...(Array.isArray(payload.allowedRoles) ? payload.allowedRoles : [])]),
        ].filter(
          (role): role is StaleMetadataRevertPolicyConfigRecord['allowedRoles'][number] =>
            typeof role === 'string' && ['OWNER', 'EDITOR', 'VIEWER'].includes(role)
        );
        const now = new Date().toISOString();
        const event: StaleMetadataRevertPolicyConfigRecord['auditTrail'][number] = {
          id: `policy-event-${now}`,
          eventType: 'stale_metadata_revert_allowlist_changed',
          at: now,
          actorUserId: 'editor-1',
          actorEmail: 'editor@example.com',
          beforeRoles: state.staleRevertPolicyConfig?.allowedRoles ?? ['OWNER'],
          afterRoles,
          reason: String(payload.reason || '').trim() || null,
        };
        const nextConfig: StaleMetadataRevertPolicyConfigRecord = {
          policyId: 'stale_metadata_revert_confirmation_roles',
          version: (state.staleRevertPolicyConfig?.version ?? 0) + 1,
          allowedRoles: afterRoles,
          updatedAt: now,
          updatedByUserId: 'editor-1',
          updatedByEmail: 'editor@example.com',
          auditTrail: [...state.staleRevertPolicyAuditTrail, event],
        };
        state.staleRevertPolicyAuditTrail = [...state.staleRevertPolicyAuditTrail, event];
        state.staleRevertPolicyConfig = nextConfig;
        const auditPayload = buildAuditPayload();
        await fulfillJson(route, {
          success: true,
          configured: true,
          config: {
            ...nextConfig,
            auditTrail: auditPayload.auditTrail,
          },
          ...auditPayload,
          envAllowedRoles: ['OWNER'],
          event,
          policySnapshot: {
            ...policySnapshot,
            source: 'persisted_config',
            configuredRoles: afterRoles,
            allowedRoles: afterRoles,
            configVersion: nextConfig.version,
            configUpdatedAt: nextConfig.updatedAt,
          },
        });
        return;
      }
      if (route.request().method() === 'DELETE') {
        const payload = JSON.parse(route.request().postData() || '{}');
        const now = new Date().toISOString();
        const event: StaleMetadataRevertPolicyAuditEvent = {
          id: `policy-reset-${now}`,
          eventType: 'stale_metadata_revert_allowlist_reset_to_env',
          at: now,
          actorUserId: 'editor-1',
          actorEmail: 'editor@example.com',
          beforeRoles: state.staleRevertPolicyConfig?.allowedRoles ?? ['OWNER'],
          afterRoles: ['OWNER'],
          reason: String(payload.reason || '').trim() || null,
        };
        state.staleRevertPolicyAuditTrail = [...state.staleRevertPolicyAuditTrail, event];
        state.staleRevertPolicyConfig = null;
        const auditPayload = buildAuditPayload();
        await fulfillJson(route, {
          success: true,
          configured: false,
          config: null,
          ...auditPayload,
          envAllowedRoles: ['OWNER'],
          event,
          policySnapshot: {
            ...policySnapshot,
            source: 'env',
            envVarName: 'REY30_STALE_METADATA_REVERT_CONFIRM_ROLES',
            configuredRoles: [],
            allowedRoles: ['OWNER'],
            configVersion: undefined,
            configUpdatedAt: undefined,
          },
        });
        return;
      }
    }
    if (requestUrl.pathname.endsWith('/api/ai-agents/custom-task-history/export')) {
      const taskId = requestUrl.searchParams.get('taskId') || '';
      const formatParam = requestUrl.searchParams.get('format');
      const format = formatParam === 'markdown' || formatParam === 'md' ? 'markdown' : 'json';
      const task = state.currentPlan?.customTasks?.find((entry: any) => entry.taskId === taskId);
      if (!task) {
        await fulfillJson(route, { success: false, error: 'task not found' }, 404);
        return;
      }
      const body = createCustomTaskMetadataHistoryReport({
        projectKey: state.currentPlan.projectKey,
        planId: state.currentPlan.planId,
        task: {
          taskId: task.taskId,
          title: task.title,
          summary: task.summary,
          owner: task.owner,
          priority: task.priority,
          sourceBlockId: task.sourceBlockId,
          status: task.status,
        },
        metadataHistory: task.metadataHistory ?? [],
        format,
      });
      const filename = createCustomTaskMetadataHistoryReportFilename({
        projectKey: state.currentPlan.projectKey,
        planId: state.currentPlan.planId,
        taskId: task.taskId,
        format,
      });
      await route.fulfill({
        status: 200,
        contentType: format === 'json' ? 'application/json' : 'text/markdown',
        headers: {
          'content-disposition': `attachment; filename="${filename}"`,
        },
        body,
      });
      return;
    }
    if (requestUrl.pathname.endsWith('/api/ai-agents/custom-task-history/revert-audits')) {
      const taskId = requestUrl.searchParams.get('taskId') || '';
      const filter = requestUrl.searchParams.get('filter') === 'staleConfirmed' ? 'staleConfirmed' : 'all';
      const formatParam = requestUrl.searchParams.get('format');
      const format = formatParam === 'markdown' || formatParam === 'md' ? 'markdown' : formatParam === 'json' ? 'json' : null;
      const exportScope = requestUrl.searchParams.get('exportScope') === 'all' ? 'all' : 'page';
      const limit = Math.min(Number.parseInt(requestUrl.searchParams.get('limit') || '50', 10), 250);
      const offset = Number.parseInt(requestUrl.searchParams.get('offset') || '0', 10);
      const matchingTask = taskId
        ? state.currentPlan?.customTasks?.find((entry: any) => entry.taskId === taskId)
        : null;
      if (taskId && !matchingTask) {
        await fulfillJson(route, { success: false, error: 'task not found' }, 404);
        return;
      }
      const selectedTasks = matchingTask ? [matchingTask] : state.currentPlan?.customTasks ?? [];
      const counts = sumCustomTaskMetadataHistoryCounts(
        selectedTasks.map((task: any) => countCustomTaskMetadataHistory(task.metadataHistory ?? []))
      );
      const toReportTask = (task: any) => ({
        taskId: task.taskId,
        title: task.title,
        summary: task.summary,
        owner: task.owner,
        priority: task.priority,
        sourceBlockId: task.sourceBlockId,
        status: task.status,
      });
      const reportTask = matchingTask ? toReportTask(matchingTask) : null;
      const audits = filterCustomTaskMetadataRevertAudits(
        selectedTasks.flatMap((task: any) =>
          (task.metadataHistory ?? []).map((entry: any) => ({
            ...entry,
            task: toReportTask(task),
          }))
        ),
        filter
      );
      const pagination = {
        limit,
        offset,
        total: audits.length,
        hasMore: offset + limit < audits.length,
        nextOffset: offset + limit < audits.length ? offset + limit : null,
      };
      const paginatedAudits = audits.slice(offset, offset + limit);
      const reportAudits = exportScope === 'all' ? audits : paginatedAudits;
      if (!format) {
        await fulfillJson(route, {
          success: true,
          projectKey: state.currentPlan.projectKey,
          planId: state.currentPlan.planId,
          scope: matchingTask ? 'task' : 'planner',
          task: reportTask,
          taskCount: selectedTasks.length,
          counts,
          filter,
          auditCount: paginatedAudits.length,
          totalAuditCount: audits.length,
          pagination,
          audits: paginatedAudits,
        });
        return;
      }
      const body = createCustomTaskMetadataRevertAuditReport({
        projectKey: state.currentPlan.projectKey,
        planId: state.currentPlan.planId,
        scope: matchingTask ? 'task' : 'planner',
        task: reportTask,
        taskCount: selectedTasks.length,
        counts,
        audits: reportAudits,
        totalAuditCount: audits.length,
        pagination:
          exportScope === 'all'
            ? {
                limit: audits.length,
                offset: 0,
                total: audits.length,
                hasMore: false,
                nextOffset: null,
              }
            : pagination,
        exportScope,
        filter,
        format,
      });
      const filename = createCustomTaskMetadataRevertAuditReportFilename({
        projectKey: state.currentPlan.projectKey,
        planId: state.currentPlan.planId,
        taskId: matchingTask?.taskId,
        format,
      });
      await route.fulfill({
        status: 200,
        contentType: format === 'json' ? 'application/json' : 'text/markdown',
        headers: {
          'content-disposition': `attachment; filename="${filename}"`,
        },
        body,
      });
      return;
    }
    if (requestUrl.pathname.endsWith('/api/ai-agents/custom-task-history')) {
      const taskId = requestUrl.searchParams.get('taskId');
      const task = state.currentPlan?.customTasks?.find((entry: any) => entry.taskId === taskId);
      if (!task) {
        await fulfillJson(route, { success: false, error: 'task not found' }, 404);
        return;
      }
      await fulfillJson(route, {
        success: true,
        projectKey: state.currentPlan.projectKey,
        planId: state.currentPlan.planId,
        task: {
          taskId: task.taskId,
          stageId: task.stageId,
          title: task.title,
          summary: task.summary,
          owner: task.owner,
          priority: task.priority,
          sourceBlockId: task.sourceBlockId,
          status: task.status,
          updatedAt: task.updatedAt,
        },
        historyCount: task.metadataHistory?.length ?? 0,
        metadataHistory: task.metadataHistory ?? [],
      });
      return;
    }

    if (route.request().method() === 'GET') {
      await fulfillJson(route, {
        levels: [],
        workflowStages: [],
        activePlan: state.currentPlan,
        activeExecution: state.currentPlan?.execution ?? null,
        activeJob: state.currentPlan?.jobs?.at(-1) ?? null,
        activeReceipt: state.currentPlan?.receipts?.at(-1) ?? null,
      });
      return;
    }

    const payload = JSON.parse(route.request().postData() || '{}');
    if (route.request().method() === 'POST') {
      state.currentPlan = createPlannerFromPayload(payload);
      await fulfillJson(route, {
        success: true,
        plan: state.currentPlan,
        execution: state.currentPlan.execution,
        job: state.currentPlan.jobs.at(-1),
        receipt: state.currentPlan.receipts.at(-1),
      });
      return;
    }

    if (route.request().method() === 'PATCH') {
      if (payload.action === 'custom_task_metadata_revert') {
        const blocker = findStaleMetadataRevertBlocker(state.currentPlan, payload);
        if (blocker && payload.confirmStaleRevert !== true) {
          await fulfillJson(
            route,
            {
              success: false,
              code: blocker.code,
              error: blocker.message,
              blocker,
            },
            409
          );
          return;
        }
        const reason = String(payload.staleRevertReason || '').trim();
        if (blocker && payload.confirmStaleRevert === true && reason.length < 8) {
          await fulfillJson(
            route,
            {
              success: false,
              code: 'STALE_METADATA_REVERT_REASON_REQUIRED',
              error: 'Un revert obsoleto confirmado requiere un motivo de auditoría de al menos 8 caracteres.',
              blocker,
            },
            400
          );
          return;
        }
        const staleRevertConfirmation =
          blocker && payload.confirmStaleRevert === true
            ? {
                confirmedByUserId: 'editor-1',
                confirmedByEmail: 'editor@example.com',
                reason,
                blocker,
                policySnapshot: {
                  policyId: 'stale_metadata_revert_confirmation_roles',
                  source: 'env',
                  envVarName: 'REY30_STALE_METADATA_REVERT_CONFIRM_ROLES',
                  defaultRoles: ['OWNER'],
                  configuredRoles: [],
                  ignoredValues: [],
                  allowedRoles: ['OWNER'],
                  evaluatedRole: 'OWNER',
                  allowed: true,
                  capturedAt: new Date().toISOString(),
                },
              }
            : undefined;
        if (staleRevertConfirmation) {
          state.staleRevertConfirmations.push({
            taskId: payload.taskId,
            historyEntryId: payload.historyEntryId,
            reason,
            confirmedByEmail: staleRevertConfirmation.confirmedByEmail,
          });
        }
        state.currentPlan = revertCustomTaskMetadata(state.currentPlan, {
          ...payload,
          staleRevertConfirmation,
        });
        await fulfillJson(route, {
          success: true,
          plan: state.currentPlan,
          execution: state.currentPlan.execution,
          job: state.currentPlan.jobs.at(-1),
          receipt: state.currentPlan.receipts.at(-1),
        });
        return;
      }

      if (payload.action === 'custom_task_metadata') {
        state.metadataSources.push(payload.sourceBlockId);
        state.currentPlan = updateCustomTaskMetadata(state.currentPlan, payload);
        await fulfillJson(route, {
          success: true,
          plan: state.currentPlan,
          execution: state.currentPlan.execution,
          job: state.currentPlan.jobs.at(-1),
          receipt: state.currentPlan.receipts.at(-1),
        });
        return;
      }

      expect(payload.action).toBe('custom_task_status');
      state.patchStatuses.push(payload.status);
      state.currentPlan = updateCustomTask(
        state.currentPlan,
        payload.taskId,
        payload.status,
        payload.resultSummary
      );
      await fulfillJson(route, {
        success: true,
        plan: state.currentPlan,
        execution: state.currentPlan.execution,
        job: state.currentPlan.jobs.at(-1),
        receipt: state.currentPlan.receipts.at(-1),
      });
      return;
    }

    await fulfillJson(route, { error: 'unsupported method' }, 405);
  });

  return state;
}

export async function openAgentPlannerPanel(page: Page, baseUrl: string): Promise<Locator> {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'AI Chat', exact: true }).click({ timeout: 120_000 });
  return page
    .locator('[data-testid="agent-planner-custom-form-toggle"]')
    .first()
    .locator('xpath=ancestor::div[contains(@class, "mx-3")][1]');
}

export async function createManualCustomPlanner(plannerPanel: Locator) {
  await plannerPanel.locator('[data-testid="agent-planner-custom-form-toggle"]').click();
  await plannerPanel
    .locator('[data-testid="agent-planner-custom-prompt"]')
    .fill('Planner custom UI E2E');
  await plannerPanel
    .locator('[data-testid="agent-planner-custom-source-block"]')
    .fill('source_ui_e2e');
  await plannerPanel.locator('[data-testid="agent-planner-custom-priority"]').selectOption('high');
  await plannerPanel.locator('[data-testid="agent-planner-custom-owner"]').fill('technical_lead');
  await plannerPanel.locator('[data-testid="agent-planner-custom-tasks-input"]').fill(
    [
      'Completar desde UI :: Validar cierre de custom task',
      'Fallar desde UI :: Validar fallo de custom task',
    ].join('\n')
  );
  await plannerPanel.locator('[data-testid="agent-planner-custom-create"]').click();
}

export async function openAgentPlannerPolicyPanel(page: Page, baseUrl: string) {
  const routeState = await installAgentPlannerCustomUiRoutes(page);
  const plannerPanel = await openAgentPlannerPanel(page, baseUrl);

  await createManualCustomPlanner(plannerPanel);

  const policyPanel = plannerPanel.locator('[data-testid="agent-planner-stale-revert-policy-panel"]');
  await expect
    .poll(() => policyPanel.textContent(), { timeout: 5_000 })
    .toContain('source env');
  await policyPanel.locator('[data-testid="agent-planner-stale-revert-policy-refresh"]').click();
  await expect
    .poll(() => policyPanel.textContent(), { timeout: 5_000 })
    .toContain('source env');

  return {
    routeState,
    plannerPanel,
    policyPanel,
  };
}

export function seedFourStaleRevertPolicyAllowlistChanges(state: AgentPlannerCustomUiRouteState) {
  const baseTimes = [
    '2026-04-18T00:00:01.000Z',
    '2026-04-18T00:00:02.000Z',
    '2026-04-18T00:00:03.000Z',
    '2026-04-18T00:00:04.000Z',
  ];
  const events: StaleMetadataRevertPolicyAuditEvent[] = [
    {
      id: 'policy-seed-editor-added',
      eventType: 'stale_metadata_revert_allowlist_changed',
      at: baseTimes[0],
      actorUserId: 'editor-1',
      actorEmail: 'editor@example.com',
      beforeRoles: ['OWNER'],
      afterRoles: ['OWNER', 'EDITOR'],
      reason: 'Permitir EDITOR para prueba de paginacion.',
    },
    {
      id: 'policy-seed-viewer-added',
      eventType: 'stale_metadata_revert_allowlist_changed',
      at: baseTimes[1],
      actorUserId: 'editor-1',
      actorEmail: 'editor@example.com',
      beforeRoles: ['OWNER', 'EDITOR'],
      afterRoles: ['OWNER', 'EDITOR', 'VIEWER'],
      reason: 'Permitir VIEWER para prueba de paginacion.',
    },
    {
      id: 'policy-seed-viewer-removed',
      eventType: 'stale_metadata_revert_allowlist_changed',
      at: baseTimes[2],
      actorUserId: 'editor-1',
      actorEmail: 'editor@example.com',
      beforeRoles: ['OWNER', 'EDITOR', 'VIEWER'],
      afterRoles: ['OWNER', 'EDITOR'],
      reason: 'Retirar VIEWER antes de exportar pagina.',
    },
    {
      id: 'policy-seed-editor-removed',
      eventType: 'stale_metadata_revert_allowlist_changed',
      at: baseTimes[3],
      actorUserId: 'editor-1',
      actorEmail: 'editor@example.com',
      beforeRoles: ['OWNER', 'EDITOR'],
      afterRoles: ['OWNER'],
      reason: 'Retirar EDITOR para probar export paginado.',
    },
  ];
  state.staleRevertPolicyAuditTrail = events;
  state.staleRevertPolicyConfig = {
    policyId: 'stale_metadata_revert_confirmation_roles',
    version: 4,
    allowedRoles: ['OWNER'],
    updatedAt: baseTimes[3],
    updatedByUserId: 'editor-1',
    updatedByEmail: 'editor@example.com',
    auditTrail: events,
  };
}
