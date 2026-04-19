'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { EngineWorkflowMode } from '@/types/engine';
import {
  EDITOR_WORKSPACES,
  getVisibleBottomDockTabs,
  getVisibleRightPanels,
  getVisibleWorkspaces,
  getWorkspaceDefinition,
  type BottomDockTabId,
  type EditorShellMode,
  type EditorWorkspaceDefinition,
  type EditorWorkspaceId,
  type LeftDockTabId,
  type RightPanelId,
} from './workspaceDefinitions';

function usePersistentState<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initialValue;
    const raw = window.localStorage.getItem(key);
    if (!raw) return initialValue;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue] as const;
}

export interface WorkspaceDockState {
  leftTab: LeftDockTabId;
  bottomTab: BottomDockTabId;
  rightPanel: RightPanelId;
  bottomCollapsed: boolean;
}

export type WorkspaceDockStateMap = Record<EditorWorkspaceId, WorkspaceDockState>;

export function createWorkspaceDockState(
  workspaceId: EditorWorkspaceId
): WorkspaceDockState {
  const definition = getWorkspaceDefinition(workspaceId);
  return {
    leftTab: definition.defaultLeftTab,
    bottomTab: definition.defaultBottomTab,
    rightPanel: definition.defaultRightPanel,
    bottomCollapsed: false,
  };
}

export function createWorkspaceDockStateMap(): WorkspaceDockStateMap {
  return EDITOR_WORKSPACES.reduce((accumulator, workspace) => {
    accumulator[workspace.id] = createWorkspaceDockState(workspace.id);
    return accumulator;
  }, {} as WorkspaceDockStateMap);
}

export function resolveWorkspaceSelection(params: {
  nextWorkspace: EditorWorkspaceId;
  visibleWorkspaceIds: Set<EditorWorkspaceId>;
  visibleWorkspaces: EditorWorkspaceDefinition[];
  workspaceDockState: WorkspaceDockStateMap;
  overrides?: Partial<WorkspaceDockState>;
}) {
  const resolvedWorkspace = params.visibleWorkspaceIds.has(params.nextWorkspace)
    ? params.nextWorkspace
    : (params.visibleWorkspaces[0]?.id ?? 'scene');
  const savedDockState =
    params.workspaceDockState[resolvedWorkspace] ??
    createWorkspaceDockState(resolvedWorkspace);

  return {
    workspaceId: resolvedWorkspace,
    dockState: {
      ...savedDockState,
      ...params.overrides,
    },
  };
}

export function resolveCurrentRightPanel(
  activePanel: RightPanelId,
  visibleRightPanels: RightPanelId[],
  workspaceDefaultRightPanel: RightPanelId
) {
  return visibleRightPanels.includes(activePanel)
    ? activePanel
    : (visibleRightPanels[0] ?? workspaceDefaultRightPanel);
}

export function resolveCurrentBottomTab(
  activeBottomTab: BottomDockTabId,
  visibleBottomDockTabs: Array<{ id: BottomDockTabId; label: string }>
) {
  return visibleBottomDockTabs.some((tab) => tab.id === activeBottomTab)
    ? activeBottomTab
    : (visibleBottomDockTabs[0]?.id ?? 'console');
}

export function resolveOpenRightPanelTarget(params: {
  panel: RightPanelId;
  showAdvancedSurface: boolean;
  visibleRightPanels: RightPanelId[];
  workspaceDefaultRightPanel: RightPanelId;
}) {
  const fallbackPanel =
    params.visibleRightPanels[0] ?? params.workspaceDefaultRightPanel;
  const panelHiddenInProduct =
    !params.showAdvancedSurface &&
    (params.panel === 'build' || params.panel === 'profiler');

  if (panelHiddenInProduct) {
    return {
      kind: 'panel' as const,
      panel: fallbackPanel,
    };
  }

  if (params.visibleRightPanels.includes(params.panel)) {
    return {
      kind: 'panel' as const,
      panel: params.panel,
    };
  }

  if (params.panel === 'ai') {
    return {
      kind: 'workspace' as const,
      workspaceId: 'ai' as const,
      overrides: {
        leftTab: 'project' as const,
        rightPanel: 'ai' as const,
        bottomTab: 'assistant' as const,
        bottomCollapsed: false,
      },
    };
  }

  if (params.panel === 'build') {
    return {
      kind: 'workspace' as const,
      workspaceId: 'build' as const,
      overrides: { rightPanel: 'build' as const, bottomCollapsed: false },
    };
  }

  if (params.panel === 'profiler') {
    return {
      kind: 'workspace' as const,
      workspaceId: 'debug' as const,
      overrides: { rightPanel: 'profiler' as const, bottomCollapsed: false },
    };
  }

  return {
    kind: 'panel' as const,
    panel: fallbackPanel,
  };
}

