'use client';

import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  type AssetBrowserFilterType,
  type AssetBrowserSavedFilter,
  type AssetBrowserScope,
  type AssetBrowserSort,
} from '@/lib/asset-browser-preferences';
import { cn } from '@/lib/utils';
import { loadClientAuthSession } from '@/lib/client-auth-session';
import { useEngineStore } from '@/store/editorStore';
import { buildAssetFileUrl } from './assetUrls';
import {
  Archive,
  Box,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Code,
  Copy,
  ExternalLink,
  File,
  FileJson,
  FileText,
  FilterX,
  Folder,
  FolderOpen,
  Grid,
  Image as ImageIcon,
  Layers,
  List,
  Music,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Square,
  Star,
  Tag,
  Trash2,
  Upload,
  Video,
  X,
} from 'lucide-react';

export type AssetType =
  | 'folder'
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

export interface Asset {
  id: string;
  name: string;
  type: AssetType;
  path: string;
  size: number;
  modifiedAt: Date;
  thumbnail?: string;
  metadata?: Record<string, any>;
  isFavorite?: boolean;
}

interface AssetFolder {
  id: string;
  name: string;
  path: string;
  children: AssetFolder[];
  assets: Asset[];
  count: number;
}

interface AuthSessionPayload {
  authenticated?: boolean;
}

type Scope = AssetBrowserScope;
type ViewMode = 'grid' | 'list';
type QueueItemStatus = 'uploading' | 'ready' | 'error';

interface QueueItem {
  id: string;
  name: string;
  path: string;
  size: number;
  type: AssetType;
  status: QueueItemStatus;
}

interface AssetMetadataHistoryEntry {
  id: string;
  assetId: string;
  path: string;
  action: 'metadata.update' | 'metadata.rollback';
  createdAt: string;
  before: {
    favorite?: boolean;
    tags?: string[];
    collections?: string[];
    notes?: string;
  };
  after: {
    favorite?: boolean;
    tags?: string[];
    collections?: string[];
    notes?: string;
  };
}

interface AssetMetadataUpdate {
  id?: string;
  path?: string;
  metadata: {
    favorite?: boolean;
    tags?: string[];
    collections?: string[];
    notes?: string;
    versionGroupKey?: string;
  };
}

type MutableFolder = AssetFolder & { map: Map<string, MutableFolder> };

const AUTH_HINT = 'Inicia sesion con una cuenta autorizada para usar Assets persistentes.';
const FILTERABLE_TYPES: AssetBrowserFilterType[] = [
  'all',
  'model',
  'texture',
  'material',
  'modifier_preset',
  'character_preset',
  'audio',
  'video',
  'script',
  'scene',
  'prefab',
  'animation',
  'font',
  'other',
];
const ALL_COLLECTIONS_VALUE = '__all_collections__';
const ALL_TAGS_VALUE = '__all_tags__';

function iconFor(type: AssetType, className?: string) {
  if (type === 'model') return <Box className={className} />;
  if (type === 'texture') return <ImageIcon className={className} />;
  if (type === 'material') return <Archive className={className} />;
  if (type === 'modifier_preset') return <Layers className={className} />;
  if (type === 'character_preset') return <Box className={className} />;
  if (type === 'audio') return <Music className={className} />;
  if (type === 'video' || type === 'animation') return <Video className={className} />;
  if (type === 'script') return <Code className={className} />;
  if (type === 'scene') return <FileJson className={className} />;
  if (type === 'font') return <FileText className={className} />;
  if (type === 'folder') return <Folder className={className} />;
  return <File className={className} />;
}

function colorFor(type: AssetType) {
  if (type === 'model') return 'text-violet-300';
  if (type === 'texture') return 'text-pink-300';
  if (type === 'material') return 'text-cyan-300';
  if (type === 'modifier_preset') return 'text-emerald-300';
  if (type === 'character_preset') return 'text-fuchsia-300';
  if (type === 'audio') return 'text-green-300';
  if (type === 'video') return 'text-rose-300';
  if (type === 'script') return 'text-blue-300';
  if (type === 'scene') return 'text-orange-300';
  if (type === 'animation') return 'text-teal-300';
  if (type === 'folder') return 'text-yellow-400';
  return 'text-slate-400';
}

function fmtType(value: string) {
  return value.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function norm(value?: string | null) {
  const trimmed = (value ?? '').trim();
  if (!trimmed || trimmed === '/') return '/';
  return (trimmed.startsWith('/') ? trimmed : `/${trimmed}`)
    .replace(/\/+/g, '/')
    .replace(/\/$/, '') || '/';
}

function dirOf(asset: Asset) {
  const segments = norm(asset.path).split('/').filter(Boolean);
  return segments.length <= 1 ? '/' : `/${segments.slice(0, -1).join('/')}`;
}

function readStringList(value: unknown): string[] {
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

function parseTokenInput(value: string) {
  return readStringList(value.split(/[,;\n]/g));
}

function scopeOf(asset: Asset): Exclude<Scope, 'all'> {
  const scope = String(asset.metadata?.scope ?? '').toLowerCase();
  const source = String(asset.metadata?.source ?? '').toLowerCase();
  if (scope.includes('shared') || source.includes('shared')) return 'shared';
  if (
    scope.includes('generated') ||
    source.includes('generated') ||
    source.includes('runtime') ||
    source.includes('ai')
  ) {
    return 'generated';
  }
  return 'project';
}

function scopeOk(asset: Asset, scope: Scope) {
  return scope === 'all' ? true : scopeOf(asset) === scope;
}

function folderOk(asset: Asset, folderPath: string) {
  if (folderPath === '/') return true;
  const dir = dirOf(asset);
  return dir === folderPath || dir.startsWith(`${folderPath}/`);
}

function assetTypeFromFile(name: string): AssetType {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['fbx', 'obj', 'gltf', 'glb', 'dae', 'blend', 'stl'].includes(ext)) return 'model';
  if (['png', 'jpg', 'jpeg', 'tga', 'bmp', 'hdr', 'exr', 'webp'].includes(ext)) return 'texture';
  if (['wav', 'mp3', 'ogg', 'aiff', 'flac'].includes(ext)) return 'audio';
  if (['mp4', 'mov', 'avi', 'webm'].includes(ext)) return 'video';
  if (['ts', 'js', 'jsx', 'tsx'].includes(ext)) return 'script';
  if (['scene', 'scn', 'json'].includes(ext)) return 'scene';
  if (['prefab', 'pref'].includes(ext)) return 'prefab';
  if (['anim', 'bvh'].includes(ext)) return 'animation';
  if (['ttf', 'otf', 'woff', 'woff2'].includes(ext)) return 'font';
  return 'other';
}

function libraryBadge(asset: Asset) {
  if (asset.metadata?.library) {
    return scopeOf(asset) === 'shared' ? 'Shared Library' : 'Project Library';
  }
  return null;
}

function mapType(type: string): AssetType {
  const mapping: Record<string, AssetType> = {
    mesh: 'model',
    texture: 'texture',
    material: 'material',
    modifier_preset: 'modifier_preset',
    character_preset: 'character_preset',
    audio: 'audio',
    video: 'video',
    script: 'script',
    prefab: 'prefab',
    scene: 'scene',
    animation: 'animation',
    font: 'font',
  };
  return mapping[type] ?? 'other';
}

function mapEngineType(type: AssetType) {
  const mapping: Record<AssetType, string> = {
    folder: 'prefab',
    model: 'mesh',
    texture: 'texture',
    material: 'material',
    modifier_preset: 'modifier_preset',
    character_preset: 'character_preset',
    audio: 'audio',
    video: 'video',
    script: 'script',
    scene: 'scene',
    prefab: 'prefab',
    animation: 'animation',
    font: 'font',
    other: 'prefab',
  };
  return mapping[type] ?? 'prefab';
}

function mapApiAsset(asset: any): Asset {
  const metadata =
    asset.metadata && typeof asset.metadata === 'object' ? { ...asset.metadata } : {};
  metadata.hash = asset.hash;
  metadata.version = asset.version;
  metadata.source = asset.source;
  metadata.adapted = asset.adapted;
  metadata.fileUrl = buildAssetFileUrl(asset.path);

  return {
    id: String(asset.id),
    name: String(asset.name),
    type: mapType(String(asset.type)),
    path: String(asset.path),
    size: Number(asset.size || 0),
    modifiedAt: new Date(asset.createdAt),
    thumbnail:
      mapType(String(asset.type)) === 'texture'
        ? buildAssetFileUrl(asset.path, { preview: true })
        : undefined,
    metadata,
    isFavorite: metadata.favorite === true,
  };
}

function mergeAssetRecords(previous: Asset[], incoming: Asset[]) {
  const next = new Map(previous.map((asset) => [asset.path, asset]));
  incoming.forEach((asset) => {
    const existing = next.get(asset.path);
    next.set(asset.path, {
      ...(existing ?? {}),
      ...asset,
      metadata: {
        ...(existing?.metadata ?? {}),
        ...(asset.metadata ?? {}),
      },
      isFavorite: asset.isFavorite,
    });
  });
  return [...next.values()];
}

function upsertIntoStore(list: Asset[]) {
  useEngineStore.setState((state) => {
    const next = [...state.assets];
    const indexByPath = new Map(next.map((asset, index) => [asset.path, index]));

    list.forEach((asset) => {
      const mapped = {
        id: asset.id,
        name: asset.name,
        type: mapEngineType(asset.type),
        path: asset.path,
        size: asset.size,
        createdAt: asset.modifiedAt,
        metadata: asset.metadata || {},
      } as any;

      const index = indexByPath.get(asset.path);
      if (index === undefined) {
        next.push(mapped);
        indexByPath.set(asset.path, next.length - 1);
        return;
      }

      next[index] = {
        ...next[index],
        ...mapped,
        metadata: {
          ...(next[index] as any)?.metadata,
          ...(mapped.metadata ?? {}),
        },
      };
    });

    return { assets: next };
  });
}

function removeFromStore(assetPaths: string[]) {
  const pathSet = new Set(assetPaths);
  useEngineStore.setState((state) => ({
    assets: state.assets.filter((entry) => !pathSet.has(entry.path)),
  }));
}

function buildFolders(list: Asset[]): AssetFolder[] {
  const root = new Map<string, MutableFolder>();

  for (const asset of list) {
    const segments = dirOf(asset).split('/').filter(Boolean);
    if (!segments.length) continue;

    let currentPath = '';
    let currentMap = root;
    for (const segment of segments) {
      currentPath += `/${segment}`;
      const folder: MutableFolder =
        currentMap.get(currentPath) ?? {
          id: currentPath,
          name: fmtType(segment),
          path: currentPath,
          children: [],
          assets: [],
          count: 0,
          map: new Map<string, MutableFolder>(),
        };
      folder.assets.push(asset);
      folder.count += 1;
      currentMap.set(currentPath, folder);
      currentMap = folder.map;
    }
  }

  const finalize = (map: Map<string, MutableFolder>): AssetFolder[] =>
    Array.from(map.values())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(({ map: childMap, ...rest }) => ({
        ...rest,
        children: finalize(childMap),
      }));

  return finalize(root);
}

function searchableText(asset: Asset) {
  return [
    asset.name,
    asset.path,
    asset.type,
    asset.metadata?.projectKey,
    asset.metadata?.source,
    asset.metadata?.scope,
    asset.metadata?.originalName,
    asset.metadata?.category,
    asset.metadata?.assetId,
    ...readStringList(asset.metadata?.tags),
    ...readStringList(asset.metadata?.collections),
    typeof asset.metadata?.notes === 'string' ? asset.metadata.notes : '',
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ')
    .toLowerCase();
}

function isManagedAsset(asset: Asset | null) {
  if (!asset || asset.metadata?.library === true) {
    return false;
  }

  const pathValue = norm(asset.path);
  const source = String(asset.metadata?.source ?? '').toLowerCase();
  if (asset.metadata?.uploaded === true) return true;
  if (pathValue.includes('/download/assets/')) return true;
  if (source === 'asset_upload' || source === 'remote_import') return true;
  return scopeOf(asset) === 'project';
}

function versionGroupKeyOf(asset: Asset | null) {
  if (!asset) return null;
  const metadataKey =
    typeof asset.metadata?.versionGroupKey === 'string' ? asset.metadata.versionGroupKey.trim() : '';
  return metadataKey || `${asset.type}:${asset.name.toLowerCase()}`;
}

function collectCounts(list: Asset[], key: 'tags' | 'collections') {
  const counts = new Map<string, number>();
  list.forEach((asset) => {
    readStringList(asset.metadata?.[key]).forEach((entry) => {
      counts.set(entry, (counts.get(entry) ?? 0) + 1);
    });
  });
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ name, count }));
}

