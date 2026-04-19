import {
  removeAssetByPath,
  registerAssetFromPath,
} from '@/engine/assets/pipeline';
import {
  buildCharacterPresetDocument,
  parseStoredCharacterPreset,
} from '@/lib/character-preset-document';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import {
  buildProjectLibraryRelativePath,
  deleteProjectLibraryEntry,
  listProjectLibraryEntries,
  normalizeProjectKey,
  runProjectLibraryMutation,
  sanitizeLibraryName,
  writeProjectLibraryEntry,
} from '@/lib/server/projectLibrary';
import { NextRequest, NextResponse } from 'next/server';

function resolveProjectKey(request: NextRequest) {
  return normalizeProjectKey(request.headers.get('x-rey30-project'));
}

export async function GET(request: NextRequest) {
  try {
    await requireSession(request, 'VIEWER');
    const projectKey = resolveProjectKey(request);

    const presets = await listProjectLibraryEntries({
      kind: 'character_preset',
      projectKey,
      includeShared: false,
      parser: parseStoredCharacterPreset,
    });

    return NextResponse.json({
      projectKey,
      presets,
    });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    console.error('[character-presets] list failed:', error);
    return NextResponse.json({ error: 'Failed to list character presets' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSession(request, 'EDITOR');
    const projectKey = resolveProjectKey(request);
    const body = (await request.json().catch(() => ({}))) as {
      entry?: unknown;
    };
    const entry = parseStoredCharacterPreset(body.entry);
    if (!entry) {
      return NextResponse.json({ error: 'entry is required' }, { status: 400 });
    }

    const name = sanitizeLibraryName(entry.name) || 'character_preset';
    const definition = buildCharacterPresetDocument(entry, {
      projectKey,
      ownerUserId: user.id,
      ownerEmail: user.email ?? null,
      exportedAt: new Date().toISOString(),
    });

    const { saved, asset } = await runProjectLibraryMutation(async () => {
      const saved = await writeProjectLibraryEntry({
        kind: 'character_preset',
        projectKey,
        name,
        scope: 'project',
        definition,
      });

      const asset = await registerAssetFromPath({
        absPath: saved.absolutePath,
        name: entry.name,
        type: 'character_preset',
        source: 'character_builder',
        metadata: {
          library: true,
          projectKey: saved.projectKey,
          scope: saved.scope,
          presetId: definition.id,
          presetName: definition.name,
          ownerUserId: user.id,
        },
      });

      return { saved, asset };
    });

    return NextResponse.json({
      success: true,
      projectKey: saved.projectKey,
      scope: saved.scope,
      path: saved.relativePath,
      asset,
      preset: definition,
    });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    console.error('[character-presets] save failed:', error);
    return NextResponse.json({ error: 'Failed to save character preset' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireSession(request, 'EDITOR');
    const projectKey = resolveProjectKey(request);
    const name = sanitizeLibraryName(request.nextUrl.searchParams.get('name') || '');
    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const deleted = await runProjectLibraryMutation(async () => {
      const deleted = await deleteProjectLibraryEntry({
        kind: 'character_preset',
        projectKey,
        name,
        scope: 'project',
      });
      if (!deleted) {
        return false;
      }

      await removeAssetByPath({
        relPath: buildProjectLibraryRelativePath({
          kind: 'character_preset',
          projectKey,
          name,
          scope: 'project',
        }),
      });
      return true;
    });
    if (!deleted) {
      return NextResponse.json({ error: 'Character preset not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, projectKey, scope: 'project', name });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    console.error('[character-presets] delete failed:', error);
    return NextResponse.json({ error: 'Failed to delete character preset' }, { status: 500 });
  }
}
