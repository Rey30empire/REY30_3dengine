import { NextResponse } from 'next/server';
import {
  createEditorProjectSaveData,
  createLoadedEditorProjectPatch,
  restoreEditorProjectSaveData,
} from '@/engine/serialization';
import { createLocalAgenticOrchestrator } from '@/engine/agentic/execution/createLocalAgenticOrchestrator';
import type { PipelineExecutionState } from '@/engine/agentic/schemas';
import {
  buildEditorProjectRecord,
  readEditorProjectRecord,
  writeEditorProjectRecord,
} from '@/lib/server/editor-project-storage';
import {
  appendAgenticExecutionHistoryRecord,
  buildAgenticExecutionSnapshotDiff,
  type AgenticExecutionHistoryRecord,
  type AgenticExecutionToolCallRecord,
  type AgenticRecommendationExecutionLink,
  writeAgenticRecommendationMutationIndexEntry,
  writeAgenticExecutionSnapshot,
} from '@/lib/server/agentic-execution-history';
import { createIsolatedEngineStore } from '@/store/editorStore';
import type { AgenticPipelineMessageMetadata } from '@/types/engine';

type ApprovedRecommendation = NonNullable<
  AgenticPipelineMessageMetadata['sharedMemory']
>['actionableRecommendations'][number];

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

