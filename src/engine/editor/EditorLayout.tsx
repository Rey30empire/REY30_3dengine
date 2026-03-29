// ============================================
// Editor Layout - Mode Router Shell
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { SceneView } from './SceneView';
import { HierarchyPanel } from './HierarchyPanel';
import { InspectorPanel } from './InspectorPanel';
import { AIChatPanel } from './AIChatPanel';
import { AssetBrowserPanel } from './AssetBrowserPanel';
import { SettingsPanel } from './SettingsPanel';
import { HybridSceneSystemPanel } from './HybridSceneSystemPanel';
import { ScriptWorkspacePanel } from './ScriptWorkspacePanel';
import { ConsolePanel, consoleManager } from './ConsolePanel';
import { WorldSettingsPanel } from './WorldSettingsPanel';
import { ModelerPanel } from './ModelerPanel';
import { PaintPanel } from './PaintPanel';
import { AnimationEditor } from './AnimationEditor';
import { CharacterWorkspacePanel } from './CharacterWorkspacePanel';
import { MaterialEditor } from './MaterialEditor';
import { CompositorVideoPanel } from './CompositorVideoPanel';
import { isCharacterBuilderSceneEntity } from './characterBuilderSceneSync';
import { useEngineStore } from '@/store/editorStore';
import { Button } from '@/components/ui/button';
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
} from 'react-resizable-panels';
import {
  Bot,
  Boxes,
  Play,
  Pause,
  Square,
  Sparkles,
  Wrench,
} from 'lucide-react';
import type { EngineWorkflowMode } from '@/types/engine';
import { cn } from '@/lib/utils';
import { installCsrfFetchInterceptor } from '@/lib/security/csrf-client';
import {
  getUILanguageConfig,
  subscribeUILanguageConfig,
  type UILanguageConfig,
} from '@/lib/ui-language-config';

type ManualTab =
  | 'inspector'
  | 'world'
  | 'compositor'
  | 'character'
  | 'model'
  | 'materials'
  | 'paint'
  | 'animation'
  | 'scrib'
  | 'assets'
  | 'config'
  | 'console';
type HybridTab =
  | 'hybrid'
  | 'world'
  | 'compositor'
  | 'character'
  | 'model'
  | 'materials'
  | 'paint'
  | 'animation'
  | 'scrib'
  | 'ai'
  | 'inspector'
  | 'config'
  | 'console';
type AITab = 'ai' | 'config';

const MANUAL_TABS: ManualTab[] = [
  'inspector',
  'world',
  'compositor',
  'character',
  'model',
  'materials',
  'paint',
  'animation',
  'scrib',
  'assets',
  'config',
  'console',
];

const HYBRID_TABS: HybridTab[] = [
  'hybrid',
  'world',
  'compositor',
  'character',
  'model',
  'materials',
  'paint',
  'animation',
  'scrib',
  'ai',
  'inspector',
  'config',
  'console',
];

const AI_TABS: AITab[] = ['ai', 'config'];

function resolveTabForMode<T extends string>(
  activePanel: string,
  allowedTabs: readonly T[],
  fallback: T
): T {
  return allowedTabs.includes(activePanel as T) ? (activePanel as T) : fallback;
}

function ResizeHandle() {
  return <PanelResizeHandle className="w-1 bg-slate-800 hover:bg-blue-500/50 transition-colors" />;
}

function PanelShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="h-full flex flex-col bg-slate-900 border border-slate-800">
      <div className="px-3 py-2 border-b border-slate-800 bg-slate-950/70">
        <p className="text-xs uppercase tracking-wide text-slate-400">{title}</p>
        {subtitle && <p className="text-[11px] text-slate-500 mt-1">{subtitle}</p>}
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}

