import { NextRequest, NextResponse } from 'next/server';
import { authErrorToResponse, logSecurityEvent, requireSession } from '@/lib/security/auth';
import {
  getUserFinOpsAutopilotSnapshot,
  saveUserFinOpsAutopilotConfig,
  type UserFinOpsAutopilotConfig,
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
    const period = url.searchParams.get('period') || undefined;
    const months = parseNumber(url.searchParams.get('months'));
    const snapshot = await getUserFinOpsAutopilotSnapshot(user.id, { period, months });

    await logSecurityEvent({
      request,
      userId: user.id,
      action: 'user.usage_autopilot.read',
      status: 'allowed',
      metadata: { period: snapshot.suggestion.period, months: snapshot.config.lookbackMonths },
    });

    return NextResponse.json({
      ...snapshot,
      note: 'Autopilot FinOps: sugerencias estacionales + políticas aplicables.',
    });
  } catch (error) {
    return authErrorToResponse(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireSession(request, 'VIEWER');
    const body = (await request.json().catch(() => ({}))) as Partial<UserFinOpsAutopilotConfig> & {
      period?: string;
      months?: number;
    };

    await saveUserFinOpsAutopilotConfig(user.id, {
      enabled: body.enabled,
      seasonalityEnabled: body.seasonalityEnabled,
      budgetBufferRatio: body.budgetBufferRatio,
      lookbackMonths: body.lookbackMonths,
    });
    const snapshot = await getUserFinOpsAutopilotSnapshot(user.id, {
      period: typeof body.period === 'string' ? body.period : undefined,
      months: typeof body.months === 'number' ? body.months : undefined,
    });

    await logSecurityEvent({
      request,
      userId: user.id,
      action: 'user.usage_autopilot.write',
      status: 'allowed',
      metadata: {
        enabled: snapshot.config.enabled,
        seasonalityEnabled: snapshot.config.seasonalityEnabled,
        lookbackMonths: snapshot.config.lookbackMonths,
      },
    });

    return NextResponse.json({
      ...snapshot,
      message: 'Autopilot FinOps actualizado.',
    });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    await logSecurityEvent({
      request,
      action: 'user.usage_autopilot.write',
      status: 'error',
      metadata: { error: String(error) },
    });
    return NextResponse.json(
      { error: 'No se pudo actualizar el autopilot FinOps.' },
      { status: 500 }
    );
  }
}