export function useEditorWorkspaceShellState(params: {
  shellMode: EditorShellMode;
  showAdvancedSurface: boolean;
  activePanel: RightPanelId;
  setActivePanel: (panel: RightPanelId) => void;
  engineMode: EngineWorkflowMode;
  selectedCharacterBuilderEntityId: string | null;
}) {
  const {
    shellMode,
    showAdvancedSurface,
    activePanel,
    setActivePanel,
    engineMode,
    selectedCharacterBuilderEntityId,
  } = params;

  const [activeWorkspace, setActiveWorkspace] = usePersistentState<EditorWorkspaceId>(
    'rey30.editor.workspace',
    'scene'
  );
  const [workspaceDockState, setWorkspaceDockState] = usePersistentState<WorkspaceDockStateMap>(
    'rey30.editor.workspace-dock-state',
    createWorkspaceDockStateMap()
  );
  const [activeLeftTab, setActiveLeftTab] = usePersistentState<LeftDockTabId>(
    'rey30.editor.left-tab',
    'scene'
  );
  const [activeBottomTab, setActiveBottomTab] = usePersistentState<BottomDockTabId>(
    'rey30.editor.bottom-tab',
    'console'
  );
  const [bottomDockCollapsed, setBottomDockCollapsed] = usePersistentState<boolean>(
    'rey30.editor.bottom-collapsed',
    false
  );

  const visibleWorkspaces = useMemo(
    () => getVisibleWorkspaces(shellMode),
    [shellMode]
  );
  const visibleWorkspaceIds = useMemo(
    () => new Set(visibleWorkspaces.map((item) => item.id)),
    [visibleWorkspaces]
  );
  const workspace = useMemo(
    () =>
      visibleWorkspaces.find((item) => item.id === activeWorkspace) ??
      visibleWorkspaces[0] ??
      getWorkspaceDefinition('scene'),
    [activeWorkspace, visibleWorkspaces]
  );
  const visibleRightPanels = useMemo(
    () => getVisibleRightPanels(workspace, shellMode),
    [shellMode, workspace]
  );
  const visibleBottomDockTabs = useMemo(
    () => getVisibleBottomDockTabs(shellMode),
    [shellMode]
  );
  const currentRightPanel = useMemo(
    () =>
      resolveCurrentRightPanel(
        activePanel,
        visibleRightPanels,
        workspace.defaultRightPanel
      ),
    [activePanel, visibleRightPanels, workspace]
  );
  const currentBottomTab = useMemo(
    () => resolveCurrentBottomTab(activeBottomTab, visibleBottomDockTabs),
    [activeBottomTab, visibleBottomDockTabs]
  );

  const applyWorkspaceSelection = useCallback(
    (workspaceId: EditorWorkspaceId, dockState: WorkspaceDockState) => {
      setActiveWorkspace(workspaceId);
      setActiveLeftTab(dockState.leftTab);
      setActiveBottomTab(dockState.bottomTab);
      setActivePanel(dockState.rightPanel);
      setBottomDockCollapsed(dockState.bottomCollapsed);
      setWorkspaceDockState((current) => ({
        ...current,
        [workspaceId]: dockState,
      }));
    },
    [
      setActiveBottomTab,
      setActiveLeftTab,
      setActivePanel,
      setActiveWorkspace,
      setBottomDockCollapsed,
      setWorkspaceDockState,
    ]
  );

  const selectWorkspace = useCallback(
    (nextWorkspace: EditorWorkspaceId, overrides?: Partial<WorkspaceDockState>) => {
      const nextSelection = resolveWorkspaceSelection({
        nextWorkspace,
        visibleWorkspaceIds,
        visibleWorkspaces,
        workspaceDockState,
        overrides,
      });
      applyWorkspaceSelection(nextSelection.workspaceId, nextSelection.dockState);
    },
    [
      applyWorkspaceSelection,
      visibleWorkspaceIds,
      visibleWorkspaces,
      workspaceDockState,
    ]
  );

  const openRightPanel = useCallback(
    (panel: RightPanelId) => {
      const target = resolveOpenRightPanelTarget({
        panel,
        showAdvancedSurface,
        visibleRightPanels,
        workspaceDefaultRightPanel: workspace.defaultRightPanel,
      });

      if (target.kind === 'panel') {
        setActivePanel(target.panel);
        return;
      }

      selectWorkspace(target.workspaceId, target.overrides);
    },
    [
      selectWorkspace,
      setActivePanel,
      showAdvancedSurface,
      visibleRightPanels,
      workspace,
    ]
  );

  useEffect(() => {
    if (currentRightPanel === activePanel) return;
    setActivePanel(currentRightPanel);
  }, [activePanel, currentRightPanel, setActivePanel]);

  useEffect(() => {
    if (visibleWorkspaceIds.has(activeWorkspace)) return;
    selectWorkspace(visibleWorkspaces[0]?.id ?? 'scene');
  }, [activeWorkspace, selectWorkspace, visibleWorkspaceIds, visibleWorkspaces]);

  useEffect(() => {
    if (currentBottomTab === activeBottomTab) return;
    setActiveBottomTab(currentBottomTab);
  }, [activeBottomTab, currentBottomTab, setActiveBottomTab]);

  useEffect(() => {
    if (engineMode === 'MODE_AI_FIRST') return;
    if (!selectedCharacterBuilderEntityId) return;
    if (visibleRightPanels.includes('character')) {
      setActivePanel('character');
      return;
    }

    const savedSceneDockState =
      workspaceDockState.scene ?? createWorkspaceDockState('scene');
    const nextSceneDockState: WorkspaceDockState = {
      ...savedSceneDockState,
      rightPanel: 'character',
      bottomCollapsed: false,
    };

    applyWorkspaceSelection('scene', nextSceneDockState);
  }, [
    applyWorkspaceSelection,
    engineMode,
    selectedCharacterBuilderEntityId,
    setActivePanel,
    visibleRightPanels,
    workspaceDockState,
  ]);

  useEffect(() => {
    const savedDockState =
      workspaceDockState[activeWorkspace] ?? createWorkspaceDockState(activeWorkspace);
    setActiveLeftTab(savedDockState.leftTab);
    setActiveBottomTab(savedDockState.bottomTab);
    setBottomDockCollapsed(savedDockState.bottomCollapsed);
    setActivePanel(savedDockState.rightPanel);
  }, []);

  useEffect(() => {
    const currentDockState =
      workspaceDockState[activeWorkspace] ?? createWorkspaceDockState(activeWorkspace);
    const nextDockState: WorkspaceDockState = {
      leftTab: activeLeftTab,
      bottomTab: activeBottomTab,
      rightPanel: currentRightPanel,
      bottomCollapsed: bottomDockCollapsed,
    };

    if (
      currentDockState.leftTab === nextDockState.leftTab &&
      currentDockState.bottomTab === nextDockState.bottomTab &&
      currentDockState.rightPanel === nextDockState.rightPanel &&
      currentDockState.bottomCollapsed === nextDockState.bottomCollapsed
    ) {
      return;
    }

    setWorkspaceDockState((current) => ({
      ...current,
      [activeWorkspace]: nextDockState,
    }));
  }, [
    activeBottomTab,
    activeLeftTab,
    activeWorkspace,
    bottomDockCollapsed,
    currentRightPanel,
    setWorkspaceDockState,
    workspaceDockState,
  ]);

  return {
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
  };
}
