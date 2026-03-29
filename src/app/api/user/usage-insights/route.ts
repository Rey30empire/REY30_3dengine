import { NextRequest, NextResponse } from 'next/server';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import { getUsageInsights } from '@/lib/security/usage-governance';

function parseMonths(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.floor(parsed);
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession(request, 'VIEWER');
    const url = new URL(request.url);
    const months = parseMonths(url.searchParams.get('months'));
    const period = url.searchParams.get('period') || undefined;
    const insights = await getUsageInsights(user.id, { months, period });

    return NextResponse.json({
      insights,
      note: 'Panel FinOps con tendencias y recomendaciones de ahorro por cuenta.',
    });
  } catch (error) {
    return authErrorToResponse(error);
  }
}

