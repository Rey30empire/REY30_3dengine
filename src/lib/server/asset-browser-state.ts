import { promises as fs } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { listAssets, updateAssetMetadata, type PipelineAsset } from '@/engine/assets/pipeline';
import {
  getAssetSystemStatePath,
  getLegacyAssetSystemStatePath,
  readJsonFileAtPath,
  runAssetSystemMutation,
  writeJsonFileAtomic,
} from '@/lib/server/asset-system-storage';

export interface AssetBrowserServerFilter {
  query: string;
  scope: 'all' | 'project' | 'shared' | 'generated';
  type:
    | 'all'
    | 'model'
    | 'texture'
    | 'material'
    | 'modifier_preset'
    | 'character_preset'
    | 'audio'
    | 'video'
    | 'script'
    | 'scene'
    | 'prefab'
    | 'animation'
    | 'font'
    | 'other';
  sortBy: 'name' | 'type' | 'size' | 'modified';
  tag: string;
  collection: string;
  favoritesOnly: boolean;
  managedOnly: boolean;
}

export interface StoredAssetBrowserView {
  id: string;
  userId: string;
  projectKey: string;
  name: string;
  filter: AssetBrowserServerFilter;
  createdAt: string;
  updatedAt: string;
}

export interface AssetMetadataHistorySnapshot {
  favorite?: boolean;
  tags?: string[];
  collections?: string[];
  notes?: string;
  versionGroupKey?: string;
}

export interface AssetMetadataHistoryEntry {
  id: string;
  assetId: string;
  path: string;
  userId: string | null;
  projectKey: string;
  action: 'metadata.update' | 'metadata.rollback';
  before: AssetMetadataHistorySnapshot;
  after: AssetMetadataHistorySnapshot;
  createdAt: string;
}

interface AssetBrowserViewsDocument {
  views: StoredAssetBrowserView[];
}

interface AssetMetadataHistoryDocument {
  entries: AssetMetadataHistoryEntry[];
}

const ASSET_BROWSER_VIEWS_FILE_NAME = 'asset-browser-views.json';
const ASSET_METADATA_HISTORY_FILE_NAME = 'asset-metadata-history.json';

export function getAssetBrowserViewsPath() {
  return getAssetSystemStatePath(ASSET_BROWSER_VIEWS_FILE_NAME);
}

function getLegacyAssetBrowserViewsPath() {
  return getLegacyAssetSystemStatePath(ASSET_BROWSER_VIEWS_FILE_NAME);
}

export function getAssetMetadataHistoryPath() {
  return getAssetSystemStatePath(ASSET_METADATA_HISTORY_FILE_NAME);
}

function getLegacyAssetMetadataHistoryPath() {
  return getLegacyAssetSystemStatePath(ASSET_METADATA_HISTORY_FILE_NAME);
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  const current = await readJsonFileAtPath<T>(filePath);
  return current ?? fallback;
}

async function writeJsonFile(filePath: string, value: unknown) {
  await writeJsonFileAtomic(filePath, value);
}

async function readViewsDocument() {
  const current = await readJsonFile<AssetBrowserViewsDocument>(getAssetBrowserViewsPath(), {
    views: [],
  });
  if (current.views.length > 0 || (await fs.stat(getAssetBrowserViewsPath()).catch(() => null))) {
    return current;
  }

  return readJsonFile<AssetBrowserViewsDocument>(getLegacyAssetBrowserViewsPath(), { views: [] });
}

async function readHistoryDocument() {
  const current = await readJsonFile<AssetMetadataHistoryDocument>(getAssetMetadataHistoryPath(), {
    entries: [],
  });
  if (
    current.entries.length > 0 ||
    (await fs.stat(getAssetMetadataHistoryPath()).catch(() => null))
  ) {
    return current;
  }

  return readJsonFile<AssetMetadataHistoryDocument>(getLegacyAssetMetadataHistoryPath(), {
    entries: [],
  });
}

