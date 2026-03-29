import { NextRequest, NextResponse } from 'next/server';
import { buildProject, type BuildTarget } from '@/engine/reyplay/build/buildPipeline';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';

const VALID_TARGETS: BuildTarget[] = ['web', 'windows-exe', 'windows-msi'];

export async function POST(request: NextRequest) {
  try {
    await requireSession(request, 'EDITOR');
    const body = await request.json();
    const rawTarget = body?.target;
    const target: BuildTarget = VALID_TARGETS.includes(rawTarget) ? rawTarget : 'web';

    if (rawTarget && !VALID_TARGETS.includes(rawTarget)) {
      return NextResponse.json({ error: 'Invalid build target' }, { status: 400 });
    }

    const result = await buildProject(target);

    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    console.error('[build] failed:', error);
    return NextResponse.json({ error: 'Build failed' }, { status: 500 });
  }
}
