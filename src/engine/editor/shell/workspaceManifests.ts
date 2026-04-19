'use client';

import type { ViewportSurfaceId } from './surfaceDefinitions';
import type {
  BottomDockTabId,
  EditorWorkspaceId,
  LeftDockTabId,
  RightPanelId,
} from './workspaceDefinitions';
import {
  BOTTOM_DOCK_TABS,
  LEFT_DOCK_TABS,
  RIGHT_PANEL_LABELS,
  getWorkspaceDefinition,
} from './workspaceDefinitions';

type DockTitle = {
  title: string;
  subtitle: string;
};

type WorkspaceQuickSwitch = {
  id: EditorWorkspaceId;
  label: string;
};

type WorkspaceTabDescriptor<TId extends string> = {
  id: TId;
  label: string;
};

type WorkspacePanelSize = {
  defaultSize: number;
  minSize: number;
  maxSize?: number;
};

export interface WorkspaceLayoutManifest {
  autoSaveIdPrefix: {
    vertical: string;
    horizontal: string;
  };
  topPanel: {
    expandedDefaultSize: number;
    collapsedDefaultSize: number;
    minSize: number;
  };
  leftDock: {
    tabs: WorkspaceTabDescriptor<LeftDockTabId>[];
    panelSize: WorkspacePanelSize;
  };
  viewport: {
    panelSize: WorkspacePanelSize;
  };
  rightDock: {
    panelSize: WorkspacePanelSize;
    panelLabels: Record<RightPanelId, string>;
    subtitle: string;
  };
  bottomDock: {
    tabs: WorkspaceTabDescriptor<BottomDockTabId>[];
    panelSize: WorkspacePanelSize;
  };
}

export interface WorkspaceManifest {
  id: EditorWorkspaceId;
  viewportSurfaceId: ViewportSurfaceId;
  viewportTitle: string;
  viewportSubtitle: string;
  viewportQuickSwitchWorkspaces: WorkspaceQuickSwitch[];
  leftDockTitles: Record<LeftDockTabId, DockTitle>;
  layout: WorkspaceLayoutManifest;
}

export interface WorkspaceHostLayoutModel {
  autoSaveIds: {
    vertical: string;
    horizontal: string;
  };
  topPanel: {
    defaultSize: number;
    minSize: number;
  };
  leftDock: {
    tabs: WorkspaceTabDescriptor<LeftDockTabId>[];
    activeTitle: DockTitle;
    panelSize: WorkspacePanelSize;
  };
  viewport: {
    surfaceId: ViewportSurfaceId;
    title: string;
    subtitle: string;
    quickSwitchWorkspaces: WorkspaceQuickSwitch[];
    panelSize: WorkspacePanelSize;
  };
  rightDock: {
    tabs: WorkspaceTabDescriptor<RightPanelId>[];
    activeTitle: string;
    subtitle: string;
    panelSize: WorkspacePanelSize;
  };
  bottomDock: {
    tabs: WorkspaceTabDescriptor<BottomDockTabId>[];
    panelSize: WorkspacePanelSize;
  };
}

const DEFAULT_LEFT_DOCK_TITLES: Record<LeftDockTabId, DockTitle> = {
  scene: {
    title: 'Scene Explorer',
    subtitle: 'Jerarquia, colecciones y seleccion',
  },
  assets: {
    title: 'Asset Browser',
    subtitle: 'Biblioteca, imports y preview',
  },
  project: {
    title: 'Project',
    subtitle: 'Estado general y accesos rapidos',
  },
};

const DEFAULT_WORKSPACE_LAYOUT = {
  autoSaveIdPrefix: {
    vertical: 'rey30.editor.layout.vertical',
    horizontal: 'rey30.editor.layout.horizontal',
  },
  topPanel: {
    expandedDefaultSize: 72,
    collapsedDefaultSize: 100,
    minSize: 48,
  },
  leftDock: {
    tabs: LEFT_DOCK_TABS,
    panelSize: {
      defaultSize: 18,
      minSize: 14,
      maxSize: 26,
    },
  },
  viewport: {
    panelSize: {
      defaultSize: 56,
      minSize: 32,
    },
  },
  rightDock: {
    panelSize: {
      defaultSize: 26,
      minSize: 20,
      maxSize: 34,
    },
    panelLabels: RIGHT_PANEL_LABELS,
  },
  bottomDock: {
    tabs: BOTTOM_DOCK_TABS,
    panelSize: {
      defaultSize: 28,
      minSize: 18,
      maxSize: 52,
    },
  },
} as const;

