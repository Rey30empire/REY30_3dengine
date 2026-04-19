'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  EDITOR_WORKSPACES,
  type EditorWorkspaceId,
} from './workspaceDefinitions';

interface WorkspaceSwitcherProps {
  activeWorkspace: EditorWorkspaceId;
  onChange: (workspace: EditorWorkspaceId) => void;
  shortcutLabels?: Partial<Record<EditorWorkspaceId, string | undefined>>;
  workspaces?: typeof EDITOR_WORKSPACES;
}

export function WorkspaceSwitcher({
  activeWorkspace,
  onChange,
  shortcutLabels,
  workspaces = EDITOR_WORKSPACES,
}: WorkspaceSwitcherProps) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-800 bg-slate-900/70 p-1">
      {workspaces.map((workspace) => {
        const Icon = workspace.icon;
        const active = workspace.id === activeWorkspace;
        const shortcutLabel = shortcutLabels?.[workspace.id];
        return (
          <Button
            key={workspace.id}
            type="button"
            variant={active ? 'secondary' : 'ghost'}
            size="sm"
            className={cn(
              'h-8 gap-2 rounded-lg px-3 text-xs',
              active
                ? 'bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/25'
                : 'text-slate-400 hover:text-slate-100'
            )}
            onClick={() => onChange(workspace.id)}
            data-testid={`workspace-switcher-${workspace.id}`}
            title={
              shortcutLabel
                ? `${workspace.subtitle} · ${shortcutLabel}`
                : workspace.subtitle
            }
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{workspace.label}</span>
            {shortcutLabel ? (
              <span className="rounded border border-slate-700/80 bg-slate-950/70 px-1.5 py-0.5 text-[10px] text-slate-400">
                {shortcutLabel}
              </span>
            ) : null}
          </Button>
        );
      })}
    </div>
  );
}
