import { AgentRegistry } from '../agents/AgentRegistry';
import { createDefaultAgentRegistry } from '../agents/createDefaultAgentRegistry';
import { IntentAnalyzer } from '../intent/IntentAnalyzer';
import { PipelineMemory } from '../memory/PipelineMemory';
import { WorldStateManager } from '../memory/WorldStateManager';
import { TaskPlanner } from '../planning/TaskPlanner';
import { ExecutionTracer } from '../telemetry/ExecutionTracer';
import { ToolPermissionSystem } from '../tools/ToolPermissionSystem';
import { ToolRegistry } from '../tools/ToolRegistry';
import { createDefaultToolRegistry } from '../tools/createDefaultToolRegistry';
import { FinalDeliveryValidatorAgent } from '../validation/FinalDeliveryValidatorAgent';
import {
  type AgenticPipelineProgressEvent,
  type AgenticProgressListener,
  createAgenticId,
  type AgentRole,
  type IntentObjective,
  type PipelineExecutionState,
  type TaskPlan,
  type TaskStep,
  type ToolDefinition,
  type UserIntent,
  type UserIntentDomain,
  type ValidationReport,
  type WorldState,
} from '../schemas';
import { PipelineExecutor } from './PipelineExecutor';
import type { RecommendationApprovalDecision } from './PipelineExecutor';

export interface MasterOrchestratorOptions {
  world?: WorldStateManager;
  agents?: AgentRegistry;
  tools?: ToolRegistry;
  permissions?: ToolPermissionSystem;
  intentAnalyzer?: IntentAnalyzer;
  planner?: TaskPlanner;
  validator?: FinalDeliveryValidatorAgent;
  tracer?: ExecutionTracer;
  onProgress?: AgenticProgressListener;
  maxIterations?: number;
  requireRecommendationApproval?: boolean;
  recommendationApprovals?: Record<string, RecommendationApprovalDecision>;
}

export interface AgenticRunResult {
  state: PipelineExecutionState;
  worldState: WorldState;
}

const TOOL_TO_DOMAIN: Record<string, UserIntentDomain> = {
  'environment.configureFog': 'environment',
  'world.fog.enabled': 'environment',
  'lighting.adjustLight': 'lighting',
  'environment.changeSky': 'environment',
  'scene.groupObjects': 'layout',
  'world.scene.layout_group': 'layout',
  'entity.create': 'entity',
  'world.entity.npc': 'entity',
  'script.create': 'gameplay',
  'script.attach': 'gameplay',
  'world.npc.script_attached': 'gameplay',
  'physics.addCollider': 'physics',
  'physics.applyPreset': 'physics',
  'world.npc.physics_ready': 'physics',
  'animation.createClip': 'animation',
  'animation.attachClip': 'animation',
  'asset.reindex': 'maintenance',
  'build.validateScene': 'build',
  'build.export': 'build',
  'build.artifact.physical': 'build',
};

export class MasterOrchestrator {
  private readonly world: WorldStateManager;
  private readonly agents: AgentRegistry;
  private readonly tools: ToolRegistry;
  private readonly permissions: ToolPermissionSystem;
  private readonly intentAnalyzer: IntentAnalyzer;
  private readonly planner: TaskPlanner;
  private readonly validator: FinalDeliveryValidatorAgent;
  private readonly tracer: ExecutionTracer;
  private readonly onProgress?: AgenticProgressListener;
  private readonly maxIterations: number;
  private readonly requireRecommendationApproval: boolean;
  private readonly recommendationApprovals: Record<string, RecommendationApprovalDecision>;
  private memory: PipelineMemory | null = null;

  constructor(options: MasterOrchestratorOptions = {}) {
    this.world = options.world ?? new WorldStateManager();
    this.agents = options.agents ?? createDefaultAgentRegistry();
    this.tools = options.tools ?? createDefaultToolRegistry();
    this.permissions = options.permissions ?? new ToolPermissionSystem();
    this.intentAnalyzer = options.intentAnalyzer ?? new IntentAnalyzer();
    this.planner = options.planner ?? new TaskPlanner();
    this.validator = options.validator ?? new FinalDeliveryValidatorAgent();
    this.tracer = options.tracer ?? new ExecutionTracer();
    this.onProgress = options.onProgress;
    this.maxIterations = options.maxIterations ?? 3;
    this.requireRecommendationApproval = options.requireRecommendationApproval === true;
    this.recommendationApprovals = options.recommendationApprovals ?? {};
  }

