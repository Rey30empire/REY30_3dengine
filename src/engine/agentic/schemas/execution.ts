import type { AgentRole } from './agents';
import type { JsonObject } from './common';
import type { TaskPlan } from './planning';
import type { ToolCall, ToolResult } from './tools';
import type { UserIntent, UserIntentDomain } from './intent';
import type { DeliveryDecision, ValidationReport } from './validation';

export type ExecutionEventType =
  | 'intent.parsed'
  | 'plan.created'
  | 'agent.assigned'
  | 'tool.called'
  | 'tool.completed'
  | 'tool.failed'
  | 'step.started'
  | 'step.completed'
  | 'step.failed'
  | 'validation.started'
  | 'validation.approved'
  | 'validation.rejected'
  | 'memory.updated'
  | 'recommendation.unlocked_mutation'
  | 'replan.created'
  | 'pipeline.completed'
  | 'pipeline.failed';

export interface ExecutionTrace {
  id: string;
  pipelineId: string;
  iteration: number;
  eventType: ExecutionEventType;
  severity: 'debug' | 'info' | 'warn' | 'error';
  actor: string;
  message: string;
  stepId?: string;
  toolCallId?: string;
  data?: JsonObject;
  timestamp: string;
}

export interface ExecutionTraceWriter {
  write: (event: Omit<ExecutionTrace, 'id' | 'timestamp'>) => ExecutionTrace;
}

export type AgenticPipelineProgressStatus =
  | 'started'
  | 'planning'
  | 'running'
  | 'step_running'
  | 'step_completed'
  | 'step_failed'
  | 'validating'
  | 'approved'
  | 'rejected'
  | 'replanning'
  | 'completed'
  | 'failed';

export type AgenticPipelineProgressStage =
  | 'input'
  | 'intent'
  | 'planning'
  | 'execution'
  | 'validation'
  | 'replanning'
  | 'delivery';

export interface AgenticPipelineProgressEvent {
  pipelineId: string;
  iteration: number;
  status: AgenticPipelineProgressStatus;
  stage: AgenticPipelineProgressStage;
  message: string;
  totalSteps: number;
  completedSteps: number;
  currentStepId?: string;
  currentStepTitle?: string;
  currentAgentRole?: AgentRole;
  timestamp: string;
}

export type AgenticProgressListener = (event: AgenticPipelineProgressEvent) => void;

export interface StepExecutionResult {
  stepId: string;
  agentRole: AgentRole;
  status: 'completed' | 'failed' | 'skipped';
  toolCalls: ToolCall[];
  toolResults: ToolResult[];
  evidenceIds: string[];
  errors: string[];
  startedAt: string;
  completedAt: string;
  sharedMemory?: AgenticSharedMemory;
}

export type RecommendationApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface ActionableRecommendation {
  id: string;
  approvalKey: string;
  sourceToolName: string;
  sourceCallId: string;
  summary: string;
  rationale: string;
  priority: 'critical' | 'normal' | 'optional';
  suggestedDomain: UserIntentDomain;
  suggestedCapabilities: string[];
  suggestedToolNames: string[];
  input: JsonObject;
  confidence: number;
  approvalStatus: RecommendationApprovalStatus;
}

export interface AnalysisMemoryRecord {
  id: string;
  toolName: string;
  callId: string;
  stepId: string;
  agentRole: AgentRole;
  scope: string;
  summary: string;
  output: JsonObject;
  actionableRecommendations: ActionableRecommendation[];
  createdAt: string;
}

export interface AgenticSharedMemory {
  analyses: AnalysisMemoryRecord[];
  actionableRecommendations: ActionableRecommendation[];
}

export interface PipelineExecutionState {
  pipelineId: string;
  status: 'pending' | 'running' | 'validating' | 'approved' | 'rejected' | 'failed';
  iteration: number;
  originalRequest: string;
  intent?: UserIntent;
  plan?: TaskPlan;
  stepResults: StepExecutionResult[];
  toolResults: ToolResult[];
  validationReports: ValidationReport[];
  finalDecision?: DeliveryDecision;
  sharedMemory: AgenticSharedMemory;
  traces: ExecutionTrace[];
  createdAt: string;
  updatedAt: string;
}
