'use client';

import {
  MasterOrchestrator,
  WorldStateManager,
  createEditorBackedToolRegistry,
  createZustandSceneStoreAdapter,
  type AgenticProgressListener,
  type AgenticPipelineProgressStatus,
  type AgenticPipelineProgressStage,
  type PipelineExecutionState,
  type WorldState,
} from '@/engine/agentic';
import { IntentAnalyzer } from '@/engine/agentic/intent/IntentAnalyzer';
import {
  DEFAULT_EDITOR_PROJECT_SAVE_SLOT,
  createEditorProjectSaveData,
  createLoadedEditorProjectPatch,
  restoreEditorProjectSaveData,
} from '@/engine/serialization';
import { fetchRemoteEditorProjectSave, saveRemoteEditorProject } from '@/engine/editor/editorProjectClient';
import { useEngineStore } from '@/store/editorStore';
import type { AgenticPipelineMessageMetadata } from '@/types/engine';
import { resolveAICommandIntent } from './intentRouter';
import { requestAgenticServerRun, type AgenticServerRunResponse } from './requestClient';

export interface AgenticEditorCommandResult {
  handled: boolean;
  approved: boolean;
  message: string;
  metadata?: AgenticPipelineMessageMetadata;
  state?: PipelineExecutionState;
  worldState?: WorldState;
  error?: string;
}

export interface AgenticEditorCommandOptions {
  onProgress?: AgenticProgressListener;
  projectName?: string;
  slot?: string;
  maxIterations?: number;
  requireRecommendationApproval?: boolean;
  recommendationApprovals?: Record<string, 'approved' | 'rejected'>;
}

const intentAnalyzer = new IntentAnalyzer();

