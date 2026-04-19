import { NextRequest, NextResponse } from 'next/server';
import { engineTelemetry } from '@/engine/telemetry/engineTelemetry';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import { hasValidOpsToken } from '@/lib/security/ops-token';
import { runtimeForensicsWebhookFailureRateMetric } from '@/lib/server/runtime-forensics-prometheus';

export const dynamic = 'force-dynamic';

async function authorizeRead(request: NextRequest): Promise<void> {
  if (hasValidOpsToken(request)) return;
  await requireSession(request, 'OWNER');
}

export async function GET(request: NextRequest) {
  try {
    await authorizeRead(request);
    const metrics = [
      engineTelemetry.toPrometheusMetrics().trimEnd(),
      await runtimeForensicsWebhookFailureRateMetric(),
      '',
    ].join('\n');
    return new NextResponse(metrics, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return authErrorToResponse(error);
  }
}
