'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface BoxSelectionState {
  active: boolean;
  start: { x: number; y: number };
  end: { x: number; y: number };
}

interface SceneViewportTelemetry {
  fps: number;
  frameTimeMs: number;
  objectCount: number;
  selectionCount: number;
  runtimeState: string;
}

interface ModelerOverlayState {
  mode: string;
  selectionCount: number;
}

interface TopologyOverlayState {
  mode: string;
  templateType: string;
  strokePointCount: number;
  lastIntentKind: string | null;
}

interface SceneViewportOverlaysProps {
  boxSelection: BoxSelectionState;
  telemetry: SceneViewportTelemetry;
  shortcutSummary: string;
  navigationLabel: string;
  cameraStatusLabel: string;
  modelerOverlay: ModelerOverlayState | null;
  topologyOverlay: TopologyOverlayState | null;
  hoveredAxis: string | null;
}

function OverlayCard({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-slate-700/80 bg-slate-900/88 px-3 py-2 text-xs backdrop-blur-sm shadow-lg shadow-black/20',
        className
      )}
    >
      {children}
    </div>
  );
}

export function SceneViewportOverlays({
  boxSelection,
  telemetry,
  shortcutSummary,
  navigationLabel,
  cameraStatusLabel,
  modelerOverlay,
  topologyOverlay,
  hoveredAxis,
}: SceneViewportOverlaysProps) {
  return (
    <>
      {boxSelection.active && (
        <div
          className="pointer-events-none fixed z-[1000] border border-blue-500 bg-blue-500/20"
          style={{
            left: Math.min(boxSelection.start.x, boxSelection.end.x),
            top: Math.min(boxSelection.start.y, boxSelection.end.y),
            width: Math.abs(boxSelection.end.x - boxSelection.start.x),
            height: Math.abs(boxSelection.end.y - boxSelection.start.y),
          }}
        />
      )}

      <div className="pointer-events-none absolute bottom-2 left-2 z-10">
        <OverlayCard className="font-mono text-slate-200">
          <div className="flex flex-wrap items-center gap-2">
            <span>FPS {telemetry.fps}</span>
            <span className="text-slate-600">|</span>
            <span>{telemetry.frameTimeMs.toFixed(1)} ms</span>
            <span className="text-slate-600">|</span>
            <span>Objects {telemetry.objectCount}</span>
            <span className="text-slate-600">|</span>
            <span>Sel {telemetry.selectionCount}</span>
            <span className="text-slate-600">|</span>
            <span>{telemetry.runtimeState}</span>
          </div>
        </OverlayCard>
      </div>

      <div className="pointer-events-none absolute right-2 top-[4.75rem] z-10 flex max-w-[380px] flex-col gap-2">
        <OverlayCard className="text-slate-100">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-300">
              Viewport Guide
            </span>
            <span className="rounded-full border border-slate-700 bg-slate-950/80 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">
              {navigationLabel}
            </span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-200">{shortcutSummary}</p>
          <p className="mt-1 text-[11px] text-slate-400">{cameraStatusLabel}</p>
        </OverlayCard>

        {modelerOverlay && (
          <OverlayCard className="text-slate-200">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-300">
              Modeling Subselection
            </div>
            <p className="mt-2 text-xs text-slate-100">
              Edit {modelerOverlay.mode.toUpperCase()} · Sel {modelerOverlay.selectionCount}
            </p>
            <p className="mt-1 text-[11px] text-slate-400">
              Gizmo sub-elemento, click directo y Shift multi.
            </p>
          </OverlayCard>
        )}

        {topologyOverlay && (
          <OverlayCard className="border-emerald-500/30 bg-emerald-950/85 text-emerald-50">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200">
              Topology Viewport
            </div>
            <p className="mt-2 text-xs">
              {topologyOverlay.mode === 'template'
                ? `Template ${topologyOverlay.templateType}`
                : 'Intent Driven'}
              {' '}· Stroke pts {topologyOverlay.strokePointCount}
            </p>
            {topologyOverlay.lastIntentKind ? (
              <p className="mt-1 text-[11px] text-emerald-100/80">
                Ultimo intento: {topologyOverlay.lastIntentKind}
              </p>
            ) : null}
          </OverlayCard>
        )}
      </div>

      {hoveredAxis && (
        <div className="pointer-events-none absolute bottom-2 right-2 z-10">
          <OverlayCard className="border-blue-400/40 bg-blue-500/85 px-3 py-1.5 text-white">
            Axis: {hoveredAxis.toUpperCase()}
          </OverlayCard>
        </div>
      )}
    </>
  );
}
