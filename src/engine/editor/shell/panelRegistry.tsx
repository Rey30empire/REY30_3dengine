'use client';

import type { ComponentType, ReactNode } from 'react';
import { AssetBrowserPanel } from '../AssetBrowserPanel';
import { BuildCenterPanel } from '../BuildCenterPanel';
import { CharacterWorkspacePanel } from '../CharacterWorkspacePanel';
import { AIChatPanel } from '../AIChatPanel';
import { AddonManagerPanel } from '../AddonManagerPanel';
import { AnimationEditor } from '../AnimationEditor';
import { CompositorVideoPanel } from '../CompositorVideoPanel';
import { ConsolePanel } from '../ConsolePanel';
import { HierarchyPanel } from '../HierarchyPanel';
import { InspectorPanel } from '../InspectorPanel';
import { MaterialEditor } from '../MaterialEditor';
import { ModelerPanel } from '../ModelerPanel';
import { PaintPanel } from '../PaintPanel';
import { ProfilerPanel } from '../ProfilerPanel';
import { ProjectOverviewPanel } from '../ProjectOverviewPanel';
import { SceneView } from '../SceneView';
import { ScriptWorkspacePanel } from '../ScriptWorkspacePanel';
import { WorldSettingsPanel } from '../WorldSettingsPanel';
import type { ViewportSurfaceId } from './surfaceDefinitions';
import type {
  BottomDockTabId,
  EditorWorkspaceId,
  LeftDockTabId,
  RightPanelId,
} from './workspaceDefinitions';

export interface PanelRegistryContext {
  activeWorkspace: EditorWorkspaceId;
  showAdvancedSurface: boolean;
  canAccessAdminSurface: boolean;
  setActiveLeftTab: (tab: LeftDockTabId) => void;
  selectWorkspace: (workspace: EditorWorkspaceId) => void;
  openRightPanel: (panel: RightPanelId) => void;
  setActiveBottomTab: (tab: BottomDockTabId) => void;
  setBottomDockCollapsed: (collapsed: boolean | ((current: boolean) => boolean)) => void;
}

type PanelRenderer<TContext> = (context: TContext) => ReactNode;

type ViewportSurfaceComponent = ComponentType<{
  className?: string;
}>;

const LEFT_DOCK_PANEL_REGISTRY: Record<
  LeftDockTabId,
  PanelRenderer<PanelRegistryContext>
> = {
  scene: () => <HierarchyPanel />,
  assets: () => <AssetBrowserPanel />,
  project: (context) => (
    <ProjectOverviewPanel
      onSelectLeftTab={context.setActiveLeftTab}
      onSelectWorkspace={context.selectWorkspace}
      onOpenRightPanel={context.openRightPanel}
      onOpenBottomTab={(bottomTab) => {
        context.setActiveBottomTab(bottomTab);
        context.setBottomDockCollapsed(false);
      }}
      showAdvancedTools={context.showAdvancedSurface}
      activeWorkspace={context.activeWorkspace}
      adminHref={context.canAccessAdminSurface ? '/admin' : null}
    />
  ),
};

const RIGHT_PANEL_REGISTRY: Record<
  RightPanelId,
  PanelRenderer<Pick<PanelRegistryContext, 'showAdvancedSurface'>>
> = {
  inspector: () => <InspectorPanel />,
  world: () => <WorldSettingsPanel />,
  compositor: () => <CompositorVideoPanel />,
  character: () => <CharacterWorkspacePanel />,
  model: () => <ModelerPanel />,
  materials: () => <MaterialEditor />,
  paint: () => <PaintPanel />,
  scrib: () => <ScriptWorkspacePanel />,
  ai: (context) => <AIChatPanel advancedMode={context.showAdvancedSurface} />,
  addons: () => <AddonManagerPanel />,
  build: () => <BuildCenterPanel />,
  profiler: () => <ProfilerPanel />,
};

const BOTTOM_DOCK_PANEL_REGISTRY: Record<
  BottomDockTabId,
  PanelRenderer<Pick<PanelRegistryContext, 'showAdvancedSurface'>>
> = {
  console: () => <ConsolePanel />,
  timeline: () => <AnimationEditor />,
  build: () => <BuildCenterPanel />,
  profiler: () => <ProfilerPanel />,
  assistant: (context) => <AIChatPanel advancedMode={context.showAdvancedSurface} />,
};

const VIEWPORT_SURFACE_REGISTRY: Record<ViewportSurfaceId, ViewportSurfaceComponent> = {
  scene: SceneView,
};

export function resolveLeftDockPanelRenderer(
  tab: LeftDockTabId
): PanelRenderer<PanelRegistryContext> {
  return LEFT_DOCK_PANEL_REGISTRY[tab] ?? LEFT_DOCK_PANEL_REGISTRY.project;
}

export function resolveRightPanelRenderer(
  panel: RightPanelId
): PanelRenderer<Pick<PanelRegistryContext, 'showAdvancedSurface'>> {
  return RIGHT_PANEL_REGISTRY[panel] ?? RIGHT_PANEL_REGISTRY.inspector;
}

export function resolveBottomDockPanelRenderer(
  tab: BottomDockTabId
): PanelRenderer<Pick<PanelRegistryContext, 'showAdvancedSurface'>> {
  return BOTTOM_DOCK_PANEL_REGISTRY[tab] ?? BOTTOM_DOCK_PANEL_REGISTRY.console;
}

export function resolveViewportSurfaceComponent(
  surfaceId: ViewportSurfaceId
): ViewportSurfaceComponent {
  return VIEWPORT_SURFACE_REGISTRY[surfaceId] ?? VIEWPORT_SURFACE_REGISTRY.scene;
}

export function renderLeftDockPanel(
  tab: LeftDockTabId,
  context: PanelRegistryContext
) {
  return resolveLeftDockPanelRenderer(tab)(context);
}

export function renderRightPanel(
  panel: RightPanelId,
  context: Pick<PanelRegistryContext, 'showAdvancedSurface'>
) {
  return resolveRightPanelRenderer(panel)(context);
}

export function renderBottomDockPanel(
  tab: BottomDockTabId,
  context: Pick<PanelRegistryContext, 'showAdvancedSurface'>
) {
  return resolveBottomDockPanelRenderer(tab)(context);
}

export function renderViewportSurface(
  surfaceId: ViewportSurfaceId,
  props?: {
    className?: string;
  }
) {
  const ViewportSurface = resolveViewportSurfaceComponent(surfaceId);
  return <ViewportSurface className={props?.className} />;
}