function ModeButton({
  mode,
  title,
  description,
  active,
  onClick,
}: {
  mode: EngineWorkflowMode;
  title: string;
  description: string;
  active: boolean;
  onClick: (mode: EngineWorkflowMode) => void;
}) {
  return (
    <button
      onClick={() => onClick(mode)}
      className={cn(
        'flex items-center gap-2 rounded-md border px-3 py-2 text-left transition-colors',
        active
          ? 'border-blue-500/60 bg-blue-500/20 text-blue-100'
          : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500 hover:bg-slate-800'
      )}
    >
      {mode === 'MODE_MANUAL' && <Wrench className="h-4 w-4 shrink-0" />}
      {mode === 'MODE_HYBRID' && <Boxes className="h-4 w-4 shrink-0" />}
      {mode === 'MODE_AI_FIRST' && <Bot className="h-4 w-4 shrink-0" />}
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-[11px] text-slate-400">{description}</span>
      </span>
    </button>
  );
}

function ManualWorkspace({
  activePanel,
  setActivePanel,
}: {
  activePanel: string;
  setActivePanel: (panel: string) => void;
}) {
  const tab = resolveTabForMode(activePanel, MANUAL_TABS, 'inspector');

  return (
    <PanelGroup direction="horizontal" className="h-full">
      <Panel defaultSize={18} minSize={14} maxSize={28}>
        <PanelShell title="Scene Explorer" subtitle="Jerarquía y selección manual">
          <HierarchyPanel />
        </PanelShell>
      </Panel>

      <ResizeHandle />

      <Panel defaultSize={52} minSize={35}>
        <PanelShell title="Viewport" subtitle="Edición manual de escena y transform">
          <SceneView />
        </PanelShell>
      </Panel>

      <ResizeHandle />

      <Panel defaultSize={30} minSize={22}>
        <div className="h-full flex flex-col bg-slate-900 border border-slate-800">
          <div className="px-2 py-2 border-b border-slate-800 flex flex-wrap gap-1">
            <TabChip active={tab === 'inspector'} label="Inspector" onClick={() => setActivePanel('inspector')} />
            <TabChip active={tab === 'world'} label="World" onClick={() => setActivePanel('world')} />
            <TabChip active={tab === 'compositor'} label="Compositor" onClick={() => setActivePanel('compositor')} />
            <TabChip active={tab === 'character'} label="Character" onClick={() => setActivePanel('character')} />
            <TabChip active={tab === 'model'} label="Model" onClick={() => setActivePanel('model')} />
            <TabChip active={tab === 'materials'} label="Materials" onClick={() => setActivePanel('materials')} />
            <TabChip active={tab === 'paint'} label="Paint" onClick={() => setActivePanel('paint')} />
            <TabChip active={tab === 'animation'} label="Animation" onClick={() => setActivePanel('animation')} />
            <TabChip active={tab === 'scrib'} label="Scrib Studio" onClick={() => setActivePanel('scrib')} />
            <TabChip active={tab === 'assets'} label="Assets" onClick={() => setActivePanel('assets')} />
            <TabChip active={tab === 'config'} label="Config APIs" onClick={() => setActivePanel('config')} />
            <TabChip active={tab === 'console'} label="Console" onClick={() => setActivePanel('console')} />
          </div>

          <div className="flex-1 min-h-0">
            {tab === 'inspector' && <InspectorPanel />}
            {tab === 'world' && <WorldSettingsPanel />}
            {tab === 'compositor' && <CompositorVideoPanel />}
            {tab === 'character' && <CharacterWorkspacePanel />}
            {tab === 'model' && <ModelerPanel />}
            {tab === 'materials' && <MaterialEditor />}
            {tab === 'paint' && <PaintPanel />}
            {tab === 'animation' && <AnimationEditor />}
            {tab === 'scrib' && <ScriptWorkspacePanel />}
            {tab === 'assets' && <AssetBrowserPanel />}
            {tab === 'config' && <SettingsPanel />}
            {tab === 'console' && <ConsolePanel />}
          </div>
        </div>
      </Panel>
    </PanelGroup>
  );
}

