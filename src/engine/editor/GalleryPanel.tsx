'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useEngineStore } from '@/store/editorStore';
import type { AssetType } from '@/types/engine';
import {
  Copy,
  Download,
  ExternalLink,
  Folder,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import { Card } from '@/components/ui/card';

type GalleryKind =
  | 'model'
  | 'texture'
  | 'animation'
  | 'scene'
  | 'character'
  | 'video'
  | 'audio'
  | 'script'
  | 'other';

interface GalleryItem {
  name: string;
  url: string;
  relativePath: string;
  filePath: string;
  size: number;
  modifiedAt: string;
  kind: GalleryKind;
  category: string;
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function mapKindToAssetType(kind: GalleryKind): AssetType {
  switch (kind) {
    case 'model':
      return 'mesh';
    case 'texture':
      return 'texture';
    case 'animation':
      return 'animation';
    case 'scene':
      return 'scene';
    case 'character':
      return 'prefab';
    case 'video':
      return 'video';
    case 'audio':
      return 'audio';
    case 'script':
      return 'script';
    default:
      return 'material';
  }
}

export function GalleryPanel() {
  const { addAsset, assets } = useEngineStore();
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [importingLocal, setImportingLocal] = useState(false);
  const [inputRoot, setInputRoot] = useState<string>('input_Galeria_Rey30');
  const [category, setCategory] = useState('general');
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [pkgName, setPkgName] = useState('Paquete');
  const [pkgKinds, setPkgKinds] = useState<GalleryKind[]>(['character', 'scene', 'animation']);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const needle = search.toLowerCase();
    return items.filter((item) =>
      `${item.name} ${item.kind} ${item.category}`.toLowerCase().includes(needle)
    );
  }, [items, search]);

  const packageAssets = useMemo(
    () => assets.filter((a) => a.metadata?.package === true),
    [assets]
  );

  const loadItems = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/gallery');
      const payload = await response.json().catch(() => ({}));
      setItems(Array.isArray(payload.items) ? payload.items : []);
      setMessage('');
    } catch (error) {
      setMessage(`Error cargando galeria: ${String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
    fetch('/api/gallery/import-local')
      .then((res) => res.json())
      .then((payload) => {
        if (payload?.inputRoot) setInputRoot(payload.inputRoot);
      })
      .catch(() => null);
  }, []);

  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    setUploading(true);
    setMessage('');
    try {
      const formData = new FormData();
      formData.append('category', category);
      Array.from(fileList).forEach((file) => formData.append('files', file));

      const response = await fetch('/api/gallery', {
        method: 'POST',
        body: formData,
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'No se pudo subir el archivo');
      }

      const uploaded = Array.isArray(payload.items) ? payload.items : [];
      setItems((current) => [...uploaded, ...current]);
      setMessage(`${uploaded.length} archivo(s) subidos a galeria.`);
    } catch (error) {
      setMessage(`Error al subir archivos: ${String(error)}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (item: GalleryItem) => {
    try {
      const response = await fetch(`/api/gallery?path=${encodeURIComponent(item.relativePath)}`, {
        method: 'DELETE',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'No se pudo borrar el archivo');
      }
      setItems((current) => current.filter((entry) => entry.url !== item.url));
    } catch (error) {
      setMessage(`Error borrando archivo: ${String(error)}`);
    }
  };

  const importToEngine = (item: GalleryItem) => {
    addAsset({
      id: crypto.randomUUID(),
      name: item.name,
      type: mapKindToAssetType(item.kind),
      path: item.url,
      size: item.size,
      createdAt: new Date(item.modifiedAt),
      metadata: {
        source: 'gallery',
        category: item.category,
        kind: item.kind,
        url: item.url,
      },
    });
    setMessage(`Asset agregado al motor: ${item.name}`);
  };

  const copyUrl = async (item: GalleryItem) => {
    const absolute = `${window.location.origin}${item.url}`;
    await navigator.clipboard.writeText(absolute);
    setMessage(`URL copiada: ${item.name}`);
  };

  const createPackage = async () => {
    if (!pkgName.trim()) return;
    const allowedTypes: AssetType[] = ['mesh', 'texture', 'animation', 'scene', 'prefab', 'audio', 'video', 'script'];
    const include = assets.filter((a) => {
      if (!allowedTypes.includes(a.type)) return false;
      const kind: GalleryKind = a.type === 'mesh'
        ? 'model'
        : a.type === 'animation'
        ? 'animation'
        : a.type === 'scene'
        ? 'scene'
        : a.type === 'prefab'
        ? 'character'
        : a.type === 'audio'
        ? 'audio'
        : a.type === 'video'
        ? 'video'
        : a.type === 'script'
        ? 'script'
        : 'other';
      return pkgKinds.includes(kind);
    });

    try {
      const response = await fetch('/api/packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: pkgName,
          kinds: pkgKinds,
          assets: include.map((a) => ({ id: a.id, name: a.name, type: a.type, path: a.path })),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'No se pudo guardar el paquete');
      }

      const pkgAsset = {
        id: crypto.randomUUID(),
        name: payload.name || `${pkgName}.package.json`,
        type: 'prefab' as AssetType,
        path: payload.path || `/packages/${pkgName.replace(/[^a-zA-Z0-9_-]/g, '_') || 'Package'}.package.json`,
        size: include.length,
        createdAt: new Date(),
        metadata: {
          package: true,
          kinds: pkgKinds,
          included: include.map((a) => ({ id: a.id, name: a.name, type: a.type, path: a.path })),
        },
      };
      addAsset(pkgAsset as any);
      setMessage(`Paquete creado con ${include.length} assets.`);
    } catch (error) {
      setMessage(`Error creando paquete: ${String(error)}`);
    }
  };

  return (
    <div className="flex h-full flex-col bg-slate-900">
      <div className="border-b border-slate-800 px-3 py-2">
        <div className="flex items-center gap-2">
          <Folder className="h-4 w-4 text-cyan-300" />
          <h3 className="text-sm font-medium text-slate-100">Galeria</h3>
        </div>
        <p className="mt-1 text-xs text-slate-400">Sube personajes, escenas, animaciones y usalos en el motor.</p>
      </div>

      <div className="space-y-2 border-b border-slate-800 p-3">
        <div className="grid grid-cols-2 gap-2">
          <Input
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            placeholder="Categoria (characters/scenes)"
            className="bg-slate-950 border-slate-700"
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar"
            className="bg-slate-950 border-slate-700"
          />
        </div>
        <div className="flex gap-2">
          <label className="flex-1">
            <input
              type="file"
              multiple
              className="hidden"
              onChange={(event) => handleUpload(event.target.files)}
            />
            <span className="flex h-9 w-full cursor-pointer items-center justify-center rounded-md border border-slate-700 bg-slate-950 text-xs text-slate-300 hover:bg-slate-800">
              {uploading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Upload className="mr-1 h-3 w-3" />}
              Subir archivos
            </span>
          </label>
          <Button variant="outline" size="sm" onClick={loadItems} disabled={loading}>
            <RefreshCw className={`mr-1 h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            Refrescar
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={importingLocal}
            onClick={async () => {
              setImportingLocal(true);
              setMessage('');
              try {
                const response = await fetch('/api/gallery/import-local', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ overwrite: false, move: false }),
                });
                const payload = await response.json().catch(() => ({}));
                if (!response.ok || !payload?.success) {
                  throw new Error(payload?.error || 'No se pudo importar la carpeta local');
                }
                setMessage(
                  `Importados: ${payload.imported} | Omitidos: ${payload.skipped} | Errores: ${payload.errors}`
                );
                await loadItems();
              } catch (error) {
                setMessage(`Error importando carpeta: ${String(error)}`);
              } finally {
                setImportingLocal(false);
              }
            }}
          >
            {importingLocal ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Download className="mr-1 h-3 w-3" />}
            Importar carpeta local
          </Button>
          <span className="text-[11px] text-slate-500 truncate">
            {inputRoot}
          </span>
        </div>
        {message && <p className="text-[11px] text-slate-400">{message}</p>}
      </div>

      <div className="border-b border-slate-800 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-300">Paquetes reutilizables</div>
          <Button size="sm" variant="outline" onClick={createPackage}>
            <Download className="w-3 h-3 mr-1" />
            Crear paquete
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Input
            value={pkgName}
            onChange={(e) => setPkgName(e.target.value)}
            className="bg-slate-950 border-slate-700 text-xs"
            placeholder="Nombre del paquete"
          />
          <Input
            value={pkgKinds.join(',')}
            onChange={(e) =>
              setPkgKinds(
                e.target.value
                  .split(',')
                  .map((v) => v.trim() as GalleryKind)
                  .filter(Boolean)
              )
            }
            className="bg-slate-950 border-slate-700 text-xs"
            placeholder="kinds: character,scene,animation"
          />
        </div>
        {packageAssets.length > 0 && (
          <div className="grid grid-cols-1 gap-2">
            {packageAssets.map((pkg) => (
              <Card key={pkg.id} className="p-2 bg-slate-950 border-slate-800 text-xs text-slate-300">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-slate-100">{pkg.name}</div>
                    <div className="text-[11px] text-slate-500">
                      {Array.isArray(pkg.metadata?.kinds) ? (pkg.metadata.kinds as string[]).join(', ') : 'package'}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px]"
                    onClick={() => setMessage(`Paquete listo para usar: ${pkg.name}`)}
                  >
                    Usar paquete
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-2 p-3">
          {filtered.map((item) => (
            <div key={item.url} className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-xs text-slate-200">{item.name}</div>
                  <div className="text-[11px] text-slate-500">
                    {item.kind} | {item.category} | {formatSize(item.size)}
                  </div>
                </div>
                <ImageIcon className="h-4 w-4 text-slate-500" />
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                <Button size="sm" className="h-7 text-xs" onClick={() => importToEngine(item)}>
                  <Download className="mr-1 h-3 w-3" />
                  Usar en motor
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => copyUrl(item)}>
                  <Copy className="mr-1 h-3 w-3" />
                  Copiar URL
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => window.open(item.url, '_blank')}
                >
                  <ExternalLink className="mr-1 h-3 w-3" />
                  Ver
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleDelete(item)}>
                  <Trash2 className="mr-1 h-3 w-3" />
                  Borrar
                </Button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="rounded-md border border-slate-800 bg-slate-950 px-3 py-6 text-center text-xs text-slate-500">
              No hay archivos en la galeria.
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
