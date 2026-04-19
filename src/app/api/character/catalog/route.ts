import { NextRequest, NextResponse } from 'next/server';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import { normalizeProjectKey } from '@/lib/project-key';
import { listCharacterCatalog } from '@/lib/server/character-catalog';

function resolveProjectKey(request: NextRequest) {
  return normalizeProjectKey(request.headers.get('x-rey30-project'));
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession(request, 'VIEWER');
    const projectKey = resolveProjectKey(request);
    const catalog = await listCharacterCatalog({
      userId: user.id,
      projectKey,
    });

    return NextResponse.json(catalog);
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    console.error('[character-catalog] list failed:', error);
    return NextResponse.json({ error: 'Failed to list character catalog' }, { status: 500 });
  }
}
