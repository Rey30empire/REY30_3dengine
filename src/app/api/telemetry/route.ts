import { NextRequest, NextResponse } from 'next/server';
import { engineTelemetry } from '@/engine/telemetry/engineTelemetry';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import { hasValidOpsToken } from '@/lib/security/ops-token';

async function authorizeRead(request: NextRequest): Promise<void> {
  if (hasValidOpsToken(request)) return;
  await requireSession(request, 'EDITOR');
}

export async function GET(request: NextRequest) {
  try {
    await authorizeRead(request);
    const snapshot = engineTelemetry.getSnapshot();
    const slo = engineTelemetry.getSloSnapshot();
    return NextResponse.json({
      ok: true,
      snapshot,
      slo,
    });
  } catch (error) {
    return authErrorToResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireSession(request, 'EDITOR');
    const payload = await request.json().catch(() => null);
    const performance = payload?.performance;

    if (!performance || typeof performance !== 'object') {
      return NextResponse.json(
        { error: 'Se requiere un payload performance válido.' },
        { status: 400 }
      );
    }

    const sample = engineTelemetry.recordPerformanceSample(performance);
    return NextResponse.json({
      ok: true,
      sample,
      snapshot: engineTelemetry.getSnapshot(),
    });
  } catch (error) {
    return authErrorToResponse(error);
  }
}
