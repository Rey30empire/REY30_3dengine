import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { clearAIAgentPlanStorageForTest } from '@/lib/server/ai-agent-plan-storage';
import { clearStaleMetadataRevertPolicyConfigForTest } from '@/lib/server/stale-metadata-revert-policy';

const requireSessionMock = vi.fn();
const authErrorToResponseMock = vi.fn((error: unknown) =>
  Response.json(
    {
      error: String(error).includes('FORBIDDEN')
        ? 'No tienes permisos para esta acción.'
        : 'Debes iniciar sesión o usar un token de acceso.',
    },
    { status: String(error).includes('FORBIDDEN') ? 403 : 401 }
  )
);

vi.mock('@/lib/security/auth', () => ({
  requireSession: requireSessionMock,
  authErrorToResponse: authErrorToResponseMock,
}));

describe('ai agents route', () => {
  afterEach(() => {
    clearAIAgentPlanStorageForTest();
    clearStaleMetadataRevertPolicyConfigForTest();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('requires editor access and returns a reduced lab summary on GET', async () => {
    requireSessionMock.mockResolvedValue({
      id: 'editor-1',
      role: 'EDITOR',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });

    const { GET } = await import('@/app/api/ai-agents/route');
    const response = await GET(new NextRequest('http://localhost/api/ai-agents'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(requireSessionMock).toHaveBeenCalledWith(expect.any(NextRequest), 'EDITOR');
    expect(Array.isArray(payload.levels)).toBe(true);
    expect(Array.isArray(payload.workflowStages)).toBe(true);
    expect(payload.levels[0]).toHaveProperty('id');
    expect(payload.levels[0]).toHaveProperty('name');
    expect(payload.levels[0]).toHaveProperty('goal');
    expect(payload.levels[0]).not.toHaveProperty('agents');
    expect(payload.workflowStages[0]).toHaveProperty('id');
    expect(payload.workflowStages[0]).toHaveProperty('title');
    expect(payload.workflowStages[0]).not.toHaveProperty('owner');
    expect(payload.workflowStages[0]).not.toHaveProperty('validationRules');
    expect(payload.activePlan).toBeNull();
    expect(payload.activeExecution).toBeNull();
    expect(payload.activeJob).toBeNull();
    expect(payload.activeReceipt).toBeNull();
    expect(payload).not.toHaveProperty('pipeline');
  });

  it('returns a sanitized plan without internal ownership fields on POST', async () => {
    requireSessionMock.mockResolvedValue({
      id: 'editor-1',
      role: 'EDITOR',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });

    const { POST } = await import('@/app/api/ai-agents/route');
    const response = await POST(
      new NextRequest('http://localhost/api/ai-agents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt: 'Personaje estilizado para juego móvil',
          level: 'level2_basemesh',
        }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.plan).toHaveProperty('summary');
    expect(payload.plan).toHaveProperty('planId');
    expect(payload.plan).toHaveProperty('selectedLevel', 'level2_basemesh');
    expect(payload.plan).toHaveProperty('status', 'draft');
    expect(payload.plan.execution).toMatchObject({
      state: 'idle',
      currentStageId: null,
      resumable: true,
    });
    expect(payload.plan.receipts.at(-1)).toMatchObject({
      action: 'create',
      execution: {
        state: 'idle',
      },
    });
    expect(payload.execution).toMatchObject({
      state: 'idle',
      currentStageId: null,
    });
    expect(payload.job).toMatchObject({
      attemptNumber: 1,
      action: 'create',
      status: 'queued',
      executionState: 'idle',
    });
    expect(payload.plan.jobs.at(-1)).toMatchObject({
      attemptNumber: 1,
      action: 'create',
      status: 'queued',
    });
    expect(payload.receipt).toMatchObject({
      action: 'create',
      planStatus: 'draft',
    });
    expect(payload.plan.stages[0]).toHaveProperty('stageId');
    expect(payload.plan.stages[0]).toHaveProperty('title');
    expect(payload.plan.stages[0]).toHaveProperty('status', 'pending');
    expect(payload.plan.stages[0]).not.toHaveProperty('owner');
  });

  it('restores the latest durable planner on GET and updates stage status via PATCH', async () => {
    requireSessionMock.mockResolvedValue({
      id: 'editor-1',
      role: 'EDITOR',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });

    const { GET, POST, PATCH } = await import('@/app/api/ai-agents/route');
    const createResponse = await POST(
      new NextRequest('http://localhost/api/ai-agents', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-rey30-project': 'Star Forge',
        },
        body: JSON.stringify({
          prompt: 'Pipeline durable de personaje',
          level: 'level3_full_character',
        }),
      })
    );
    const createdPayload = await createResponse.json();

    const getResponse = await GET(
      new NextRequest('http://localhost/api/ai-agents?projectKey=star_forge')
    );
    const getPayload = await getResponse.json();

    expect(getResponse.status).toBe(200);
    expect(getPayload.activePlan).toHaveProperty('planId', createdPayload.plan.planId);
    expect(getPayload.activePlan.stages[0]).not.toHaveProperty('owner');
    expect(getPayload.activeExecution).toMatchObject({
      state: 'idle',
      nextStageId: 'prompt_interpretation',
    });
    expect(getPayload.activeJob).toMatchObject({
      attemptNumber: 1,
      action: 'create',
      status: 'queued',
    });
    expect(getPayload.activeReceipt).toMatchObject({
      action: 'create',
    });

    const patchResponse = await PATCH(
      new NextRequest('http://localhost/api/ai-agents', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-rey30-project': 'Star Forge',
        },
        body: JSON.stringify({
          planId: createdPayload.plan.planId,
          action: 'stage_status',
          stageId: 'prompt_interpretation',
          status: 'completed',
          resultSummary: 'Brief validado',
        }),
      })
    );
    const patchPayload = await patchResponse.json();

    expect(patchResponse.status).toBe(200);
    expect(patchPayload.plan.status).toBe('running');
    expect(patchPayload.plan.stages[0]).toEqual(
      expect.objectContaining({
        stageId: 'prompt_interpretation',
        status: 'completed',
        resultSummary: 'Brief validado',
      })
    );
    expect(patchPayload.execution).toMatchObject({
      state: 'running',
      currentStageId: null,
      nextStageId: expect.any(String),
      progressPercent: expect.any(Number),
    });
    expect(patchPayload.job).toMatchObject({
      attemptNumber: 1,
      action: 'stage_status',
      status: 'running',
      executionState: 'running',
    });
    expect(patchPayload.plan.receipts.at(-1)).toMatchObject({
      action: 'stage_status',
      stageId: 'prompt_interpretation',
      execution: {
        state: 'running',
      },
    });
    expect(patchPayload.plan.jobs.at(-1)).toMatchObject({
      attemptNumber: 1,
      action: 'stage_status',
      status: 'running',
    });
    expect(patchPayload.receipt).toMatchObject({
      action: 'stage_status',
      stageId: 'prompt_interpretation',
    });
    expect(patchPayload.plan.stages[0]).not.toHaveProperty('owner');
    expect(patchPayload.plan.events.at(-1)?.kind).toBe('stage_completed');
  });

  it('seals assistant-applied results via PATCH without exposing internal fields', async () => {
    requireSessionMock.mockResolvedValue({
      id: 'editor-1',
      role: 'EDITOR',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });

    const { PATCH, POST } = await import('@/app/api/ai-agents/route');
    const createResponse = await POST(
      new NextRequest('http://localhost/api/ai-agents', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-rey30-project': 'Star Forge',
        },
        body: JSON.stringify({
          prompt: 'Pipeline durable de personaje',
          level: 'level3_full_character',
        }),
      })
    );
    const createdPayload = await createResponse.json();

    const patchResponse = await PATCH(
      new NextRequest('http://localhost/api/ai-agents', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-rey30-project': 'Star Forge',
        },
        body: JSON.stringify({
          planId: createdPayload.plan.planId,
          action: 'assistant_apply',
          taskId: 'character_job_123',
          kind: 'character',
          backend: 'character-job',
          summary: 'El paquete del personaje quedó agregado al proyecto.',
          asset: {
            path: 'packages/hero_package.glb',
          },
        }),
      })
    );
    const patchPayload = await patchResponse.json();

    expect(patchResponse.status).toBe(200);
    expect(patchPayload.plan.assistantJobs.at(-1)).toMatchObject({
      taskId: 'character_job_123',
      resultStatus: 'applied',
      resultSummary: 'El paquete del personaje quedó agregado al proyecto.',
      asset: {
        path: 'packages/hero_package.glb',
      },
    });
    expect(patchPayload.plan.receipts.at(-1)).toMatchObject({
      action: 'assistant_apply',
      message: 'El paquete del personaje quedó agregado al proyecto.',
    });
    expect(patchPayload.receipt).toMatchObject({
      action: 'assistant_apply',
    });
    expect(patchPayload.plan.events.at(-1)?.kind).toBe('assistant_result_applied');
  });

  it('creates generic custom planners and updates custom tasks directly', async () => {
    requireSessionMock.mockResolvedValue({
      id: 'editor-1',
      role: 'EDITOR',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });

    const { PATCH, POST } = await import('@/app/api/ai-agents/route');
    const createResponse = await POST(
      new NextRequest('http://localhost/api/ai-agents', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-rey30-project': 'Star Forge',
        },
        body: JSON.stringify({
          prompt: 'Planner custom para P2',
          level: 'level1_copilot',
          customSummary: 'Custom planner smoke',
          customCheckpoints: ['Solo tareas custom aprobadas.'],
          customTasks: [
            {
              taskId: 'p2_task_custom_api',
              title: 'Custom API Task',
              summary: 'Validar creación genérica de custom planner.',
              priority: 'high',
              owner: 'technical_lead',
              evidenceRefs: ['api.create'],
              requiredDecisions: ['approved'],
              sourceBlockId: 'block-custom-api',
            },
          ],
        }),
      })
    );
    const createPayload = await createResponse.json();

    expect(createResponse.status).toBe(200);
    expect(createPayload.plan).toMatchObject({
      summary: 'Custom planner smoke',
      customTasks: [
        expect.objectContaining({
          taskId: 'p2_task_custom_api',
          stageId: 'custom_p2_task_custom_api',
          priority: 'high',
          sourceBlockId: 'block-custom-api',
          status: 'pending',
        }),
      ],
    });
    expect(createPayload.plan.stages).toHaveLength(1);
    expect(createPayload.plan.stages[0]).toMatchObject({
      stageId: 'custom_p2_task_custom_api',
      title: 'Custom API Task',
      status: 'pending',
    });

    const runningResponse = await PATCH(
      new NextRequest('http://localhost/api/ai-agents', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-rey30-project': 'Star Forge',
        },
        body: JSON.stringify({
          planId: createPayload.plan.planId,
          action: 'custom_task_status',
          taskId: 'p2_task_custom_api',
          status: 'running',
          resultSummary: 'Task custom iniciada directamente.',
        }),
      })
    );
    const runningPayload = await runningResponse.json();

    expect(runningResponse.status).toBe(200);
    expect(runningPayload.plan.customTasks[0]).toMatchObject({
      taskId: 'p2_task_custom_api',
      status: 'running',
      summary: 'Task custom iniciada directamente.',
    });
    expect(runningPayload.plan.stages[0]).toMatchObject({
      stageId: 'custom_p2_task_custom_api',
      status: 'running',
      resultSummary: 'Task custom iniciada directamente.',
    });
    expect(runningPayload.receipt).toMatchObject({
      action: 'custom_task_status',
      stageId: 'custom_p2_task_custom_api',
    });
    expect(runningPayload.plan.events.at(-1)).toMatchObject({
      kind: 'custom_task_running',
    });

    const metadataResponse = await PATCH(
      new NextRequest('http://localhost/api/ai-agents', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-rey30-project': 'Star Forge',
        },
        body: JSON.stringify({
          planId: createPayload.plan.planId,
          action: 'custom_task_metadata',
          taskId: 'p2_task_custom_api',
          title: 'Custom API Task Edited',
          summary: 'Validar metadata editada de custom planner.',
          owner: 'maintenance_agent',
          priority: 'low',
          sourceBlockId: 'block-custom-api-edited',
        }),
      })
    );
    const metadataPayload = await metadataResponse.json();

    expect(metadataResponse.status).toBe(200);
    expect(metadataPayload.plan.customTasks[0]).toMatchObject({
      taskId: 'p2_task_custom_api',
      title: 'Custom API Task Edited',
      summary: 'Validar metadata editada de custom planner.',
      status: 'running',
      owner: 'maintenance_agent',
      priority: 'low',
      sourceBlockId: 'block-custom-api-edited',
    });
    expect(metadataPayload.plan.customTasks[0].metadataHistory.map((entry: { field: string }) => entry.field)).toEqual([
      'title',
      'summary',
      'owner',
      'priority',
      'sourceBlockId',
    ]);
    expect(metadataPayload.receipt).toMatchObject({
      action: 'custom_task_metadata',
      stageId: 'custom_p2_task_custom_api',
    });
    expect(metadataPayload.plan.events.at(-1)).toMatchObject({
      kind: 'custom_task_updated',
    });

    const { GET: GET_CUSTOM_TASK_HISTORY } = await import(
      '@/app/api/ai-agents/custom-task-history/route'
    );
    const historyResponse = await GET_CUSTOM_TASK_HISTORY(
      new NextRequest(
        `http://localhost/api/ai-agents/custom-task-history?projectKey=Star%20Forge&planId=${createPayload.plan.planId}&taskId=p2_task_custom_api`
      )
    );
    const historyPayload = await historyResponse.json();

    expect(historyResponse.status).toBe(200);
    expect(historyPayload).not.toHaveProperty('plan');
    expect(historyPayload).not.toHaveProperty('activePlan');
    expect(historyPayload.task).toMatchObject({
      taskId: 'p2_task_custom_api',
      title: 'Custom API Task Edited',
    });
    expect(historyPayload.historyCount).toBe(5);
    expect(historyPayload.metadataHistory.map((entry: { field: string }) => entry.field)).toContain('title');

    const secondMetadataResponse = await PATCH(
      new NextRequest('http://localhost/api/ai-agents', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-rey30-project': 'Star Forge',
        },
        body: JSON.stringify({
          planId: createPayload.plan.planId,
          action: 'custom_task_metadata',
          taskId: 'p2_task_custom_api',
          title: 'Custom API Task Final',
        }),
      })
    );
    expect(secondMetadataResponse.status).toBe(200);

    const staleRevertResponse = await PATCH(
      new NextRequest('http://localhost/api/ai-agents', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-rey30-project': 'Star Forge',
        },
        body: JSON.stringify({
          planId: createPayload.plan.planId,
          action: 'custom_task_metadata_revert',
          taskId: 'p2_task_custom_api',
          historyEntryId: metadataPayload.plan.customTasks[0].metadataHistory[0].id,
        }),
      })
    );
    const staleRevertPayload = await staleRevertResponse.json();

    expect(staleRevertResponse.status).toBe(409);
    expect(staleRevertPayload).toMatchObject({
      code: 'STALE_METADATA_REVERT_REQUIRES_CONFIRMATION',
      blocker: {
        field: 'title',
        revertToValue: 'Custom API Task',
      },
    });

    const forbiddenRevertResponse = await PATCH(
      new NextRequest('http://localhost/api/ai-agents', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-rey30-project': 'Star Forge',
        },
        body: JSON.stringify({
          planId: createPayload.plan.planId,
          action: 'custom_task_metadata_revert',
          taskId: 'p2_task_custom_api',
          historyEntryId: metadataPayload.plan.customTasks[0].metadataHistory[0].id,
          confirmStaleRevert: true,
          staleRevertReason: 'Editor attempted to confirm stale revert.',
        }),
      })
    );
    const forbiddenRevertPayload = await forbiddenRevertResponse.json();

    expect(forbiddenRevertResponse.status).toBe(403);
    expect(forbiddenRevertPayload).toMatchObject({
      code: 'STALE_METADATA_REVERT_CONFIRMATION_FORBIDDEN',
      allowedRoles: ['OWNER'],
      requiredRole: 'OWNER',
      actualRole: 'EDITOR',
      policySnapshot: {
        policyId: 'stale_metadata_revert_confirmation_roles',
        source: 'env',
        envVarName: 'REY30_STALE_METADATA_REVERT_CONFIRM_ROLES',
        allowedRoles: ['OWNER'],
        evaluatedRole: 'EDITOR',
        allowed: false,
      },
      blocker: {
        field: 'title',
      },
    });

    requireSessionMock.mockResolvedValue({
      id: 'editor-1',
      role: 'OWNER',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });

    const missingReasonRevertResponse = await PATCH(
      new NextRequest('http://localhost/api/ai-agents', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-rey30-project': 'Star Forge',
        },
        body: JSON.stringify({
          planId: createPayload.plan.planId,
          action: 'custom_task_metadata_revert',
          taskId: 'p2_task_custom_api',
          historyEntryId: metadataPayload.plan.customTasks[0].metadataHistory[0].id,
          confirmStaleRevert: true,
        }),
      })
    );
    const missingReasonRevertPayload = await missingReasonRevertResponse.json();

    expect(missingReasonRevertResponse.status).toBe(400);
    expect(missingReasonRevertPayload).toMatchObject({
      code: 'STALE_METADATA_REVERT_REASON_REQUIRED',
      blocker: {
        field: 'title',
      },
    });

    const revertResponse = await PATCH(
      new NextRequest('http://localhost/api/ai-agents', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-rey30-project': 'Star Forge',
        },
        body: JSON.stringify({
          planId: createPayload.plan.planId,
          action: 'custom_task_metadata_revert',
          taskId: 'p2_task_custom_api',
          historyEntryId: metadataPayload.plan.customTasks[0].metadataHistory[0].id,
          confirmStaleRevert: true,
          staleRevertReason: 'Manual API confirmation after reviewing stale title changes.',
        }),
      })
    );
    const revertPayload = await revertResponse.json();

    expect(revertResponse.status).toBe(200);
    expect(revertPayload.plan.customTasks[0]).toMatchObject({
      taskId: 'p2_task_custom_api',
      title: 'Custom API Task',
      status: 'running',
    });
    expect(revertPayload.receipt).toMatchObject({
      action: 'custom_task_metadata_revert',
    });
    expect(revertPayload.plan.events.at(-1)).toMatchObject({
      kind: 'custom_task_metadata_reverted',
    });
    expect(revertPayload.plan.customTasks[0].metadataHistory.at(-1)).toMatchObject({
      staleRevertConfirmation: {
        confirmedByUserId: 'editor-1',
        confirmedByEmail: 'editor@example.com',
        reason: 'Manual API confirmation after reviewing stale title changes.',
        blocker: {
          field: 'title',
          revertToValue: 'Custom API Task',
        },
        policySnapshot: {
          policyId: 'stale_metadata_revert_confirmation_roles',
          source: 'env',
          allowedRoles: ['OWNER'],
          evaluatedRole: 'OWNER',
          allowed: true,
        },
      },
    });

    const { GET: GET_CUSTOM_TASK_HISTORY_EXPORT } = await import(
      '@/app/api/ai-agents/custom-task-history/export/route'
    );
    const exportJsonResponse = await GET_CUSTOM_TASK_HISTORY_EXPORT(
      new NextRequest(
        `http://localhost/api/ai-agents/custom-task-history/export?projectKey=Star%20Forge&planId=${createPayload.plan.planId}&taskId=p2_task_custom_api&format=json`
      )
    );
    const exportJsonPayload = JSON.parse(await exportJsonResponse.text());

    expect(exportJsonResponse.status).toBe(200);
    expect(exportJsonResponse.headers.get('content-disposition')).toContain('metadata-history.json');
    expect(exportJsonPayload).toMatchObject({
      kind: 'agent_planner_custom_task_metadata_history',
      reportVersion: 2,
      task: {
        taskId: 'p2_task_custom_api',
      },
    });
    expect(exportJsonPayload.metadataHistory.at(-1)).toMatchObject({
      staleRevertConfirmation: {
        confirmedByEmail: 'editor@example.com',
        reason: 'Manual API confirmation after reviewing stale title changes.',
      },
    });

    const exportMarkdownResponse = await GET_CUSTOM_TASK_HISTORY_EXPORT(
      new NextRequest(
        `http://localhost/api/ai-agents/custom-task-history/export?projectKey=Star%20Forge&planId=${createPayload.plan.planId}&taskId=p2_task_custom_api&format=markdown`
      )
    );
    const exportMarkdownPayload = await exportMarkdownResponse.text();

    expect(exportMarkdownResponse.status).toBe(200);
    expect(exportMarkdownResponse.headers.get('content-type')).toContain('text/markdown');
    expect(exportMarkdownPayload).toContain('# Custom Task Metadata History');
    expect(exportMarkdownPayload).toContain('staleRevert.confirmedByEmail: editor@example.com');
    expect(exportMarkdownPayload).toContain('Manual API confirmation after reviewing stale title changes.');
    expect(exportMarkdownPayload).toContain('staleRevert.policyAllowedRoles: OWNER');

    const summaryRevertResponse = await PATCH(
      new NextRequest('http://localhost/api/ai-agents', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-rey30-project': 'Star Forge',
        },
        body: JSON.stringify({
          planId: createPayload.plan.planId,
          action: 'custom_task_metadata_revert',
          taskId: 'p2_task_custom_api',
          historyEntryId: metadataPayload.plan.customTasks[0].metadataHistory[1].id,
        }),
      })
    );
    const summaryRevertPayload = await summaryRevertResponse.json();

    expect(summaryRevertResponse.status).toBe(200);
    expect(summaryRevertPayload.plan.customTasks[0].metadataHistory.at(-1)).toMatchObject({
      field: 'summary',
      source: 'metadata_revert',
    });

    const { GET: GET_CUSTOM_TASK_REVERT_AUDITS } = await import(
      '@/app/api/ai-agents/custom-task-history/revert-audits/route'
    );
    const auditsResponse = await GET_CUSTOM_TASK_REVERT_AUDITS(
      new NextRequest(
        `http://localhost/api/ai-agents/custom-task-history/revert-audits?projectKey=Star%20Forge&planId=${createPayload.plan.planId}&taskId=p2_task_custom_api`
      )
    );
    const auditsPayload = await auditsResponse.json();

    expect(auditsResponse.status).toBe(200);
    expect(auditsPayload).not.toHaveProperty('metadataHistory');
    expect(auditsPayload).toMatchObject({
      success: true,
      filter: 'all',
      auditCount: 2,
      totalAuditCount: 2,
      pagination: {
        limit: 50,
        offset: 0,
        total: 2,
        hasMore: false,
        nextOffset: null,
      },
      task: {
        taskId: 'p2_task_custom_api',
      },
    });
    expect(auditsPayload.audits[0]).toMatchObject({
      source: 'metadata_revert',
      staleRevertConfirmation: {
        confirmedByEmail: 'editor@example.com',
      },
    });

    const staleAuditsMarkdownResponse = await GET_CUSTOM_TASK_REVERT_AUDITS(
      new NextRequest(
        `http://localhost/api/ai-agents/custom-task-history/revert-audits?projectKey=Star%20Forge&planId=${createPayload.plan.planId}&taskId=p2_task_custom_api&filter=staleConfirmed&format=markdown&download=true`
      )
    );
    const staleAuditsMarkdownPayload = await staleAuditsMarkdownResponse.text();

    expect(staleAuditsMarkdownResponse.status).toBe(200);
    expect(staleAuditsMarkdownResponse.headers.get('content-disposition')).toContain(
      'metadata-revert-audits.md'
    );
    expect(staleAuditsMarkdownPayload).toContain('# Custom Task Metadata Revert Audits');
    expect(staleAuditsMarkdownPayload).toContain('Filter: staleConfirmed');
    expect(staleAuditsMarkdownPayload).toContain('confirmedByEmail: editor@example.com');

    const globalAuditsResponse = await GET_CUSTOM_TASK_REVERT_AUDITS(
      new NextRequest(
        `http://localhost/api/ai-agents/custom-task-history/revert-audits?projectKey=Star%20Forge&planId=${createPayload.plan.planId}&filter=staleConfirmed`
      )
    );
    const globalAuditsPayload = await globalAuditsResponse.json();

    expect(globalAuditsResponse.status).toBe(200);
    expect(globalAuditsPayload).toMatchObject({
      success: true,
      scope: 'planner',
      task: null,
      taskCount: 1,
      filter: 'staleConfirmed',
      auditCount: 1,
      totalAuditCount: 1,
      counts: {
        edits: 6,
        reverts: 2,
        staleConfirmed: 1,
      },
    });
    expect(globalAuditsPayload.audits[0]).toMatchObject({
      task: {
        taskId: 'p2_task_custom_api',
      },
      staleRevertConfirmation: {
        confirmedByEmail: 'editor@example.com',
      },
    });

    const globalAuditsJsonResponse = await GET_CUSTOM_TASK_REVERT_AUDITS(
      new NextRequest(
        `http://localhost/api/ai-agents/custom-task-history/revert-audits?projectKey=Star%20Forge&planId=${createPayload.plan.planId}&filter=all&limit=1&offset=0&format=json&download=true`
      )
    );
    const globalAuditsJsonPayload = JSON.parse(await globalAuditsJsonResponse.text());

    expect(globalAuditsJsonResponse.status).toBe(200);
    expect(globalAuditsJsonResponse.headers.get('content-disposition')).toContain(
      'planner-metadata-revert-audits.json'
    );
    expect(globalAuditsJsonPayload).toMatchObject({
      kind: 'agent_planner_custom_task_metadata_revert_audits',
      scope: 'planner',
      task: null,
      taskCount: 1,
      counts: {
        edits: 6,
        reverts: 2,
        staleConfirmed: 1,
      },
      exportScope: 'page',
      auditCount: 1,
      totalAuditCount: 2,
      pagination: {
        limit: 1,
        offset: 0,
        total: 2,
        hasMore: true,
        nextOffset: 1,
      },
    });

    const globalAuditsAllJsonResponse = await GET_CUSTOM_TASK_REVERT_AUDITS(
      new NextRequest(
        `http://localhost/api/ai-agents/custom-task-history/revert-audits?projectKey=Star%20Forge&planId=${createPayload.plan.planId}&filter=all&limit=1&offset=0&exportScope=all&format=json&download=true`
      )
    );
    const globalAuditsAllJsonPayload = JSON.parse(await globalAuditsAllJsonResponse.text());

    expect(globalAuditsAllJsonResponse.status).toBe(200);
    expect(globalAuditsAllJsonPayload).toMatchObject({
      kind: 'agent_planner_custom_task_metadata_revert_audits',
      scope: 'planner',
      exportScope: 'all',
      auditCount: 2,
      totalAuditCount: 2,
      pagination: {
        limit: 2,
        offset: 0,
        total: 2,
        hasMore: false,
        nextOffset: null,
      },
    });

    const secondPageAuditsResponse = await GET_CUSTOM_TASK_REVERT_AUDITS(
      new NextRequest(
        `http://localhost/api/ai-agents/custom-task-history/revert-audits?projectKey=Star%20Forge&planId=${createPayload.plan.planId}&filter=all&limit=1&offset=1`
      )
    );
    const secondPageAuditsPayload = await secondPageAuditsResponse.json();

    expect(secondPageAuditsResponse.status).toBe(200);
    expect(secondPageAuditsPayload).toMatchObject({
      auditCount: 1,
      totalAuditCount: 2,
      pagination: {
        limit: 1,
        offset: 1,
        total: 2,
        hasMore: false,
        nextOffset: null,
      },
    });

    const failedResponse = await PATCH(
      new NextRequest('http://localhost/api/ai-agents', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-rey30-project': 'Star Forge',
        },
        body: JSON.stringify({
          planId: createPayload.plan.planId,
          action: 'custom_task_status',
          taskId: 'p2_task_custom_api',
          status: 'failed',
          resultSummary: 'Task custom falló directamente.',
        }),
      })
    );
    const failedPayload = await failedResponse.json();

    expect(failedResponse.status).toBe(200);
    expect(failedPayload.plan.customTasks[0]).toMatchObject({
      taskId: 'p2_task_custom_api',
      status: 'failed',
      summary: 'Task custom falló directamente.',
    });
    expect(failedPayload.plan.status).toBe('failed');
    expect(failedPayload.plan.events.at(-1)).toMatchObject({
      kind: 'custom_task_failed',
    });
  });

  it('rejects empty prompts with a lab-safe message', async () => {
    requireSessionMock.mockResolvedValue({
      id: 'editor-1',
      role: 'EDITOR',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });

    const { POST } = await import('@/app/api/ai-agents/route');
    const response = await POST(
      new NextRequest('http://localhost/api/ai-agents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: '   ' }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe('Describe el objetivo del laboratorio para generar el plan.');
  });
});
