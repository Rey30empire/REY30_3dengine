'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { CharacterCatalogResponse } from '@/lib/character-catalog';
import { useEngineStore } from '@/store/editorStore';
import { Box, Download, Layers3, Package2, RefreshCw } from 'lucide-react';
import { CharacterBuilderPanel } from './CharacterBuilderPanel';
import { ModularCharacterLabPanel } from './ModularCharacterLabPanel';

export function CharacterWorkspacePanel() {
  const [workspace, setWorkspace] = useState<'builder' | 'modular-lab'>('builder');
  const [catalog, setCatalog] = useState<CharacterCatalogResponse | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const projectName = useEngineStore((state) => state.projectName);

  useEffect(() => {
    let cancelled = false;

    const loadCatalog = async () => {
      setCatalogLoading(true);
      setCatalogError('');

      try {
        const response = await fetch('/api/character/catalog', {
          cache: 'no-store',
          headers: {
            'x-rey30-project': projectName || 'untitled_project',
          },
        });
        const payload = (await response.json().catch(() => ({}))) as CharacterCatalogResponse & {
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error || 'No se pudo cargar el catalogo de personajes.');
        }
        if (cancelled) return;
        setCatalog(payload);
      } catch (error) {
        if (cancelled) return;
        setCatalogError(String(error));
      } finally {
        if (!cancelled) {
          setCatalogLoading(false);
        }
      }
    };

    void loadCatalog();

    return () => {
      cancelled = true;
    };
  }, [projectName]);

  const recentEntries = useMemo(() => catalog?.entries.slice(0, 4) ?? [], [catalog?.entries]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-950 text-slate-100">
      <div className="border-b border-slate-800 px-3 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-slate-100">Character Workspace</div>
            <div className="text-[11px] text-slate-400">
              Builder clasico, presets persistidos y laboratorio modular bajo una sola superficie.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={workspace === 'builder' ? 'secondary' : 'outline'}
              onClick={() => setWorkspace('builder')}
            >
              Builder
            </Button>
            <Button
              size="sm"
              variant={workspace === 'modular-lab' ? 'secondary' : 'outline'}
              onClick={() => setWorkspace('modular-lab')}
            >
              Modular Lab
            </Button>
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8"
              onClick={() => {
                setCatalog((current) => current);
                setCatalogLoading(true);
                setCatalogError('');
                void fetch('/api/character/catalog', {
                  cache: 'no-store',
                  headers: {
                    'x-rey30-project': projectName || 'untitled_project',
                  },
                })
                  .then(async (response) => {
                    const payload = (await response.json().catch(() => ({}))) as CharacterCatalogResponse & {
                      error?: string;
                    };
                    if (!response.ok) {
                      throw new Error(payload.error || 'No se pudo cargar el catalogo de personajes.');
                    }
                    setCatalog(payload);
                  })
                  .catch((error) => {
                    setCatalogError(String(error));
                  })
                  .finally(() => {
                    setCatalogLoading(false);
                  });
              }}
            >
              <RefreshCw className={catalogLoading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            </Button>
          </div>
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-4">
          <Card className="border-slate-800 bg-slate-900/50">
            <CardContent className="flex items-center gap-3 p-3">
              <Box className="h-4 w-4 text-cyan-300" />
              <div>
                <div className="text-[10px] uppercase tracking-wide text-slate-500">Builder</div>
                <div className="text-sm text-slate-100">
                  {catalog?.summary.builderPresetCount ?? 0} presets
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-slate-800 bg-slate-900/50">
            <CardContent className="flex items-center gap-3 p-3">
              <Layers3 className="h-4 w-4 text-emerald-300" />
              <div>
                <div className="text-[10px] uppercase tracking-wide text-slate-500">Modular</div>
                <div className="text-sm text-slate-100">
                  {catalog?.summary.modularCharacterCount ?? 0} paquetes
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-slate-800 bg-slate-900/50">
            <CardContent className="flex items-center gap-3 p-3">
              <Package2 className="h-4 w-4 text-fuchsia-300" />
              <div>
                <div className="text-[10px] uppercase tracking-wide text-slate-500">Proyecto</div>
                <div className="text-sm text-slate-100">
                  {catalog?.summary.currentProjectCount ?? 0} entradas activas
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-slate-800 bg-slate-900/50">
            <CardContent className="flex items-center gap-3 p-3">
              <RefreshCw className="h-4 w-4 text-amber-300" />
              <div>
                <div className="text-[10px] uppercase tracking-wide text-slate-500">Rigged</div>
                <div className="text-sm text-slate-100">
                  {catalog?.summary.riggedModularCount ?? 0} modulares
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-3 rounded-xl border border-slate-800 bg-slate-900/40 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-medium text-slate-100">Catalogo unificado</div>
              <div className="text-[11px] text-slate-500">
                Estado agregado de presets del builder y personajes modulares guardados.
              </div>
            </div>
            <div className="text-[11px] text-slate-500">
              Proyecto actual: {catalog?.projectKey ?? 'untitled_project'}
            </div>
          </div>

          {catalogError && (
            <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
              {catalogError}
            </div>
          )}

          {!catalogError && recentEntries.length === 0 && !catalogLoading && (
            <div className="mt-3 rounded-lg border border-dashed border-slate-700 px-3 py-4 text-center text-xs text-slate-500">
              Todavia no hay entradas unificadas para este workspace.
            </div>
          )}

          {recentEntries.length > 0 && (
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {recentEntries.map((entry) => {
                const exportUrl = entry.actions?.packageUrl || entry.actions?.downloadUrl;

                return (
                  <div
                    key={`${entry.kind}:${entry.id}`}
                    className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-medium text-slate-100">{entry.name}</div>
                        <div className="truncate text-[11px] text-slate-500">{entry.description}</div>
                      </div>
                      <div
                        className={
                          entry.workspace === 'builder'
                            ? 'rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] text-cyan-100'
                            : 'rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-100'
                        }
                      >
                        {entry.workspace === 'builder' ? 'Builder' : 'Modular'}
                      </div>
                    </div>
                    <div className="mt-2 text-[11px] text-slate-400">
                      {entry.projectMatch === 'current-project'
                        ? `Proyecto actual · ${entry.stats.partCount} parte(s)`
                        : `${entry.projectName} · ${entry.stats.partCount} parte(s)`}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setWorkspace(entry.workspace)}
                      >
                        Abrir
                      </Button>
                      {exportUrl && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            window.open(exportUrl, '_blank', 'noopener,noreferrer');
                          }}
                        >
                          <Download className="mr-1 h-3.5 w-3.5" />
                          Exportar
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {workspace === 'builder' ? <CharacterBuilderPanel /> : <ModularCharacterLabPanel />}
      </div>
    </div>
  );
}