function HybridWorkspace({
  activePanel,
  setActivePanel,
}: {
  activePanel: string;
  setActivePanel: (panel: string) => void;
}) {
  const tab = resolveTabForMode(activePanel, HYBRID_TABS, 'hybrid');

  return (
    <PanelGroup direction="horizontal" className="h-full">
      <Panel defaultSize={16} minSize={12} maxSize={24}>
        <PanelShell title="Scene Explorer" subtitle="Selecciona entidades para iterar con IA">
          <HierarchyPanel />
        </PanelShell>
      </Panel>

      <ResizeHandle />

      <Panel defaultSize={49} minSize={34}>
        <PanelShell title="Viewport" subtitle="AI genera base, tú corriges en caliente">
          <SceneView />
        </PanelShell>
      </Panel>

      <ResizeHandle />

      <Panel defaultSize={35} minSize={24}>
        <div className="h-full flex flex-col bg-slate-900 border border-slate-800">
          <div className="px-2 py-2 border-b border-slate-800 flex flex-wrap gap-1">
            <TabChip active={tab === 'hybrid'} label="Hybrid" onClick={() => setActivePanel('hybrid')} />
            <TabChip active={tab === 'world'} label="World" onClick={() => setActivePanel('world')} />
            <TabChip active={tab === 'compositor'} label="Compositor" onClick={() => setActivePanel('compositor')} />
            <TabChip active={tab === 'character'} label="Character" onClick={() => setActivePanel('character')} />
            <TabChip active={tab === 'model'} label="Model" onClick={() => setActivePanel('model')} />
            <TabChip active={tab === 'materials'} label="Materials" onClick={() => setActivePanel('materials')} />
            <TabChip active={tab === 'paint'} label="Paint" onClick={() => setActivePanel('paint')} />
            <TabChip active={tab === 'animation'} label="Animation" onClick={() => setActivePanel('animation')} />
            <TabChip active={tab === 'scrib'} label="Scrib Studio" onClick={() => setActivePanel('scrib')} />
            <TabChip active={tab === 'ai'} label="AI Chat" onClick={() => setActivePanel('ai')} />
            <TabChip active={tab === 'inspector'} label="Inspector" onClick={() => setActivePanel('inspector')} />
            <TabChip active={tab === 'config'} label="Config APIs" onClick={() => setActivePanel('config')} />
            <TabChip active={tab === 'console'} label="Console" onClick={() => setActivePanel('console')} />
          </div>

          <div className="flex-1 min-h-0">
            {tab === 'hybrid' && <HybridSceneSystemPanel />}
            {tab === 'world' && <WorldSettingsPanel />}
            {tab === 'compositor' && <CompositorVideoPanel />}
            {tab === 'character' && <CharacterWorkspacePanel />}
            {tab === 'model' && <ModelerPanel />}
            {tab === 'materials' && <MaterialEditor />}
            {tab === 'paint' && <PaintPanel />}
            {tab === 'animation' && <AnimationEditor />}
            {tab === 'scrib' && <ScriptWorkspacePanel />}
            {tab === 'ai' && <AIChatPanel />}
            {tab === 'inspector' && <InspectorPanel />}
            {tab === 'config' && <SettingsPanel />}
            {tab === 'console' && <ConsolePanel />}
          </div>
        </div>
      </Panel>
    </PanelGroup>
  );
}

function AIFirstWorkspace({
  activePanel,
  setActivePanel,
}: {
  activePanel: string;
  setActivePanel: (panel: string) => void;
}) {
  const tab = resolveTabForMode(activePanel, AI_TABS, 'ai');

  return (
    <PanelGroup direction="horizontal" className="h-full">
      <Panel defaultSize={64} minSize={35}>
        <PanelGroup direction="vertical" className="h-full">
          <Panel defaultSize={74} minSize={40}>
            <PanelShell title="Viewport" subtitle="Resultado en vivo del pipeline automático">
              <SceneView />
            </PanelShell>
          </Panel>
          <PanelResizeHandle className="h-1 bg-slate-800 hover:bg-blue-500/50 transition-colors" />
          <Panel defaultSize={26} minSize={16}>
            <PanelShell title="Runtime Console" subtitle="Eventos del orquestador y del runtime">
              <ConsolePanel />
            </PanelShell>
          </Panel>
        </PanelGroup>
      </Panel>

      <ResizeHandle />

      <Panel defaultSize={36} minSize={24}>
        <div className="h-full flex flex-col bg-slate-900 border border-slate-800">
          <div className="px-2 py-2 border-b border-slate-800 flex flex-wrap gap-1">
            <TabChip active={tab === 'ai'} label="AI Chat" onClick={() => setActivePanel('ai')} />
            <TabChip active={tab === 'config'} label="Config APIs" onClick={() => setActivePanel('config')} />
          </div>
          <div className="flex-1 min-h-0">
            {tab === 'ai' && (
              <PanelShell title="AI Orchestrator" subtitle="En AI mode solo envías orden y la IA ejecuta pipeline">
                <AIChatPanel />
              </PanelShell>
            )}
            {tab === 'config' && <SettingsPanel />}
          </div>
        </div>
      </Panel>
    </PanelGroup>
  );
}

