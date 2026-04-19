import { NextRequest, NextResponse } from 'next/server';
import {
  countCustomTaskMetadataHistory,
  createCustomTaskMetadataRevertAuditReport,
  createCustomTaskMetadataRevertAuditReportFilename,
  filterCustomTaskMetadataRevertAudits,
  sumCustomTaskMetadataHistoryCounts,
  type CustomTaskMetadataHistoryReportFormat,
  type CustomTaskMetadataHistoryReportTask,
  type CustomTaskMetadataRevertAuditEntry,
  type CustomTaskMetadataRevertAuditFilter,
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
  if (!value) {
    return null;
  }
  if (value === 'json') {
    return 'json';
  }
  if (value === 'markdown' || value === 'md') {
    return 'markdown';
  }
  return null;
}

function resolveAuditFilter(value: string | null): CustomTaskMetadataRevertAuditFilter | null {
  if (!value || value === 'all') {
    return 'all';
  }
  if (value === 'staleConfirmed') {
    return 'staleConfirmed';
  }
  return null;
}

function resolveExportScope(value: string | null): 'page' | 'all' | null {
  if (!value || value === 'page') {
    return 'page';
  }
  if (value === 'all') {
    return 'all';
  }
  return null;
}

function resolvePagination(searchParams: URLSearchParams) {
  const rawLimit = searchParams.get('limit');
  const rawOffset = searchParams.get('offset');
  const parsedLimit = rawLimit ? Number.parseInt(rawLimit, 10) : 50;
  const parsedOffset = rawOffset ? Number.parseInt(rawOffset, 10) : 0;

  if (!Number.isFinite(parsedLimit) || parsedLimit < 1) {
    return {
      error: 'limit debe ser un entero mayor o igual a 1.',
    };
  }
  if (!Number.isFinite(parsedOffset) || parsedOffset < 0) {
    return {
      error: 'offset debe ser un entero mayor o igual a 0.',
    };
  }

  return {
    limit: Math.min(parsedLimit, 250),
    offset: parsedOffset,
  };
}

function toReportTask(task: {
  taskId: string;
  title: string;
  summary: string;
  owner: string;
  priority: CustomTaskMetadataHistoryReportTask['priority'];
  sourceBlockId: string | null;
  status: CustomTaskMetadataHistoryReportTask['status'];
}): CustomTaskMetadataHistoryReportTask {
  return {
    taskId: task.taskId,
    title: task.title,
    summary: task.summary,
    owner: task.owner,
    priority: task.priority,
    sourceBlockId: task.sourceBlockId,
    status: task.status,
  };
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession(request, 'EDITOR');
    const projectKey = resolveProjectKey(request);
    const planId = request.nextUrl.searchParams.get('planId')?.trim();
    const taskId = request.nextUrl.searchParams.get('taskId')?.trim();
    const format = resolveFormat(request.nextUrl.searchParams.get('format'));
    const filter = resolveAuditFilter(request.nextUrl.searchParams.get('filter'));
    const download = request.nextUrl.searchParams.get('download') === 'true';
    const exportScope = resolveExportScope(request.nextUrl.searchParams.get('exportScope'));
    const paginationInput = resolvePagination(request.nextUrl.searchParams);

    if (!planId) {
      return NextResponse.json(
        {
          success: false,
          error: 'planId es requerido para consultar auditorías de revert.',
        },
        { status: 400 }
      );
    }
    if (!filter) {
      return NextResponse.json(
        {
          success: false,
          error: 'filter debe ser all o staleConfirmed.',
        },
        { status: 400 }
      );
    }
    if (request.nextUrl.searchParams.has('format') && !format) {
      return NextResponse.json(
        {
          success: false,
          error: 'format debe ser json o markdown.',
        },
        { status: 400 }
      );
    }
    if (request.nextUrl.searchParams.has('exportScope') && !exportScope) {
      return NextResponse.json(
        {
          success: false,
          error: 'exportScope debe ser page o all.',
        },
        { status: 400 }
      );
    }
    if ('error' in paginationInput) {
      return NextResponse.json(
        {
          success: false,
          error: paginationInput.error,
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

    const customTasks = plan.customTasks ?? [];
    const matchingTask = taskId
      ? customTasks.find((entry) => entry.taskId === taskId)
      : null;
    if (taskId && !matchingTask) {
      return NextResponse.json(
        {
          success: false,
          error: 'No se encontró la custom task solicitada.',
        },
        { status: 404 }
      );
    }

    const taskSummaries = (matchingTask ? [matchingTask] : customTasks).map((task) => ({
      task: toReportTask(task),
      counts: countCustomTaskMetadataHistory(task.metadataHistory ?? []),
    }));
    const counts = sumCustomTaskMetadataHistoryCounts(taskSummaries.map((entry) => entry.counts));
    const allAudits: CustomTaskMetadataRevertAuditEntry[] = filterCustomTaskMetadataRevertAudits(
      (matchingTask ? [matchingTask] : customTasks).flatMap((task) => {
        const reportTask = toReportTask(task);
        return (task.metadataHistory ?? []).map((entry) => ({
          ...entry,
          task: reportTask,
        }));
      }),
      filter
    );
    const pagination = {
      limit: paginationInput.limit,
      offset: paginationInput.offset,
      total: allAudits.length,
      hasMore: paginationInput.offset + paginationInput.limit < allAudits.length,
      nextOffset:
        paginationInput.offset + paginationInput.limit < allAudits.length
          ? paginationInput.offset + paginationInput.limit
          : null,
    };
    const audits = allAudits.slice(
      paginationInput.offset,
      paginationInput.offset + paginationInput.limit
    );
    const scope = matchingTask ? 'task' : 'planner';
    const reportTask = matchingTask ? toReportTask(matchingTask) : null;

    if (!format) {
      return NextResponse.json({
        success: true,
        projectKey,
        planId: plan.planId,
        scope,
        task: reportTask,
        taskCount: matchingTask ? 1 : customTasks.length,
        counts,
        filter,
        auditCount: audits.length,
        totalAuditCount: allAudits.length,
        pagination,
        audits,
      });
    }

    const content = createCustomTaskMetadataRevertAuditReport({
      projectKey,
      planId: plan.planId,
      scope,
      task: reportTask,
      taskCount: matchingTask ? 1 : customTasks.length,
      counts,
      audits: exportScope === 'all' ? allAudits : audits,
      totalAuditCount: allAudits.length,
      pagination:
        exportScope === 'all'
          ? {
              limit: allAudits.length,
              offset: 0,
              total: allAudits.length,
              hasMore: false,
              nextOffset: null,
            }
          : pagination,
      exportScope: exportScope ?? 'page',
      filter,
      format,
    });
    const filename = createCustomTaskMetadataRevertAuditReportFilename({
      projectKey,
      planId: plan.planId,
      taskId: matchingTask?.taskId,
      format,
    });
    const contentType = format === 'json' ? 'application/json' : 'text/markdown';
    const headers: Record<string, string> = {
      'content-type': `${contentType}; charset=utf-8`,
      'cache-control': 'no-store',
    };
    if (download) {
      headers['content-disposition'] = `attachment; filename="${filename}"`;
    }

    return new NextResponse(content, {
      status: 200,
      headers,
    });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    return NextResponse.json(
      {
        success: false,
        error: 'No se pudieron consultar las auditorías de revert de metadata.',
      },
      { status: 500 }
    );
  }
}
