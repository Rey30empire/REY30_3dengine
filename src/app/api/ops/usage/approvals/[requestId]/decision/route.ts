import { NextRequest, NextResponse } from 'next/server';
import { authErrorToResponse, logSecurityEvent, requireSession } from '@/lib/security/auth';
import { hasValidOpsToken } from '@/lib/security/ops-token';
import { decideBudgetApprovalRequest } from '@/lib/security/usage-finops';

type DecisionBody = {
  decision?: 'approve' | 'reject' | 'cancel';
  note?: string;
};

async function authorize(request: NextRequest): Promise<void> {
  if (hasValidOpsToken(request)) return;
  await requireSession(request, 'OWNER');
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ requestId: string }> }
) {
  try {
    await authorize(request);
    const actor = await requireSession(request, 'OWNER').catch(() => null);
    const params = await context.params;
    const body = (await request.json().catch(() => ({}))) as DecisionBody;
    const decision = body.decision || 'reject';

    if (!['approve', 'reject', 'cancel'].includes(decision)) {
      return NextResponse.json({ error: 'decision inválida.' }, { status: 400 });
    }

    const resolved = await decideBudgetApprovalRequest({
      requestId: params.requestId,
      deciderUserId: actor?.id || 'ops-token-actor',
      decision,
      note: body.note,
    });

    await logSecurityEvent({
      request,
      userId: actor?.id || null,
      action: 'ops.budget_approval.decide',
      target: params.requestId,
      status: 'allowed',
      metadata: { decision },
    });

    return NextResponse.json({
      ok: true,
      request: resolved,
      message: `Solicitud ${decision === 'approve' ? 'aprobada' : decision === 'reject' ? 'rechazada' : 'cancelada'}.`,
    });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    await logSecurityEvent({
      request,
      action: 'ops.budget_approval.decide',
      status: 'error',
      metadata: { error: String(error) },
    });
    return NextResponse.json(
      { error: String(error || 'No se pudo resolver la solicitud.') },
      { status: 400 }
    );
  }
}