function createWorkspaceQuickSwitches(
  workspaceIds: EditorWorkspaceId[]
): WorkspaceQuickSwitch[] {
  return workspaceIds.map((workspaceId) => ({
    id: workspaceId,
    label: getWorkspaceDefinition(workspaceId).label,
  }));
}

function createWorkspaceLayoutManifest(
  workspaceId: EditorWorkspaceId
): WorkspaceLayoutManifest {
  return {
    autoSaveIdPrefix: { ...DEFAULT_WORKSPACE_LAYOUT.autoSaveIdPrefix },
    topPanel: { ...DEFAULT_WORKSPACE_LAYOUT.topPanel },
    leftDock: {
      tabs: [...DEFAULT_WORKSPACE_LAYOUT.leftDock.tabs],
      panelSize: { ...DEFAULT_WORKSPACE_LAYOUT.leftDock.panelSize },
    },
    viewport: {
      panelSize: { ...DEFAULT_WORKSPACE_LAYOUT.viewport.panelSize },
    },
    rightDock: {
      panelSize: { ...DEFAULT_WORKSPACE_LAYOUT.rightDock.panelSize },
      panelLabels: { ...DEFAULT_WORKSPACE_LAYOUT.rightDock.panelLabels },
      subtitle: getWorkspaceDefinition(workspaceId).label,
    },
    bottomDock: {
      tabs: [...DEFAULT_WORKSPACE_LAYOUT.bottomDock.tabs],
      panelSize: { ...DEFAULT_WORKSPACE_LAYOUT.bottomDock.panelSize },
    },
  };
}

export const WORKSPACE_MANIFESTS: Record<EditorWorkspaceId, WorkspaceManifest> = {
  scene: {
    id: 'scene',
    viewportSurfaceId: 'scene',
    viewportTitle: 'Viewport',
    viewportSubtitle: 'Escena central de trabajo y manipulacion',
    viewportQuickSwitchWorkspaces: createWorkspaceQuickSwitches([
      'scene',
      'ai',
      'modeling',
      'materials',
    ]),
    leftDockTitles: DEFAULT_LEFT_DOCK_TITLES,
    layout: createWorkspaceLayoutManifest('scene'),
  },
  ai: {
    id: 'ai',
    viewportSurfaceId: 'scene',
    viewportTitle: 'AI Scene View',
    viewportSubtitle: 'La IA crea, el motor ejecuta y el validador revisa antes de entregar',
    viewportQuickSwitchWorkspaces: createWorkspaceQuickSwitches([
      'ai',
      'scene',
      'scripting',
      'modeling',
    ]),
    leftDockTitles: DEFAULT_LEFT_DOCK_TITLES,
    layout: createWorkspaceLayoutManifest('ai'),
  },
  modeling: {
    id: 'modeling',
    viewportSurfaceId: 'scene',
    viewportTitle: 'Viewport',
    viewportSubtitle: 'Escultura, retopo y modelado sin salir de escena',
    viewportQuickSwitchWorkspaces: createWorkspaceQuickSwitches([
      'scene',
      'ai',
      'modeling',
      'materials',
    ]),
    leftDockTitles: DEFAULT_LEFT_DOCK_TITLES,
    layout: createWorkspaceLayoutManifest('modeling'),
  },
  materials: {
    id: 'materials',
    viewportSurfaceId: 'scene',
    viewportTitle: 'Viewport',
    viewportSubtitle: 'Materiales y preview unificados sobre la escena',
    viewportQuickSwitchWorkspaces: createWorkspaceQuickSwitches([
      'scene',
      'ai',
      'modeling',
      'materials',
    ]),
    leftDockTitles: DEFAULT_LEFT_DOCK_TITLES,
    layout: createWorkspaceLayoutManifest('materials'),
  },
  animation: {
    id: 'animation',
    viewportSurfaceId: 'scene',
    viewportTitle: 'Viewport',
    viewportSubtitle: 'Animacion, rig y evaluacion de clips en contexto',
    viewportQuickSwitchWorkspaces: createWorkspaceQuickSwitches([
      'ai',
      'scene',
      'animation',
      'scripting',
    ]),
    leftDockTitles: DEFAULT_LEFT_DOCK_TITLES,
    layout: createWorkspaceLayoutManifest('animation'),
  },
  scripting: {
    id: 'scripting',
    viewportSurfaceId: 'scene',
    viewportTitle: 'Viewport',
    viewportSubtitle: 'Prompt, scripts y runtime sobre la misma escena viva',
    viewportQuickSwitchWorkspaces: createWorkspaceQuickSwitches([
      'ai',
      'scene',
      'modeling',
      'materials',
    ]),
    leftDockTitles: DEFAULT_LEFT_DOCK_TITLES,
    layout: createWorkspaceLayoutManifest('scripting'),
  },
  build: {
    id: 'build',
    viewportSurfaceId: 'scene',
    viewportTitle: 'Viewport',
    viewportSubtitle: 'Validacion y empaquetado sin cambiar de shell',
    viewportQuickSwitchWorkspaces: createWorkspaceQuickSwitches([
      'ai',
      'scene',
      'build',
      'debug',
    ]),
    leftDockTitles: DEFAULT_LEFT_DOCK_TITLES,
    layout: createWorkspaceLayoutManifest('build'),
  },
  debug: {
    id: 'debug',
    viewportSurfaceId: 'scene',
    viewportTitle: 'Viewport',
    viewportSubtitle: 'Inspeccion runtime, profiler y escena sincronizada',
    viewportQuickSwitchWorkspaces: createWorkspaceQuickSwitches([
      'ai',
      'scene',
      'debug',
      'build',
    ]),
    leftDockTitles: DEFAULT_LEFT_DOCK_TITLES,
    layout: createWorkspaceLayoutManifest('debug'),
  },
};

