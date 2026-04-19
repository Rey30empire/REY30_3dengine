'use client';

import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { createEditorProjectSaveData, DEFAULT_EDITOR_PROJECT_SAVE_SLOT } from '@/engine/serialization';
import type { BuildDiagnostic } from '@/engine/reyplay/types';
import { useActiveScene, useEngineStore } from '@/store/editorStore';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/hooks/use-toast';
import { consoleManager } from './ConsolePanel';
import {
  buildRemoteProject,
  type BuildTarget,
  type RemoteBuildPayload,
} from './buildProjectClient';
import { saveRemoteEditorProject } from './editorProjectClient';
import { AlertTriangle, CheckCircle2, Download, FileOutput, Globe, Info, Play, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';

type Gate = { label: string; ok: boolean; detail: string; tone?: 'ok' | 'warn' | 'error'; };

export function BuildCenterPanel() {
  const {
    assets,
    entities,
    lastBuildReport,
    buildManifest,
    projectName,
    runReyPlayCompile,
    clearBuild,
    activeSceneId,
    scenes,
    setActivePanel,
  } = useEngineStore();
  const activeScene = useActiveScene();
  const [buildPendingTarget, setBuildPendingTarget] = useState<BuildTarget | null>(null);
  const [lastExportResult, setLastExportResult] = useState<RemoteBuildPayload | null>(null);

  const diagnostics = lastBuildReport?.diagnostics ?? [];
  const errors = diagnostics.filter((item) => item.level === 'error');
  const warnings = diagnostics.filter((item) => item.level === 'warning');
  const infos = diagnostics.filter((item) => item.level === 'info');
  const diagnosticsByStage = useMemo(() => ({ schema: diagnostics.filter((item) => item.stage === 'schema'), assets: diagnostics.filter((item) => item.stage === 'assets'), input: diagnostics.filter((item) => item.stage === 'input'), runtime: diagnostics.filter((item) => item.stage === 'runtime') }), [diagnostics]);

  const gates = useMemo<Gate[]>(() => [
    { label: 'Escena activa', ok: Boolean(activeSceneId), detail: activeScene ? activeScene.name : 'Selecciona una escena base', tone: activeSceneId ? 'ok' : 'error' },
    { label: 'Compile ejecutado', ok: Boolean(lastBuildReport), detail: lastBuildReport ? lastBuildReport.summary : 'Corre compile para abrir el estado del proyecto', tone: lastBuildReport ? 'ok' : 'warn' },
    { label: 'Errores bloqueantes', ok: errors.length === 0, detail: errors.length === 0 ? 'No hay errores de salida' : `${errors.length} error(es) por resolver`, tone: errors.length === 0 ? 'ok' : 'error' },
    { label: 'Manifest listo', ok: Boolean(buildManifest), detail: buildManifest ? `${buildManifest.assets.length} assets y ${buildManifest.entities.length} entidades` : 'Aun no hay manifest exportable', tone: buildManifest ? 'ok' : 'warn' },
    { label: 'Paths de assets', ok: assets.every((asset) => Boolean(asset.path?.trim())), detail: assets.every((asset) => Boolean(asset.path?.trim())) ? 'Todos los assets tienen path estable' : 'Hay assets sin path persistente', tone: assets.every((asset) => Boolean(asset.path?.trim())) ? 'ok' : 'error' },
  ], [activeScene, activeSceneId, assets, buildManifest, errors.length, lastBuildReport]);

  const readiness = errors.length > 0 || !activeSceneId || scenes.length === 0 ? 'blocked' : !lastBuildReport || !buildManifest || warnings.length > 0 ? 'attention' : 'ready';
  const readinessLabel = readiness === 'ready' ? 'Ready for export' : readiness === 'attention' ? 'Needs review' : 'Blocked';
  const readinessClass = readiness === 'ready' ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200' : readiness === 'attention' ? 'border-amber-500/20 bg-amber-500/10 text-amber-200' : 'border-red-500/20 bg-red-500/10 text-red-200';
  const nextActions = [
    !lastBuildReport ? 'Ejecuta compile para generar diagnosticos reales y manifest.' : null,
    !activeSceneId ? 'Define una escena activa y valida world settings.' : null,
    diagnosticsByStage.assets.length > 0 ? 'Corrige assets con path roto o libreria inestable.' : null,
    diagnosticsByStage.input.length > 0 || diagnosticsByStage.schema.length > 0 ? 'Revisa jerarquia, entidades y componentes antes de exportar.' : null,
    warnings.length > 0 && errors.length === 0 ? 'Limpia warnings para dejar un release limpio.' : null,
    buildManifest && errors.length === 0 ? 'Con el manifest estable, el siguiente paso es export target y smoke pass.' : null,
  ].filter(Boolean) as string[];

  const handleCompile = () => {
    const report = runReyPlayCompile();
    if (report.ok) consoleManager.success(`Build Center OK: ${report.summary}`);
    else consoleManager.warn(`Build Center encontro diagnosticos: ${report.summary}`);
  };

  const handleClear = () => {
    clearBuild();
    consoleManager.info('Build Center limpiado.');
  };

  const handleBuild = async (target: BuildTarget) => {
    if (buildPendingTarget) return;
    setBuildPendingTarget(target);
    try {
      const report = runReyPlayCompile();
      if (!report.ok) {
        const payload: RemoteBuildPayload = {
          ok: false,
          target,
          report,
          artifacts: [],
          missingDeps: [],
          logs: ['Compilation failed, aborting remote build.'],
          error: report.summary,
        };
        setLastExportResult(payload);
        toast({
          title: 'Build bloqueado',
          description: report.summary,
          variant: 'destructive',
        });
        consoleManager.warn(`Build Center bloqueo export ${target}: ${report.summary}`);
        return;
      }

      const state = useEngineStore.getState();
      const saveData = createEditorProjectSaveData(state, { markClean: false });
      const remoteSave = await saveRemoteEditorProject({
        projectName: state.projectName,
        saveData,
        slot: DEFAULT_EDITOR_PROJECT_SAVE_SLOT,
      });

      if (!remoteSave.response.ok) {
        const errorMessage =
          remoteSave.payload.error || 'No se pudo persistir el proyecto en backend antes de exportar.';
        setLastExportResult({
          ok: false,
          target,
          report,
          artifacts: [],
          missingDeps: [],
          logs: [errorMessage],
          error: errorMessage,
        });
        toast({
          title: 'Save remoto falló',
          description: errorMessage,
          variant: 'destructive',
        });
        consoleManager.error(`Build Center no pudo guardar remoto: ${errorMessage}`);
        return;
      }

      const { response, payload } = await buildRemoteProject({
        projectName: state.projectName,
        target,
        slot: DEFAULT_EDITOR_PROJECT_SAVE_SLOT,
      });

      setLastExportResult(payload);

      if (!response.ok || !payload.ok) {
        const detail =
          payload.error ||
          payload.logs?.[0] ||
          (payload.missingDeps?.length
            ? `Dependencias faltantes: ${payload.missingDeps.join(', ')}`
            : 'El empaquetado no pudo completarse.');
        toast({
          title: 'Export no completado',
          description: detail,
          variant: 'destructive',
        });
        consoleManager.warn(`Build Center export ${target} incompleto: ${detail}`);
        return;
      }

      const artifactCount = payload.artifacts?.length ?? 0;
      toast({
        title: 'Export empaquetado',
        description: `${target} listo con ${artifactCount} artefacto(s) verificables.`,
      });
      consoleManager.success(`Build Center export ${target} listo con ${artifactCount} artefacto(s).`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Build failed unexpectedly.';
      setLastExportResult({
        ok: false,
        target,
        artifacts: [],
        missingDeps: [],
        logs: [message],
        error: message,
      });
      toast({
        title: 'Build falló',
        description: message,
        variant: 'destructive',
      });
      consoleManager.error(`Build Center error ${target}: ${message}`);
    } finally {
      setBuildPendingTarget(null);
    }
  };

  return (
    <div className="flex h-full flex-col bg-slate-950">
      <div className="border-b border-slate-800 px-3 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-cyan-300">Build Center</div>
            <h3 className="mt-1 text-sm font-semibold text-slate-100">Validacion y salida del proyecto</h3>
            <p className="mt-1 max-w-xl text-xs text-slate-500">Este panel ya no solo informa: te dice si puedes salir, que te bloquea y que resolver despues.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={readinessClass}>{readinessLabel}</Badge>
            <Button size="sm" variant="secondary" onClick={handleCompile}><Play className="mr-1 h-3.5 w-3.5" /> Compilar</Button>
            <Button size="sm" variant="outline" onClick={() => setActivePanel('world')}><Globe className="mr-1 h-3.5 w-3.5" /> World</Button>
            <Button size="sm" variant="outline" asChild><Link href="/admin"><ShieldCheck className="mr-1 h-3.5 w-3.5" /> Admin</Link></Button>
            <Button size="sm" variant="outline" onClick={handleClear}><RefreshCw className="mr-1 h-3.5 w-3.5" /> Limpiar</Button>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-4 p-3">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard label="Scenes" value={`${scenes.length}`} />
            <MetricCard label="Entities" value={`${entities.size}`} />
            <MetricCard label="Assets" value={`${assets.length}`} />
            <MetricCard label="Errors" value={`${errors.length}`} tone={errors.length === 0 ? 'ok' : 'error'} />
            <MetricCard label="Warnings" value={`${warnings.length}`} tone={warnings.length === 0 ? 'ok' : 'warn'} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <SectionCard title="Release Gates">
              <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-xs">
                <div className="flex items-center gap-2 text-slate-100">{lastBuildReport?.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <AlertTriangle className="h-4 w-4 text-amber-300" />}<span className="font-medium">{lastBuildReport ? lastBuildReport.summary : 'Aun no hay compilacion reciente'}</span></div>
                <div className="mt-2 text-slate-500">Escena activa: {activeScene?.name ?? 'Sin escena'} ({activeSceneId ?? 'none'})</div>
                {lastBuildReport?.generatedAt ? <div className="mt-1 text-slate-500">Ultima generacion: {new Date(lastBuildReport.generatedAt).toLocaleString()}</div> : null}
              </div>
              <div className="mt-3 space-y-2">{gates.map((gate) => <GateRow key={gate.label} gate={gate} />)}</div>
              <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-100"><Sparkles className="h-4 w-4 text-emerald-300" /> Siguientes acciones</div>
                <ul className="mt-3 space-y-2 text-xs text-slate-400">{nextActions.length ? nextActions.map((item) => <li key={item}>• {item}</li>) : <li>• El estado del proyecto quedo estable para seguir con export y smoke tests.</li>}</ul>
              </div>
            </SectionCard>

            <div className="space-y-4">
              <SectionCard title="Package Targets">
                <div className="space-y-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full justify-start"
                    disabled={readiness === 'blocked' || Boolean(buildPendingTarget)}
                    onClick={() => void handleBuild('web')}
                  >
                    <Download className="mr-1 h-3.5 w-3.5" />
                    {buildPendingTarget === 'web' ? 'Empaquetando web...' : 'Export Web Bundle'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full justify-start"
                    disabled={readiness === 'blocked' || Boolean(buildPendingTarget)}
                    onClick={() => void handleBuild('windows-exe')}
                  >
                    <Download className="mr-1 h-3.5 w-3.5" />
                    {buildPendingTarget === 'windows-exe' ? 'Empaquetando exe...' : 'Export Windows EXE'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full justify-start"
                    disabled={readiness === 'blocked' || Boolean(buildPendingTarget)}
                    onClick={() => void handleBuild('windows-msi')}
                  >
                    <Download className="mr-1 h-3.5 w-3.5" />
                    {buildPendingTarget === 'windows-msi' ? 'Empaquetando msi...' : 'Export Windows MSI'}
                  </Button>
                </div>
                <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-400">
                  Cada export hace compile local, guarda el proyecto en backend y empaqueta desde el save remoto antes de devolver artefactos verificables.
                </div>
              </SectionCard>

              <SectionCard title="Manifest Health">
                <div className="space-y-2 text-xs text-slate-400">
                  <div>schema: {buildManifest?.schema ?? 'sin generar'}</div>
                  <div>buildId: {buildManifest?.buildId ?? 'sin generar'}</div>
                  <div>project: {buildManifest?.projectName ?? 'sin generar'}</div>
                  <div>scenes: {buildManifest?.scenes.length ?? 0} / {scenes.length}</div>
                  <div>entities: {buildManifest?.entities.length ?? 0} / {entities.size}</div>
                  <div>assets: {buildManifest?.assets.length ?? 0} / {assets.length}</div>
                </div>
              </SectionCard>

              <SectionCard title="Last Package">
                {lastExportResult ? (
                  <div className="space-y-3 text-xs text-slate-400">
                    <div>project: {projectName}</div>
                    <div>target: {lastExportResult.target ?? 'n/a'}</div>
                    <div>buildId: {lastExportResult.buildId ?? 'sin buildId'}</div>
                    <div>status: {lastExportResult.ok ? 'ok' : 'blocked'}</div>
                    <div>missing deps: {lastExportResult.missingDeps?.length ?? 0}</div>
                    <div className="space-y-1">
                      {(lastExportResult.artifacts?.length ?? 0) > 0 ? (
                        lastExportResult.artifacts?.map((artifact) => (
                          <div key={artifact.id} className="rounded-md border border-slate-800 bg-slate-900/70 px-2 py-1">
                            <div className="text-slate-200">{artifact.kind ?? 'artifact'} · {artifact.target}</div>
                            <div className="break-all text-slate-500">{artifact.path}</div>
                          </div>
                        ))
                      ) : (
                        <div className="text-slate-500">Aun no hay artefactos empaquetados en esta sesión.</div>
                      )}
                    </div>
                    <div className="space-y-1">
                      {(lastExportResult.logs ?? []).slice(-4).map((line) => (
                        <div key={line} className="text-slate-500">{line}</div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-500">
                    Ejecuta un target para ver artefactos, dependencias faltantes y logs del empaquetado remoto.
                  </div>
                )}
              </SectionCard>

              <SectionCard title="Stage Breakdown">
                <div className="space-y-2 text-xs">{Object.entries(diagnosticsByStage).map(([stage, items]) => <div key={stage} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2"><span className="text-slate-300">{stage}</span><span className={cnStage(items.length)}>{items.length}</span></div>)}</div>
              </SectionCard>

              <SectionCard title="Severity Buckets">
                <div className="space-y-2">
                  <SeverityRow label="Errors" count={errors.length} tone={errors.length === 0 ? 'ok' : 'error'} />
                  <SeverityRow label="Warnings" count={warnings.length} tone={warnings.length === 0 ? 'ok' : 'warn'} />
                  <SeverityRow label="Info" count={infos.length} tone="info" />
                </div>
              </SectionCard>
            </div>
          </div>

          <SectionCard title="Diagnostics Feed">
            {diagnostics.length ? (
              <div className="space-y-2">
                {diagnostics.map((diagnostic) => <DiagnosticRow key={diagnostic.id} diagnostic={diagnostic} />)}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-800 bg-slate-950/40 p-3 text-xs text-slate-500">Ejecuta una compilacion para ver bloqueos reales, hints y estado de salida.</div>
            )}
          </SectionCard>
        </div>
      </ScrollArea>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: ReactNode; }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3"><div className="flex items-center gap-2 text-xs font-medium text-slate-100"><FileOutput className="h-4 w-4 text-cyan-300" /> {title}</div><div className="mt-3">{children}</div></div>;
}

function GateRow({ gate }: { gate: Gate }) {
  const tone = gate.tone === 'ok' ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200' : gate.tone === 'error' ? 'border-red-500/20 bg-red-500/10 text-red-200' : 'border-amber-500/20 bg-amber-500/10 text-amber-200';
  return <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-xs"><div className="flex items-center justify-between gap-2"><span className="text-slate-100">{gate.label}</span><Badge variant="outline" className={tone}>{gate.ok ? 'ok' : 'pending'}</Badge></div><div className="mt-1 text-slate-500">{gate.detail}</div></div>;
}

function SeverityRow({ label, count, tone }: { label: string; count: number; tone: 'ok' | 'warn' | 'error' | 'info'; }) {
  const color = tone === 'ok' ? 'text-emerald-300' : tone === 'warn' ? 'text-amber-300' : tone === 'error' ? 'text-red-300' : 'text-cyan-300';
  return <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs"><span className="text-slate-300">{label}</span><span className={color}>{count}</span></div>;
}

function DiagnosticRow({ diagnostic }: { diagnostic: BuildDiagnostic }) {
  const badgeClass = diagnostic.level === 'error' ? 'border-red-500/20 bg-red-500/10 text-red-200' : diagnostic.level === 'warning' ? 'border-amber-500/20 bg-amber-500/10 text-amber-200' : 'border-cyan-500/20 bg-cyan-500/10 text-cyan-200';
  return <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-xs"><div className="flex items-center justify-between gap-2"><div className="text-slate-100">{diagnostic.code} · {diagnostic.message}</div><Badge variant="outline" className={badgeClass}>{diagnostic.level}</Badge></div><div className="mt-1 text-slate-500">stage: {diagnostic.stage}{diagnostic.path ? ` · path: ${diagnostic.path}` : ''}</div>{diagnostic.hint ? <div className="mt-1 flex items-start gap-2 text-cyan-200/80"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> <span>{diagnostic.hint}</span></div> : null}</div>;
}

function MetricCard({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'ok' | 'warn' | 'error'; }) {
  const toneClass = tone === 'ok' ? 'border-emerald-500/20 bg-emerald-500/10' : tone === 'warn' ? 'border-amber-500/20 bg-amber-500/10' : tone === 'error' ? 'border-red-500/20 bg-red-500/10' : 'border-slate-800 bg-slate-900/60';
  return <div className={`rounded-xl border p-3 ${toneClass}`}><div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div><div className="mt-2 text-2xl font-semibold text-slate-100">{value}</div></div>;
}

function cnStage(count: number) {
  return count === 0 ? 'text-emerald-300' : count < 3 ? 'text-amber-300' : 'text-red-300';
}
