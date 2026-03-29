// ============================================
// Asset Browser Panel - Complete Asset Management
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Search,
  Folder,
  FolderOpen,
  File,
  Image as ImageIcon,
  Box,
  Music,
  Video,
  FileText,
  Code,
  FileJson,
  Archive,
  Layers,
  MoreHorizontal,
  ChevronRight,
  ChevronDown,
  Upload,
  Download,
  Trash2,
  RefreshCw,
  Plus,
  Grid,
  List,
  Filter,
  Star,
  ExternalLink,
  Copy,
  FolderPlus,
  FilePlus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEngineStore } from '@/store/editorStore';
import { buildAssetFileUrl } from './assetUrls';

// Asset Types
export type AssetType = 
  | 'folder' 
  | 'model' 
  | 'texture' 
  | 'material' 
  | 'modifier_preset'
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

export interface AssetFolder {
  id: string;
  name: string;
  path: string;
  children: AssetFolder[];
  assets: Asset[];
  isExpanded?: boolean;
}

interface AuthSessionPayload {
  authenticated?: boolean;
}

const ASSET_BROWSER_AUTH_HINT = 'Inicia sesion en Config APIs -> Usuario para usar Assets.';

// Get icon for asset type
function getAssetIcon(type: AssetType) {
  switch (type) {
    case 'folder': return Folder;
    case 'model': return Box;
    case 'texture': return ImageIcon;
    case 'material': return Archive;
    case 'modifier_preset': return Layers;
    case 'audio': return Music;
    case 'video': return Video;
    case 'script': return Code;
    case 'scene': return FileJson;
    case 'prefab': return Box;
    case 'animation': return Video;
    case 'font': return FileText;
    default: return File;
  }
}

// Get color for asset type
function getAssetColor(type: AssetType) {
  switch (type) {
    case 'folder': return 'text-yellow-400';
    case 'model': return 'text-purple-400';
    case 'texture': return 'text-pink-400';
    case 'material': return 'text-cyan-400';
    case 'modifier_preset': return 'text-emerald-300';
    case 'audio': return 'text-green-400';
    case 'video': return 'text-red-400';
    case 'script': return 'text-blue-400';
    case 'scene': return 'text-orange-400';
    case 'prefab': return 'text-indigo-400';
    case 'animation': return 'text-teal-400';
    default: return 'text-slate-400';
  }
}

// Asset Type Icon Component (to avoid creating components during render)
function AssetTypeIcon({ type, className }: { type: AssetType; className?: string }) {
  switch (type) {
    case 'folder': return <Folder className={className} />;
    case 'model': return <Box className={className} />;
    case 'texture': return <ImageIcon className={className} />;
    case 'material': return <Archive className={className} />;
    case 'modifier_preset': return <Layers className={className} />;
    case 'audio': return <Music className={className} />;
    case 'video': return <Video className={className} />;
    case 'script': return <Code className={className} />;
    case 'scene': return <FileJson className={className} />;
    case 'prefab': return <Box className={className} />;
    case 'animation': return <Video className={className} />;
    case 'font': return <FileText className={className} />;
    default: return <File className={className} />;
  }
}

// Format file size
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function mapType(type: string): AssetType {
  const mapping: Record<string, AssetType> = {
    mesh: 'model',
    texture: 'texture',
    material: 'material',
    modifier_preset: 'modifier_preset',
    audio: 'audio',
    video: 'video',
    script: 'script',
    prefab: 'prefab',
    scene: 'scene',
    animation: 'animation',
    font: 'font',
  };
  return mapping[type] || 'other';
}

function mapEngineType(type: AssetType): any {
  switch (type) {
    case 'model': return 'mesh';
    case 'texture': return 'texture';
    case 'material': return 'material';
    case 'modifier_preset': return 'modifier_preset';
    case 'audio': return 'audio';
    case 'video': return 'video';
    case 'script': return 'script';
    case 'scene': return 'scene';
    case 'animation': return 'animation';
    default: return 'prefab';
  }
}

function buildFolders(list: Asset[]): AssetFolder[] {
  const grouped = new Map<string, AssetFolder>();
  list.forEach((asset) => {
    const seg = asset.type;
    if (!grouped.has(seg)) {
      grouped.set(seg, {
        id: seg,
        name: getFolderLabel(seg),
        path: `/assets/${seg}`,
        children: [],
        assets: [],
      });
    }
    grouped.get(seg)!.assets.push(asset);
  });
  return Array.from(grouped.values());
}

