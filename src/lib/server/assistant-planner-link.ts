import {
  syncAgentPlannerAssistantJob,
  type AgentPlannerAssistantJobBackend,
  type AgentPlannerAssistantJobKind,
  type AgentPlannerAssistantJobStatus,
} from '@/engine/ai/agentPlanner';
import type { AssistantDurableJobView } from '@/lib/server/assistant-job-surface';
import { updateAIAgentPlannerRecord } from '@/lib/server/ai-agent-plan-storage';

function normalizeAssistantJob(params: {
  taskId: string;
  kind: AgentPlannerAssistantJobKind;
  backend: AgentPlannerAssistantJobBackend;
  status: AgentPlannerAssistantJobStatus;
  stage?: string | null;
  progress?: number | null;
  readyToFinalize?: boolean;
  asset?: {
    url?: string;
    thumbnailUrl?: string;
    path?: string;
  } | null;
  error?: string | null;
}) {
  return {
    taskId: params.taskId,
    kind: params.kind,
    backend: params.backend,
    status: params.status,
    stage: params.stage ?? null,
    progress: typeof params.progress === 'number' ? params.progress : null,
    readyToFinalize: params.readyToFinalize === true,
    asset: params.asset
      ? {
          url: params.asset.url,
          thumbnailUrl: params.asset.thumbnailUrl,
          path: params.asset.path,
        }
      : null,
    error: params.error ?? null,
  };
}

export async function syncAssistantPlannerJob(params: {
  userId: string;
  projectKey: string;
  planId?: string | null;
  taskId: string;
  kind: AgentPlannerAssistantJobKind;
  backend: AgentPlannerAssistantJobBackend;
  status: AgentPlannerAssistantJobStatus;
  stage?: string | null;
  progress?: number | null;
  readyToFinalize?: boolean;
  asset?: {
    url?: string;
    thumbnailUrl?: string;
    path?: string;
  } | null;
  error?: string | null;
}) {
  const planId = params.planId?.trim();
  if (!planId) {
    return null;
  }

  return updateAIAgentPlannerRecord({
    userId: params.userId,
    projectKey: params.projectKey,
    planId,
    update: (current) =>
      syncAgentPlannerAssistantJob(
        current,
        normalizeAssistantJob({
          taskId: params.taskId,
          kind: params.kind,
          backend: params.backend,
          status: params.status,
          stage: params.stage,
          progress: params.progress,
          readyToFinalize: params.readyToFinalize,
          asset: params.asset,
          error: params.error,
        })
      ),
  });
}

export async function syncAssistantPlannerFromJobView(params: {
  userId: string;
  planId?: string | null;
  job: AssistantDurableJobView;
}) {
  return syncAssistantPlannerJob({
    userId: params.userId,
    planId: params.planId,
    projectKey: params.job.projectKey,
    taskId: params.job.jobId,
    kind: params.job.kind,
    backend: params.job.backend,
    status: params.job.status,
    stage: params.job.stage,
    progress: params.job.progress,
    readyToFinalize: params.job.readyToFinalize,
    asset: params.job.asset,
    error: params.job.error,
  });
}
