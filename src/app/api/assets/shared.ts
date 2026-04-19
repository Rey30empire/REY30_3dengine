import path from 'path';

const DEFAULT_ASSET_ROOT = path.join(process.cwd(), 'download', 'assets');
const DEFAULT_ASSET_BLOB_STORE = 'rey30-assets';

export type AssetStorageBackend = 'filesystem' | 'netlify-blobs';
export type AssetStorageScope = 'filesystem' | 'deploy' | 'global';

function trim(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function getManagedAssetRoot(env: NodeJS.ProcessEnv = process.env): string {
  return path.resolve(env.REY30_ASSET_ROOT || DEFAULT_ASSET_ROOT);
}

export function isNetlifyRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return trim(env.NETLIFY) === 'true' || Boolean(trim(env.CONTEXT)) || Boolean(trim(env.DEPLOY_ID));
}

export function resolveAssetStorageBackend(
  env: NodeJS.ProcessEnv = process.env
): AssetStorageBackend {
  const explicitBackend = trim(env.REY30_ASSET_STORAGE_BACKEND).toLowerCase();
  if (explicitBackend === 'filesystem' || explicitBackend === 'netlify-blobs') {
    return explicitBackend as AssetStorageBackend;
  }

  return isNetlifyRuntime(env) ? 'netlify-blobs' : 'filesystem';
}

export function resolveAssetBlobStoreName(env: NodeJS.ProcessEnv = process.env): string {
  return trim(env.REY30_ASSET_BLOB_STORE) || DEFAULT_ASSET_BLOB_STORE;
}

export function resolveAssetStorageScope(
  env: NodeJS.ProcessEnv = process.env
): AssetStorageScope {
  if (resolveAssetStorageBackend(env) === 'filesystem') {
    return 'filesystem';
  }

  return trim(env.CONTEXT).toLowerCase() === 'production' ? 'global' : 'deploy';
}

export function normalizeAssetStorageRelativePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\/+/, '').trim();
}

export function assertValidAssetStorageRelativePath(relativePath: string): string {
  const normalized = normalizeAssetStorageRelativePath(relativePath);
  if (!normalized) {
    throw new Error('Invalid asset storage path');
  }

  const segments = normalized.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error('Invalid asset storage path');
  }

  return normalized;
}

export function getAssetMimeType(fileName: string): string {
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
    case '.txt':
      return 'text/plain; charset=utf-8';
    case '.ts':
    case '.tsx':
    case '.js':
    case '.jsx':
      return 'text/plain; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}