  parseUserIntent(input: string): UserIntent {
    const intent = this.intentAnalyzer.parseUserIntent(input);
    this.emitProgress({
      pipelineId: this.memory?.getState().pipelineId ?? 'unbound',
      iteration: this.memory?.getState().iteration ?? 1,
      status: 'planning',
      stage: 'intent',
      message: `Intent parsed with ${intent.objectives.length} objectives.`,
      totalSteps: 0,
      completedSteps: 0,
    });
    this.tracer.write({
      pipelineId: this.memory?.getState().pipelineId ?? 'unbound',
      iteration: this.memory?.getState().iteration ?? 1,
      eventType: 'intent.parsed',
      severity: intent.ambiguities.length ? 'warn' : 'info',
      actor: 'master_orchestrator',
      message: `Parsed ${intent.objectives.length} objectives.`,
      data: {
        actions: intent.actions,
        domains: intent.domains,
        riskLevel: intent.riskLevel,
      },
    });
    return intent;
  }

  buildExecutionPlan(intent: UserIntent, iteration = 1): TaskPlan {
    const plan = this.planner.buildExecutionPlan(intent, iteration);
    const assigned = this.assignAgentsToSteps(plan);
    this.emitProgress({
      pipelineId: this.memory?.getState().pipelineId ?? 'unbound',
      iteration,
      status: 'planning',
      stage: 'planning',
      message: `Execution plan created with ${assigned.steps.length} steps.`,
      totalSteps: assigned.steps.length,
      completedSteps: 0,
    });
    this.tracer.write({
      pipelineId: this.memory?.getState().pipelineId ?? 'unbound',
      iteration,
      eventType: 'plan.created',
      severity: 'info',
      actor: 'master_orchestrator',
      message: `Created plan with ${assigned.steps.length} steps.`,
    });
    return assigned;
  }

  assignAgentsToSteps(plan: TaskPlan): TaskPlan {
    const assigned = this.planner.assignAgentsToSteps(plan);
    return {
      ...assigned,
      steps: assigned.steps.map((step) => ({
        ...step,
        allowedToolNames: this.grantToolsForStep(step).map((tool) => tool.name),
      })),
    };
  }

  grantToolsForStep(step: TaskStep): ToolDefinition[] {
    if (!step.agentRole) {
      return [];
    }
    const allowedToolNames = this.permissions.getAllowedTools(step.agentRole);
    return this.tools.list().filter((tool) => allowedToolNames.includes(tool.name));
  }

  async executePlan(plan: TaskPlan): Promise<PipelineExecutionState> {
    if (!this.memory) {
      throw new Error('Cannot execute a plan before a pipeline memory is created.');
    }
    this.memory.setStatus('running');
    this.memory.setPlan(plan);
    this.emitProgress({
      pipelineId: this.memory.getState().pipelineId,
      iteration: plan.iteration,
      status: 'running',
      stage: 'execution',
      message: `Executing plan with ${plan.steps.length} steps.`,
      totalSteps: plan.steps.length,
      completedSteps: 0,
    });

    const executor = new PipelineExecutor(
      this.agents,
      this.tools,
      this.permissions,
      this.world,
      this.tracer,
      this.onProgress,
      {
        requireRecommendationApproval: this.requireRecommendationApproval,
        recommendationApprovals: this.recommendationApprovals,
      }
    );
    const stepResults = await executor.executePlan(plan, this.memory.getState());
    for (const result of stepResults) {
      this.memory.addStepResult(result);
    }
    this.memory.setTraces(this.tracer.list());
    return this.memory.getState();
  }

