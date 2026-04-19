'use client';

import { useMemo, useState } from 'react';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  MapPinned,
  PlayCircle,
  Route,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EntityFactory } from '@/engine/core/ECS';
import {
  makeStarterCamera,
  makeStarterLight,
  makeStarterPlayer,
  makeStarterTerrain,
} from '@/engine/reyplay/studio/Templates';
import { useEngineStore } from '@/store/editorStore';
import type { Component, EngineWorkflowMode, Entity, Vector3 } from '@/types/engine';
import { cn } from '@/lib/utils';
import {
  MODE_AUTO_GUIDE,
  REY30_FEATURE_REFERENCE,
  REY30_IMPLEMENTATION_ROADMAP,
  REY30_USAGE_TOUR,
  type ModeGuide,
} from './autoGuide';

function makeTransform(position: Vector3, scale: Vector3): Component {
  return {
    id: crypto.randomUUID(),
    type: 'Transform',
    enabled: true,
    data: {
      position,
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale,
    },
  };
}

function makeMesh(meshId: string, materialId = 'default'): Component {
  return {
    id: crypto.randomUUID(),
    type: 'MeshRenderer',
    enabled: true,
    data: {
      meshId,
      materialId,
      castShadows: true,
      receiveShadows: true,
    },
  };
}

function makeCollider(size: Vector3): Component {
  return {
    id: crypto.randomUUID(),
    type: 'Collider',
    enabled: true,
    data: {
      type: 'box',
      isTrigger: false,
      center: { x: 0, y: 0, z: 0 },
      size,
    },
  };
}

function setTransform(entity: Entity, position: Vector3, scale?: Vector3): Entity {
  const transform = entity.components.get('Transform');
  if (transform) {
    transform.data = {
      ...transform.data,
      position,
      ...(scale ? { scale } : {}),
    };
  }
  return entity;
}

function createPlatform(name: string, position: Vector3, scale: Vector3): Entity {
  const entity = EntityFactory.create(name);
  entity.components.set('Transform', makeTransform(position, scale));
  entity.components.set('MeshRenderer', makeMesh('cube', 'default'));
  entity.components.set('Collider', makeCollider(scale));
  entity.tags = ['platform', 'tour-demo'];
  return entity;
}

function createGuideEnemy(): Entity {
  const entity = EntityFactory.create('Guia Enemy Sentinel');
  entity.components.set('Transform', makeTransform({ x: 7, y: 1.2, z: -1.5 }, { x: 1, y: 1, z: 1 }));
  entity.components.set('MeshRenderer', makeMesh('sphere', 'default'));
  entity.components.set('Collider', makeCollider({ x: 1, y: 1, z: 1 }));
  entity.components.set('Health', {
    id: crypto.randomUUID(),
    type: 'Health',
    enabled: true,
    data: {
      maxHealth: 75,
      currentHealth: 75,
      team: 'enemy',
      speed: 2,
      attack: 10,
    },
  });
  entity.tags = ['enemy', 'tour-demo'];
  return entity;
}

