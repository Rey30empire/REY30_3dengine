// ============================================
// Editor Layout - Unified Production Shell
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  Pause,
  Play,
  Search,
  Square,
  Sparkles,
  PanelBottomOpen,
  PanelBottomClose,
  ShieldCheck,
} from 'lucide-react';
import type { EngineWorkflowMode } from '@/types/engine';
import { Button } from '@/components/ui/button';
import {
  eventMatchesAnyShortcut,
  getEditorShortcutConfig,
  getPrimaryShortcutLabel,
  subscribeEditorShortcutConfig,
} from '@/lib/editor-shortcuts';
import { cn } from '@/lib/utils';
import { loadClientAuthSession } from '@/lib/client-auth-session';
import { installCsrfFetchInterceptor } from '@/lib/security/csrf-client';
import {
  getUILanguageConfig,
  subscribeUILanguageConfig,
  type UILanguageConfig,
} from '@/lib/ui-language-config';
import { useEngineStore } from '@/store/editorStore';
import { consoleManager } from './ConsolePanel';
import { isCharacterBuilderSceneEntity } from './characterBuilderSceneSync';
import { useEditorSessionBridge } from './useEditorSessionBridge';
import { shouldUseServerAgenticExecution } from './ai/agenticCommandBridge';
import { requestAgenticMutationIndexStatus } from './ai/requestClient';
import {
  AGENTIC_MUTATION_INDEX_AUDIT_EVENT,
  AGENTIC_SERVER_EXECUTION_PREFERENCE_EVENT,
  type AgenticMutationIndexAuditEvent,
  type AgenticServerExecutionPreferenceEvent,
} from './ai/agenticMutationIndexEvents';
import { EditorCommandPalette } from './shell/EditorCommandPalette';
import { EditorStatusBar } from './shell/EditorStatusBar';
import { WorkspaceHost } from './shell/WorkspaceHost';
import { WorkspaceSwitcher } from './shell/WorkspaceSwitcher';
import { useEditorWorkspaceShellState } from './shell/useEditorWorkspaceShellState';
import {
  resolveEditorAccessFromSessionPayload,
} from './shell/editorShellAccess';
import {
  type EditorShellMode,
  type RightPanelId,
} from './shell/workspaceDefinitions';

function EngineModePicker({
  engineMode,
  onChange,
}: {
  engineMode: EngineWorkflowMode;
  onChange: (mode: EngineWorkflowMode) => void;
}) {
  const modes: Array<{ id: EngineWorkflowMode; label: string; subtitle: string }> = [
    { id: 'MODE_MANUAL', label: 'Manual', subtitle: 'control total' },
    { id: 'MODE_HYBRID', label: 'Hybrid', subtitle: 'IA + usuario' },
    { id: 'MODE_AI_FIRST', label: 'AI', subtitle: 'prompt first' },
  ];

  return (
    <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900/70 p-1">
      {modes.map((mode) => (
        <Button
          key={mode.id}
          type="button"
          variant={engineMode === mode.id ? 'secondary' : 'ghost'}
          size="sm"
          className={cn(
            'h-8 rounded-md px-3 text-xs',
            engineMode === mode.id
              ? 'bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/25'
              : 'text-slate-400 hover:text-slate-100'
          )}
          onClick={() => onChange(mode.id)}
          title={mode.subtitle}
        >
          {mode.label}
        </Button>
      ))}
    </div>
  );
}