export function getWorkspaceManifest(workspaceId: EditorWorkspaceId): WorkspaceManifest {
  return WORKSPACE_MANIFESTS[workspaceId] ?? WORKSPACE_MANIFESTS.scene;
}

export function deriveWorkspaceHostLayoutModel(params: {
  workspaceId: EditorWorkspaceId;
  activeLeftTab: LeftDockTabId;
  currentRightPanel: RightPanelId;
  visibleRightPanels: RightPanelId[];
  visibleBottomDockTabs: Array<{ id: BottomDockTabId; label: string }>;
  bottomDockCollapsed: boolean;
}): WorkspaceHostLayoutModel {
  const manifest = getWorkspaceManifest(params.workspaceId);
  const layout = manifest.layout;

  return {
    autoSaveIds: {
      vertical: `${layout.autoSaveIdPrefix.vertical}.${params.workspaceId}`,
      horizontal: `${layout.autoSaveIdPrefix.horizontal}.${params.workspaceId}`,
    },
    topPanel: {
      defaultSize: params.bottomDockCollapsed
        ? layout.topPanel.collapsedDefaultSize
        : layout.topPanel.expandedDefaultSize,
      minSize: layout.topPanel.minSize,
    },
    leftDock: {
      tabs: layout.leftDock.tabs,
      activeTitle: manifest.leftDockTitles[params.activeLeftTab],
      panelSize: layout.leftDock.panelSize,
    },
    viewport: {
      surfaceId: manifest.viewportSurfaceId,
      title: manifest.viewportTitle,
      subtitle: manifest.viewportSubtitle,
      quickSwitchWorkspaces: manifest.viewportQuickSwitchWorkspaces,
      panelSize: layout.viewport.panelSize,
    },
    rightDock: {
      tabs: params.visibleRightPanels.map((panelId) => ({
        id: panelId,
        label: layout.rightDock.panelLabels[panelId],
      })),
      activeTitle:
        layout.rightDock.panelLabels[params.currentRightPanel] ??
        layout.rightDock.panelLabels.inspector,
      subtitle: layout.rightDock.subtitle,
      panelSize: layout.rightDock.panelSize,
    },
    bottomDock: {
      tabs: params.visibleBottomDockTabs,
      panelSize: layout.bottomDock.panelSize,
    },
  };
}
