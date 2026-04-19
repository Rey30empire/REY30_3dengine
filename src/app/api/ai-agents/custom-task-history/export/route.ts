import { NextRequest, NextResponse } from 'next/server';
import {
  createCustomTaskMetadataHistoryReport,
  createCustomTaskMetadataHistoryReportFilename,
  type CustomTaskMetadataHistoryReportFormat,
} from '@/engine/ai/agentPlannerMetadataHistoryReport';
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

function resolveFormat(value: string | null): CustomTaskMetadataHistoryReportFormat | null {
  if (!value || value === 'json') {
    return 'json';
  }
  if (value === 'markdown' || value === 'md') {
    return 'markdown';
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession(request, 'EDITOR');
    const projectKey = resolveProjectKey(request);
    const planId = request.nextUrl.searchParams.get('planId')?.trim();
    const taskId = request.nextUrl.searchParams.get('taskId')?.trim();
    const format = resolveFormat(request.nextUrl.searchParams.get('format'));

    if (!planId || !taskId) {
      return NextResponse.json(
        {
          success: false,
          error: 'planId y taskId son requeridos para exportar historial de custom task.',
        },
        { status: 400 }
      );
    }
    if (!format) {
      return NextResponse.json(
        {
          success: false,
          error: 'format debe ser json o markdown.',
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

    const content = createCustomTaskMetadataHistoryReport({
      projectKey,
      planId: plan.planId,
      task: {
        taskId: task.taskId,
        title: task.title,
        summary: task.summary,
        owner: task.owner,
        priority: task.priority,
        sourceBlockId: task.sourceBlockId,
        status: task.status,
      },
      metadataHistory: task.metadataHistory ?? [],
      format,
    });
    const filename = createCustomTaskMetadataHistoryReportFilename({
      projectKey,
      planId: plan.planId,
      taskId: task.taskId,
      format,
    });
    const contentType = format === 'json' ? 'application/json' : 'text/markdown';

    return new NextResponse(content, {
      status: 200,
      headers: {
        'content-type': `${contentType}; charset=utf-8`,
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    return NextResponse.json(
      {
        success: false,
        error: 'No se pudo exportar el historial de metadata de la custom task.',
      },
      { status: 500 }
    );
  }
}
