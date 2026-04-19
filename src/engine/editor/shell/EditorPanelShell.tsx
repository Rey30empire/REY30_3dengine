'use client';

import type { ReactNode } from 'react';

export function EditorPanelShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col border border-slate-800 bg-slate-950">
      <div className="flex items-start justify-between gap-3 border-b border-slate-800 bg-slate-950/95 px-3 py-2">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-300">{title}</p>
          {subtitle ? <p className="mt-1 text-[11px] text-slate-500">{subtitle}</p> : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
