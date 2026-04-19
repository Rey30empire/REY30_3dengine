'use client';

import { useEffect, useState } from 'react';
import { useActiveScene, useEngineStore } from '@/store/editorStore';
import { Activity, Gauge, MemoryStick, Shapes } from 'lucide-react';

type PerformanceBudget = {
  key: string;
  status: 'ok' | 'warn' | 'error';
  current: number;
  target: number;
  warning: number;
  unit: 'ms' | 'ratio' | 'fps' | 'count' | 'mb';
};

const PERFORMANCE_BUDGET_KEYS = new Set([
  'editor_fps_min',
  'editor_frame_time_ms',
  'editor_cpu_time_ms',
  'editor_draw_calls',
  'editor_memory_used_mb',
]);

function formatBudgetValue(value: number, unit: PerformanceBudget['unit']) {
  if (unit === 'fps') return `${value.toFixed(0)} fps`;
  if (unit === 'count') return `${Math.round(value)}`;
  if (unit === 'mb') return `${value.toFixed(1)} MB`;
  if (unit === 'ratio') return value.toFixed(3);
  return `${value.toFixed(2)} ms`;
}

function budgetLabel(key: string) {
  switch (key) {
    case 'editor_fps_min':
      return 'FPS minimo';
    case 'editor_frame_time_ms':
      return 'Frame time';
    case 'editor_cpu_time_ms':
      return 'CPU render';
    case 'editor_draw_calls':
      return 'Draw calls';
    case 'editor_memory_used_mb':
      return 'Heap usado';
    default:
      return key;
  }
}

function budgetClasses(status: PerformanceBudget['status']) {
  if (status === 'error') {
    return 'border-rose-500/40 bg-rose-950/50 text-rose-100';
  }
  if (status === 'warn') {
    return 'border-amber-500/40 bg-amber-950/50 text-amber-100';
  }
  return 'border-emerald-500/30 bg-emerald-950/45 text-emerald-100';
}

export function ProfilerPanel() {
  const { profiler, editor, entities, assets } = useEngineStore();
  const activeScene = useActiveScene();
  const [performanceBudgets, setPerformanceBudgets] = useState<PerformanceBudget[]>([]);

  useEffect(() => {
    let cancelled = false;

    const loadBudgets = async () => {
      try {
        const response = await fetch('/api/telemetry', {
          cache: 'no-store',
        });
        if (!response.ok) return;
        const payload = await response.json();
        const budgets = Array.isArray(payload?.snapshot?.budgets)
          ? payload.snapshot.budgets.filter((budget: PerformanceBudget) => PERFORMANCE_BUDGET_KEYS.has(budget.key))
          : [];
        if (!cancelled) {
          setPerformanceBudgets(budgets);
        }
      } catch {
        if (!cancelled) {
          setPerformanceBudgets([]);
        }
      }
    };

    void loadBudgets();
    const interval = window.setInterval(() => {
      void loadBudgets();
    }, 4000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <div className="flex h-full flex-col bg-slate-950">
      <div className="border-b border-slate-800 px-3 py-3">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-cyan-300">
          <Gauge className="h-4 w-4" />
          Profiler
        </div>
        <h3 className="mt-1 text-sm font-semibold text-slate-100">
          Telemetria operativa del editor
        </h3>
      </div>

      <div className="space-y-4 p-3 text-xs">
        <div className="grid gap-3 md:grid-cols-4">
          <ProfilerCard
            icon={<Activity className="h-4 w-4 text-emerald-300" />}
            label="FPS"
            value={`${profiler.fps.toFixed(0)}`}
          />
          <ProfilerCard
            icon={<Gauge className="h-4 w-4 text-cyan-300" />}
            label="Frame"
            value={`${profiler.frameTime.toFixed(2)} ms`}
          />
          <ProfilerCard
            icon={<Shapes className="h-4 w-4 text-fuchsia-300" />}
            label="Draw Calls"
            value={`${profiler.drawCalls}`}
          />
          <ProfilerCard
            icon={<MemoryStick className="h-4 w-4 text-amber-300" />}
            label="Memory"
            value={`${profiler.memory.used} MB`}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
            <div className="text-xs font-medium text-slate-100">Render stats</div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-slate-400">
              <MetricLine label="CPU time" value={`${profiler.cpuTime.toFixed(2)} ms`} />
              <MetricLine label="GPU time" value={`${profiler.gpuTime.toFixed(2)} ms`} />
              <MetricLine label="Triangles" value={`${profiler.triangles}`} />
              <MetricLine label="Vertices" value={`${profiler.vertices}`} />
              <MetricLine label="Textures" value={`${profiler.memory.textures}`} />
              <MetricLine label="Meshes" value={`${profiler.memory.meshes}`} />
              <MetricLine label="Audio buffers" value={`${profiler.memory.audio}`} />
              <MetricLine label="Allocated" value={`${profiler.memory.allocated} MB`} />
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
            <div className="text-xs font-medium text-slate-100">Editor state</div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-slate-400">
              <MetricLine label="Scene" value={activeScene?.name ?? 'Sin escena'} />
              <MetricLine label="Entities" value={`${entities.size}`} />
              <MetricLine label="Assets" value={`${assets.length}`} />
              <MetricLine label="Selection" value={`${editor.selectedEntities.length}`} />
              <MetricLine label="Gizmo" value={editor.gizmoMode} />
              <MetricLine label="Camera" value={editor.viewportCameraMode ?? 'perspective'} />
              <MetricLine label="Grid" value={editor.gridVisible ? 'visible' : 'hidden'} />
              <MetricLine label="Snap" value={editor.snapEnabled ? 'enabled' : 'disabled'} />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <div className="text-xs font-medium text-slate-100">Performance budgets</div>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {performanceBudgets.length > 0 ? (
              performanceBudgets.map((budget) => (
                <div
                  key={budget.key}
                  className={`rounded-lg border px-3 py-2 ${budgetClasses(budget.status)}`}
                >
                  <div className="text-[11px] uppercase tracking-wide opacity-80">
                    {budgetLabel(budget.key)}
                  </div>
                  <div className="mt-1 text-sm font-semibold">
                    {formatBudgetValue(budget.current, budget.unit)}
                  </div>
                  <div className="mt-1 text-[11px] opacity-80">
                    target {formatBudgetValue(budget.target, budget.unit)} · warn{' '}
                    {formatBudgetValue(budget.warning, budget.unit)}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-slate-400">
                Esperando snapshot de performance del backend.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfilerCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
      <div className="flex items-center gap-2 text-slate-400">
        {icon}
        <span className="text-[11px] uppercase tracking-wide">{label}</span>
      </div>
      <div className="mt-2 text-xl font-semibold text-slate-100">{value}</div>
    </div>
  );
}

function MetricLine({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-sm text-slate-100">{value}</div>
    </div>
  );
}
