import { NextRequest, NextResponse } from 'next/server';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import { hasValidOpsToken } from '@/lib/security/ops-token';
import { verifyBackup } from '@/lib/ops/backup-service';
import { getReleaseInfo } from '@/lib/ops/release-info';

export const dynamic = 'force-dynamic';

async function authorize(request: NextRequest): Promise<void> {
  if (hasValidOpsToken(request)) return;
  await requireSession(request, 'OWNER');
}

export async function POST(request: NextRequest) {
  try {
    await authorize(request);
    const body = (await request.json().catch(() => ({}))) as { backupId?: string };
    const backupId = String(body.backupId || '').trim();
    if (!backupId) {
      return NextResponse.json({ ok: false, error: 'backupId is required' }, { status: 400 });
    }

    const result = await verifyBackup(backupId);
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
    return NextResponse.json(
      {
        ok: false,
        error: String(error),
      },
      { status: 500 }
    );
  }
}

