import { NextRequest, NextResponse } from 'next/server';
import {
  deriveAgentExecutionRecord,
  getLatestAgentPlannerJob,
  toClientAgentPlannerPlan,
} from '@/engine/ai/agentPlanner';
import { DEFAULT_EDITOR_PROJECT_SAVE_SLOT } from '@/engine/serialization';
import { normalizeProjectKey } from '@/lib/project-key';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import {
  createReviewReanalysisJob,
  createPlannerFromApprovedReviewScope,
  decideReviewReanalysisBlock,
  listReviewReanalysisJobs,
  readReviewReanalysisJob,
  ReviewReanalysisJobError,
  retryReviewReanalysisJob,
  scheduleReviewReanalysisJob,
  type ReviewReanalysisBlockDecisionStatus,
} from '@/lib/server/review-reanalysis-jobs';

function readProjectKey(request: NextRequest, fallback: string | null | undefined) {
  return normalizeProjectKey(
    request.headers.get('x-rey30-project') ||
      request.nextUrl.searchParams.get('projectKey') ||
      fallback
  );
}

function readSlot(request: NextRequest, fallback?: string | null) {
  return (
    request.nextUrl.searchParams.get('slot')?.trim() ||
    fallback?.trim() ||
    DEFAULT_EDITOR_PROJECT_SAVE_SLOT
  );
}

function isAuthError(error: unknown) {
  const value = String(error || '');
  return value.includes('UNAUTHORIZED') || value.includes('FORBIDDEN');
}

