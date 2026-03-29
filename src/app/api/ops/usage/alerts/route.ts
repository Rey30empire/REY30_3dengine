import { NextRequest, NextResponse } from 'next/server';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import { getReleaseInfo } from '@/lib/ops/release-info';
import { hasValidOpsToken } from '@/lib/security/ops-token';
import { getUsageAlerts } from '@/lib/security/usage-governance';

export const dynamic = 'force-dynamic';

async function authorize(request: NextRequest): Promise<void> {
  if (hasValidOpsToken(request)) return;
  await requireSession(request, 'OWNER');
}

export async function GET(request: NextRequest) {
  try {
    await authorize(request);
    const period = new URL(request.url).searchParams.get('period') || undefined;
    const alerts = await getUsageAlerts(period);
    return NextResponse.json({
      ok: true,
      release: getReleaseInfo(),
      period: period || 'current',
      alerts,
      counts: {
        total: alerts.length,
        blocked: alerts.filter((item) => item.status === 'blocked').length,
        warning: alerts.filter((item) => item.status === 'warning').length,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return authErrorToResponse(error);
  }
}

