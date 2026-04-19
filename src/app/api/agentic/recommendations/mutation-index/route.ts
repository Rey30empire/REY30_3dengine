import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_EDITOR_PROJECT_SAVE_SLOT } from '@/engine/serialization';
import { createAgenticRecommendationMutationIndexIntegrity } from '@/engine/editor/ai/agenticRecommendationMutationIndexReport';
import { normalizeProjectKey } from '@/lib/project-key';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import {
  readAgenticRecommendationMutationIndex,
  repairAgenticRecommendationMutationIndexChecksum,
} from '@/lib/server/agentic-execution-history';

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

function filterIndexByRecommendationKey(
  index: ReturnType<typeof readAgenticRecommendationMutationIndex>,
  recommendationKey: string
) {
  if (!recommendationKey) {
    return index;
  }
  const entry = index.recommendations[recommendationKey];
  return {
    ...index,
    recommendations: entry ? { [recommendationKey]: entry } : {},
  };
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession(request, 'EDITOR');
    const projectKey = readProjectKey(request);
    const slot = readSlot(request);
    const recommendationKey = request.nextUrl.searchParams.get('recommendationKey')?.trim() || '';
    const index = readAgenticRecommendationMutationIndex({
      userId: user.id,
      projectKey,
      slot,
    });
    const integrity = createAgenticRecommendationMutationIndexIntegrity(index, {
      requireStoredChecksum: true,
    });

    return NextResponse.json({
      success: true,
      projectKey,
      slot,
      recommendationKey: recommendationKey || undefined,
      index: filterIndexByRecommendationKey(index, recommendationKey),
      integrity,
    });
  } catch (error) {
    if (isAuthError(error)) {
      return authErrorToResponse(error);
    }
    console.error('[agentic] recommendation mutation index read failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'No se pudo leer el índice invertido de recomendaciones agentic.',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSession(request, 'EDITOR');
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const projectKey = readProjectKey(request, body);
    const slot = readSlot(request, body);

    if (body.action === 'reindex_from_history') {
      return NextResponse.json(
        {
          success: false,
          code: 'AGENTIC_RECOMMENDATION_MUTATION_INDEX_REINDEX_WRONG_ENDPOINT',
          error: 'El reindexado del índice usa POST /api/agentic/mutation-index/reindex, no la ruta de reparación de checksum.',
          projectKey,
          slot,
        },
        { status: 400 }
      );
    }

    if (body.confirmRepair !== true) {
      return NextResponse.json(
        {
          success: false,
          code: 'AGENTIC_RECOMMENDATION_MUTATION_INDEX_REPAIR_CONFIRMATION_REQUIRED',
          error: 'La reparación del índice requiere confirmación explícita.',
        },
        { status: 400 }
      );
    }

    const repair = repairAgenticRecommendationMutationIndexChecksum({
      userId: user.id,
      projectKey,
      slot,
      reason: typeof body.reason === 'string' ? body.reason : undefined,
    });

    return NextResponse.json({
      success: true,
      action: 'repair_checksum',
      projectKey,
      slot,
      index: repair.index,
      previousIntegrity: repair.previousIntegrity,
      integrity: repair.integrity,
      auditEntry: repair.auditEntry,
    });
  } catch (error) {
    if (isAuthError(error)) {
      return authErrorToResponse(error);
    }
    console.error('[agentic] recommendation mutation index repair failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'No se pudo reparar el índice invertido de recomendaciones agentic.',
      },
      { status: 500 }
    );
  }
}
