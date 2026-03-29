import { NextRequest, NextResponse } from 'next/server';
import { createBackup, listBackups } from '@/lib/ops/backup-service';
import { getReleaseInfo } from '@/lib/ops/release-info';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import { hasValidOpsToken } from '@/lib/security/ops-token';

export const dynamic = 'force-dynamic';

async function authorize(request: NextRequest): Promise<void> {
  if (hasValidOpsToken(request)) return;
  await requireSession(request, 'OWNER');
}

export async function GET(request: NextRequest) {
  try {
    await authorize(request);
    const limitRaw = new URL(request.url).searchParams.get('limit');
    const limit = Number(limitRaw || 25);
    const backups = await listBackups(Number.isFinite(limit) ? limit : 25);
    return NextResponse.json({
      ok: true,
      release: getReleaseInfo(),
      backups,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return authErrorToResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await authorize(request);
    const body = (await request.json().catch(() => ({}))) as { note?: string };
    const backup = await createBackup(String(body.note || '').slice(0, 300));
    return NextResponse.json({
      ok: true,
      release: getReleaseInfo(),
      backup,
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
