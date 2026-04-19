import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_EDITOR_PROJECT_SAVE_SLOT } from '@/engine/serialization';
import {
  createAgenticRecommendationMutationIndexAuditReport,
  createAgenticRecommendationMutationIndexAuditReportFilename,
  createAgenticRecommendationMutationIndexChecksum,
  createAgenticRecommendationMutationIndexIntegrity,
  createAgenticRecommendationMutationIndexReport,
  createAgenticRecommendationMutationIndexReportFilename,
} from '@/engine/editor/ai/agenticRecommendationMutationIndexReport';
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

function readFormat(request: NextRequest) {
  const value = request.nextUrl.searchParams.get('format')?.trim().toLowerCase();
  return value === 'markdown' || value === 'md' ? 'markdown' : 'json';
}

function readScope(request: NextRequest) {
  return request.nextUrl.searchParams.get('scope')?.trim().toLowerCase() === 'audit' ? 'audit' : 'index';
}

function filterIndexByRecommendationKey(
  index: ReturnType<typeof readAgenticRecommendationMutationIndex>,
  recommendationKey: string
) {
  if (!recommendationKey) {
    return index;
  }
  const entry = index.recommendations[recommendationKey];
  const { checksum: _fullIndexChecksum, ...indexWithoutChecksum } = index;
  return {
    ...indexWithoutChecksum,
    recommendations: entry ? { [recommendationKey]: entry } : {},
  };
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession(request, 'EDITOR');
    const projectKey = readProjectKey(request);
    const slot = readSlot(request);
    const recommendationKey = request.nextUrl.searchParams.get('recommendationKey')?.trim() || '';
    const format = readFormat(request);
    const scope = readScope(request);
    const sourceIndex = readAgenticRecommendationMutationIndex({
      userId: user.id,
      projectKey,
      slot,
    });
    const sourceIntegrity = createAgenticRecommendationMutationIndexIntegrity(sourceIndex, {
      requireStoredChecksum: true,
    });
    const historyRecords = listAgenticExecutionHistoryRecords({
      userId: user.id,
      projectKey,
      slot,
      limit: 200,
    });
    const indexStatus = createAgenticRecommendationMutationIndexStatus({
      index: sourceIndex,
      records: historyRecords,
      requireStoredChecksum: true,
    });
    if (scope === 'audit') {
      const body = createAgenticRecommendationMutationIndexAuditReport(
        sourceIndex,
        format,
        new Date().toISOString(),
        sourceIntegrity
      );
      const filename = createAgenticRecommendationMutationIndexAuditReportFilename(sourceIndex, format);

      return new NextResponse(body, {
        status: 200,
        headers: {
          'Content-Type': `${format === 'json' ? 'application/json' : 'text/markdown'}; charset=utf-8`,
          'Content-Disposition': `attachment; filename="${filename}"`,
          'X-Agentic-Index-Checksum-Valid': String(sourceIntegrity.valid),
          'X-Agentic-Index-Checksum-Status': sourceIntegrity.status,
          'X-Agentic-Index-Behind': String(indexStatus.indexBehind),
          'Cache-Control': 'no-store',
        },
      });
    }
    if (indexStatus.indexBehind) {
      return NextResponse.json(
        {
          success: false,
          code: 'AGENTIC_RECOMMENDATION_MUTATION_INDEX_BEHIND',
          error: 'Export bloqueado: el índice invertido está atrasado respecto al historial de ejecuciones aprobadas.',
          projectKey,
          slot,
          recommendationKey: recommendationKey || undefined,
          mutationIndexAudit: indexStatus.mutationIndexAudit,
        },
        {
          status: 409,
          headers: {
            'Cache-Control': 'no-store',
            'X-Agentic-Index-Behind': 'true',
          },
        }
      );
    }
    if (!sourceIntegrity.valid) {
      return NextResponse.json(
        {
          success: false,
          code: 'AGENTIC_RECOMMENDATION_MUTATION_INDEX_CHECKSUM_INVALID',
          error: 'El índice invertido de recomendaciones no pasó la validación de checksum.',
          projectKey,
          slot,
          recommendationKey: recommendationKey || undefined,
          integrity: sourceIntegrity,
        },
        {
          status: 409,
          headers: {
            'Cache-Control': 'no-store',
            'X-Agentic-Index-Checksum-Valid': 'false',
            'X-Agentic-Index-Checksum-Status': sourceIntegrity.status,
            'X-Agentic-Index-Behind': 'false',
          },
        }
      );
    }
    const index = filterIndexByRecommendationKey(sourceIndex, recommendationKey);
    const body = createAgenticRecommendationMutationIndexReport(index, format);
    const filename = createAgenticRecommendationMutationIndexReportFilename(index, format);
    const checksum = createAgenticRecommendationMutationIndexChecksum(index);

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': `${format === 'json' ? 'application/json' : 'text/markdown'}; charset=utf-8`,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Agentic-Index-Checksum': `${checksum.algorithm}:${checksum.value}`,
        'X-Agentic-Index-Checksum-Valid': 'true',
        'X-Agentic-Index-Checksum-Status': sourceIntegrity.status,
        'X-Agentic-Index-Behind': 'false',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    if (isAuthError(error)) {
      return authErrorToResponse(error);
    }
    console.error('[agentic] recommendation mutation index export failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'No se pudo exportar el índice invertido de recomendaciones agentic.',
      },
      { status: 500 }
    );
  }
}