function TabChip({
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
      className={cn(
        'px-2 py-1 rounded text-xs transition-colors',
        active ? 'bg-blue-500/25 text-blue-200' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
      )}
    >
      {label}
    </button>
  );
}

export function EditorLayout() {
  const {
    engineMode,
    setEngineMode,
    activePanel,
    setActivePanel,
    runReyPlayCompile,
    setPlayRuntimeState,
    playRuntimeState,
    lastBuildReport,
    entities,
    editor,
    scenes,
    activeSceneId,
  } = useEngineStore();
  const [uiLanguageConfig, setUiLanguageConfig] = useState<UILanguageConfig>(() => getUILanguageConfig());
  const lastSelectionKeyRef = useRef('');

  const activeSceneName = useMemo(
    () => scenes.find((scene) => scene.id === activeSceneId)?.name || 'Sin escena activa',
    [scenes, activeSceneId]
  );
  const selectedCharacterBuilderEntityId = useMemo(() => {
    if (editor.selectedEntities.length !== 1) {
      return null;
    }

    const selectedEntity = entities.get(editor.selectedEntities[0]);
    return selectedEntity && isCharacterBuilderSceneEntity(selectedEntity)
      ? selectedEntity.id
      : null;
  }, [editor.selectedEntities, entities]);
  const selectionKey = useMemo(
    () => editor.selectedEntities.join('|'),
    [editor.selectedEntities]
  );

  useEffect(() => {
    installCsrfFetchInterceptor();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeUILanguageConfig((config) => setUiLanguageConfig(config));
    return unsubscribe;
  }, []);

  useEffect(() => {
    const nextPanel =
      engineMode === 'MODE_MANUAL'
        ? resolveTabForMode(activePanel, MANUAL_TABS, 'inspector')
        : engineMode === 'MODE_HYBRID'
          ? resolveTabForMode(activePanel, HYBRID_TABS, 'hybrid')
          : resolveTabForMode(activePanel, AI_TABS, 'ai');

    if (nextPanel !== activePanel) {
      setActivePanel(nextPanel);
    }
  }, [activePanel, engineMode, setActivePanel]);

  useEffect(() => {
    const selectionChanged = selectionKey !== lastSelectionKeyRef.current;
    lastSelectionKeyRef.current = selectionKey;

    if (!selectionChanged) return;
    if (engineMode === 'MODE_AI_FIRST') return;
    if (!selectedCharacterBuilderEntityId) return;
    if (activePanel === 'character') return;

    setActivePanel('character');
  }, [activePanel, engineMode, selectedCharacterBuilderEntityId, selectionKey, setActivePanel]);

  const pickLabel = (
    kind: 'button' | 'action' | 'name' | 'label',
    english: string,
    spanish: string
  ): string => {
    const isSpanish =
      uiLanguageConfig.language === 'spanish' ||
      (uiLanguageConfig.language === 'auto' &&
        typeof navigator !== 'undefined' &&
        navigator.language.toLowerCase().startsWith('es'));
    if (!isSpanish) return english;

    if (uiLanguageConfig.scope === 'buttons_actions' && kind !== 'button' && kind !== 'action') {
      return english;
    }
    if (uiLanguageConfig.scope === 'names_only' && kind !== 'name') {
      return english;
    }
    if (uiLanguageConfig.scope === 'labels_only' && kind !== 'label') {
      return english;
    }
    return spanish;
  };

  const renderAll = () => {
    const report = runReyPlayCompile();
    if (report.ok) {
      consoleManager.success(`Render All OK: ${report.summary}`);
    } else {
      consoleManager.warn(`Render All con diagnosticos: ${report.summary}`);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-3 py-2 bg-slate-950">
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-cyan-300" />
            <span className="text-sm font-semibold">REY30 Editor</span>
            <span className="text-xs text-slate-500">
              {pickLabel('label', 'Scrib Engine Shell', 'Shell de Scrib Engine')}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={renderAll}>
              {pickLabel('button', 'Render All', 'Renderizar Todo')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setPlayRuntimeState('PLAYING')}>
              <Play className="h-3.5 w-3.5 mr-1" />
              {pickLabel('button', 'Play', 'Jugar')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setPlayRuntimeState('PAUSED')}>
              <Pause className="h-3.5 w-3.5 mr-1" />
              {pickLabel('button', 'Pause', 'Pausar')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setPlayRuntimeState('IDLE')}>
              <Square className="h-3.5 w-3.5 mr-1" />
              {pickLabel('button', 'Stop', 'Detener')}
            </Button>
          </div>
        </div>

        <div className="mt-2 grid gap-2 md:grid-cols-3">
          <ModeButton
            mode="MODE_MANUAL"
            title={pickLabel('name', 'Manual', 'Manual')}
            description={pickLabel('label', 'Full editor + scrib control', 'Control total del editor y scribs')}
            active={engineMode === 'MODE_MANUAL'}
            onClick={setEngineMode}
          />
          <ModeButton
            mode="MODE_HYBRID"
            title={pickLabel('name', 'Hybrid', 'Híbrido')}
            description={pickLabel('label', 'AI builds base, user refines', 'IA crea base, usuario corrige y afina')}
            active={engineMode === 'MODE_HYBRID'}
            onClick={setEngineMode}
          />
          <ModeButton
            mode="MODE_AI_FIRST"
            title={pickLabel('name', 'AI', 'IA')}
            description={pickLabel('label', 'Prompt-only orchestration', 'Usuario da prompt, IA orquesta pipeline')}
            active={engineMode === 'MODE_AI_FIRST'}
            onClick={setEngineMode}
          />
        </div>
      </header>

      <main className="flex-1 min-h-0 p-2">
        {engineMode === 'MODE_MANUAL' && (
          <ManualWorkspace activePanel={activePanel} setActivePanel={setActivePanel} />
        )}
        {engineMode === 'MODE_HYBRID' && (
          <HybridWorkspace activePanel={activePanel} setActivePanel={setActivePanel} />
        )}
        {engineMode === 'MODE_AI_FIRST' && (
          <AIFirstWorkspace activePanel={activePanel} setActivePanel={setActivePanel} />
        )}
      </main>

      <footer className="border-t border-slate-800 px-3 py-1 text-xs text-slate-400 bg-slate-950 flex flex-wrap items-center gap-3">
        <span>{pickLabel('label', 'Mode', 'Modo')}: {engineMode}</span>
        <span>{pickLabel('label', 'Runtime', 'Runtime')}: {playRuntimeState}</span>
        <span>{pickLabel('label', 'Scene', 'Escena')}: {activeSceneName}</span>
        <span>{pickLabel('label', 'Entities', 'Entidades')}: {entities.size}</span>
        <span>{pickLabel('label', 'Selected', 'Seleccionadas')}: {editor.selectedEntities.length}</span>
        {lastBuildReport && (
          <span className={lastBuildReport.ok ? 'text-emerald-300' : 'text-amber-300'}>
            {pickLabel('label', 'Compile', 'Compilación')}: {lastBuildReport.summary}
          </span>
        )}
      </footer>
    </div>
  );
}