  replanIfNeeded(report: ValidationReport): TaskPlan | null {
    if (!this.memory || report.approved) {
      return null;
    }
    const currentState = this.memory.getState();
    const intent = currentState.intent;
    if (!intent) {
      return null;
    }

    const approvedRecommendations = currentState.sharedMemory.actionableRecommendations.filter(
      (recommendation) => recommendation.approvalStatus === 'approved'
    );
    const pendingRecommendations = currentState.sharedMemory.actionableRecommendations.filter(
      (recommendation) => recommendation.approvalStatus === 'pending'
    );
    if (this.requireRecommendationApproval) {
      if (approvedRecommendations.length) {
        const nextIteration = this.memory.nextIteration();
        this.emitProgress({
          pipelineId: currentState.pipelineId,
          iteration: nextIteration,
          status: 'replanning',
          stage: 'replanning',
          message: `Replanning from ${approvedRecommendations.length} approved recommendation(s).`,
          totalSteps: 0,
          completedSteps: 0,
        });
        const recommendationPlan = this.assignAgentsToSteps(
          this.planner.buildExecutionPlanFromRecommendations(intent, approvedRecommendations, nextIteration)
        );
        this.tracer.write({
          pipelineId: currentState.pipelineId,
          iteration: nextIteration,
          eventType: 'replan.created',
          severity: 'warn',
          actor: 'master_orchestrator',
          message: 'Created retry plan from approved recommendations in shared memory.',
          data: {
            recommendationCount: approvedRecommendations.length,
          },
        });
        return recommendationPlan;
      }

      if (pendingRecommendations.length) {
        this.tracer.write({
          pipelineId: currentState.pipelineId,
          iteration: currentState.iteration,
          eventType: 'pipeline.failed',
          severity: 'warn',
          actor: 'master_orchestrator',
          message: 'Pipeline paused because recommendations need user approval before mutation.',
          data: {
            pendingRecommendationCount: pendingRecommendations.length,
            pendingRecommendationKeys: pendingRecommendations.map((recommendation) => recommendation.approvalKey),
          },
        });
        return null;
      }
    }

    const requiredTools = report.missingRequirements.filter((requirement) => TOOL_TO_DOMAIN[requirement]);
    if (report.incorrectOutputs.includes('world.environment.too_bright_for_dark_request')) {
      requiredTools.push('environment.changeSky', 'lighting.adjustLight');
    }
    if (report.incorrectOutputs.includes('build.export.no_physical_artifacts')) {
      requiredTools.push('build.export');
    }
    if (!requiredTools.length && currentState.sharedMemory.actionableRecommendations.length) {
      const nextIteration = this.memory.nextIteration();
      this.emitProgress({
        pipelineId: currentState.pipelineId,
        iteration: nextIteration,
        status: 'replanning',
        stage: 'replanning',
        message: `Replanning from ${currentState.sharedMemory.actionableRecommendations.length} analysis recommendation(s).`,
        totalSteps: 0,
        completedSteps: 0,
      });
      const recommendationPlan = this.assignAgentsToSteps(
        this.planner.buildExecutionPlanFromRecommendations(
          intent,
          currentState.sharedMemory.actionableRecommendations,
          nextIteration
        )
      );
      this.tracer.write({
        pipelineId: currentState.pipelineId,
        iteration: nextIteration,
        eventType: 'replan.created',
        severity: 'warn',
        actor: 'master_orchestrator',
        message: `Created retry plan from analysis recommendations in shared memory.`,
        data: {
          recommendationCount: currentState.sharedMemory.actionableRecommendations.length,
        },
      });
      return recommendationPlan;
    }
    if (!requiredTools.length) {
      requiredTools.push(...intent.objectives.flatMap((objective) => objective.requiredEvidence));
    }

    const objectives: IntentObjective[] = [...new Set(requiredTools)].map((toolName) => ({
      id: createAgenticId('objective'),
      domain: TOOL_TO_DOMAIN[toolName] ?? 'maintenance',
      description: `Retry missing or incorrect requirement: ${toolName}. Original request: ${intent.normalizedInput}`,
      priority: 'critical',
      requiredEvidence: [this.requirementToTool(toolName)],
    }));

    const retryIntent: UserIntent = {
      ...intent,
      id: createAgenticId('intent_retry'),
      objectives,
      domains: [...new Set(objectives.map((objective) => objective.domain))],
    };
    const nextIteration = this.memory.nextIteration();
    this.emitProgress({
      pipelineId: currentState.pipelineId,
      iteration: nextIteration,
      status: 'replanning',
      stage: 'replanning',
      message: `Replanning after validation report ${report.id}.`,
      totalSteps: 0,
      completedSteps: 0,
    });
    const nextPlan = this.buildExecutionPlan(retryIntent, nextIteration);

    this.tracer.write({
      pipelineId: currentState.pipelineId,
      iteration: nextIteration,
      eventType: 'replan.created',
      severity: 'warn',
      actor: 'master_orchestrator',
      message: `Created retry plan from validation report ${report.id}.`,
      data: {
        missingRequirements: report.missingRequirements,
        incorrectOutputs: report.incorrectOutputs,
      },
    });

    return nextPlan;
  }

  submitForValidation(): ValidationReport {
    if (!this.memory?.getState().intent) {
      throw new Error('Cannot validate before intent exists.');
    }
    const state = this.memory.getState();
    const intent = state.intent;
    if (!intent) {
      throw new Error('Cannot validate before intent exists.');
    }
    this.memory.setStatus('validating');
    const planProgress = this.getCurrentPlanProgress(state);
    this.emitProgress({
      pipelineId: state.pipelineId,
      iteration: state.iteration,
      status: 'validating',
      stage: 'validation',
      message: 'Running final delivery validation.',
      totalSteps: planProgress.totalSteps,
      completedSteps: planProgress.completedSteps,
    });
    this.tracer.write({
      pipelineId: state.pipelineId,
      iteration: state.iteration,
      eventType: 'validation.started',
      severity: 'info',
      actor: 'final_delivery_validator',
      message: 'Starting final delivery validation.',
    });

    const requirements = this.validator.analyzeOriginalRequest(intent);
    const report = this.validator.generateValidationReport(
      requirements,
      state,
      this.world.getSnapshot()
    );
    const decision = this.validator.approveOrReject(report);
    this.memory.addValidationReport(report);
    this.memory.setFinalDecision(decision);
    this.memory.setTraces(this.tracer.list());
    this.emitProgress({
      pipelineId: state.pipelineId,
      iteration: state.iteration,
      status: report.approved ? 'approved' : 'rejected',
      stage: 'validation',
      message: decision.reason,
      totalSteps: planProgress.totalSteps,
      completedSteps: planProgress.completedSteps,
    });

    this.tracer.write({
      pipelineId: state.pipelineId,
      iteration: state.iteration,
      eventType: report.approved ? 'validation.approved' : 'validation.rejected',
      severity: report.approved ? 'info' : 'warn',
      actor: 'final_delivery_validator',
      message: decision.reason,
      data: {
        missingRequirements: report.missingRequirements,
        incorrectOutputs: report.incorrectOutputs,
      },
    });

    return report;
  }