function getFolderLabel(type: AssetType) {
  switch (type) {
    case 'model':
      return 'models';
    case 'modifier_preset':
      return 'modifier presets';
    default:
      return type;
  }
}

function getLibraryBadge(asset: Asset) {
  if (!asset.metadata?.library) return null;
  return asset.metadata.scope === 'shared' ? 'Shared Library' : 'Project Library';
}

export function AssetBrowserPanel() {
  const selectAsset = useEngineStore((state) => state.selectAsset);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [folders, setFolders] = useState<AssetFolder[]>([]);
  const [currentPath, setCurrentPath] = useState('/');
  const [search, setSearch] = useState('');
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filterType, setFilterType] = useState<AssetType | 'all'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'type' | 'size' | 'modified'>('name');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string>('');
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionChecking, setSessionChecking] = useState(true);

  const refreshSession = async (): Promise<boolean> => {
    setSessionChecking(true);
    try {
      const response = await fetch('/api/auth/session', { cache: 'no-store' });
      const payload = (await response.json().catch(() => ({}))) as AuthSessionPayload;
      const authenticated = Boolean(payload.authenticated);
      setSessionReady(authenticated);
      if (!authenticated) {
        setAssets([]);
        setFolders([]);
        setSelectedAsset(null);
        selectAsset(null);
        setMessage(ASSET_BROWSER_AUTH_HINT);
      } else {
        setMessage('');
      }
      return authenticated;
    } catch {
      setSessionReady(false);
      setAssets([]);
      setFolders([]);
      setSelectedAsset(null);
      selectAsset(null);
      setMessage(ASSET_BROWSER_AUTH_HINT);
      return false;
    } finally {
      setSessionChecking(false);
    }
  };

  const ensureSessionReady = (): boolean => {
    if (sessionReady) return true;
    setMessage(ASSET_BROWSER_AUTH_HINT);
    return false;
  };

  const loadAssets = async () => {
    if (!ensureSessionReady()) return;
    try {
      const res = await fetch('/api/assets');
      if (res.status === 401 || res.status === 403) {
        setSessionReady(false);
        setAssets([]);
        setFolders([]);
        setSelectedAsset(null);
        selectAsset(null);
        setMessage(ASSET_BROWSER_AUTH_HINT);
        return;
      }
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const payload = await res.json();
      const list = (payload.assets || []).map((a: any) => ({
        id: a.id,
        name: a.name,
        type: mapType(a.type),
        path: a.path,
        size: a.size,
        modifiedAt: new Date(a.createdAt),
        thumbnail: mapType(a.type) === 'texture' ? buildAssetFileUrl(a.path) : undefined,
        metadata: {
          ...(a.metadata && typeof a.metadata === 'object' ? a.metadata : {}),
          hash: a.hash,
          version: a.version,
          source: a.source,
          adapted: a.adapted,
          fileUrl: buildAssetFileUrl(a.path),
        },
      })) as Asset[];
      setAssets(list);
      setFolders(buildFolders(list));
      useEngineStore.setState((state) => {
        const merged = [...state.assets];
        const knownPaths = new Set(merged.map((asset) => asset.path));
        list.forEach((asset) => {
          if (knownPaths.has(asset.path)) return;
          merged.push({
            id: asset.id,
            name: asset.name,
            type: mapEngineType(asset.type),
            path: asset.path,
            size: asset.size,
            createdAt: asset.modifiedAt,
            metadata: asset.metadata || {},
          } as any);
          knownPaths.add(asset.path);
        });
        return { assets: merged };
      });
      setMessage('');
    } catch (error) {
      setMessage(`Error cargando assets: ${String(error)}`);
    }
  };

  useEffect(() => {
    void refreshSession();
  }, []);

  useEffect(() => {
    if (!sessionReady) return;
    void loadAssets();
  }, [sessionReady]);

  useEffect(() => {
    selectAsset(selectedAsset?.id ?? null);
  }, [selectedAsset, selectAsset]);

  // Filter assets
  const filteredAssets = assets.filter(asset => {
    if (filterType !== 'all' && asset.type !== filterType) return false;
    if (search && !asset.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }).sort((a, b) => {
    switch (sortBy) {
      case 'name': return a.name.localeCompare(b.name);
      case 'type': return a.type.localeCompare(b.type);
      case 'size': return b.size - a.size;
      case 'modified': return b.modifiedAt.getTime() - a.modifiedAt.getTime();
      default: return 0;
    }
  });

  // Handle file upload
  const handleUpload = async (files: FileList) => {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const type = getAssetTypeFromFile(file.name);
      
      const newAsset: Asset = {
        id: crypto.randomUUID(),
        name: file.name,
        type,
        path: `${currentPath}${file.name}`,
        size: file.size,
        modifiedAt: new Date(),
      };
      
      setAssets(prev => [...prev, newAsset]);
    }
  };

  // Handle drag start
  const handleDragStart = (e: React.DragEvent, asset: Asset) => {
    e.dataTransfer.setData('asset', JSON.stringify(asset));
    e.dataTransfer.effectAllowed = 'copy';
  };

  // Toggle favorite
  const toggleFavorite = (asset: Asset) => {
    setAssets(prev => prev.map(a => 
      a.id === asset.id ? { ...a, isFavorite: !a.isFavorite } : a
    ));
  };

  return (
    <div className="flex flex-col h-full bg-slate-900">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-slate-800">
        {/* Navigation */}
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={loadAssets}>
            <RefreshCw className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => {
              if (!ensureSessionReady()) return;
              const url = prompt('URL del asset a importar');
              if (!url) return;
              fetch('/api/assets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
              })
                .then(() => loadAssets())
                .catch((err) => setMessage(`Import error: ${String(err)}`));
            }}
          >
            <Upload className="w-3 h-3" />
          </Button>
        </div>

        {/* Path */}
        <div className="flex-1 flex items-center h-6 px-2 bg-slate-800 rounded text-xs text-slate-400">
          <span className="text-slate-500">Assets</span>
          {currentPath.split('/').filter(Boolean).map((part, i, arr) => (
            <span key={i} className="flex items-center">
              <ChevronRight className="w-3 h-3 mx-1" />
              <span className="text-slate-300">{part}</span>
            </span>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-40">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search assets..."
            className="h-6 pl-6 text-xs bg-slate-800 border-slate-700"
          />
        </div>

        {/* View Mode */}
        <div className="flex items-center bg-slate-800 rounded p-0.5">
          <Button
            variant={viewMode === 'grid' ? 'default' : 'ghost'}
            size="sm"
            className="h-5 w-5 p-0"
            onClick={() => setViewMode('grid')}
          >
            <Grid className="w-3 h-3" />
          </Button>
          <Button
            variant={viewMode === 'list' ? 'default' : 'ghost'}
            size="sm"
            className="h-5 w-5 p-0"
            onClick={() => setViewMode('list')}
          >
            <List className="w-3 h-3" />
          </Button>
        </div>

        {/* Add */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
              <Plus className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-slate-800 border-slate-700">
            <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
              <Upload className="w-3.5 h-3.5 mr-2" />
              Import Asset
            </DropdownMenuItem>
            <DropdownMenuItem>
              <FolderPlus className="w-3.5 h-3.5 mr-2" />
              New Folder
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <FilePlus className="w-3.5 h-3.5 mr-2" />
              New Script
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Archive className="w-3.5 h-3.5 mr-2" />
              New Material
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleUpload(e.target.files)}
        />
      </div>

      {/* Folders & Assets */}
      <div className="flex-1 flex min-h-0">
        {/* Folder Tree */}
        <div className="w-40 border-r border-slate-800 p-1">
          <div className="text-[10px] text-slate-500 uppercase px-2 py-1">Folders</div>
          <ScrollArea className="h-full">
            {folders.map(folder => (
              <FolderItem
                key={folder.id}
                folder={folder}
                selected={currentPath === folder.path}
                onClick={() => setCurrentPath(folder.path)}
              />
            ))}
            
            {/* Favorites */}
            <div className="mt-4">
              <div className="text-[10px] text-slate-500 uppercase px-2 py-1">Favorites</div>
              {assets.filter(a => a.isFavorite).map(asset => (
                <div
                  key={asset.id}
                  className="flex items-center gap-2 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 rounded cursor-pointer"
                  onClick={() => setSelectedAsset(asset)}
                >
                  <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                  <span className="truncate">{asset.name}</span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Asset Grid/List */}
        <ScrollArea className="flex-1 p-2">
          {viewMode === 'grid' ? (
            <div className="grid grid-cols-4 gap-2">
              {filteredAssets.map(asset => (
                <AssetGridItem
                  key={asset.id}
                  asset={asset}
                  selected={selectedAsset?.id === asset.id}
                  onClick={() => setSelectedAsset(asset)}
                  onDoubleClick={() => {/* Open asset */}}
                  onDragStart={(e) => handleDragStart(e, asset)}
                  onToggleFavorite={() => toggleFavorite(asset)}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-0.5">
              {filteredAssets.map(asset => (
                <AssetListItem
                  key={asset.id}
                  asset={asset}
                  selected={selectedAsset?.id === asset.id}
                  onClick={() => setSelectedAsset(asset)}
                  onDoubleClick={() => {/* Open asset */}}
                  onDragStart={(e) => handleDragStart(e, asset)}
                  onToggleFavorite={() => toggleFavorite(asset)}
                />
              ))}
            </div>
          )}

          {filteredAssets.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-slate-500">
              <Folder className="w-12 h-12 mb-2 opacity-50" />
              <p className="text-sm">No assets found</p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-3 h-3 mr-1" />
                Import Assets
              </Button>
            </div>
          )}
        </ScrollArea>

        {/* Preview Panel */}
        {selectedAsset && (
          <div className="w-48 border-l border-slate-800 p-2">
            <AssetPreview asset={selectedAsset} />
          </div>
        )}
      </div>

      {message && (
        <div className="px-3 py-2 text-[11px] text-amber-300 border-t border-slate-800">
          {message}
        </div>
      )}
      {sessionChecking && (
        <div className="px-3 py-2 text-[11px] text-slate-400 border-t border-slate-800">
          Validando sesion...
        </div>
      )}
      {/* Status Bar */}
      <div className="flex items-center justify-between px-2 py-1 border-t border-slate-800 text-[10px] text-slate-500">
        <span>{filteredAssets.length} assets</span>
        <span>
          {filteredAssets.reduce((sum, a) => sum + a.size, 0) > 0 &&
            formatSize(filteredAssets.reduce((sum, a) => sum + a.size, 0))
          }
        </span>
      </div>
    </div>
  );
}

// Folder Item
function FolderItem({
  folder,
  selected,
  onClick,
}: {
  folder: AssetFolder;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2 py-1 text-xs rounded cursor-pointer",
        selected ? "bg-blue-500/20 text-blue-300" : "text-slate-300 hover:bg-slate-800"
      )}
      onClick={onClick}
    >
      <Folder className="w-3.5 h-3.5 text-yellow-400" />
      <span className="truncate">{folder.name}</span>
    </div>
  );
}

// Asset Grid Item
function AssetGridItem({
  asset,
  selected,
  onClick,
  onDoubleClick,
  onDragStart,
  onToggleFavorite,
}: {
  asset: Asset;
  selected: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onToggleFavorite: () => void;
}) {
  const color = getAssetColor(asset.type);
  const libraryBadge = getLibraryBadge(asset);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className={cn(
        "group relative flex flex-col items-center p-2 rounded-lg cursor-pointer transition-colors",
        selected ? "bg-blue-500/20 ring-1 ring-blue-500" : "hover:bg-slate-800"
      )}
    >
      {/* Thumbnail */}
      <div className="w-12 h-12 flex items-center justify-center bg-slate-800 rounded mb-1">
        {asset.thumbnail ? (
          <img src={asset.thumbnail} alt={asset.name} className="w-full h-full object-cover rounded" />
        ) : (
          <AssetTypeIcon type={asset.type} className={cn("w-6 h-6", color)} />
        )}
      </div>

      {/* Name */}
      <span className="text-[10px] text-slate-300 text-center truncate w-full">
        {asset.name}
      </span>
      {libraryBadge && (
        <span className="mt-1 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-1.5 py-0.5 text-[9px] text-cyan-200">
          {libraryBadge}
        </span>
      )}

      {/* Favorite */}
      {asset.isFavorite && (
        <Star className="absolute top-1 right-1 w-3 h-3 text-yellow-400 fill-yellow-400" />
      )}

      {/* Context Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 p-0.5 bg-slate-900/80 rounded"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="w-3 h-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="bg-slate-800 border-slate-700">
          <DropdownMenuItem onClick={onToggleFavorite}>
            <Star className="w-3.5 h-3.5 mr-2" />
            {asset.isFavorite ? 'Remove Favorite' : 'Add Favorite'}
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Copy className="w-3.5 h-3.5 mr-2" />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem>
            <ExternalLink className="w-3.5 h-3.5 mr-2" />
            Open in Explorer
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-red-400">
            <Trash2 className="w-3.5 h-3.5 mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// Asset List Item
function AssetListItem({
  asset,
  selected,
  onClick,
  onDoubleClick,
  onDragStart,
  onToggleFavorite,
}: {
  asset: Asset;
  selected: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onToggleFavorite: () => void;
}) {
  const color = getAssetColor(asset.type);
  const libraryBadge = getLibraryBadge(asset);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className={cn(
        "group flex items-center gap-2 px-2 py-1 rounded cursor-pointer",
        selected ? "bg-blue-500/20" : "hover:bg-slate-800"
      )}
    >
      <AssetTypeIcon type={asset.type} className={cn("w-4 h-4 shrink-0", color)} />
      <span className="flex-1 text-xs text-slate-300 truncate">{asset.name}</span>
      {libraryBadge && (
        <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-1.5 py-0.5 text-[9px] text-cyan-200">
          {libraryBadge}
        </span>
      )}
      <span className="text-[10px] text-slate-500 w-16">{formatSize(asset.size)}</span>
      <span className="text-[10px] text-slate-500 w-20">{asset.modifiedAt.toLocaleDateString()}</span>
      
      {asset.isFavorite && (
        <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
      )}
    </div>
  );
}

// Asset Preview
function AssetPreview({ asset }: { asset: Asset }) {
  const color = getAssetColor(asset.type);
  const libraryBadge = getLibraryBadge(asset);

  return (
    <div className="space-y-3">
      {/* Preview */}
      <div className="aspect-square bg-slate-800 rounded-lg flex items-center justify-center">
        {asset.thumbnail ? (
          <img src={asset.thumbnail} alt={asset.name} className="w-full h-full object-cover rounded-lg" />
        ) : (
          <AssetTypeIcon type={asset.type} className={cn("w-12 h-12", color)} />
        )}
      </div>

      {/* Info */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-slate-200 truncate">{asset.name}</h4>
        {libraryBadge && (
          <div className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 text-[10px] text-cyan-200">
            {libraryBadge}
          </div>
        )}
        
        <div className="space-y-1 text-[10px]">
          <div className="flex justify-between">
            <span className="text-slate-500">Type</span>
            <span className="text-slate-300">{asset.type}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Size</span>
            <span className="text-slate-300">{formatSize(asset.size)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Modified</span>
            <span className="text-slate-300">{asset.modifiedAt.toLocaleDateString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Path</span>
            <span className="text-slate-300 truncate max-w-[100px]">{asset.path}</span>
          </div>
          {typeof asset.metadata?.projectKey === 'string' && asset.metadata.projectKey.length > 0 && (
            <div className="flex justify-between">
              <span className="text-slate-500">Project</span>
              <span className="text-slate-300 truncate max-w-[100px]">
                {String(asset.metadata.projectKey)}
              </span>
            </div>
          )}
          {typeof asset.metadata?.scope === 'string' && (
            <div className="flex justify-between">
              <span className="text-slate-500">Scope</span>
              <span className="text-slate-300">{String(asset.metadata.scope)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Get asset type from file extension
function getAssetTypeFromFile(filename: string): AssetType {
  const ext = filename.split('.').pop()?.toLowerCase();
  
  switch (ext) {
    case 'fbx':
    case 'obj':
    case 'gltf':
    case 'glb':
    case 'dae':
    case 'blend':
      return 'model';
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'tga':
    case 'bmp':
    case 'hdr':
    case 'exr':
      return 'texture';
    case 'wav':
    case 'mp3':
    case 'ogg':
    case 'aiff':
      return 'audio';
    case 'mp4':
    case 'mov':
    case 'avi':
    case 'webm':
      return 'video';
    case 'ts':
    case 'js':
    case 'jsx':
    case 'tsx':
      return 'script';
    case 'scene':
    case 'scn':
      return 'scene';
    case 'prefab':
    case 'pref':
      return 'prefab';
    case 'anim':
      return 'animation';
    default:
      return 'other';
  }
}
