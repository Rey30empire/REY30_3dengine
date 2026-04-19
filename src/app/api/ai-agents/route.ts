// ============================================
// AI Agent Levels API
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import {
  AGENT_LEVELS,
  CHARACTER_PIPELINE,
  type AgentLevelId,
  type AgentStageId,
} from '@/engine/ai/agent-levels';
import {
  applyAgentPlannerAssistantResult,
  applyAgentPlannerCustomTaskMetadataRevert,
  applyAgentPlannerCustomTaskMetadataUpdate,
  addAgentPlannerCheckpoint,
  applyAgentPlannerCustomTaskUpdate,
  applyAgentPlannerStageUpdate,
  cancelAgentPlanner,
  createAgentPlannerRecord,
  deriveAgentExecutionRecord,
  getLatestAgentPlannerJob,
  findAgentPlannerCustomTaskMetadataRevertBlocker,
  findAgentPlannerCustomTaskMetadataStaleRevert,
  resumeAgentPlanner,
  toClientAgentPlannerPlan,
  type AgentPlannerReceipt,
  type AgentPlannerRecord,
  type AgentPlannerCustomStageInput,
  type AgentPlannerCustomTaskInput,
  type AgentPlannerCustomTaskPriority,
  type AgentPlannerStageId,
  type AgentPlannerStageStatus,
} from '@/engine/ai/agentPlanner';
import { normalizeProjectKey } from '@/lib/project-key';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import {
  createStaleMetadataRevertPolicySnapshot,
} from '@/lib/server/stale-metadata-revert-policy';
import {
  readAIAgentPlannerRecord,
  readLatestAIAgentPlannerRecord,
  withAIAgentPlanWriteLock,
  writeAIAgentPlannerRecord,
  updateAIAgentPlannerRecord,
} from '@/lib/server/ai-agent-plan-storage';

type PlanRequestBody = {
  prompt?: string;
  level?: AgentLevelId;
  style?: string;
  target?: string;
  rigRequired?: boolean;
  customSummary?: string;
  customCheckpoints?: string[];
  customStages?: AgentPlannerCustomStageInput[];
  customTasks?: AgentPlannerCustomTaskInput[];
};

type PlanPatchRequestBody =
  | {
      planId?: string;
      action?: 'resume';
    }
  | {
      planId?: string;
      action?: 'stage_status';
      stageId?: AgentPlannerStageId;
      status?: AgentPlannerStageStatus;
      note?: string;
      resultSummary?: string;
    }
  | {
      planId?: string;
      action?: 'custom_task_status';
      taskId?: string;
      status?: AgentPlannerStageStatus;
      note?: string;
      resultSummary?: string;
    }
  | {
      planId?: string;
      action?: 'custom_task_metadata';
      taskId?: string;
      title?: string | null;
      summary?: string | null;
      owner?: string | null;
      priority?: AgentPlannerCustomTaskPriority | null;
      sourceBlockId?: string | null;
    }
  | {
      planId?: string;
      action?: 'custom_task_metadata_revert';
      taskId?: string;
      historyEntryId?: string;
      confirmStaleRevert?: boolean;
      staleRevertReason?: string | null;
    }
  | {
      planId?: string;
      action?: 'checkpoint';
      checkpoint?: string;
    }
  | {
      planId?: string;
      action?: 'assistant_apply';
      taskId?: string;
      kind?: 'video' | 'model3d' | 'character';
      backend?: 'openai-video' | 'runway-video' | 'meshy-model' | 'character-job';
      summary?: string;
      asset?: {
        url?: string;
        thumbnailUrl?: string;
        path?: string;
      } | null;
    }
  | {
      planId?: string;
      action?: 'cancel';
      note?: string;
    };

function toClientLevels() {
  return AGENT_LEVELS.map(({ id, name, goal, inputs, outputs }) => ({
    id,
    name,
    goal,
    inputs,
    outputs,
  }));
}

