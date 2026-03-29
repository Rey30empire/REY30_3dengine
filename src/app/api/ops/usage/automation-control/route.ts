import { NextRequest, NextResponse } from 'next/server';
import { authErrorToResponse, logSecurityEvent, requireSession } from '@/lib/security/auth';
import { hasValidOpsToken } from '@/lib/security/ops-token';
import {
  getFinOpsAutomationControl,
  saveFinOpsAutomationControl,
  type FinOpsAutomationControlInput,
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
    const control = await getFinOpsAutomationControl('global');
    return NextResponse.json({
      ok: true,
      release: getReleaseInfo(),
      control,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return authErrorToResponse(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await authorize(request);
    const body = (await request.json().catch(() => ({}))) as FinOpsAutomationControlInput;
    const control = await saveFinOpsAutomationControl(
      {
        ...body,
        controlKey: 'global',
      },
      auth.actorUserId
    );

    await logSecurityEvent({
      request,
      userId: auth.actorUserId,
      action: 'ops.usage_automation_control.write',
      status: 'allowed',
      metadata: {
        enabled: control.enabled,
        minSeverity: control.minSeverity,
      },
    });

    return NextResponse.json({
      ok: true,
      control,
      message: 'Control de automatización FinOps actualizado.',
    });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    await logSecurityEvent({
      request,
      action: 'ops.usage_automation_control.write',
      status: 'error',
      metadata: { error: String(error) },
    });
    return NextResponse.json(
      { error: String(error || 'No se pudo actualizar control de automatización.') },
      { status: 400 }
    );
  }
}
