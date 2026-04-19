import { NextRequest, NextResponse } from 'next/server';
import {
  DEFAULT_EDITOR_PROJECT_SAVE_SLOT,
  createEditorProjectSaveData,
  createLoadedEditorProjectPatch,
  restoreEditorProjectSaveData,
} from '@/engine/serialization';
import { createLocalAgenticOrchestrator } from '@/engine/agentic/execution/createLocalAgenticOrchestrator';
import type { PipelineExecutionState } from '@/engine/agentic/schemas';
import { normalizeProjectKey } from '@/lib/project-key';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import {
  buildEditorProjectRecord,
  readEditorProjectRecord,
  withEditorProjectWriteLock,
  writeEditorProjectRecord,
} from '@/lib/server/editor-project-storage';
import {
  appendAgenticExecutionHistoryRecord,
  buildAgenticExecutionSnapshotDiff,
  createAgenticRecommendationMutationIndexStatus,
  findAgenticExecutionHistoryRecord,
  listAgenticExecutionHistoryRecords,
  listAgenticExecutionHistoryPage,
  readAgenticRecommendationMutationIndex,
  readAgenticExecutionSnapshot,
  writeAgenticExecutionSnapshot,
  type AgenticExecutionHistoryFilter,
} from '@/lib/server/agentic-execution-history';
import { createIsolatedEngineStore } from '@/store/editorStore';
import type { AgenticPipelineMessageMetadata } from '@/types/engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AgenticRunBody = {
  prompt?: unknown;
  command?: unknown;
  projectKey?: unknown;
  slot?: unknown;
  maxIterations?: unknown;
  persist?: unknown;
  requireRecommendationApproval?: unknown;
  recommendationApprovals?: unknown;
};

type AgenticMutationBody = AgenticRunBody & {
  action?: unknown;
  executionId?: unknown;
};

function readProjectKey(request: NextRequest, fallback?: unknown) {
  const fromHeader = request.headers.get('x-rey30-project');
  const fromQuery = request.nextUrl.searchParams.get('projectKey');
  const fromBody = typeof fallback === 'string' ? fallback : null;
  return normalizeProjectKey(fromHeader || fromQuery || fromBody);
}

function readSlot(request: NextRequest, fallback?: unknown) {
  const fromQuery = request.nextUrl.searchParams.get('slot')?.trim();
  const fromBody = typeof fallback === 'string' ? fallback.trim() : '';
  return fromQuery || fromBody || DEFAULT_EDITOR_PROJECT_SAVE_SLOT;
}

function readPrompt(body: AgenticRunBody) {
  const value = typeof body.prompt === 'string' ? body.prompt : body.command;
  return typeof value === 'string' ? value.trim() : '';
}

function readExecutionId(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function readAction(value: unknown) {
  return value === 'rollback' || value === 'replay' ? value : '';
}

function readMaxIterations(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 3;
  }
  return Math.min(5, Math.max(1, Math.floor(value)));
}

function readRequireRecommendationApproval(value: unknown) {
  return value === true;
}

function readRecommendationApprovals(value: unknown): Record<string, 'approved' | 'rejected'> {
  if (!isRecord(value)) {
    return {};
  }
  return Object.entries(value).reduce<Record<string, 'approved' | 'rejected'>>((approvals, [key, status]) => {
    if ((status === 'approved' || status === 'rejected') && key.trim()) {
      approvals[key.trim()] = status;
    }
    return approvals;
  }, {});
}

function readLimit(request: NextRequest) {
  const value = Number(request.nextUrl.searchParams.get('limit') || 20);
  return Number.isFinite(value) ? Math.max(1, Math.min(100, Math.floor(value))) : 20;
}

