import { FinOpsRemediationStatus } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import { hasValidOpsToken } from '@/lib/security/ops-token';
import { getFinOpsRemediationLogs } from '@/lib/security/usage-finops';
import { getReleaseInfo } from '@/lib/ops/release-info';

export const dynamic = 'force-dynamic';

async function authorize(request: NextRequest): Promise<void> {
  if (hasValidOpsToken(request)) return;
  await requireSession(request, 'OWNER');
}

function parseStatus(raw: string | null): FinOpsRemediationStatus | undefined {
  const normalized = String(raw || '').toUpperCase();
  if (normalized === 'PROPOSED') return FinOpsRemediationStatus.PROPOSED;
  if (normalized === 'APPLIED') return FinOpsRemediationStatus.APPLIED;
  if (normalized === 'SKIPPED') return FinOpsRemediationStatus.SKIPPED;
  if (normalized === 'FAILED') return FinOpsRemediationStatus.FAILED;
  return undefined;
}

export async function GET(request: NextRequest) {
  try {
    await authorize(request);
    const url = new URL(request.url);
    const take = Number(url.searchParams.get('take') || 100);
    const userId = url.searchParams.get('userId') || undefined;
    const actionType = url.searchParams.get('actionType') || undefined;
    const status = parseStatus(url.searchParams.get('status'));
    const logs = await getFinOpsRemediationLogs({ take, userId, actionType, status });

    return NextResponse.json({
      ok: true,
      release: getReleaseInfo(),
      count: logs.length,
      logs,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return authErrorToResponse(error);
  }
}
