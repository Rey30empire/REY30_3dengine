import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_EDITOR_PROJECT_SAVE_SLOT } from '@/engine/serialization';
import { normalizeProjectKey } from '@/lib/project-key';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import { withEditorProjectWriteLock } from '@/lib/server/editor-project-storage';
import {
  createAgenticRecommendationMutationIndexStatus,
  findAgenticExecutionHistoryRecord,
  listAgenticExecutionHistoryRecords,
  readAgenticRecommendationMutationIndex,
} from '@/lib/server/agentic-execution-history';
import {
  approvedRecommendationsForRecord,
  runApprovedRecommendationsFromRemoteSave,
} from '@/lib/server/agentic-approved-recommendation-execution';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ExecuteApprovedBody = {
  projectKey?: unknown;
  slot?: unknown;
  executionId?: unknown;
  sourceExecutionId?: unknown;
  maxIterations?: unknown;
  recommendationIds?: unknown;
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

function readExecutionId(request: NextRequest, body: ExecuteApprovedBody) {
  const fromQuery = request.nextUrl.searchParams.get('executionId')?.trim();
  const fromBody =
    typeof body.executionId === 'string'
      ? body.executionId.trim()
      : typeof body.sourceExecutionId === 'string'
        ? body.sourceExecutionId.trim()
        : '';
  return fromQuery || fromBody;
}

function readMaxIterations(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 3;
  }
  return Math.min(5, Math.max(1, Math.floor(value)));
}

function readRecommendationIds(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSession(request, 'EDITOR');
    const body = (await request.json().catch(() => ({}))) as ExecuteApprovedBody;
    const projectKey = readProjectKey(request, body.projectKey);
    const slot = readSlot(request, body.slot);
    const executionId = readExecutionId(request, body);
    const maxIterations = readMaxIterations(body.maxIterations);

    if (!executionId) {
      return NextResponse.json(
        {
          success: false,
          error: 'El executionId origen es obligatorio para ejecutar recomendaciones aprobadas.',
        },
        { status: 400 }
      );
    }

    return await withEditorProjectWriteLock({
      userId: user.id,
      projectKey,
      slot,
      timeoutMs: 30_000,
      staleLockMs: 120_000,
      work: async () => {
        const sourceRecord = findAgenticExecutionHistoryRecord({
          userId: user.id,
          projectKey,
          slot,
          executionId,
        });

        if (!sourceRecord) {
          return NextResponse.json(
            {
              success: false,
              error: 'No existe la ejecución origen para recomendaciones aprobadas.',
              projectKey,
              slot,
              executionId,
            },
            { status: 404 }
          );
        }

        const mutationIndex = readAgenticRecommendationMutationIndex({
          userId: user.id,
          projectKey,
          slot,
        });
        const mutationIndexRecords = listAgenticExecutionHistoryRecords({
          userId: user.id,
          projectKey,
          slot,
          limit: 200,
        });
        const mutationIndexStatus = createAgenticRecommendationMutationIndexStatus({
          index: mutationIndex,
          records: mutationIndexRecords,
          requireStoredChecksum: true,
        });
        if (mutationIndexStatus.indexBehind) {
          return NextResponse.json(
            {
              success: false,
              code: 'AGENTIC_RECOMMENDATION_MUTATION_INDEX_BEHIND',
              error: 'Ejecución de recomendaciones aprobadas bloqueada: el índice de recomendaciones está atrasado. Reindexa desde historial antes de mutar.',
              projectKey,
              slot,
              executionId,
              mutationIndexAudit: mutationIndexStatus.mutationIndexAudit,
            },
            { status: 409 }
          );
        }

        const approvedRecommendations = approvedRecommendationsForRecord(
          sourceRecord,
          readRecommendationIds(body.recommendationIds)
        );
        if (!approvedRecommendations.length) {
          return NextResponse.json(
            {
              success: false,
              error: 'No hay recomendaciones aprobadas para ejecutar en esa ejecución.',
              projectKey,
              slot,
              executionId,
            },
            { status: 409 }
          );
        }

        return runApprovedRecommendationsFromRemoteSave({
          userId: user.id,
          projectKey,
          slot,
          sourceRecord,
          approvedRecommendations,
          maxIterations,
        });
      },
    });
  } catch (error) {
    if (isAuthError(error)) {
      return authErrorToResponse(error);
    }
    console.error('[agentic] execute-approved recommendations failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'No se pudieron ejecutar las recomendaciones aprobadas.',
      },
      { status: 500 }
    );
  }
}
