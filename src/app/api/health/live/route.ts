import { NextResponse } from 'next/server';
import { getReleaseInfo } from '@/lib/ops/release-info';

export const dynamic = 'force-dynamic';

export async function GET() {
  const release = getReleaseInfo();
  return NextResponse.json({
    ok: true,
    status: 'live',
    checks: {
      process: 'ok',
    },
    release,
    timestamp: new Date().toISOString(),
  });
}