function unique(items: string[]): string[] {
  return [...new Set(items)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function extractRuntimeScaffold(
  state: PipelineExecutionState
): NonNullable<AgenticPipelineMessageMetadata['runtimeScaffold']> | null {
  const exportResult = state.toolResults.find(
    (toolResult) =>
      toolResult.toolName === 'build.export' &&
      isRecord(toolResult.output?.runtimeScaffold)
  );
  const scaffold = exportResult?.output?.runtimeScaffold;
  if (!isRecord(scaffold)) {
    return null;
  }
  const createdCamera = scaffold.createdCamera === true;
  const createdPlayer = scaffold.createdPlayer === true;
  const summaries = stringArray(scaffold.summaries);
  if (!createdCamera && !createdPlayer && summaries.length === 0) {
    return null;
  }

  return {
    createdCamera,
    createdPlayer,
    entityIds: stringArray(scaffold.entityIds),
    summaries,
    sourceTool: exportResult?.toolName ?? 'build.export',
  };
}

function isAssetOnlyRequest(command: string): boolean {
  const intent = resolveAICommandIntent(command);
  const lower = intent.lowerCommand;
  const explicitAssetOnly =
    lower.includes('descarga') ||
    lower.includes('download') ||
    lower.includes('glb') ||
    lower.includes('fbx') ||
    lower.includes('obj') ||
    lower.includes('archivo');

  if (intent.wantsVideo || intent.wantsImage) {
    return true;
  }

  return (intent.wants3D || intent.wantsCharacter) && explicitAssetOnly && !intent.wantsDirectSceneAction;
}

export function canRunAgenticEditorCommand(command: string): boolean {
  if (!command.trim() || isAssetOnlyRequest(command)) {
    return false;
  }

  const parsed = intentAnalyzer.parseUserIntent(command);
  if (parsed.ambiguities.length > 0 || parsed.objectives.length === 0) {
    return false;
  }

  return parsed.domains.some((domain) =>
    [
      'scene',
      'layout',
      'entity',
      'modeling',
      'material',
      'lighting',
      'environment',
      'physics',
      'animation',
      'gameplay',
      'asset',
      'build',
      'maintenance',
    ].includes(domain)
  );
}

export function shouldUseServerAgenticExecution(): boolean {
  if (typeof window !== 'undefined') {
    const preference = window.localStorage.getItem('rey30.agentic.serverExecution');
    if (preference === 'true') return true;
    if (preference === 'false') return false;
  }

  return process.env.NEXT_PUBLIC_REY30_AGENTIC_SERVER_EXECUTION === 'true';
}

function emitServerProgress(params: {
  onProgress?: AgenticProgressListener;
  pipelineId: string;
  status: AgenticPipelineProgressStatus;
  stage: AgenticPipelineProgressStage;
  message: string;
  totalSteps?: number;
  completedSteps?: number;
}) {
  params.onProgress?.({
    pipelineId: params.pipelineId,
    iteration: 1,
    status: params.status,
    stage: params.stage,
    message: params.message,
    totalSteps: params.totalSteps ?? 0,
    completedSteps: params.completedSteps ?? 0,
    timestamp: new Date().toISOString(),
  });
}

export function formatAgenticEditorResult(result: {
  command: string;
  state: PipelineExecutionState;
}): string {
  const finalReport = result.state.validationReports.at(-1);
  const decision = result.state.finalDecision;
  const successfulTools = unique(
    result.state.toolResults
      .filter((toolResult) => toolResult.success)
      .map((toolResult) => toolResult.toolName)
  );
  const failedTools = unique(
    result.state.toolResults
      .filter((toolResult) => !toolResult.success)
      .map((toolResult) => toolResult.toolName)
  );
  const completedSteps = result.state.stepResults.filter((step) => step.status === 'completed').length;
  const failedSteps = result.state.stepResults.filter((step) => step.status === 'failed').length;
  const runtimeScaffold = extractRuntimeScaffold(result.state);

  if (!decision?.approved) {
    return [
      '⚠️ **Entrega agentic rechazada**',
      `Orden: "${result.command}"`,
      '',
      `Pasos completados: ${completedSteps}`,
      failedSteps ? `Pasos fallidos: ${failedSteps}` : null,
      failedTools.length ? `Tools fallidas: ${failedTools.join(', ')}` : null,
      finalReport?.missingRequirements.length
        ? `Faltante: ${finalReport.missingRequirements.join(', ')}`
        : null,
      finalReport?.incorrectOutputs.length
        ? `Incorrecto: ${finalReport.incorrectOutputs.join(', ')}`
        : null,
      finalReport?.retryInstructions.length
        ? `Reintento sugerido: ${finalReport.retryInstructions.join(' | ')}`
        : null,
    ]
      .filter(Boolean)
      .join('\n');
  }

  return [
    '✅ **Pipeline agentic completado y validado**',
    `Orden: "${result.command}"`,
    '',
    `Pasos completados: ${completedSteps}`,
    `Iteraciones: ${result.state.iteration}`,
    successfulTools.length ? `Tools ejecutadas: ${successfulTools.join(', ')}` : null,
    runtimeScaffold
      ? `Runtime export añadido: ${runtimeScaffold.summaries.join(' | ')}`
      : null,
    finalReport ? `Confianza del validador: ${Math.round(finalReport.confidence * 100)}%` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

function formatServerAgenticEditorResult(result: {
  command: string;
  payload: AgenticServerRunResponse;
}): string {
  const metadata = result.payload.pipeline?.messageMetadata;
  const validation = metadata?.validation ?? result.payload.pipeline?.validation ?? null;
  const runtimeScaffold = metadata?.runtimeScaffold ?? result.payload.pipeline?.runtimeScaffold ?? null;
  const successfulTools = metadata?.tools
    .filter((tool) => tool.successCount > 0)
    .map((tool) => tool.name) ?? [];
  const approved = result.payload.approved === true;

  if (!approved) {
    return [
      '⚠️ **Entrega agentic server rechazada**',
      `Orden: "${result.command}"`,
      '',
      result.payload.error ? `Error: ${result.payload.error}` : null,
      validation?.missingRequirements.length
        ? `Faltante: ${validation.missingRequirements.join(', ')}`
        : null,
      validation?.incorrectOutputs.length
        ? `Incorrecto: ${validation.incorrectOutputs.join(', ')}`
        : null,
      validation?.retryInstructions.length
        ? `Reintento sugerido: ${validation.retryInstructions.join(' | ')}`
        : null,
    ]
      .filter(Boolean)
      .join('\n');
  }

  return [
    '✅ **Pipeline agentic server completado y validado**',
    `Orden: "${result.command}"`,
    '',
    metadata ? `Pasos completados: ${metadata.steps.filter((step) => step.status === 'completed').length}` : null,
    metadata ? `Iteraciones: ${metadata.iteration}` : null,
    successfulTools.length ? `Tools ejecutadas: ${successfulTools.join(', ')}` : null,
    runtimeScaffold
      ? `Runtime export añadido: ${runtimeScaffold.summaries.join(' | ')}`
      : null,
    result.payload.pipeline?.artifactPath ? `Artefacto: ${result.payload.pipeline.artifactPath}` : null,
    validation ? `Confianza del validador: ${Math.round(validation.confidence * 100)}%` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildAgenticPipelineMessageMetadata(
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
    sharedMemory: {
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
    },
    traces: state.traces.slice(-12).map((trace) => ({
      eventType: trace.eventType,
      severity: trace.severity,
      actor: trace.actor,
      message: trace.message,
      stepId: trace.stepId,
      toolCallId: trace.toolCallId,
      data: trace.data,
      timestamp: trace.timestamp,
    })),
  };
}

export async function runAgenticEditorCommand(
  command: string,
  options: AgenticEditorCommandOptions = {}
): Promise<AgenticEditorCommandResult> {
  if (!canRunAgenticEditorCommand(command)) {
    return {
      handled: false,
      approved: false,
      message: 'Command is outside the current agentic editor scope.',
    };
  }

  try {
    const adapter = createZustandSceneStoreAdapter();
    const world = new WorldStateManager(adapter.snapshotWorldState());
    const orchestrator = new MasterOrchestrator({
      world,
      tools: createEditorBackedToolRegistry(adapter),
      onProgress: options.onProgress,
      maxIterations: 3,
      requireRecommendationApproval: options.requireRecommendationApproval,
      recommendationApprovals: options.recommendationApprovals,
    });
    const result = await orchestrator.run(command);
    const approved = result.state.finalDecision?.approved === true;

    return {
      handled: true,
      approved,
      state: result.state,
      worldState: result.worldState,
      metadata: buildAgenticPipelineMessageMetadata(result.state),
      message: formatAgenticEditorResult({
        command,
        state: result.state,
      }),
    };
  } catch (error) {
    return {
      handled: true,
      approved: false,
      error: String(error),
      message: `❌ **Error agentic**\n${String(error)}`,
    };
  }
}

export async function runServerAgenticEditorCommand(
  command: string,
  options: AgenticEditorCommandOptions = {}
): Promise<AgenticEditorCommandResult> {
  if (!canRunAgenticEditorCommand(command)) {
    return {
      handled: false,
      approved: false,
      message: 'Command is outside the current agentic editor scope.',
    };
  }

  const coarsePipelineId = `server-agentic-${Date.now()}`;
  const slot = options.slot ?? DEFAULT_EDITOR_PROJECT_SAVE_SLOT;

  try {
    const state = useEngineStore.getState();
    const projectName = options.projectName || state.projectName || 'untitled_project';
    emitServerProgress({
      onProgress: options.onProgress,
      pipelineId: coarsePipelineId,
      status: 'started',
      stage: 'input',
      message: 'Server agentic pipeline requested.',
    });

    const saveData = createEditorProjectSaveData(state, { markClean: false });
    const remoteSave = await saveRemoteEditorProject({
      projectName,
      saveData,
      slot,
    });

    if (!remoteSave.response.ok || remoteSave.payload.success !== true) {
      return {
        handled: true,
        approved: false,
        message:
          '⚠️ **Ejecución agentic server bloqueada**\n\nNo se pudo sincronizar el proyecto actual antes de ejecutar el pipeline server.',
        error: remoteSave.payload.error || remoteSave.response.statusText,
      };
    }

    emitServerProgress({
      onProgress: options.onProgress,
      pipelineId: coarsePipelineId,
      status: 'running',
      stage: 'execution',
      message: 'Server agentic pipeline is running.',
    });

    const { response, data } = await requestAgenticServerRun({
      command,
      projectName,
      slot,
      maxIterations: options.maxIterations ?? 3,
      persist: true,
      requireRecommendationApproval: options.requireRecommendationApproval,
      recommendationApprovals: options.recommendationApprovals,
    });

    if (data.persisted) {
      const remoteProject = await fetchRemoteEditorProjectSave({
        projectName,
        slot,
      });
      const restored = restoreEditorProjectSaveData(
        remoteProject.payload.saveData as Parameters<typeof restoreEditorProjectSaveData>[0]
      );
      if (remoteProject.response.ok && restored) {
        useEngineStore.setState(createLoadedEditorProjectPatch(restored));
      }
    }

    const metadata = data.pipeline?.messageMetadata;
    emitServerProgress({
      onProgress: options.onProgress,
      pipelineId: metadata?.pipelineId ?? coarsePipelineId,
      status: data.approved ? 'completed' : 'failed',
      stage: 'delivery',
      message: data.approved
        ? 'Server agentic pipeline approved by final validator.'
        : 'Server agentic pipeline failed final validation.',
      totalSteps: metadata?.steps.length ?? 0,
      completedSteps: metadata?.steps.filter((step) => step.status === 'completed').length ?? 0,
    });

    return {
      handled: true,
      approved: response.ok && data.approved === true,
      metadata,
      message: formatServerAgenticEditorResult({
        command,
        payload: data,
      }),
      error: response.ok ? undefined : data.error || response.statusText,
    };
  } catch (error) {
    emitServerProgress({
      onProgress: options.onProgress,
      pipelineId: coarsePipelineId,
      status: 'failed',
      stage: 'delivery',
      message: `Server agentic pipeline failed: ${String(error)}`,
    });
    return {
      handled: true,
      approved: false,
      error: String(error),
      message: `❌ **Error agentic server**\n${String(error)}`,
    };
  }
}
