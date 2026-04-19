import type { AgentRole } from './agents';
import type { UserIntentDomain } from './intent';

export type TaskStepStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped';

export interface TaskStep {
  id: string;
  title: string;
  description: string;
  domain: UserIntentDomain;
  requiredCapabilities: string[];
  acceptanceCriteria: string[];
  dependsOn: string[];
  agentRole?: AgentRole;
  allowedToolNames?: string[];
  status: TaskStepStatus;
  retryOfStepId?: string;
}

export interface TaskPlan {
  id: string;
  intentId: string;
  iteration: number;
  status: 'draft' | 'ready' | 'running' | 'completed' | 'failed';
  steps: TaskStep[];
  createdAt: string;
  updatedAt: string;
}
