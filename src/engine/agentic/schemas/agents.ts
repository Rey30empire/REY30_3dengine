import type { TaskStep } from './planning';
import type { ToolCall, ToolResult } from './tools';
import type { WorldState } from './world';
import type { AgenticSharedMemory, ExecutionTraceWriter } from './execution';

export type AgentRole =
  | 'project_manager'
  | 'scene_architect'
  | 'modeling'
  | 'animation'
  | 'gameplay'
  | 'technical_integration'
  | 'maintenance'
  | 'lighting_environment'
  | 'physics'
  | 'final_delivery_validator';

export interface AgentOutcome {
  agentRole: AgentRole;
  taskId: string;
  status: 'completed' | 'failed' | 'skipped';
  summary: string;
  toolCalls: ToolCall[];
  toolResults: ToolResult[];
  errors: string[];
  evidenceIds: string[];
}

export interface AgentReport {
  agentRole: AgentRole;
  acceptedTaskTypes: string[];
  allowedTools: string[];
  lastOutcome?: AgentOutcome;
}

export interface AgentContext {
  pipelineId: string;
  iteration: number;
  task: TaskStep;
  worldState: WorldState;
  sharedMemory: AgenticSharedMemory;
  allowedToolNames: string[];
  trace: ExecutionTraceWriter;
  executeTool: (call: ToolCall) => Promise<ToolResult>;
}
