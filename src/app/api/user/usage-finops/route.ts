import { NextRequest, NextResponse } from 'next/server';
import { authErrorToResponse, logSecurityEvent, requireSession } from '@/lib/security/auth';
import {
  getFinOpsSnapshot,
  saveProjectUsageGoals,
  saveUserUsageAlertProfile,
  type ProjectUsageGoalInput,
  type UserUsageAlertProfile,
} from '@/lib/security/usage-finops';

function parseNumber(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession(request, 'VIEWER');
    const url = new URL(request.url);
    const months = parseNumber(url.searchParams.get('months'));
    const period = url.searchParams.get('period') || undefined;
    const snapshot = await getFinOpsSnapshot(user.id, { months, period });

    await logSecurityEvent({
      request,
      userId: user.id,
      action: 'user.usage_finops.read',
      status: 'allowed',
    });

    return NextResponse.json({
      ...snapshot,
      note: 'FinOps avanzado por usuario: alertas personalizadas, objetivos por proyecto y exportables.',
    });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    console.error('[usage-finops][GET] failed:', error);
    return NextResponse.json(
      { error: 'No se pudo cargar usage-finops.' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireSession(request, 'VIEWER');
    const body = await request.json().catch(() => ({})) as {
      profile?: Partial<UserUsageAlertProfile>;
      goals?: ProjectUsageGoalInput[];
      months?: number;
      period?: string;
    };

    if (body.profile) {
      await saveUserUsageAlertProfile(user.id, body.profile);
    }

    if (Array.isArray(body.goals)) {
      await saveProjectUsageGoals(user.id, body.goals);
    }

    const snapshot = await getFinOpsSnapshot(user.id, {
      months: typeof body.months === 'number' ? body.months : undefined,
      period: typeof body.period === 'string' ? body.period : undefined,
    });

    await logSecurityEvent({
      request,
      userId: user.id,
      action: 'user.usage_finops.write',
      status: 'allowed',
      metadata: {
        goals: Array.isArray(body.goals) ? body.goals.length : 0,
        profileUpdated: !!body.profile,
      },
    });

    return NextResponse.json({
      ...snapshot,
      message: 'Configuración FinOps actualizada.',
    });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }

    await logSecurityEvent({
      request,
      action: 'user.usage_finops.write',
      status: 'error',
      metadata: { error: String(error) },
    });
    return NextResponse.json(
      { error: 'No se pudo actualizar la configuración FinOps.' },
      { status: 500 }
    );
  }
}
