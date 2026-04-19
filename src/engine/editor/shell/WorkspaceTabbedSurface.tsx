'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { EditorPanelShell } from './EditorPanelShell';

export interface WorkspaceTabbedSurfaceProps<TId extends string> {
  tabs: Array<{
    id: TId;
    label: string;
  }>;
  activeId: TId;
  title: string;
  subtitle: string;
  onSelect: (id: TId) => void;
  children: ReactNode;
}

export function WorkspaceTabbedSurface<TId extends string>({
  tabs,
  activeId,
  title,
  subtitle,
  onSelect,
  children,
}: WorkspaceTabbedSurfaceProps<TId>) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-800 bg-slate-950/90 p-1">
        {tabs.map((tab) => (
          <Button
            key={tab.id}
            type="button"
            variant={activeId === tab.id ? 'secondary' : 'ghost'}
            size="sm"
            className={cn(
              'h-7 rounded-md px-2.5 text-xs',
              activeId === tab.id
                ? 'bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/20'
                : 'text-slate-400 hover:text-slate-100'
            )}
            onClick={() => onSelect(tab.id)}
          >
            {tab.label}
          </Button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        <EditorPanelShell title={title} subtitle={subtitle}>
          {children}
        </EditorPanelShell>
      </div>
    </div>
  );
}
