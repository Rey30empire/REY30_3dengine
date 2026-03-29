import { NextRequest, NextResponse } from 'next/server';
import { engineTelemetry } from '@/engine/telemetry/engineTelemetry';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';

export async function GET(request: NextRequest) {
  try {
    await requireSession(request, 'EDITOR');
    const snapshot = engineTelemetry.getSnapshot();
    return NextResponse.json({
      ok: true,
      snapshot,
    });
  } catch (error) {
    return authErrorToResponse(error);
  }
}
