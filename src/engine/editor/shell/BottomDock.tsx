'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  BOTTOM_DOCK_TABS,
  type BottomDockTabId,
} from './workspaceDefinitions';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface BottomDockProps {
  activeTab: BottomDockTabId;
  collapsed: boolean;
  onTabChange: (tab: BottomDockTabId) => void;
  onToggleCollapsed: () => void;
  children: ReactNode;
  tabs?: typeof BOTTOM_DOCK_TABS;
}

export function BottomDock({
  activeTab,
  collapsed,
  onTabChange,
  onToggleCollapsed,
  children,
  tabs = BOTTOM_DOCK_TABS,
}: BottomDockProps) {
  return (
    <div className="flex h-full flex-col border border-slate-800 bg-slate-950">
      <div className="flex items-center gap-1 border-b border-slate-800 bg-slate-950/95 px-2 py-1.5">
        {tabs.map((tab) => (
          <Button
            key={tab.id}
            type="button"
            variant={tab.id === activeTab ? 'secondary' : 'ghost'}
            size="sm"
            className={cn(
              'h-7 rounded-md px-2.5 text-xs',
              tab.id === activeTab
                ? 'bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/20'
                : 'text-slate-400 hover:text-slate-100'
            )}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </Button>
        ))}

        <div className="ml-auto flex items-center gap-2 text-[11px] text-slate-500">
          <span>Bottom Dock</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-slate-400"
            onClick={onToggleCollapsed}
            title={collapsed ? 'Expandir panel inferior' : 'Colapsar panel inferior'}
          >
            {collapsed ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {!collapsed && <div className="min-h-0 flex-1">{children}</div>}
    </div>
  );
}
