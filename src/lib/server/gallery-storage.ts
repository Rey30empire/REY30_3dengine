import { promises as fs } from 'fs';
import path from 'path';
import { getDeployStore, getStore } from '@netlify/blobs';
import {
  assertValidGalleryRelativePath,
  buildGalleryFileUrl,
  getGalleryMimeType,
  getGalleryRoot,
  inferGalleryKind,
  resolveGalleryBlobStoreName,
  resolveGalleryStorageBackend,
  resolveGalleryStorageScope,
  resolveGalleryVirtualFileName,
  type GalleryListItem,
  type GalleryStorageBackend,
  type GalleryStorageScope,
} from '@/app/api/gallery/shared';

interface StoredBlobMetadata {
  contentType?: string;
  modifiedAt?: string;
  size?: string | number;
}

export interface GalleryStorageInfo {
  backend: GalleryStorageBackend;
  scope: GalleryStorageScope;
  root?: string;
  storeName?: string;
}

export interface GalleryStorageStatus extends GalleryStorageInfo {
  available: boolean;
  error?: string;
}

export interface StoredGalleryFile extends GalleryListItem {
  contentType?: string;
}

function isFsError(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}

function toStoredGalleryFile(params: {
  relativePath: string;
  size: number;
  modifiedAt: string;
  contentType?: string;
}): StoredGalleryFile {
  const normalized = assertValidGalleryRelativePath(params.relativePath);
  const name = path.posix.basename(normalized);
  const category = normalized.includes('/') ? normalized.split('/')[0] || 'general' : 'general';

  return {
    name,
    url: buildGalleryFileUrl(normalized),
    relativePath: normalized,
    filePath: resolveGalleryVirtualFileName(normalized),
    size: params.size,
    modifiedAt: params.modifiedAt,
    kind: inferGalleryKind(name),
    category,
    contentType: params.contentType,
  };
}

function resolveBlobStore() {
  const info = getGalleryStorageInfo();
  if (info.backend !== 'netlify-blobs' || !info.storeName) {
    throw new Error('Gallery storage backend is not configured for Netlify Blobs.');
  }

  return info.scope === 'global' ? getStore(info.storeName) : getDeployStore(info.storeName);
}

export function getGalleryStorageInfo(env: NodeJS.ProcessEnv = process.env): GalleryStorageInfo {
  const backend = resolveGalleryStorageBackend(env);
  const scope = resolveGalleryStorageScope(env);

  if (backend === 'filesystem') {
    return {
      backend,
      scope,
      root: getGalleryRoot(env),
    };
  }

  return {
    backend,
    scope,
    storeName: resolveGalleryBlobStoreName(env),
  };
}

export async function getGalleryStorageStatus(): Promise<GalleryStorageStatus> {
  const info = getGalleryStorageInfo();

  try {
    if (info.backend === 'filesystem' && info.root) {
      await fs.mkdir(info.root, { recursive: true });
      await fs.access(info.root);
    } else {
      const store = resolveBlobStore();
      await store.get('__healthcheck__');
    }

    return {
      ...info,
      available: true,
    };
  } catch (error) {
    return {
      ...info,
      available: false,
      error: String(error),
    };
  }
}

async function listLocalFilesRecursive(root: string, currentRelative = ''): Promise<StoredGalleryFile[]> {
  const currentPath = path.join(root, currentRelative);
  const entries = await fs.readdir(currentPath, { withFileTypes: true }).catch((error) => {
    if (isFsError(error, 'ENOENT')) return [];
    throw error;
  });
  const items: StoredGalleryFile[] = [];

  for (const entry of entries) {
    const relativePath = currentRelative
      ? path.posix.join(currentRelative.replace(/\\/g, '/'), entry.name)
      : entry.name;

    if (entry.isDirectory()) {
      const nested = await listLocalFilesRecursive(root, relativePath);
      items.push(...nested);
      continue;
    }

    const absolutePath = path.resolve(root, relativePath);
    const stats = await fs.stat(absolutePath);
    items.push(
      toStoredGalleryFile({
        relativePath,
        size: stats.size,
        modifiedAt: stats.mtime.toISOString(),
        contentType: getGalleryMimeType(entry.name),
      })
    );
  }

  return items;
}

async function readLocalGalleryFile(relativePath: string) {
  const root = getGalleryRoot();
  const absolutePath = path.resolve(root, relativePath);
  const [buffer, stats] = await Promise.all([fs.readFile(absolutePath), fs.stat(absolutePath)]);

  return {
    buffer,
    metadata: {
      size: stats.size,
      modifiedAt: stats.mtime.toISOString(),
      contentType: getGalleryMimeType(relativePath),
    },
  };
}

