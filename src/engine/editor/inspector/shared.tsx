'use client';

import type { ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export function InspectorSection({
  title,
  description,
  action,
  className,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn('rounded-xl border border-slate-800 bg-slate-900/60 p-3', className)}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
            {title}
          </h4>
          {description ? <p className="mt-1 text-[11px] text-slate-500">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function colorToHex(color?: { r?: number; g?: number; b?: number }) {
  const clampChannel = (value: number | undefined) =>
    Math.max(0, Math.min(255, Math.round((value ?? 1) * 255)));

  return `#${clampChannel(color?.r).toString(16).padStart(2, '0')}${clampChannel(color?.g)
    .toString(16)
    .padStart(2, '0')}${clampChannel(color?.b).toString(16).padStart(2, '0')}`;
}

export function hexToColor(hex: string) {
  const normalized = hex.startsWith('#') ? hex.slice(1) : hex;
  return {
    r: parseInt(normalized.slice(0, 2), 16) / 255,
    g: parseInt(normalized.slice(2, 4), 16) / 255,
    b: parseInt(normalized.slice(4, 6), 16) / 255,
  };
}

export function Vector3Input({
  label,
  value,
  step = 0.1,
  onChange,
}: {
  label: string;
  value: { x: number; y: number; z: number };
  step?: number;
  onChange: (value: { x: number; y: number; z: number }) => void;
}) {
  const axes = ['x', 'y', 'z'] as const;
  const axisClasses = { x: 'text-red-400', y: 'text-green-400', z: 'text-blue-400' };

  return (
    <div className="space-y-1">
      <Label className="text-xs text-slate-400">{label}</Label>
      <div className="grid grid-cols-3 gap-2">
        {axes.map((axis) => (
          <div key={axis} className="flex items-center gap-1">
            <span className={cn('w-3 text-xs', axisClasses[axis])}>{axis.toUpperCase()}</span>
            <Input
              type="number"
              value={value[axis]}
              onChange={(event) =>
                onChange({
                  ...value,
                  [axis]: Number.parseFloat(event.target.value) || 0,
                })
              }
              className="h-7 border-slate-700 bg-slate-900 text-xs"
              step={step}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
