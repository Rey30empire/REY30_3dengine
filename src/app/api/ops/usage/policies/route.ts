import { NextRequest, NextResponse } from 'next/server';
import { authErrorToResponse, logSecurityEvent, requireSession } from '@/lib/security/auth';
import { hasValidOpsToken } from '@/lib/security/ops-token';
import {
  getBudgetApprovalPolicies,
  saveBudgetApprovalPolicies,
  type BudgetApprovalPolicyInput,
} from '@/lib/security/usage-finops';
import { getReleaseInfo } from '@/lib/ops/release-info';

export const dynamic = 'force-dynamic';

async function authorize(request: NextRequest): Promise<{ actorUserId: string | null }> {
  if (hasValidOpsToken(request)) return { actorUserId: null };
  const user = await requireSession(request, 'OWNER');
  return { actorUserId: user.id };
}

export async function GET(request: NextRequest) {
  try {
    await authorize(request);
    const policies = await getBudgetApprovalPolicies();
    return NextResponse.json({
      ok: true,
      release: getReleaseInfo(),
      count: policies.length,
      policies,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return authErrorToResponse(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await authorize(request);
    const body = (await request.json().catch(() => ({}))) as {
      policies?: BudgetApprovalPolicyInput[];
    };
    const policies = await saveBudgetApprovalPolicies(body.policies || [], auth.actorUserId);

    await logSecurityEvent({
      request,
      userId: auth.actorUserId,
      action: 'ops.usage_policies.write',
      status: 'allowed',
      metadata: { policies: policies.length },
    });

    return NextResponse.json({
      ok: true,
      count: policies.length,
      policies,
      message: 'Policies de aprobación actualizadas.',
    });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    await logSecurityEvent({
      request,
      action: 'ops.usage_policies.write',
      status: 'error',
      metadata: { error: String(error) },
    });
    return NextResponse.json(
      { error: String(error || 'No se pudieron guardar las policies.') },
      { status: 400 }
    );
  }
}
