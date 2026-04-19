import { NextRequest, NextResponse } from 'next/server';
import { normalizeProjectKey } from '@/lib/project-key';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import { readAIAgentPlannerRecord } from '@/lib/server/ai-agent-plan-storage';

function resolveProjectKey(request: NextRequest) {
  return normalizeProjectKey(
    request.headers.get('x-rey30-project') ||
      request.nextUrl.searchParams.get('projectKey') ||
      undefined
  );
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession(request, 'EDITOR');
    const projectKey = resolveProjectKey(request);
    const planId = request.nextUrl.searchParams.get('planId')?.trim();
    const taskId = request.nextUrl.searchParams.get('taskId')?.trim();

    if (!planId || !taskId) {
      return NextResponse.json(
        {
          success: false,
          error: 'planId y taskId son requeridos para consultar historial de custom task.',
        },
        { status: 400 }
      );
    }

    const plan = readAIAgentPlannerRecord({
      userId: user.id,
      projectKey,
      planId,
    });
    if (!plan) {
      return NextResponse.json(
        {
          success: false,
          error: 'No se encontró el planner solicitado.',
        },
        { status: 404 }
      );
    }

    const task = (plan.customTasks ?? []).find((entry) => entry.taskId === taskId);
    if (!task) {
      return NextResponse.json(
        {
          success: false,
          error: 'No se encontró la custom task solicitada.',
        },
        { status: 404 }
      );
    }

    const metadataHistory = (task.metadataHistory ?? []).map((entry) => ({ ...entry }));
    return NextResponse.json({
      success: true,
      projectKey,
      planId: plan.planId,
      task: {
        taskId: task.taskId,
        stageId: task.stageId,
        title: task.title,
        summary: task.summary,
        owner: task.owner,
        priority: task.priority,
        sourceBlockId: task.sourceBlockId,
        status: task.status,
        updatedAt: task.updatedAt,
      },
      historyCount: metadataHistory.length,
      metadataHistory,
    });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    return NextResponse.json(
      {
        success: false,
        error: 'No se pudo consultar el historial de metadata de la custom task.',
      },
      { status: 500 }
    );
  }
}
