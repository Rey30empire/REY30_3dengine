import type { AgentRegistry } from '../agents/AgentRegistry';
import type { WorldStateManager } from '../memory/WorldStateManager';
import type { ExecutionTracer } from '../telemetry/ExecutionTracer';
import type { ToolPermissionSystem } from '../tools/ToolPermissionSystem';
import type { ToolRegistry } from '../tools/ToolRegistry';
import {
  type AgenticPipelineProgressEvent,
  type AgenticProgressListener,
  type ActionableRecommendation,
  type AgentContext,
  type AgenticSharedMemory,
  type AnalysisMemoryRecord,
  type JsonObject,
  type PipelineExecutionState,
  type RecommendationApprovalStatus,
  type StepExecutionResult,
  type TaskPlan,
  type TaskStep,
  type ToolResult,
} from '../schemas';

export type RecommendationApprovalDecision = Exclude<RecommendationApprovalStatus, 'pending'>;

export interface PipelineExecutorOptions {
  requireRecommendationApproval?: boolean;
  recommendationApprovals?: Record<string, RecommendationApprovalDecision>;
}

function cloneSharedMemory(memory: AgenticSharedMemory): AgenticSharedMemory {
  return JSON.parse(JSON.stringify(memory)) as AgenticSharedMemory;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeActionableRecommendation(
  value: unknown,
  result: ToolResult,
  approvals: Record<string, RecommendationApprovalDecision>
): ActionableRecommendation | null {
  if (!isRecord(value)) {
    return null;
  }
  const sourceToolName = typeof value.sourceToolName === 'string' ? value.sourceToolName : result.toolName;
  const sourceCallId = typeof value.sourceCallId === 'string' ? value.sourceCallId : result.callId;
  const summary = typeof value.summary === 'string' ? value.summary : result.message;
  const rationale = typeof value.rationale === 'string' ? value.rationale : 'analysis';
  const suggestedDomain = typeof value.suggestedDomain === 'string' ? value.suggestedDomain : 'maintenance';
  const suggestedCapabilities = Array.isArray(value.suggestedCapabilities)
    ? value.suggestedCapabilities.filter((item): item is string => typeof item === 'string')
    : [];
  const suggestedToolNames = Array.isArray(value.suggestedToolNames)
    ? value.suggestedToolNames.filter((item): item is string => typeof item === 'string')
    : [];

  if (!suggestedCapabilities.length && !suggestedToolNames.length) {
    return null;
  }

  const approvalKey =
    typeof value.approvalKey === 'string' && value.approvalKey.trim()
      ? value.approvalKey.trim()
      : `${sourceToolName}:${rationale}:${suggestedToolNames.join('|') || suggestedCapabilities.join('|')}`;
  const id = typeof value.id === 'string' ? value.id : `${result.callId}-recommendation`;
  const declaredApprovalStatus =
    value.approvalStatus === 'approved' || value.approvalStatus === 'rejected' || value.approvalStatus === 'pending'
      ? value.approvalStatus
      : 'pending';
  const approvalStatus =
    approvals[id] ??
    approvals[approvalKey] ??
    approvals[rationale] ??
    approvals[summary] ??
    declaredApprovalStatus;

  return {
    id,
    approvalKey,
    sourceToolName,
    sourceCallId,
    summary,
    rationale,
    priority:
      value.priority === 'critical' || value.priority === 'normal' || value.priority === 'optional'
        ? value.priority
        : 'normal',
    suggestedDomain: suggestedDomain as ActionableRecommendation['suggestedDomain'],
    suggestedCapabilities,
    suggestedToolNames,
    input: isRecord(value.input) ? (value.input as JsonObject) : {},
    confidence: typeof value.confidence === 'number' ? value.confidence : 0.5,
    approvalStatus,
  };
}

function extractActionableRecommendations(
  result: ToolResult,
  approvals: Record<string, RecommendationApprovalDecision>
): ActionableRecommendation[] {
  const raw = result.output?.actionableRecommendations;
  return Array.isArray(raw)
    ? raw
        .map((item) => normalizeActionableRecommendation(item, result, approvals))
        .filter((item): item is ActionableRecommendation => Boolean(item))
    : [];
}

function updateSharedMemoryFromToolResults(
  memory: AgenticSharedMemory,
  step: TaskStep,
  agentRole: NonNullable<TaskStep['agentRole']>,
  toolResults: ToolResult[],
  approvals: Record<string, RecommendationApprovalDecision>
): AgenticSharedMemory {
  const nextMemory = cloneSharedMemory(memory);

  for (const result of toolResults) {
    if (!result.success || (result.toolName !== 'scene.analyze' && result.toolName !== 'world.inspect') || !result.output) {
      continue;
    }
    const actionableRecommendations = extractActionableRecommendations(result, approvals);
    const record: AnalysisMemoryRecord = {
      id: `${result.callId}-analysis`,
      toolName: result.toolName,
      callId: result.callId,
      stepId: step.id,
      agentRole,
      scope: typeof result.output.scope === 'string' ? result.output.scope : 'unknown',
      summary: result.message,
      output: result.output,
      actionableRecommendations,
      createdAt: result.completedAt,
    };
    nextMemory.analyses.push(record);
    nextMemory.actionableRecommendations.push(...actionableRecommendations);
  }

  return nextMemory;
}

export class PipelineExecutor {
  constructor(
    private readonly agents: AgentRegistry,
    private readonly tools: ToolRegistry,
    private readonly permissions: ToolPermissionSystem,
    private readonly world: WorldStateManager,
    private readonly tracer: ExecutionTracer,
    private readonly onProgress?: AgenticProgressListener,
    private readonly options: PipelineExecutorOptions = {}
  ) {}

  async executePlan(
    plan: TaskPlan,
    baseState: PipelineExecutionState
  ): Promise<StepExecutionResult[]> {
    const results: StepExecutionResult[] = [];
    let sharedMemory = cloneSharedMemory(baseState.sharedMemory);

    for (const [index, step] of plan.steps.entries()) {
      const result = await this.executeStep(
        step,
        baseState.pipelineId,
        plan.iteration,
        index,
        plan.steps.length,
        sharedMemory
      );
      sharedMemory = result.sharedMemory ?? sharedMemory;
      results.push(result);
    }

    return results;
  }

  private async executeStep(
    step: TaskStep,
    pipelineId: string,
    iteration: number,
    stepIndex: number,
    totalSteps: number,
    sharedMemory: AgenticSharedMemory
  ): Promise<StepExecutionResult> {
    const startedAt = new Date().toISOString();
    const agentRole = step.agentRole;

    if (!agentRole) {
      this.emitProgress({
        pipelineId,
        iteration,
        status: 'step_failed',
        stage: 'execution',
        message: `Step ${step.id} has no assigned agent.`,
        totalSteps,
        completedSteps: stepIndex,
        currentStepId: step.id,
        currentStepTitle: step.title,
      });
      return {
        stepId: step.id,
        agentRole: 'maintenance',
        status: 'failed',
        toolCalls: [],
        toolResults: [],
        evidenceIds: [],
        errors: [`Step ${step.id} has no assigned agent.`],
        startedAt,
        completedAt: new Date().toISOString(),
      };
    }

    this.emitProgress({
      pipelineId,
      iteration,
      status: 'step_running',
      stage: 'execution',
      message: `Executing step: ${step.title}`,
      totalSteps,
      completedSteps: stepIndex,
      currentStepId: step.id,
      currentStepTitle: step.title,
      currentAgentRole: agentRole,
    });

    this.tracer.write({
      pipelineId,
      iteration,
      eventType: 'step.started',
      severity: 'info',
      actor: agentRole,
      stepId: step.id,
      message: `Starting step: ${step.title}`,
    });

    const agent = this.agents.get(agentRole);
    if (!agent) {
      this.tracer.write({
        pipelineId,
        iteration,
        eventType: 'step.failed',
        severity: 'error',
        actor: agentRole,
        stepId: step.id,
        message: `No agent registered for ${agentRole}.`,
      });
      this.emitProgress({
        pipelineId,
        iteration,
        status: 'step_failed',
        stage: 'execution',
        message: `No agent registered for ${agentRole}.`,
        totalSteps,
        completedSteps: stepIndex,
        currentStepId: step.id,
        currentStepTitle: step.title,
        currentAgentRole: agentRole,
      });
      return {
        stepId: step.id,
        agentRole,
        status: 'failed',
        toolCalls: [],
        toolResults: [],
        evidenceIds: [],
        errors: [`No agent registered for ${agentRole}.`],
        startedAt,
        completedAt: new Date().toISOString(),
      };
    }

    const approvalBlock = this.getRecommendationApprovalBlock(step, agentRole, sharedMemory);
    if (approvalBlock) {
      this.tracer.write({
        pipelineId,
        iteration,
        eventType: 'step.failed',
        severity: 'warn',
        actor: agentRole,
        stepId: step.id,
        message: approvalBlock.message,
        data: approvalBlock.data,
      });
      this.emitProgress({
        pipelineId,
        iteration,
        status: 'step_failed',
        stage: 'execution',
        message: approvalBlock.message,
        totalSteps,
        completedSteps: stepIndex,
        currentStepId: step.id,
        currentStepTitle: step.title,
        currentAgentRole: agentRole,
      });
      return {
        stepId: step.id,
        agentRole,
        status: 'skipped',
        toolCalls: [],
        toolResults: [],
        evidenceIds: [],
        errors: [approvalBlock.code],
        startedAt,
        completedAt: new Date().toISOString(),
        sharedMemory: cloneSharedMemory(sharedMemory),
      };
    }
    const unlockedRecommendations = this.getApprovedRecommendationUnlocks(step, agentRole, sharedMemory);
    if (unlockedRecommendations.length) {
      this.tracer.write({
        pipelineId,
        iteration,
        eventType: 'recommendation.unlocked_mutation',
        severity: 'info',
        actor: agentRole,
        stepId: step.id,
        message: `Approved recommendation unlocked mutation for ${step.title}.`,
        data: {
          stepTitle: step.title,
          stepCapabilities: step.requiredCapabilities,
          approvedRecommendationIds: unlockedRecommendations.map((recommendation) => recommendation.id),
          approvedRecommendationKeys: unlockedRecommendations.map((recommendation) => recommendation.approvalKey),
          approvedRecommendationSummaries: unlockedRecommendations.map((recommendation) => recommendation.summary),
          suggestedToolNames: [
            ...new Set(unlockedRecommendations.flatMap((recommendation) => recommendation.suggestedToolNames)),
          ],
        },
      });
    }

    const allowedToolNames = step.allowedToolNames?.length
      ? step.allowedToolNames
      : this.permissions.getAllowedTools(agentRole);

    const context: AgentContext = {
      pipelineId,
      iteration,
      task: step,
      worldState: this.world.getSnapshot(),
      sharedMemory: cloneSharedMemory(sharedMemory),
      allowedToolNames,
      trace: this.tracer,
      executeTool: (call) =>
        this.tools.execute(call, {
          pipelineId,
          iteration,
          stepId: step.id,
          agentRole,
          world: this.world,
          trace: this.tracer,
        }),
    };

    const outcome = await agent.execute(step, context);
    const nextSharedMemory = updateSharedMemoryFromToolResults(
      sharedMemory,
      step,
      agentRole,
      outcome.toolResults,
      this.options.recommendationApprovals ?? {}
    );
    const result: StepExecutionResult = {
      stepId: step.id,
      agentRole,
      status: outcome.status === 'completed' ? 'completed' : 'failed',
      toolCalls: outcome.toolCalls,
      toolResults: outcome.toolResults,
      evidenceIds: outcome.evidenceIds,
      errors: outcome.errors,
      startedAt,
      completedAt: new Date().toISOString(),
      sharedMemory: nextSharedMemory,
    };

    if (nextSharedMemory.analyses.length !== sharedMemory.analyses.length) {
      this.tracer.write({
        pipelineId,
        iteration,
        eventType: 'memory.updated',
        severity: 'info',
        actor: agentRole,
        stepId: step.id,
        message: `Stored ${nextSharedMemory.analyses.length - sharedMemory.analyses.length} analysis result(s) in shared memory.`,
        data: {
          analysisCount: nextSharedMemory.analyses.length,
          actionableRecommendationCount: nextSharedMemory.actionableRecommendations.length,
        },
      });
    }

    this.tracer.write({
      pipelineId,
      iteration,
      eventType: result.status === 'completed' ? 'step.completed' : 'step.failed',
      severity: result.status === 'completed' ? 'info' : 'error',
      actor: agentRole,
      stepId: step.id,
      message: outcome.summary,
      data: {
        evidenceIds: result.evidenceIds,
        errors: result.errors,
      },
    });

    this.emitProgress({
      pipelineId,
      iteration,
      status: result.status === 'completed' ? 'step_completed' : 'step_failed',
      stage: 'execution',
      message: outcome.summary,
      totalSteps,
      completedSteps: result.status === 'completed' ? stepIndex + 1 : stepIndex,
      currentStepId: step.id,
      currentStepTitle: step.title,
      currentAgentRole: agentRole,
    });

    return result;
  }

  private emitProgress(event: Omit<AgenticPipelineProgressEvent, 'timestamp'>): void {
    this.onProgress?.({
      ...event,
      timestamp: new Date().toISOString(),
    });
  }

  private getRecommendationApprovalBlock(
    step: TaskStep,
    agentRole: NonNullable<TaskStep['agentRole']>,
    sharedMemory: AgenticSharedMemory
  ): { code: string; message: string; data: JsonObject } | null {
    if (!this.options.requireRecommendationApproval || !this.stepMutatesWorld(step, agentRole)) {
      return null;
    }

    const recommendations = sharedMemory.actionableRecommendations.filter(
      (recommendation) => recommendation.confidence >= 0.5
    );
    if (!recommendations.length) {
      return null;
    }

    const approved = recommendations.filter((recommendation) => recommendation.approvalStatus === 'approved');
    if (approved.length && this.stepMatchesApprovedRecommendation(step, approved)) {
      return null;
    }

    const pending = recommendations.filter((recommendation) => recommendation.approvalStatus === 'pending');
    if (pending.length) {
      return {
        code: 'RECOMMENDATION_APPROVAL_REQUIRED',
        message: `Mutation blocked until ${pending.length} recommendation(s) are approved or rejected.`,
        data: {
          pendingRecommendationIds: pending.map((recommendation) => recommendation.id),
          pendingRecommendationKeys: pending.map((recommendation) => recommendation.approvalKey),
        },
      };
    }

    if (!approved.length) {
      return {
        code: 'RECOMMENDATIONS_REJECTED',
        message: 'Mutation blocked because all analysis recommendations were rejected.',
        data: {
          rejectedRecommendationIds: recommendations.map((recommendation) => recommendation.id),
        },
      };
    }

    if (!this.stepMatchesApprovedRecommendation(step, approved)) {
      return {
        code: 'RECOMMENDATION_REPLAN_REQUIRED',
        message: 'Mutation blocked until the planner replans from approved recommendations.',
        data: {
          approvedRecommendationIds: approved.map((recommendation) => recommendation.id),
          stepCapabilities: step.requiredCapabilities,
        },
      };
    }

    return null;
  }

  private stepMutatesWorld(step: TaskStep, agentRole: NonNullable<TaskStep['agentRole']>): boolean {
    const candidateToolNames = step.requiredCapabilities.filter((capability) => this.tools.get(capability));
    const toolNames = candidateToolNames.length ? candidateToolNames : this.permissions.getAllowedTools(agentRole);
    return toolNames.some((toolName) => this.tools.get(toolName)?.mutatesWorld === true);
  }

  private stepMatchesApprovedRecommendation(
    step: TaskStep,
    recommendations: ActionableRecommendation[]
  ): boolean {
    const capabilities = new Set(step.requiredCapabilities);
    return recommendations.some((recommendation) =>
      [...recommendation.suggestedToolNames, ...recommendation.suggestedCapabilities].some((capability) =>
        capabilities.has(capability)
      )
    );
  }

  private getApprovedRecommendationUnlocks(
    step: TaskStep,
    agentRole: NonNullable<TaskStep['agentRole']>,
    sharedMemory: AgenticSharedMemory
  ): ActionableRecommendation[] {
    if (!this.options.requireRecommendationApproval || !this.stepMutatesWorld(step, agentRole)) {
      return [];
    }
    const capabilities = new Set(step.requiredCapabilities);
    return sharedMemory.actionableRecommendations.filter(
      (recommendation) =>
        recommendation.approvalStatus === 'approved' &&
        [...recommendation.suggestedToolNames, ...recommendation.suggestedCapabilities].some((capability) =>
          capabilities.has(capability)
        )
    );
  }
}