function serializeAgenticToolCalls(state: PipelineExecutionState): AgenticExecutionToolCallRecord[] {
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

function buildAgenticPipelineMetadata(state: PipelineExecutionState): AgenticPipelineMessageMetadata {
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

function approvalMapForRecommendations(recommendations: ApprovedRecommendation[]) {
  return recommendations.reduce<Record<string, 'approved'>>((approvals, recommendation) => {
    approvals[recommendation.id] = 'approved';
    approvals[recommendation.approvalKey] = 'approved';
    approvals[recommendation.rationale] = 'approved';
    return approvals;
  }, {});
}

export function approvedRecommendationsForRecord(
  record: AgenticExecutionHistoryRecord,
  recommendationIds?: string[]
) {
  const requested = new Set((recommendationIds ?? []).map((item) => item.trim()).filter(Boolean));
  return (record.sharedMemory?.actionableRecommendations ?? [])
    .filter((recommendation) => recommendation.approvalStatus === 'approved')
    .filter(
      (recommendation) =>
        requested.size === 0 ||
        requested.has(recommendation.id) ||
        requested.has(recommendation.approvalKey)
    );
}

function stringSet(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

const ROLLBACKABLE_EVIDENCE_TARGET_TYPES = new Set([
  'scene',
  'environment',
  'lighting',
  'entity',
  'component',
  'material',
  'physics',
  'animation',
  'script',
  'asset',
]);

function rollbackableTargetsForToolCall(toolCall: AgenticExecutionToolCallRecord) {
  const targets = toolCall.evidence.flatMap((evidence) => {
    if (!evidence.targetId || !ROLLBACKABLE_EVIDENCE_TARGET_TYPES.has(evidence.type)) {
      return [];
    }
    return [{
      id: evidence.targetId,
      type: evidence.type,
      summary: evidence.summary,
    }];
  });

  return Array.from(new Map(targets.map((target) => [`${target.type}:${target.id}`, target])).values());
}

export function findRollbackTargetContractFailures(link: AgenticRecommendationExecutionLink) {
  return link.unlockedMutations
    .filter((mutation) => mutation.targets.length === 0)
    .map((mutation) => ({
      toolCallId: mutation.toolCallId,
      toolName: mutation.toolName,
      stepId: mutation.stepId,
      recommendationIds: mutation.recommendationIds,
      recommendationKeys: mutation.recommendationKeys,
      evidenceIds: mutation.evidenceIds,
      reason: 'Mutating tool evidence did not map to any rollbackable target.',
    }));
}

function buildRecommendationExecutionLink(params: {
  sourceExecutionId: string;
  approvedRecommendations: ApprovedRecommendation[];
  traces: AgenticPipelineMessageMetadata['traces'];
  toolCalls: AgenticExecutionToolCallRecord[];
  diffHasChanges: boolean;
}): AgenticRecommendationExecutionLink {
  const recommendationsByKey = new Map(
    params.approvedRecommendations.flatMap((recommendation) => [
      [recommendation.id, recommendation] as const,
      [recommendation.approvalKey, recommendation] as const,
    ])
  );
  const unlockTraces = params.traces.filter((trace) => trace.eventType === 'recommendation.unlocked_mutation');
  const unlockedMutations = unlockTraces.flatMap((trace) => {
    const keys = stringArray(trace.data?.approvedRecommendationKeys);
    const ids = stringArray(trace.data?.approvedRecommendationIds);
    const matchedRecommendations = stringSet([...keys, ...ids])
      .map((key) => recommendationsByKey.get(key))
      .filter((item): item is ApprovedRecommendation => Boolean(item));
    const callsForStep = params.toolCalls.filter(
      (toolCall) =>
        toolCall.stepId === trace.stepId &&
        toolCall.success &&
        toolCall.mutatesWorld === true
    );

    return callsForStep.map((toolCall) => ({
      toolCallId: toolCall.callId,
      toolName: toolCall.toolName,
      stepId: toolCall.stepId,
      recommendationIds: stringSet(matchedRecommendations.map((recommendation) => recommendation.id)),
      recommendationKeys: stringSet(matchedRecommendations.map((recommendation) => recommendation.approvalKey)),
      evidenceIds: stringSet(toolCall.evidence.map((evidence) => evidence.id)),
      targets: rollbackableTargetsForToolCall(toolCall),
    }));
  });

  const fallbackMutations = unlockedMutations.length
    ? []
    : params.toolCalls
        .filter((toolCall) => toolCall.success && toolCall.mutatesWorld === true)
        .filter((toolCall) =>
          params.approvedRecommendations.some((recommendation) =>
            recommendation.suggestedToolNames.includes(toolCall.toolName)
          )
        )
        .map((toolCall) => {
          const matched = params.approvedRecommendations.filter((recommendation) =>
            recommendation.suggestedToolNames.includes(toolCall.toolName)
          );
          return {
            toolCallId: toolCall.callId,
            toolName: toolCall.toolName,
            stepId: toolCall.stepId,
            recommendationIds: stringSet(matched.map((recommendation) => recommendation.id)),
            recommendationKeys: stringSet(matched.map((recommendation) => recommendation.approvalKey)),
            evidenceIds: stringSet(toolCall.evidence.map((evidence) => evidence.id)),
            targets: rollbackableTargetsForToolCall(toolCall),
          };
        });

  const mutations = unlockedMutations.length ? unlockedMutations : fallbackMutations;

  return {
    sourceExecutionId: params.sourceExecutionId,
    recommendationIds: stringSet(params.approvedRecommendations.map((recommendation) => recommendation.id)),
    recommendationKeys: stringSet(params.approvedRecommendations.map((recommendation) => recommendation.approvalKey)),
    recommendations: params.approvedRecommendations.map((recommendation) => ({
      id: recommendation.id,
      approvalKey: recommendation.approvalKey,
      summary: recommendation.summary,
    })),
    unlockedMutations: mutations,
    partialRollback: {
      available: params.diffHasChanges && mutations.length > 0,
      applied: false,
      appliedAt: null,
      recommendationIds: [],
      recommendationKeys: [],
      toolCallIds: [],
      targetIds: [],
    },
  };
}

export async function runApprovedRecommendationsFromRemoteSave(params: {
  userId: string;
  projectKey: string;
  slot: string;
  sourceRecord: AgenticExecutionHistoryRecord;
  approvedRecommendations: ApprovedRecommendation[];
  maxIterations: number;
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
        error: 'No existe un save remoto del proyecto para ejecutar recomendaciones aprobadas.',
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
    requireRecommendationApproval: true,
    recommendationApprovals: approvalMapForRecommendations(params.approvedRecommendations),
    store: executionStore,
  });
  const result = await orchestrator.run(params.sourceRecord.prompt);
  const nextSaveData = createEditorProjectSaveData(executionStore.getState(), {
    markClean: false,
  });
  const payload = buildResponsePayload({
    projectKey: params.projectKey,
    slot: params.slot,
    persisted: true,
    result,
  });
  const diff = buildAgenticExecutionSnapshotDiff(record.saveData, nextSaveData);
  const traces = serializeAgenticTraces(result.state);
  const toolCalls = serializeAgenticToolCalls(result.state);
  const recommendationExecution = buildRecommendationExecutionLink({
    sourceExecutionId: params.sourceRecord.id,
    approvedRecommendations: params.approvedRecommendations,
    traces,
    toolCalls,
    diffHasChanges: diff.hasChanges,
  });
  const rollbackTargetFailures = findRollbackTargetContractFailures(recommendationExecution);
  if (rollbackTargetFailures.length > 0) {
    return NextResponse.json(
      {
        ...payload,
        success: false,
        approved: false,
        persisted: false,
        code: 'MUTATING_TOOL_ROLLBACK_TARGET_CONTRACT_FAILED',
        error:
          'La ejecución fue bloqueada: una o más tools mutadoras no mapearon su evidencia a targets rollbackables.',
        rollbackTargetFailures,
        sourceExecutionId: params.sourceRecord.id,
        approvedRecommendationIds: recommendationExecution.recommendationIds,
        approvedRecommendationKeys: recommendationExecution.recommendationKeys,
        recommendationExecution,
      },
      { status: 409 }
    );
  }

  const nextRecord = buildEditorProjectRecord({
    userId: params.userId,
    projectKey: params.projectKey,
    slot: params.slot,
    saveData: nextSaveData,
  });
  writeEditorProjectRecord(nextRecord);

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

  const historyRecord = appendAgenticExecutionHistoryRecord({
    id: payload.pipeline.id,
    userId: params.userId,
    projectKey: params.projectKey,
    slot: params.slot,
    prompt: params.sourceRecord.prompt,
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
    traces,
    sharedMemory: serializeAgenticSharedMemory(result.state),
    toolCalls,
    stepCount: payload.pipeline.messageMetadata.steps.length,
    action: 'approved_recommendations',
    sourceExecutionId: params.sourceRecord.id,
    recommendationExecution,
    snapshots: {
      before: beforeSnapshot,
      after: afterSnapshot,
    },
    diff,
  });
  for (const recommendation of recommendationExecution.recommendations) {
    const linkedMutations = recommendationExecution.unlockedMutations.filter(
      (mutation) =>
        mutation.recommendationIds.includes(recommendation.id) ||
        mutation.recommendationKeys.includes(recommendation.approvalKey)
    );
    writeAgenticRecommendationMutationIndexEntry({
      userId: params.userId,
      projectKey: params.projectKey,
      slot: params.slot,
      executionId: payload.pipeline.id,
      sourceExecutionId: params.sourceRecord.id,
      recommendationId: recommendation.id,
      recommendationKey: recommendation.approvalKey,
      summary: recommendation.summary,
      toolCalls: linkedMutations.map((mutation) => ({
        toolCallId: mutation.toolCallId,
        toolName: mutation.toolName,
        evidenceIds: mutation.evidenceIds,
        targetIds: mutation.targets.map((target) => target.id),
      })),
    });
  }

  return NextResponse.json(
    {
      ...payload,
      executedApprovedRecommendations: true,
      sourceExecutionId: params.sourceRecord.id,
      approvedRecommendationIds: recommendationExecution.recommendationIds,
      approvedRecommendationKeys: recommendationExecution.recommendationKeys,
      recommendationExecution,
      historyRecord,
    },
    { status: result.state.finalDecision?.approved ? 200 : 422 }
  );
}
