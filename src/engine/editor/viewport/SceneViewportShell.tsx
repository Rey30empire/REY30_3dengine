'use client';

import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export const SceneViewportShell = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      data-testid="scene-view"
      className={cn('relative h-full w-full overflow-hidden bg-slate-900', className)}
      {...props}
    >
      {children}
    </div>
  )
);

SceneViewportShell.displayName = 'SceneViewportShell';
