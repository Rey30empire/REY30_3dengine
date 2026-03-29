// ============================================
// Reusable Library (maniquíes / torsos / cabezas / manos / ropa / accesorios)
// ============================================

'use client';

import { useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useEngineStore } from '@/store/editorStore';
import { consoleManager } from './ConsolePanel';
import { Box, Shirt, Watch, Hand, Plus, Download, Sparkles } from 'lucide-react';

type LibraryItem = {
  id: string;
  name: string;
  category: 'maniqui' | 'torso' | 'cabeza' | 'mano' | 'ropa' | 'accesorio';
  path: string;
  polycount: number;
  notes?: string;
  preview?: string;
  metadataPath?: string;
};

const BASE_ITEMS: LibraryItem[] = [
  { id: 'lib_maniqui_a', name: 'Maniquí A (neutral)', category: 'maniqui', path: '/library/mannequin_a.glb', preview: '/library/mannequin_a.preview.png', metadataPath: '/library/mannequin_a.metadata.json', polycount: 12, notes: 'GLB low-poly base.' },
  { id: 'lib_maniqui_b', name: 'Maniquí B (hero)', category: 'maniqui', path: '/library/mannequin_b.glb', preview: '/library/mannequin_b.preview.png', metadataPath: '/library/mannequin_b.metadata.json', polycount: 12, notes: 'GLB low-poly base.' },
  { id: 'lib_torso_fit', name: 'Torso Fit', category: 'torso', path: '/library/torso_fit.glb', preview: '/library/torso_fit.preview.png', metadataPath: '/library/torso_fit.metadata.json', polycount: 12, notes: 'GLB low-poly base.' },
  { id: 'lib_head_basic', name: 'Cabeza Base', category: 'cabeza', path: '/library/head_base.glb', preview: '/library/head_base.preview.png', metadataPath: '/library/head_base.metadata.json', polycount: 12, notes: 'GLB low-poly base.' },
  { id: 'lib_hand_game', name: 'Mano Game', category: 'mano', path: '/library/hand_game.glb', preview: '/library/hand_game.preview.png', metadataPath: '/library/hand_game.metadata.json', polycount: 12, notes: 'GLB low-poly base.' },
  { id: 'lib_hoodie', name: 'Hoodie', category: 'ropa', path: '/library/hoodie.glb', preview: '/library/hoodie.preview.png', metadataPath: '/library/hoodie.metadata.json', polycount: 12, notes: 'GLB low-poly base.' },
  { id: 'lib_boots', name: 'Botas', category: 'accesorio', path: '/library/boots.glb', preview: '/library/boots.preview.png', metadataPath: '/library/boots.metadata.json', polycount: 12, notes: 'GLB low-poly base.' },
  { id: 'lib_hat', name: 'Gorra', category: 'accesorio', path: '/library/hat.glb', preview: '/library/hat.preview.png', metadataPath: '/library/hat.metadata.json', polycount: 12, notes: 'GLB low-poly base.' },
];

const categories: LibraryItem['category'][] = ['maniqui', 'torso', 'cabeza', 'mano', 'ropa', 'accesorio'];

export function ReusableLibraryPanel() {
  const { addAsset } = useEngineStore();
  const [items] = useState<LibraryItem[]>(BASE_ITEMS);
  const [filter, setFilter] = useState<LibraryItem['category'] | 'all'>('all');

  const filtered = items.filter((item) => filter === 'all' || item.category === filter);

  const importItem = async (item: LibraryItem) => {
    try {
      const res = await fetch(item.path, { method: 'HEAD' });
      if (!res.ok) {
        consoleManager.warn(`Archivo de librería no encontrado: ${item.path}`);
        return;
      }
      addAsset({
        id: crypto.randomUUID(),
        name: item.name,
        type: 'mesh',
        path: item.path,
        size: item.polycount,
        createdAt: new Date(),
        metadata: { source: 'library', category: item.category, polycount: item.polycount },
      } as any);
      consoleManager.success(`Importado: ${item.name}`);
    } catch (error) {
      consoleManager.error(`Fallo importando ${item.name}: ${String(error)}`);
    }
  };

  return (
    <div className="flex h-full flex-col bg-slate-900 text-slate-100">
      <div className="border-b border-slate-800 px-3 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Box className="w-4 h-4 text-amber-300" />
            <div>
              <h3 className="text-sm font-medium">Biblioteca reutilizable</h3>
              <p className="text-[11px] text-slate-400">Maniquíes, torsos, cabezas, manos, ropa, accesorios.</p>
            </div>
          </div>
          <Input
            placeholder="Filtrar..."
            className="h-8 w-40 bg-slate-950 border-slate-700 text-xs"
            onChange={(e) => {
              const val = e.target.value.toLowerCase();
              if (!val) {
                setFilter('all');
              }
            }}
          />
        </div>
        <div className="flex gap-1 mt-2">
          <Button size="sm" variant={filter === 'all' ? 'default' : 'ghost'} onClick={() => setFilter('all')}>
            Todos
          </Button>
          {categories.map((c) => (
            <Button
              key={c}
              size="sm"
              variant={filter === c ? 'default' : 'ghost'}
              onClick={() => setFilter(c)}
            >
              {c}
            </Button>
          ))}
        </div>
      </div>

      <ScrollArea className="flex-1 p-3">
        <div className="grid grid-cols-1 gap-2">
          {filtered.map((item) => (
            <Card key={item.id} className="p-3 bg-slate-950 border-slate-800">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm text-slate-100">{item.name}</div>
                  <div className="text-[11px] text-slate-500">
                    {item.category} · {item.polycount} tris
                  </div>
                  {item.notes && <div className="text-[11px] text-slate-400">{item.notes}</div>}
                </div>
                {item.preview && (
                  <img
                    src={item.preview}
                    alt={item.name}
                    className="h-12 w-12 rounded border border-slate-800 object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                  />
                )}
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => importItem(item)}>
                    <Download className="w-3 h-3 mr-1" /> Importar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => importItem(item)}>
                    <Sparkles className="w-3 h-3 mr-1" /> Instanciar
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
