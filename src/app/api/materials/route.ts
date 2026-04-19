import {
  removeAssetByPath,
  registerAssetFromPath,
} from '@/engine/assets/pipeline';
import { sanitizeMaterialDefinition } from '@/engine/editor/editorMaterials';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import {
  buildProjectLibraryRelativePath,
  type ProjectLibraryScope,
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

function resolveScope(value: string | null | undefined): ProjectLibraryScope {
  return value === 'shared' ? 'shared' : 'project';
}

export async function GET(request: NextRequest) {
  try {
    await requireSession(request, 'VIEWER');
    const projectKey = resolveProjectKey(request);

    const materials = await listProjectLibraryEntries({
      kind: 'material',
      projectKey,
      includeShared: true,
      parser: (value) => sanitizeMaterialDefinition(value),
    });

    return NextResponse.json({
      projectKey,
      materials,
    });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    console.error('[materials] list failed:', error);
    return NextResponse.json({ error: 'Failed to list materials' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireSession(request, 'EDITOR');
    const projectKey = resolveProjectKey(request);

    const body = (await request.json().catch(() => ({}))) as {
      name?: string;
      material?: unknown;
      scope?: string;
    };
    const rawName = typeof body.name === 'string' ? body.name : 'material';
    const name = sanitizeLibraryName(rawName) || 'material';
    const scope = resolveScope(body.scope);
    const material = sanitizeMaterialDefinition(body.material);
    if (!material) {
      return NextResponse.json({ error: 'material is required' }, { status: 400 });
    }
    const { saved, asset } = await runProjectLibraryMutation(async () => {
      const saved = await writeProjectLibraryEntry({
        kind: 'material',
        projectKey,
        name,
        scope,
        definition: material,
      });

      const asset = await registerAssetFromPath({
        absPath: saved.absolutePath,
        name,
        type: 'material',
        source: 'material_editor',
        metadata: {
          library: true,
          projectKey: saved.projectKey,
          scope: saved.scope,
          materialName: name,
        },
      });

      return { saved, asset };
    });

    return NextResponse.json({
      success: true,
      projectKey: saved.projectKey,
      scope: saved.scope,
      asset,
      path: saved.relativePath,
      material,
    });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    console.error('[materials] save failed:', error);
    return NextResponse.json({ error: 'Failed to save material' }, { status: 500 });
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

    const deleted = await runProjectLibraryMutation(async () => {
      const deleted = await deleteProjectLibraryEntry({
        kind: 'material',
        projectKey,
        name,
        scope,
      });
      if (!deleted) {
        return false;
      }

      await removeAssetByPath({
        relPath: buildProjectLibraryRelativePath({
          kind: 'material',
          projectKey,
          name,
          scope,
        }),
      });

      return true;
    });
    if (!deleted) {
      return NextResponse.json({ error: 'Material not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, projectKey, scope, name });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    console.error('[materials] delete failed:', error);
    return NextResponse.json({ error: 'Failed to delete material' }, { status: 500 });
  }
}