  async run(input: string): Promise<AgenticRunResult> {
    this.tracer.clear();
    this.memory = new PipelineMemory(input);
    this.emitProgress({
      pipelineId: this.memory.getState().pipelineId,
      iteration: 1,
      status: 'started',
      stage: 'input',
      message: 'Agentic pipeline started.',
      totalSteps: 0,
      completedSteps: 0,
    });
    const intent = this.parseUserIntent(input);
    this.memory.setIntent(intent);

    let plan: TaskPlan | null = this.buildExecutionPlan(intent, 1);
    let lastReport: ValidationReport | null = null;

    while (plan && this.memory.getState().iteration <= this.maxIterations) {
      await this.executePlan(plan);
      lastReport = this.submitForValidation();
      if (lastReport.approved) {
        this.tracer.write({
          pipelineId: this.memory.getState().pipelineId,
          iteration: this.memory.getState().iteration,
          eventType: 'pipeline.completed',
          severity: 'info',
          actor: 'master_orchestrator',
          message: 'Pipeline approved by final validator.',
        });
        const progress = this.getCurrentPlanProgress(this.memory.getState());
        this.emitProgress({
          pipelineId: this.memory.getState().pipelineId,
          iteration: this.memory.getState().iteration,
          status: 'completed',
          stage: 'delivery',
          message: 'Pipeline approved by final validator.',
          totalSteps: progress.totalSteps,
          completedSteps: progress.completedSteps,
        });
        this.memory.setTraces(this.tracer.list());
        return {
          state: this.memory.getState(),
          worldState: this.world.getSnapshot(),
        };
      }

      plan = this.replanIfNeeded(lastReport);
    }

    this.tracer.write({
      pipelineId: this.memory.getState().pipelineId,
      iteration: this.memory.getState().iteration,
      eventType: 'pipeline.failed',
      severity: 'error',
      actor: 'master_orchestrator',
      message: 'Pipeline failed to satisfy final validation within retry budget.',
    });
    const progress = this.getCurrentPlanProgress(this.memory.getState());
    this.emitProgress({
      pipelineId: this.memory.getState().pipelineId,
      iteration: this.memory.getState().iteration,
      status: 'failed',
      stage: 'delivery',
      message: 'Pipeline failed to satisfy final validation within retry budget.',
      totalSteps: progress.totalSteps,
      completedSteps: progress.completedSteps,
    });
    this.memory.setStatus('failed');
    this.memory.setTraces(this.tracer.list());
    return {
      state: this.memory.getState(),
      worldState: this.world.getSnapshot(),
    };
  }

  getWorldState(): WorldState {
    return this.world.getSnapshot();
  }

  getPipelineState(): PipelineExecutionState | null {
    return this.memory?.getState() ?? null;
  }

  private requirementToTool(requirement: string): string {
    const mapping: Record<string, string> = {
      'world.fog.enabled': 'environment.configureFog',
      'world.scene.layout_group': 'scene.groupObjects',
      'world.entity.npc': 'entity.create',
      'world.npc.script_attached': 'script.attach',
      'world.npc.physics_ready': 'physics.applyPreset',
      'build.artifact.physical': 'build.export',
      'build.export.no_physical_artifacts': 'build.export',
    };
    return mapping[requirement] ?? requirement;
  }

  private getCurrentPlanProgress(state: PipelineExecutionState): {
    totalSteps: number;
    completedSteps: number;
  } {
    const stepIds = new Set(state.plan?.steps.map((step) => step.id) ?? []);
    if (!stepIds.size) {
      return { totalSteps: 0, completedSteps: 0 };
    }
    return {
      totalSteps: stepIds.size,
      completedSteps: state.stepResults.filter(
        (result) => stepIds.has(result.stepId) && result.status === 'completed'
      ).length,
    };
  }

  private emitProgress(event: Omit<AgenticPipelineProgressEvent, 'timestamp'>): void {
    this.onProgress?.({
      ...event,
      timestamp: new Date().toISOString(),
    });
  }
}