function formatProgress(value: number) {
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

export function UsageGuideCopilotPanel({
  engineMode,
  modeGuide,
}: {
  engineMode: EngineWorkflowMode;
  modeGuide: ModeGuide;
}) {
  const [tourIndex, setTourIndex] = useState(0);
  const [lastSceneMessage, setLastSceneMessage] = useState('');
  const [creatingScene, setCreatingScene] = useState(false);
  const createScene = useEngineStore((state) => state.createScene);
  const addEntity = useEngineStore((state) => state.addEntity);
  const selectEntity = useEngineStore((state) => state.selectEntity);
  const setEngineMode = useEngineStore((state) => state.setEngineMode);
  const setPlayRuntimeState = useEngineStore((state) => state.setPlayRuntimeState);
  const setActivePanel = useEngineStore((state) => state.setActivePanel);
  const entityCount = useEngineStore((state) => state.entities.size);
  const sceneCount = useEngineStore((state) => state.scenes.length);

  const globalProgress = useMemo(() => {
    const total = REY30_IMPLEMENTATION_ROADMAP.reduce((sum, item) => sum + item.progress, 0);
    return Math.round(total / REY30_IMPLEMENTATION_ROADMAP.length);
  }, []);
  const currentStep = REY30_USAGE_TOUR[tourIndex] || REY30_USAGE_TOUR[0];

  const createGuidedScene = () => {
    setCreatingScene(true);
    try {
      const scene = createScene(`Guia REY30 ${new Date().toLocaleTimeString()}`);
      const terrain = setTransform(
        makeStarterTerrain('Guia Terrain Base'),
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 1, z: 1 }
      );
      const player = setTransform(
        makeStarterPlayer('Guia Player - movement target'),
        { x: 0, y: 1, z: 0 },
        { x: 1, y: 1, z: 1 }
      );
      const camera = setTransform(
        makeStarterCamera('Guia Camera - follow target'),
        { x: 0, y: 4, z: 9 },
        { x: 1, y: 1, z: 1 }
      );
      const light = setTransform(
        makeStarterLight('Guia Key Light'),
        { x: 5, y: 9, z: 4 },
        { x: 1, y: 1, z: 1 }
      );
      const platforms = [
        createPlatform('Guia Platform 01', { x: 0, y: 0.7, z: 3 }, { x: 4, y: 0.35, z: 3 }),
        createPlatform('Guia Platform 02', { x: 4, y: 1.8, z: 0 }, { x: 3.5, y: 0.35, z: 3 }),
        createPlatform('Guia Platform 03', { x: 8, y: 3, z: -2 }, { x: 4, y: 0.35, z: 3 }),
      ];
      const enemy = createGuideEnemy();

      [terrain, player, camera, light, ...platforms, enemy].forEach((entity) => addEntity(entity));
      setEngineMode('MODE_HYBRID');
      setPlayRuntimeState('IDLE');
      setActivePanel('inspector');
      selectEntity(player.id, false);
      setLastSceneMessage(
        `Escena "${scene.name}" creada: player seleccionado, cámara/luz listas, ${platforms.length} plataformas y un enemigo de prueba.`
      );
    } finally {
      setCreatingScene(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="usage-guide-copilot-panel">
      <section className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-sm font-semibold text-cyan-50">
              <Sparkles className="h-4 w-4" />
              Copilot de uso REY30
            </div>
            <p className="mt-1 text-xs text-cyan-100/80">
              Mapa de avance, tour guiado y escena demo para aprender el editor dentro de la app.
            </p>
          </div>
          <div
            className="rounded border border-cyan-300/30 bg-slate-950/70 px-3 py-2 text-xs text-cyan-100"
            data-testid="usage-guide-copilot-summary"
          >
            avance global {formatProgress(globalProgress)} | escenas {sceneCount} | entidades {entityCount}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
        <div className="mb-3 flex items-center gap-2">
          <MapPinned className="h-4 w-4 text-cyan-300" />
          <h3 className="text-sm font-medium text-slate-100">Mapa de implementación</h3>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {REY30_IMPLEMENTATION_ROADMAP.map((item) => (
            <div key={item.id} className="rounded-md border border-slate-800 bg-slate-950/70 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-medium text-slate-100">{item.area}</div>
                <div
                  className={cn(
                    'rounded border px-2 py-0.5 text-[10px]',
                    item.progress >= 100
                      ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
                      : 'border-amber-400/30 bg-amber-500/10 text-amber-200'
                  )}
                >
                  {item.status} | {formatProgress(item.progress)}
                </div>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded bg-slate-800">
                <div
                  className={cn(
                    'h-full rounded',
                    item.progress >= 100 ? 'bg-emerald-400' : 'bg-cyan-400'
                  )}
                  style={{ width: `${item.progress}%` }}
                />
              </div>
              <div className="mt-2 text-[11px] text-slate-400">
                falta: {item.remaining.join(' ')}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Route className="h-4 w-4 text-cyan-300" />
              <h3 className="text-sm font-medium text-slate-100">Tour guiado</h3>
            </div>
            <div className="text-[11px] text-slate-400">
              {tourIndex + 1}/{REY30_USAGE_TOUR.length}
            </div>
          </div>
          <div className="mt-3 rounded-md border border-slate-800 bg-slate-950/70 p-3">
            <div className="text-xs font-semibold text-slate-100">{currentStep.title}</div>
            <div className="mt-1 text-[11px] text-cyan-300">{currentStep.target}</div>
            <p className="mt-2 text-xs text-slate-300">{currentStep.action}</p>
            <p className="mt-2 text-[11px] text-slate-500">Confirmación: {currentStep.confirms}</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setTourIndex((current) => Math.max(0, current - 1))}
              disabled={tourIndex === 0}
            >
              <ChevronLeft className="mr-1 h-3 w-3" />
              Anterior
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setTourIndex((current) => Math.min(REY30_USAGE_TOUR.length - 1, current + 1))
              }
              disabled={tourIndex >= REY30_USAGE_TOUR.length - 1}
            >
              Siguiente
              <ChevronRight className="ml-1 h-3 w-3" />
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={createGuidedScene}
              disabled={creatingScene}
              data-testid="usage-guide-create-demo-scene"
            >
              <Wand2 className="mr-1 h-3 w-3" />
              Crear escena demo guiada
            </Button>
          </div>
          {lastSceneMessage && (
            <div
              className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-200"
              data-testid="usage-guide-demo-scene-result"
            >
              {lastSceneMessage}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
          <div className="flex items-center gap-2">
            <PlayCircle className="h-4 w-4 text-cyan-300" />
            <h3 className="text-sm font-medium text-slate-100">Modo activo</h3>
          </div>
          <div className="mt-3 rounded-md border border-cyan-500/30 bg-cyan-500/10 p-3">
            <div className="text-xs font-semibold text-cyan-100">
              {MODE_AUTO_GUIDE[engineMode]?.title || modeGuide.title}
            </div>
            <div className="mt-1 text-[11px] text-cyan-200">{modeGuide.objective}</div>
          </div>
          <div className="mt-3 space-y-1 text-[11px] text-slate-300">
            {modeGuide.steps.map((step) => (
              <div key={step} className="rounded border border-slate-800 bg-slate-950/70 px-2 py-1">
                {step}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
        <div className="mb-3 flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-cyan-300" />
          <h3 className="text-sm font-medium text-slate-100">Qué hace cada cosa</h3>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {REY30_FEATURE_REFERENCE.map((item) => (
            <div key={item.area} className="rounded-md border border-slate-800 bg-slate-950/70 p-3">
              <div className="text-xs font-semibold text-slate-100">{item.area}</div>
              <p className="mt-1 text-[11px] text-slate-300">{item.does}</p>
              <p className="mt-1 text-[11px] text-slate-500">Úsalo cuando: {item.useWhen}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