function toClientWorkflowStages() {
  return CHARACTER_PIPELINE.map(({ id, title }) => ({
    id,
    title,
  }));
}

function resolveProjectKey(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  return normalizeProjectKey(
    request.headers.get('x-rey30-project') || searchParams.get('projectKey') || undefined
  );
}

function isStageStatus(value: unknown): value is AgentPlannerStageStatus {
  return (
    value === 'pending' ||
    value === 'running' ||
    value === 'completed' ||
    value === 'failed' ||
    value === 'skipped'
  );
}

function isCustomTaskPriority(value: unknown): value is AgentPlannerCustomTaskPriority {
  return value === 'low' || value === 'medium' || value === 'high';
}

function getLatestReceipt(plan: AgentPlannerRecord | null): AgentPlannerReceipt | null {
  return plan?.receipts?.at(-1) ?? null;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession(request, 'EDITOR');
    const { searchParams } = new URL(request.url);
    const projectKey = resolveProjectKey(request);
    const planId = (searchParams.get('planId') || '').trim();
    const activePlan = planId
      ? readAIAgentPlannerRecord({ userId: user.id, projectKey, planId })
      : readLatestAIAgentPlannerRecord({ userId: user.id, projectKey });

    return NextResponse.json({
      levels: toClientLevels(),
      workflowStages: toClientWorkflowStages(),
      activePlan: activePlan ? toClientAgentPlannerPlan(activePlan) : null,
      activeExecution: activePlan ? deriveAgentExecutionRecord(activePlan) : null,
      activeJob: getLatestAgentPlannerJob(activePlan),
      activeReceipt: getLatestReceipt(activePlan),
    });
  } catch (error) {
    return authErrorToResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSession(request, 'EDITOR');
    const body = (await request.json()) as PlanRequestBody;
    const prompt = (body.prompt || '').trim();

    if (!prompt) {
      return NextResponse.json(
        { error: 'Describe el objetivo del laboratorio para generar el plan.' },
        { status: 400 }
      );
    }

    const projectKey = resolveProjectKey(request);
    const plan = createAgentPlannerRecord({
      planId: crypto.randomUUID(),
      projectKey,
      prompt,
      level: body.level || 'level1_copilot',
      style: body.style,
      target: body.target,
      rigRequired: body.rigRequired,
      customSummary: body.customSummary,
      customCheckpoints: body.customCheckpoints,
      customStages: body.customStages,
      customTasks: body.customTasks,
    });

    await withAIAgentPlanWriteLock({
      userId: user.id,
      projectKey,
      work: async () =>
        writeAIAgentPlannerRecord({
          userId: user.id,
          projectKey,
          plan,
        }),
    });

    return NextResponse.json({
      success: true,
      plan: toClientAgentPlannerPlan(plan),
      execution: deriveAgentExecutionRecord(plan),
      job: getLatestAgentPlannerJob(plan),
      receipt: getLatestReceipt(plan),
    });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    return NextResponse.json(
      { error: 'No se pudo generar el plan del laboratorio.' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireSession(request, 'EDITOR');
    const body = (await request.json()) as PlanPatchRequestBody;
    const planId = (body.planId || '').trim();
    if (!planId) {
      return NextResponse.json(
        { error: 'planId es requerido para actualizar el planner.' },
        { status: 400 }
      );
    }

    const projectKey = resolveProjectKey(request);
    let updated: AgentPlannerRecord | null = null;

    switch (body.action) {
      case 'resume':
        updated = await updateAIAgentPlannerRecord({
          userId: user.id,
          projectKey,
          planId,
          update: (current) => resumeAgentPlanner(current),
        });
        break;
      case 'stage_status':
        if (!body.stageId || !isStageStatus(body.status)) {
          return NextResponse.json(
            { error: 'stageId y status válidos son requeridos.' },
            { status: 400 }
          );
        }
        {
          const stageId = body.stageId;
          const stageStatus = body.status;
        updated = await updateAIAgentPlannerRecord({
          userId: user.id,
          projectKey,
          planId,
          update: (current) =>
            applyAgentPlannerStageUpdate(current, {
              stageId,
              status: stageStatus,
              note: body.note?.trim() || null,
              resultSummary: body.resultSummary?.trim() || null,
            }),
        });
        }
        break;
      case 'custom_task_status':
        if (!body.taskId?.trim() || !isStageStatus(body.status)) {
          return NextResponse.json(
            { error: 'taskId y status válidos son requeridos para actualizar custom task.' },
            { status: 400 }
          );
        }
        {
          const taskId = body.taskId.trim();
          const taskStatus = body.status;
          updated = await updateAIAgentPlannerRecord({
            userId: user.id,
            projectKey,
            planId,
            update: (current) =>
              applyAgentPlannerCustomTaskUpdate(current, {
                taskId,
                status: taskStatus,
                note: body.note?.trim() || null,
                resultSummary: body.resultSummary?.trim() || null,
              }),
          });
        }
        break;
      case 'custom_task_metadata':
        if (!body.taskId?.trim()) {
          return NextResponse.json(
            { error: 'taskId es requerido para editar metadata de custom task.' },
            { status: 400 }
          );
        }
        if (body.priority !== undefined && body.priority !== null && !isCustomTaskPriority(body.priority)) {
          return NextResponse.json(
            { error: 'priority debe ser low, medium o high.' },
            { status: 400 }
          );
        }
        if (body.title !== undefined && (!body.title || body.title.trim().length < 3)) {
          return NextResponse.json(
            { error: 'title debe tener al menos 3 caracteres.' },
            { status: 400 }
          );
        }
        if (body.summary !== undefined && (!body.summary || body.summary.trim().length < 3)) {
          return NextResponse.json(
            { error: 'summary debe tener al menos 3 caracteres.' },
            { status: 400 }
          );
        }
        {
          const taskId = body.taskId.trim();
          updated = await updateAIAgentPlannerRecord({
            userId: user.id,
            projectKey,
            planId,
            update: (current) =>
              applyAgentPlannerCustomTaskMetadataUpdate(current, {
                taskId,
                title: body.title,
                summary: body.summary,
                owner: body.owner,
                priority: body.priority,
                sourceBlockId: body.sourceBlockId,
              }),
          });
        }
        break;
      case 'custom_task_metadata_revert':
        if (!body.taskId?.trim() || !body.historyEntryId?.trim()) {
          return NextResponse.json(
            { error: 'taskId e historyEntryId son requeridos para revertir metadata.' },
            { status: 400 }
          );
        }
        {
          const taskId = body.taskId.trim();
          const historyEntryId = body.historyEntryId.trim();
          const current = readAIAgentPlannerRecord({ userId: user.id, projectKey, planId });
          if (!current) {
            updated = null;
            break;
          }
          const staleBlocker = findAgentPlannerCustomTaskMetadataStaleRevert(current, {
            taskId,
            historyEntryId,
          });
          const blocker = findAgentPlannerCustomTaskMetadataRevertBlocker(current, {
            taskId,
            historyEntryId,
            confirmStaleRevert: body.confirmStaleRevert === true,
          });
          if (blocker) {
            return NextResponse.json(
              {
                success: false,
                code: blocker.code,
                error: blocker.message,
                blocker,
              },
              { status: 409 }
            );
          }
          const staleRevertPolicySnapshot = createStaleMetadataRevertPolicySnapshot({
            evaluatedRole: user.role,
          });
          if (staleBlocker && body.confirmStaleRevert === true && !staleRevertPolicySnapshot.allowed) {
            return NextResponse.json(
              {
                success: false,
                code: 'STALE_METADATA_REVERT_CONFIRMATION_FORBIDDEN',
                error: `Solo estos roles pueden confirmar un revert obsoleto de metadata: ${staleRevertPolicySnapshot.allowedRoles.join(', ')}.`,
                allowedRoles: staleRevertPolicySnapshot.allowedRoles,
                requiredRole: staleRevertPolicySnapshot.allowedRoles[0],
                actualRole: user.role,
                policySnapshot: staleRevertPolicySnapshot,
                blocker: staleBlocker,
              },
              { status: 403 }
            );
          }
          const staleRevertReason = body.staleRevertReason?.trim() || '';
          if (staleBlocker && body.confirmStaleRevert === true && staleRevertReason.length < 8) {
            return NextResponse.json(
              {
                success: false,
                code: 'STALE_METADATA_REVERT_REASON_REQUIRED',
                error: 'Un revert obsoleto confirmado requiere un motivo de auditoría de al menos 8 caracteres.',
                blocker: staleBlocker,
              },
              { status: 400 }
            );
          }
          updated = await updateAIAgentPlannerRecord({
            userId: user.id,
            projectKey,
            planId,
            update: (current) =>
              applyAgentPlannerCustomTaskMetadataRevert(current, {
                taskId,
                historyEntryId,
                confirmStaleRevert: body.confirmStaleRevert === true,
                staleRevertConfirmation:
                  staleBlocker && body.confirmStaleRevert === true
                    ? {
                        confirmedByUserId: user.id,
                        confirmedByEmail: user.email,
                        reason: staleRevertReason,
                        blocker: staleBlocker,
                        policySnapshot: staleRevertPolicySnapshot,
                      }
                    : undefined,
              }),
          });
        }
        break;
      case 'checkpoint':
        if (!body.checkpoint?.trim()) {
          return NextResponse.json(
            { error: 'checkpoint es requerido para registrar un hito.' },
            { status: 400 }
          );
        }
        {
          const checkpoint = body.checkpoint.trim();
        updated = await updateAIAgentPlannerRecord({
          userId: user.id,
          projectKey,
          planId,
          update: (current) => addAgentPlannerCheckpoint(current, checkpoint),
        });
        }
        break;
      case 'assistant_apply':
        if (!body.taskId?.trim()) {
          return NextResponse.json(
            { error: 'taskId es requerido para sellar la aplicación del resultado AI.' },
            { status: 400 }
          );
        }
        {
          const taskId = body.taskId.trim();
          updated = await updateAIAgentPlannerRecord({
            userId: user.id,
            projectKey,
            planId,
            update: (current) =>
              applyAgentPlannerAssistantResult(current, {
                taskId,
                kind: body.kind,
                backend: body.backend,
                summary: body.summary?.trim() || null,
                asset:
                  body.asset && typeof body.asset === 'object'
                    ? {
                        url:
                          typeof body.asset.url === 'string' ? body.asset.url : undefined,
                        thumbnailUrl:
                          typeof body.asset.thumbnailUrl === 'string'
                            ? body.asset.thumbnailUrl
                            : undefined,
                        path:
                          typeof body.asset.path === 'string' ? body.asset.path : undefined,
                      }
                    : null,
              }),
          });
        }
        break;
      case 'cancel':
        updated = await updateAIAgentPlannerRecord({
          userId: user.id,
          projectKey,
          planId,
          update: (current) => cancelAgentPlanner(current, body.note),
        });
        break;
      default:
        return NextResponse.json(
          { error: 'Acción de planner no soportada.' },
          { status: 400 }
        );
    }

    if (!updated) {
      return NextResponse.json(
        { error: 'No se encontró el plan solicitado.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      plan: toClientAgentPlannerPlan(updated),
      execution: deriveAgentExecutionRecord(updated),
      job: getLatestAgentPlannerJob(updated),
      receipt: getLatestReceipt(updated),
    });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    return NextResponse.json(
      { error: 'No se pudo actualizar el planner de agentes.' },
      { status: 500 }
    );
  }
}
