import { promises as fs } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import {
  getAssetRoot,
  importAssetFromUrl,
  listAssets,
  removeAssetByPath,
  registerAssetFromPath,
  resolveManagedAssetStorageObject,
  updateAssetMetadata,
  type PipelineAssetMetadataPatch,
  type PipelineAssetType,
} from '@/engine/assets/pipeline';
import { normalizeProjectKey, sanitizeLibraryName } from '@/lib/server/projectLibrary';
import {
  extractEditableAssetMetadata,
  recordAssetMetadataHistory,
} from '@/lib/server/asset-browser-state';
import { deleteStoredAssetBinary } from '@/lib/server/asset-storage';
import { runAssetSystemMutation } from '@/lib/server/asset-system-storage';
import { RemoteFetchError } from '@/lib/security/remote-fetch';
import { authErrorToResponse, logSecurityEvent, requireSession } from '@/lib/security/auth';

const VALID_TYPES: PipelineAssetType[] = [
  'mesh',
  'texture',
  'material',
  'modifier_preset',
  'character_preset',
  'audio',
  'video',
  'script',
  'prefab',
  'scene',
  'animation',
  'font',
  'other',
];

const MAX_UPLOAD_BYTES = 250 * 1024 * 1024;
const EXTENSION_TYPE_MAP: Record<string, PipelineAssetType> = {
  '.fbx': 'mesh',
  '.obj': 'mesh',
  '.glb': 'mesh',
  '.gltf': 'mesh',
  '.stl': 'mesh',
  '.png': 'texture',
  '.jpg': 'texture',
  '.jpeg': 'texture',
  '.tga': 'texture',
  '.bmp': 'texture',
  '.webp': 'texture',
  '.hdr': 'texture',
  '.exr': 'texture',
  '.wav': 'audio',
  '.mp3': 'audio',
  '.ogg': 'audio',
  '.flac': 'audio',
  '.mp4': 'video',
  '.mov': 'video',
  '.webm': 'video',
  '.anim': 'animation',
  '.bvh': 'animation',
  '.ts': 'script',
  '.js': 'script',
  '.jsx': 'script',
  '.tsx': 'script',
  '.json': 'scene',
  '.scene': 'scene',
  '.prefab': 'prefab',
  '.ttf': 'font',
  '.otf': 'font',
  '.woff': 'font',
  '.woff2': 'font',
};

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession(request, 'VIEWER');
    const assets = await listAssets();
    await logSecurityEvent({
      request,
      userId: user.id,
      action: 'assets.list',
      status: 'allowed',
    });
    return NextResponse.json({ assets });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    console.error('[assets] list failed:', error);
    return NextResponse.json({ error: 'Failed to list assets' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let actorId: string | null = null;
  let requestedUrl = '';
  try {
    const user = await requireSession(request, 'EDITOR');
    actorId = user.id;
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      return await handleFileUpload(request, user.id);
    }

    const body = await request.json();
    const url: string | undefined = body?.url;
    const name: string | undefined = body?.name;
    const type = body?.type as PipelineAssetType | undefined;
    requestedUrl = typeof url === 'string' ? url : '';

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'url is required' }, { status: 400 });
    }

    if (type && !VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: 'Invalid asset type' }, { status: 400 });
    }

    const asset = await importAssetFromUrl({
      url,
      name,
      type,
    });

    await logSecurityEvent({
      request,
      userId: user.id,
      action: 'assets.import',
      status: 'allowed',
      metadata: {
        type: type || 'auto',
      },
    });

    return NextResponse.json({ asset });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    if (error instanceof RemoteFetchError) {
      await logSecurityEvent({
        request,
        userId: actorId,
        action: 'assets.import',
        status: 'denied',
        metadata: {
          reason: error.code,
          host: safeHostFromUrl(requestedUrl),
        },
      });
      console.warn('[security][assets][import-blocked]', {
        code: error.code,
        status: error.status,
        host: safeHostFromUrl(requestedUrl),
      });
      return NextResponse.json(
        {
          error: 'Asset URL blocked by security policy.',
          code: error.code,
        },
        { status: error.status }
      );
    }

    await logSecurityEvent({
      request,
      userId: actorId,
      action: 'assets.import',
      status: 'error',
      metadata: {
        error: String(error),
        host: safeHostFromUrl(requestedUrl),
      },
    });
    console.error('[assets] import failed:', error);
    return NextResponse.json({ error: 'Asset import failed' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  let actorId: string | null = null;
  let requestedPath = '';
  let requestedId = '';
  try {
    const user = await requireSession(request, 'EDITOR');
    actorId = user.id;
    const { searchParams } = new URL(request.url);
    requestedPath = (searchParams.get('path') || '').trim().replace(/\\/g, '/');
    requestedId = (searchParams.get('id') || '').trim();

    if (!requestedPath && !requestedId) {
      return NextResponse.json({ error: 'path or id is required' }, { status: 400 });
    }

    const assets = await listAssets();
    const asset = assets.find(
      (entry) =>
        (requestedId && entry.id === requestedId) ||
        (requestedPath && entry.path === requestedPath)
    );

    if (!asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    const storage = resolveManagedAssetStorageObject(asset);
    if (!storage || asset.metadata?.library === true) {
      throw new Error('Only managed assets inside the pipeline can be deleted.');
    }

    await deleteStoredAssetBinary(storage);
    await removeAssetByPath({ relPath: asset.path });

    await logSecurityEvent({
      request,
      userId: user.id,
      action: 'assets.delete',
      status: 'allowed',
      metadata: {
        assetId: asset.id,
        path: asset.path,
        type: asset.type,
      },
    });

    return NextResponse.json({
      success: true,
      asset: {
        id: asset.id,
        path: asset.path,
      },
    });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }

    const reason = String(error);
    const denied = reason.includes('managed assets') || reason.includes('Invalid asset path');
    await logSecurityEvent({
      request,
      userId: actorId,
      action: 'assets.delete',
      status: denied ? 'denied' : 'error',
      metadata: {
        path: requestedPath || null,
        assetId: requestedId || null,
        error: reason,
      },
    });

    if (denied) {
      return NextResponse.json({ error: reason }, { status: 400 });
    }

    console.error('[assets] delete failed:', error);
    return NextResponse.json({ error: 'Asset delete failed' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  let actorId: string | null = null;
  try {
    const user = await requireSession(request, 'EDITOR');
    actorId = user.id;
    const body = await request.json().catch(() => ({}));
    const updates = Array.isArray(body?.updates) ? body.updates : [];
    const projectKey = normalizeProjectKey(request.headers.get('x-rey30-project'));

    if (updates.length === 0) {
      return NextResponse.json({ error: 'updates are required' }, { status: 400 });
    }

    if (updates.length > 100) {
      return NextResponse.json({ error: 'Too many asset updates in one request' }, { status: 400 });
    }

    const assets = await listAssets();
    const latestAssets = new Map<string, (typeof assets)[number]>();
    assets.forEach((asset) => {
      latestAssets.set(asset.id, asset);
      latestAssets.set(asset.path, asset);
    });
    const updated: Awaited<ReturnType<typeof updateAssetMetadata>>[] = [];

    for (const entry of updates) {
      const assetId = typeof entry?.id === 'string' ? entry.id.trim() : '';
      const assetPath =
        typeof entry?.path === 'string' ? entry.path.trim().replace(/\\/g, '/') : '';
      const metadata = sanitizeAssetMetadataPatch(entry?.metadata);
      if (!assetId && !assetPath) {
        return NextResponse.json({ error: 'Each update requires id or path' }, { status: 400 });
      }
      if (!metadata) {
        return NextResponse.json({ error: 'Each update requires valid metadata' }, { status: 400 });
      }

      const existing = latestAssets.get(assetId || assetPath) ?? assets.find(
        (asset) => (assetId && asset.id === assetId) || (assetPath && asset.path === assetPath)
      );
      if (!existing) {
        return NextResponse.json(
          { error: `Asset not found for update: ${assetId || assetPath}` },
          { status: 404 }
        );
      }

      const next = await runAssetSystemMutation(async () => {
        const updatedAsset = await updateAssetMetadata({
          assetId: assetId || undefined,
          relPath: assetPath || undefined,
          metadata,
        });
        if (!updatedAsset) {
          return null;
        }
        await recordAssetMetadataHistory({
          assetId: updatedAsset.id,
          path: updatedAsset.path,
          userId: user.id,
          projectKey,
          action: 'metadata.update',
          before: extractEditableAssetMetadata(existing.metadata),
          after: extractEditableAssetMetadata(updatedAsset.metadata),
        });
        return updatedAsset;
      });
      if (!next) {
        return NextResponse.json(
          { error: `Asset metadata update failed: ${assetId || assetPath}` },
          { status: 500 }
        );
      }
      latestAssets.set(next.id, next);
      latestAssets.set(next.path, next);
      updated.push(next);
    }

    await logSecurityEvent({
      request,
      userId: user.id,
      action: 'assets.metadata.update',
      status: 'allowed',
      metadata: {
        count: updated.length,
      },
    });

    return NextResponse.json({
      success: true,
      assets: updated,
    });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }

    await logSecurityEvent({
      request,
      userId: actorId,
      action: 'assets.metadata.update',
      status: 'error',
      metadata: {
        error: String(error),
      },
    });
    console.error('[assets] patch failed:', error);
    return NextResponse.json({ error: 'Asset metadata update failed' }, { status: 500 });
  }
}

function safeHostFromUrl(rawUrl: string): string | null {
  if (!rawUrl) return null;
  try {
    return new URL(rawUrl).hostname;
  } catch {
    return null;
  }
}

async function handleFileUpload(request: NextRequest, userId: string) {
  const formData = await request.formData();
  const files = [
    ...formData.getAll('files').filter((entry): entry is File => entry instanceof File),
    ...formData.getAll('file').filter((entry): entry is File => entry instanceof File),
  ];
  const requestedType = readPipelineType(formData.get('type'));
  const requestedName = String(formData.get('name') || '').trim();
  const requestedFolder = String(formData.get('targetFolder') || '').trim();
  const projectKey = normalizeProjectKey(request.headers.get('x-rey30-project'));

  if (files.length === 0) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 });
  }

  const written: Awaited<ReturnType<typeof registerAssetFromPath>>[] = [];
  for (const [index, file] of files.entries()) {
    const type = resolveUploadType(file.name, requestedType);
    assertValidUploadFile(file, type);

    const ext = resolveUploadExtension(file);
    const fileBaseName =
      files.length === 1 && requestedName
        ? sanitizeFileStem(requestedName, 'asset')
        : sanitizeFileStem(path.basename(file.name, path.extname(file.name)), type);
    const dir = path.join(getAssetRoot(), type, 'uploads', projectKey);
    await fs.mkdir(dir, { recursive: true });

    const fileName = `${fileBaseName}_${Date.now()}_${index}${ext}`;
    const absolutePath = path.join(dir, fileName);
    await fs.writeFile(absolutePath, Buffer.from(await file.arrayBuffer()));

    const asset = await registerAssetFromPath({
      absPath: absolutePath,
      name: fileBaseName,
      type,
      source: 'asset_upload',
      metadata: {
        uploaded: true,
        uploadedBy: userId,
        projectKey,
        scope: 'project',
        originalName: file.name || null,
        mimeType: file.type || null,
        targetFolder: requestedFolder || null,
      },
    });
    written.push(asset);
  }

  await logSecurityEvent({
    request,
    userId,
    action: 'assets.upload',
    status: 'allowed',
    metadata: {
      projectKey,
      count: written.length,
      types: [...new Set(written.map((asset) => asset.type))],
    },
  });

  return NextResponse.json({
    success: true,
    projectKey,
    assets: written,
    asset: written[0] || null,
  });
}

