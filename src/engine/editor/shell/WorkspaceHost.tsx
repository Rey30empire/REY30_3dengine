'use client';

import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { cn } from '@/lib/utils';
import { BottomDock } from './BottomDock';
import { ViewportHost } from './ViewportHost';
import type { PanelRegistryContext } from './panelRegistry';
import { WorkspaceSurfaceSlot } from './WorkspaceSurfaceSlot';
import { WorkspaceTabbedSurface } from './WorkspaceTabbedSurface';
import { deriveWorkspaceHostLayoutModel } from './workspaceManifests';
import {
  type BottomDockTabId,
  type EditorWorkspaceDefinition,
  type LeftDockTabId,
  type RightPanelId,
} from './workspaceDefinitions';

function ResizeHandle({ vertical = false }: { vertical?: boolean }) {
  return (
    <PanelResizeHandle
      className={cn(
        'transition-colors',
        vertical
          ? 'h-1 bg-slate-800 hover:bg-cyan-500/40'
          : 'w-1 bg-slate-800 hover:bg-cyan-500/40'
      )}
    />
  );
}

export interface WorkspaceHostProps {
  workspace: EditorWorkspaceDefinition;
  activeWorkspace: EditorWorkspaceDefinition['id'];
  activeLeftTab: LeftDockTabId;
  currentRightPanel: RightPanelId;
  currentBottomTab: BottomDockTabId;
  visibleRightPanels: RightPanelId[];
  visibleBottomDockTabs: Array<{ id: BottomDockTabId; label: string }>;
  bottomDockCollapsed: boolean;
  setActiveLeftTab: (tab: LeftDockTabId) => void;
  setActivePanel: (panel: RightPanelId) => void;
  setActiveBottomTab: (tab: BottomDockTabId) => void;
  setBottomDockCollapsed: (collapsed: boolean | ((current: boolean) => boolean)) => void;
  selectWorkspace: PanelRegistryContext['selectWorkspace'];
  showAdvancedSurface: boolean;
  canAccessAdminSurface: boolean;
  openRightPanel: PanelRegistryContext['openRightPanel'];
}

export function WorkspaceHost(props: WorkspaceHostProps) {
  const registryContext: PanelRegistryContext = {
    activeWorkspace: props.activeWorkspace,
    showAdvancedSurface: props.showAdvancedSurface,
    canAccessAdminSurface: props.canAccessAdminSurface,
    setActiveLeftTab: props.setActiveLeftTab,
    selectWorkspace: props.selectWorkspace,
    openRightPanel: props.openRightPanel,
    setActiveBottomTab: props.setActiveBottomTab,
    setBottomDockCollapsed: props.setBottomDockCollapsed,
  };
  const layoutModel = deriveWorkspaceHostLayoutModel({
    workspaceId: props.workspace.id,
    activeLeftTab: props.activeLeftTab,
    currentRightPanel: props.currentRightPanel,
    visibleRightPanels: props.visibleRightPanels,
    visibleBottomDockTabs: props.visibleBottomDockTabs,
    bottomDockCollapsed: props.bottomDockCollapsed,
  });

  return (
    <PanelGroup
      direction="vertical"
      className="h-full"
      autoSaveId={layoutModel.autoSaveIds.vertical}
    >
      <Panel
        defaultSize={layoutModel.topPanel.defaultSize}
        minSize={layoutModel.topPanel.minSize}
      >
        <PanelGroup
          direction="horizontal"
          className="h-full"
          autoSaveId={layoutModel.autoSaveIds.horizontal}
        >
          <Panel
            defaultSize={layoutModel.leftDock.panelSize.defaultSize}
            minSize={layoutModel.leftDock.panelSize.minSize}
            maxSize={layoutModel.leftDock.panelSize.maxSize}
          >
            <WorkspaceTabbedSurface
              tabs={layoutModel.leftDock.tabs}
              activeId={props.activeLeftTab}
              title={layoutModel.leftDock.activeTitle.title}
              subtitle={layoutModel.leftDock.activeTitle.subtitle}
              onSelect={props.setActiveLeftTab}
            >
              <WorkspaceSurfaceSlot
                slot="leftDock"
                surfaceId={props.activeLeftTab}
                context={registryContext}
              />
            </WorkspaceTabbedSurface>
          </Panel>

          <ResizeHandle />

          <Panel
            defaultSize={layoutModel.viewport.panelSize.defaultSize}
            minSize={layoutModel.viewport.panelSize.minSize}
          >
            <ViewportHost
              workspaceId={props.workspace.id}
              surfaceId={layoutModel.viewport.surfaceId}
              title={layoutModel.viewport.title}
              subtitle={layoutModel.viewport.subtitle}
              quickSwitchWorkspaces={layoutModel.viewport.quickSwitchWorkspaces}
              selectWorkspace={props.selectWorkspace}
            />
          </Panel>

          <ResizeHandle />

          <Panel
            defaultSize={layoutModel.rightDock.panelSize.defaultSize}
            minSize={layoutModel.rightDock.panelSize.minSize}
            maxSize={layoutModel.rightDock.panelSize.maxSize}
          >
            <WorkspaceTabbedSurface
              tabs={layoutModel.rightDock.tabs}
              activeId={props.currentRightPanel}
              title={layoutModel.rightDock.activeTitle}
              subtitle={layoutModel.rightDock.subtitle}
              onSelect={props.setActivePanel}
            >
              <WorkspaceSurfaceSlot
                slot="rightPanel"
                surfaceId={props.currentRightPanel}
                context={registryContext}
              />
            </WorkspaceTabbedSurface>
          </Panel>
        </PanelGroup>
      </Panel>

      {!props.bottomDockCollapsed && (
        <>
          <ResizeHandle vertical />
          <Panel
            defaultSize={layoutModel.bottomDock.panelSize.defaultSize}
            minSize={layoutModel.bottomDock.panelSize.minSize}
            maxSize={layoutModel.bottomDock.panelSize.maxSize}
          >
            <BottomDock
              activeTab={props.currentBottomTab}
              collapsed={props.bottomDockCollapsed}
              onTabChange={props.setActiveBottomTab}
              onToggleCollapsed={() => props.setBottomDockCollapsed((current) => !current)}
              tabs={layoutModel.bottomDock.tabs}
            >
              <WorkspaceSurfaceSlot
                slot="bottomDock"
                surfaceId={props.currentBottomTab}
                context={registryContext}
              />
            </BottomDock>
          </Panel>
        </>
      )}
    </PanelGroup>
  );
}
