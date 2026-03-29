// ============================================
// Asset Pipeline - Import, normalize, version
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { fetchRemoteBytes } from '@/lib/security/remote-fetch';

export type PipelineAssetType =
  | 'mesh'
  | 'texture'
  | 'material'
  | 'modifier_preset'
  | 'audio'
  | 'video'
  | 'script'
  | 'prefab'
  | 'scene'
  | 'animation'
  | 'font'
  | 'other';

const PIPELINE_ASSET_TYPES: PipelineAssetType[] = [
  'mesh',
  'texture',
  'material',
  'modifier_preset',
  'audio',
  'video',
  'script',
  'prefab',
  'scene',
  'animation',
  'font',
  'other',
];

export interface PipelineAsset {
  id: string;
  name: string;
  type: PipelineAssetType;
  path: string;
  size: number;
  hash: string;
  version: number;
  createdAt: string;
  source?: string;
  adapted?: {
    normalized: boolean;
    originalName?: string;
    note?: string;
  };
  metadata?: Record<string, unknown>;
}

interface AssetDB {
  assets: PipelineAsset[];
}

interface RuntimeRegistryAssetEntry {
  asset_id?: unknown;
  asset_path?: unknown;
  category?: unknown;
  preferred_runtime_entry?: unknown;
  runtime_ready?: unknown;
}

interface RuntimeRegistryDocument {
  assets?: RuntimeRegistryAssetEntry[];
}

function resolveAssetRoot() {
  return process.env.REY30_ASSET_ROOT || path.join(process.cwd(), 'download', 'assets');
}

function getDbPath() {
  return path.join(resolveAssetRoot(), '..', 'assets-db.json');
}

function getRuntimeRegistryPath() {
  return (
    process.env.REY30_RUNTIME_REGISTRY_PATH ||
    path.join(process.cwd(), 'assets', 'registro_motor.json')
  );
}

export function getAssetRoot(): string {
  return resolveAssetRoot();
}

export async function listAssets(): Promise<PipelineAsset[]> {
  const db = await readDB();
  const registryAssets = await readRuntimeRegistryAssets();
  const merged = new Map<string, PipelineAsset>();

  registryAssets.forEach((asset) => {
    merged.set(asset.path, asset);
  });
  db.assets.forEach((asset) => {
    merged.set(asset.path, asset);
  });

  return [...merged.values()];
}

