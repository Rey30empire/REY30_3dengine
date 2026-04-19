import { NextRequest, NextResponse } from 'next/server';
import {
  isStaleMetadataRevertPolicyAuditEventType,
  paginateStaleMetadataRevertPolicyAuditTrail,
  type StaleMetadataRevertPolicyAuditEventTypeFilter,
} from '@/lib/server/stale-metadata-revert-policy';
import { resolveDateRange } from '@/lib/server/audit-date-range';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';

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

function resolveEventType(request: NextRequest) {
  const value = request.nextUrl.searchParams.get('eventType') || 'all';
  if (value === 'all' || isStaleMetadataRevertPolicyAuditEventType(value)) {
    return { eventType: value as StaleMetadataRevertPolicyAuditEventTypeFilter };
  }
  return {
    error:
      'eventType debe ser all, stale_metadata_revert_allowlist_changed o stale_metadata_revert_allowlist_reset_to_env.',
  };
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
    await requireSession(request, 'OWNER');
    const paginationInput = resolvePagination(request);
    if ('error' in paginationInput) {
      return NextResponse.json(
        {
          success: false,
          error: paginationInput.error,
        },
        { status: 400 }
      );
    }
    const eventTypeInput = resolveEventType(request);
    if ('error' in eventTypeInput) {
      return NextResponse.json(
        {
          success: false,
          error: eventTypeInput.error,
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

    const audit = paginateStaleMetadataRevertPolicyAuditTrail({
      limit: paginationInput.limit,
      offset: paginationInput.offset,
      eventType: eventTypeInput.eventType,
      actor: actorFilter,
      fromMs: dateRangeInput.fromMs,
      toMs: dateRangeInput.toMs,
    });

    return NextResponse.json({
      success: true,
      eventType: eventTypeInput.eventType,
      actorFilter: actorFilter || null,
      dateFromFilter: dateRangeInput.from || null,
      dateToFilter: dateRangeInput.to || null,
      auditTrail: audit.events,
      auditCount: audit.events.length,
      totalAuditCount: audit.pagination.total,
      auditPagination: audit.pagination,
      filterOptions: [
        'all',
        'stale_metadata_revert_allowlist_changed',
        'stale_metadata_revert_allowlist_reset_to_env',
      ],
    });
  } catch (error) {
    return authErrorToResponse(error);
  }
}
