import { NextRequest, NextResponse } from 'next/server';
import { engineTelemetry } from '@/engine/telemetry/engineTelemetry';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import { hasValidOpsToken } from '@/lib/security/ops-token';
import { getReleaseInfo } from '@/lib/ops/release-info';

export const dynamic = 'force-dynamic';

async function authorizeRead(request: NextRequest): Promise<void> {
  if (hasValidOpsToken(request)) return;
  await requireSession(request, 'OWNER');
}

export async function GET(request: NextRequest) {
  try {
    await authorizeRead(request);
    const slo = engineTelemetry.getSloSnapshot();

    return NextResponse.json({
      ok: true,
      release: getReleaseInfo(),
      generatedAt: new Date().toISOString(),
      overallStatus: slo.overallStatus,
      active: slo.alerts,
      counts: {
        critical: slo.alerts.filter((alert) => alert.level === 'critical').length,
        warning: slo.alerts.filter((alert) => alert.level === 'warning').length,
      },
    });
  } catch (error) {
    return authErrorToResponse(error);
  }
}

