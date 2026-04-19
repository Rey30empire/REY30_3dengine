import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_EDITOR_PROJECT_SAVE_SLOT } from '@/engine/serialization';
import { normalizeProjectKey } from '@/lib/project-key';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import { reindexAgenticRecommendationMutationIndexFromHistory } from '@/lib/server/agentic-execution-history';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAuthError(error: unknown): boolean {
  const value = String(error || '');
  return value.includes('UNAUTHORIZED') || value.includes('FORBIDDEN');
}

function readProjectKey(request: NextRequest, body?: Record<string, unknown>) {
  const fromHeader = request.headers.get('x-rey30-project');
  const fromQuery = request.nextUrl.searchParams.get('projectKey');
  const fromBody = typeof body?.projectKey === 'string' ? body.projectKey : '';
  return normalizeProjectKey(fromHeader || fromBody || fromQuery || '');
}

function readSlot(request: NextRequest, body?: Record<string, unknown>) {
  const fromBody = typeof body?.slot === 'string' ? body.slot.trim() : '';
  return fromBody || request.nextUrl.searchParams.get('slot')?.trim() || DEFAULT_EDITOR_PROJECT_SAVE_SLOT;
}

function readExecutionId(request: NextRequest, body?: Record<string, unknown>) {
  const fromBody = typeof body?.executionId === 'string' ? body.executionId.trim() : '';
  return fromBody || request.nextUrl.searchParams.get('executionId')?.trim() || '';
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSession(request, 'EDITOR');
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const projectKey = readProjectKey(request, body);
    const slot = readSlot(request, body);
    const executionId = readExecutionId(request, body);

    if (body.confirmReindex !== true) {
      return NextResponse.json(
        {
          success: false,
          code: 'AGENTIC_RECOMMENDATION_MUTATION_INDEX_REINDEX_CONFIRMATION_REQUIRED',
          error: 'El reindexado del índice requiere confirmación explícita.',
        },
        { status: 400 }
      );
    }

    const reindex = reindexAgenticRecommendationMutationIndexFromHistory({
      userId: user.id,
      projectKey,
      slot,
      reason: typeof body.reason === 'string' ? body.reason : undefined,
      executionId: executionId || undefined,
    });

    return NextResponse.json({
      success: true,
      action: 'reindex_from_history',
      projectKey,
      slot,
      index: reindex.index,
      previousIntegrity: reindex.previousIntegrity,
      integrity: reindex.integrity,
      auditEntry: reindex.auditEntry,
      indexedExecutionCount: reindex.indexedExecutionCount,
      indexedExecutionIds: reindex.indexedExecutionIds,
      recommendationCount: reindex.recommendationCount,
    });
  } catch (error) {
    if (isAuthError(error)) {
      return authErrorToResponse(error);
    }
    console.error('[agentic] recommendation mutation index reindex failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'No se pudo reindexar el índice invertido de recomendaciones agentic.',
      },
      { status: 500 }
    );
  }
}
