'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useActiveScene, useEngineStore } from '@/store/editorStore';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import {
  DEFAULT_EDITOR_PROJECT_SAVE_SLOT,
  createEditorProjectSaveData,
  createLoadedEditorProjectPatch,
  getEditorProjectSaveSummary,
  isEditorProjectSaveData,
  loadEditorProjectFromSlot,
  restoreEditorProjectSaveData,
  saveEditorProjectToSlot,
} from '@/engine/serialization';
import {
  fetchRemoteEditorProjectSave,
  fetchRemoteEditorProjectSummary,
  saveRemoteEditorProject,
} from './editorProjectClient';
import { requestEditorSessionBridgeSync } from './useEditorSessionBridge';
import {
  Boxes,
  Bot,
  Brush,
  CloudDownload,
  CloudUpload,
  Download,
  FolderKanban,
  Globe,
  Save,
  ScrollText,
  ShieldCheck,
  SquareTerminal,
  Cuboid,
  Puzzle,
  Wrench,
} from 'lucide-react';
import type {
  BottomDockTabId,
  EditorWorkspaceId,
  LeftDockTabId,
  RightPanelId,
} from './shell/workspaceDefinitions';

interface ProjectOverviewPanelProps {
  onSelectLeftTab: (tab: LeftDockTabId) => void;
  onSelectWorkspace: (workspace: EditorWorkspaceId) => void;
  onOpenRightPanel: (panel: RightPanelId) => void;
  onOpenBottomTab: (tab: BottomDockTabId) => void;
  showAdvancedTools?: boolean;
  activeWorkspace: EditorWorkspaceId;
  adminHref?: string | null;
}

