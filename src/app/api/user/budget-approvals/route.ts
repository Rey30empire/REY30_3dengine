import { NextRequest, NextResponse } from 'next/server';
import { authErrorToResponse, logSecurityEvent, requireSession } from '@/lib/security/auth';
import {
  createBudgetApprovalRequest,
  getUserBudgetApprovalRequests,
  type BudgetApprovalRequestInput,
} from '@/lib/security/usage-finops';

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession(request, 'VIEWER');
    const requests = await getUserBudgetApprovalRequests(user.id);

    await logSecurityEvent({
      request,
      userId: user.id,
      action: 'user.budget_approval.read',
      status: 'allowed',
      metadata: { count: requests.length },
    });

    return NextResponse.json({
      requests,
      count: requests.length,
    });
  } catch (error) {
    return authErrorToResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSession(request, 'VIEWER');
    const body = (await request.json().catch(() => ({}))) as BudgetApprovalRequestInput;
    const created = await createBudgetApprovalRequest(user.id, body || {});

    await logSecurityEvent({
      request,
      userId: user.id,
      action: 'user.budget_approval.create',
      status: 'allowed',
      metadata: { requestId: created.id },
    });

    return NextResponse.json({
      request: created,
      message: 'Solicitud de aprobación de presupuesto enviada.',
    });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    await logSecurityEvent({
      request,
      action: 'user.budget_approval.create',
      status: 'error',
      metadata: { error: String(error) },
    });
    return NextResponse.json(
      { error: String(error || 'No se pudo crear la solicitud de aprobación.') },
      { status: 400 }
    );
  }
}

