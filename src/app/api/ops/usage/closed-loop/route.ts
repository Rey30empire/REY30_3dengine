import { NextRequest, NextResponse } from 'next/server';
import { authErrorToResponse, logSecurityEvent, requireSession } from '@/lib/security/auth';
import { hasValidOpsToken } from '@/lib/security/ops-token';
import { runFinOpsClosedLoop } from '@/lib/security/usage-finops';
import { getReleaseInfo } from '@/lib/ops/release-info';

export const dynamic = 'force-dynamic';

async function authorize(request: NextRequest): Promise<{ actorUserId: string | null }> {
  if (hasValidOpsToken(request)) return { actorUserId: null };
  const user = await requireSession(request, 'OWNER');
  return { actorUserId: user.id };
}

function parseNumber(value: unknown): number | undefined {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return undefined;
  return numeric;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request);
    const body = (await request.json().catch(() => ({}))) as {
      period?: string;
      months?: number;
      dryRun?: boolean;
      force?: boolean;
      maxActions?: number;
    };
    const run = await runFinOpsClosedLoop({
      period: typeof body.period === 'string' ? body.period : undefined,
      months: parseNumber(body.months),
      dryRun: typeof body.dryRun === 'boolean' ? body.dryRun : true,
      force: !!body.force,
      maxActions: parseNumber(body.maxActions),
      controlKey: 'global',
    });

    await logSecurityEvent({
      request,
      userId: auth.actorUserId,
      action: 'ops.usage_closed_loop.run',
      status: 'allowed',
      metadata: {
        dryRun: run.dryRun,
        actionsPlanned: run.actionsPlanned,
        actionsApplied: run.actionsApplied,
        actionsFailed: run.actionsFailed,
      },
    });

    return NextResponse.json({
      ok: true,
      release: getReleaseInfo(),
      ...run,
    });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    await logSecurityEvent({
      request,
      action: 'ops.usage_closed_loop.run',
      status: 'error',
      metadata: { error: String(error) },
    });
    return NextResponse.json(
      { error: String(error || 'No se pudo ejecutar closed-loop FinOps.') },
      { status: 400 }
    );
  }
}
