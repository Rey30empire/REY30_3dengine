'use client';

import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { useEngineStore } from '@/store/editorStore';
import {
  STARTER_TEMPLATES,
  getStarterEntitiesForTemplate,
  makeStarterPlayer,
  makeStarterTerrain,
} from '@/engine/reyplay/studio/Templates';
import { getDefaultScribProfile } from '@/engine/reyplay/build/compile';
import type { ScribTargetType } from '@/engine/reyplay/types';
import type { ScribType } from '@/engine/scrib';
import { consoleManager } from './ConsolePanel';
import { EntityFactory } from '@/engine/core/ECS';
import type { Component, EngineWorkflowMode } from '@/types/engine';
import { v4 as uuidv4 } from 'uuid';
import { battleEngine, type BattleTeam } from '@/engine/gameplay/BattleEngine';
import {
  Bot,
  Boxes,
  CheckCircle2,
  FileCode2,
  FolderTree,
  PackagePlus,
  Play,
  ShieldCheck,
  Sparkles,
  Swords,
  Upload,
  Wand2,
} from 'lucide-react';
import { ensureGeneratedScriptFile } from './generatedScriptPersistence';

type WorkflowMode = 'manual' | 'hybrid' | 'ai-first';

function ModeButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-2 text-xs transition-colors ${
        active ? 'bg-blue-500/20 text-blue-200 border border-blue-500/40' : 'bg-slate-900 text-slate-400 border border-slate-800'
      }`}
    >
      {label}
    </button>
  );
}

export function HybridSceneSystemPanel() {
  const {
    scenes,
    activeSceneId,
    entities,
    editor,
    createScene,
    setActiveScene,
    addEntity,
    addAsset,
    setScribProfile,
    selectScribEntity,
    assignScribToEntity,
    runReyPlayCompile,
    lastBuildReport,
    engineMode,
    setEngineMode,
    setEditorMode,
    setPlayRuntimeState,
    updateEntity,
  } = useEngineStore();

  const workflowMode: WorkflowMode =
    engineMode === 'MODE_MANUAL' ? 'manual' : engineMode === 'MODE_AI_FIRST' ? 'ai-first' : 'hybrid';
  const [templateId, setTemplateId] = useState<typeof STARTER_TEMPLATES[number]['id']>('base');
  const [prompt, setPrompt] = useState('');
  const [targetType, setTargetType] = useState<ScribTargetType>('custom');
  const scriptAuthWarnRef = useRef(false);
  const scriptPersistWarnRef = useRef(false);

  const selectedEntityId = editor.selectedEntities[0] || null;
  const selectedEntity = selectedEntityId ? entities.get(selectedEntityId) : null;

  const moduleCards = useMemo(
    () => [
      { title: 'Sistema de escenas cargables', status: 'base', text: 'Plantillas instantáneas + escena activa + asset de snapshot.' },
      { title: 'Motor físico básico', status: 'base', text: 'Physics, rigidbody, collider y verificación de escena ya conectados.' },
      { title: 'Assets importables/exportables', status: 'base', text: 'Asset Browser + snapshots + paquetes de build/export.' },
      { title: 'Adaptación automática de assets externos', status: 'hook', text: 'Se registran placeholders para scripts, texturas y props entrantes.' },
      { title: 'Biblioteca reutilizable', status: 'base', text: 'Cada bloque que agregas queda como asset reutilizable o script base.' },
      { title: 'Maniquíes base configurables', status: 'base', text: 'Player starter y prefabs base listos para iterar.' },
      { title: 'Subida de imagen como textura', status: 'hook', text: 'Texturas IA/manuales terminan registradas en assets.' },
      { title: 'Pintado dinámico 3D', status: 'roadmap', text: 'Queda señalado como modulo siguiente dentro del editor.' },
      { title: 'Integración Battle Engine', status: 'base', text: 'Armas, enemigos y habilidades quedan registrados en runtime de batalla.' },
      { title: 'Versionado seguro', status: 'base', text: 'Revisión + manifest + snapshot de escena para seguir cambios.' },
      { title: 'Arquitectura modular', status: 'base', text: 'Panel separado, scribs por objeto y verificación desacoplada.' },
    ],
    []
  );

  const setMode = (mode: WorkflowMode) => {
    const mapped: EngineWorkflowMode =
      mode === 'manual' ? 'MODE_MANUAL' : mode === 'hybrid' ? 'MODE_HYBRID' : 'MODE_AI_FIRST';
    setEngineMode(mapped);
  };

  const ensureScene = () => {
    if (activeSceneId) return activeSceneId;
    const scene = createScene('HB Runtime Scene');
    setActiveScene(scene.id);
    return scene.id;
  };

  const registerScriptAsset = async (name: string, scriptPrompt: string) => {
    const scriptPath = `/scripts/${name}`;
    const result = await ensureGeneratedScriptFile(scriptPath, scriptPrompt);

    if (!result.ok) {
      if ((result.status === 401 || result.status === 403) && !scriptAuthWarnRef.current) {
        consoleManager.warn('No se pudo guardar el script generado: inicia sesión para habilitar la biblioteca de scripts.');
        scriptAuthWarnRef.current = true;
        return result;
      }
      if (!scriptPersistWarnRef.current) {
        consoleManager.warn(`No se pudo guardar el script generado (${result.error || `HTTP ${result.status}`}).`);
        scriptPersistWarnRef.current = true;
      }
      return result;
    }

    const exists = useEngineStore
      .getState()
      .assets.some((asset) => asset.type === 'script' && asset.path === scriptPath);
    if (!exists) {
      addAsset({
        id: crypto.randomUUID(),
        name,
        type: 'script',
        path: scriptPath,
        size: 0,
        createdAt: new Date(),
        metadata: {
          prompt: scriptPrompt,
          workflowMode,
        },
      });
    }

    return result;
  };

  const createLoadableScene = () => {
    const scene = createScene(`HB ${templateId}`);
    setActiveScene(scene.id);
    getStarterEntitiesForTemplate(templateId).forEach((entity) => addEntity(entity));
    addAsset({
      id: crypto.randomUUID(),
      name: `${scene.name}.scene.json`,
      type: 'scene',
      path: `/scenes/${scene.id}.scene.json`,
      size: 0,
      createdAt: new Date(),
      metadata: {
        template: templateId,
        workflow: workflowMode,
      },
    });
    consoleManager.success(`Escena cargable creada: ${scene.name}`);
  };

  const addBlock = async (block: 'terrain' | 'player' | 'weapon' | 'enemy' | 'companion' | 'mount' | 'inventory') => {
    ensureScene();

    const scriptMap: Record<'terrain' | 'player' | 'weapon' | 'enemy' | 'companion' | 'mount' | 'inventory', string> = {
      terrain: 'TerrainRules.generated.ts',
      player: 'PlayerController.generated.ts',
      weapon: 'WeaponLogic.generated.ts',
      enemy: 'EnemyAI.generated.ts',
      companion: 'CompanionBrain.generated.ts',
      mount: 'MountController.generated.ts',
      inventory: 'InventorySystem.generated.ts',
    };

    if (block === 'terrain') {
      const terrain = makeStarterTerrain('HB Terrain');
      addEntity(terrain);
      await registerScriptAsset('TerrainRules.generated.ts', 'Reglas del terreno, checkpoints y zonas especiales');
      consoleManager.info('Bloque de terreno agregado');
      return;
    }

    if (block === 'player') {
      const player = makeStarterPlayer('HB Player');
      const persist = await registerScriptAsset(
        'PlayerController.generated.ts',
        'Movimiento, animacion, colisiones y habilidades del jugador'
      );
      if (persist.ok) {
        attachScript(player, scriptMap.player);
      }
      addEntity(player);
      registerBattleActor(player.id, 'player');
      consoleManager.info(
        persist.ok
          ? 'Bloque de player agregado'
          : 'Bloque de player agregado sin script persistido'
      );
      return;
    }

    const entity = EntityFactory.create(block === 'weapon' ? 'HB Weapon' : block === 'enemy' ? 'HB Enemy' : block === 'companion' ? 'HB Companion' : block === 'mount' ? 'HB Mount' : 'HB Inventory Core');
    entity.components.set('Transform', {
      id: crypto.randomUUID(),
      type: 'Transform',
      data: {
        position: { x: 0, y: 0.5, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: 1, y: 1, z: 1 },
      },
      enabled: true,
    });
    entity.tags.push(block);
    const persist = await registerScriptAsset(
      scriptMap[block],
      `Logica base para ${block} en flujo ${workflowMode}`
    );
    if (persist.ok) {
      attachScript(entity, scriptMap[block]);
    }
    addEntity(entity);
    consoleManager.info(
      persist.ok
        ? `Bloque agregado: ${block}`
        : `Bloque agregado sin script persistido: ${block}`
    );

    if (block === 'enemy') {
      registerBattleActor(entity.id, 'enemy');
    }
  };

  const addLibraryAssets = () => {
    addAsset({
      id: crypto.randomUUID(),
      name: 'MannequinBase.prefab',
      type: 'prefab',
      path: '/prefabs/MannequinBase.prefab',
      size: 0,
      createdAt: new Date(),
      metadata: { workflowMode },
    });
    addAsset({
      id: crypto.randomUUID(),
      name: 'ImportedTexture.placeholder.png',
      type: 'texture',
      path: '/textures/ImportedTexture.placeholder.png',
      size: 0,
      createdAt: new Date(),
      metadata: { source: 'manual-or-ai' },
    });
    consoleManager.success('Biblioteca reutilizable actualizada');
  };

  const createScrib = (mode: 'manual' | 'ai') => {
    if (!selectedEntityId) {
      consoleManager.warn('Selecciona una entidad antes de crear un scrib');
      return;
    }

    selectScribEntity(selectedEntityId);
    const resolveScribType = (target: ScribTargetType): ScribType => {
      if (target === 'player') return 'characterBasic';
      if (target === 'enemy') return 'enemyBasic';
      if (target === 'terrain') return 'terrainBasic';
      if (target === 'weapon') return 'weaponBasic';
      if (target === 'ui') return 'ui';
      if (target === 'ability') return 'damage';
      return 'movement';
    };
    const assignResult = assignScribToEntity(selectedEntityId, resolveScribType(targetType), {
      origin: mode === 'ai' ? 'ai' : 'manual',
    });
    if (!assignResult.ok) {
      consoleManager.warn(`Scrib assign warning: ${assignResult.issues.map((item) => item.code).join(', ')}`);
    }
    setScribProfile(selectedEntityId, {
      ...getDefaultScribProfile(selectedEntityId),
      targetType,
      mode,
      prompt,
      status: mode === 'ai' ? 'generating' : 'draft',
      manifestPath: mode === 'ai' ? 'scrib://workflow-generated.json' : undefined,
      updatedAt: new Date().toISOString(),
    });

    if (mode === 'ai') {
      window.setTimeout(() => {
        setScribProfile(selectedEntityId, {
          ...getDefaultScribProfile(selectedEntityId),
          targetType,
          mode: 'ai',
          prompt,
          status: 'ready',
          manifestPath: 'scrib://workflow-generated.json',
          updatedAt: new Date().toISOString(),
        });
      }, 900);
    }

    void registerScriptAsset(`${selectedEntity?.name || 'Entity'}_${targetType}.generated.ts`, prompt || `Scrib ${targetType}`);
    consoleManager.success(`Scrib ${mode} creado para ${selectedEntity?.name || selectedEntityId}`);
  };

  const compileWorkflow = () => {
    const report = runReyPlayCompile();
    if (report.ok) {
      consoleManager.success(report.summary);
    } else {
      consoleManager.error(report.summary);
    }
  };

  const quickPlay = () => {
    compileWorkflow();
    setEditorMode('game');
    setPlayRuntimeState('PLAYING');
    consoleManager.info('Runtime iniciado (PLAYING).');
  };

  const attachScript = (entity: ReturnType<typeof EntityFactory.create>, scriptId: string) => {
    const scriptComp: Component = {
      id: uuidv4(),
      type: 'Script',
      data: {
        scriptId: `/scripts/${scriptId}`,
        parameters: {},
        enabled: true,
      },
      enabled: true,
    };
    entity.components.set('Script', scriptComp);
  };

  const registerBattleActor = (entityId: string, team: BattleTeam) => {
    const entity = useEngineStore.getState().entities.get(entityId);
    const defaultHealth = team === 'player' ? 120 : 80;
    let healthValue = defaultHealth;

    if (entity) {
      const existing = entity.components.get('Health') as Component | undefined;
      if (!existing) {
        entity.components.set('Health', {
          id: uuidv4(),
          type: 'Health',
          enabled: true,
          data: {
            maxHealth: defaultHealth,
            currentHealth: defaultHealth,
            invulnerable: false,
            team,
          },
        });
        updateEntity(entityId, { components: entity.components });
      } else {
        const data = existing.data as any;
        healthValue = typeof data.currentHealth === 'number' ? data.currentHealth : defaultHealth;
      }
    }

    battleEngine.register({
      id: `actor_${entityId}`,
      entityId,
      team,
      health: healthValue,
      attack: team === 'player' ? 18 : 12,
      defense: 6,
      speed: 1,
      aiState: team === 'enemy' ? 'patrol' : 'idle',
    });
    consoleManager.success(`BattleEngine: entidad ${entityId} registrada (${team}).`);
  };

  return (
    <div className="flex h-full flex-col bg-slate-900">
      <div className="border-b border-slate-800 px-3 py-2">
        <div className="flex items-center gap-2">
          <Boxes className="h-4 w-4 text-cyan-300" />
          <h3 className="text-sm font-medium text-slate-100">Sistema HB</h3>
        </div>
        <p className="mt-1 text-xs text-slate-400">Escenas cargables, bloques de juego, scripts IA/manuales y compilación visible.</p>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-4 p-3">
          <section className="rounded-lg border border-slate-700 bg-slate-950/60 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs uppercase text-slate-400">Modo HB</h4>
                <p className="text-[11px] text-slate-500">Manual, híbrido o IA total con permisos por flujo.</p>
              </div>
              <ShieldCheck className="h-4 w-4 text-emerald-300" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <ModeButton active={workflowMode === 'manual'} label="Manual" onClick={() => setMode('manual')} />
              <ModeButton active={workflowMode === 'hybrid'} label="Híbrido" onClick={() => setMode('hybrid')} />
              <ModeButton active={workflowMode === 'ai-first'} label="AI-first" onClick={() => setMode('ai-first')} />
            </div>
          </section>

          <section className="rounded-lg border border-slate-700 bg-slate-950/60 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs uppercase text-slate-400">Sistema de escenas cargables</h4>
                <p className="text-[11px] text-slate-500">Creación instantánea desde plantilla con snapshot de escena.</p>
              </div>
              <FolderTree className="h-4 w-4 text-blue-300" />
            </div>
            <div className="grid gap-2">
              {STARTER_TEMPLATES.map((template) => (
                <label key={template.id} className={`rounded border px-3 py-2 text-xs ${templateId === template.id ? 'border-blue-500/60 bg-blue-500/10 text-slate-100' : 'border-slate-800 text-slate-400'}`}>
                  <input type="radio" className="mr-2" checked={templateId === template.id} onChange={() => setTemplateId(template.id)} />
                  {template.label}
                </label>
              ))}
            </div>
            <Button className="w-full" onClick={createLoadableScene}>
              <Sparkles className="mr-1 h-3 w-3" />
              Crear escena cargable
            </Button>
            <p className="text-[11px] text-slate-500">Escena activa: {scenes.find((scene) => scene.id === activeSceneId)?.name || 'sin escena'}</p>
          </section>

          <section className="rounded-lg border border-slate-700 bg-slate-950/60 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs uppercase text-slate-400">Integración Battle Engine</h4>
                <p className="text-[11px] text-slate-500">Registrar player/enemy en runtime de batalla y revisar estado.</p>
              </div>
              <Swords className="h-4 w-4 text-red-300" />
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => {
                  const sel = editor.selectedEntities[0];
                  if (!sel) {
                    consoleManager.warn('Selecciona una entidad para registrar en Battle Engine');
                    return;
                  }
                  registerBattleActor(sel, 'player');
                }}
              >
                Registrar como Player
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const sel = editor.selectedEntities[0];
                  if (!sel) {
                    consoleManager.warn('Selecciona una entidad para registrar en Battle Engine');
                    return;
                  }
                  registerBattleActor(sel, 'enemy');
                }}
              >
                Registrar como Enemy
              </Button>
            </div>
            <div className="text-xs text-slate-300">
              Actores registrados: {battleEngine.summary().count} (players {battleEngine.summary().players}, enemies {battleEngine.summary().enemies})
            </div>
          </section>

          <section className="rounded-lg border border-slate-700 bg-slate-950/60 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs uppercase text-slate-400">Bloques del juego</h4>
                <p className="text-[11px] text-slate-500">Terreno, player, armas, enemigos, monturas, compañeros e inventario.</p>
              </div>
              <PackagePlus className="h-4 w-4 text-purple-300" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" variant="outline" onClick={() => void addBlock('terrain')}>Terreno</Button>
              <Button size="sm" variant="outline" onClick={() => void addBlock('player')}>Player</Button>
              <Button size="sm" variant="outline" onClick={() => void addBlock('weapon')}>Arma</Button>
              <Button size="sm" variant="outline" onClick={() => void addBlock('enemy')}>Enemigo</Button>
              <Button size="sm" variant="outline" onClick={() => void addBlock('companion')}>Compañero</Button>
              <Button size="sm" variant="outline" onClick={() => void addBlock('mount')}>Montura</Button>
              <Button size="sm" variant="outline" onClick={() => void addBlock('inventory')}>Inventario</Button>
              <Button size="sm" variant="outline" onClick={addLibraryAssets}>Biblioteca</Button>
            </div>
          </section>

          <section className="rounded-lg border border-slate-700 bg-slate-950/60 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs uppercase text-slate-400">Scrib workflow</h4>
                <p className="text-[11px] text-slate-500">Cada objeto puede abrir su script para editar manual o pedirlo por IA.</p>
              </div>
              <FileCode2 className="h-4 w-4 text-amber-300" />
            </div>
            <select
              value={targetType}
              onChange={(event) => setTargetType(event.target.value as ScribTargetType)}
              className="flex h-9 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100"
            >
              <option value="terrain">Terreno</option>
              <option value="player">Player</option>
              <option value="enemy">Enemigo</option>
              <option value="weapon">Arma</option>
              <option value="ability">Habilidad</option>
              <option value="ui">UI</option>
              <option value="custom">Custom</option>
            </select>
            <Textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Describe la lógica. Puedes dejarlo en blanco y luego reescribir."
              className="min-h-20 bg-slate-950 border-slate-700"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => createScrib('manual')}>
                <Wand2 className="mr-1 h-3 w-3" />
                Manual
              </Button>
              <Button size="sm" variant="outline" onClick={() => createScrib('ai')}>
                <Bot className="mr-1 h-3 w-3" />
                Scrib IA
              </Button>
            </div>
            <p className="text-[11px] text-slate-500">Entidad activa: {selectedEntity?.name || 'selecciona un objeto en la escena'}</p>
          </section>

          <section className="rounded-lg border border-slate-700 bg-slate-950/60 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs uppercase text-slate-400">Verificar y revisar</h4>
                <p className="text-[11px] text-slate-500">Si algo falla, el detalle queda visible en consola y reporte.</p>
              </div>
              <Play className="h-4 w-4 text-emerald-300" />
            </div>
            <Button className="w-full" onClick={compileWorkflow}>
              <Upload className="mr-1 h-3 w-3" />
              Verificar flujo HB
            </Button>
            <Button className="w-full" variant="secondary" onClick={quickPlay}>
              <Play className="mr-1 h-3 w-3" />
              Probar escena (PLAY)
            </Button>
            {lastBuildReport && (
              <div className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-300">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className={`h-3 w-3 ${lastBuildReport.ok ? 'text-emerald-300' : 'text-red-300'}`} />
                  <span>{lastBuildReport.summary}</span>
                </div>
              </div>
            )}
          </section>

          <section className="rounded-lg border border-slate-700 bg-slate-950/60 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs uppercase text-slate-400">Módulos del sistema</h4>
                <p className="text-[11px] text-slate-500">Base entregada ahora y ganchos para seguir ampliando.</p>
              </div>
              <Swords className="h-4 w-4 text-rose-300" />
            </div>
            {moduleCards.map((card) => (
              <div key={card.title} className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-slate-200">{card.title}</span>
                  <span className="text-[10px] uppercase text-cyan-300">{card.status}</span>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">{card.text}</p>
              </div>
            ))}
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}
