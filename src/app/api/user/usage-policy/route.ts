import { NextRequest, NextResponse } from 'next/server';
import { authErrorToResponse, logSecurityEvent, requireSession } from '@/lib/security/auth';
import { getUsageSummary, getUserUsagePolicy, saveUserUsagePolicy } from '@/lib/security/usage-governance';

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession(request, 'VIEWER');
    const [policy, summary] = await Promise.all([
      getUserUsagePolicy(user.id),
      getUsageSummary(user.id),
    ]);

    await logSecurityEvent({
      request,
      userId: user.id,
      action: 'user.usage_policy.read',
      status: 'allowed',
    });

    return NextResponse.json({
      policy,
      summary,
      note: 'Controla tu presupuesto mensual y límites por proveedor. Cada usuario asume su costo de APIs.',
    });
  } catch (error) {
    return authErrorToResponse(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireSession(request, 'VIEWER');
    const body = await request.json().catch(() => ({}));
    const policy = await saveUserUsagePolicy(user.id, body || {});
    const summary = await getUsageSummary(user.id);

    await logSecurityEvent({
      request,
      userId: user.id,
      action: 'user.usage_policy.write',
      status: 'allowed',
      metadata: { hardStopEnabled: policy.hardStopEnabled },
    });

    return NextResponse.json({
      policy,
      summary,
      message: 'Política de gasto guardada.',
    });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }

    await logSecurityEvent({
      request,
      action: 'user.usage_policy.write',
      status: 'error',
      metadata: { error: String(error) },
    });
    return NextResponse.json({ error: 'No se pudo guardar la política de gasto.' }, { status: 500 });
  }
}