async function writeLocalGalleryFile(relativePath: string, data: Uint8Array, contentType?: string) {
  const root = getGalleryRoot();
  const absolutePath = path.resolve(root, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, data);
  const stats = await fs.stat(absolutePath);
  return toStoredGalleryFile({
    relativePath,
    size: stats.size,
    modifiedAt: stats.mtime.toISOString(),
    contentType: contentType || getGalleryMimeType(relativePath),
  });
}

async function readBlobGalleryFile(relativePath: string) {
  const store = resolveBlobStore();
  const result = await store.getWithMetadata(relativePath, { type: 'arrayBuffer' });
  if (!result) return null;

  const metadata = result.metadata as StoredBlobMetadata | undefined;
  return {
    buffer: Buffer.from(result.data),
    metadata: {
      size: result.data.byteLength,
      modifiedAt:
        typeof metadata?.modifiedAt === 'string' ? metadata.modifiedAt : new Date(0).toISOString(),
      contentType:
        typeof metadata?.contentType === 'string'
          ? metadata.contentType
          : getGalleryMimeType(relativePath),
    },
  };
}

async function writeBlobGalleryFile(relativePath: string, data: Uint8Array, contentType?: string) {
  const store = resolveBlobStore();
  const modifiedAt = new Date().toISOString();
  const resolvedContentType = contentType || getGalleryMimeType(relativePath);
  const blob = new Blob([Uint8Array.from(data)], {
    type: resolvedContentType,
  });

  await store.set(relativePath, blob, {
    metadata: {
      contentType: resolvedContentType,
      modifiedAt,
      size: data.byteLength,
    },
  });

  return toStoredGalleryFile({
    relativePath,
    size: data.byteLength,
    modifiedAt,
    contentType: resolvedContentType,
  });
}

export async function listStoredGalleryFiles(): Promise<StoredGalleryFile[]> {
  const info = getGalleryStorageInfo();

  if (info.backend === 'filesystem' && info.root) {
    return listLocalFilesRecursive(info.root);
  }

  const store = resolveBlobStore();
  const result = await store.list();
  const items = await Promise.all(
    result.blobs.map(async (blob) => {
      const metadata = (await store.getMetadata(blob.key))?.metadata as StoredBlobMetadata | undefined;
      let size = Number(metadata?.size || 0);
      if (!Number.isFinite(size) || size <= 0) {
        const content = await store.get(blob.key, { type: 'arrayBuffer' });
        size = content.byteLength;
      }

      return toStoredGalleryFile({
        relativePath: blob.key,
        size,
        modifiedAt:
          typeof metadata?.modifiedAt === 'string'
            ? metadata.modifiedAt
            : new Date(0).toISOString(),
        contentType:
          typeof metadata?.contentType === 'string'
            ? metadata.contentType
            : getGalleryMimeType(blob.key),
      });
    })
  );

  items.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());
  return items;
}

export async function readStoredGalleryFile(relativePath: string): Promise<{
  buffer: Buffer;
  metadata: {
    size: number;
    modifiedAt: string;
    contentType?: string;
  };
} | null> {
  const normalized = assertValidGalleryRelativePath(relativePath);
  const info = getGalleryStorageInfo();

  if (info.backend === 'filesystem') {
    try {
      return await readLocalGalleryFile(normalized);
    } catch (error) {
      if (isFsError(error, 'ENOENT')) return null;
      throw error;
    }
  }

  return readBlobGalleryFile(normalized);
}

export async function upsertStoredGalleryFile(params: {
  relativePath: string;
  data: Uint8Array | Buffer;
  contentType?: string;
}) {
  const normalized = assertValidGalleryRelativePath(params.relativePath);
  const data = params.data instanceof Buffer ? params.data : Buffer.from(params.data);
  const info = getGalleryStorageInfo();

  if (info.backend === 'filesystem') {
    return writeLocalGalleryFile(normalized, data, params.contentType);
  }

  return writeBlobGalleryFile(normalized, data, params.contentType);
}

export async function deleteStoredGalleryFile(relativePath: string): Promise<void> {
  const normalized = assertValidGalleryRelativePath(relativePath);
  const info = getGalleryStorageInfo();

  if (info.backend === 'filesystem' && info.root) {
    const absolutePath = path.resolve(info.root, normalized);
    await fs.unlink(absolutePath).catch((error) => {
      if (isFsError(error, 'ENOENT')) return;
      throw error;
    });
    return;
  }

  const store = resolveBlobStore();
  await store.delete(normalized);
}
