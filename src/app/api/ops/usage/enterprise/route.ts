import { NextRequest, NextResponse } from 'next/server';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import { hasValidOpsToken } from '@/lib/security/ops-token';
import { getEnterpriseFinOpsReport } from '@/lib/security/usage-finops';
import { getReleaseInfo } from '@/lib/ops/release-info';

export const dynamic = 'force-dynamic';

async function authorize(request: NextRequest): Promise<void> {
  if (hasValidOpsToken(request)) return;
  await requireSession(request, 'OWNER');
}

function parseNumber(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
}

export async function GET(request: NextRequest) {
  try {
    await authorize(request);
    const url = new URL(request.url);
    const period = url.searchParams.get('period') || undefined;
    const months = parseNumber(url.searchParams.get('months'));
    const includeUsersWithoutAlerts = url.searchParams.get('includeUsersWithoutAlerts') !== 'false';
    const report = await getEnterpriseFinOpsReport({
      period,
      months,
      includeUsersWithoutAlerts,
    });

    return NextResponse.json({
      ok: true,
      release: getReleaseInfo(),
      ...report,
    });
  } catch (error) {
    return authErrorToResponse(error);
  }
}

