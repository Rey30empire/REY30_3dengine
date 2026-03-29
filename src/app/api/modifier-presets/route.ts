import {
  removeAssetByPath,
  registerAssetFromPath,
} from '@/engine/assets/pipeline';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import {
  buildProjectLibraryRelativePath,
  type ProjectLibraryScope,
  deleteProjectLibraryEntry,
  listProjectLibraryEntries,
  normalizeProjectKey,
  sanitizeLibraryName,
  writeProjectLibraryEntry,
} from '@/lib/server/projectLibrary';
import {
  parseMeshModifierStack,
  parseMeshModifierStackDocument,
} from '@/engine/editor/meshModifiers';
import { NextRequest, NextResponse } from 'next/server';

function resolveProjectKey(request: NextRequest) {
  return normalizeProjectKey(request.headers.get('x-rey30-project'));
}

function resolveScope(value: string | null | undefined): ProjectLibraryScope {
  return value === 'shared' ? 'shared' : 'project';
}

export async function GET(request: NextRequest) {
  try {
    await requireSession(request, 'VIEWER');
    const projectKey = resolveProjectKey(request);

    const presets = await listProjectLibraryEntries({
      kind: 'modifier_preset',
      projectKey,
      includeShared: true,
      parser: parseMeshModifierStackDocument,
    });

    return NextResponse.json({
      projectKey,
      presets,
    });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    console.error('[modifier-presets] list failed:', error);
    return NextResponse.json({ error: 'Failed to list modifier presets' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireSession(request, 'EDITOR');
    const projectKey = resolveProjectKey(request);

    const body = (await request.json().catch(() => ({}))) as {
      name?: string;
      description?: string;
      modifiers?: unknown;
      scope?: string;
    };
    const name = sanitizeLibraryName(body.name || 'modifier_preset') || 'modifier_preset';
    const scope = resolveScope(body.scope);
    const modifiers = parseMeshModifierStack(body.modifiers);
    if (modifiers.length === 0) {
      return NextResponse.json({ error: 'modifiers are required' }, { status: 400 });
    }

    const definition = {
      version: 1 as const,
      name,
      description:
        typeof body.description === 'string' && body.description.trim().length > 0
          ? body.description.trim()
          : undefined,
      savedAt: new Date().toISOString(),
      modifiers,
    };
    const saved = await writeProjectLibraryEntry({
      kind: 'modifier_preset',
      projectKey,
      name,
      scope,
      definition,
    });

    const asset = await registerAssetFromPath({
      absPath: saved.absolutePath,
      name,
      type: 'modifier_preset',
      source: 'modeler_panel',
      metadata: {
        library: true,
        projectKey: saved.projectKey,
        scope: saved.scope,
        presetName: name,
      },
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
    console.error('[modifier-presets] save failed:', error);
    return NextResponse.json({ error: 'Failed to save modifier preset' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireSession(request, 'EDITOR');
    const projectKey = resolveProjectKey(request);
    const name = sanitizeLibraryName(request.nextUrl.searchParams.get('name') || '');
    const scope = resolveScope(request.nextUrl.searchParams.get('scope'));
    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const deleted = await deleteProjectLibraryEntry({
      kind: 'modifier_preset',
      projectKey,
      name,
      scope,
    });
    if (!deleted) {
      return NextResponse.json({ error: 'Modifier preset not found' }, { status: 404 });
    }

    await removeAssetByPath({
      relPath: buildProjectLibraryRelativePath({
        kind: 'modifier_preset',
        projectKey,
        name,
        scope,
      }),
    });

    return NextResponse.json({ success: true, projectKey, scope, name });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    console.error('[modifier-presets] delete failed:', error);
    return NextResponse.json({ error: 'Failed to delete modifier preset' }, { status: 500 });
  }
}
