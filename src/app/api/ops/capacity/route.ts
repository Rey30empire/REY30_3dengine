import { NextRequest, NextResponse } from 'next/server';
import { getCapacityPolicy } from '@/lib/security/capacity-policy';
import { getReleaseInfo } from '@/lib/ops/release-info';
import { hasValidOpsToken } from '@/lib/security/ops-token';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';

export const dynamic = 'force-dynamic';

async function authorize(request: NextRequest): Promise<void> {
  if (hasValidOpsToken(request)) return;
  await requireSession(request, 'OWNER');
}

export async function GET(request: NextRequest) {
  try {
    await authorize(request);
    const policy = getCapacityPolicy();
    return NextResponse.json({
      ok: true,
      release: getReleaseInfo(),
      capacity: {
        globalWindowMs: policy.globalWindowMs,
        globalRequestsPerWindow: policy.globalRequestsPerWindow,
        aiChatPerMode: policy.aiChatPerMode,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return authErrorToResponse(error);
  }
}

