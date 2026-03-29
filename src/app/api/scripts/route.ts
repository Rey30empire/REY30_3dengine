import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import {
  deleteStoredScript,
  getScriptStorageInfo,
  getStoredScript,
  listStoredScripts,
  upsertStoredScript,
} from '@/lib/server/script-storage';
import {
  isInvalidScriptPathError,
  ScriptListItem,
  normalizeRelativePath,
  normalizeScriptRelativePath,
  normalizeScriptName,
} from './shared';

interface ScriptCreateBody {
  name?: string;
  directory?: string;
  content?: string;
  overwrite?: boolean;
  onExists?: 'error' | 'return-existing';
}

interface ScriptSaveBody {
  path?: string;
  content?: string;
}

function defaultScriptTemplate(name: string): string {
  const baseName = path.basename(name, path.extname(name));
  const exportName = baseName.replace(/[^a-zA-Z0-9_]/g, '_') || 'Script';

  return `// ${name}
// Generado por REY30 Script Workspace

export interface ${exportName}Context {
  deltaTime: number;
  entityId?: string;
}

export function update(context: ${exportName}Context): void {
  // TODO: agrega la logica del script.
  console.log('[${exportName}] tick', context.deltaTime);
}
`;
}

function readScriptResponsePayload(script: {
  name: string;
  relativePath: string;
  size: number;
  modifiedAt: string;
  content: string;
}) {
  return {
    name: script.name,
    relativePath: script.relativePath,
    size: script.size,
    modifiedAt: script.modifiedAt,
    content: script.content,
  };
}

export async function GET(request: NextRequest) {
  try {
    await requireSession(request, 'VIEWER');

    const { searchParams } = new URL(request.url);
    const targetPath = searchParams.get('path');

    if (targetPath) {
      const script = await getStoredScript(targetPath);
      if (!script) {
        return NextResponse.json(
          {
            error: 'Script not found',
            path: normalizeScriptRelativePath(targetPath),
          },
          { status: 404 }
        );
      }

      return NextResponse.json({
        script: readScriptResponsePayload(script),
      });
    }

    const scripts: ScriptListItem[] = await listStoredScripts();
    scripts.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());

    return NextResponse.json({
      root: 'scripts',
      backend: getScriptStorageInfo().backend,
      scripts,
    });
  } catch (error) {
    if (isInvalidScriptPathError(error)) {
      return NextResponse.json(
        {
          error: 'Invalid script path',
          scripts: [],
        },
        { status: 400 }
      );
    }
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    console.error('[scripts][GET] failed:', error);
    return NextResponse.json(
      {
        error: 'Failed to load scripts',
        scripts: [],
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireSession(request, 'EDITOR');
    const body = (await request.json()) as ScriptCreateBody;

    const rawName = body.name || '';
    const scriptName = normalizeScriptName(rawName);
    if (!scriptName) {
      return NextResponse.json({ error: 'Script name is required' }, { status: 400 });
    }

    const directory = normalizeScriptRelativePath(body.directory || '');
    const relativePath = normalizeRelativePath(path.posix.join(directory, scriptName));
    const onExists = body.onExists === 'return-existing' ? 'return-existing' : 'error';
    const existing = await getStoredScript(relativePath);

    if (existing && !body.overwrite) {
      if (onExists === 'return-existing') {
        return NextResponse.json({
          created: false,
          script: readScriptResponsePayload(existing),
        });
      }
      return NextResponse.json({ error: 'Script already exists' }, { status: 409 });
    }

    const content = typeof body.content === 'string' ? body.content : defaultScriptTemplate(scriptName);
    const script = await upsertStoredScript(relativePath, content);

    return NextResponse.json({
      created: true,
      script: readScriptResponsePayload(script),
    });
  } catch (error) {
    if (isInvalidScriptPathError(error)) {
      return NextResponse.json({ error: 'Invalid script path' }, { status: 400 });
    }
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    console.error('[scripts][POST] failed:', {
      storage: getScriptStorageInfo(),
      error,
    });
    return NextResponse.json({ error: 'Failed to create script' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireSession(request, 'EDITOR');
    const body = (await request.json()) as ScriptSaveBody;

    if (!body.path || typeof body.content !== 'string') {
      return NextResponse.json({ error: 'path and content are required' }, { status: 400 });
    }

    const script = await upsertStoredScript(body.path, body.content);

    return NextResponse.json({
      script: {
        name: script.name,
        relativePath: script.relativePath,
        size: script.size,
        modifiedAt: script.modifiedAt,
      },
    });
  } catch (error) {
    if (isInvalidScriptPathError(error)) {
      return NextResponse.json({ error: 'Invalid script path' }, { status: 400 });
    }
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    console.error('[scripts][PUT] failed:', error);
    return NextResponse.json({ error: 'Failed to save script' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireSession(request, 'EDITOR');
    const { searchParams } = new URL(request.url);
    const targetPath = searchParams.get('path');

    if (!targetPath) {
      return NextResponse.json({ error: 'path query param is required' }, { status: 400 });
    }

    const existing = await getStoredScript(targetPath);
    if (!existing) {
      return NextResponse.json({ error: 'Script not found' }, { status: 404 });
    }

    await deleteStoredScript(targetPath);

    return NextResponse.json({
      success: true,
      deleted: existing.relativePath,
    });
  } catch (error) {
    if (isInvalidScriptPathError(error)) {
      return NextResponse.json({ error: 'Invalid script path' }, { status: 400 });
    }
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    console.error('[scripts][DELETE] failed:', error);
    return NextResponse.json({ error: 'Failed to delete script' }, { status: 500 });
  }
}
