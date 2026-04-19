import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_EDITOR_PROJECT_SAVE_SLOT } from '@/engine/serialization';
import { normalizeProjectKey } from '@/lib/project-key';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import { withEditorProjectWriteLock } from '@/lib/server/editor-project-storage';
import {
  type AgenticRecommendationDecision,
  updateAgenticExecutionRecommendationDecision,
} from '@/lib/server/agentic-execution-history';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RecommendationDecisionBody = {
  projectKey?: unknown;
  slot?: unknown;
  executionId?: unknown;
  decision?: unknown;
  status?: unknown;
};

function isAuthError(error: unknown): boolean {
  const value = String(error || '');
  return value.includes('UNAUTHORIZED') || value.includes('FORBIDDEN');
}

function readProjectKey(request: NextRequest, fallback?: unknown) {
  const fromHeader = request.headers.get('x-rey30-project');
  const fromQuery = request.nextUrl.searchParams.get('projectKey');
  const fromBody = typeof fallback === 'string' ? fallback : null;
  return normalizeProjectKey(fromHeader || fromQuery || fromBody);
}

function readSlot(request: NextRequest, fallback?: unknown) {
  const fromQuery = request.nextUrl.searchParams.get('slot')?.trim();
  const fromBody = typeof fallback === 'string' ? fallback.trim() : '';
  return fromQuery || fromBody || DEFAULT_EDITOR_PROJECT_SAVE_SLOT;
}

function readExecutionId(request: NextRequest, fallback?: unknown) {
  const fromQuery = request.nextUrl.searchParams.get('executionId')?.trim();
  const fromBody = typeof fallback === 'string' ? fallback.trim() : '';
  return fromQuery || fromBody || null;
}

function readDecision(value: unknown): AgenticRecommendationDecision | null {
  if (value === 'approved' || value === 'approve') {
    return 'approved';
  }
  if (value === 'rejected' || value === 'reject') {
    return 'rejected';
  }
  return null;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireSession(request, 'EDITOR');
    const params = await context.params;
    const recommendationId = decodeURIComponent(params.id || '').trim();
    const body = (await request.json().catch(() => ({}))) as RecommendationDecisionBody;
    const decision = readDecision(body.decision ?? body.status);

    if (!recommendationId) {
      return NextResponse.json(
        {
          success: false,
          error: 'El recommendation id es obligatorio.',
        },
        { status: 400 }
      );
    }
    if (!decision) {
      return NextResponse.json(
        {
          success: false,
          error: 'La decisión debe ser approved o rejected.',
        },
        { status: 400 }
      );
    }

    const projectKey = readProjectKey(request, body.projectKey);
    const slot = readSlot(request, body.slot);
    const executionId = readExecutionId(request, body.executionId);

    return await withEditorProjectWriteLock({
      userId: user.id,
      projectKey,
      slot,
      timeoutMs: 30_000,
      staleLockMs: 120_000,
      work: async () => {
        const updated = updateAgenticExecutionRecommendationDecision({
          userId: user.id,
          projectKey,
          slot,
          executionId,
          recommendationId,
          decision,
        });

        if (!updated) {
          return NextResponse.json(
            {
              success: false,
              error: 'No existe esa recomendación agentic en el historial.',
              projectKey,
              slot,
              executionId,
              recommendationId,
            },
            { status: 404 }
          );
        }

        return NextResponse.json({
          success: true,
          projectKey,
          slot,
          executionId: updated.record.id,
          recommendation: updated.recommendation,
          record: updated.record,
        });
      },
    });
  } catch (error) {
    if (isAuthError(error)) {
      return authErrorToResponse(error);
    }
    console.error('[agentic] recommendation decision failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'No se pudo persistir la decisión de recomendación agentic.',
      },
      { status: 500 }
    );
  }
}
