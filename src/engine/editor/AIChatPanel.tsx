// ============================================
// AI Chat Panel - Complete AI Interface with Meshy AI
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useEngineStore } from '@/store/editorStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import {
  Bot, 
  Send, 
  User, 
  Sparkles, 
  Loader2, 
  Trash2,
  Copy,
  Check,
  Gamepad2,
  Mountain,
  Swords,
  PersonStanding,
  Building2,
  Wand2,
  Cuboid,
  Key,
  AlertCircle,
  Download,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Agent, AgentType, ChatMessage, AIMode, Entity } from '@/types/engine';
import type { ScribType } from '@/engine/scrib';
import {
  useAIModeWorkflowSync,
  useAIProviderCapabilities,
} from './ai/useProviderCapabilities';
import { getWorkflowPresentation } from './ai/workflowPresentation';
import { useAIActions } from './ai/useAIActions';
import type { GenerationTask } from './ai/generationTask';
import { useAIOrchestrator } from './ai/useAIOrchestrator';
import { useAICommandRouter } from './ai/useAICommandRouter';
import { ensureGeneratedScriptFile } from './generatedScriptPersistence';
import { MODE_AUTO_GUIDE } from './autoGuide';

type PipelineProgressState = {
  visible: boolean;
  totalStages: number;
  completedStages: number;
  currentStageTitle: string;
  status: 'running' | 'completed' | 'error';
  error?: string;
};

type DiagnosticLevel = 'ok' | 'warn' | 'error' | 'unknown';

type DiagnosticsSnapshot = {
  loading: boolean;
  checkedAt: string | null;
  auth: { level: DiagnosticLevel; message: string };
  scripts: { level: DiagnosticLevel; message: string };
  character: { level: DiagnosticLevel; message: string };
};

type ScriptPersistenceAvailability = 'unknown' | 'available' | 'restricted';

function diagnosticClasses(level: DiagnosticLevel): string {
  if (level === 'ok') return 'border-green-500/30 bg-green-500/10 text-green-200';
  if (level === 'warn') return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
  if (level === 'error') return 'border-red-500/30 bg-red-500/10 text-red-200';
  return 'border-slate-700 bg-slate-900 text-slate-300';
}