function readOffset(request: NextRequest) {
  const value = Number(request.nextUrl.searchParams.get('offset') || 0);
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function readSearch(request: NextRequest) {
  return (request.nextUrl.searchParams.get('search') || '').trim().slice(0, 160);
}

function readTraceFilter(request: NextRequest, key: 'traceEvent' | 'traceActor' | 'traceSeverity') {
  return (request.nextUrl.searchParams.get(key) || '').trim().slice(0, 120);
}

function readHistoryFilter(request: NextRequest): AgenticExecutionHistoryFilter {
  const value = (request.nextUrl.searchParams.get('historyFilter') || '').trim().toLowerCase();
  if (
    value === 'approved' ||
    value === 'rejected' ||
    value === 'replay' ||
    value === 'rollbackable' ||
    value === 'pending_index'
  ) {
    return value;
  }
  return 'all';
}

function readToolFilter(request: NextRequest) {
  return (request.nextUrl.searchParams.get('toolFilter') || '').trim().slice(0, 120);
}

function readAgentFilter(request: NextRequest) {
  return (request.nextUrl.searchParams.get('agentFilter') || '').trim().slice(0, 120);
}

function isAuthError(error: unknown): boolean {
  const value = String(error || '');
  return value.includes('UNAUTHORIZED') || value.includes('FORBIDDEN');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function extractRuntimeScaffold(state: PipelineExecutionState) {
  const exportResult = state.toolResults.find(
    (toolResult) =>
      toolResult.toolName === 'build.export' &&
      isRecord(toolResult.output?.runtimeScaffold)
  );
  const scaffold = exportResult?.output?.runtimeScaffold;
  if (!isRecord(scaffold)) {
    return null;
  }

  return {
    createdCamera: scaffold.createdCamera === true,
    createdPlayer: scaffold.createdPlayer === true,
    entityIds: stringArray(scaffold.entityIds),
    summaries: stringArray(scaffold.summaries),
    sourceTool: exportResult?.toolName ?? 'build.export',
  };
}

function serializeAgenticTraces(state: PipelineExecutionState): AgenticPipelineMessageMetadata['traces'] {
  return state.traces.map((trace) => ({
    eventType: trace.eventType,
    severity: trace.severity,
    actor: trace.actor,
    message: trace.message,
    stepId: trace.stepId,
    toolCallId: trace.toolCallId,
    data: trace.data,
    timestamp: trace.timestamp,
  }));
}

function serializeAgenticToolCalls(state: PipelineExecutionState) {
  const callsById = new Map(
    state.stepResults.flatMap((step) => step.toolCalls.map((call) => [call.id, call] as const))
  );
  const stepByCallId = new Map(
    state.stepResults.flatMap((step) =>
      step.toolCalls.map((call) => [call.id, step] as const)
    )
  );

  return state.toolResults.map((toolResult) => {
    const call = callsById.get(toolResult.callId);
    const step = stepByCallId.get(toolResult.callId);
    return {
      callId: toolResult.callId,
      toolName: toolResult.toolName,
      agentRole: call?.agentRole ?? step?.agentRole ?? '',
      stepId: call?.stepId ?? step?.stepId ?? '',
      success: toolResult.success,
      message: toolResult.message,
      startedAt: toolResult.startedAt,
      completedAt: toolResult.completedAt,
      input: call?.input ?? null,
      output: toolResult.output ?? null,
      error: toolResult.error ?? null,
      mutatesWorld: typeof toolResult.mutatesWorld === 'boolean' ? toolResult.mutatesWorld : null,
      evidenceContract: toolResult.evidenceContract ?? null,
      evidence: toolResult.evidence.map((evidence) => ({
        id: evidence.id,
        type: evidence.type,
        targetId: evidence.targetId,
        summary: evidence.summary,
        before: evidence.before,
        after: evidence.after,
        timestamp: evidence.timestamp,
      })),
    };
  });
}

function serializeAgenticSharedMemory(state: PipelineExecutionState) {
  return {
    analyses: state.sharedMemory.analyses.map((analysis) => ({
      id: analysis.id,
      toolName: analysis.toolName,
      callId: analysis.callId,
      stepId: analysis.stepId,
      agentRole: analysis.agentRole,
      scope: analysis.scope,
      summary: analysis.summary,
      output: analysis.output,
      actionableRecommendations: analysis.actionableRecommendations.map((recommendation) => ({
        id: recommendation.id,
        approvalKey: recommendation.approvalKey,
        sourceToolName: recommendation.sourceToolName,
        sourceCallId: recommendation.sourceCallId,
        summary: recommendation.summary,
        rationale: recommendation.rationale,
        priority: recommendation.priority,
        suggestedDomain: recommendation.suggestedDomain,
        suggestedCapabilities: recommendation.suggestedCapabilities,
        suggestedToolNames: recommendation.suggestedToolNames,
        input: recommendation.input,
        confidence: recommendation.confidence,
        approvalStatus: recommendation.approvalStatus,
      })),
      createdAt: analysis.createdAt,
    })),
    actionableRecommendations: state.sharedMemory.actionableRecommendations.map((recommendation) => ({
      id: recommendation.id,
      approvalKey: recommendation.approvalKey,
      sourceToolName: recommendation.sourceToolName,
      sourceCallId: recommendation.sourceCallId,
      summary: recommendation.summary,
      rationale: recommendation.rationale,
      priority: recommendation.priority,
      suggestedDomain: recommendation.suggestedDomain,
      suggestedCapabilities: recommendation.suggestedCapabilities,
      suggestedToolNames: recommendation.suggestedToolNames,
      input: recommendation.input,
      confidence: recommendation.confidence,
      approvalStatus: recommendation.approvalStatus,
    })),
  };
}

function buildAgenticPipelineMetadata(
  state: PipelineExecutionState
): AgenticPipelineMessageMetadata {
  const finalReport = state.validationReports.at(-1) ?? null;
  const stepTitles = new Map(state.plan?.steps.map((step) => [step.id, step.title]) ?? []);
  const toolStats = new Map<string, { name: string; successCount: number; failureCount: number }>();

  for (const toolResult of state.toolResults) {
    const current = toolStats.get(toolResult.toolName) ?? {
      name: toolResult.toolName,
      successCount: 0,
      failureCount: 0,
    };
    if (toolResult.success) {
      current.successCount += 1;
    } else {
      current.failureCount += 1;
    }
    toolStats.set(toolResult.toolName, current);
  }

  return {
    pipelineId: state.pipelineId,
    approved: state.finalDecision?.approved === true,
    iteration: state.iteration,
    status: state.status,
    steps: state.stepResults.map((step) => ({
      id: step.stepId,
      title: stepTitles.get(step.stepId) ?? step.stepId,
      agentRole: step.agentRole,
      status: step.status,
      evidenceCount: step.evidenceIds.length,
      errorCount: step.errors.length,
    })),
    tools: [...toolStats.values()],
    validation: finalReport
      ? {
          approved: finalReport.approved,
          confidence: finalReport.confidence,
          matchedRequirements: finalReport.matchedRequirements,
          missingRequirements: finalReport.missingRequirements,
          incorrectOutputs: finalReport.incorrectOutputs,
          retryInstructions: finalReport.retryInstructions,
        }
      : null,
    runtimeScaffold: extractRuntimeScaffold(state),
    sharedMemory: serializeAgenticSharedMemory(state),
    traces: serializeAgenticTraces(state).slice(-12),
  };
}

function buildResponsePayload(params: {
  projectKey: string;
  slot: string;
  persisted: boolean;
  result: Awaited<ReturnType<ReturnType<typeof createLocalAgenticOrchestrator>['run']>>;
}) {
  const { state, worldState } = params.result;
  const validation = state.validationReports.at(-1) ?? null;
  const exportResult = state.toolResults.find((toolResult) => toolResult.toolName === 'build.export');

  return {
    success: state.finalDecision?.approved === true,
    approved: state.finalDecision?.approved === true,
    projectKey: params.projectKey,
    slot: params.slot,
    persisted: params.persisted,
    pipeline: {
      id: state.pipelineId,
      status: state.status,
      iteration: state.iteration,
      decision: state.finalDecision ?? null,
      plan: state.plan
        ? {
            id: state.plan.id,
            stepCount: state.plan.steps.length,
            steps: state.plan.steps.map((step) => ({
              id: step.id,
              title: step.title,
              agentRole: step.agentRole,
              allowedToolNames: step.allowedToolNames,
            })),
          }
        : null,
      validation,
      tools: state.toolResults.map((toolResult) => ({
        callId: toolResult.callId,
        toolName: toolResult.toolName,
        success: toolResult.success,
        message: toolResult.message,
      })),
      sharedMemory: serializeAgenticSharedMemory(state),
      runtimeScaffold: extractRuntimeScaffold(state),
      messageMetadata: buildAgenticPipelineMetadata(state),
      artifactPath:
        typeof exportResult?.output?.artifactPath === 'string'
          ? exportResult.output.artifactPath
          : null,
    },
    world: {
      activeSceneId: worldState.activeSceneId,
      sceneCount: Object.keys(worldState.scenes).length,
      entityCount: Object.keys(worldState.entities).length,
      assetCount: Object.keys(worldState.assets).length,
      buildReportCount: Object.keys(worldState.buildReports).length,
    },
  };
}

async function runAgenticPipelineFromRemoteSave(params: {
  userId: string;
  projectKey: string;
  slot: string;
  prompt: string;
  persist: boolean;
  maxIterations: number;
  sourceExecutionId?: string | null;
  requireRecommendationApproval?: boolean;
  recommendationApprovals?: Record<string, 'approved' | 'rejected'>;
}) {
  const record = readEditorProjectRecord({
    userId: params.userId,
    projectKey: params.projectKey,
    slot: params.slot,
  });

  if (!record) {
    return NextResponse.json(
      {
        success: false,
        error: 'No existe un save remoto del proyecto para ejecutar el pipeline agentic.',
        projectKey: params.projectKey,
        slot: params.slot,
      },
      { status: 409 }
    );
  }

  const restored = restoreEditorProjectSaveData(record.saveData);
  if (!restored) {
    return NextResponse.json(
      {
        success: false,
        error: 'El save remoto del proyecto es inválido.',
        projectKey: params.projectKey,
        slot: params.slot,
      },
      { status: 422 }
    );
  }

  const executionStore = createIsolatedEngineStore(
    createLoadedEditorProjectPatch(restored)
  );
  const orchestrator = createLocalAgenticOrchestrator({
    artifactRootDir: process.cwd(),
    maxIterations: params.maxIterations,
    requireRecommendationApproval: params.requireRecommendationApproval === true,
    recommendationApprovals: params.recommendationApprovals ?? {},
    store: executionStore,
  });
  const result = await orchestrator.run(params.prompt);
  const nextSaveData = createEditorProjectSaveData(executionStore.getState(), {
    markClean: false,
  });

  if (params.persist) {
    const nextRecord = buildEditorProjectRecord({
      userId: params.userId,
      projectKey: params.projectKey,
      slot: params.slot,
      saveData: nextSaveData,
    });
    writeEditorProjectRecord(nextRecord);
  }

  const payload = buildResponsePayload({
    projectKey: params.projectKey,
    slot: params.slot,
    persisted: params.persist,
    result,
  });
  const beforeSnapshot = writeAgenticExecutionSnapshot({
    userId: params.userId,
    projectKey: params.projectKey,
    slot: params.slot,
    executionId: payload.pipeline.id,
    kind: 'before',
    saveData: record.saveData,
  });
  const afterSnapshot = writeAgenticExecutionSnapshot({
    userId: params.userId,
    projectKey: params.projectKey,
    slot: params.slot,
    executionId: payload.pipeline.id,
    kind: 'after',
    saveData: nextSaveData,
  });

  appendAgenticExecutionHistoryRecord({
    id: payload.pipeline.id,
    userId: params.userId,
    projectKey: params.projectKey,
    slot: params.slot,
    prompt: params.prompt,
    approved: payload.approved,
    status: payload.pipeline.status,
    iteration: payload.pipeline.iteration,
    createdAt: result.state.createdAt,
    completedAt: result.state.updatedAt,
    artifactPath: payload.pipeline.artifactPath,
    runtimeScaffold: payload.pipeline.messageMetadata.runtimeScaffold ?? null,
    validation: payload.pipeline.messageMetadata.validation,
    toolNames: payload.pipeline.messageMetadata.tools.map((tool) => tool.name),
    agentRoles: payload.pipeline.messageMetadata.steps.map((step) => step.agentRole),
    steps: payload.pipeline.messageMetadata.steps,
    toolStats: payload.pipeline.messageMetadata.tools,
    traces: serializeAgenticTraces(result.state),
    sharedMemory: serializeAgenticSharedMemory(result.state),
    toolCalls: serializeAgenticToolCalls(result.state),
    stepCount: payload.pipeline.messageMetadata.steps.length,
    action: params.sourceExecutionId ? 'replay' : 'run',
    sourceExecutionId: params.sourceExecutionId ?? null,
    snapshots: {
      before: beforeSnapshot,
      after: afterSnapshot,
    },
    diff: buildAgenticExecutionSnapshotDiff(record.saveData, nextSaveData),
  });

  return NextResponse.json(
    params.sourceExecutionId
      ? {
          ...payload,
          replayedFrom: params.sourceExecutionId,
        }
      : payload,
    { status: result.state.finalDecision?.approved ? 200 : 422 }
  );
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession(request, 'EDITOR');
    const projectKey = readProjectKey(request);
    const slot = readSlot(request);
    const historyFilter = readHistoryFilter(request);
    const mutationIndex = readAgenticRecommendationMutationIndex({
      userId: user.id,
      projectKey,
      slot,
    });
    const mutationIndexRecords = listAgenticExecutionHistoryRecords({
      userId: user.id,
      projectKey,
      slot,
      limit: 200,
    });
    const mutationIndexStatus = createAgenticRecommendationMutationIndexStatus({
      index: mutationIndex,
      records: mutationIndexRecords,
      requireStoredChecksum: true,
    });
    const page = listAgenticExecutionHistoryPage({
      userId: user.id,
      projectKey,
      slot,
      limit: readLimit(request),
      offset: readOffset(request),
      search: readSearch(request),
      historyFilter,
      toolFilter: readToolFilter(request),
      agentFilter: readAgentFilter(request),
      pendingIndexableExecutionIds: mutationIndexStatus.pendingIndexableExecutionIds,
      traceEvent: readTraceFilter(request, 'traceEvent'),
      traceActor: readTraceFilter(request, 'traceActor'),
      traceSeverity: readTraceFilter(request, 'traceSeverity'),
    });

    return NextResponse.json({
      success: true,
      projectKey,
      slot,
      history: page.records,
      mutationIndexAudit: mutationIndexStatus.mutationIndexAudit,
      filterOptions: page.filterOptions,
      filterCounts: page.filterCounts,
      pagination: {
        limit: page.limit,
        offset: page.offset,
        totalRecords: page.totalRecords,
        filteredRecords: page.filteredRecords,
        hasPrevious: page.offset > 0,
        hasNext: page.offset + page.limit < page.filteredRecords,
        search: page.search,
        historyFilter: page.historyFilter,
        toolFilter: page.toolFilter,
        agentFilter: page.agentFilter,
        traceEvent: page.traceEvent,
        traceActor: page.traceActor,
        traceSeverity: page.traceSeverity,
      },
    });
  } catch (error) {
    if (isAuthError(error)) {
      return authErrorToResponse(error);
    }
    console.error('[agentic] history read failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'No se pudo leer el historial agentic.',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSession(request, 'EDITOR');
    const body = (await request.json().catch(() => ({}))) as AgenticRunBody;
    const prompt = readPrompt(body);

    if (!prompt) {
      return NextResponse.json(
        {
          success: false,
          error: 'El prompt agentic es obligatorio.',
        },
        { status: 400 }
      );
    }

    const projectKey = readProjectKey(request, body.projectKey);
    const slot = readSlot(request, body.slot);
    const persist = body.persist !== false;
    const maxIterations = readMaxIterations(body.maxIterations);
    const requireRecommendationApproval = readRequireRecommendationApproval(body.requireRecommendationApproval);
    const recommendationApprovals = readRecommendationApprovals(body.recommendationApprovals);

    return await withEditorProjectWriteLock({
      userId: user.id,
      projectKey,
      slot,
      timeoutMs: 30_000,
      staleLockMs: 120_000,
      work: async () => {
        return runAgenticPipelineFromRemoteSave({
          userId: user.id,
          projectKey,
          slot,
          prompt,
          persist,
          maxIterations,
          requireRecommendationApproval,
          recommendationApprovals,
        });
      },
    });
  } catch (error) {
    if (isAuthError(error)) {
      return authErrorToResponse(error);
    }
    console.error('[agentic] pipeline failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'No se pudo ejecutar el pipeline agentic.',
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireSession(request, 'EDITOR');
    const body = (await request.json().catch(() => ({}))) as AgenticMutationBody;
    const action = readAction(body.action);
    const executionId = readExecutionId(body.executionId);

    if (!action) {
      return NextResponse.json(
        {
          success: false,
          error: 'La acción agentic debe ser rollback o replay.',
        },
        { status: 400 }
      );
    }

    if (!executionId) {
      return NextResponse.json(
        {
          success: false,
          error: 'El executionId es obligatorio.',
        },
        { status: 400 }
      );
    }

    const projectKey = readProjectKey(request, body.projectKey);
    const slot = readSlot(request, body.slot);
    const maxIterations = readMaxIterations(body.maxIterations);
    const requireRecommendationApproval = readRequireRecommendationApproval(body.requireRecommendationApproval);
    const recommendationApprovals = readRecommendationApprovals(body.recommendationApprovals);

    return await withEditorProjectWriteLock({
      userId: user.id,
      projectKey,
      slot,
      timeoutMs: 30_000,
      staleLockMs: 120_000,
      work: async () => {
        const historyRecord = findAgenticExecutionHistoryRecord({
          userId: user.id,
          projectKey,
          slot,
          executionId,
        });

        if (!historyRecord) {
          return NextResponse.json(
            {
              success: false,
              error: 'No existe esa ejecución agentic en el historial.',
              projectKey,
              slot,
              executionId,
            },
            { status: 404 }
          );
        }

        if (action === 'rollback') {
          const saveData = readAgenticExecutionSnapshot({
            userId: user.id,
            projectKey,
            slot,
            executionId,
            kind: 'before',
          });

          if (!saveData) {
            return NextResponse.json(
              {
                success: false,
                error: 'La ejecución no tiene snapshot before restaurable.',
                projectKey,
                slot,
                executionId,
              },
              { status: 409 }
            );
          }

          const nextRecord = buildEditorProjectRecord({
            userId: user.id,
            projectKey,
            slot,
            saveData,
          });
          writeEditorProjectRecord(nextRecord);

          return NextResponse.json({
            success: true,
            action: 'rollback',
            projectKey,
            slot,
            executionId,
            restoredFrom: executionId,
            summary: nextRecord.summary,
          });
        }

        const mutationIndex = readAgenticRecommendationMutationIndex({
          userId: user.id,
          projectKey,
          slot,
        });
        const mutationIndexRecords = listAgenticExecutionHistoryRecords({
          userId: user.id,
          projectKey,
          slot,
          limit: 200,
        });
        const mutationIndexStatus = createAgenticRecommendationMutationIndexStatus({
          index: mutationIndex,
          records: mutationIndexRecords,
          requireStoredChecksum: true,
        });
        if (mutationIndexStatus.indexBehind) {
          return NextResponse.json(
            {
              success: false,
              code: 'AGENTIC_RECOMMENDATION_MUTATION_INDEX_BEHIND',
              error: 'Replay bloqueado: el índice de recomendaciones está atrasado. Reindexa desde historial antes de reejecutar.',
              projectKey,
              slot,
              executionId,
              mutationIndexAudit: mutationIndexStatus.mutationIndexAudit,
            },
            { status: 409 }
          );
        }

        return runAgenticPipelineFromRemoteSave({
          userId: user.id,
          projectKey,
          slot,
          prompt: historyRecord.prompt,
          persist: true,
          maxIterations,
          requireRecommendationApproval,
          recommendationApprovals,
          sourceExecutionId: executionId,
        });
      },
    });
  } catch (error) {
    if (isAuthError(error)) {
      return authErrorToResponse(error);
    }
    console.error('[agentic] mutation failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'No se pudo aplicar la acción agentic.',
      },
      { status: 500 }
    );
  }
}
