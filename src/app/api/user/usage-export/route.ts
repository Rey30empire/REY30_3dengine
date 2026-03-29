import { NextRequest, NextResponse } from 'next/server';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import { getFinOpsSnapshot, getUsageExportCsv } from '@/lib/security/usage-finops';

function parseNumber(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession(request, 'VIEWER');
    const url = new URL(request.url);
    const format = String(url.searchParams.get('format') || 'csv').toLowerCase();
    const months = parseNumber(url.searchParams.get('months'));
    const period = url.searchParams.get('period') || undefined;

    if (format === 'json') {
      const snapshot = await getFinOpsSnapshot(user.id, { months, period });
      return NextResponse.json({
        exportedAt: new Date().toISOString(),
        ...snapshot,
      });
    }

    const csv = await getUsageExportCsv({
      userId: user.id,
      months,
      period,
    });

    const safePeriod = period || new Date().toISOString().slice(0, 7);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="usage-export-${safePeriod}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return authErrorToResponse(error);
  }
}