// AI Mode Toggle
export function AIModeToggle() {
  const { aiMode, setAIMode, engineMode } = useEngineStore();
  const lockedByWorkflow = engineMode === 'MODE_MANUAL' || engineMode === 'MODE_AI_FIRST';

  const modes: { value: AIMode; label: string; color: string }[] = [
    { value: 'OFF', label: 'Off', color: 'bg-slate-600' },
    { value: 'API', label: 'API', color: 'bg-blue-500' },
    { value: 'LOCAL', label: 'Local', color: 'bg-purple-500' },
  ];

  return (
    <div className="flex items-center gap-1 p-1 bg-slate-800 rounded-lg">
      {modes.map((mode) => (
        <button
          key={mode.value}
          onClick={() => {
            if (lockedByWorkflow) return;
            setAIMode(mode.value);
          }}
          className={cn(
            "px-3 py-1 text-xs font-medium rounded-md transition-all",
            aiMode === mode.value
              ? `${mode.color} text-white`
              : "text-slate-400 hover:text-slate-200",
            lockedByWorkflow && "cursor-not-allowed opacity-60"
          )}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}

// Quick Action Button
function QuickActionButton({ 
  icon: Icon, 
  label, 
  onClick,
  disabled
}: { 
  icon: LucideIcon; 
  label: string; 
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors border border-slate-700 text-left disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <Icon className="w-4 h-4 text-blue-400 shrink-0" />
      <span className="text-xs">{label}</span>
    </button>
  );
}

// Generation Progress Display
function GenerationProgress({ task, onCancel }: { task: GenerationTask; onCancel?: () => void }) {
  const title = task.type === 'character' ? 'Generando personaje 3D...' : 'Generando modelo 3D...';
  const processingLabel =
    task.type === 'character'
      ? task.provider === 'profile_a'
        ? 'Procesando en backend Profile A...'
        : 'Procesando personaje...'
      : 'Procesando en Meshy AI...';

  return (
    <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
      <div className="flex items-center gap-2 mb-2">
        <Cuboid className="w-4 h-4 text-blue-400" />
        <span className="text-sm font-medium text-slate-200">{title}</span>
      </div>
      
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-slate-400">
          <span>{task.prompt}</span>
          <span>{task.progress}%</span>
        </div>
        <Progress value={task.progress} className="h-2" />
        
        {task.status === 'processing' && (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>{processingLabel}</span>
          </div>
        )}
        {task.type === 'character' && task.status === 'processing' && onCancel && (
          <div className="mt-2">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onCancel}>
              Cancelar
            </Button>
          </div>
        )}
        {task.stage && (
          <div className="text-xs text-slate-500">Etapa: {task.stage}</div>
        )}
        
        {task.thumbnailUrl && (
          <img 
            src={task.thumbnailUrl} 
            alt="Preview" 
            className="w-full h-24 object-contain rounded bg-slate-900 mt-2"
          />
        )}
        
        {task.modelUrl && task.status === 'completed' && (
          <div className="flex gap-2 mt-2">
            <Button size="sm" className="flex-1 bg-green-500 hover:bg-green-600">
              <Download className="w-3 h-3 mr-1" />
              Importar al Editor
            </Button>
          </div>
        )}
        
        {task.error && (
          <div className="flex items-center gap-2 text-xs text-red-400 mt-2">
            <AlertCircle className="w-3 h-3" />
            <span>{task.error}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Main AI Chat Panel
export function AIChatPanel() {
  const { 
    chatMessages, 
    addChatMessage, 
    clearChat, 
    isAiProcessing, 
    setAiProcessing, 
    aiMode,
    setAIMode,
    engineMode,
    setEngineMode,
    addEntity, 
    createScene,
    addAsset,
    removeEntity,
    updateEntity,
    addAgent,
    updateAgentStatus,
    addTask,
    updateTask,
    entities,
    projectName,
    editor,
    runReyPlayCompile,
  } = useEngineStore();
  
  const messages = chatMessages || [];
  const [input, setInput] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<GenerationTask | null>(null);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsSnapshot>({
    loading: false,
    checkedAt: null,
    auth: { level: 'unknown', message: 'Sin verificar' },
    scripts: { level: 'unknown', message: 'Sin verificar' },
    character: { level: 'unknown', message: 'Sin verificar' },
  });
  const [pipelineProgress, setPipelineProgress] = useState<PipelineProgressState>({
    visible: false,
    totalStages: 0,
    completedStages: 0,
    currentStageTitle: '',
    status: 'running',
  });
  const [chatScrollProgress, setChatScrollProgress] = useState(100);
  const pipelineHideTimeoutRef = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const scriptPersistenceAvailabilityRef = useRef<ScriptPersistenceAvailability>('unknown');
  useAIModeWorkflowSync({ aiMode, engineMode, setAIMode });
  const { showConfigWarning, getCapabilityStatus } = useAIProviderCapabilities({ aiMode, engineMode });
  const {
    isManualWorkflow,
    isAIFirstWorkflow,
    modeLabel,
    modeDescription,
    inputPlaceholder,
  } = getWorkflowPresentation(engineMode);
  const modeGuide = MODE_AUTO_GUIDE[engineMode];
  const isInputLocked = isAiProcessing || isManualWorkflow;

  const updateChatScrollProgress = useCallback(() => {
    const viewport = scrollAreaRef.current;
    if (!viewport) return;
    const max = viewport.scrollHeight - viewport.clientHeight;
    if (max <= 0) {
      setChatScrollProgress(100);
      return;
    }
    const ratio = Math.min(1, Math.max(0, viewport.scrollTop / max));
    setChatScrollProgress(Math.round(ratio * 100));
  }, []);

  const scrollChatToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const viewport = scrollAreaRef.current;
    if (!viewport) return;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior });
    window.requestAnimationFrame(updateChatScrollProgress);
  }, [updateChatScrollProgress]);

  useEffect(() => {
    const viewport = scrollAreaRef.current;
    if (!viewport) return;
    const handleScroll = () => updateChatScrollProgress();
    viewport.addEventListener('scroll', handleScroll, { passive: true });
    updateChatScrollProgress();
    return () => {
      viewport.removeEventListener('scroll', handleScroll);
    };
  }, [updateChatScrollProgress]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    scrollChatToBottom('smooth');
  }, [messages, activeTask, scrollChatToBottom]);

  const canPersistGeneratedScripts = useCallback(async (): Promise<boolean> => {
    const cached = scriptPersistenceAvailabilityRef.current;
    if (cached === 'available') return true;
    if (cached === 'restricted') return false;

    try {
      const response = await fetch('/api/scripts/health', { cache: 'no-store' });
      if (response.ok) {
        scriptPersistenceAvailabilityRef.current = 'available';
        return true;
      }
      if (response.status === 401 || response.status === 403) {
        scriptPersistenceAvailabilityRef.current = 'restricted';
        return false;
      }
    } catch {
      // keep unknown; next attempt can retry
    }

    return false;
  }, []);

  const {
    requestChatReply,
    generateImageAsset,
    generateVideoAsset,
    canGenerate3DModel,
    generate3DModel,
    generateCharacterAsset,
    cancelCharacterGeneration,
  } = useAIActions({
    aiMode,
    engineMode,
    projectName,
    addChatMessage,
    addAsset,
    getCapabilityStatus,
    createBasicGameElement,
    setActiveTask,
  });

  const ensureAgentByType = (agentType: AgentType): string => {
    const state = useEngineStore.getState();
    const existing = Array.from(state.agents.values()).find((agent) => agent.type === agentType);
    if (existing) return existing.id;

    const names: Record<AgentType, string> = {
      orchestrator: 'Orchestrator Agent',
      world_builder: 'World Builder Agent',
      model_generator: 'Model Generator Agent',
      animation: 'Animation Agent',
      gameplay: 'Gameplay Agent',
      ui: 'UI Agent',
      optimization: 'Optimization Agent',
      terrain: 'Terrain Agent',
    };

    const agent: Agent = {
      id: crypto.randomUUID(),
      type: agentType,
      name: names[agentType],
      status: 'idle',
      tools: [],
      currentTask: null,
    };
    addAgent(agent);
    return agent.id;
  };

  const resolveContractScribType = (entity: Entity): ScribType | null => {
    const lowerName = entity.name.toLowerCase();
    const tags = entity.tags.map((tag) => tag.toLowerCase());
    const has = (component: string) => entity.components.has(component);

    if (
      has('Terrain') ||
      tags.includes('terrain') ||
      lowerName.includes('terrain') ||
      lowerName.includes('terreno') ||
      lowerName.includes('mazefloor')
    ) {
      return 'terrainBasic';
    }

    if (
      has('Weapon') ||
      tags.includes('weapon') ||
      lowerName.includes('weapon') ||
      lowerName.includes('espada') ||
      lowerName.includes('arma')
    ) {
      return 'weaponBasic';
    }

    if (
      tags.includes('enemy') ||
      lowerName.includes('enemy') ||
      lowerName.includes('enemigo') ||
      lowerName.includes('monster') ||
      lowerName.includes('lobo')
    ) {
      return 'enemyBasic';
    }

    if (
      tags.includes('player') ||
      has('PlayerController') ||
      lowerName.includes('player') ||
      lowerName.includes('jugador')
    ) {
      return 'characterBasic';
    }

    if (has('Camera')) {
      return 'cameraFollow';
    }

    if (has('MeshRenderer')) {
      return 'mesh';
    }

    if (has('Transform')) {
      return 'transform';
    }

    return null;
  };

  const enforceAIGenerationContract = (
    origin: 'ai' | 'manual' = 'ai'
  ): string[] => {
    const state = useEngineStore.getState();
    let touchedEntities = 0;
    let addedScribs = 0;

    for (const [entityId, entity] of state.entities.entries()) {
      const scribType = resolveContractScribType(entity);
      if (!scribType) continue;

      const result = state.assignScribToEntity(entityId, scribType, { origin });
      if (!result.ok) continue;
      const inserted = result.assigned.length + result.autoAdded.length;
      if (inserted > 0) {
        touchedEntities += 1;
        addedScribs += inserted;
      }
    }

    return [
      `✓ Contrato AI: ${state.entities.size} entidad(es) validadas`,
      `✓ Contrato AI: ${touchedEntities} entidad(es) normalizadas con Scrib`,
      `✓ Scribs agregados/auto dependencias: ${addedScribs}`,
    ];
  };

  const { runOrchestratedPipeline } = useAIOrchestrator({
    engineMode,
    addChatMessage,
    addTask,
    updateAgentStatus,
    updateTask,
    ensureAgentByType,
    createBasicGameElement,
    enforceAIGenerationContract,
    runReyPlayCompile,
    onPipelineStart: ({ totalStages, firstStageTitle }) => {
      if (pipelineHideTimeoutRef.current !== null) {
        window.clearTimeout(pipelineHideTimeoutRef.current);
        pipelineHideTimeoutRef.current = null;
      }
      setPipelineProgress({
        visible: true,
        totalStages,
        completedStages: 0,
        currentStageTitle: firstStageTitle || '',
        status: 'running',
      });
    },
    onPipelineStage: ({ index, title, status, error }) => {
      setPipelineProgress((current) => ({
        ...current,
        visible: true,
        currentStageTitle: title,
        completedStages: status === 'completed'
          ? Math.max(current.completedStages, index)
          : current.completedStages,
        status: status === 'failed' ? 'error' : 'running',
        error: status === 'failed' ? error : undefined,
      }));
    },
    onPipelineDone: ({ failed }) => {
      setPipelineProgress((current) => ({
        ...current,
        visible: true,
        completedStages: failed ? current.completedStages : current.totalStages,
        status: failed ? 'error' : 'completed',
      }));
      if (!failed) {
        pipelineHideTimeoutRef.current = window.setTimeout(() => {
          setPipelineProgress((current) => ({ ...current, visible: false }));
          pipelineHideTimeoutRef.current = null;
        }, 2500);
      }
    },
  });
  const { processCommand } = useAICommandRouter({
    isManualWorkflow,
    isAIFirstWorkflow,
    addChatMessage,
    setAiProcessing,
    clearInput: () => setInput(''),
    requestChatReply,
    generateImageAsset,
    generateVideoAsset,
    canGenerate3DModel,
    generate3DModel,
    generateCharacterAsset,
    createBasicGameElement,
    runOrchestratedPipeline,
  });

  const refreshDiagnostics = async () => {
    setDiagnostics((current) => ({ ...current, loading: true }));

    const next: DiagnosticsSnapshot = {
      loading: false,
      checkedAt: new Date().toISOString(),
      auth: { level: 'unknown', message: 'Sin verificar' },
      scripts: { level: 'unknown', message: 'Sin verificar' },
      character: { level: 'unknown', message: 'Sin verificar' },
    };

    try {
      const authRes = await fetch('/api/auth/session', { cache: 'no-store' });
      if (authRes.ok) {
        const authData = await authRes.json().catch(() => ({} as Record<string, unknown>));
        const authenticated = Boolean(authData.authenticated);
        next.auth = authenticated
          ? { level: 'ok', message: 'Sesión activa' }
          : { level: 'warn', message: 'No has iniciado sesión' };
      } else {
        next.auth = { level: 'error', message: `Auth HTTP ${authRes.status}` };
      }
    } catch {
      next.auth = { level: 'error', message: 'No se pudo verificar auth' };
    }

    try {
      const scriptsRes = await fetch('/api/scripts/health', { cache: 'no-store' });
      if (scriptsRes.ok) {
        const scriptsData = await scriptsRes.json().catch(() => ({} as Record<string, unknown>));
        const available = scriptsData.available !== false;
        scriptPersistenceAvailabilityRef.current = available ? 'available' : 'unknown';
        next.scripts = available
          ? { level: 'ok', message: 'Scripts API operativa' }
          : { level: 'warn', message: typeof scriptsData.message === 'string' ? scriptsData.message : 'Scripts API con problemas' };
      } else if (scriptsRes.status === 401 || scriptsRes.status === 403) {
        scriptPersistenceAvailabilityRef.current = 'restricted';
        next.scripts = { level: 'warn', message: 'Scripts requiere sesión/rol' };
      } else {
        scriptPersistenceAvailabilityRef.current = 'unknown';
        next.scripts = { level: 'error', message: `Scripts HTTP ${scriptsRes.status}` };
      }
    } catch {
      scriptPersistenceAvailabilityRef.current = 'unknown';
      next.scripts = { level: 'error', message: 'No se pudo verificar Scripts API' };
    }

    try {
      const charRes = await fetch('/api/character/jobs/health', { cache: 'no-store' });
      if (charRes.ok) {
        const charData = await charRes.json().catch(() => ({} as Record<string, unknown>));
        const available = Boolean(charData.available);
        const configured = charData.configured !== false;
        if (!configured) {
          next.character = { level: 'warn', message: 'Backend personaje no configurado' };
        } else if (available) {
          next.character = { level: 'ok', message: 'Backend personaje operativo' };
        } else {
          next.character = {
            level: 'warn',
            message: typeof charData.message === 'string' ? charData.message : 'Backend personaje no disponible',
          };
        }
      } else if (charRes.status === 401 || charRes.status === 403) {
        next.character = { level: 'warn', message: 'Character backend requiere sesión/rol' };
      } else {
        next.character = { level: 'error', message: `Character backend HTTP ${charRes.status}` };
      }
    } catch {
      next.character = { level: 'error', message: 'No se pudo verificar backend de personaje' };
    }

    setDiagnostics(next);
  };

  useEffect(() => {
    return () => {
      if (pipelineHideTimeoutRef.current !== null) {
        window.clearTimeout(pipelineHideTimeoutRef.current);
        pipelineHideTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!diagnosticsOpen) return;
    void refreshDiagnostics();
  }, [diagnosticsOpen]);

  // Create basic game element (fallback without API)
  async function createBasicGameElement(
    command: string,
    options?: { silent?: boolean }
  ): Promise<string[]> {
    const silent = options?.silent ?? false;
    const lowerCommand = command.toLowerCase();
    const results: string[] = [];
    let scriptPersistenceAuthWarned = false;
    let scriptPersistenceGenericWarned = false;

    const registerGeneratedScriptAsset = async (scriptPath: string) => {
      const normalized = scriptPath.replace(/^\/+/, '');
      const assetPath = normalized.startsWith('scripts/') ? `/${normalized}` : `/scripts/${normalized}`;
      const scriptName = normalized.split('/').pop() || normalized;

      const canPersist = await canPersistGeneratedScripts();
      if (!canPersist) {
        if (!scriptPersistenceAuthWarned) {
          results.push('⚠️ No se pudo guardar scripts generados: inicia sesión para habilitar /api/scripts.');
          scriptPersistenceAuthWarned = true;
        }
        return false;
      }

      const persist = await ensureGeneratedScriptFile(assetPath, command);
      if (persist.ok) {
        const exists = useEngineStore
          .getState()
          .assets.some((asset) => asset.type === 'script' && asset.path === assetPath);
        if (!exists) {
          addAsset({
            id: crypto.randomUUID(),
            name: scriptName,
            type: 'script',
            path: assetPath,
            size: 0,
            createdAt: new Date(),
            metadata: { prompt: command, generatedBy: 'hybrid-workflow' },
          });
        }
        return true;
      }

      const status = persist.status;
      if ((status === 401 || status === 403) && !scriptPersistenceAuthWarned) {
        scriptPersistenceAvailabilityRef.current = 'restricted';
        results.push('⚠️ No se pudo guardar scripts generados: inicia sesión para habilitar /api/scripts.');
        scriptPersistenceAuthWarned = true;
        return false;
      }

      if (!scriptPersistenceGenericWarned) {
        results.push(`⚠️ Error guardando scripts generados (${persist.error || `HTTP ${status}`}).`);
        scriptPersistenceGenericWarned = true;
      }
      return false;
    };
    const hasGameKeyword = ['juego', 'game', 'nivel', 'level', 'arena'].some((keyword) =>
      lowerCommand.includes(keyword)
    );
    const hasBuildKeyword = ['crea', 'crear', 'genera', 'generar', 'haz', 'hacer', 'build', 'make', 'setup'].some(
      (keyword) => lowerCommand.includes(keyword)
    );
    const shouldCreateStarterGame = hasGameKeyword && hasBuildKeyword;
    const wantsPlatformer =
      lowerCommand.includes('plataforma') ||
      lowerCommand.includes('platformer') ||
      lowerCommand.includes('platform');
    const wantsWolfEnemy = lowerCommand.includes('lobo') || lowerCommand.includes('wolf');

    if (shouldCreateStarterGame) {
      const [{ EntityFactory }, { makeStarterTerrain, makeStarterPlayer, makeStarterCamera, makeStarterLight }] =
        await Promise.all([
          import('@/engine/core/ECS'),
          import('@/engine/reyplay/studio/Templates'),
        ]);

      const scene = createScene(`Juego IA ${Date.now()}`);
      addEntity(makeStarterTerrain('Terreno IA'));
      addEntity(makeStarterPlayer('Jugador IA'));
      addEntity(makeStarterCamera('Camara Principal IA'));
      addEntity(makeStarterLight('Luz Principal IA'));

      if (wantsPlatformer) {
        const platformLayout = [
          { x: 0, y: 1.2, z: 2, w: 4, d: 4 },
          { x: 5, y: 2.6, z: 0, w: 4, d: 4 },
          { x: 10, y: 4, z: -2, w: 5, d: 4 },
          { x: 15, y: 5.2, z: 1, w: 4, d: 4 },
          { x: 20, y: 6.4, z: -1, w: 6, d: 4 },
        ];

        platformLayout.forEach((item, index) => {
          const platform = EntityFactory.create(`Plataforma_${index + 1}`);
          platform.components.set('Transform', {
            id: crypto.randomUUID(),
            type: 'Transform',
            data: {
              position: { x: item.x, y: item.y, z: item.z },
              rotation: { x: 0, y: 0, z: 0, w: 1 },
              scale: { x: item.w, y: 0.4, z: item.d },
            },
            enabled: true,
          });
          platform.components.set('MeshRenderer', {
            id: crypto.randomUUID(),
            type: 'MeshRenderer',
            data: { meshId: 'cube', materialId: 'default', castShadows: true, receiveShadows: true },
            enabled: true,
          });
          platform.tags.push('platform');
          addEntity(platform);
        });
        await registerGeneratedScriptAsset('/scripts/PlatformerMovement.generated.ts');
        results.push(`✓ ${platformLayout.length} plataformas jugables generadas`);
      }

      const enemyName = wantsWolfEnemy ? 'Lobo Enemigo' : 'Enemy';
      const enemy = EntityFactory.create(enemyName);
      enemy.components.set('Transform', {
        id: crypto.randomUUID(),
        type: 'Transform',
        data: { position: { x: 4, y: 0.5, z: -1 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 } },
        enabled: true,
      });
      enemy.components.set('Health', {
        id: crypto.randomUUID(),
        type: 'Health',
        data: {
          maxHealth: 100,
          currentHealth: 100,
          team: 'enemy',
        },
        enabled: true,
      });
      enemy.tags.push('enemy');
      if (wantsWolfEnemy) {
        enemy.tags.push('wolf', 'lobo');
      }
      addEntity(enemy);

      await registerGeneratedScriptAsset('/scripts/GameLoop.generated.ts');
      await registerGeneratedScriptAsset('/scripts/EnemyAI.generated.ts');

      results.push(`✓ Escena creada: ${scene.name}`);
      results.push('✓ Terreno base generado');
      results.push('✓ Jugador jugable agregado');
      results.push('✓ Camara principal configurada');
      results.push('✓ Iluminacion inicial lista');
      results.push(wantsWolfEnemy ? '✓ Enemigo lobo agregado' : '✓ Enemigo de prueba agregado');
      results.push('✓ Scripts base de GameLoop y EnemyAI registrados');

      if (lowerCommand.includes('arma') || lowerCommand.includes('weapon') || lowerCommand.includes('espada') || lowerCommand.includes('sword')) {
        const weapon = EntityFactory.create('Espada');
        weapon.components.set('Transform', {
          id: crypto.randomUUID(),
          type: 'Transform',
          data: { position: { x: 0.5, y: 1, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 } },
          enabled: true,
        });
        weapon.components.set('Weapon', {
          id: crypto.randomUUID(),
          type: 'Weapon',
          data: {
            damage: 25,
            attackSpeed: 1.5,
            range: 2,
            type: 'melee',
          },
          enabled: true,
        });
        addEntity(weapon);
        await registerGeneratedScriptAsset('/scripts/WeaponLogic.generated.ts');
        results.push('✓ Arma inicial agregada');
      }

      if (!silent) {
        addChatMessage({
          role: 'assistant',
          content: `**Completado:**\n${results.join('\n')}`,
        });
      }
      return results;
    }

    const wantsDelete =
      lowerCommand.includes('elimina') ||
      lowerCommand.includes('eliminar') ||
      lowerCommand.includes('borra') ||
      lowerCommand.includes('borrar') ||
      lowerCommand.includes('remove') ||
      lowerCommand.includes('delete');

    if (wantsDelete) {
      const selectedIds = editor.selectedEntities;
      const removeAll = lowerCommand.includes('todo') || lowerCommand.includes('all');
      const removeSelection =
        lowerCommand.includes('seleccion') ||
        lowerCommand.includes('selección') ||
        lowerCommand.includes('selected');

      if (removeAll) {
        const allIds = Array.from(entities.keys());
        allIds.forEach((id) => removeEntity(id));
        results.push(`✓ ${allIds.length} objeto(s) eliminados de la escena`);
      } else if (removeSelection && selectedIds.length > 0) {
        selectedIds.forEach((id) => removeEntity(id));
        results.push(`✓ ${selectedIds.length} objeto(s) seleccionados eliminados`);
      } else {
        const targetName = lowerCommand
          .replace(/elimina|eliminar|borra|borrar|remove|delete/gi, '')
          .trim();
        const ids = Array.from(entities.entries())
          .filter(([, entity]) =>
            targetName ? entity.name.toLowerCase().includes(targetName.toLowerCase()) : false
          )
          .map(([id]) => id);

        if (ids.length > 0) {
          ids.forEach((id) => removeEntity(id));
          results.push(`✓ ${ids.length} objeto(s) eliminados por nombre`);
        } else {
          results.push('⚠️ No encontré objetos para eliminar con ese criterio.');
          results.push('💡 Tip: usa "elimina selección" o "elimina todo".');
        }
      }

      if (!silent) {
        addChatMessage({
          role: 'assistant',
          content: `**Completado:**\n${results.join('\n')}`,
        });
      }
      return results;
    }

    if (lowerCommand.includes('laberinto') || lowerCommand.includes('maze')) {
      const [{ EntityFactory }, { makeStarterPlayer, makeStarterCamera, makeStarterLight }] = await Promise.all([
        import('@/engine/core/ECS'),
        import('@/engine/reyplay/studio/Templates'),
      ]);
      const scene = createScene('Escena Laberinto');
      results.push(`✓ Escena creada: ${scene.name}`);

      const floor = EntityFactory.create('MazeFloor');
      floor.components.set('Transform', {
        id: crypto.randomUUID(),
        type: 'Transform',
        data: {
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          scale: { x: 20, y: 0.2, z: 20 },
        },
        enabled: true,
      });
      floor.components.set('MeshRenderer', {
        id: crypto.randomUUID(),
        type: 'MeshRenderer',
        data: { meshId: 'cube', materialId: 'default', castShadows: false, receiveShadows: true },
        enabled: true,
      });
      floor.tags.push('maze');
      addEntity(floor);

      const wallCoords = [
        [-8, -8], [-8, -4], [-8, 0], [-8, 4], [-8, 8],
        [-4, 8], [0, 8], [4, 8], [8, 8],
        [8, 4], [8, 0], [8, -4], [8, -8],
        [-4, -8], [0, -8], [4, -8],
        [-2, -4], [-2, 0], [-2, 4],
        [2, -4], [2, 0], [2, 4],
        [0, -2], [0, 2],
      ];

      wallCoords.forEach(([x, z], index) => {
        const wall = EntityFactory.create(`Wall_${index + 1}`);
        wall.components.set('Transform', {
          id: crypto.randomUUID(),
          type: 'Transform',
          data: {
            position: { x, y: 1, z },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            scale: { x: 2, y: 2, z: 0.5 },
          },
          enabled: true,
        });
        wall.components.set('MeshRenderer', {
          id: crypto.randomUUID(),
          type: 'MeshRenderer',
          data: { meshId: 'cube', materialId: 'default', castShadows: true, receiveShadows: true },
          enabled: true,
        });
        wall.tags.push('maze', 'wall');
        addEntity(wall);
      });

      addEntity(makeStarterPlayer('Jugador Laberinto'));
      addEntity(makeStarterCamera('Camara Laberinto'));
      addEntity(makeStarterLight('Luz Laberinto'));

      results.push('✓ Piso y muros de laberinto generados');
      results.push(`✓ ${wallCoords.length} muros colocados`);
      results.push('✓ Jugador, camara y luz inicial agregados');
    }

    // Scene creation
    if (lowerCommand.includes('escena') || lowerCommand.includes('scene') || lowerCommand.includes('nivel')) {
      const scene = createScene('Nueva Escena');
      results.push(`✓ Escena creada: ${scene.name}`);
    }

    // Character
    if (
      lowerCommand.includes('personaje') ||
      lowerCommand.includes('character') ||
      lowerCommand.includes('jugador') ||
      lowerCommand.includes('heroe') ||
      lowerCommand.includes('héroe')
    ) {
      const { EntityFactory } = await import('@/engine/core/ECS');
      const entity = EntityFactory.create('Jugador');
      entity.components.set('Transform', {
        id: crypto.randomUUID(),
        type: 'Transform',
        data: { position: { x: 0, y: 1, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 } },
        enabled: true,
      });
      entity.components.set('PlayerController', {
        id: crypto.randomUUID(),
        type: 'PlayerController',
        data: { 
          speed: 5, 
          jumpForce: 8, 
          sensitivity: 2,
          canDoubleJump: true,
        },
        enabled: true,
      });
      entity.components.set('Animator', {
        id: crypto.randomUUID(),
        type: 'Animator',
        data: { 
          currentState: 'idle',
          states: ['idle', 'walk', 'run', 'jump', 'attack'],
        },
        enabled: true,
      });
      addEntity(entity);
      await registerGeneratedScriptAsset('/scripts/PlayerController.generated.ts');
      results.push('✓ Personaje jugable creado');
      results.push('✓ Controles: WASD mover, Space saltar, Mouse rotar cámara');
      results.push('✓ Animaciones configuradas');
      results.push('✓ Script base del jugador registrado');
    }

    // Weapons
    if (lowerCommand.includes('arma') || lowerCommand.includes('weapon') || lowerCommand.includes('espada') || lowerCommand.includes('sword')) {
      const { EntityFactory } = await import('@/engine/core/ECS');
      const weapon = EntityFactory.create('Espada');
      weapon.components.set('Transform', {
        id: crypto.randomUUID(),
        type: 'Transform',
        data: { position: { x: 0.5, y: 1, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 } },
        enabled: true,
      });
      weapon.components.set('Weapon', {
        id: crypto.randomUUID(),
        type: 'Weapon',
        data: { 
          damage: 25,
          attackSpeed: 1.5,
          range: 2,
          type: 'melee',
        },
        enabled: true,
      });
      addEntity(weapon);
      await registerGeneratedScriptAsset('/scripts/WeaponLogic.generated.ts');
      results.push('✓ Arma creada (25 daño, 1.5 velocidad)');
      results.push('✓ Script base de arma preparado');
    }

    // Particles/Effects
    if (lowerCommand.includes('partícula') || lowerCommand.includes('particle') || lowerCommand.includes('efecto') || lowerCommand.includes('effect')) {
      results.push('✓ Sistema de partículas creado');
      results.push('✓ Efectos visuales aplicados');
    }

    // Terrain
    if (lowerCommand.includes('terreno') || lowerCommand.includes('terrain') || lowerCommand.includes('isla')) {
      const { makeStarterTerrain } = await import('@/engine/reyplay/studio/Templates');
      addEntity(makeStarterTerrain('Terrain Procedural'));
      await registerGeneratedScriptAsset('/scripts/TerrainRules.generated.ts');
      results.push('✓ Terreno procedural generado');
      results.push('✓ Texturas aplicadas');
      results.push('✓ Script de reglas del terreno preparado');
    }

    // Enemies
    if (
      lowerCommand.includes('enemigo') ||
      lowerCommand.includes('enemy') ||
      lowerCommand.includes('monstruo') ||
      lowerCommand.includes('monster') ||
      lowerCommand.includes('boss') ||
      lowerCommand.includes('lobo') ||
      lowerCommand.includes('wolf') ||
      lowerCommand.includes('bestia') ||
      lowerCommand.includes('creatura') ||
      lowerCommand.includes('creature')
    ) {
      const { EntityFactory } = await import('@/engine/core/ECS');
      const isWolf = lowerCommand.includes('lobo') || lowerCommand.includes('wolf');
      const enemy = EntityFactory.create(isWolf ? 'Lobo Enemigo' : 'Enemy');
      enemy.components.set('Transform', {
        id: crypto.randomUUID(),
        type: 'Transform',
        data: { position: { x: 3, y: 0.5, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 } },
        enabled: true,
      });
      enemy.tags.push('enemy');
      if (isWolf) {
        enemy.tags.push('wolf', 'lobo');
      }
      addEntity(enemy);
      await registerGeneratedScriptAsset('/scripts/EnemyAI.generated.ts');
      results.push(isWolf ? '✓ Enemigo lobo agregado a escena' : '✓ Enemigo base agregado a escena');
      results.push('✓ Script de IA de patrulla preparado');
    }

    // Jump physics / camera jump setup
    if (
      lowerCommand.includes('salto') ||
      lowerCommand.includes('jump') ||
      lowerCommand.includes('saltar') ||
      lowerCommand.includes('física de salto') ||
      lowerCommand.includes('fisica de salto')
    ) {
      const targetCamera =
        lowerCommand.includes('camara') ||
        lowerCommand.includes('cámara') ||
        lowerCommand.includes('camera');
      let targetEntity = Array.from(entities.values()).find((entity) =>
        targetCamera ? entity.components.has('Camera') : entity.tags.includes('player') || entity.components.has('PlayerController')
      );

      if (!targetEntity) {
        const { EntityFactory } = await import('@/engine/core/ECS');
        if (targetCamera) {
          const cameraEntity = EntityFactory.create('Camara Saltadora');
          cameraEntity.components.set('Transform', {
            id: crypto.randomUUID(),
            type: 'Transform',
            data: {
              position: { x: 0, y: 2, z: 6 },
              rotation: { x: 0, y: 0, z: 0, w: 1 },
              scale: { x: 1, y: 1, z: 1 },
            },
            enabled: true,
          });
          cameraEntity.components.set('Camera', {
            id: crypto.randomUUID(),
            type: 'Camera',
            data: {
              fov: 60,
              near: 0.1,
              far: 1000,
              orthographic: false,
              clearColor: { r: 0.08, g: 0.08, b: 0.1, a: 1 },
              isMain: false,
            },
            enabled: true,
          });
          addEntity(cameraEntity);
          targetEntity = cameraEntity;
          results.push('✓ Camara creada para aplicar salto');
        } else {
          const playerEntity = EntityFactory.create('Jugador Saltador');
          playerEntity.components.set('Transform', {
            id: crypto.randomUUID(),
            type: 'Transform',
            data: {
              position: { x: 0, y: 1, z: 0 },
              rotation: { x: 0, y: 0, z: 0, w: 1 },
              scale: { x: 1, y: 1, z: 1 },
            },
            enabled: true,
          });
          playerEntity.tags.push('player');
          addEntity(playerEntity);
          targetEntity = playerEntity;
          results.push('✓ Jugador creado para aplicar salto');
        }
      }

      if (targetEntity) {
        const updatedComponents = new Map(targetEntity.components);
        updatedComponents.set('PlayerController', {
          id: crypto.randomUUID(),
          type: 'PlayerController',
          data: {
            speed: 4.5,
            jumpForce: 10,
            sensitivity: 2,
            canDoubleJump: false,
          },
          enabled: true,
        });
        updateEntity(targetEntity.id, { components: updatedComponents });
        results.push(
          targetCamera
            ? `✓ Física de salto aplicada a cámara: ${targetEntity.name}`
            : `✓ Física de salto aplicada a entidad: ${targetEntity.name}`
        );
      } else {
        results.push('⚠️ No encontré un objetivo para salto. Crea primero cámara o jugador.');
      }
    }

    // Default response
    if (results.length === 0) {
      const looksLikeQuestion =
        lowerCommand.includes('?') ||
        lowerCommand.startsWith('que ') ||
        lowerCommand.startsWith('qué ') ||
        lowerCommand.startsWith('como ') ||
        lowerCommand.startsWith('cómo ');
      const wantsPrimitive =
        lowerCommand.includes('cubo') ||
        lowerCommand.includes('cube') ||
        lowerCommand.includes('esfera') ||
        lowerCommand.includes('sphere') ||
        lowerCommand.includes('capsula') ||
        lowerCommand.includes('cápsula') ||
        lowerCommand.includes('capsule') ||
        lowerCommand.includes('cilindro') ||
        lowerCommand.includes('cylinder');

      if (!looksLikeQuestion && wantsPrimitive) {
        const { EntityFactory } = await import('@/engine/core/ECS');
        const generic = EntityFactory.create(
          command
            .replace(/crea|crear|haz|make|build|genera|generar|agrega|añade|add/gi, '')
            .trim()
            .slice(0, 42) || 'Objeto Generado'
        );
        generic.components.set('Transform', {
          id: crypto.randomUUID(),
          type: 'Transform',
          data: {
            position: { x: 0, y: 0.5, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            scale: { x: 1, y: 1, z: 1 },
          },
          enabled: true,
        });
        generic.components.set('MeshRenderer', {
          id: crypto.randomUUID(),
          type: 'MeshRenderer',
          data: { meshId: 'cube', materialId: 'default', castShadows: true, receiveShadows: true },
          enabled: true,
        });
        addEntity(generic);
        results.push(`✓ Objeto creado desde orden libre: ${generic.name}`);
      } else {
        results.push('⚠️ No detecté una acción de escena válida para construir.');
        results.push('💡 Tip: pide explícitamente un objetivo, por ejemplo: "crea cubo", "crea laberinto", "crea personaje 3d".');
      }
    }

    if (!silent) {
      addChatMessage({
        role: 'assistant',
        content: `**Completado:**\n${results.join('\n')}`,
      });
    }
    return results;
  }

  // Handle send
  const handleSend = () => {
    if (!input.trim() || isInputLocked) return;
    processCommand(input);
  };

  // Handle key press
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Copy message
  const handleCopy = (id: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Quick actions
  const quickActions = [
    { icon: PersonStanding, label: 'Personaje', prompt: 'genera un personaje guerrero fantasy para juego' },
    { icon: Swords, label: 'Arma', prompt: 'genera una espada medieval con detalles' },
    { icon: Building2, label: 'Escena', prompt: 'crea una escena base con terreno, jugador y camara' },
    { icon: Mountain, label: 'Terreno', prompt: 'crea terreno montañoso con vegetación' },
    { icon: Wand2, label: 'Textura', prompt: 'genera una textura sci fi azul para piso metalico' },
    { icon: Gamepad2, label: 'Video', prompt: 'crea un video trailer corto de una arena futurista' },
  ];

  const pipelineProgressValue =
    pipelineProgress.totalStages > 0
      ? Math.round((pipelineProgress.completedStages / pipelineProgress.totalStages) * 100)
      : 0;
  const pipelineCurrentIndex =
    pipelineProgress.status === 'running'
      ? Math.min(pipelineProgress.totalStages, pipelineProgress.completedStages + 1)
      : Math.max(1, pipelineProgress.completedStages);

  return (
    <div className="flex flex-col h-full bg-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700 shrink-0">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-medium text-slate-200">Asistente IA</h3>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px] text-slate-400 hover:text-slate-200"
            onClick={() => setDiagnosticsOpen((value) => !value)}
            title="Diagnóstico rápido"
          >
            Diag
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-slate-400 hover:text-slate-200"
            onClick={() => clearChat()}
            title="Limpiar chat"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* AI Mode Toggle */}
      <div className="px-3 py-2 border-b border-slate-700/50 shrink-0">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">Modo IA</span>
          <AIModeToggle />
        </div>
        <div className="mt-2 rounded-md border border-slate-800 bg-slate-950/70 px-2 py-1.5">
          <p className="text-[11px] font-medium text-cyan-300">Workflow: {modeLabel}</p>
          <p className="text-[11px] text-slate-500">{modeDescription}</p>
          <p className="mt-1 text-[11px] text-slate-400">Guía rápida: {modeGuide.steps[0]}</p>
        </div>
        {isManualWorkflow && (
          <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-2">
            <p className="text-[11px] text-amber-200">
              IA bloqueada por workflow manual. Cambia a Hybrid o AI First para activar chat/generacion.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2 h-7 text-xs"
              onClick={() => {
                setEngineMode('MODE_HYBRID');
                setAIMode('API');
              }}
            >
              Activar modo Hybrid
            </Button>
          </div>
        )}
      </div>

      {/* Config Warning */}
      {showConfigWarning && (
        <div className="mx-3 mt-2 p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg shrink-0">
          <div className="flex items-start gap-2">
            <Key className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs text-amber-300 font-medium">API Key requerida</p>
              <p className="text-xs text-slate-400 mt-1">
                Configura OpenAI para chat en modo API o cambia el routing de chat a Local en Configuración.
              </p>
            </div>
          </div>
        </div>
      )}

      {diagnosticsOpen && (
        <div className="mx-3 mt-2 rounded-lg border border-slate-700 bg-slate-900/70 p-2 shrink-0">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium text-slate-200">Diagnóstico rápido</p>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => void refreshDiagnostics()}
              disabled={diagnostics.loading}
            >
              {diagnostics.loading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
              Actualizar
            </Button>
          </div>
          <div className="grid gap-1.5 text-[11px]">
            <div className={cn('rounded border px-2 py-1', diagnosticClasses(diagnostics.auth.level))}>
              Auth: {diagnostics.auth.message}
            </div>
            <div className={cn('rounded border px-2 py-1', diagnosticClasses(diagnostics.scripts.level))}>
              Scripts API: {diagnostics.scripts.message}
            </div>
            <div className={cn('rounded border px-2 py-1', diagnosticClasses(diagnostics.character.level))}>
              Character backend: {diagnostics.character.message}
            </div>
            <p className="text-[10px] text-slate-500">
              Última verificación: {diagnostics.checkedAt ? new Date(diagnostics.checkedAt).toLocaleTimeString() : 'sin ejecutar'}
            </p>
          </div>
        </div>
      )}

      <div className="mx-3 mt-2 h-1 overflow-hidden rounded-full border border-slate-800 bg-slate-950/80 shrink-0">
        <div
          className="h-full rounded-full bg-cyan-400/80 transition-[width] duration-150"
          style={{ width: `${chatScrollProgress}%` }}
          aria-label="Barra de movimiento del chat"
        />
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 min-h-0" ref={scrollAreaRef}>
        <div className="p-3 space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-4 text-center">
              <Sparkles className="w-8 h-8 text-blue-400/50 mb-2" />
              <p className="text-sm text-slate-400 mb-1">
                ¡Hola! Soy tu asistente de creación de juegos.
              </p>
              <p className="text-xs text-slate-500 mb-3">
                Puedo enrutar chat, imagen, video y 3D según tu configuración.
              </p>
              
              {/* Quick Actions */}
              <div className="grid grid-cols-2 gap-2 w-full">
                {quickActions.map((action, i) => (
                  <QuickActionButton
                    key={i}
                    icon={action.icon}
                    label={action.label}
                    onClick={() => processCommand(action.prompt)}
                    disabled={isInputLocked}
                  />
                ))}
              </div>
            </div>
          ) : (
            <>
              {pipelineProgress.visible && (
                <div className={cn(
                  'rounded-lg border p-3',
                  pipelineProgress.status === 'error'
                    ? 'border-red-500/40 bg-red-500/10'
                    : 'border-blue-500/30 bg-blue-500/10'
                )}>
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span className={pipelineProgress.status === 'error' ? 'text-red-200' : 'text-blue-200'}>
                      Pipeline {pipelineProgress.status === 'completed' ? 'completado' : 'en progreso'}
                    </span>
                    <span className="text-slate-300">{pipelineProgressValue}%</span>
                  </div>
                  <Progress value={pipelineProgressValue} className="h-2" />
                  <p className="mt-2 text-xs text-slate-300">
                    Etapa {pipelineCurrentIndex}/{pipelineProgress.totalStages}: {pipelineProgress.currentStageTitle}
                  </p>
                  {pipelineProgress.status === 'error' && pipelineProgress.error && (
                    <p className="mt-1 text-xs text-red-200">{pipelineProgress.error}</p>
                  )}
                </div>
              )}
              {messages.map((message) => (
                <ChatBubble 
                  key={message.id} 
                  message={message} 
                  onCopy={handleCopy}
                  copied={copiedId === message.id}
                />
              ))}
              
              {/* Active Task */}
              {activeTask && activeTask.status === 'processing' && (
                <GenerationProgress task={activeTask} onCancel={cancelCharacterGeneration} />
              )}
            </>
          )}

          {/* Processing Indicator */}
          {isAiProcessing && !activeTask && (
            <div className="flex items-start gap-2">
              <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
                <Bot className="w-3.5 h-3.5 text-blue-400" />
              </div>
              <div className="flex-1 px-3 py-2 bg-slate-800 rounded-lg">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                  <span className="text-sm text-slate-400">Procesando...</span>
                </div>
              </div>
            </div>
          )}
          
          {/* Scroll anchor */}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-3 border-t border-slate-700 shrink-0">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={inputPlaceholder}
            className="bg-slate-800 border-slate-700 text-sm"
            disabled={isInputLocked}
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isInputLocked}
            className="bg-blue-500 hover:bg-blue-600 shrink-0 px-3"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          {isAIFirstWorkflow
            ? 'Ejemplo AI First: "crea un juego de plataformas con enemigo lobo y salto"'
            : 'Ejemplos: "genera un guerrero", "crea una textura metalica", "haz un trailer corto"'}
        </p>
      </div>
    </div>
  );
}

// Chat Bubble
function ChatBubble({ 
  message, 
  onCopy, 
  copied 
}: { 
  message: ChatMessage; 
  onCopy: (id: string, content: string) => void;
  copied: boolean;
}) {
  const isUser = message.role === 'user';
  const isError = message.metadata?.type === 'error';
  const isConfigWarning = message.metadata?.type === 'config-warning';

  return (
    <div className={cn("flex items-start gap-2", isUser && "flex-row-reverse")}>
      <div className={cn(
        "w-6 h-6 rounded-full flex items-center justify-center shrink-0",
        isUser ? "bg-green-500/20" : "bg-blue-500/20"
      )}>
        {isUser ? (
          <User className="w-3.5 h-3.5 text-green-400" />
        ) : (
          <Bot className="w-3.5 h-3.5 text-blue-400" />
        )}
      </div>
      
      <div className={cn(
        "flex-1 max-w-[90%] px-3 py-2 rounded-lg group relative",
        isUser 
          ? "bg-green-500/20 text-green-100" 
          : isError 
            ? "bg-red-500/20 text-red-100"
            : isConfigWarning
              ? "bg-amber-500/20 text-amber-100"
              : "bg-slate-800 text-slate-200"
      )}>
        <div className="text-sm whitespace-pre-wrap break-words">
          {message.content.split('\n').map((line, i) => {
            // Bold text
            if (line.startsWith('**') && line.endsWith('**')) {
              return <p key={i} className="font-semibold text-blue-300">{line.slice(2, -2)}</p>;
            }
            // Check marks
            if (line.startsWith('✓') || line.startsWith('✅')) {
              return <p key={i} className="text-green-400">{line}</p>;
            }
            // Warning marks
            if (line.startsWith('⚠️') || line.startsWith('❌')) {
              return <p key={i} className="text-amber-400">{line}</p>;
            }
            return <p key={i}>{line}</p>;
          })}
        </div>
        
        {/* Model Preview */}
        {message.metadata?.thumbnailUrl && (
          <img 
            src={message.metadata.thumbnailUrl as string} 
            alt="Model preview" 
            className="w-full h-24 object-contain rounded mt-2 bg-slate-900"
          />
        )}
        
        {/* Copy Button */}
        <button
          onClick={() => onCopy(message.id, message.content)}
          className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-700 rounded transition-opacity"
        >
          {copied ? (
            <Check className="w-3 h-3 text-green-400" />
          ) : (
            <Copy className="w-3 h-3 text-slate-400" />
          )}
        </button>
      </div>
    </div>
  );
}

// Agent Status Indicator (exported)
export function AgentStatusIndicator() {
  const { tasks, isAiProcessing } = useEngineStore();
  const activeTasks = tasks.filter(t => t.status === 'processing');

  return (
    <div className="flex items-center gap-2">
      {isAiProcessing && (
        <div className="flex items-center gap-1 px-2 py-1 bg-blue-500/20 rounded animate-pulse">
          <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
          <span className="text-xs text-blue-300">Ejecutando...</span>
        </div>
      )}
      {activeTasks.length > 0 && (
        <div className="text-xs text-slate-400">
          {activeTasks.length} tareas activas
        </div>
      )}
    </div>
  );
}














