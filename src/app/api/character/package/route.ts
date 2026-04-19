import { NextRequest, NextResponse } from 'next/server';
import type { SavedModularCharacterDetail } from '@/engine/modular-character';
import {
  buildCharacterPresetExportManifest,
  type CharacterPresetDocument,
  parseCharacterPresetDocument,
} from '@/lib/character-preset-document';
import {
  buildBuilderPresetPackageAssets,
  buildBuilderPresetPackageName,
  buildModularCharacterPackageAssets,
  buildModularCharacterPackageName,
  toStoredPackageSummary,
  type CharacterUnifiedPackageDocument,
} from '@/lib/character-unified-package';
import { normalizeProjectKey } from '@/lib/project-key';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import { getModularCharacterDetail } from '@/lib/server/modular-character-service';
import { upsertStoredPackage } from '@/lib/server/package-storage';
import {
  buildProjectLibraryRelativePath,
  type ProjectLibraryEntry,
  readProjectLibraryEntry,
  sanitizeLibraryName,
} from '@/lib/server/projectLibrary';

type CharacterPresetLibraryEntry = ProjectLibraryEntry<CharacterPresetDocument>;

function resolveProjectKey(request: NextRequest) {
  return normalizeProjectKey(
    request.nextUrl.searchParams.get('projectKey') || request.headers.get('x-rey30-project')
  );
}

function buildBuilderPresetDocument(input: {
  projectKey: string;
  name: string;
  entry: CharacterPresetLibraryEntry;
  exportedBy: {
    id: string | null;
    email?: string | null;
  };
}) {
  const exportedAt = new Date().toISOString();
  const presetManifest = buildCharacterPresetExportManifest(input.projectKey, input.entry.definition);
  const assets = buildBuilderPresetPackageAssets({
    manifest: presetManifest,
    libraryPath: buildProjectLibraryRelativePath({
      kind: 'character_preset',
      projectKey: input.projectKey,
      name: input.name,
      scope: 'project',
    }),
  });
  const variantCount =
    Object.keys(input.entry.definition.preset.materialVariants ?? {}).length +
    Object.keys(
      input.entry.definition.preset.colorVariants ?? input.entry.definition.preset.colors ?? {}
    ).length;

  return {
    packageName: buildBuilderPresetPackageName(input.projectKey, input.entry.definition.name),
    exportedAt,
    document: {
      version: 1,
      packageName: buildBuilderPresetPackageName(input.projectKey, input.entry.definition.name),
      exportedAt,
      projectKey: input.projectKey,
      source: {
        kind: 'builder_preset',
        sourceId: input.entry.definition.id,
        sourceName: input.entry.definition.name,
        workspace: 'builder',
      },
      ownership: {
        ownerUserId: input.entry.definition.metadata?.ownerUserId ?? null,
        ownerEmail: input.entry.definition.metadata?.ownerEmail ?? null,
        exportedByUserId: input.exportedBy.id,
        exportedByEmail: input.exportedBy.email ?? null,
      },
      stats: {
        partCount: Object.values(input.entry.definition.preset.parts).filter(
          (partId): partId is string => typeof partId === 'string' && partId.trim().length > 0
        ).length,
        variantCount,
        hasRig: null,
        meshCount: null,
        materialCount: null,
        animationCount: null,
      },
      assets,
      payload: {
        kind: 'builder_preset',
        preset: presetManifest,
      },
    } satisfies CharacterUnifiedPackageDocument,
    assets,
  };
}

function buildModularCharacterDocument(input: {
  projectKey: string;
  detail: SavedModularCharacterDetail;
  exportedBy: {
    id: string | null;
    email?: string | null;
  };
}) {
  const exportedAt = new Date().toISOString();
  const assets = buildModularCharacterPackageAssets({
    detail: input.detail,
  });

  return {
    packageName: buildModularCharacterPackageName(input.projectKey, input.detail.name),
    exportedAt,
    document: {
      version: 1,
      packageName: buildModularCharacterPackageName(input.projectKey, input.detail.name),
      exportedAt,
      projectKey: input.projectKey,
      source: {
        kind: 'modular_character',
        sourceId: input.detail.id,
        sourceName: input.detail.name,
        workspace: 'modular-lab',
      },
      ownership: {
        ownerUserId: input.exportedBy.id,
        ownerEmail: input.exportedBy.email ?? null,
        exportedByUserId: input.exportedBy.id,
        exportedByEmail: input.exportedBy.email ?? null,
      },
      stats: {
        partCount: input.detail.partCount,
        variantCount: 0,
        hasRig: input.detail.hasRig,
        meshCount: input.detail.meshCount,
        materialCount: input.detail.materialCount,
        animationCount: input.detail.animationCount,
      },
      assets,
      payload: {
        kind: 'modular_character',
        character: input.detail,
      },
    } satisfies CharacterUnifiedPackageDocument,
    assets,
  };
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession(request, 'VIEWER');
    const projectKey = resolveProjectKey(request);
    const kind = request.nextUrl.searchParams.get('kind');

    let packageName = '';
    let document: CharacterUnifiedPackageDocument | null = null;
    let assets = [] as Array<{ id: string; name: string; type: string; path: string }>;

    if (kind === 'builder_preset') {
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

      const built = buildBuilderPresetDocument({
        projectKey,
        name,
        entry,
        exportedBy: {
          id: user.id,
          email: user.email ?? null,
        },
      });
      packageName = built.packageName;
      document = built.document;
      assets = built.assets;
    } else if (kind === 'modular_character') {
      const characterId = (request.nextUrl.searchParams.get('id') || '').trim();
      if (!characterId) {
        return NextResponse.json({ error: 'id is required' }, { status: 400 });
      }

      const detail = await getModularCharacterDetail(user.id, characterId);
      const built = buildModularCharacterDocument({
        projectKey,
        detail,
        exportedBy: {
          id: user.id,
          email: user.email ?? null,
        },
      });
      packageName = built.packageName;
      document = built.document;
      assets = built.assets;
    } else {
      return NextResponse.json(
        { error: 'kind must be builder_preset or modular_character' },
        { status: 400 }
      );
    }

    const storedPackage = await upsertStoredPackage({
      name: packageName,
      kinds: ['character', document.source.kind],
      assets,
    });

    document.storedPackage = toStoredPackageSummary(storedPackage);

    return new NextResponse(JSON.stringify(document, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${packageName}.character-package.json"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    if (String(error).includes('NOT_FOUND')) {
      return NextResponse.json({ error: 'Modular character not found' }, { status: 404 });
    }
    console.error('[character-package] failed:', error);
    return NextResponse.json({ error: 'Failed to export character package' }, { status: 500 });
  }
}
