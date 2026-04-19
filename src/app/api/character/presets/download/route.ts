import { NextRequest, NextResponse } from 'next/server';
import {
  buildCharacterPresetExportManifest,
  parseCharacterPresetDocument,
} from '@/lib/character-preset-document';
import { normalizeProjectKey } from '@/lib/project-key';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import { readProjectLibraryEntry, sanitizeLibraryName } from '@/lib/server/projectLibrary';

function resolveProjectKey(request: NextRequest) {
  const searchValue = request.nextUrl.searchParams.get('projectKey');
  return normalizeProjectKey(searchValue || request.headers.get('x-rey30-project'));
}

export async function GET(request: NextRequest) {
  try {
    await requireSession(request, 'VIEWER');
    const projectKey = resolveProjectKey(request);
    const name = sanitizeLibraryName(request.nextUrl.searchParams.get('name') || '');
    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const entry = await readProjectLibraryEntry({
      kind: 'character_preset',
      projectKey,
      name,
      scope: 'project',
      parser: parseCharacterPresetDocument,
    });
    if (!entry) {
      return NextResponse.json({ error: 'Character preset not found' }, { status: 404 });
    }

    const manifest = buildCharacterPresetExportManifest(projectKey, entry.definition);
    return new NextResponse(JSON.stringify(manifest, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${entry.name}.character-preset.json"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    console.error('[character-presets][download] failed:', error);
    return NextResponse.json({ error: 'Failed to export character preset' }, { status: 500 });
  }
}
