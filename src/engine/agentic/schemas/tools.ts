import type { AgentRole } from './agents';
import type { JsonObject, JsonValue } from './common';
import type { ExecutionTraceWriter } from './execution';
import type { WorldStateManager } from '../memory/WorldStateManager';

export interface ChangeEvidence {
  id: string;
  type:
    | 'scene'
    | 'entity'
    | 'component'
    | 'material'
    | 'lighting'
    | 'environment'
    | 'physics'
    | 'animation'
    | 'script'
    | 'asset'
    | 'build'
    | 'validation';
  targetId?: string;
  summary: string;
  before?: JsonValue;
  after?: JsonValue;
  timestamp: string;
}

export interface ToolError {
  code: string;
  message: string;
  recoverable: boolean;
}

export interface ToolCall<TInput extends JsonObject = JsonObject> {
  id: string;
  toolName: string;
  agentRole: AgentRole;
  stepId: string;
  input: TInput;
}

export interface ToolResult<TOutput extends JsonObject = JsonObject> {
  callId: string;
  toolName: string;
  success: boolean;
  message: string;
  evidence: ChangeEvidence[];
  output?: TOutput;
  error?: ToolError;
  mutatesWorld?: boolean;
  evidenceContract?: ToolEvidenceContract;
  startedAt: string;
  completedAt: string;
}

export interface ToolExecutionContext {
  pipelineId: string;
  iteration: number;
  stepId: string;
  agentRole: AgentRole;
  call: ToolCall;
  world: WorldStateManager;
  trace: ExecutionTraceWriter;
}

export type ToolEvidenceContract = 'before_after' | 'none';

type ToolMutationContract =
  | {
      mutatesWorld: true;
      evidenceContract: 'before_after';
    }
  | {
      mutatesWorld: false;
      evidenceContract: 'none';
    };

type ToolDefinitionBase<
  TInput extends JsonObject = JsonObject,
  TOutput extends JsonObject = JsonObject,
> = {
  name: string;
  description: string;
  capabilities: string[];
  execute: (
    input: TInput,
    context: ToolExecutionContext
  ) => Promise<ToolResult<TOutput>> | ToolResult<TOutput>;
};

export type ToolDefinition<
  TInput extends JsonObject = JsonObject,
  TOutput extends JsonObject = JsonObject,
> = ToolDefinitionBase<TInput, TOutput> & ToolMutationContract;
