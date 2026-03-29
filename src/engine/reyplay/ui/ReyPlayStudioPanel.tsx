'use client';

import { useMemo, useState } from 'react';
import { useEngineStore } from '@/store/editorStore';
import {
  STARTER_TEMPLATES,
  getStarterEntitiesForTemplate,
  makeStarterTerrain,
  makeStarterPlayer,
} from '../studio/Templates';
import {
  createDiagnosticHintFromReport,
  buildReyPlayManifest,
  getDefaultScribProfile,
} from '../build/compile';
import type { BuildManifest } from '../types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Play,
  Pause,
  Square,
  Sparkles,
  Upload,
  FileSymlink,
  RefreshCw,
  CircleCheck,
  CircleX,
  Bot,
  Wand2,
} from 'lucide-react';

interface DiagnosticLineProps {
  kind: 'error' | 'warning' | 'info';
  text: string;
}

function DiagnosticLine({ kind, text }: DiagnosticLineProps) {
  const color =
    kind === 'error'
      ? 'text-red-400'
      : kind === 'warning'
      ? 'text-amber-400'
      : 'text-slate-300';

  return <div className={`text-xs ${color}`}>{text}</div>;
}

export function ReyPlayStudioPanel() {
  const {
    scenes,
    activeSceneId,
    entities,
    editor,
    setActiveScene,
    createScene,
    addEntity,
    setEditorMode,
    addAsset,
    setPlayRuntimeState,
    playRuntimeState,
    lastBuildReport,
    buildManifest,
    runReyPlayCompile,
    clearBuild,
    setScribProfile,
    selectScribEntity,
    assignScribToEntity,
    scribProfiles,
    scribInstances,
    activeScribEntityId,
    assets,
    lastCompileSummary,

    projectName,
  } = useEngineStore();

  const selectedEntityId = editor.selectedEntities[0] || activeScribEntityId;
  const selectedEntity = selectedEntityId ? entities.get(selectedEntityId) : null;
  const [templateId, setTemplateId] = useState<string>(STARTER_TEMPLATES[0].id);
  const [prompt, setPrompt] = useState('');
  const [compileRunning, setCompileRunning] = useState(false);
  const [latestManifest, setLatestManifest] = useState<BuildManifest | null>(null);

  const currentScrib = useMemo(() => {
    if (!selectedEntityId) return null;
    return scribProfiles.get(selectedEntityId) ?? null;
  }, [selectedEntityId, scribProfiles]);

  const effectiveManifest = latestManifest ?? buildManifest ?? null;

  const sceneCount = scenes.length;
  const activeScene = scenes.find((scene) => scene.id === activeSceneId) ?? null;

  const canCompile = !compileRunning;

  const onTemplateChange = (value: string) => {
    setTemplateId(value);
  };

  const onCreateTemplateScene = () => {
    const template = STARTER_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;

    const scene = createScene(`Proyecto ${template.label}`);
    setActiveScene(scene.id);

    const starter = getStarterEntitiesForTemplate(template.id);
    starter.forEach((entity) => addEntity(entity));

    const rootTags = template.recommendedObjects.join(', ');
    addAsset({
      id: crypto.randomUUID(),
      name: `snapshot_${template.id}_${scene.id}.json`,
      type: 'scene',
      path: `/snapshots/${scene.id}.json`,
      size: 0,
      createdAt: new Date(),
      metadata: {},
    });

    setPrompt((prev) =>
      prev || `Escena base creada desde plantilla: ${template.label}. Entidades: ${rootTags}`
    );
  };

  const onAddStarterTerrain = () => {
    if (!activeSceneId) {
      const scene = createScene('Terrain Scene');
      setActiveScene(scene.id);
    }
    addEntity(makeStarterTerrain('Terrain Runtime Block'));
  };

  const onAddStarterPlayer = () => {
    if (!activeSceneId) {
      const scene = createScene('Starter Scene');
      setActiveScene(scene.id);
    }
    addEntity(makeStarterPlayer('Player Runtime'));
  };

  const setModeScene = () => {
    setEditorMode('scene');
    setPlayRuntimeState('IDLE');
  };

  const setModeGame = () => {
    setEditorMode('game');
    setPlayRuntimeState('PLAYING');
  };

  const onPauseGame = () => {
    setPlayRuntimeState(playRuntimeState === 'PAUSED' ? 'PLAYING' : 'PAUSED');
  };

  const onStopGame = () => {
    setEditorMode('scene');
    setPlayRuntimeState('IDLE');
  };

  const onCompile = async () => {
    setCompileRunning(true);
    const report = runReyPlayCompile();
    setCompileRunning(false);

    const diagnosticText = createDiagnosticHintFromReport(report);

    if (!report.ok) {
      console.warn('Build has errors', diagnosticText);
      return;
    }

    const manifest = buildReyPlayManifest({
      scenes,
      entities,
      assets,
      scribProfiles,
      scribInstances,
      activeSceneId,
      projectName,
    });

    setLatestManifest(manifest);
    console.info('Build done', diagnosticText);
  };

  const onExport = () => {
    const manifest = effectiveManifest
      ? effectiveManifest
      : buildReyPlayManifest({
          scenes,
          entities,
          assets,
          scribProfiles,
          scribInstances,
          activeSceneId,
          projectName,
        });

    const blob = new Blob([JSON.stringify(manifest, null, 2)], {
      type: 'application/json',
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${projectName}-reypaly-build.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const onScribManual = () => {
    if (!selectedEntityId) return;
    selectScribEntity(selectedEntityId);
    assignScribToEntity(selectedEntityId, 'movement', { origin: 'manual' });
    setScribProfile(selectedEntityId, {
      ...getDefaultScribProfile(selectedEntityId),
      targetType: 'custom',
      mode: 'manual',
      prompt,
      status: 'draft',
      updatedAt: new Date().toISOString(),
    });
  };

  const onScribAI = async () => {
    if (!selectedEntityId) return;
    selectScribEntity(selectedEntityId);
    assignScribToEntity(selectedEntityId, 'ai', { origin: 'ai' });
    setScribProfile(selectedEntityId, {
      ...getDefaultScribProfile(selectedEntityId),
      targetType: 'custom',
      mode: 'ai',
      prompt,
      status: 'generating',
      updatedAt: new Date().toISOString(),
    });

    setTimeout(() => {
      setScribProfile(selectedEntityId, {
        ...getDefaultScribProfile(selectedEntityId),
        targetType: 'custom',
        mode: 'ai',
        prompt,
        status: 'ready',
        manifestPath: 'scrib://generated.json',
        updatedAt: new Date().toISOString(),
      });
    }, 900);
  };

  return (
    <div className="flex flex-col h-full bg-slate-900">
      <div className="p-3 border-b border-slate-800 flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-200">ReyPlay Studio</h3>
        <span className="text-[11px] text-slate-500">
          Escenas: {sceneCount} | Entidades: {entities.size}
        </span>
      </div>

      <ScrollArea className="flex-1 p-3 space-y-4">
        {/* Runtime mode controls */}
        <div className="rounded-lg border border-slate-700 p-3 space-y-2">
          <h4 className="text-xs text-slate-400 uppercase">Modo de ejecución</h4>
          <div className="flex gap-2">
            <Button size="sm" className="h-8" onClick={setModeScene}>
              Escena
            </Button>
            <Button size="sm" className="h-8" onClick={setModeGame}>
              <Play className="w-3 h-3 mr-1" />
              Jugar
            </Button>
            <Button size="sm" className="h-8" onClick={onPauseGame}>
              <Pause className="w-3 h-3 mr-1" />
              {playRuntimeState === 'PAUSED' ? 'Reanudar' : 'Pausa'}
            </Button>
            <Button size="sm" className="h-8" onClick={onStopGame} variant="secondary">
              <Square className="w-3 h-3 mr-1" />
              Detener
            </Button>
          </div>
          <p className="text-xs text-slate-500">
            Estado: {playRuntimeState}
          </p>
        </div>

        {/* Templates */}
        <div className="rounded-lg border border-slate-700 p-3 space-y-2">
          <h4 className="text-xs text-slate-400 uppercase">Plantillas de escena</h4>
          <div className="grid grid-cols-1 gap-2">
            {STARTER_TEMPLATES.map((template) => (
              <label
                key={template.id}
                className={`rounded border p-2 cursor-pointer ${
                  template.id === templateId ? 'border-blue-500/70 bg-blue-500/10' : 'border-slate-700'
                }`}
              >
                <input
                  type="radio"
                  checked={templateId === template.id}
                  onChange={() => onTemplateChange(template.id)}
                />
                <div className="pl-3">
                  <div className="text-xs font-semibold text-slate-200">{template.label}</div>
                  <p className="text-[11px] text-slate-500">{template.description}</p>
                </div>
              </label>
            ))}
          </div>
          <Button size="sm" className="w-full bg-blue-600 hover:bg-blue-700" onClick={onCreateTemplateScene}>
            <FileSymlink className="w-3 h-3 mr-1" />
            Crear escena desde plantilla
          </Button>
        </div>

        {/* Scene tools */}
        <div className="rounded-lg border border-slate-700 p-3 space-y-2">
          <h4 className="text-xs text-slate-400 uppercase">Agregar base</h4>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={onAddStarterTerrain}>
              + Terreno
            </Button>
            <Button size="sm" variant="outline" onClick={onAddStarterPlayer}>
              + Player
            </Button>
          </div>
          <p className="text-[11px] text-slate-500">Escena activa: {activeScene?.name ?? 'sin escena'}</p>
        </div>

        {/* Scrib */}
        <div className="rounded-lg border border-slate-700 p-3 space-y-2">
          <h4 className="text-xs text-slate-400 uppercase">Scrib de entidad</h4>
          <p className="text-[11px] text-slate-500">
            Selecciona una entidad en la escena y define configuración con IA o manual.
          </p>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ej: "
            className="h-16 bg-slate-800 border-slate-700"
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={onScribManual} disabled={!selectedEntityId}>
              <Sparkles className="w-3 h-3 mr-1" />
              Scrib manual
            </Button>
            <Button size="sm" onClick={onScribAI} disabled={!selectedEntityId || !prompt}>
              <Bot className="w-3 h-3 mr-1" />
              Scrib IA
            </Button>
            <Button size="sm" variant="outline" disabled={!selectedEntityId}>
              <Wand2 className="w-3 h-3 mr-1" />
              Re-diseñar
            </Button>
          </div>

          {selectedEntity && (
            <div className="text-xs text-slate-300 border border-slate-700 p-2 rounded">
              Objeto activo: <strong>{selectedEntity.name}</strong>
            </div>
          )}

          {currentScrib ? (
            <div className="text-[11px]">
              <div
                className={`font-medium ${
                  currentScrib.mode === 'ai' ? 'text-blue-300' : 'text-emerald-300'
                }`}
              >
                Estado: {currentScrib.mode.toUpperCase()} / {currentScrib.status}
              </div>
              {currentScrib.prompt && <p className="text-slate-500 mt-1">Prompt: {currentScrib.prompt}</p>}
            </div>
          ) : (
            <p className="text-[11px] text-slate-600">Sin Scrib activo.</p>
          )}
        </div>

        {/* Build */}
        <div className="rounded-lg border border-slate-700 p-3 space-y-2">
          <h4 className="text-xs text-slate-400 uppercase">Build & Export</h4>
          <div className="flex gap-2">
            <Button size="sm" onClick={onCompile} disabled={compileRunning || !canCompile}>
              <RefreshCw className="w-3 h-3 mr-1" />
              {compileRunning ? 'Compilando...' : 'Compilar'}
            </Button>
            <Button size="sm" variant="outline" onClick={onExport} disabled={!effectiveManifest}>
              <Upload className="w-3 h-3 mr-1" />
              Exportar paquete
            </Button>
            <Button size="sm" variant="outline" onClick={clearBuild}>
              Limpiar informe
            </Button>
          </div>

          {lastBuildReport && (
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                {lastBuildReport.ok ? (
                  <CircleCheck className="w-3 h-3 text-emerald-400" />
                ) : (
                  <CircleX className="w-3 h-3 text-red-400" />
                )}
                <span className="text-xs text-slate-300">{lastBuildReport.summary}</span>
              </div>
              {lastCompileSummary && <p className="text-[11px] text-slate-500">{lastCompileSummary}</p>}
              <div className="space-y-1 max-h-28 overflow-auto">
                {lastBuildReport.diagnostics.map((item) => (
                  <DiagnosticLine
                    key={item.id}
                    kind={item.level}
                    text={`${item.stage.toUpperCase()} [${item.code}] ${item.message}`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}




