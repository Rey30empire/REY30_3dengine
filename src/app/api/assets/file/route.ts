import { promises as fs } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import {
  getAssetRoot,
  listAssets,
  resolveManagedAssetAbsolutePath,
  resolveManagedAssetStorageObject,
  type PipelineAsset,
} from '@/engine/assets/pipeline';
import { getStoredAssetBinary } from '@/lib/server/asset-storage';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';

function getMimeType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.bmp':
      return 'image/bmp';
    case '.svg':
      return 'image/svg+xml';
    case '.hdr':
      return 'image/vnd.radiance';
    case '.exr':
      return 'image/x-exr';
    case '.glb':
      return 'model/gltf-binary';
    case '.gltf':
      return 'model/gltf+json';
    case '.json':
      return 'application/json';
    case '.mp3':
      return 'audio/mpeg';
    case '.wav':
      return 'audio/wav';
    case '.ogg':
      return 'audio/ogg';
    case '.mp4':
      return 'video/mp4';
    case '.webm':
      return 'video/webm';
    default:
      return 'application/octet-stream';
  }
}

const TRANSPARENT_PREVIEW_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==',
  'base64'
);

function isImagePreviewPath(fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase();
  return ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.svg'].includes(ext);
}

function buildMissingPreviewResponse() {
  return new NextResponse(new Uint8Array(TRANSPARENT_PREVIEW_PNG), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'private, max-age=60',
      'X-REY30-Preview-Missing': '1',
    },
  });
}

export async function GET(request: NextRequest) {
  let requestedPath = '';
  let requestedId = '';
  let previewRequested = false;

  try {
    await requireSession(request, 'VIEWER');

    const { searchParams } = new URL(request.url);
    requestedPath = (searchParams.get('path') || '').trim().replace(/\\/g, '/');
    requestedId = (searchParams.get('id') || '').trim();
    previewRequested = searchParams.get('preview') === '1';

    if (!requestedPath && !requestedId) {
      return NextResponse.json(
        { error: 'path or id query param is required' },
        { status: 400 }
      );
    }

    const assets = await listAssets();
    const asset = assets.find(
      (entry) =>
        (requestedId && entry.id === requestedId) ||
        (requestedPath && entry.path === requestedPath)
    );

    if (!asset) {
      if (previewRequested && requestedPath && isImagePreviewPath(requestedPath)) {
        return buildMissingPreviewResponse();
      }
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    const { content, contentType } = await readAssetContent(asset);
    return new NextResponse(new Uint8Array(content), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': asset.type === 'texture' ? 'private, max-age=300' : 'no-store',
      },
    });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    if (previewRequested && requestedPath && isImagePreviewPath(requestedPath)) {
      return buildMissingPreviewResponse();
    }
    if (String(error).includes('Invalid asset path')) {
      return NextResponse.json({ error: 'Invalid asset path' }, { status: 400 });
    }
    console.error('[assets][file] failed:', error);
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
}

async function readAssetContent(asset: PipelineAsset): Promise<{
  content: Buffer;
  contentType: string;
}> {
  if (asset.metadata?.library === true) {
    const filePath = resolveAssetFilePath(asset);
    const content = await fs.readFile(filePath);
    return {
      content,
      contentType: getMimeType(asset.path),
    };
  }

  const storage = resolveManagedAssetStorageObject(asset);
  if (storage) {
    const stored = await getStoredAssetBinary(storage);
    if (stored) {
      return {
        content: stored.buffer,
        contentType: stored.contentType || getMimeType(asset.path),
      };
    }

    if (storage.backend !== 'filesystem') {
      throw new Error('Asset file not found');
    }
  }

  const filePath = resolveAssetFilePath(asset);
  const content = await fs.readFile(filePath);
  return {
    content,
    contentType: getMimeType(asset.path),
  };
}

function resolveAssetFilePath(asset: PipelineAsset) {
  if (asset.metadata?.library === true) {
    const filePath = path.resolve(process.cwd(), asset.path);
    const relativeToCwd = path.relative(process.cwd(), filePath);
    if (relativeToCwd.startsWith('..') || path.isAbsolute(relativeToCwd)) {
      throw new Error('Invalid asset path');
    }
    return filePath;
  }

  const filePath = resolveManagedAssetAbsolutePath(asset);
  const assetRoot = path.resolve(getAssetRoot());
  const relativeToRoot = path.relative(assetRoot, filePath);
  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    throw new Error('Invalid asset path');
  }

  return filePath;
}