export async function importAssetFromUrl(input: { url: string; name?: string; type?: PipelineAssetType }): Promise<PipelineAsset> {
  await ensureDirs();
  const urlObj = parseHttpUrl(input.url);
  const { response, bytes } = await fetchRemoteBytes({
    provider: 'assets',
    url: urlObj.toString(),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch asset: ${response.status} ${response.statusText}`);
  }
  const buffer = Buffer.from(bytes);

  const hash = hashBuffer(buffer);
  const type = resolveAssetType(input.type, urlObj.pathname);
  const ext = normalizeExt(urlObj.pathname);
  const baseName = sanitizeName(input.name || path.basename(urlObj.pathname, ext)) || 'asset';

  const db = await readDB();
  const siblings = db.assets.filter((a) => a.name === baseName);
  const version = siblings.length > 0 ? Math.max(...siblings.map((a) => a.version)) + 1 : 1;

  const fileName = `${baseName}_v${version}${ext}`;
  const absPath = path.join(getAssetRoot(), type, fileName);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, buffer);

  const asset: PipelineAsset = {
    id: uuidv4(),
    name: baseName,
    type,
    path: path.relative(process.cwd(), absPath).replace(/\\/g, '/'),
    size: buffer.length,
    hash,
    version,
    createdAt: new Date().toISOString(),
    source: input.url,
    adapted: {
      normalized: true,
      originalName: path.basename(input.url),
      note: ext !== path.extname(input.url) ? `Normalized ext to ${ext}` : undefined,
    },
  };

  db.assets.push(asset);
  await writeDB(db);
  return asset;
}

export async function registerAssetFromPath(input: {
  absPath: string;
  name?: string;
  type: PipelineAssetType;
  metadata?: Record<string, unknown>;
  source?: string;
}): Promise<PipelineAsset> {
  await ensureDirs();
  const relPath = path.relative(process.cwd(), input.absPath).replace(/\\/g, '/');
  const db = await readDB();
  const existing = db.assets.find((asset) => asset.path === relPath);

  const buffer = await fs.readFile(input.absPath);
  const hash = hashBuffer(buffer);
  if (existing) {
    existing.name = sanitizeName(input.name || existing.name || path.parse(input.absPath).name);
    existing.type = input.type;
    existing.size = buffer.length;
    existing.hash = hash;
    existing.source = input.source ?? existing.source;
    existing.metadata = input.metadata ?? existing.metadata;
    await writeDB(db);
    return existing;
  }

  const ext = path.extname(input.absPath).toLowerCase() || '.bin';
  const baseName = sanitizeName(input.name || path.basename(input.absPath, ext));
  const siblings = db.assets.filter((asset) => asset.name === baseName && asset.type === input.type);
  const version = siblings.length > 0 ? Math.max(...siblings.map((asset) => asset.version)) + 1 : 1;

  const asset: PipelineAsset = {
    id: uuidv4(),
    name: baseName,
    type: input.type,
    path: relPath,
    size: buffer.length,
    hash,
    version,
    createdAt: new Date().toISOString(),
    source: input.source,
    metadata: input.metadata,
  };

  db.assets.push(asset);
  await writeDB(db);
  return asset;
}

export async function removeAssetByPath(input: { absPath?: string; relPath?: string }) {
  const relPath =
    input.relPath?.replace(/\\/g, '/') ??
    (input.absPath
      ? path.relative(process.cwd(), input.absPath).replace(/\\/g, '/')
      : null);
  if (!relPath) {
    return false;
  }

  const db = await readDB();
  const initialCount = db.assets.length;
  db.assets = db.assets.filter((asset) => asset.path !== relPath);
  if (db.assets.length === initialCount) {
    return false;
  }

  await writeDB(db);
  return true;
}

// -----------------------------
// Helpers
// -----------------------------

function sanitizeName(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_\-]/g, '_');
}

function normalizeExt(urlOrName: string): string {
  const ext = path.extname(urlOrName).toLowerCase();
  if (!ext) return '.bin';
  if (['.jpeg', '.jpg'].includes(ext)) return '.jpg';
  return ext;
}

function detectTypeFromUrl(url: string): PipelineAssetType {
  const ext = path.extname(url).toLowerCase();
  if (['.fbx', '.obj', '.glb', '.gltf', '.stl'].includes(ext)) return 'mesh';
  if (['.png', '.jpg', '.jpeg', '.tga', '.exr', '.hdr', '.webp'].includes(ext)) return 'texture';
  if (['.wav', '.mp3', '.ogg', '.flac'].includes(ext)) return 'audio';
  if (['.mp4', '.mov', '.webm'].includes(ext)) return 'video';
  if (['.anim', '.bvh'].includes(ext)) return 'animation';
  if (['.ts', '.js', '.lua'].includes(ext)) return 'script';
  if (['.prefab'].includes(ext)) return 'prefab';
  if (['.scene', '.json'].includes(ext)) return 'scene';
  if (['.ttf', '.otf', '.woff'].includes(ext)) return 'font';
  return 'other';
}

function resolveAssetType(type: PipelineAssetType | undefined, urlPath: string): PipelineAssetType {
  if (type) {
    if (!PIPELINE_ASSET_TYPES.includes(type)) {
      throw new Error('Invalid asset type');
    }
    return type;
  }
  return detectTypeFromUrl(urlPath);
}

function parseHttpUrl(rawUrl: string): URL {
  let urlObj: URL;
  try {
    urlObj = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL');
  }

  if (!['http:', 'https:'].includes(urlObj.protocol)) {
    throw new Error('Only http/https URLs are allowed');
  }

  return urlObj;
}

async function ensureDirs(): Promise<void> {
  await fs.mkdir(getAssetRoot(), { recursive: true });
}

async function readRuntimeRegistryAssets(): Promise<PipelineAsset[]> {
  let parsed: RuntimeRegistryDocument;
  try {
    const raw = await fs.readFile(getRuntimeRegistryPath(), 'utf-8');
    parsed = JSON.parse(raw) as RuntimeRegistryDocument;
  } catch {
    return [];
  }

  const entries = Array.isArray(parsed.assets) ? parsed.assets : [];
  const resolved = await Promise.all(
    entries.map(async (entry) => mapRuntimeRegistryAsset(entry))
  );

  return resolved.flatMap((asset) => (asset ? [asset] : []));
}

async function mapRuntimeRegistryAsset(
  entry: RuntimeRegistryAssetEntry
): Promise<PipelineAsset | null> {
  if (entry.runtime_ready !== true) {
    return null;
  }

  const assetId = readString(entry.asset_id);
  const assetPath = readString(entry.asset_path);
  const category = readString(entry.category);
  const preferredRuntimeEntry = readString(entry.preferred_runtime_entry);
  if (!assetId || !assetPath || !preferredRuntimeEntry) {
    return null;
  }

  const absPath = path.resolve(process.cwd(), preferredRuntimeEntry);
  const relativeToCwd = path.relative(process.cwd(), absPath);
  if (relativeToCwd.startsWith('..') || path.isAbsolute(relativeToCwd)) {
    return null;
  }

  try {
    const stats = await fs.stat(absPath);
    if (!stats.isFile()) {
      return null;
    }

    const relPath = relativeToCwd.replace(/\\/g, '/');
    return {
      id: `lexury:${assetId}`,
      name: assetId,
      type: detectTypeFromUrl(relPath),
      path: relPath,
      size: stats.size,
      hash: createHash('sha256')
        .update(relPath)
        .update(String(stats.size))
        .update(String(stats.mtimeMs))
        .digest('hex'),
      version: 1,
      createdAt: new Date(stats.mtimeMs).toISOString(),
      source: 'lexury-runtime-registry',
      metadata: {
        library: true,
        scope: 'shared',
        provider: 'lexury',
        runtimeReady: true,
        assetId,
        assetPath,
        category,
        preferredRuntimeEntry,
        registryPath: path
          .relative(process.cwd(), getRuntimeRegistryPath())
          .replace(/\\/g, '/'),
      },
    };
  } catch {
    return null;
  }
}

async function readDB(): Promise<AssetDB> {
  try {
    const raw = await fs.readFile(getDbPath(), 'utf-8');
    return JSON.parse(raw) as AssetDB;
  } catch {
    return { assets: [] };
  }
}

async function writeDB(db: AssetDB): Promise<void> {
  const dbPath = getDbPath();
  await fs.mkdir(path.dirname(dbPath), { recursive: true });
  await fs.writeFile(dbPath, JSON.stringify(db, null, 2), 'utf-8');
}

function hashBuffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}