function buildFilterSummary(input: {
  search: string;
  filterType: AssetBrowserFilterType;
  scope: Scope;
  tagFilter: string;
  collectionFilter: string;
  favoritesOnly: boolean;
  managedOnly: boolean;
}) {
  const summary: string[] = [];
  if (input.scope !== 'all') summary.push(`scope:${fmtType(input.scope)}`);
  if (input.filterType !== 'all') summary.push(`tipo:${fmtType(input.filterType)}`);
  if (input.search.trim()) summary.push(`buscar:${input.search.trim()}`);
  if (input.tagFilter) summary.push(`tag:${input.tagFilter}`);
  if (input.collectionFilter) summary.push(`coleccion:${input.collectionFilter}`);
  if (input.favoritesOnly) summary.push('solo favoritos');
  if (input.managedOnly) summary.push('solo gestionados');
  return summary;
}

function mapServerViewToSavedFilter(view: any): AssetBrowserSavedFilter | null {
  if (!view || typeof view !== 'object' || typeof view.name !== 'string') {
    return null;
  }

  const filter = view.filter && typeof view.filter === 'object' ? view.filter : {};
  return {
    id: typeof view.id === 'string' ? view.id : `saved-filter-${Date.now()}`,
    name: view.name,
    query: typeof filter.query === 'string' ? filter.query : '',
    scope:
      filter.scope === 'project' ||
      filter.scope === 'shared' ||
      filter.scope === 'generated' ||
      filter.scope === 'all'
        ? filter.scope
        : 'all',
    type:
      typeof filter.type === 'string' && filter.type.length > 0
        ? (filter.type as AssetBrowserSavedFilter['type'])
        : 'all',
    sortBy:
      filter.sortBy === 'type' ||
      filter.sortBy === 'size' ||
      filter.sortBy === 'modified' ||
      filter.sortBy === 'name'
        ? filter.sortBy
        : 'name',
    tag: typeof filter.tag === 'string' ? filter.tag : '',
    collection: typeof filter.collection === 'string' ? filter.collection : '',
    favoritesOnly: Boolean(filter.favoritesOnly),
    managedOnly: Boolean(filter.managedOnly),
  };
}