function isReviewBlockDecision(value: unknown): value is ReviewReanalysisBlockDecisionStatus {
  return value === 'approved' || value === 'rejected' || value === 'deferred';
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSession(request, 'EDITOR');
    const body = (await request.json().catch(() => ({}))) as {
      projectKey?: string;
      slot?: string;
      originalDocuments?: unknown;
      documents?: unknown;
      detectedScope?: unknown;
      scope?: unknown;
      reason?: string | null;
    };

    const projectKey = readProjectKey(request, body.projectKey);
    const slot = readSlot(request, body.slot);
    const job = createReviewReanalysisJob({
      userId: user.id,
      projectKey,
      slot,
      originalDocuments: body.originalDocuments ?? body.documents,
      detectedScope: body.detectedScope ?? body.scope,
      reason: body.reason,
      requestedBy: user.email || user.id,
    });

    scheduleReviewReanalysisJob({
      userId: user.id,
      projectKey: job.projectKey,
      jobId: job.id,
    });

    return NextResponse.json(
      {
        success: true,
        accepted: true,
        nonBlocking: true,
        projectKey: job.projectKey,
        slot: job.slot,
        job,
        statusUrl: `/api/assistant/reanalysis?projectKey=${encodeURIComponent(job.projectKey)}&slot=${encodeURIComponent(job.slot)}&jobId=${encodeURIComponent(job.id)}`,
      },
      { status: 202 }
    );
  } catch (error) {
    if (isAuthError(error)) {
      return authErrorToResponse(error);
    }
    if (error instanceof ReviewReanalysisJobError) {
      return NextResponse.json(
        {
          success: false,
          code: error.code,
          error: error.message,
        },
        { status: error.status }
      );
    }
    return NextResponse.json(
      {
        success: false,
        error: 'No se pudo crear el job de reanálisis.',
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession(request, 'EDITOR');
    const projectKey = readProjectKey(request, null);
    const jobId = request.nextUrl.searchParams.get('jobId')?.trim();

    if (jobId) {
      const job = readReviewReanalysisJob({
        userId: user.id,
        projectKey,
        jobId,
      });
      if (!job) {
        return NextResponse.json(
          {
            success: false,
            code: 'REANALYSIS_JOB_NOT_FOUND',
            error: 'No existe ese job de reanálisis.',
          },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        projectKey,
        job,
      });
    }

    const limit = Number(request.nextUrl.searchParams.get('limit') || 25);
    const jobs = listReviewReanalysisJobs({
      userId: user.id,
      projectKey,
      limit: Number.isFinite(limit) ? limit : 25,
    });

    return NextResponse.json({
      success: true,
      projectKey,
      jobs,
      count: jobs.length,
    });
  } catch (error) {
    if (isAuthError(error)) {
      return authErrorToResponse(error);
    }
    return NextResponse.json(
      {
        success: false,
        error: 'No se pudo consultar jobs de reanálisis.',
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireSession(request, 'EDITOR');
    const body = (await request.json().catch(() => ({}))) as {
      action?: 'retry' | 'reprocess' | 'decide_block' | 'create_planner_from_approved_scope';
      projectKey?: string;
      slot?: string;
      jobId?: string;
      blockId?: string;
      decision?: unknown;
      note?: string | null;
      force?: boolean;
      forceNew?: boolean;
      staleAfterMs?: number;
      approvedBlockIds?: unknown;
    };
    const projectKey = readProjectKey(request, body.projectKey);
    const jobId = body.jobId?.trim();
    if (!jobId) {
      return NextResponse.json(
        {
          success: false,
          code: 'REANALYSIS_JOB_ID_REQUIRED',
          error: 'jobId es requerido para actualizar un reanálisis.',
        },
        { status: 400 }
      );
    }

    if (body.action === 'retry' || body.action === 'reprocess') {
      const job = await retryReviewReanalysisJob({
        userId: user.id,
        projectKey,
        jobId,
        requestedBy: user.email || user.id,
        force: body.force === true || body.action === 'reprocess',
        staleAfterMs: typeof body.staleAfterMs === 'number' ? body.staleAfterMs : undefined,
      });
      if (!job) {
        return NextResponse.json(
          {
            success: false,
            code: 'REANALYSIS_JOB_NOT_FOUND',
            error: 'No existe ese job de reanálisis.',
          },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        action: body.action,
        projectKey,
        job,
      });
    }

    if (body.action === 'decide_block') {
      if (!body.blockId?.trim() || !isReviewBlockDecision(body.decision)) {
        return NextResponse.json(
          {
            success: false,
            code: 'INVALID_REANALYSIS_BLOCK_DECISION',
            error: 'blockId y decision approved/rejected/deferred son requeridos.',
          },
          { status: 400 }
        );
      }
      const job = decideReviewReanalysisBlock({
        userId: user.id,
        projectKey,
        jobId,
        blockId: body.blockId,
        decision: body.decision,
        note: body.note,
        decidedBy: user.email || user.id,
      });
      if (!job) {
        return NextResponse.json(
          {
            success: false,
            code: 'REANALYSIS_JOB_NOT_FOUND',
            error: 'No existe ese job de reanálisis.',
          },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        action: 'decide_block',
        projectKey,
        job,
        decision: job.blockDecisions[body.blockId],
      });
    }

    if (body.action === 'create_planner_from_approved_scope') {
      const result = await createPlannerFromApprovedReviewScope({
        userId: user.id,
        projectKey,
        jobId,
        requestedBy: user.email || user.id,
        forceNew: body.forceNew === true,
        approvedBlockIds: Array.isArray(body.approvedBlockIds)
          ? body.approvedBlockIds.filter((value): value is string => typeof value === 'string')
          : undefined,
      });
      if (!result) {
        return NextResponse.json(
          {
            success: false,
            code: 'REANALYSIS_JOB_NOT_FOUND',
            error: 'No existe ese job de reanálisis.',
          },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        action: 'create_planner_from_approved_scope',
        projectKey,
        job: result.job,
        tasks: result.tasks,
        plan: toClientAgentPlannerPlan(result.plan),
        execution: deriveAgentExecutionRecord(result.plan),
        plannerJob: getLatestAgentPlannerJob(result.plan),
      });
    }

    return NextResponse.json(
      {
        success: false,
        code: 'UNSUPPORTED_REANALYSIS_ACTION',
        error: 'Acción de reanálisis no soportada.',
      },
      { status: 400 }
    );
  } catch (error) {
    if (isAuthError(error)) {
      return authErrorToResponse(error);
    }
    if (error instanceof ReviewReanalysisJobError) {
      return NextResponse.json(
        {
          success: false,
          code: error.code,
          error: error.message,
        },
        { status: error.status }
      );
    }
    return NextResponse.json(
      {
        success: false,
        error: 'No se pudo actualizar el job de reanálisis.',
      },
      { status: 500 }
    );
  }
}
