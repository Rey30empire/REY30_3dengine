import { NextRequest, NextResponse } from 'next/server';
import { BudgetApprovalStatus, type AppBudgetApprovalStatus } from '@/lib/domain-enums';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import { hasValidOpsToken } from '@/lib/security/ops-token';
import { getBudgetApprovalRequests } from '@/lib/security/usage-finops';
import { getReleaseInfo } from '@/lib/ops/release-info';

export const dynamic = 'force-dynamic';

async function authorize(request: NextRequest): Promise<void> {
  if (hasValidOpsToken(request)) return;
  await requireSession(request, 'OWNER');
}

function parseStatus(raw: string | null): AppBudgetApprovalStatus | 'ALL' {
  const normalized = String(raw || 'PENDING').toUpperCase();
  if (normalized === 'ALL') return 'ALL';
  if (normalized === 'APPROVED') return BudgetApprovalStatus.APPROVED;
  if (normalized === 'REJECTED') return BudgetApprovalStatus.REJECTED;
  if (normalized === 'CANCELED') return BudgetApprovalStatus.CANCELED;
  return BudgetApprovalStatus.PENDING;
}

export async function GET(request: NextRequest) {
  try {
    await authorize(request);
    const url = new URL(request.url);
    const status = parseStatus(url.searchParams.get('status'));
    const take = Math.max(1, Math.min(500, Number(url.searchParams.get('take') || 200)));
    const requests = await getBudgetApprovalRequests({ status, take });

    return NextResponse.json({
      ok: true,
      release: getReleaseInfo(),
      status,
      count: requests.length,
      requests,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return authErrorToResponse(error);
  }
}