function AgenticShellMutationIndexIndicator({
  projectName,
  onOpenChat,
}: {
  projectName: string;
  onOpenChat: () => void;
}) {
  const [serverExecutionEnabled, setServerExecutionEnabled] = useState(false);
  const auditSummary = useEngineStore((state) => state.agenticMutationIndexAudit);
  const setAgenticMutationIndexAudit = useEngineStore(
    (state) => state.setAgenticMutationIndexAudit
  );

  const refreshAuditSummary = useCallback(async () => {
    const enabled = shouldUseServerAgenticExecution();
    setServerExecutionEnabled(enabled);
    if (!enabled) {
      setAgenticMutationIndexAudit(null);
      return;
    }

    try {
      const { response, data } = await requestAgenticMutationIndexStatus({
        projectName: projectName || 'untitled_project',
      });
      if (response.ok && data.success !== false) {
        setAgenticMutationIndexAudit(
          data.mutationIndexAudit
            ? {
                ...data.mutationIndexAudit,
                checkedAt: data.checkedAt ?? null,
              }
            : null
        );
      }
    } catch {
      // The shell indicator is advisory; auth/network failures should not block the editor.
    }
  }, [projectName, setAgenticMutationIndexAudit]);

  useEffect(() => {
    void refreshAuditSummary();

    const handlePreference = (event: Event) => {
      const customEvent = event as AgenticServerExecutionPreferenceEvent;
      setServerExecutionEnabled(customEvent.detail.enabled);
      if (customEvent.detail.enabled) {
        void refreshAuditSummary();
      } else {
        setAgenticMutationIndexAudit(null);
      }
    };
    const handleAudit = (event: Event) => {
      const customEvent = event as AgenticMutationIndexAuditEvent;
      setAgenticMutationIndexAudit(customEvent.detail.summary);
    };
    const handleFocus = () => {
      void refreshAuditSummary();
    };
    const interval = window.setInterval(() => {
      void refreshAuditSummary();
    }, 15_000);

    window.addEventListener(AGENTIC_SERVER_EXECUTION_PREFERENCE_EVENT, handlePreference);
    window.addEventListener(AGENTIC_MUTATION_INDEX_AUDIT_EVENT, handleAudit);
    window.addEventListener('focus', handleFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener(AGENTIC_SERVER_EXECUTION_PREFERENCE_EVENT, handlePreference);
      window.removeEventListener(AGENTIC_MUTATION_INDEX_AUDIT_EVENT, handleAudit);
      window.removeEventListener('focus', handleFocus);
    };
  }, [refreshAuditSummary, setAgenticMutationIndexAudit]);

  const status = auditSummary?.indexBehind
    ? 'behind'
    : (auditSummary?.integrityStatus ?? null);
  if (!serverExecutionEnabled || (status !== 'mismatch' && status !== 'missing' && status !== 'behind')) {
    return null;
  }

  return (
    <Button
      size="sm"
      variant="outline"
      className={cn(
        'border px-2 text-[11px] font-medium',
        status === 'mismatch'
          ? 'border-red-400/50 bg-red-950/50 text-red-100 hover:bg-red-950/70'
          : status === 'missing'
            ? 'border-amber-300/50 bg-amber-950/50 text-amber-100 hover:bg-amber-950/70'
            : 'border-orange-300/50 bg-orange-950/50 text-orange-100 hover:bg-orange-950/70'
      )}
      onClick={onOpenChat}
      title={
        status === 'behind'
          ? `Índice agentic atrasado: ${auditSummary?.pendingIndexableExecutionCount ?? 0} ejecución(es) aprobadas pendientes de indexar.`
          : 'Índice agentic corrupto, incompleto o atrasado. Abre AI Chat para ver auditoría, reparación o reindexado.'
      }
      data-testid="agentic-shell-mutation-index-integrity-alert"
    >
      <AlertTriangle className="mr-1 h-3.5 w-3.5" />
      Índice {status === 'behind' ? 'atrasado' : status}
    </Button>
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
    assets,
    projectName,
    isDirty,
  } = useEngineStore();
  const [uiLanguageConfig, setUiLanguageConfig] = useState<UILanguageConfig>(() =>
    getUILanguageConfig()
  );
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [shortcutConfig, setShortcutConfig] = useState(() => getEditorShortcutConfig());
  const assistantSurfaceAutoOpenRef = useRef<EngineWorkflowMode | null>(null);
  const [editorAccess, setEditorAccess] = useState(() =>
    resolveEditorAccessFromSessionPayload(null)
  );
  const [sessionResolved, setSessionResolved] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadSession = async () => {
      const payload = await loadClientAuthSession();
      if (cancelled) return;

      setEditorAccess(resolveEditorAccessFromSessionPayload(payload));
      setSessionResolved(true);
    };

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const shellMode = useMemo<EditorShellMode>(() => editorAccess.shellMode, [editorAccess]);
  const showAdvancedSurface = shellMode === 'advanced';
  const canAccessAdminSurface = editorAccess.permissions.admin;
  const canCompile = editorAccess.permissions.compile;
  const editorSessionBridgeEnabled =
    sessionResolved && editorAccess.permissions.editorSessionBridge;

  useEditorSessionBridge({
    enabled: editorSessionBridgeEnabled,
    projectName,
  });

  const activeSceneName = useMemo(
    () => scenes.find((scene) => scene.id === activeSceneId)?.name || 'Sin escena activa',
    [scenes, activeSceneId]
  );
  const selectedCharacterBuilderEntityId = useMemo(() => {
    if (editor.selectedEntities.length !== 1) return null;
    const selectedEntity = entities.get(editor.selectedEntities[0]);
    return selectedEntity && isCharacterBuilderSceneEntity(selectedEntity)
      ? selectedEntity.id
      : null;
  }, [editor.selectedEntities, entities]);
  const {
    activeWorkspace,
    workspace,
    activeLeftTab,
    activeBottomTab,
    currentRightPanel,
    currentBottomTab,
    visibleWorkspaces,
    visibleRightPanels,
    visibleBottomDockTabs,
    bottomDockCollapsed,
    setActiveLeftTab,
    setActiveBottomTab,
    setBottomDockCollapsed,
    selectWorkspace,
    openRightPanel,
  } = useEditorWorkspaceShellState({
    shellMode,
    showAdvancedSurface,
    activePanel: activePanel as RightPanelId,
    setActivePanel,
    engineMode,
    selectedCharacterBuilderEntityId,
  });

  useEffect(() => {
    installCsrfFetchInterceptor();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeUILanguageConfig((config) =>
      setUiLanguageConfig(config)
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeEditorShortcutConfig((config) =>
      setShortcutConfig(config)
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!sessionResolved || showAdvancedSurface) return;
    if (engineMode !== 'MODE_AI_FIRST') {
      setEngineMode('MODE_AI_FIRST');
    }
  }, [engineMode, sessionResolved, setEngineMode, showAdvancedSurface]);

  const pickLabel = (
    kind: 'button' | 'action' | 'name' | 'label',
    english: string,
    spanish: string
  ) => {
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

  const engineModeLabel = useMemo(() => {
    if (engineMode === 'MODE_AI_FIRST') return 'AI';
    if (engineMode === 'MODE_HYBRID') return 'Hybrid';
    return 'Manual';
  }, [engineMode]);

  const commandPaletteShortcutLabel =
    getPrimaryShortcutLabel(shortcutConfig, 'shell.command_palette') ?? 'Ctrl/Cmd+K';
  const compileShortcutLabel =
    getPrimaryShortcutLabel(shortcutConfig, 'shell.compile') ?? 'Ctrl/Cmd+Shift+B';
  const bottomDockShortcutLabel =
    getPrimaryShortcutLabel(shortcutConfig, 'shell.toggle_bottom_dock') ?? '`';
  const aiWorkspaceShortcutLabel =
    getPrimaryShortcutLabel(shortcutConfig, 'workspace.ai') ?? 'Ctrl/Cmd+I';
  const workspaceShortcutLabels = useMemo(
    () => ({
      scene: getPrimaryShortcutLabel(shortcutConfig, 'workspace.scene'),
      ai: getPrimaryShortcutLabel(shortcutConfig, 'workspace.ai'),
      modeling: getPrimaryShortcutLabel(shortcutConfig, 'workspace.modeling'),
      materials: getPrimaryShortcutLabel(shortcutConfig, 'workspace.materials'),
      animation: getPrimaryShortcutLabel(shortcutConfig, 'workspace.animation'),
      scripting: getPrimaryShortcutLabel(shortcutConfig, 'workspace.scripting'),
      build: getPrimaryShortcutLabel(shortcutConfig, 'workspace.build'),
      debug: getPrimaryShortcutLabel(shortcutConfig, 'workspace.debug'),
    }),
    [shortcutConfig]
  );

  const openAISurface = useCallback(() => {
    if (engineMode === 'MODE_MANUAL') {
      setEngineMode('MODE_HYBRID');
    }
    selectWorkspace('ai', {
      leftTab: 'project',
      rightPanel: 'ai',
      bottomTab: 'assistant',
      bottomCollapsed: false,
    });
  }, [engineMode, selectWorkspace, setEngineMode]);

  function handleCompile() {
    if (!canCompile) return;
    const report = runReyPlayCompile();
    if (report.ok) {
      consoleManager.success(`Compile OK: ${report.summary}`);
    } else {
      consoleManager.warn(`Compile con diagnosticos: ${report.summary}`);
    }
    setActiveBottomTab('build');
    setBottomDockCollapsed(false);
  }

  useEffect(() => {
    const shouldAutoOpenAssistant =
      engineMode === 'MODE_AI_FIRST' || engineMode === 'MODE_HYBRID';

    if (!sessionResolved || !shouldAutoOpenAssistant) {
      assistantSurfaceAutoOpenRef.current = null;
      return;
    }

    if (assistantSurfaceAutoOpenRef.current === engineMode) return;
    assistantSurfaceAutoOpenRef.current = engineMode;

    selectWorkspace('ai', {
      leftTab: 'project',
      rightPanel: 'ai',
      bottomTab: 'assistant',
      bottomCollapsed: false,
    });
  }, [engineMode, selectWorkspace, sessionResolved]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;

      if (
        eventMatchesAnyShortcut(
          event,
          shortcutConfig['shell.command_palette'] ?? []
        )
      ) {
        event.preventDefault();
        setCommandPaletteOpen((current) => !current);
        return;
      }

      if (
        showAdvancedSurface &&
        eventMatchesAnyShortcut(event, shortcutConfig['shell.compile'] ?? [])
      ) {
        event.preventDefault();
        handleCompile();
        return;
      }

      if (typing) return;

      if (eventMatchesAnyShortcut(event, shortcutConfig['workspace.scene'] ?? [])) {
        event.preventDefault();
        selectWorkspace('scene');
        return;
      }

      if (eventMatchesAnyShortcut(event, shortcutConfig['workspace.ai'] ?? [])) {
        event.preventDefault();
        openAISurface();
        return;
      }

      if (eventMatchesAnyShortcut(event, shortcutConfig['workspace.modeling'] ?? [])) {
        event.preventDefault();
        selectWorkspace('modeling');
        return;
      }

      if (eventMatchesAnyShortcut(event, shortcutConfig['workspace.materials'] ?? [])) {
        event.preventDefault();
        selectWorkspace('materials');
        return;
      }

      if (eventMatchesAnyShortcut(event, shortcutConfig['workspace.animation'] ?? [])) {
        event.preventDefault();
        selectWorkspace('animation');
        return;
      }

      if (eventMatchesAnyShortcut(event, shortcutConfig['workspace.scripting'] ?? [])) {
        event.preventDefault();
        selectWorkspace('scripting');
        return;
      }

      if (
        showAdvancedSurface &&
        eventMatchesAnyShortcut(event, shortcutConfig['workspace.build'] ?? [])
      ) {
        event.preventDefault();
        selectWorkspace('build');
        return;
      }

      if (
        showAdvancedSurface &&
        eventMatchesAnyShortcut(event, shortcutConfig['workspace.debug'] ?? [])
      ) {
        event.preventDefault();
        selectWorkspace('debug');
        return;
      }

      if (
        eventMatchesAnyShortcut(
          event,
          shortcutConfig['shell.toggle_bottom_dock'] ?? []
        )
      ) {
        event.preventDefault();
        setBottomDockCollapsed((current) => !current);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    handleCompile,
    openAISurface,
    selectWorkspace,
    setBottomDockCollapsed,
    shortcutConfig,
    showAdvancedSurface,
  ]);

  const commandItems = useMemo(
    () =>
      [
      {
        id: 'workspace-scene',
        label: 'Ir a workspace Scene',
        section: 'Workspaces',
        shortcut: getPrimaryShortcutLabel(shortcutConfig, 'workspace.scene'),
        keywords: ['scene viewport hierarchy'],
        action: () => selectWorkspace('scene'),
      },
      {
        id: 'workspace-ai',
        label: 'Abrir AI Chat',
        section: 'Workspaces',
        shortcut: getPrimaryShortcutLabel(shortcutConfig, 'workspace.ai'),
        keywords: ['ai chat assistant prompt herramientas validador'],
        action: openAISurface,
      },
      {
        id: 'workspace-modeling',
        label: 'Ir a workspace Modeling',
        section: 'Workspaces',
        shortcut: getPrimaryShortcutLabel(shortcutConfig, 'workspace.modeling'),
        keywords: ['model sculpt paint'],
        action: () => selectWorkspace('modeling'),
      },
      {
        id: 'workspace-materials',
        label: 'Ir a workspace Materials',
        section: 'Workspaces',
        shortcut: getPrimaryShortcutLabel(shortcutConfig, 'workspace.materials'),
        keywords: ['material shader texture'],
        action: () => selectWorkspace('materials'),
      },
      {
        id: 'workspace-animation',
        label: 'Ir a workspace Animation',
        section: 'Workspaces',
        shortcut: getPrimaryShortcutLabel(shortcutConfig, 'workspace.animation'),
        keywords: ['timeline rig dope sheet'],
        action: () => selectWorkspace('animation'),
      },
      {
        id: 'workspace-scripting',
        label: 'Ir a workspace Scripting',
        section: 'Workspaces',
        shortcut: getPrimaryShortcutLabel(shortcutConfig, 'workspace.scripting'),
        keywords: ['scrib ai scripts'],
        action: () => selectWorkspace('scripting'),
      },
      {
        id: 'workspace-build',
        label: 'Ir a workspace Build',
        section: 'Workspaces',
        shortcut: getPrimaryShortcutLabel(shortcutConfig, 'workspace.build'),
        keywords: ['compile export package'],
        action: () => selectWorkspace('build'),
      },
      {
        id: 'workspace-debug',
        label: 'Ir a workspace Debug',
        section: 'Workspaces',
        shortcut: getPrimaryShortcutLabel(shortcutConfig, 'workspace.debug'),
        keywords: ['console profiler debug'],
        action: () => selectWorkspace('debug'),
      },
      {
        id: 'left-scene',
        label: 'Abrir panel izquierdo Scene',
        section: 'Panels',
        keywords: ['hierarchy outliner'],
        action: () => setActiveLeftTab('scene'),
      },
      {
        id: 'left-assets',
        label: 'Abrir panel izquierdo Assets',
        section: 'Panels',
        keywords: ['library browser files'],
        action: () => setActiveLeftTab('assets'),
      },
      {
        id: 'left-project',
        label: 'Abrir panel izquierdo Project',
        section: 'Panels',
        keywords: ['project overview settings'],
        action: () => setActiveLeftTab('project'),
      },
      {
        id: 'panel-inspector',
        label: 'Abrir Inspector',
        section: 'Panels',
        keywords: ['object components'],
        action: () => openRightPanel('inspector'),
      },
      {
        id: 'panel-world',
        label: 'Abrir World Settings',
        section: 'Panels',
        keywords: ['environment lighting'],
        action: () => openRightPanel('world'),
      },
      {
        id: 'panel-character',
        label: 'Abrir Character Workspace',
        section: 'Panels',
        keywords: ['modular character builder'],
        action: () => openRightPanel('character'),
      },
      {
        id: 'open-admin',
        label: 'Abrir Admin',
        section: 'Actions',
        keywords: ['settings credentials security admin'],
        action: () => window.location.assign('/admin'),
      },
      {
        id: 'bottom-console',
        label: 'Abrir Bottom Dock Console',
        section: 'Bottom Dock',
        keywords: ['logs output'],
        action: () => {
          setActiveBottomTab('console');
          setBottomDockCollapsed(false);
        },
      },
      {
        id: 'bottom-timeline',
        label: 'Abrir Bottom Dock Timeline',
        section: 'Bottom Dock',
        keywords: ['animation timeline dope sheet'],
        action: () => {
          setActiveBottomTab('timeline');
          setBottomDockCollapsed(false);
        },
      },
      {
        id: 'bottom-build',
        label: 'Abrir Bottom Dock Build',
        section: 'Bottom Dock',
        keywords: ['revision build avisos escena'],
        action: () => {
          setActiveBottomTab('build');
          setBottomDockCollapsed(false);
        },
      },
      {
        id: 'bottom-profiler',
        label: 'Abrir Bottom Dock Profiler',
        section: 'Bottom Dock',
        keywords: ['fps telemetry'],
        action: () => {
          setActiveBottomTab('profiler');
          setBottomDockCollapsed(false);
        },
      },
      {
        id: 'bottom-assistant',
        label: 'Abrir Bottom Dock Assistant',
        section: 'Bottom Dock',
        keywords: ['ai chat assistant'],
        action: () => {
          if (engineMode === 'MODE_MANUAL') {
            setEngineMode('MODE_HYBRID');
          }
          setActiveBottomTab('assistant');
          setBottomDockCollapsed(false);
        },
      },
      {
        id: 'compile',
        label: 'Compilar proyecto',
        section: 'Actions',
        shortcut: getPrimaryShortcutLabel(shortcutConfig, 'shell.compile'),
        keywords: ['build compile export'],
        action: handleCompile,
      },
      {
        id: 'play',
        label: 'Poner runtime en Play',
        section: 'Actions',
        shortcut: 'Play',
        keywords: ['run preview'],
        action: () => setPlayRuntimeState('PLAYING'),
      },
      {
        id: 'pause',
        label: 'Pausar runtime',
        section: 'Actions',
        shortcut: 'Pause',
        keywords: ['pause runtime'],
        action: () => setPlayRuntimeState('PAUSED'),
      },
      {
        id: 'stop',
        label: 'Detener runtime',
        section: 'Actions',
        shortcut: 'Stop',
        keywords: ['stop runtime'],
        action: () => setPlayRuntimeState('IDLE'),
      },
      {
        id: 'toggle-bottom-dock',
        label: 'Alternar Bottom Dock',
        section: 'Actions',
        shortcut: getPrimaryShortcutLabel(shortcutConfig, 'shell.toggle_bottom_dock'),
        keywords: ['bottom dock console'],
        action: () => setBottomDockCollapsed((current) => !current),
      },
    ].filter((item) => {
      if (showAdvancedSurface) return true;
      return ![
        'workspace-build',
        'workspace-debug',
        'open-admin',
        'bottom-build',
        'bottom-profiler',
        'compile',
      ].includes(item.id);
    }),
    [
      engineMode,
      handleCompile,
      openAISurface,
      openRightPanel,
      selectWorkspace,
      setActiveBottomTab,
      setActiveLeftTab,
      setBottomDockCollapsed,
      setEngineMode,
      setPlayRuntimeState,
      showAdvancedSurface,
      shortcutConfig,
    ]
  );

  return (
    <div className="flex h-screen flex-col bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950 px-3 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-cyan-300" />
              <span className="text-sm font-semibold text-slate-100">REY30 Editor</span>
              <span className="rounded-full border border-slate-800 bg-slate-900 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">
                {projectName}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              <span>{workspace.subtitle}</span>
              <span>•</span>
              <span>{isDirty ? 'Proyecto con cambios' : 'Proyecto limpio'}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <AgenticShellMutationIndexIndicator
              projectName={projectName}
              onOpenChat={openAISurface}
            />
            <Button
              size="sm"
              variant={workspace.id === 'ai' ? 'secondary' : 'outline'}
              onClick={openAISurface}
              title={`Abrir AI Chat · ${aiWorkspaceShortcutLabel}`}
              className={cn(
                workspace.id === 'ai'
                  ? 'border-cyan-400/30 bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/25'
                  : ''
              )}
            >
              <Bot className="mr-1 h-3.5 w-3.5" />
              AI Chat
            </Button>
            {showAdvancedSurface ? (
              <EngineModePicker engineMode={engineMode} onChange={setEngineMode} />
            ) : (
              <span className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-100">
                Asistente activo
              </span>
            )}
            {canAccessAdminSurface && (
              <Button size="sm" variant="outline" asChild>
                <Link href="/admin">
                  <ShieldCheck className="mr-1 h-3.5 w-3.5" />
                  Admin
                </Link>
              </Button>
            )}
            {canCompile && (
              <Button
                size="sm"
                variant="secondary"
                onClick={handleCompile}
                title={`Atajo: ${compileShortcutLabel}`}
              >
                {pickLabel('button', 'Compile', 'Compilar')}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPlayRuntimeState('PLAYING')}
            >
              <Play className="mr-1 h-3.5 w-3.5" />
              {pickLabel('button', 'Play', 'Jugar')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPlayRuntimeState('PAUSED')}
            >
              <Pause className="mr-1 h-3.5 w-3.5" />
              {pickLabel('button', 'Pause', 'Pausar')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPlayRuntimeState('IDLE')}
            >
              <Square className="mr-1 h-3.5 w-3.5" />
              {pickLabel('button', 'Stop', 'Detener')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setCommandPaletteOpen(true)}
              title={`Abrir command palette · ${commandPaletteShortcutLabel}`}
            >
              <Search className="mr-1 h-4 w-4" />
              {commandPaletteShortcutLabel}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setBottomDockCollapsed((current) => !current)}
              title={`${
                bottomDockCollapsed ? 'Expandir bottom dock' : 'Colapsar bottom dock'
              } · ${bottomDockShortcutLabel}`}
            >
              {bottomDockCollapsed ? (
                <PanelBottomOpen className="h-4 w-4" />
              ) : (
                <PanelBottomClose className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        <div className="mt-3">
          <WorkspaceSwitcher
            activeWorkspace={workspace.id}
            onChange={selectWorkspace}
            shortcutLabels={workspaceShortcutLabels}
            workspaces={visibleWorkspaces}
          />
        </div>
      </header>

      <main className="min-h-0 flex-1 p-2">
        <WorkspaceHost
          workspace={workspace}
          activeWorkspace={activeWorkspace}
          activeLeftTab={activeLeftTab}
          currentRightPanel={currentRightPanel}
          currentBottomTab={currentBottomTab}
          visibleRightPanels={visibleRightPanels}
          visibleBottomDockTabs={visibleBottomDockTabs}
          bottomDockCollapsed={bottomDockCollapsed}
          setActiveLeftTab={setActiveLeftTab}
          setActivePanel={setActivePanel}
          setActiveBottomTab={setActiveBottomTab}
          setBottomDockCollapsed={setBottomDockCollapsed}
          selectWorkspace={selectWorkspace}
          showAdvancedSurface={showAdvancedSurface}
          canAccessAdminSurface={canAccessAdminSurface}
          openRightPanel={openRightPanel}
        />
      </main>

      <EditorStatusBar
        workspace={workspace.id}
        engineModeLabel={engineModeLabel}
        runtimeState={playRuntimeState}
        sceneName={activeSceneName}
        entityCount={entities.size}
        selectionCount={editor.selectedEntities.length}
        assetCount={assets.length}
        isDirty={isDirty}
        lastBuildReport={lastBuildReport}
        showBuildStatus={showAdvancedSurface}
      />

      <EditorCommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        commands={commandItems}
      />
    </div>
  );
}
