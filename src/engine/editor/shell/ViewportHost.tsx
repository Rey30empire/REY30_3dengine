'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { EditorPanelShell } from './EditorPanelShell';
import type { ViewportSurfaceId } from './surfaceDefinitions';
import { WorkspaceSurfaceSlot } from './WorkspaceSurfaceSlot';
import type { EditorWorkspaceId } from './workspaceDefinitions';

export interface ViewportHostProps {
  workspaceId: EditorWorkspaceId;
  surfaceId: ViewportSurfaceId;
  title: string;
  subtitle: string;
  quickSwitchWorkspaces: Array<{
    id: EditorWorkspaceId;
    label: string;
  }>;
  selectWorkspace: (workspaceId: EditorWorkspaceId) => void;
}

export function ViewportHost({
  workspaceId,
  surfaceId,
  title,
  subtitle,
  quickSwitchWorkspaces,
  selectWorkspace,
}: ViewportHostProps) {
  return (
    <EditorPanelShell
      title={title}
      subtitle={subtitle}
      actions={
        <div className="flex flex-wrap items-center gap-1">
          {quickSwitchWorkspaces.map((quickSwitchWorkspace) => (
            <Button
              key={quickSwitchWorkspace.id}
              type="button"
              variant={workspaceId === quickSwitchWorkspace.id ? 'secondary' : 'ghost'}
              size="sm"
              className={cn(
                'h-7 rounded-md px-2 text-[11px]',
                workspaceId === quickSwitchWorkspace.id
                  ? 'bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/20'
                  : 'text-slate-400 hover:text-slate-100'
              )}
              onClick={() => selectWorkspace(quickSwitchWorkspace.id)}
            >
              {quickSwitchWorkspace.label}
            </Button>
          ))}
        </div>
      }
    >
      <WorkspaceSurfaceSlot slot="viewport" surfaceId={surfaceId} />
    </EditorPanelShell>
  );
}
