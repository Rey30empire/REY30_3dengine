import { afterEach, describe, expect, it } from 'vitest';
import {
  createAgentPlannerRecord,
  resumeAgentPlanner,
  syncAgentPlannerAssistantJob,
} from '@/engine/ai/agentPlanner';
import {
  clearAIAgentPlanStorageForTest,
  readAIAgentPlannerRecord,
  readLatestAIAgentPlannerRecord,
  updateAIAgentPlannerRecord,
  writeAIAgentPlannerRecord,
} from '@/lib/server/ai-agent-plan-storage';

describe('ai agent plan storage', () => {
  afterEach(() => {
    clearAIAgentPlanStorageForTest();
  });

  it('persists and reloads the latest planner record per project', async () => {
    const plan = createAgentPlannerRecord({
      planId: 'plan_1',
      projectKey: 'star_forge',
      prompt: 'Personaje táctico con checkpoints',
      level: 'level1_copilot',
    });

    await writeAIAgentPlannerRecord({
      userId: 'user-1',
      projectKey: 'star_forge',
      plan,
    });

    const latest = readLatestAIAgentPlannerRecord({
      userId: 'user-1',
      projectKey: 'star_forge',
    });

    expect(latest?.planId).toBe('plan_1');
    expect(latest?.prompt).toContain('Personaje táctico');
    expect(latest?.jobs?.at(-1)).toMatchObject({
      attemptNumber: 1,
      action: 'create',
      status: 'queued',
    });
  });

  it('updates planner records durably under the project lock', async () => {
    const plan = createAgentPlannerRecord({
      planId: 'plan_2',
      projectKey: 'star_forge',
      prompt: 'Pipeline con reanudación',
      level: 'level3_full_character',
    });

    await writeAIAgentPlannerRecord({
      userId: 'user-1',
      projectKey: 'star_forge',
      plan,
    });

    const updated = await updateAIAgentPlannerRecord({
      userId: 'user-1',
      projectKey: 'star_forge',
      planId: 'plan_2',
      update: (current) => resumeAgentPlanner(current),
    });

    const reloaded = readAIAgentPlannerRecord({
      userId: 'user-1',
      projectKey: 'star_forge',
      planId: 'plan_2',
    });

    expect(updated?.lastResumedAt).toBeTruthy();
    expect(reloaded?.lastResumedAt).toBe(updated?.lastResumedAt);
    expect(reloaded?.events.at(-1)?.kind).toBe('resumed');
    expect(reloaded?.receipts?.at(-1)).toMatchObject({
      action: 'resume',
      execution: {
        state: 'idle',
      },
    });
    expect(reloaded?.jobs?.at(-1)).toMatchObject({
      attemptNumber: 1,
      action: 'resume',
      status: 'queued',
      executionState: 'idle',
    });
  });

  it('persists assistant-linked jobs inside planner storage', async () => {
    const plan = syncAgentPlannerAssistantJob(
      createAgentPlannerRecord({
        planId: 'plan_3',
        projectKey: 'star_forge',
        prompt: 'Pipeline con assistant job',
        level: 'level3_full_character',
      }),
      {
        taskId: 'character_job_123',
        kind: 'character',
        backend: 'character-job',
        status: 'processing',
        stage: 'build_mesh',
        progress: 42,
      }
    );

    await writeAIAgentPlannerRecord({
      userId: 'user-1',
      projectKey: 'star_forge',
      plan,
    });

    const reloaded = readAIAgentPlannerRecord({
      userId: 'user-1',
      projectKey: 'star_forge',
      planId: 'plan_3',
    });

    expect(reloaded?.assistantJobs?.at(-1)).toMatchObject({
      taskId: 'character_job_123',
      status: 'processing',
      stage: 'build_mesh',
      progress: 42,
      resultStatus: 'pending',
      lastReceiptId: expect.any(String),
    });
  });
});