function sanitizeFileStem(value: string, fallback: string) {
  const sanitized = sanitizeLibraryName(value);
  return sanitized.length > 0 ? sanitized : fallback;
}

function readPipelineType(value: FormDataEntryValue | null): PipelineAssetType | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim() as PipelineAssetType;
  return VALID_TYPES.includes(normalized) ? normalized : undefined;
}

function resolveUploadType(fileName: string, requestedType?: PipelineAssetType): PipelineAssetType {
  if (requestedType) return requestedType;
  const ext = path.extname(fileName || '').toLowerCase();
  return EXTENSION_TYPE_MAP[ext] || 'other';
}

function resolveUploadExtension(file: File) {
  const ext = path.extname(file.name || '').toLowerCase();
  if (ext === '.jpeg') return '.jpg';
  if (ext.length > 0) return ext;
  if (file.type === 'image/png') return '.png';
  if (file.type === 'image/jpeg') return '.jpg';
  if (file.type === 'model/gltf-binary') return '.glb';
  if (file.type === 'model/gltf+json') return '.gltf';
  return '.bin';
}

function assertValidUploadFile(file: File, type: PipelineAssetType) {
  if (file.size <= 0) {
    throw new Error('Empty files are not allowed');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`File exceeds ${MAX_UPLOAD_BYTES} bytes limit`);
  }

  const ext = path.extname(file.name || '').toLowerCase();
  if (!ext || !EXTENSION_TYPE_MAP[ext]) {
    throw new Error('Unsupported asset extension');
  }

  if (type !== 'other' && EXTENSION_TYPE_MAP[ext] !== type) {
    throw new Error('Requested asset type does not match file extension');
  }

  const mime = (file.type || '').toLowerCase();
  if (!mime || mime === 'application/octet-stream') return;

  if (type === 'mesh' && (mime.startsWith('model/') || mime.startsWith('text/') || mime === 'application/json')) return;
  if (type === 'texture' && mime.startsWith('image/')) return;
  if (type === 'audio' && mime.startsWith('audio/')) return;
  if (type === 'video' && mime.startsWith('video/')) return;
  if (type === 'script' && (mime.startsWith('text/') || mime.includes('javascript') || mime.includes('typescript'))) return;
  if ((type === 'scene' || type === 'prefab') && (mime === 'application/json' || mime.startsWith('text/'))) return;
  if (type === 'animation' && (mime.startsWith('text/') || mime === 'application/json')) return;
  if (type === 'font' && (mime.startsWith('font/') || mime.includes('woff') || mime === 'application/octet-stream')) return;
  if (type === 'other') return;

  throw new Error('Unsupported MIME type for asset upload');
}

function sanitizeAssetMetadataPatch(value: unknown): PipelineAssetMetadataPatch | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const source = value as Record<string, unknown>;
  const next: PipelineAssetMetadataPatch = {};

  if ('favorite' in source) {
    next.favorite = Boolean(source.favorite);
  }

  const tags = normalizeMetadataList(source.tags);
  if (tags !== null) {
    next.tags = tags;
  }

  const collections = normalizeMetadataList(source.collections);
  if (collections !== null) {
    next.collections = collections;
  }

  if ('notes' in source) {
    next.notes = typeof source.notes === 'string' ? source.notes.trim() : '';
  }

  if ('versionGroupKey' in source && typeof source.versionGroupKey === 'string') {
    const key = source.versionGroupKey.trim().toLowerCase();
    if (key) {
      next.versionGroupKey = key;
    }
  }

  return Object.keys(next).length > 0 ? next : null;
}

function normalizeMetadataList(value: unknown) {
  if (value === undefined) {
    return null;
  }
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  return value
    .flatMap((entry) => (typeof entry === 'string' ? [entry.trim()] : []))
    .filter((entry) => entry.length > 0)
    .filter((entry) => {
      const key = entry.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.localeCompare(b));
}