export function AssetBrowserPanel() {
  const selectAsset = useEngineStore((state) => state.selectAsset);
  const projectName = useEngineStore((state) => state.projectName);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [assets, setAssets] = useState<Asset[]>([]);
  const [currentPath, setCurrentPath] = useState('/');
  const [scope, setScope] = useState<Scope>('all');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [filterType, setFilterType] = useState<AssetBrowserFilterType>('all');
  const [sortBy, setSortBy] = useState<AssetBrowserSort>('name');
  const [tagFilter, setTagFilter] = useState('');
  const [collectionFilter, setCollectionFilter] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [managedOnly, setManagedOnly] = useState(false);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [message, setMessage] = useState('');
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionChecking, setSessionChecking] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [activeAssetId, setActiveAssetId] = useState<string | null>(null);
  const [savedFilters, setSavedFilters] = useState<AssetBrowserSavedFilter[]>([]);
  const [historyEntries, setHistoryEntries] = useState<AssetMetadataHistoryEntry[]>([]);
  const [savedFilterName, setSavedFilterName] = useState('');
  const [singleTagDraft, setSingleTagDraft] = useState('');
  const [singleCollectionDraft, setSingleCollectionDraft] = useState('');
  const [singleNotesDraft, setSingleNotesDraft] = useState('');
  const [bulkTagDraft, setBulkTagDraft] = useState('');
  const [bulkRemoveTagDraft, setBulkRemoveTagDraft] = useState('');
  const [bulkCollectionDraft, setBulkCollectionDraft] = useState('');

  const selectedAssets = useMemo(() => {
    const selectedSet = new Set(selectedAssetIds);
    return assets.filter((asset) => selectedSet.has(asset.id));
  }, [assets, selectedAssetIds]);

  const activeAsset = useMemo(() => {
    if (activeAssetId) {
      return assets.find((asset) => asset.id === activeAssetId) ?? null;
    }
    return selectedAssets[0] ?? null;
  }, [activeAssetId, assets, selectedAssets]);

  const scopeAssets = useMemo(
    () => assets.filter((asset) => scopeOk(asset, scope)),
    [assets, scope]
  );
  const folders = useMemo(() => buildFolders(scopeAssets), [scopeAssets]);
  const favorites = useMemo(
    () => assets.filter((asset) => asset.isFavorite).slice(0, 8),
    [assets]
  );
  const tagCounts = useMemo(() => collectCounts(scopeAssets, 'tags'), [scopeAssets]);
  const collectionCounts = useMemo(
    () => collectCounts(scopeAssets, 'collections'),
    [scopeAssets]
  );
  const filterSummary = useMemo(
    () =>
      buildFilterSummary({
        search,
        filterType,
        scope,
        tagFilter,
        collectionFilter,
        favoritesOnly,
        managedOnly,
      }),
    [collectionFilter, favoritesOnly, filterType, managedOnly, scope, search, tagFilter]
  );
  const visibleAssets = useMemo(() => {
    return scopeAssets
      .filter((asset) => folderOk(asset, currentPath))
      .filter((asset) => (filterType === 'all' ? true : asset.type === filterType))
      .filter((asset) => {
        if (!deferredSearch.trim()) return true;
        return searchableText(asset).includes(deferredSearch.trim().toLowerCase());
      })
      .filter((asset) => (tagFilter ? readStringList(asset.metadata?.tags).includes(tagFilter) : true))
      .filter((asset) =>
        collectionFilter
          ? readStringList(asset.metadata?.collections).includes(collectionFilter)
          : true
      )
      .filter((asset) => (favoritesOnly ? asset.isFavorite === true : true))
      .filter((asset) => (managedOnly ? isManagedAsset(asset) : true))
      .sort((a, b) => {
        if (sortBy === 'name') return a.name.localeCompare(b.name);
        if (sortBy === 'type') return a.type.localeCompare(b.type);
        if (sortBy === 'size') return b.size - a.size;
        return b.modifiedAt.getTime() - a.modifiedAt.getTime();
      });
  }, [
    collectionFilter,
    currentPath,
    deferredSearch,
    favoritesOnly,
    filterType,
    managedOnly,
    scopeAssets,
    sortBy,
    tagFilter,
  ]);
  const scopeCounts = useMemo(
    () => ({
      all: assets.length,
      project: assets.filter((asset) => scopeOf(asset) === 'project').length,
      shared: assets.filter((asset) => scopeOf(asset) === 'shared').length,
      generated: assets.filter((asset) => scopeOf(asset) === 'generated').length,
    }),
    [assets]
  );
  const versionHistory = useMemo(() => {
    const versionGroupKey = versionGroupKeyOf(activeAsset);
    if (!versionGroupKey) return [];
    return assets
      .filter((asset) => versionGroupKeyOf(asset) === versionGroupKey)
      .sort((a, b) => {
        const aVersion = Number(a.metadata?.version ?? 0);
        const bVersion = Number(b.metadata?.version ?? 0);
        if (bVersion !== aVersion) return bVersion - aVersion;
        return b.modifiedAt.getTime() - a.modifiedAt.getTime();
      });
  }, [activeAsset, assets]);
  const managedSelectedAssets = useMemo(
    () => selectedAssets.filter((asset) => isManagedAsset(asset)),
    [selectedAssets]
  );

  const loadHistoryForPath = async (assetPath: string, signal?: AbortSignal) => {
    const response = await fetch(`/api/assets/history?path=${encodeURIComponent(assetPath)}&limit=20`, {
      cache: 'no-store',
      headers: { 'x-rey30-project': projectName || 'untitled_project' },
      signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || 'No se pudo cargar el historial');
    }
    return Array.isArray(payload.entries) ? (payload.entries as AssetMetadataHistoryEntry[]) : [];
  };

  useEffect(() => {
    selectAsset(activeAssetId);
  }, [activeAssetId, selectAsset]);

  useEffect(() => {
    setSingleTagDraft('');
    setSingleCollectionDraft('');
    setSingleNotesDraft(
      activeAsset && typeof activeAsset.metadata?.notes === 'string' ? activeAsset.metadata.notes : ''
    );
  }, [activeAsset]);

  useEffect(() => {
    if (currentPath !== '/' && !scopeAssets.some((asset) => folderOk(asset, currentPath))) {
      setCurrentPath('/');
    }
  }, [scopeAssets, currentPath]);

  useEffect(() => {
    setSelectedAssetIds((previous) => previous.filter((id) => assets.some((asset) => asset.id === id)));
  }, [assets]);

  useEffect(() => {
    if (activeAssetId && !assets.some((asset) => asset.id === activeAssetId)) {
      setActiveAssetId(null);
    }
  }, [activeAssetId, assets]);

  useEffect(() => {
    if (!activeAssetId && selectedAssetIds.length > 0) {
      setActiveAssetId(selectedAssetIds[0]);
    }
  }, [activeAssetId, selectedAssetIds]);

  useEffect(() => {
    if (!expanded.length && folders.length) {
      setExpanded(folders.map((folder) => folder.id));
    }
  }, [expanded.length, folders]);

  useEffect(() => {
    if (!sessionReady) {
      setSavedFilters([]);
      return;
    }

    const controller = new AbortController();
    const run = async () => {
      try {
        const response = await fetch('/api/assets/views', {
          cache: 'no-store',
          headers: { 'x-rey30-project': projectName || 'untitled_project' },
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || 'No se pudieron cargar las vistas guardadas');
        }
        if (!controller.signal.aborted) {
          setSavedFilters(
            Array.isArray(payload.views)
              ? payload.views
                  .map((view: unknown) => mapServerViewToSavedFilter(view))
                  .filter((view): view is AssetBrowserSavedFilter => Boolean(view))
              : []
          );
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error('[assets][views]', error);
        }
      }
    };

    void run();
    return () => controller.abort();
  }, [projectName, sessionReady]);

  useEffect(() => {
    if (!sessionReady || !activeAsset) {
      setHistoryEntries([]);
      return;
    }

    const controller = new AbortController();
    const run = async () => {
      try {
        const entries = await loadHistoryForPath(activeAsset.path, controller.signal);
        if (!controller.signal.aborted) {
          setHistoryEntries(entries);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error('[assets][history]', error);
          setHistoryEntries([]);
        }
      }
    };

    void run();
    return () => controller.abort();
  }, [activeAsset, projectName, sessionReady]);

  const refreshSession = async (): Promise<boolean> => {
    setSessionChecking(true);
    try {
      const payload = (await loadClientAuthSession()) as AuthSessionPayload;
      const authenticated = Boolean(payload.authenticated);
      setSessionReady(authenticated);

      if (!authenticated) {
        setAssets([]);
        setSelectedAssetIds([]);
        setActiveAssetId(null);
        selectAsset(null);
        setMessage(AUTH_HINT);
      } else {
        setMessage('');
      }
      return authenticated;
    } catch {
      setSessionReady(false);
      setAssets([]);
      setSelectedAssetIds([]);
      setActiveAssetId(null);
      selectAsset(null);
      setMessage(AUTH_HINT);
      return false;
    } finally {
      setSessionChecking(false);
    }
  };

  const ensureSession = () => {
    if (sessionReady) return true;
    setMessage(AUTH_HINT);
    return false;
  };

  const loadAssets = async () => {
    if (!ensureSession()) return;

    try {
      const response = await fetch('/api/assets');
      if (response.status === 401 || response.status === 403) {
        setSessionReady(false);
        setAssets([]);
        setSelectedAssetIds([]);
        setActiveAssetId(null);
        selectAsset(null);
        setMessage(AUTH_HINT);
        return;
      }
      if (!response.ok) throw new Error(`Error ${response.status}`);

      const payload = await response.json();
      const list = (payload.assets || []).map((asset: any) => mapApiAsset(asset)) as Asset[];
      startTransition(() => {
        setAssets(list);
      });
      upsertIntoStore(list);
      setMessage('');
    } catch (error) {
      setMessage(`Error cargando assets: ${String(error)}`);
    }
  };

  useEffect(() => {
    void refreshSession();
  }, []);

  useEffect(() => {
    if (sessionReady) {
      void loadAssets();
    }
  }, [sessionReady]);

  const persistMetadataUpdates = async (
    updates: AssetMetadataUpdate[],
    successMessage: string
  ) => {
    if (!ensureSession()) return false;

    try {
      const response = await fetch('/api/assets', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-rey30-project': projectName || 'untitled_project',
        },
        body: JSON.stringify({ updates }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'No se pudieron actualizar los assets');
      }

      const updatedAssets = (payload.assets || []).map((asset: any) => mapApiAsset(asset)) as Asset[];
      startTransition(() => {
        setAssets((previous) => mergeAssetRecords(previous, updatedAssets));
      });
      upsertIntoStore(updatedAssets);
      const activePath = activeAsset?.path;
      if (activePath && updatedAssets.some((asset) => asset.path === activePath)) {
        try {
          setHistoryEntries(await loadHistoryForPath(activePath));
        } catch (historyError) {
          console.error('[assets][history][refresh]', historyError);
        }
      }
      setMessage(successMessage);
      return true;
    } catch (error) {
      setMessage(`Error actualizando metadata: ${String(error)}`);
      return false;
    }
  };

  const handleUpload = async (files: FileList) => {
    if (!ensureSession()) return;

    setUploading(true);
    setMessage('');

    const optimistic = Array.from(files).map((file, index) => ({
      id: `upload-${Date.now()}-${index}`,
      name: file.name,
      path: 'guardando en la libreria...',
      size: file.size,
      type: assetTypeFromFile(file.name),
      status: 'uploading' as const,
    }));
    setQueue((previous) => [...optimistic, ...previous].slice(0, 8));

    try {
      const formData = new FormData();
      Array.from(files).forEach((file) => formData.append('files', file));
      formData.append('targetFolder', currentPath);

      const response = await fetch('/api/assets', {
        method: 'POST',
        headers: { 'x-rey30-project': projectName || 'untitled_project' },
        body: formData,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'No se pudieron subir los archivos');
      }

      const uploadedAssets: Asset[] = (
        Array.isArray(payload.assets) ? payload.assets : payload.asset ? [payload.asset] : []
      ).map((asset: any) => mapApiAsset(asset));
      if (uploadedAssets.length === 0) {
        throw new Error('El servicio no devolvio assets guardados');
      }

      startTransition(() => {
        setAssets((previous) => mergeAssetRecords(previous, uploadedAssets));
      });
      upsertIntoStore(uploadedAssets);
      setQueue((previous) => {
        const withoutOptimistic = previous.filter(
          (item) => !optimistic.some((queued) => queued.id === item.id)
        );
        const persistedQueue = uploadedAssets.map((asset) => ({
          id: asset.id,
          name: asset.name,
          path: asset.path,
          size: asset.size,
          type: asset.type,
          status: 'ready' as const,
        }));
        return [...persistedQueue, ...withoutOptimistic].slice(0, 8);
      });
      setSelectedAssetIds([uploadedAssets[0].id]);
      setActiveAssetId(uploadedAssets[0].id);
      setScope('project');
      const uploadDirs = [...new Set(uploadedAssets.map((asset) => dirOf(asset)))];
      setCurrentPath(uploadDirs.length === 1 ? uploadDirs[0] : '/');
      setMessage(`${uploadedAssets.length} asset(s) persistidos en la libreria del proyecto.`);
    } catch (error) {
      setQueue((previous) => {
        const withoutOptimistic = previous.filter(
          (item) => !optimistic.some((queued) => queued.id === item.id)
        );
        const failed = optimistic.map((item) => ({
          ...item,
          status: 'error' as const,
          path: 'upload fallido',
        }));
        return [...failed, ...withoutOptimistic].slice(0, 8);
      });
      setMessage(`Error al subir assets: ${String(error)}`);
    } finally {
      setUploading(false);
    }
  };

  const handleAssetActivation = (asset: Asset, additive: boolean) => {
    if (additive) {
      setSelectedAssetIds((previous) => {
        const exists = previous.includes(asset.id);
        if (exists) {
          const next = previous.filter((id) => id !== asset.id);
          if (activeAssetId === asset.id) {
            setActiveAssetId(next[0] ?? null);
          }
          return next;
        }
        return [...previous, asset.id];
      });
      setActiveAssetId(asset.id);
      return;
    }

    setSelectedAssetIds([asset.id]);
    setActiveAssetId(asset.id);
  };

  const toggleAssetSelection = (asset: Asset) => {
    handleAssetActivation(asset, true);
  };

  const selectVisibleAssets = () => {
    if (visibleAssets.length === 0) return;
    setSelectedAssetIds(visibleAssets.map((asset) => asset.id));
    setActiveAssetId(visibleAssets[0].id);
    setMessage(`${visibleAssets.length} asset(s) seleccionados.`);
  };

  const clearSelection = () => {
    setSelectedAssetIds([]);
    setActiveAssetId(null);
  };

  const toggleFolder = (id: string) => {
    setExpanded((previous) =>
      previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id]
    );
  };

  const copyPath = async (asset: Asset) => {
    try {
      await navigator.clipboard.writeText(asset.path);
      setMessage(`Ruta copiada: ${asset.path}`);
    } catch {
      setMessage('No se pudo copiar la ruta del asset.');
    }
  };

  const openAsset = (asset: Asset) => {
    const fileUrl = typeof asset.metadata?.fileUrl === 'string' ? asset.metadata.fileUrl : null;
    if (!fileUrl) {
      setMessage('Este asset no tiene una URL protegida disponible.');
      return;
    }
    window.open(fileUrl, '_blank', 'noopener,noreferrer');
  };

  const importFromUrl = async () => {
    if (!ensureSession()) return;
    const url = window.prompt('URL del asset a importar');
    if (!url) return;

    try {
      const response = await fetch('/api/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
      await loadAssets();
      setMessage('Importacion remota completada.');
    } catch (error) {
      setMessage(`Import error: ${String(error)}`);
    }
  };

  const deleteAssets = async (targets: Asset[]) => {
    if (!ensureSession()) return { deleted: 0, protectedCount: 0, failed: 0 };

    const managed = targets.filter((asset) => isManagedAsset(asset));
    const protectedCount = targets.length - managed.length;
    if (managed.length === 0) {
      setMessage('La seleccion actual solo contiene assets protegidos o externos.');
      return { deleted: 0, protectedCount, failed: 0 };
    }

    const confirmMessage =
      managed.length === 1
        ? `Eliminar ${managed[0].name}? Esta accion borrara el archivo de la libreria local del proyecto.`
        : `Eliminar ${managed.length} assets gestionados de la libreria local del proyecto?`;
    if (!window.confirm(confirmMessage)) {
      return { deleted: 0, protectedCount: 0, failed: 0 };
    }

    const deletedPaths: string[] = [];
    let failed = 0;

    for (const asset of managed) {
      try {
        const response = await fetch(`/api/assets?path=${encodeURIComponent(asset.path)}`, {
          method: 'DELETE',
          headers: { 'x-rey30-project': projectName || 'untitled_project' },
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          failed += 1;
          console.error('[assets][delete]', payload.error || response.statusText);
          continue;
        }
        deletedPaths.push(asset.path);
      } catch (error) {
        failed += 1;
        console.error('[assets][delete]', error);
      }
    }

    if (deletedPaths.length > 0) {
      startTransition(() => {
        setAssets((previous) => previous.filter((asset) => !deletedPaths.includes(asset.path)));
      });
      removeFromStore(deletedPaths);
      setQueue((previous) => previous.filter((item) => !deletedPaths.includes(item.path)));
      setSelectedAssetIds((previous) =>
        previous.filter((id) => !managed.some((asset) => asset.id === id))
      );
      setActiveAssetId((previous) =>
        previous && managed.some((asset) => asset.id === previous) ? null : previous
      );
    }

    setMessage(
      `Eliminados ${deletedPaths.length} asset(s). Omitidos ${protectedCount}. Fallidos ${failed}.`
    );
    return { deleted: deletedPaths.length, protectedCount, failed };
  };

  const saveCurrentFilter = async () => {
    const name = savedFilterName.trim();
    if (!name) {
      setMessage('Escribe un nombre para guardar el filtro actual.');
      return;
    }

    const existing = savedFilters.find((filter) => filter.name.toLowerCase() === name.toLowerCase());
    const nextFilter: AssetBrowserSavedFilter = {
      id: existing?.id ?? `saved-filter-${Date.now()}`,
      name,
      query: search,
      scope,
      type: filterType,
      sortBy,
      tag: tagFilter,
      collection: collectionFilter,
      favoritesOnly,
      managedOnly,
    };

    try {
      const response = await fetch('/api/assets/views', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-rey30-project': projectName || 'untitled_project',
        },
        body: JSON.stringify({
          id: nextFilter.id,
          name: nextFilter.name,
          filter: {
            query: nextFilter.query,
            scope: nextFilter.scope,
            type: nextFilter.type,
            sortBy: nextFilter.sortBy,
            tag: nextFilter.tag,
            collection: nextFilter.collection,
            favoritesOnly: nextFilter.favoritesOnly,
            managedOnly: nextFilter.managedOnly,
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'No se pudo guardar la vista');
      }

      const view = mapServerViewToSavedFilter(payload.view);
      if (!view) {
        throw new Error('La vista guardada no regreso en formato valido');
      }
      setSavedFilters((previous) => {
        const existingById = previous.find((filter) => filter.id === view.id);
        return existingById
          ? previous.map((filter) => (filter.id === view.id ? view : filter))
          : [view, ...previous].slice(0, 16);
      });
      setSavedFilterName('');
      setMessage(`Filtro guardado: ${name}`);
    } catch (error) {
      setMessage(`No se pudo guardar la vista: ${String(error)}`);
    }
  };

  const applySavedFilter = (filter: AssetBrowserSavedFilter) => {
    setSearch(filter.query);
    setScope(filter.scope);
    setFilterType(filter.type);
    setSortBy(filter.sortBy);
    setTagFilter(filter.tag);
    setCollectionFilter(filter.collection);
    setFavoritesOnly(filter.favoritesOnly);
    setManagedOnly(filter.managedOnly);
    setCurrentPath('/');
    setMessage(`Filtro aplicado: ${filter.name}`);
  };

  const removeSavedFilter = async (id: string) => {
    try {
      const response = await fetch(`/api/assets/views?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { 'x-rey30-project': projectName || 'untitled_project' },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'No se pudo eliminar la vista');
      }
      setSavedFilters((previous) => previous.filter((filter) => filter.id !== id));
    } catch (error) {
      setMessage(`No se pudo eliminar la vista: ${String(error)}`);
    }
  };

  const clearFilters = () => {
    setSearch('');
    setFilterType('all');
    setSortBy('name');
    setTagFilter('');
    setCollectionFilter('');
    setFavoritesOnly(false);
    setManagedOnly(false);
    setCurrentPath('/');
    setMessage('Filtros limpiados.');
  };

  const toggleFavorite = async (asset: Asset) => {
    await persistMetadataUpdates(
      [
        {
          id: asset.id,
          path: asset.path,
          metadata: { favorite: !asset.isFavorite },
        },
      ],
      `${asset.isFavorite ? 'Favorito quitado' : 'Favorito agregado'}: ${asset.name}`
    );
  };

  const addTagsToAssets = async (targets: Asset[], rawValue: string) => {
    const tags = parseTokenInput(rawValue);
    if (tags.length === 0) {
      setMessage('Escribe al menos un tag valido.');
      return;
    }

    const updates = targets.map((asset) => ({
      id: asset.id,
      path: asset.path,
      metadata: {
        tags: readStringList(asset.metadata?.tags).concat(tags),
      },
    }));

    await persistMetadataUpdates(
      updates.map((update) => ({
        ...update,
        metadata: {
          ...update.metadata,
          tags: readStringList(update.metadata.tags),
        },
      })),
      `Tags agregados a ${targets.length} asset(s).`
    );
  };

  const removeTagFromAssets = async (targets: Asset[], rawValue: string) => {
    const tagsToRemove = new Set(parseTokenInput(rawValue).map((entry) => entry.toLowerCase()));
    if (tagsToRemove.size === 0) {
      setMessage('Escribe el tag que quieres quitar.');
      return;
    }

    const updates = targets.map((asset) => ({
      id: asset.id,
      path: asset.path,
      metadata: {
        tags: readStringList(asset.metadata?.tags).filter(
          (tag) => !tagsToRemove.has(tag.toLowerCase())
        ),
      },
    }));

    await persistMetadataUpdates(updates, `Tags retirados de ${targets.length} asset(s).`);
  };

  const addCollectionsToAssets = async (targets: Asset[], rawValue: string) => {
    const collections = parseTokenInput(rawValue);
    if (collections.length === 0) {
      setMessage('Escribe al menos una coleccion valida.');
      return;
    }

    const updates = targets.map((asset) => ({
      id: asset.id,
      path: asset.path,
      metadata: {
        collections: readStringList(asset.metadata?.collections).concat(collections),
      },
    }));

    await persistMetadataUpdates(
      updates.map((update) => ({
        ...update,
        metadata: {
          ...update.metadata,
          collections: readStringList(update.metadata.collections),
        },
      })),
      `Colecciones actualizadas en ${targets.length} asset(s).`
    );
  };

  const clearCollectionsFromAssets = async (targets: Asset[]) => {
    await persistMetadataUpdates(
      targets.map((asset) => ({
        id: asset.id,
        path: asset.path,
        metadata: {
          collections: [],
        },
      })),
      `Colecciones limpiadas en ${targets.length} asset(s).`
    );
  };

  const saveNotesForAsset = async () => {
    if (!activeAsset) return;
    await persistMetadataUpdates(
      [
        {
          id: activeAsset.id,
          path: activeAsset.path,
          metadata: {
            notes: singleNotesDraft.trim(),
          },
        },
      ],
      `Notas actualizadas: ${activeAsset.name}`
    );
  };

  const rollbackHistoryEntry = async (entryId: string) => {
    if (!activeAsset || !ensureSession()) return;

    try {
      const response = await fetch('/api/assets/history/rollback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-rey30-project': projectName || 'untitled_project',
        },
        body: JSON.stringify({ entryId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'No se pudo revertir el cambio');
      }

      const restoredAsset = mapApiAsset(payload.asset);
      startTransition(() => {
        setAssets((previous) => mergeAssetRecords(previous, [restoredAsset]));
      });
      upsertIntoStore([restoredAsset]);
      setHistoryEntries(await loadHistoryForPath(restoredAsset.path));
      setMessage(`Rollback aplicado: ${restoredAsset.name}`);
    } catch (error) {
      setMessage(`No se pudo revertir el cambio: ${String(error)}`);
    }
  };

  return (
    <div className="flex h-full flex-col bg-slate-950">
      <div className="border-b border-slate-800 px-2 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={loadAssets}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="h-8 gap-1"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" />
            {uploading ? 'Subiendo...' : 'Importar'}
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1" onClick={() => void importFromUrl()}>
            <ExternalLink className="h-3.5 w-3.5" />
            URL
          </Button>

          <div className="flex min-w-[220px] flex-1 items-center rounded-md bg-slate-900 px-2 py-1 text-xs ring-1 ring-inset ring-slate-800">
            {norm(currentPath) === '/' ? (
              <span className="text-slate-200">All Assets</span>
            ) : (
              <>
                <button
                  type="button"
                  className="text-slate-500 hover:text-slate-200"
                  onClick={() => setCurrentPath('/')}
                >
                  All Assets
                </button>
                {norm(currentPath)
                  .split('/')
                  .filter(Boolean)
                  .map((part, index, all) => (
                    <span key={`${part}-${index}`} className="flex items-center">
                      <ChevronRight className="mx-1 h-3 w-3 text-slate-600" />
                      <button
                        type="button"
                        className={cn(
                          index === all.length - 1
                            ? 'text-slate-100'
                            : 'text-slate-500 hover:text-slate-200'
                        )}
                        onClick={() => setCurrentPath(`/${all.slice(0, index + 1).join('/')}`)}
                      >
                        {fmtType(part)}
                      </button>
                    </span>
                  ))}
              </>
            )}
          </div>

          <div className="relative w-full max-w-[220px]">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar nombre, tags, path..."
              className="h-8 border-slate-700 bg-slate-900 pl-7 text-xs text-slate-100"
            />
          </div>

          <Select value={filterType} onValueChange={(value) => setFilterType(value as AssetBrowserFilterType)}>
            <SelectTrigger size="sm" className="h-8 w-[145px] border-slate-700 bg-slate-900 text-xs text-slate-100">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent className="border-slate-700 bg-slate-900 text-slate-100">
              {FILTERABLE_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {type === 'all' ? 'Todos los tipos' : fmtType(type)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={collectionFilter || ALL_COLLECTIONS_VALUE}
            onValueChange={(value) => setCollectionFilter(value === ALL_COLLECTIONS_VALUE ? '' : value)}
          >
            <SelectTrigger size="sm" className="h-8 w-[150px] border-slate-700 bg-slate-900 text-xs text-slate-100">
              <SelectValue placeholder="Coleccion" />
            </SelectTrigger>
            <SelectContent className="border-slate-700 bg-slate-900 text-slate-100">
              <SelectItem value={ALL_COLLECTIONS_VALUE}>Todas las colecciones</SelectItem>
              {collectionCounts.map((entry) => (
                <SelectItem key={entry.name} value={entry.name}>
                  {entry.name} ({entry.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={tagFilter || ALL_TAGS_VALUE} onValueChange={(value) => setTagFilter(value === ALL_TAGS_VALUE ? '' : value)}>
            <SelectTrigger size="sm" className="h-8 w-[145px] border-slate-700 bg-slate-900 text-xs text-slate-100">
              <SelectValue placeholder="Tag" />
            </SelectTrigger>
            <SelectContent className="border-slate-700 bg-slate-900 text-slate-100">
              <SelectItem value={ALL_TAGS_VALUE}>Todos los tags</SelectItem>
              {tagCounts.map((entry) => (
                <SelectItem key={entry.name} value={entry.name}>
                  {entry.name} ({entry.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={(value) => setSortBy(value as AssetBrowserSort)}>
            <SelectTrigger size="sm" className="h-8 w-[135px] border-slate-700 bg-slate-900 text-xs text-slate-100">
              <SelectValue placeholder="Ordenar" />
            </SelectTrigger>
            <SelectContent className="border-slate-700 bg-slate-900 text-slate-100">
              <SelectItem value="name">Nombre</SelectItem>
              <SelectItem value="type">Tipo</SelectItem>
              <SelectItem value="size">Tamano</SelectItem>
              <SelectItem value="modified">Fecha</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant={favoritesOnly ? 'default' : 'outline'}
            size="sm"
            className="h-8 gap-1"
            onClick={() => setFavoritesOnly((previous) => !previous)}
          >
            <Star className="h-3.5 w-3.5" />
            Favoritos
          </Button>
          <Button
            variant={managedOnly ? 'default' : 'outline'}
            size="sm"
            className="h-8 gap-1"
            onClick={() => setManagedOnly((previous) => !previous)}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Gestionados
          </Button>

          <div className="flex items-center rounded-md bg-slate-900 p-0.5 ring-1 ring-inset ring-slate-800">
            <Button variant={viewMode === 'grid' ? 'default' : 'ghost'} size="sm" className="h-6 w-6 p-0" onClick={() => setViewMode('grid')}>
              <Grid className="h-3.5 w-3.5" />
            </Button>
            <Button variant={viewMode === 'list' ? 'default' : 'ghost'} size="sm" className="h-6 w-6 p-0" onClick={() => setViewMode('list')}>
              <List className="h-3.5 w-3.5" />
            </Button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => event.target.files && void handleUpload(event.target.files)}
          />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Input
            value={savedFilterName}
            onChange={(event) => setSavedFilterName(event.target.value)}
            placeholder="Guardar filtro actual"
            className="h-8 w-[220px] border-slate-700 bg-slate-900 text-xs text-slate-100"
          />
          <Button variant="outline" size="sm" className="h-8 gap-1" onClick={saveCurrentFilter}>
            <Save className="h-3.5 w-3.5" />
            Guardar filtro
          </Button>
          <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={clearFilters}>
            <FilterX className="h-3.5 w-3.5" />
            Limpiar filtros
          </Button>
          <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={selectVisibleAssets}>
            <CheckSquare className="h-3.5 w-3.5" />
            Seleccionar visibles
          </Button>
          <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={clearSelection}>
            <Square className="h-3.5 w-3.5" />
            Limpiar seleccion
          </Button>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
          <Badge variant="outline" className="border-slate-700 bg-slate-900 text-slate-300">visibles {visibleAssets.length}</Badge>
          <Badge variant="outline" className="border-slate-700 bg-slate-900 text-slate-300">favoritos {favorites.length}</Badge>
          <Badge variant="outline" className="border-slate-700 bg-slate-900 text-slate-300">tags {tagCounts.length}</Badge>
          <Badge variant="outline" className="border-slate-700 bg-slate-900 text-slate-300">colecciones {collectionCounts.length}</Badge>
          <Badge variant="outline" className="border-slate-700 bg-slate-900 text-slate-300">seleccion {selectedAssets.length}</Badge>
          <Badge variant="outline" className="border-slate-700 bg-slate-900 text-slate-300">cola {queue.length}</Badge>
          {filterSummary.map((entry) => (
            <Badge key={entry} variant="outline" className="border-cyan-500/20 bg-cyan-500/10 text-cyan-200">
              {entry}
            </Badge>
          ))}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[240px_minmax(0,1fr)_340px]">
        <div className="border-r border-slate-800 bg-slate-950/70">
          <ScrollArea className="h-full">
            <div className="space-y-4 p-2">
              <div className="space-y-1">
                <div className="px-2 text-[10px] uppercase tracking-[0.24em] text-slate-500">Library</div>
                {(['all', 'project', 'shared', 'generated'] as Scope[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => {
                      setScope(item);
                      setCurrentPath('/');
                    }}
                    className={cn(
                      'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs',
                      scope === item ? 'bg-cyan-500/10 text-cyan-200' : 'text-slate-300 hover:bg-slate-900'
                    )}
                  >
                    <span>{item === 'all' ? 'All Assets' : fmtType(item)}</span>
                    <span className="text-[10px] text-slate-500">{scopeCounts[item]}</span>
                  </button>
                ))}
              </div>

              <div className="space-y-1">
                <div className="px-2 text-[10px] uppercase tracking-[0.24em] text-slate-500">Saved Filters</div>
                {savedFilters.length ? (
                  savedFilters.map((filter) => (
                    <div key={filter.id} className="flex items-center gap-1 rounded-md border border-slate-800 bg-slate-900/60 px-2 py-1.5">
                      <button type="button" className="min-w-0 flex-1 truncate text-left text-xs text-slate-200" onClick={() => applySavedFilter(filter)}>
                        {filter.name}
                      </button>
                      <button type="button" className="text-slate-500 hover:text-slate-200" onClick={() => removeSavedFilter(filter.id)}>
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="rounded-md border border-dashed border-slate-800 px-2 py-3 text-[11px] text-slate-500">
                    Guarda filtros para reutilizar busquedas, tags y colecciones.
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <div className="px-2 text-[10px] uppercase tracking-[0.24em] text-slate-500">Folders</div>
                <button
                  type="button"
                  onClick={() => setCurrentPath('/')}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs',
                    currentPath === '/' ? 'bg-cyan-500/10 text-cyan-200' : 'text-slate-300 hover:bg-slate-900'
                  )}
                >
                  <FolderOpen className="h-3.5 w-3.5 text-cyan-300" />
                  <span className="flex-1 truncate">All folders</span>
                  <span className="text-[10px] text-slate-500">{scopeAssets.length}</span>
                </button>
                {folders.length ? (
                  folders.map((folder) => (
                    <FolderNode
                      key={folder.id}
                      folder={folder}
                      currentPath={currentPath}
                      expanded={expanded}
                      level={0}
                      onSelect={setCurrentPath}
                      onToggle={toggleFolder}
                    />
                  ))
                ) : (
                  <div className="rounded-md border border-dashed border-slate-800 px-2 py-3 text-[11px] text-slate-500">
                    La libreria actual no tiene jerarquia navegable.
                  </div>
                )}
              </div>

              <SidebarFacet
                title="Collections"
                items={collectionCounts}
                activeValue={collectionFilter}
                onSelect={setCollectionFilter}
              />
              <SidebarFacet title="Tags" items={tagCounts} activeValue={tagFilter} onSelect={setTagFilter} />

              <div className="space-y-1">
                <div className="px-2 text-[10px] uppercase tracking-[0.24em] text-slate-500">Favorites</div>
                {favorites.length ? (
                  favorites.map((asset) => (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => handleAssetActivation(asset, false)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs',
                        activeAssetId === asset.id ? 'bg-amber-500/10 text-amber-200' : 'text-slate-300 hover:bg-slate-900'
                      )}
                    >
                      <Star className="h-3.5 w-3.5 fill-amber-300 text-amber-300" />
                      <span className="flex-1 truncate">{asset.name}</span>
                    </button>
                  ))
                ) : (
                  <div className="rounded-md border border-dashed border-slate-800 px-2 py-3 text-[11px] text-slate-500">
                    Marca favoritos para tener atajos aqui.
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        </div>

        <div className="flex min-h-0 flex-col">
          <div className="border-b border-slate-800 px-3 py-2 text-xs text-slate-400">
            Scope {scope} · {currentPath === '/' ? 'library root' : currentPath}
          </div>
          <ScrollArea className="flex-1">
            <div className="p-3">
              {visibleAssets.length ? (
                viewMode === 'grid' ? (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {visibleAssets.map((asset) => (
                      <AssetCard
                        key={asset.id}
                        asset={asset}
                        selected={selectedAssetIds.includes(asset.id)}
                        active={activeAssetId === asset.id}
                        onOpen={openAsset}
                        onToggleSelection={toggleAssetSelection}
                        onActivate={handleAssetActivation}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {visibleAssets.map((asset) => (
                      <AssetRow
                        key={asset.id}
                        asset={asset}
                        selected={selectedAssetIds.includes(asset.id)}
                        active={activeAssetId === asset.id}
                        onOpen={openAsset}
                        onToggleSelection={toggleAssetSelection}
                        onActivate={handleAssetActivation}
                      />
                    ))}
                  </div>
                )
              ) : (
                <div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 bg-slate-950/40 text-center text-slate-500">
                  <Folder className="mb-3 h-12 w-12 opacity-50" />
                  <p className="text-sm text-slate-300">No hay assets en esta vista</p>
                  <p className="mt-1 max-w-sm text-xs">Ajusta scope, carpeta o importa nuevos archivos.</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="mr-1 h-3.5 w-3.5" />
                    Importar assets
                  </Button>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        <div className="border-l border-slate-800 bg-slate-950/70">
          <ScrollArea className="h-full">
            <div className="space-y-4 p-3">
              {selectedAssets.length > 1 ? (
                <BulkActionsCard
                  selectedAssets={selectedAssets}
                  managedSelectedAssets={managedSelectedAssets}
                  bulkTagDraft={bulkTagDraft}
                  setBulkTagDraft={setBulkTagDraft}
                  bulkRemoveTagDraft={bulkRemoveTagDraft}
                  setBulkRemoveTagDraft={setBulkRemoveTagDraft}
                  bulkCollectionDraft={bulkCollectionDraft}
                  setBulkCollectionDraft={setBulkCollectionDraft}
                  onFavoriteAll={() =>
                    void persistMetadataUpdates(
                      selectedAssets.map((asset) => ({ id: asset.id, path: asset.path, metadata: { favorite: true } })),
                      `Favoritos activados en ${selectedAssets.length} asset(s).`
                    )
                  }
                  onUnfavoriteAll={() =>
                    void persistMetadataUpdates(
                      selectedAssets.map((asset) => ({ id: asset.id, path: asset.path, metadata: { favorite: false } })),
                      `Favoritos retirados en ${selectedAssets.length} asset(s).`
                    )
                  }
                  onAddTags={async () => {
                    await addTagsToAssets(selectedAssets, bulkTagDraft);
                    setBulkTagDraft('');
                  }}
                  onRemoveTags={async () => {
                    await removeTagFromAssets(selectedAssets, bulkRemoveTagDraft);
                    setBulkRemoveTagDraft('');
                  }}
                  onAddCollections={async () => {
                    await addCollectionsToAssets(selectedAssets, bulkCollectionDraft);
                    setBulkCollectionDraft('');
                  }}
                  onClearCollections={() => void clearCollectionsFromAssets(selectedAssets)}
                  onDelete={() => void deleteAssets(selectedAssets)}
                />
              ) : null}

              {activeAsset ? (
                <div className="space-y-4">
                  <ActiveAssetCard
                    asset={activeAsset}
                    versionHistory={versionHistory}
                    historyEntries={historyEntries}
                    singleTagDraft={singleTagDraft}
                    setSingleTagDraft={setSingleTagDraft}
                    singleCollectionDraft={singleCollectionDraft}
                    setSingleCollectionDraft={setSingleCollectionDraft}
                    singleNotesDraft={singleNotesDraft}
                    setSingleNotesDraft={setSingleNotesDraft}
                    onCopyPath={copyPath}
                    onOpen={openAsset}
                    onToggleFavorite={toggleFavorite}
                    onDelete={() => void deleteAssets([activeAsset])}
                    onRemoveTag={(tag) => void removeTagFromAssets([activeAsset], tag)}
                    onAddTags={async () => {
                      await addTagsToAssets([activeAsset], singleTagDraft);
                      setSingleTagDraft('');
                    }}
                    onRemoveCollection={(collection) =>
                      void persistMetadataUpdates(
                        [
                          {
                            id: activeAsset.id,
                            path: activeAsset.path,
                            metadata: {
                              collections: readStringList(activeAsset.metadata?.collections).filter(
                                (entry) => entry !== collection
                              ),
                            },
                          },
                        ],
                        `Coleccion retirada: ${collection}`
                      )
                    }
                    onAddCollections={async () => {
                      await addCollectionsToAssets([activeAsset], singleCollectionDraft);
                      setSingleCollectionDraft('');
                    }}
                    onSaveNotes={() => void saveNotesForAsset()}
                    onSelectVersion={(asset) => handleAssetActivation(asset, false)}
                    onRollbackHistory={(entryId) => void rollbackHistoryEntry(entryId)}
                  />
                </div>
              ) : (
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-xs text-slate-400">
                  Selecciona un asset para ver metadata, clasificacion, historial y acciones de biblioteca.
                </div>
              )}

              <SessionQueueCard queue={queue} />
            </div>
          </ScrollArea>
        </div>
      </div>

      {message ? <div className="border-t border-slate-800 px-3 py-2 text-[11px] text-amber-300">{message}</div> : null}
      {sessionChecking ? <div className="border-t border-slate-800 px-3 py-2 text-[11px] text-slate-400">Validando sesion...</div> : null}
      <div className="flex items-center justify-between border-t border-slate-800 px-3 py-1.5 text-[10px] text-slate-500">
        <span>{visibleAssets.length} asset(s) visibles · scope {scope} · seleccion {selectedAssets.length}</span>
        <span>{fmtSize(visibleAssets.reduce((sum, asset) => sum + asset.size, 0))}</span>
      </div>
    </div>
  );
}

function SidebarFacet({
  title,
  items,
  activeValue,
  onSelect,
}: {
  title: string;
  items: Array<{ name: string; count: number }>;
  activeValue: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="px-2 text-[10px] uppercase tracking-[0.24em] text-slate-500">{title}</div>
      {items.length ? (
        items.slice(0, 12).map((entry) => (
          <button
            key={entry.name}
            type="button"
            onClick={() => onSelect(entry.name)}
            className={cn(
              'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs',
              activeValue === entry.name
                ? 'bg-emerald-500/10 text-emerald-200'
                : 'text-slate-300 hover:bg-slate-900'
            )}
          >
            <span className="truncate">{entry.name}</span>
            <span className="text-[10px] text-slate-500">{entry.count}</span>
          </button>
        ))
      ) : (
        <div className="rounded-md border border-dashed border-slate-800 px-2 py-3 text-[11px] text-slate-500">
          Aun no hay {title.toLowerCase()} clasificados.
        </div>
      )}
    </div>
  );
}

function BulkActionsCard({
  selectedAssets,
  managedSelectedAssets,
  bulkTagDraft,
  setBulkTagDraft,
  bulkRemoveTagDraft,
  setBulkRemoveTagDraft,
  bulkCollectionDraft,
  setBulkCollectionDraft,
  onFavoriteAll,
  onUnfavoriteAll,
  onAddTags,
  onRemoveTags,
  onAddCollections,
  onClearCollections,
  onDelete,
}: {
  selectedAssets: Asset[];
  managedSelectedAssets: Asset[];
  bulkTagDraft: string;
  setBulkTagDraft: (value: string) => void;
  bulkRemoveTagDraft: string;
  setBulkRemoveTagDraft: (value: string) => void;
  bulkCollectionDraft: string;
  setBulkCollectionDraft: (value: string) => void;
  onFavoriteAll: () => void;
  onUnfavoriteAll: () => void;
  onAddTags: () => void | Promise<void>;
  onRemoveTags: () => void | Promise<void>;
  onAddCollections: () => void | Promise<void>;
  onClearCollections: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-medium text-slate-100">Bulk Actions</div>
          <div className="mt-1 text-[11px] text-slate-500">
            {selectedAssets.length} seleccionados · {fmtSize(selectedAssets.reduce((sum, asset) => sum + asset.size, 0))}
          </div>
        </div>
        <Badge variant="outline" className="border-slate-700 bg-slate-950 text-slate-300">
          gestionados {managedSelectedAssets.length}
        </Badge>
      </div>
      <div className="mt-4 grid gap-2">
        <Button variant="outline" size="sm" className="justify-start" onClick={onFavoriteAll}>
          <Star className="mr-2 h-3.5 w-3.5" />
          Marcar favoritos
        </Button>
        <Button variant="outline" size="sm" className="justify-start" onClick={onUnfavoriteAll}>
          <Star className="mr-2 h-3.5 w-3.5" />
          Quitar favoritos
        </Button>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <Input
            value={bulkTagDraft}
            onChange={(event) => setBulkTagDraft(event.target.value)}
            placeholder="Agregar tags"
            className="h-8 border-slate-700 bg-slate-950 text-xs text-slate-100"
          />
          <Button variant="outline" size="sm" className="h-8" onClick={onAddTags}>
            <Tag className="mr-2 h-3.5 w-3.5" />
            Agregar tags
          </Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <Input
            value={bulkRemoveTagDraft}
            onChange={(event) => setBulkRemoveTagDraft(event.target.value)}
            placeholder="Quitar tags"
            className="h-8 border-slate-700 bg-slate-950 text-xs text-slate-100"
          />
          <Button variant="outline" size="sm" className="h-8" onClick={onRemoveTags}>
            <X className="mr-2 h-3.5 w-3.5" />
            Quitar tags
          </Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <Input
            value={bulkCollectionDraft}
            onChange={(event) => setBulkCollectionDraft(event.target.value)}
            placeholder="Agregar coleccion"
            className="h-8 border-slate-700 bg-slate-950 text-xs text-slate-100"
          />
          <Button variant="outline" size="sm" className="h-8" onClick={onAddCollections}>
            Guardar
          </Button>
          <Button variant="ghost" size="sm" className="h-8" onClick={onClearCollections}>
            Limpiar
          </Button>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="justify-start text-red-200"
          disabled={managedSelectedAssets.length === 0}
          onClick={onDelete}
        >
          <Trash2 className="mr-2 h-3.5 w-3.5" />
          Eliminar seleccion gestionada
        </Button>
      </div>
    </div>
  );
}

function ActiveAssetCard({
  asset,
  versionHistory,
  historyEntries,
  singleTagDraft,
  setSingleTagDraft,
  singleCollectionDraft,
  setSingleCollectionDraft,
  singleNotesDraft,
  setSingleNotesDraft,
  onCopyPath,
  onOpen,
  onToggleFavorite,
  onDelete,
  onRemoveTag,
  onAddTags,
  onRemoveCollection,
  onAddCollections,
  onSaveNotes,
  onSelectVersion,
  onRollbackHistory,
}: {
  asset: Asset;
  versionHistory: Asset[];
  historyEntries: AssetMetadataHistoryEntry[];
  singleTagDraft: string;
  setSingleTagDraft: (value: string) => void;
  singleCollectionDraft: string;
  setSingleCollectionDraft: (value: string) => void;
  singleNotesDraft: string;
  setSingleNotesDraft: (value: string) => void;
  onCopyPath: (asset: Asset) => void;
  onOpen: (asset: Asset) => void;
  onToggleFavorite: (asset: Asset) => void;
  onDelete: () => void;
  onRemoveTag: (tag: string) => void;
  onAddTags: () => void;
  onRemoveCollection: (collection: string) => void;
  onAddCollections: () => void;
  onSaveNotes: () => void;
  onSelectVersion: (asset: Asset) => void;
  onRollbackHistory: (entryId: string) => void;
}) {
  return (
    <>
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex aspect-square items-center justify-center rounded-xl bg-slate-950 ring-1 ring-inset ring-slate-800">
          {asset.thumbnail ? (
            <img src={asset.thumbnail} alt={asset.name} className="h-full w-full rounded-xl object-cover" />
          ) : (
            iconFor(asset.type, cn('h-12 w-12', colorFor(asset.type)))
          )}
        </div>
        <h4 className="mt-4 truncate text-sm font-semibold text-slate-100">{asset.name}</h4>
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <Badge variant="outline" className="border-slate-700 bg-slate-950 text-slate-300">{fmtType(asset.type)}</Badge>
          {libraryBadge(asset) ? (
            <Badge variant="outline" className="border-cyan-500/20 bg-cyan-500/10 text-cyan-200">
              {libraryBadge(asset)}
            </Badge>
          ) : null}
          {asset.isFavorite ? (
            <Badge variant="outline" className="border-amber-500/20 bg-amber-500/10 text-amber-200">
              Favorite
            </Badge>
          ) : null}
          <Badge variant="outline" className="border-slate-700 bg-slate-950 text-slate-300">
            v{String(asset.metadata?.version ?? 1)}
          </Badge>
          {isManagedAsset(asset) ? (
            <Badge variant="outline" className="border-emerald-500/20 bg-emerald-500/10 text-emerald-200">
              Managed
            </Badge>
          ) : (
            <Badge variant="outline" className="border-slate-700 bg-slate-950 text-slate-400">
              Protected
            </Badge>
          )}
        </div>
        <div className="mt-4 grid gap-2">
          <Button variant="outline" size="sm" className="justify-start" onClick={() => onCopyPath(asset)}>
            <Copy className="mr-2 h-3.5 w-3.5" />
            Copiar ruta
          </Button>
          <Button variant="outline" size="sm" className="justify-start" onClick={() => onOpen(asset)}>
            <ExternalLink className="mr-2 h-3.5 w-3.5" />
            Abrir archivo
          </Button>
          <Button variant="outline" size="sm" className="justify-start" onClick={() => onToggleFavorite(asset)}>
            <Star className="mr-2 h-3.5 w-3.5" />
            {asset.isFavorite ? 'Quitar favorito' : 'Agregar favorito'}
          </Button>
          <Button variant="outline" size="sm" className="justify-start text-red-200" disabled={!isManagedAsset(asset)} onClick={onDelete}>
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            Eliminar asset
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="text-xs font-medium text-slate-100">Clasificacion</div>
        <div className="mt-3 text-[11px] text-slate-500">Tags</div>
        <div className="mt-2 flex flex-wrap gap-1">
          {readStringList(asset.metadata?.tags).length ? (
            readStringList(asset.metadata?.tags).map((tag) => (
              <button
                key={tag}
                type="button"
                className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-200"
                onClick={() => onRemoveTag(tag)}
              >
                {tag}
                <X className="h-3 w-3" />
              </button>
            ))
          ) : (
            <span className="text-[11px] text-slate-500">Sin tags</span>
          )}
        </div>
        <div className="mt-2 flex gap-2">
          <Input
            value={singleTagDraft}
            onChange={(event) => setSingleTagDraft(event.target.value)}
            placeholder="Agregar tags"
            className="h-8 border-slate-700 bg-slate-950 text-xs text-slate-100"
          />
          <Button variant="outline" size="sm" className="h-8" onClick={onAddTags}>
            <Tag className="mr-2 h-3.5 w-3.5" />
            Guardar
          </Button>
        </div>

        <div className="mt-4 text-[11px] text-slate-500">Colecciones</div>
        <div className="mt-2 flex flex-wrap gap-1">
          {readStringList(asset.metadata?.collections).length ? (
            readStringList(asset.metadata?.collections).map((collection) => (
              <button
                key={collection}
                type="button"
                className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-200"
                onClick={() => onRemoveCollection(collection)}
              >
                {collection}
                <X className="h-3 w-3" />
              </button>
            ))
          ) : (
            <span className="text-[11px] text-slate-500">Sin colecciones</span>
          )}
        </div>
        <div className="mt-2 flex gap-2">
          <Input
            value={singleCollectionDraft}
            onChange={(event) => setSingleCollectionDraft(event.target.value)}
            placeholder="Agregar coleccion"
            className="h-8 border-slate-700 bg-slate-950 text-xs text-slate-100"
          />
          <Button variant="outline" size="sm" className="h-8" onClick={onAddCollections}>
            Guardar
          </Button>
        </div>

        <div className="mt-4 text-[11px] text-slate-500">Notas</div>
        <Textarea
          value={singleNotesDraft}
          onChange={(event) => setSingleNotesDraft(event.target.value)}
          placeholder="Notas de produccion, uso o integracion"
          className="mt-2 min-h-[90px] border-slate-700 bg-slate-950 text-xs text-slate-100"
        />
        <Button variant="outline" size="sm" className="mt-2" onClick={onSaveNotes}>
          <Save className="mr-2 h-3.5 w-3.5" />
          Guardar notas
        </Button>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="text-xs font-medium text-slate-100">Metadata</div>
        <div className="mt-3 space-y-2 text-[11px]">
          <MetaRow label="Path" value={asset.path} />
          <MetaRow label="Size" value={fmtSize(asset.size)} />
          <MetaRow label="Modified" value={asset.modifiedAt.toLocaleString()} />
          <MetaRow label="Scope" value={scopeOf(asset)} />
          <MetaRow label="Version" value={`v${String(asset.metadata?.version ?? 1)}`} />
          {typeof asset.metadata?.projectKey === 'string' && asset.metadata.projectKey ? (
            <MetaRow label="Project" value={String(asset.metadata.projectKey)} />
          ) : null}
          {typeof asset.metadata?.source === 'string' ? (
            <MetaRow label="Source" value={String(asset.metadata.source)} />
          ) : null}
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-medium text-slate-100">Version History</div>
          <Badge variant="outline" className="border-slate-700 bg-slate-950 text-slate-300">{versionHistory.length}</Badge>
        </div>
        {versionHistory.length ? (
          <div className="mt-3 space-y-2">
            {versionHistory.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => onSelectVersion(entry)}
                className={cn(
                  'flex w-full items-start justify-between gap-3 rounded-lg border px-3 py-2 text-left text-xs',
                  entry.id === asset.id ? 'border-cyan-500/30 bg-cyan-500/10' : 'border-slate-800 bg-slate-950/70 hover:border-slate-700'
                )}
              >
                <div className="min-w-0">
                  <div className="truncate text-slate-100">v{String(entry.metadata?.version ?? 1)} · {entry.name}</div>
                  <div className="truncate text-[11px] text-slate-500">{entry.path}</div>
                </div>
                <div className="shrink-0 text-right text-[11px] text-slate-500">
                  <div>{fmtSize(entry.size)}</div>
                  <div>{entry.modifiedAt.toLocaleDateString()}</div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-xs text-slate-500">Este asset aun no tiene historial de versiones visible.</p>
        )}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-medium text-slate-100">Metadata Timeline</div>
          <Badge variant="outline" className="border-slate-700 bg-slate-950 text-slate-300">{historyEntries.length}</Badge>
        </div>
        {historyEntries.length ? (
          <div className="mt-3 space-y-2">
            {historyEntries.map((entry) => (
              <div key={entry.id} className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-slate-100">{entry.action === 'metadata.rollback' ? 'Rollback' : 'Update'}</div>
                    <div className="text-[11px] text-slate-500">{new Date(entry.createdAt).toLocaleString()}</div>
                    <div className="mt-1 text-[11px] text-slate-400">
                      despues:
                      {entry.after.favorite ? ' favorite' : ''}
                      {entry.after.tags?.length ? ` tags=${entry.after.tags.join(', ')}` : ''}
                      {entry.after.collections?.length ? ` colecciones=${entry.after.collections.join(', ')}` : ''}
                      {entry.after.notes ? ' notas' : ''}
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={() => onRollbackHistory(entry.id)}>
                    Revertir
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-xs text-slate-500">Aun no hay cambios de metadata registrados para este asset.</p>
        )}
      </div>
    </>
  );
}

function SessionQueueCard({ queue }: { queue: QueueItem[] }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium text-slate-100">Session Queue</div>
        <Badge variant="outline" className="border-slate-700 bg-slate-950 text-slate-300">{queue.length}</Badge>
      </div>
      {queue.length ? (
        <div className="mt-3 space-y-2">
          {queue.map((item) => (
            <div key={item.id} className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="truncate text-xs text-slate-100">{item.name}</div>
                <Badge
                  variant="outline"
                  className={cn(
                    item.status === 'ready'
                      ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200'
                      : item.status === 'error'
                        ? 'border-red-500/20 bg-red-500/10 text-red-200'
                        : 'border-amber-500/20 bg-amber-500/10 text-amber-200'
                  )}
                >
                  {item.status}
                </Badge>
              </div>
              <div className="mt-1 truncate text-[11px] text-slate-500">{item.path}</div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                <span>{fmtType(item.type)}</span>
                <span>{fmtSize(item.size)}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs text-slate-500">Los imports locales recientes apareceran aqui.</p>
      )}
    </div>
  );
}

function AssetCard({
  asset,
  selected,
  active,
  onOpen,
  onToggleSelection,
  onActivate,
}: {
  asset: Asset;
  selected: boolean;
  active: boolean;
  onOpen: (asset: Asset) => void;
  onToggleSelection: (asset: Asset) => void;
  onActivate: (asset: Asset, additive: boolean) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData('asset', JSON.stringify(asset));
        event.dataTransfer.effectAllowed = 'copy';
      }}
      onClick={(event) => onActivate(asset, event.metaKey || event.ctrlKey)}
      onDoubleClick={() => onOpen(asset)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          onOpen(asset);
          return;
        }
        if (event.key === ' ') {
          event.preventDefault();
          onActivate(asset, event.metaKey || event.ctrlKey);
        }
      }}
      className={cn(
        'cursor-pointer rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70',
        active ? 'border-cyan-500/40 bg-cyan-500/10' : selected ? 'border-amber-500/30 bg-amber-500/10' : 'border-slate-800 bg-slate-900/50 hover:border-slate-700 hover:bg-slate-900'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-slate-950 ring-1 ring-inset ring-slate-800">
          {asset.thumbnail ? <img src={asset.thumbnail} alt={asset.name} className="h-full w-full rounded-lg object-cover" /> : iconFor(asset.type, cn('h-7 w-7', colorFor(asset.type)))}
        </div>
        <div className="flex items-center gap-2">
          <Checkbox checked={selected} onCheckedChange={() => onToggleSelection(asset)} onClick={(event) => event.stopPropagation()} aria-label={`Seleccionar ${asset.name}`} />
          {asset.isFavorite ? <Star className="h-3.5 w-3.5 fill-amber-300 text-amber-300" /> : null}
        </div>
      </div>
      <div className="mt-3 truncate text-xs font-medium text-slate-100">{asset.name}</div>
      <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-500">
        <span>{fmtType(asset.type)}</span>
        <span>{fmtSize(asset.size)}</span>
      </div>
    </div>
  );
}

function AssetRow({
  asset,
  selected,
  active,
  onOpen,
  onToggleSelection,
  onActivate,
}: {
  asset: Asset;
  selected: boolean;
  active: boolean;
  onOpen: (asset: Asset) => void;
  onToggleSelection: (asset: Asset) => void;
  onActivate: (asset: Asset, additive: boolean) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData('asset', JSON.stringify(asset));
        event.dataTransfer.effectAllowed = 'copy';
      }}
      onClick={(event) => onActivate(asset, event.metaKey || event.ctrlKey)}
      onDoubleClick={() => onOpen(asset)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          onOpen(asset);
          return;
        }
        if (event.key === ' ') {
          event.preventDefault();
          onActivate(asset, event.metaKey || event.ctrlKey);
        }
      }}
      className={cn(
        'grid w-full cursor-pointer grid-cols-[24px_18px_minmax(0,1fr)_80px_80px] items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70',
        active ? 'border-cyan-500/40 bg-cyan-500/10' : selected ? 'border-amber-500/30 bg-amber-500/10' : 'border-slate-800 bg-slate-900/50 hover:border-slate-700 hover:bg-slate-900'
      )}
    >
      <Checkbox checked={selected} onCheckedChange={() => onToggleSelection(asset)} onClick={(event) => event.stopPropagation()} aria-label={`Seleccionar ${asset.name}`} />
      <div>{iconFor(asset.type, cn('h-4 w-4', colorFor(asset.type)))}</div>
      <div className="min-w-0">
        <div className="truncate text-slate-100">{asset.name}</div>
        <div className="truncate text-[11px] text-slate-500">{asset.path}</div>
      </div>
      <span className="text-slate-400">{fmtType(asset.type)}</span>
      <span className="text-slate-400">{fmtSize(asset.size)}</span>
    </div>
  );
}

function FolderNode({
  folder,
  currentPath,
  expanded,
  level,
  onSelect,
  onToggle,
}: {
  folder: AssetFolder;
  currentPath: string;
  expanded: string[];
  level: number;
  onSelect: (path: string) => void;
  onToggle: (id: string) => void;
}) {
  const isExpanded = expanded.includes(folder.id);
  const isSelected = currentPath === folder.path;
  const hasChildren = folder.children.length > 0;

  return (
    <div>
      <div className={cn('flex items-center rounded-md text-xs', isSelected ? 'bg-cyan-500/10 text-cyan-200' : 'text-slate-300 hover:bg-slate-900')} style={{ paddingLeft: `${8 + level * 12}px` }}>
        <button type="button" className="flex h-7 w-6 items-center justify-center text-slate-500 hover:text-slate-200" onClick={() => hasChildren && onToggle(folder.id)}>
          {hasChildren ? isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" /> : <span className="h-3.5 w-3.5" />}
        </button>
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-2 text-left" onClick={() => onSelect(folder.path)}>
          {isSelected ? <FolderOpen className="h-3.5 w-3.5 shrink-0 text-cyan-300" /> : <Folder className="h-3.5 w-3.5 shrink-0 text-yellow-400" />}
          <span className="truncate">{folder.name}</span>
          <span className="ml-auto text-[10px] text-slate-500">{folder.count}</span>
        </button>
      </div>
      {hasChildren && isExpanded ? (
        <div>
          {folder.children.map((child) => (
            <FolderNode key={child.id} folder={child} currentPath={currentPath} expanded={expanded} level={level + 1} onSelect={onSelect} onToggle={onToggle} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="max-w-[170px] text-right text-slate-300">{value}</span>
    </div>
  );
}
