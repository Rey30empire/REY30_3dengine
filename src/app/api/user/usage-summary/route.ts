import { NextRequest, NextResponse } from 'next/server';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import { getUsageSummary } from '@/lib/security/usage-governance';

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession(request, 'VIEWER');
    const period = new URL(request.url).searchParams.get('period') || undefined;
    const summary = await getUsageSummary(user.id, period);
    return NextResponse.json({ summary });
  } catch (error) {
    return authErrorToResponse(error);
  }
}