export function ProjectOverviewPanel({
  onSelectLeftTab,
  onSelectWorkspace,
  onOpenRightPanel,
  onOpenBottomTab,
  showAdvancedTools = false,
  activeWorkspace,
  adminHref = null,
}: ProjectOverviewPanelProps) {
  const {
    projectName,
    isDirty,
    scenes,
    assets,
    entities,
    engineMode,
    automationPermissions,
  } = useEngineStore();
  const activeScene = useActiveScene();
  const [savePending, setSavePending] = useState(false);
  const [loadPending, setLoadPending] = useState(false);
  const [remoteSavePending, setRemoteSavePending] = useState(false);
  const [remoteLoadPending, setRemoteLoadPending] = useState(false);
  const [lastLocalSaveSummary, setLastLocalSaveSummary] = useState(() =>
    getEditorProjectSaveSummary(DEFAULT_EDITOR_PROJECT_SAVE_SLOT)
  );
  const [lastRemoteSaveSummary, setLastRemoteSaveSummary] = useState<ReturnType<
    typeof getEditorProjectSaveSummary
  > | null>(null);

  const enabledAutomations = Object.values(automationPermissions).filter(
    (permission) => permission.allowed
  ).length;

  useEffect(() => {
    setLastLocalSaveSummary(getEditorProjectSaveSummary(DEFAULT_EDITOR_PROJECT_SAVE_SLOT));
  }, [projectName, scenes.length, assets.length, entities.size]);

  useEffect(() => {
    if (!showAdvancedTools) {
      setLastRemoteSaveSummary(null);
      return;
    }

    let cancelled = false;
    const loadRemoteSummary = async () => {
      const { response, payload } = await fetchRemoteEditorProjectSummary({
        projectName,
      }).catch(() => ({
        response: null,
        payload: null,
      }));

      if (cancelled || !response?.ok || !payload?.active) {
        if (!cancelled) {
          setLastRemoteSaveSummary(null);
        }
        return;
      }

      setLastRemoteSaveSummary(payload.summary ?? null);
    };

    void loadRemoteSummary();

    return () => {
      cancelled = true;
    };
  }, [projectName, showAdvancedTools]);

  const handleProjectSave = async () => {
    setSavePending(true);
    try {
      const state = useEngineStore.getState();
      const saved = saveEditorProjectToSlot(DEFAULT_EDITOR_PROJECT_SAVE_SLOT, state, {
        markClean: true,
      });
      if (!saved) {
        toast({
          title: 'No se pudo guardar el proyecto',
          description: 'El save local no pudo persistirse en este navegador.',
          variant: 'destructive',
        });
        return;
      }

      useEngineStore.setState({ isDirty: false });
      requestEditorSessionBridgeSync();
      const summary = getEditorProjectSaveSummary(DEFAULT_EDITOR_PROJECT_SAVE_SLOT);
      setLastLocalSaveSummary(summary);
      toast({
        title: 'Proyecto guardado',
        description: summary
          ? `${summary.sceneCount} escenas, ${summary.entityCount} entidades y ${summary.assetCount} assets persistidos localmente.`
          : 'El estado actual del proyecto quedó guardado localmente.',
      });
    } finally {
      setSavePending(false);
    }
  };

  const handleProjectLoad = async () => {
    setLoadPending(true);
    try {
      const restored = loadEditorProjectFromSlot(DEFAULT_EDITOR_PROJECT_SAVE_SLOT);
      if (!restored) {
        toast({
          title: 'No hay save local para restaurar',
          description: 'Primero guarda el proyecto en este navegador.',
          variant: 'destructive',
        });
        return;
      }

      useEngineStore.setState((state) => ({
        ...state,
        ...createLoadedEditorProjectPatch(restored),
      }));
      requestEditorSessionBridgeSync();
      const summary = getEditorProjectSaveSummary(DEFAULT_EDITOR_PROJECT_SAVE_SLOT);
      setLastLocalSaveSummary(summary);
      toast({
        title: 'Proyecto restaurado',
        description: summary
          ? `Se cargó ${summary.projectName} desde el save local más reciente.`
          : 'Se restauró el save local del proyecto.',
      });
    } finally {
      setLoadPending(false);
    }
  };

  const handleRemoteProjectSave = async () => {
    setRemoteSavePending(true);
    try {
      const state = useEngineStore.getState();
      const saveData = createEditorProjectSaveData(state, { markClean: true });
      const { response, payload } = await saveRemoteEditorProject({
        projectName,
        saveData,
      });

      if (!response.ok) {
        toast({
          title: 'No se pudo guardar en backend',
          description: payload.error || 'El save remoto del proyecto no pudo persistirse.',
          variant: 'destructive',
        });
        return;
      }

      useEngineStore.setState({ isDirty: false });
      requestEditorSessionBridgeSync();
      setLastRemoteSaveSummary(payload.summary ?? null);
      toast({
        title: 'Proyecto guardado en backend',
        description: payload.summary
          ? `${payload.summary.sceneCount} escenas y ${payload.summary.assetCount} assets persistidos remotamente.`
          : 'El proyecto quedó persistido en backend.',
      });
    } finally {
      setRemoteSavePending(false);
    }
  };

  const handleRemoteProjectLoad = async () => {
    setRemoteLoadPending(true);
    try {
      const { response, payload } = await fetchRemoteEditorProjectSave({
        projectName,
      });

      if (!response.ok || !payload.active || !isEditorProjectSaveData(payload.saveData)) {
        toast({
          title: 'No hay save remoto para restaurar',
          description: payload.error || 'Primero guarda el proyecto en backend.',
          variant: 'destructive',
        });
        return;
      }

      const restored = restoreEditorProjectSaveData(payload.saveData);
      if (!restored) {
        toast({
          title: 'No se pudo restaurar el save remoto',
          description: 'El backend devolvió un proyecto inválido.',
          variant: 'destructive',
        });
        return;
      }

      useEngineStore.setState((state) => ({
        ...state,
        ...createLoadedEditorProjectPatch(restored),
      }));
      requestEditorSessionBridgeSync();
      setLastRemoteSaveSummary(payload.summary ?? null);
      toast({
        title: 'Proyecto restaurado desde backend',
        description: payload.summary
          ? `Se cargó ${payload.summary.projectName} desde el save remoto.`
          : 'Se restauró el save remoto del proyecto.',
      });
    } finally {
      setRemoteLoadPending(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-slate-950">
      <div className="border-b border-slate-800 px-3 py-3">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-cyan-300">
          <FolderKanban className="h-4 w-4" />
          Project
        </div>
        <h3 className="mt-1 text-sm font-semibold text-slate-100">{projectName}</h3>
        <p className="mt-1 text-xs text-slate-500">
          {showAdvancedTools
            ? 'Vista ejecutiva para abrir rápidamente mundo, assets y herramientas del proyecto.'
            : 'Vista rápida para revisar el proyecto y saltar a las áreas principales.'}
        </p>
      </div>

      <div className="space-y-4 p-3 text-xs">
        <div className="grid gap-3 sm:grid-cols-2">
          <OverviewCard label="Project State" value={isDirty ? 'Dirty' : 'Clean'} />
          <OverviewCard label="Execution Mode" value={engineMode} />
          <OverviewCard label="Scenes" value={`${scenes.length}`} />
          <OverviewCard label="Entities" value={`${entities.size}`} />
          <OverviewCard label="Assets" value={`${assets.length}`} />
          <OverviewCard label="Automation" value={`${enabledAutomations} enabled`} />
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <div className="text-xs font-medium text-slate-100">Current context</div>
          <div className="mt-3 space-y-2 text-slate-400">
            <div>active scene: {activeScene?.name ?? 'Sin escena'}</div>
            <div>environment: {activeScene?.environment.skybox ?? 'preset default'}</div>
            <div>collections: {activeScene?.collections?.length ?? 0}</div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <div className="text-xs font-medium text-slate-100">Quick actions</div>
          <div className="mt-3 grid gap-2">
            <Button
              size="sm"
              variant="outline"
              className="justify-start"
              onClick={() => {
                onOpenRightPanel('ai');
                onOpenBottomTab('assistant');
              }}
            >
              <Bot className="mr-2 h-3.5 w-3.5" />
              Open AI Chat
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="justify-start"
              onClick={() => onOpenRightPanel('world')}
            >
              <Globe className="mr-2 h-3.5 w-3.5" />
              Open World Settings
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="justify-start"
              onClick={() => onSelectLeftTab('assets')}
            >
              <FolderKanban className="mr-2 h-3.5 w-3.5" />
              Open Asset Browser
            </Button>
            {showAdvancedTools && adminHref && (
              <Button size="sm" variant="outline" className="justify-start" asChild>
                <Link href={adminHref}>
                  <ShieldCheck className="mr-2 h-3.5 w-3.5" />
                  Open Admin
                </Link>
              </Button>
            )}
            {showAdvancedTools && (
              <Button
                size="sm"
                variant="outline"
                className="justify-start"
                onClick={() => {
                  onOpenRightPanel('build');
                  onOpenBottomTab('build');
                }}
              >
                <Boxes className="mr-2 h-3.5 w-3.5" />
                Open Build Center
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="justify-start"
              onClick={() => {
                onSelectWorkspace('scripting');
                onOpenRightPanel('addons');
              }}
            >
              <Puzzle className="mr-2 h-3.5 w-3.5" />
              Open Addon Manager
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <div className="text-xs font-medium text-slate-100">Project save</div>
          <p className="mt-1 text-[11px] text-slate-500">
            Guarda y restaura el snapshot completo del proyecto en el almacenamiento local del editor.
          </p>
          <div className="mt-2 text-[11px] text-slate-500">
            {lastLocalSaveSummary
              ? `ultimo save: ${new Date(lastLocalSaveSummary.timestamp).toLocaleString()} | ${lastLocalSaveSummary.projectName}`
              : 'sin save local persistido'}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Button
              size="sm"
              variant="outline"
              className="justify-start"
              onClick={() => void handleProjectSave()}
              disabled={savePending || loadPending}
            >
              <Save className="mr-2 h-3.5 w-3.5" />
              {savePending ? 'Saving...' : 'Save Project'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="justify-start"
              onClick={() => void handleProjectLoad()}
              disabled={savePending || loadPending}
            >
              <Download className="mr-2 h-3.5 w-3.5" />
              {loadPending ? 'Loading...' : 'Load Save'}
            </Button>
          </div>
        </div>

        {showAdvancedTools && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
            <div className="text-xs font-medium text-slate-100">Backend bridge</div>
            <p className="mt-1 text-[11px] text-slate-500">
              Guarda y restaura el proyecto completo contra el backend durable del editor.
            </p>
            <div className="mt-2 text-[11px] text-slate-500">
              {lastRemoteSaveSummary
                ? `ultimo save remoto: ${new Date(lastRemoteSaveSummary.timestamp).toLocaleString()} | ${lastRemoteSaveSummary.projectName}`
                : 'sin save remoto persistido'}
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Button
                size="sm"
                variant="outline"
                className="justify-start"
                onClick={() => void handleRemoteProjectSave()}
                disabled={savePending || loadPending || remoteSavePending || remoteLoadPending}
              >
                <CloudUpload className="mr-2 h-3.5 w-3.5" />
                {remoteSavePending ? 'Saving...' : 'Save To Backend'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="justify-start"
                onClick={() => void handleRemoteProjectLoad()}
                disabled={savePending || loadPending || remoteSavePending || remoteLoadPending}
              >
                <CloudDownload className="mr-2 h-3.5 w-3.5" />
                {remoteLoadPending ? 'Loading...' : 'Load From Backend'}
              </Button>
            </div>
          </div>
        )}

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <div className="text-xs font-medium text-slate-100">Workflows</div>
          <p className="mt-1 text-[11px] text-slate-500">
            Entradas directas a AI-first y a los flujos manuales para no buscar paneles.
          </p>
          <div className="mt-3 grid gap-2">
            <WorkspaceButton
              active={activeWorkspace === 'ai'}
              icon={Bot}
              label="Open AI Workspace"
              onClick={() => onSelectWorkspace('ai')}
            />
            <WorkspaceButton
              active={activeWorkspace === 'scene'}
              icon={Cuboid}
              label="Open Scene Workspace"
              onClick={() => onSelectWorkspace('scene')}
            />
            <WorkspaceButton
              active={activeWorkspace === 'modeling'}
              icon={Wrench}
              label="Open Modeling Workspace"
              onClick={() => onSelectWorkspace('modeling')}
            />
            <WorkspaceButton
              active={activeWorkspace === 'materials'}
              icon={Brush}
              label="Open Materials Workspace"
              onClick={() => onSelectWorkspace('materials')}
            />
            <WorkspaceButton
              active={activeWorkspace === 'scripting'}
              icon={ScrollText}
              label="Open Scripting Workspace"
              onClick={() => onSelectWorkspace('scripting')}
            />
            <Button
              size="sm"
              variant="outline"
              className="justify-start"
              onClick={() => onOpenBottomTab('console')}
            >
              <SquareTerminal className="mr-2 h-3.5 w-3.5" />
              Open Console
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function OverviewCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-base font-semibold text-slate-100">{value}</div>
    </div>
  );
}

function WorkspaceButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof Cuboid;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      size="sm"
      variant={active ? 'secondary' : 'outline'}
      className="justify-start"
      onClick={onClick}
    >
      <Icon className="mr-2 h-3.5 w-3.5" />
      {label}
    </Button>
  );
}
