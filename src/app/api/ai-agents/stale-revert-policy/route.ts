import { NextRequest, NextResponse } from 'next/server';
import {
  createStaleMetadataRevertPolicySnapshot,
  getStaleMetadataRevertAllowedRolesFromEnv,
  isStaleMetadataRevertPolicyAuditEventType,
  normalizeStaleMetadataRevertPolicyRoles,
  paginateStaleMetadataRevertPolicyAuditTrail,
  readStaleMetadataRevertPolicyConfig,
  resetStaleMetadataRevertPolicyConfigToEnv,
  updateStaleMetadataRevertPolicyConfig,
  type StaleMetadataRevertPolicyAuditEventTypeFilter,
} from '@/lib/server/stale-metadata-revert-policy';
import { resolveDateRange } from '@/lib/server/audit-date-range';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';

type PatchBody = {
  allowedRoles?: unknown;
  reason?: string | null;
};

type DeleteBody = {
  reason?: string | null;
};

function resolveAuditPagination(request: NextRequest) {
  const rawLimit = request.nextUrl.searchParams.get('auditLimit');
  const rawOffset = request.nextUrl.searchParams.get('auditOffset');
  const limit = rawLimit ? Number.parseInt(rawLimit, 10) : 50;
  const offset = rawOffset ? Number.parseInt(rawOffset, 10) : 0;
  if (!Number.isFinite(limit) || limit < 1) {
    return { error: 'auditLimit debe ser un entero mayor o igual a 1.' };
  }
  if (!Number.isFinite(offset) || offset < 0) {
    return { error: 'auditOffset debe ser un entero mayor o igual a 0.' };
  }
  return { limit, offset };
}

function resolveAuditEventType(request: NextRequest) {
  const value = request.nextUrl.searchParams.get('eventType') || 'all';
  if (value === 'all' || isStaleMetadataRevertPolicyAuditEventType(value)) {
    return { eventType: value as StaleMetadataRevertPolicyAuditEventTypeFilter };
  }
  return {
    error:
      'eventType debe ser all, stale_metadata_revert_allowlist_changed o stale_metadata_revert_allowlist_reset_to_env.',
  };
}

function resolveAuditActorFilter(request: NextRequest) {
  return (
    request.nextUrl.searchParams.get('actor') ||
    request.nextUrl.searchParams.get('actorEmail') ||
    ''
  ).trim();
}

function toClientConfig(request: NextRequest) {
  const paginationInput = resolveAuditPagination(request);
  if ('error' in paginationInput) {
    return {
      error: paginationInput.error,
    };
  }
  const eventTypeInput = resolveAuditEventType(request);
  if ('error' in eventTypeInput) {
    return {
      error: eventTypeInput.error,
    };
  }
  const dateRangeInput = resolveDateRange(request.nextUrl.searchParams);
  if ('error' in dateRangeInput) {
    return {
      error: dateRangeInput.error,
    };
  }
  const actorFilter = resolveAuditActorFilter(request);
  const config = readStaleMetadataRevertPolicyConfig();
  const envPolicy = getStaleMetadataRevertAllowedRolesFromEnv();
  const audit = paginateStaleMetadataRevertPolicyAuditTrail({
    limit: paginationInput.limit,
    offset: paginationInput.offset,
    eventType: eventTypeInput.eventType,
    actor: actorFilter,
    fromMs: dateRangeInput.fromMs,
    toMs: dateRangeInput.toMs,
  });
  const pagedConfig = config
    ? {
        ...config,
        auditTrail: audit.events,
      }
    : null;
  return {
    configured: Boolean(config),
    config: pagedConfig,
    auditTrail: audit.events,
    auditCount: audit.events.length,
    totalAuditCount: audit.pagination.total,
    auditPagination: audit.pagination,
    auditEventType: eventTypeInput.eventType,
    auditActorFilter: actorFilter || null,
    auditDateFromFilter: dateRangeInput.from || null,
    auditDateToFilter: dateRangeInput.to || null,
    auditFilterOptions: [
      'all',
      'stale_metadata_revert_allowlist_changed',
      'stale_metadata_revert_allowlist_reset_to_env',
    ],
    envAllowedRoles: envPolicy.allowedRoles,
  };
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession(request, 'OWNER');
    const policySnapshot = createStaleMetadataRevertPolicySnapshot({
      evaluatedRole: user.role,
    });
    const clientConfig = toClientConfig(request);
    if ('error' in clientConfig) {
      return NextResponse.json(
        {
          success: false,
          error: clientConfig.error,
        },
        { status: 400 }
      );
    }
    return NextResponse.json({
      success: true,
      ...clientConfig,
      policySnapshot,
    });
  } catch (error) {
    return authErrorToResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireSession(request, 'OWNER');
    const body = (await request.json().catch(() => ({}))) as PatchBody;
    const normalized = normalizeStaleMetadataRevertPolicyRoles(body.allowedRoles);

    if (!Array.isArray(body.allowedRoles)) {
      return NextResponse.json(
        {
          success: false,
          error: 'allowedRoles debe ser una lista de roles.',
        },
        { status: 400 }
      );
    }
    if (normalized.invalidValues.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'allowedRoles contiene roles inválidos.',
          invalidValues: normalized.invalidValues,
        },
        { status: 400 }
      );
    }

    const result = await updateStaleMetadataRevertPolicyConfig({
      allowedRoles: body.allowedRoles,
      actorUserId: user.id,
      actorEmail: user.email,
      reason: body.reason,
    });
    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'allowedRoles contiene roles inválidos.',
          invalidValues: result.invalidValues,
        },
        { status: 400 }
      );
    }

    const policySnapshot = createStaleMetadataRevertPolicySnapshot({
      evaluatedRole: user.role,
    });
    const clientConfig = toClientConfig(request);
    if ('error' in clientConfig) {
      return NextResponse.json(
        {
          success: false,
          error: clientConfig.error,
        },
        { status: 400 }
      );
    }
    return NextResponse.json({
      success: true,
      ...clientConfig,
      event: result.event,
      policySnapshot,
    });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    return NextResponse.json(
      {
        success: false,
        error: 'No se pudo actualizar la política de revert obsoleto.',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireSession(request, 'OWNER');
    const body = (await request.json().catch(() => ({}))) as DeleteBody;
    const reason = body.reason?.trim() || '';
    if (reason.length < 8) {
      return NextResponse.json(
        {
          success: false,
          error: 'Restaurar la allowlist a env/default requiere un motivo de auditoría de al menos 8 caracteres.',
        },
        { status: 400 }
      );
    }

    const result = await resetStaleMetadataRevertPolicyConfigToEnv({
      actorUserId: user.id,
      actorEmail: user.email,
      reason,
    });
    const policySnapshot = createStaleMetadataRevertPolicySnapshot({
      evaluatedRole: user.role,
    });
    const clientConfig = toClientConfig(request);
    if ('error' in clientConfig) {
      return NextResponse.json(
        {
          success: false,
          error: clientConfig.error,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      ...clientConfig,
      event: result.event,
      policySnapshot,
    });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    return NextResponse.json(
      {
        success: false,
        error: 'No se pudo restaurar la política de revert obsoleto.',
      },
      { status: 500 }
    );
  }
}
