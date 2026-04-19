import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_EDITOR_PROJECT_SAVE_SLOT, restoreEditorProjectSaveData } from '@/engine/serialization';
import {
  buildProjectFromState,
  type BuildTarget,
} from '@/engine/reyplay/build/buildPipeline';
import { normalizeProjectKey } from '@/lib/project-key';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import { readEditorProjectRecord } from '@/lib/server/editor-project-storage';

const VALID_TARGETS: BuildTarget[] = ['web', 'windows-exe', 'windows-msi'];

function readProjectKey(request: NextRequest, fallback?: string | null) {
  const bodyProjectKey = fallback?.trim();
  return normalizeProjectKey(
    request.headers.get('x-rey30-project') ||
      request.nextUrl.searchParams.get('projectKey') ||
      bodyProjectKey ||
      null
  );
}

function readSlot(request: NextRequest, fallback?: string | null) {
  return (
    request.nextUrl.searchParams.get('slot')?.trim() ||
    fallback?.trim() ||
    DEFAULT_EDITOR_PROJECT_SAVE_SLOT
  );
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSession(request, 'EDITOR');
    const body = (await request.json().catch(() => ({}))) as {
      target?: unknown;
      projectKey?: string;
      slot?: string;
    };
    const rawTarget = typeof body?.target === 'string' ? body.target : null;
    const target: BuildTarget =
      rawTarget && VALID_TARGETS.includes(rawTarget as BuildTarget)
        ? (rawTarget as BuildTarget)
        : 'web';

    if (rawTarget && !VALID_TARGETS.includes(rawTarget as BuildTarget)) {
      return NextResponse.json({ error: 'Invalid build target' }, { status: 400 });
    }

    const slot = readSlot(request, body.slot);
    const projectKey = readProjectKey(request, body.projectKey);
    const record = readEditorProjectRecord({
      userId: user.id,
      projectKey,
      slot,
    });

    if (!record) {
      return NextResponse.json(
        {
          error: 'No existe un save remoto del proyecto para empaquetar.',
          projectKey,
          slot,
        },
        { status: 409 }
      );
    }

    const restored = restoreEditorProjectSaveData(record.saveData);
    if (!restored) {
      return NextResponse.json(
        {
          error: 'El save remoto del proyecto es inválido.',
          projectKey,
          slot,
        },
        { status: 422 }
      );
    }

    const result = await buildProjectFromState(target, {
      projectName: restored.projectName,
      scenes: restored.scenes,
      entities: restored.entities,
      assets: restored.assets,
      scribProfiles: restored.scribProfiles,
      scribInstances: restored.scribInstances,
      activeSceneId: restored.activeSceneId,
      buildManifest: null,
    });

    return NextResponse.json(
      {
        ...result,
        projectKey,
        slot,
        source: 'remote_editor_project',
      },
      { status: result.ok ? 200 : 400 }
    );
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    console.error('[build] failed:', error);
    return NextResponse.json({ error: 'Build failed' }, { status: 500 });
  }
}
