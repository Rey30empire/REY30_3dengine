// ============================================
// LOD Manager Panel - presets, generation, stats
// ============================================

'use client';

import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { useEngineStore } from '@/store/editorStore';
import { Layers3, RefreshCcw, Sparkles, Settings } from 'lucide-react';
import { LODManager, LODPresets } from '@/engine/rendering/LODSystem';

type PresetKey = keyof typeof LODPresets;

export function LODPanel() {
  const { editor } = useEngineStore();
  const [preset, setPreset] = useState<PresetKey>('medium');
  const [ratios, setRatios] = useState([1, 0.6, 0.3]);
  const [bias, setBias] = useState(0);
  const [preserveOriginal, setPreserveOriginal] = useState(false);
  const [stats, setStats] = useState(() => LODManager.getInstance().getLODStats());

  const applyPreset = (nextPreset: PresetKey) => {
    setPreset(nextPreset);
    const next = LODPresets[nextPreset];
    const numeric = Array.from(next.simplificationRatios).filter((v) => typeof v === 'number') as number[];
    setRatios(numeric.length ? numeric : [1, 0.6, 0.3]);
    setBias(0);
  };

  const ratiosLabel = useMemo(() => ratios.map((r) => `${Math.round(r * 100)}%`).join(' / '), [ratios]);

  const generate = () => {
    const event = new CustomEvent('editor:generate-lod', {
      detail: {
        ratios,
        distances: LODPresets[preset]?.distances,
        preserveOriginal,
      },
    });
    window.dispatchEvent(event);
  };

  const refreshStats = () => setStats(LODManager.getInstance().getLODStats());

  const applyBias = () => {
    LODManager.getInstance().setBias(bias);
    refreshStats();
  };

  return (
    <div className="flex h-full flex-col bg-slate-900 text-slate-100">
      <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-2">
        <Layers3 className="w-4 h-4 text-blue-300" />
        <div>
          <h3 className="text-sm font-medium">LOD Manager</h3>
          <p className="text-[11px] text-slate-400">Genera LODs en la selección con presets técnicos.</p>
        </div>
      </div>

      <div className="p-3 space-y-3">
        <Card className="p-3 bg-slate-950 border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-300">
            <span>Preset</span>
            <div className="flex gap-1">
              {(['low', 'medium', 'high'] as PresetKey[]).map((p) => (
                <Button
                  key={p}
                  size="sm"
                  variant={preset === p ? 'default' : 'ghost'}
                  className="h-7 text-[11px]"
                  onClick={() => applyPreset(p)}
                >
                  {p}
                </Button>
              ))}
            </div>
          </div>
          <div className="text-[11px] text-slate-500">Ratios: {ratiosLabel}</div>
          <div className="text-[11px] text-slate-500">
            Distancias: {(LODPresets[preset]?.distances || []).join(', ')}
          </div>
        </Card>

        <Card className="p-3 bg-slate-950 border-slate-800 space-y-3 text-xs text-slate-300">
          <div className="flex items-center justify-between">
            <span>Ajuste manual ratios</span>
            <span className="text-slate-500">{ratiosLabel}</span>
          </div>
          {ratios.map((r, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="w-10 text-[11px] text-slate-500">LOD{idx}</span>
              <Slider
                value={[r]}
                min={0.05}
                max={1}
                step={0.05}
                onValueChange={([v]) =>
                  setRatios((arr) => {
                    const next = [...arr];
                    next[idx] = v;
                    return next;
                  })
                }
              />
              <span className="w-10 text-right text-slate-400">{Math.round(r * 100)}%</span>
            </div>
          ))}
        </Card>

        <Card className="p-3 bg-slate-950 border-slate-800 space-y-2">
          <div className="text-xs text-slate-300 flex items-center gap-2">
            <Settings className="w-4 h-4 text-slate-400" />
            Ajustes
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400">Bias dist</span>
            <Input
              type="number"
              className="h-7 w-24 bg-slate-950 border-slate-700 text-xs"
              value={bias}
              step="1"
              onChange={(e) => setBias(Number(e.target.value))}
            />
            <Button size="sm" variant="outline" onClick={applyBias}>
              Aplicar
            </Button>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-300">
            <span>Preservar original</span>
            <Switch checked={preserveOriginal} onCheckedChange={setPreserveOriginal} />
          </div>
          <div className="text-[11px] text-slate-500">Duplica la malla en lugar de reemplazarla.</div>
        </Card>

        <div className="grid grid-cols-2 gap-2">
          <Button onClick={generate} disabled={!editor.selectedEntities.length}>
            <Sparkles className="w-4 h-4 mr-1" />
            Generar LOD en selección ({editor.selectedEntities.length})
          </Button>
          <Button variant="outline" onClick={refreshStats}>
            <RefreshCcw className="w-4 h-4 mr-1" />
            Refrescar stats
          </Button>
        </div>

        <Card className="p-3 bg-slate-950 border-slate-800 text-[11px] text-slate-300 space-y-1">
          <div className="text-xs text-slate-200">Stats</div>
          <div>Objetos LOD: {stats.totalObjects ?? 0}</div>
          <div>Promedio LOD: {stats.averageLODLevel?.toFixed?.(2) ?? 0}</div>
          <div>Streamed: {stats.streamedLODCount ?? 0}</div>
          <div>Impostors: {stats.impostorCount ?? 0}</div>
        </Card>
      </div>
    </div>
  );
}
