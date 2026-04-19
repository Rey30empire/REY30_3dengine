import { NextRequest, NextResponse } from 'next/server';
import {
  createStaleMetadataRevertPolicyAuditReport,
  createStaleMetadataRevertPolicyAuditReportFilename,
  createStaleMetadataRevertPolicySnapshot,
  isStaleMetadataRevertPolicyAuditEventType,
  paginateStaleMetadataRevertPolicyAuditTrail,
  readStaleMetadataRevertPolicyConfig,
  type StaleMetadataRevertPolicyAuditReportFormat,
} from '@/lib/server/stale-metadata-revert-policy';
import { resolveDateRange } from '@/lib/server/audit-date-range';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';

function resolveFormat(value: string | null): StaleMetadataRevertPolicyAuditReportFormat | null {
  if (value === 'json') {
    return 'json';
  }
  if (value === 'markdown' || value === 'md') {
    return 'markdown';
  }
  return null;
}

function resolveEventType(value: string | null) {
  if (!value || value === 'all') {
    return 'all';
  }
  if (isStaleMetadataRevertPolicyAuditEventType(value)) {
    return value;
  }
  return null;
}

function resolveExportScope(value: string | null) {
  if (!value || value === 'all') {
    return 'all';
  }
  if (value === 'page') {
    return 'page';
  }
  return null;
}

function resolvePagination(request: NextRequest) {
  const rawLimit = request.nextUrl.searchParams.get('limit');
  const rawOffset = request.nextUrl.searchParams.get('offset');
  const limit = rawLimit ? Number.parseInt(rawLimit, 10) : 50;
  const offset = rawOffset ? Number.parseInt(rawOffset, 10) : 0;
  if (!Number.isFinite(limit) || limit < 1) {
    return { error: 'limit debe ser un entero mayor o igual a 1.' };
  }
  if (!Number.isFinite(offset) || offset < 0) {
    return { error: 'offset debe ser un entero mayor o igual a 0.' };
  }
  return { limit, offset };
}

function resolveActorFilter(request: NextRequest) {
  return (
    request.nextUrl.searchParams.get('actor') ||
    request.nextUrl.searchParams.get('actorEmail') ||
    ''
  ).trim();
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession(request, 'OWNER');
    const format = resolveFormat(request.nextUrl.searchParams.get('format'));
    const eventType = resolveEventType(request.nextUrl.searchParams.get('eventType'));
    const exportScope = resolveExportScope(request.nextUrl.searchParams.get('exportScope'));
    const paginationInput = resolvePagination(request);
    if (!format) {
      return NextResponse.json(
        {
          success: false,
          error: 'format debe ser json o markdown.',
        },
        { status: 400 }
      );
    }
    if (!eventType) {
      return NextResponse.json(
        {
          success: false,
          error:
            'eventType debe ser all, stale_metadata_revert_allowlist_changed o stale_metadata_revert_allowlist_reset_to_env.',
        },
        { status: 400 }
      );
    }
    if (!exportScope) {
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
    const dateRangeInput = resolveDateRange(request.nextUrl.searchParams);
    if ('error' in dateRangeInput) {
      return NextResponse.json(
        {
          success: false,
          error: dateRangeInput.error,
        },
        { status: 400 }
      );
    }
    const actorFilter = resolveActorFilter(request);

    const policySnapshot = createStaleMetadataRevertPolicySnapshot({
      evaluatedRole: user.role,
    });
    const audit = paginateStaleMetadataRevertPolicyAuditTrail({
      limit: paginationInput.limit,
      offset: paginationInput.offset,
      eventType,
      actor: actorFilter,
      fromMs: dateRangeInput.fromMs,
      toMs: dateRangeInput.toMs,
    });
    const auditTrail =
      exportScope === 'page'
        ? audit.events
        : [...audit.filteredEvents].reverse();
    const body = createStaleMetadataRevertPolicyAuditReport({
      config: readStaleMetadataRevertPolicyConfig(),
      policySnapshot,
      auditTrail,
      eventTypeFilter: eventType,
      actorFilter,
      dateFromFilter: dateRangeInput.from || null,
      dateToFilter: dateRangeInput.to || null,
      fromMs: dateRangeInput.fromMs,
      toMs: dateRangeInput.toMs,
      exportScope,
      totalAuditCount: audit.pagination.total,
      pagination:
        exportScope === 'page'
          ? audit.pagination
          : {
              limit: audit.pagination.total,
              offset: 0,
              total: audit.pagination.total,
              hasMore: false,
              nextOffset: null,
            },
      format,
    });
    const filename = createStaleMetadataRevertPolicyAuditReportFilename(format);

    return new NextResponse(body, {
      status: 200,
      headers: {
        'content-type': format === 'json' ? 'application/json; charset=utf-8' : 'text/markdown; charset=utf-8',
        'content-disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return authErrorToResponse(error);
  }
}
