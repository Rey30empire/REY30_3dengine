import { NextRequest, NextResponse } from 'next/server';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import { hasValidOpsToken } from '@/lib/security/ops-token';
import { getReleaseInfo } from '@/lib/ops/release-info';
import { restoreBackup } from '@/lib/ops/backup-service';

export const dynamic = 'force-dynamic';

async function authorize(request: NextRequest): Promise<void> {
  if (hasValidOpsToken(request)) return;
  await requireSession(request, 'OWNER');
}

export async function POST(request: NextRequest) {
  try {
    await authorize(request);
    const body = (await request.json().catch(() => ({}))) as {
      backupId?: string;
      dryRun?: boolean;
      confirm?: string;
      skipVerify?: boolean;
    };

    const backupId = String(body.backupId || '').trim();
    if (!backupId) {
      return NextResponse.json({ ok: false, error: 'backupId is required' }, { status: 400 });
    }

    const result = await restoreBackup({
      backupId,
      dryRun: body.dryRun !== false,
      confirm: body.confirm,
      skipVerify: body.skipVerify === true,
    });

    return NextResponse.json({
      ok: true,
      release: getReleaseInfo(),
      result,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    const message = String(error || 'restore_failed');
    const status = message.includes('Confirm token required') ? 400 : 500;
    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status }
    );
  }
}

