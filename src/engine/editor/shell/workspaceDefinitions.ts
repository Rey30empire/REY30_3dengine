'use client';

import {
  Bot,
  Boxes,
  Brush,
  Bug,
  Clapperboard,
  Cuboid,
  ScrollText,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type EditorWorkspaceId =
  | 'scene'
  | 'ai'
  | 'modeling'
  | 'materials'
  | 'animation'
  | 'scripting'
  | 'build'
  | 'debug';

export type LeftDockTabId = 'scene' | 'assets' | 'project';
export type BottomDockTabId =
  | 'console'
  | 'timeline'
  | 'build'
  | 'profiler'
  | 'assistant';

export type RightPanelId =
  | 'inspector'
  | 'world'
  | 'compositor'
  | 'character'
  | 'model'
  | 'materials'
  | 'paint'
  | 'scrib'
  | 'ai'
  | 'addons'
  | 'build'
  | 'profiler';

export type EditorShellMode = 'product' | 'advanced';

export interface EditorWorkspaceDefinition {
  id: EditorWorkspaceId;
  label: string;
  subtitle: string;
  icon: LucideIcon;
  defaultLeftTab: LeftDockTabId;
  defaultRightPanel: RightPanelId;
  defaultBottomTab: BottomDockTabId;
  rightPanels: RightPanelId[];
}

export const EDITOR_WORKSPACES: EditorWorkspaceDefinition[] = [
  {
    id: 'scene',
    label: 'Scene',
    subtitle: 'Jerarquia, seleccion, inspector y escena viva',
    icon: Cuboid,
    defaultLeftTab: 'scene',
    defaultRightPanel: 'inspector',
    defaultBottomTab: 'console',
    rightPanels: ['inspector', 'world', 'compositor', 'character'],
  },
  {
    id: 'ai',
    label: 'AI',
    subtitle: 'Chat AI-first, herramientas del motor y validacion de entrega',
    icon: Bot,
    defaultLeftTab: 'project',
    defaultRightPanel: 'ai',
    defaultBottomTab: 'assistant',
    rightPanels: ['ai', 'scrib', 'inspector', 'addons'],
  },
  {
    id: 'modeling',
    label: 'Modeling',
    subtitle: 'Modelado, paint y materiales sin salir del viewport',
    icon: Wrench,
    defaultLeftTab: 'scene',
    defaultRightPanel: 'model',
    defaultBottomTab: 'console',
    rightPanels: ['model', 'paint', 'materials', 'inspector'],
  },
  {
    id: 'materials',
    label: 'Materials',
    subtitle: 'Edicion de materiales y libreria de assets',
    icon: Brush,
    defaultLeftTab: 'assets',
    defaultRightPanel: 'materials',
    defaultBottomTab: 'console',
    rightPanels: ['materials', 'inspector', 'world'],
  },
  {
    id: 'animation',
    label: 'Animation',
    subtitle: 'Rig, timeline, clips y NLA con viewport central',
    icon: Clapperboard,
    defaultLeftTab: 'scene',
    defaultRightPanel: 'character',
    defaultBottomTab: 'timeline',
    rightPanels: ['character', 'inspector', 'world'],
  },
  {
    id: 'scripting',
    label: 'Scripting',
    subtitle: 'Scrib Studio, automatizacion y asistente operativo',
    icon: ScrollText,
    defaultLeftTab: 'assets',
    defaultRightPanel: 'scrib',
    defaultBottomTab: 'assistant',
    rightPanels: ['scrib', 'ai', 'addons'],
  },
  {
    id: 'build',
    label: 'Build',
    subtitle: 'Validacion, export, manifest y diagnosticos',
    icon: Boxes,
    defaultLeftTab: 'project',
    defaultRightPanel: 'build',
    defaultBottomTab: 'build',
    rightPanels: ['build', 'addons', 'world'],
  },
  {
    id: 'debug',
    label: 'Debug',
    subtitle: 'Consola, profiler y estado del runtime',
    icon: Bug,
    defaultLeftTab: 'scene',
    defaultRightPanel: 'profiler',
    defaultBottomTab: 'profiler',
    rightPanels: ['profiler', 'inspector', 'world'],
  },
];

export const LEFT_DOCK_TABS: Array<{ id: LeftDockTabId; label: string }> = [
  { id: 'scene', label: 'Scene' },
  { id: 'assets', label: 'Assets' },
  { id: 'project', label: 'Project' },
];

export const BOTTOM_DOCK_TABS: Array<{ id: BottomDockTabId; label: string }> = [
  { id: 'console', label: 'Console' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'build', label: 'Build' },
  { id: 'profiler', label: 'Profiler' },
  { id: 'assistant', label: 'Assistant' },
];

export const RIGHT_PANEL_LABELS: Record<RightPanelId, string> = {
  inspector: 'Inspector',
  world: 'World',
  compositor: 'Compositor',
  character: 'Character',
  model: 'Model',
  materials: 'Materials',
  paint: 'Paint',
  scrib: 'Scrib',
  ai: 'Assistant',
  addons: 'Addons',
  build: 'Build',
  profiler: 'Profiler',
};

export function getWorkspaceDefinition(
  workspaceId: EditorWorkspaceId
): EditorWorkspaceDefinition {
  return (
    EDITOR_WORKSPACES.find((workspace) => workspace.id === workspaceId) ??
    EDITOR_WORKSPACES[0]
  );
}

export function getVisibleWorkspaces(
  shellMode: EditorShellMode
): EditorWorkspaceDefinition[] {
  if (shellMode === 'advanced') return EDITOR_WORKSPACES;
  return EDITOR_WORKSPACES.filter(
    (workspace) => workspace.id !== 'build' && workspace.id !== 'debug'
  );
}

export function getVisibleRightPanels(
  workspace: EditorWorkspaceDefinition,
  shellMode: EditorShellMode
): RightPanelId[] {
  if (shellMode === 'advanced') return workspace.rightPanels;
  return workspace.rightPanels.filter((panel) => panel !== 'build' && panel !== 'profiler');
}

export function getVisibleBottomDockTabs(
  shellMode: EditorShellMode
): Array<{ id: BottomDockTabId; label: string }> {
  if (shellMode === 'advanced') return BOTTOM_DOCK_TABS;
  return BOTTOM_DOCK_TABS.filter(
    (tab) => tab.id !== 'build' && tab.id !== 'profiler'
  );
}