function normalizeStringList(value: unknown) {
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

export function extractEditableAssetMetadata(
  metadata?: Record<string, unknown> | null
): AssetMetadataHistorySnapshot {
  const snapshot: AssetMetadataHistorySnapshot = {};
  if (metadata?.favorite === true) {
    snapshot.favorite = true;
  }

  const tags = normalizeStringList(metadata?.tags);
  if (tags.length > 0) {
    snapshot.tags = tags;
  }

  const collections = normalizeStringList(metadata?.collections);
  if (collections.length > 0) {
    snapshot.collections = collections;
  }

  if (typeof metadata?.notes === 'string' && metadata.notes.trim()) {
    snapshot.notes = metadata.notes.trim();
  }

  if (typeof metadata?.versionGroupKey === 'string' && metadata.versionGroupKey.trim()) {
    snapshot.versionGroupKey = metadata.versionGroupKey.trim().toLowerCase();
  }

  return snapshot;
}

function normalizeFilter(input: Partial<AssetBrowserServerFilter>): AssetBrowserServerFilter {
  return {
    query: typeof input.query === 'string' ? input.query : '',
    scope:
      input.scope === 'project' ||
      input.scope === 'shared' ||
      input.scope === 'generated' ||
      input.scope === 'all'
        ? input.scope
        : 'all',
    type:
      typeof input.type === 'string' && input.type.length > 0
        ? (input.type as AssetBrowserServerFilter['type'])
        : 'all',
    sortBy:
      input.sortBy === 'type' ||
      input.sortBy === 'size' ||
      input.sortBy === 'modified' ||
      input.sortBy === 'name'
        ? input.sortBy
        : 'name',
    tag: typeof input.tag === 'string' ? input.tag : '',
    collection: typeof input.collection === 'string' ? input.collection : '',
    favoritesOnly: Boolean(input.favoritesOnly),
    managedOnly: Boolean(input.managedOnly),
  };
}

export async function listAssetBrowserViews(input: { userId: string; projectKey: string }) {
  const document = await readViewsDocument();
  return document.views
    .filter((view) => view.userId === input.userId && view.projectKey === input.projectKey)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function upsertAssetBrowserView(input: {
  id?: string;
  userId: string;
  projectKey: string;
  name: string;
  filter: Partial<AssetBrowserServerFilter>;
}) {
  return runAssetSystemMutation(async () => {
    const document = await readViewsDocument();
    const now = new Date().toISOString();
    const existingIndex = document.views.findIndex(
      (view) =>
        (input.id && view.id === input.id) ||
        (view.userId === input.userId &&
          view.projectKey === input.projectKey &&
          view.name.toLowerCase() === input.name.trim().toLowerCase())
    );

    const nextView: StoredAssetBrowserView = {
      id: existingIndex >= 0 ? document.views[existingIndex].id : uuidv4(),
      userId: input.userId,
      projectKey: input.projectKey,
      name: input.name.trim(),
      filter: normalizeFilter(input.filter),
      createdAt: existingIndex >= 0 ? document.views[existingIndex].createdAt : now,
      updatedAt: now,
    };

    if (existingIndex >= 0) {
      document.views[existingIndex] = nextView;
    } else {
      document.views.push(nextView);
    }

    await writeJsonFile(getAssetBrowserViewsPath(), document);
    return nextView;
  });
}

export async function deleteAssetBrowserView(input: {
  id: string;
  userId: string;
  projectKey: string;
}) {
  return runAssetSystemMutation(async () => {
    const document = await readViewsDocument();
    const initialCount = document.views.length;
    document.views = document.views.filter(
      (view) =>
        !(
          view.id === input.id &&
          view.userId === input.userId &&
          view.projectKey === input.projectKey
        )
    );
    if (document.views.length === initialCount) {
      return false;
    }
    await writeJsonFile(getAssetBrowserViewsPath(), document);
    return true;
  });
}

export async function recordAssetMetadataHistory(input: {
  assetId: string;
  path: string;
  userId: string | null;
  projectKey: string;
  action: 'metadata.update' | 'metadata.rollback';
  before: AssetMetadataHistorySnapshot;
  after: AssetMetadataHistorySnapshot;
}) {
  return runAssetSystemMutation(async () => {
    const document = await readHistoryDocument();
    const entry: AssetMetadataHistoryEntry = {
      id: uuidv4(),
      assetId: input.assetId,
      path: input.path,
      userId: input.userId,
      projectKey: input.projectKey,
      action: input.action,
      before: input.before,
      after: input.after,
      createdAt: new Date().toISOString(),
    };

    document.entries.unshift(entry);
    document.entries = document.entries.slice(0, 5000);
    await writeJsonFile(getAssetMetadataHistoryPath(), document);
    return entry;
  });
}

export async function listAssetMetadataHistory(input: {
  assetId?: string;
  path?: string;
  projectKey: string;
  limit?: number;
}) {
  const document = await readHistoryDocument();
  const limit = Math.max(1, Math.min(input.limit ?? 20, 100));
  return document.entries
    .filter(
      (entry) =>
        entry.projectKey === input.projectKey &&
        (
          (input.assetId && entry.assetId === input.assetId) ||
          (input.path && entry.path === input.path)
        )
    )
    .slice(0, limit);
}

function findAsset(
  assets: PipelineAsset[],
  input: { assetId?: string; path?: string }
) {
  return assets.find(
    (asset) =>
      (input.assetId && asset.id === input.assetId) || (input.path && asset.path === input.path)
  );
}

export async function rollbackAssetMetadataHistory(input: {
  entryId: string;
  userId: string | null;
  projectKey: string;
}) {
  return runAssetSystemMutation(async () => {
    const document = await readHistoryDocument();
    const entry = document.entries.find(
      (item) => item.id === input.entryId && item.projectKey === input.projectKey
    );
    if (!entry) {
      return null;
    }

    const currentAssets = await listAssets();
    const currentAsset = findAsset(currentAssets, {
      assetId: entry.assetId,
      path: entry.path,
    });
    if (!currentAsset) {
      return null;
    }

    const currentSnapshot = extractEditableAssetMetadata(currentAsset.metadata);
    const restored = await updateAssetMetadata({
      assetId: entry.assetId,
      relPath: entry.path,
      metadata: entry.before,
      replaceEditableFields: true,
    });
    if (!restored) {
      return null;
    }

    await recordAssetMetadataHistory({
      assetId: restored.id,
      path: restored.path,
      userId: input.userId,
      projectKey: input.projectKey,
      action: 'metadata.rollback',
      before: currentSnapshot,
      after: extractEditableAssetMetadata(restored.metadata),
    });

    return restored;
  });
}
