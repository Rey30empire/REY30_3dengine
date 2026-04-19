import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_EDITOR_PROJECT_SAVE_SLOT } from '@/engine/serialization';
import { normalizeProjectKey } from '@/lib/project-key';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import {
  createAgenticRecommendationMutationIndexStatus,
  listAgenticExecutionHistoryRecords,
  readAgenticRecommendationMutationIndex,
} from '@/lib/server/agentic-execution-history';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAuthError(error: unknown): boolean {
  const value = String(error || '');
  return value.includes('UNAUTHORIZED') || value.includes('FORBIDDEN');
}

function readProjectKey(request: NextRequest) {
  const fromHeader = request.headers.get('x-rey30-project');
  const fromQuery = request.nextUrl.searchParams.get('projectKey');
  return normalizeProjectKey(fromHeader || fromQuery || '');
}

function readSlot(request: NextRequest) {
  return request.nextUrl.searchParams.get('slot')?.trim() || DEFAULT_EDITOR_PROJECT_SAVE_SLOT;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession(request, 'EDITOR');
    const projectKey = readProjectKey(request);
    const slot = readSlot(request);
    const index = readAgenticRecommendationMutationIndex({
      userId: user.id,
      projectKey,
      slot,
    });
    const historyRecords = listAgenticExecutionHistoryRecords({
      userId: user.id,
      projectKey,
      slot,
      limit: 200,
    });
    const status = createAgenticRecommendationMutationIndexStatus({
      index,
      records: historyRecords,
      requireStoredChecksum: true,
    });
    const checkedAt = new Date().toISOString();

    return NextResponse.json({
      success: true,
      projectKey,
      slot,
      checkedAt,
      recommendationCount: status.recommendationCount,
      lastIndexedExecutionId: status.lastIndexedExecutionId,
      latestIndexableExecutionId: status.latestIndexableExecutionId,
      pendingIndexableExecutionCount: status.pendingIndexableExecutionCount,
      pendingIndexableExecutionIds: status.pendingIndexableExecutionIds,
      indexBehind: status.indexBehind,
      mutationIndexAudit: {
        ...status.mutationIndexAudit,
        checkedAt,
      },
      integrity: status.integrity,
    });
  } catch (error) {
    if (isAuthError(error)) {
      return authErrorToResponse(error);
    }
    console.error('[agentic] mutation index status read failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'No se pudo leer el estado de integridad del índice agentic.',
      },
      { status: 500 }
    );
  }
}
