import { NextRequest, NextResponse } from 'next/server';
import { engineTelemetry } from '@/engine/telemetry/engineTelemetry';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import { hasValidOpsToken } from '@/lib/security/ops-token';
import { getReleaseInfo } from '@/lib/ops/release-info';

export const dynamic = 'force-dynamic';

async function authorizeRead(request: NextRequest): Promise<void> {
  if (hasValidOpsToken(request)) return;
  await requireSession(request, 'EDITOR');
}

export async function GET(request: NextRequest) {
  try {
    await authorizeRead(request);
    const slo = engineTelemetry.getSloSnapshot();
    const telemetry = engineTelemetry.getSnapshot();
    return NextResponse.json({
      ok: true,
      release: getReleaseInfo(),
      slo,
      summary: {
        activeAlerts: slo.alerts.length,
        totals: telemetry.totals,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return authErrorToResponse(error);
  }
}

