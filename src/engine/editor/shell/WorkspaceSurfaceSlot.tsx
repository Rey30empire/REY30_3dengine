'use client';

import {
  renderBottomDockPanel,
  renderLeftDockPanel,
  renderRightPanel,
  renderViewportSurface,
  type PanelRegistryContext,
} from './panelRegistry';
import type { ViewportSurfaceId } from './surfaceDefinitions';
import type {
  BottomDockTabId,
  LeftDockTabId,
  RightPanelId,
} from './workspaceDefinitions';

type WorkspaceSurfaceSlotProps =
  | {
      slot: 'leftDock';
      surfaceId: LeftDockTabId;
      context: PanelRegistryContext;
    }
  | {
      slot: 'rightPanel';
      surfaceId: RightPanelId;
      context: PanelRegistryContext;
    }
  | {
      slot: 'bottomDock';
      surfaceId: BottomDockTabId;
      context: PanelRegistryContext;
    }
  | {
      slot: 'viewport';
      surfaceId: ViewportSurfaceId;
      className?: string;
    };

export function WorkspaceSurfaceSlot(props: WorkspaceSurfaceSlotProps) {
  switch (props.slot) {
    case 'leftDock':
      return renderLeftDockPanel(props.surfaceId, props.context);
    case 'rightPanel':
      return renderRightPanel(props.surfaceId, props.context);
    case 'bottomDock':
      return renderBottomDockPanel(props.surfaceId, props.context);
    case 'viewport':
      return renderViewportSurface(props.surfaceId, { className: props.className });
    default:
      return null;
  }
}
