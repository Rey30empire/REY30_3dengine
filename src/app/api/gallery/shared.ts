import path from 'path';

const DEFAULT_GALLERY_ROOT = path.join(
  process.env.LOCALAPPDATA || process.cwd(),
  'REY30_gallery_store'
);
const DEFAULT_GALLERY_BLOB_STORE = 'rey30-gallery';
const DEFAULT_INPUT_GALLERY_ROOT = path.join(process.cwd(), 'input_Galeria_Rey30');

export const DEFAULT_GALLERY_SUBFOLDERS = [
  'personajes_3d',
  'escenas',
  'animaciones',
  'armas',
  'texturas',
  'audio',
  'video',
  'scripts',
  'otros',
];

export type GalleryStorageBackend = 'filesystem' | 'netlify-blobs';
export type GalleryStorageScope = 'filesystem' | 'deploy' | 'global';

export type GalleryKind =
  | 'model'
  | 'texture'
  | 'animation'
  | 'scene'
  | 'character'
  | 'video'
  | 'audio'
  | 'script'
  | 'other';

export interface GalleryListItem {
  name: string;
  url: string;
  relativePath: string;
  filePath: string;
  size: number;
  modifiedAt: string;
  kind: GalleryKind;
  category: string;
}

export class InvalidGalleryPathError extends Error {
  constructor(message = 'Invalid gallery path') {
    super(message);
    this.name = 'InvalidGalleryPathError';
  }
}

function trim(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function getGalleryRoot(env: NodeJS.ProcessEnv = process.env): string {
  return path.resolve(env.REY30_GALLERY_ROOT || DEFAULT_GALLERY_ROOT);
}

export function getInputGalleryRoot(env: NodeJS.ProcessEnv = process.env): string {
  return path.resolve(env.REY30_INPUT_GALLERY_ROOT || DEFAULT_INPUT_GALLERY_ROOT);
}

export function isNetlifyRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return trim(env.NETLIFY) === 'true' || Boolean(trim(env.CONTEXT)) || Boolean(trim(env.DEPLOY_ID));
}

export function resolveGalleryStorageBackend(
  env: NodeJS.ProcessEnv = process.env
): GalleryStorageBackend {
  const explicit = trim(env.REY30_GALLERY_STORAGE_BACKEND).toLowerCase();
  if (explicit === 'filesystem' || explicit === 'netlify-blobs') {
    return explicit as GalleryStorageBackend;
  }

  return isNetlifyRuntime(env) ? 'netlify-blobs' : 'filesystem';
}

export function resolveGalleryBlobStoreName(env: NodeJS.ProcessEnv = process.env): string {
  return trim(env.REY30_GALLERY_BLOB_STORE) || DEFAULT_GALLERY_BLOB_STORE;
}

export function resolveGalleryStorageScope(
  env: NodeJS.ProcessEnv = process.env
): GalleryStorageScope {
  if (resolveGalleryStorageBackend(env) === 'filesystem') {
    return 'filesystem';
  }

  return trim(env.CONTEXT).toLowerCase() === 'production' ? 'global' : 'deploy';
}

export function normalizeGalleryRelativePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\/+/, '').trim();
}

export function assertValidGalleryRelativePath(relativePath: string): string {
  const normalized = normalizeGalleryRelativePath(relativePath);
  if (!normalized) {
    throw new InvalidGalleryPathError();
  }

  const segments = normalized.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new InvalidGalleryPathError();
  }

  return normalized;
}

export function sanitizeGallerySegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function inferGalleryKind(fileName: string): GalleryKind {
  const ext = path.extname(fileName).toLowerCase();
  if (['.glb', '.gltf', '.fbx', '.obj', '.stl'].includes(ext)) return 'model';
  if (['.png', '.jpg', '.jpeg', '.webp', '.tga', '.exr'].includes(ext)) return 'texture';
  if (['.anim', '.bvh'].includes(ext)) return 'animation';
  if (['.scene', '.json'].includes(ext)) return 'scene';
  if (['.mp4', '.mov', '.webm'].includes(ext)) return 'video';
  if (['.mp3', '.wav', '.ogg'].includes(ext)) return 'audio';
  if (['.ts', '.js', '.lua', '.tsx', '.jsx', '.mjs', '.cjs'].includes(ext)) return 'script';
  if (['.chr', '.avatar'].includes(ext)) return 'character';
  return 'other';
}

export function getGalleryMimeType(fileName: string): string {
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
    case '.mp4':
      return 'video/mp4';
    case '.webm':
      return 'video/webm';
    case '.mp3':
      return 'audio/mpeg';
    case '.wav':
      return 'audio/wav';
    case '.glb':
      return 'model/gltf-binary';
    case '.gltf':
      return 'model/gltf+json';
    case '.json':
      return 'application/json';
    case '.ts':
    case '.tsx':
    case '.js':
    case '.jsx':
    case '.mjs':
    case '.cjs':
    case '.lua':
      return 'text/plain; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}

export function buildGalleryFileUrl(relativePath: string): string {
  return `/api/gallery/file?path=${encodeURIComponent(assertValidGalleryRelativePath(relativePath))}`;
}

export function resolveGalleryVirtualFileName(relativePath: string): string {
  const normalized = assertValidGalleryRelativePath(relativePath);
  const backend = resolveGalleryStorageBackend();
  if (backend === 'filesystem') {
    return path.resolve(getGalleryRoot(), normalized);
  }

  return path.posix.join('gallery', normalized);
}

export function isInvalidGalleryPathError(error: unknown): boolean {
  if (error instanceof InvalidGalleryPathError) return true;
  return String(error).includes('Invalid gallery path');
}
