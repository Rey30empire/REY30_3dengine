type TelemetryEventKind =
  | 'compose_duration_ms'
  | 'prompt_to_scene_ms'
  | 'scrib_runtime_error'
  | 'runtime_forensics_event'
  | 'performance_sample';

type TelemetryStatus = 'ok' | 'warn' | 'error';

type TelemetryBudgetKey =
  | 'compose_duration_ms'
  | 'prompt_to_scene_ms'
  | 'scrib_error_rate'
  | 'editor_fps_min'
  | 'editor_frame_time_ms'
  | 'editor_cpu_time_ms'
  | 'editor_draw_calls'
  | 'editor_memory_used_mb';

type TelemetryBudgetUnit = 'ms' | 'ratio' | 'fps' | 'count' | 'mb';

type TelemetryEvent = {
  id: string;
  kind: TelemetryEventKind;
  value: number;
  at: string;
  tags?: Record<string, string | number | boolean>;
};

type TelemetryBudget = {
  key: TelemetryBudgetKey;
  target: number;
  warning: number;
  windowSize: number;
  status: TelemetryStatus;
  current: number;
  unit: TelemetryBudgetUnit;
};

export type PerformanceTelemetrySample = {
  fps: number;
  frameTimeMs: number;
  cpuTimeMs: number;
  gpuTimeMs: number;
  drawCalls: number;
  triangles: number;
  vertices: number;
  memoryUsedMb: number;
  memoryAllocatedMb: number;
  textures: number;
  meshes: number;
  audioBuffers: number;
  objectCount?: number;
  selectionCount?: number;
  runtimeState?: string;
  sceneId?: string;
  source?: string;
  at?: string;
};

type TelemetrySnapshot = {
  generatedAt: string;
  totals: {
    composeSamples: number;
    promptSamples: number;
    scribErrors: number;
    runtimeForensicsEvents: number;
    performanceSamples: number;
  };
  averages: {
    composeDurationMs: number;
    promptToSceneMs: number;
    editorFps: number;
    editorFrameTimeMs: number;
    editorCpuTimeMs: number;
    editorGpuTimeMs: number;
    editorDrawCalls: number;
    editorMemoryUsedMb: number;
  };
  performance: {
    latest: PerformanceTelemetrySample | null;
    windowSize: number;
  };
  budgets: TelemetryBudget[];
  events: TelemetryEvent[];
};

type SloIndicator = {
  key:
    | 'compose_latency'
    | 'prompt_to_scene_latency'
    | 'scrib_runtime_error_rate'
    | 'editor_fps'
    | 'editor_frame_time'
    | 'editor_cpu_time'
    | 'editor_draw_calls'
    | 'editor_memory_used'
    | 'runtime_forensics_p0_reappeared';
  objective: number;
  current: number;
  unit: TelemetryBudgetUnit;
  burnRate: number;
  status: TelemetryStatus;
};

type SloAlert = {
  id: string;
  level: 'warning' | 'critical';
  indicator: SloIndicator['key'];
  message: string;
  current: number;
  objective: number;
  at: string;
};

type SloSnapshot = {
  generatedAt: string;
  overallStatus: TelemetryStatus;
  indicators: SloIndicator[];
  alerts: SloAlert[];
  errorBudget: {
    objective: number;
    current: number;
    remaining: number;
    burnRate: number;
  };
};

declare global {
  var __rey30EngineTelemetry: EngineTelemetry | undefined;
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function nowIso(): string {
  return new Date().toISOString();
}

function randomId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function safeNumber(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value);
}

function clampNonNegative(value: number): number {
  return Math.max(0, safeNumber(value));
}

function statusRank(status: TelemetryStatus): number {
  if (status === 'error') return 2;
  if (status === 'warn') return 1;
  return 0;
}

function statusFromRank(rank: number): TelemetryStatus {
  if (rank >= 2) return 'error';
  if (rank === 1) return 'warn';
  return 'ok';
}

function statusToPromValue(status: TelemetryStatus): number {
  return status === 'ok' ? 0 : status === 'warn' ? 1 : 2;
}

function tagString(tags: Record<string, string | number | boolean> | undefined, key: string): string {
  const value = tags?.[key];
  return typeof value === 'string' ? value : '';
}

function tagNumber(tags: Record<string, string | number | boolean> | undefined, key: string): number {
  const value = tags?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function readEnvNumber(key: string, fallback: number): number {
  const raw = Number(process.env[key]);
  return Number.isFinite(raw) ? raw : fallback;
}

function evaluateMaxBudget(current: number, target: number, warning: number): TelemetryStatus {
  if (current <= target) return 'ok';
  if (current <= warning) return 'warn';
  return 'error';
}

function evaluateMinBudget(current: number, target: number, warning: number): TelemetryStatus {
  if (current >= target) return 'ok';
  if (current >= warning) return 'warn';
  return 'error';
}

function computeMaxBurnRate(current: number, objective: number): number {
  return safeNumber(current / Math.max(objective, 1e-6));
}

function computeMinBurnRate(current: number, objective: number): number {
  return safeNumber(objective / Math.max(current, 1e-6));
}

function sanitizePerformanceSample(
  sample: Partial<PerformanceTelemetrySample>
): PerformanceTelemetrySample {
  return {
    fps: clampNonNegative(sample.fps ?? 0),
    frameTimeMs: clampNonNegative(sample.frameTimeMs ?? 0),
    cpuTimeMs: clampNonNegative(sample.cpuTimeMs ?? 0),
    gpuTimeMs: clampNonNegative(sample.gpuTimeMs ?? 0),
    drawCalls: Math.round(clampNonNegative(sample.drawCalls ?? 0)),
    triangles: Math.round(clampNonNegative(sample.triangles ?? 0)),
    vertices: Math.round(clampNonNegative(sample.vertices ?? 0)),
    memoryUsedMb: clampNonNegative(sample.memoryUsedMb ?? 0),
    memoryAllocatedMb: clampNonNegative(sample.memoryAllocatedMb ?? 0),
    textures: Math.round(clampNonNegative(sample.textures ?? 0)),
    meshes: Math.round(clampNonNegative(sample.meshes ?? 0)),
    audioBuffers: Math.round(clampNonNegative(sample.audioBuffers ?? 0)),
    objectCount:
      sample.objectCount === undefined ? undefined : Math.round(clampNonNegative(sample.objectCount)),
    selectionCount:
      sample.selectionCount === undefined
        ? undefined
        : Math.round(clampNonNegative(sample.selectionCount)),
    runtimeState:
      typeof sample.runtimeState === 'string' && sample.runtimeState.trim()
        ? sample.runtimeState.trim()
        : undefined,
    sceneId:
      typeof sample.sceneId === 'string' && sample.sceneId.trim()
        ? sample.sceneId.trim()
        : undefined,
    source:
      typeof sample.source === 'string' && sample.source.trim()
        ? sample.source.trim()
        : undefined,
    at:
      typeof sample.at === 'string' && sample.at.trim()
        ? sample.at.trim()
        : nowIso(),
  };
}

export class EngineTelemetry {
  private readonly eventLimit = 500;
  private readonly events: TelemetryEvent[] = [];
  private readonly composeWindow = 120;
  private readonly promptWindow = 80;
  private readonly errorWindow = 200;
  private readonly performanceWindow = 180;
  private readonly performanceBudgetWindow = Math.max(
    1,
    Math.round(readEnvNumber('REY30_BUDGET_EDITOR_SAMPLE_WINDOW', 5))
  );

  private composeDurations: number[] = [];
  private promptDurations: number[] = [];
  private scribErrorFlags: number[] = [];
  private performanceSamples: PerformanceTelemetrySample[] = [];

  recordComposeDuration(durationMs: number, tags?: Record<string, string | number | boolean>): void {
    this.pushEvent({
      id: randomId(),
      kind: 'compose_duration_ms',
      value: durationMs,
      at: nowIso(),
      tags,
    });
    this.composeDurations.push(durationMs);
    if (this.composeDurations.length > this.composeWindow) {
      this.composeDurations = this.composeDurations.slice(-this.composeWindow);
    }
    this.scribErrorFlags.push(0);
    if (this.scribErrorFlags.length > this.errorWindow) {
      this.scribErrorFlags = this.scribErrorFlags.slice(-this.errorWindow);
    }
  }

  recordPromptToSceneDuration(durationMs: number, tags?: Record<string, string | number | boolean>): void {
    this.pushEvent({
      id: randomId(),
      kind: 'prompt_to_scene_ms',
      value: durationMs,
      at: nowIso(),
      tags,
    });
    this.promptDurations.push(durationMs);
    if (this.promptDurations.length > this.promptWindow) {
      this.promptDurations = this.promptDurations.slice(-this.promptWindow);
    }
  }

  recordScribRuntimeError(tags?: Record<string, string | number | boolean>): void {
    this.pushEvent({
      id: randomId(),
      kind: 'scrib_runtime_error',
      value: 1,
      at: nowIso(),
      tags,
    });
    this.scribErrorFlags.push(1);
    if (this.scribErrorFlags.length > this.errorWindow) {
      this.scribErrorFlags = this.scribErrorFlags.slice(-this.errorWindow);
    }
  }

  recordRuntimeForensicsEvent(tags?: Record<string, string | number | boolean>): void {
    this.pushEvent({
      id: randomId(),
      kind: 'runtime_forensics_event',
      value: 1,
      at: nowIso(),
      tags,
    });
  }

  recordPerformanceSample(sample: Partial<PerformanceTelemetrySample>): PerformanceTelemetrySample {
    const sanitized = sanitizePerformanceSample(sample);
    this.pushEvent({
      id: randomId(),
      kind: 'performance_sample',
      value: sanitized.frameTimeMs,
      at: sanitized.at || nowIso(),
      tags: {
        fps: sanitized.fps,
        drawCalls: sanitized.drawCalls,
        memoryUsedMb: sanitized.memoryUsedMb,
        runtimeState: sanitized.runtimeState ?? 'unknown',
        source: sanitized.source ?? 'unknown',
        sceneId: sanitized.sceneId ?? 'unknown',
      },
    });
    this.performanceSamples.push(sanitized);
    if (this.performanceSamples.length > this.performanceWindow) {
      this.performanceSamples = this.performanceSamples.slice(-this.performanceWindow);
    }
    return sanitized;
  }

  getSnapshot(): TelemetrySnapshot {
    const performanceBudgetSamples = this.performanceSamples.slice(-this.performanceBudgetWindow);
    const composeAvg = avg(this.composeDurations);
    const promptAvg = avg(this.promptDurations);
    const errorRate = avg(this.scribErrorFlags);
    const fpsAvg = avg(performanceBudgetSamples.map((sample) => sample.fps));
    const frameTimeAvg = avg(performanceBudgetSamples.map((sample) => sample.frameTimeMs));
    const cpuTimeAvg = avg(performanceBudgetSamples.map((sample) => sample.cpuTimeMs));
    const gpuTimeAvg = avg(performanceBudgetSamples.map((sample) => sample.gpuTimeMs));
    const drawCallAvg = avg(performanceBudgetSamples.map((sample) => sample.drawCalls));
    const memoryUsedAvg = avg(performanceBudgetSamples.map((sample) => sample.memoryUsedMb));

    const budgets: TelemetryBudget[] = [
      {
        key: 'compose_duration_ms',
        target: readEnvNumber('REY30_BUDGET_COMPOSE_MS', 40),
        warning: readEnvNumber('REY30_BUDGET_COMPOSE_MS_WARN', 60),
        windowSize: this.composeDurations.length,
        current: composeAvg,
        unit: 'ms',
        status: evaluateMaxBudget(
          composeAvg,
          readEnvNumber('REY30_BUDGET_COMPOSE_MS', 40),
          readEnvNumber('REY30_BUDGET_COMPOSE_MS_WARN', 60)
        ),
      },
      {
        key: 'prompt_to_scene_ms',
        target: readEnvNumber('REY30_BUDGET_PROMPT_TO_SCENE_MS', 8000),
        warning: readEnvNumber('REY30_BUDGET_PROMPT_TO_SCENE_MS_WARN', 12000),
        windowSize: this.promptDurations.length,
        current: promptAvg,
        unit: 'ms',
        status: evaluateMaxBudget(
          promptAvg,
          readEnvNumber('REY30_BUDGET_PROMPT_TO_SCENE_MS', 8000),
          readEnvNumber('REY30_BUDGET_PROMPT_TO_SCENE_MS_WARN', 12000)
        ),
      },
      {
        key: 'scrib_error_rate',
        target: readEnvNumber('REY30_BUDGET_SCRIB_ERROR_RATE', 0.03),
        warning: readEnvNumber('REY30_BUDGET_SCRIB_ERROR_RATE_WARN', 0.08),
        windowSize: this.scribErrorFlags.length,
        current: errorRate,
        unit: 'ratio',
        status: evaluateMaxBudget(
          errorRate,
          readEnvNumber('REY30_BUDGET_SCRIB_ERROR_RATE', 0.03),
          readEnvNumber('REY30_BUDGET_SCRIB_ERROR_RATE_WARN', 0.08)
        ),
      },
      {
        key: 'editor_fps_min',
        target: readEnvNumber('REY30_BUDGET_EDITOR_FPS_MIN', 45),
        warning: readEnvNumber('REY30_BUDGET_EDITOR_FPS_WARN', 38),
        windowSize: performanceBudgetSamples.length,
        current: fpsAvg,
        unit: 'fps',
        status: evaluateMinBudget(
          fpsAvg,
          readEnvNumber('REY30_BUDGET_EDITOR_FPS_MIN', 45),
          readEnvNumber('REY30_BUDGET_EDITOR_FPS_WARN', 38)
        ),
      },
      {
        key: 'editor_frame_time_ms',
        target: readEnvNumber('REY30_BUDGET_EDITOR_FRAME_MS', 24),
        warning: readEnvNumber('REY30_BUDGET_EDITOR_FRAME_MS_WARN', 32),
        windowSize: performanceBudgetSamples.length,
        current: frameTimeAvg,
        unit: 'ms',
        status: evaluateMaxBudget(
          frameTimeAvg,
          readEnvNumber('REY30_BUDGET_EDITOR_FRAME_MS', 24),
          readEnvNumber('REY30_BUDGET_EDITOR_FRAME_MS_WARN', 32)
        ),
      },
      {
        key: 'editor_cpu_time_ms',
        target: readEnvNumber('REY30_BUDGET_EDITOR_CPU_MS', 12),
        warning: readEnvNumber('REY30_BUDGET_EDITOR_CPU_MS_WARN', 18),
        windowSize: performanceBudgetSamples.length,
        current: cpuTimeAvg,
        unit: 'ms',
        status: evaluateMaxBudget(
          cpuTimeAvg,
          readEnvNumber('REY30_BUDGET_EDITOR_CPU_MS', 12),
          readEnvNumber('REY30_BUDGET_EDITOR_CPU_MS_WARN', 18)
        ),
      },
      {
        key: 'editor_draw_calls',
        target: readEnvNumber('REY30_BUDGET_EDITOR_DRAW_CALLS', 2500),
        warning: readEnvNumber('REY30_BUDGET_EDITOR_DRAW_CALLS_WARN', 4000),
        windowSize: performanceBudgetSamples.length,
        current: drawCallAvg,
        unit: 'count',
        status: evaluateMaxBudget(
          drawCallAvg,
          readEnvNumber('REY30_BUDGET_EDITOR_DRAW_CALLS', 2500),
          readEnvNumber('REY30_BUDGET_EDITOR_DRAW_CALLS_WARN', 4000)
        ),
      },
      {
        key: 'editor_memory_used_mb',
        target: readEnvNumber('REY30_BUDGET_EDITOR_MEMORY_MB', 768),
        warning: readEnvNumber('REY30_BUDGET_EDITOR_MEMORY_MB_WARN', 1024),
        windowSize: performanceBudgetSamples.length,
        current: memoryUsedAvg,
        unit: 'mb',
        status: evaluateMaxBudget(
          memoryUsedAvg,
          readEnvNumber('REY30_BUDGET_EDITOR_MEMORY_MB', 768),
          readEnvNumber('REY30_BUDGET_EDITOR_MEMORY_MB_WARN', 1024)
        ),
      },
    ];

    return {
      generatedAt: nowIso(),
      totals: {
        composeSamples: this.composeDurations.length,
        promptSamples: this.promptDurations.length,
        scribErrors: this.events.filter((event) => event.kind === 'scrib_runtime_error').length,
        runtimeForensicsEvents: this.events.filter(
          (event) => event.kind === 'runtime_forensics_event'
        ).length,
        performanceSamples: this.performanceSamples.length,
      },
      averages: {
        composeDurationMs: composeAvg,
        promptToSceneMs: promptAvg,
        editorFps: fpsAvg,
        editorFrameTimeMs: frameTimeAvg,
        editorCpuTimeMs: cpuTimeAvg,
        editorGpuTimeMs: gpuTimeAvg,
        editorDrawCalls: drawCallAvg,
        editorMemoryUsedMb: memoryUsedAvg,
      },
      performance: {
        latest:
          this.performanceSamples.length > 0
            ? this.performanceSamples[this.performanceSamples.length - 1] || null
            : null,
        windowSize: performanceBudgetSamples.length,
      },
      budgets,
      events: this.events.slice(-120),
    };
  }

  getSloSnapshot(): SloSnapshot {
    const base = this.getSnapshot();
    const compose = base.budgets.find((budget) => budget.key === 'compose_duration_ms');
    const prompt = base.budgets.find((budget) => budget.key === 'prompt_to_scene_ms');
    const scrib = base.budgets.find((budget) => budget.key === 'scrib_error_rate');
    const fps = base.budgets.find((budget) => budget.key === 'editor_fps_min');
    const frame = base.budgets.find((budget) => budget.key === 'editor_frame_time_ms');
    const cpu = base.budgets.find((budget) => budget.key === 'editor_cpu_time_ms');
    const drawCalls = base.budgets.find((budget) => budget.key === 'editor_draw_calls');
    const memory = base.budgets.find((budget) => budget.key === 'editor_memory_used_mb');
    const p0ReappearedCount = base.events
      .filter(
        (event) =>
          event.kind === 'runtime_forensics_event' &&
          tagString(event.tags, 'action') === 'p0_reappeared'
      )
      .reduce((total, event) => total + Math.max(1, tagNumber(event.tags, 'p0ReappearedCount')), 0);
    const p0ReappearedTarget = readEnvNumber('REY30_SLO_RUNTIME_FORENSICS_P0_REAPPEARED_TARGET', 0);
    const p0ReappearedWarn = readEnvNumber('REY30_SLO_RUNTIME_FORENSICS_P0_REAPPEARED_WARN', 1);
    const p0ReappearedStatus = evaluateMaxBudget(
      p0ReappearedCount,
      p0ReappearedTarget,
      p0ReappearedWarn
    );

    const indicators: SloIndicator[] = [
      {
        key: 'compose_latency',
        objective: safeNumber(compose?.target || 0),
        current: safeNumber(compose?.current || 0),
        unit: 'ms',
        burnRate: computeMaxBurnRate(compose?.current || 0, compose?.target || 1),
        status: compose?.status || 'ok',
      },
      {
        key: 'prompt_to_scene_latency',
        objective: safeNumber(prompt?.target || 0),
        current: safeNumber(prompt?.current || 0),
        unit: 'ms',
        burnRate: computeMaxBurnRate(prompt?.current || 0, prompt?.target || 1),
        status: prompt?.status || 'ok',
      },
      {
        key: 'scrib_runtime_error_rate',
        objective: safeNumber(scrib?.target || 0.03),
        current: safeNumber(scrib?.current || 0),
        unit: 'ratio',
        burnRate: computeMaxBurnRate(scrib?.current || 0, scrib?.target || 0.03),
        status: scrib?.status || 'ok',
      },
      {
        key: 'editor_fps',
        objective: safeNumber(fps?.target || 55),
        current: safeNumber(fps?.current || 0),
        unit: 'fps',
        burnRate: computeMinBurnRate(fps?.current || 0, fps?.target || 55),
        status: fps?.status || 'ok',
      },
      {
        key: 'editor_frame_time',
        objective: safeNumber(frame?.target || 18),
        current: safeNumber(frame?.current || 0),
        unit: 'ms',
        burnRate: computeMaxBurnRate(frame?.current || 0, frame?.target || 18),
        status: frame?.status || 'ok',
      },
      {
        key: 'editor_cpu_time',
        objective: safeNumber(cpu?.target || 12),
        current: safeNumber(cpu?.current || 0),
        unit: 'ms',
        burnRate: computeMaxBurnRate(cpu?.current || 0, cpu?.target || 12),
        status: cpu?.status || 'ok',
      },
      {
        key: 'editor_draw_calls',
        objective: safeNumber(drawCalls?.target || 2500),
        current: safeNumber(drawCalls?.current || 0),
        unit: 'count',
        burnRate: computeMaxBurnRate(drawCalls?.current || 0, drawCalls?.target || 2500),
        status: drawCalls?.status || 'ok',
      },
      {
        key: 'editor_memory_used',
        objective: safeNumber(memory?.target || 768),
        current: safeNumber(memory?.current || 0),
        unit: 'mb',
        burnRate: computeMaxBurnRate(memory?.current || 0, memory?.target || 768),
        status: memory?.status || 'ok',
      },
      {
        key: 'runtime_forensics_p0_reappeared',
        objective: safeNumber(p0ReappearedTarget),
        current: safeNumber(p0ReappearedCount),
        unit: 'count',
        burnRate: computeMaxBurnRate(p0ReappearedCount, Math.max(1, p0ReappearedTarget)),
        status: p0ReappearedStatus,
      },
    ];

    const overallRank = indicators.reduce((acc, indicator) => Math.max(acc, statusRank(indicator.status)), 0);
    const alerts: SloAlert[] = indicators
      .filter((indicator) => indicator.status !== 'ok')
      .map((indicator) => ({
        id: `slo:${indicator.key}:${indicator.status}`,
        level: indicator.status === 'error' ? 'critical' : 'warning',
        indicator: indicator.key,
        message:
          indicator.status === 'error'
            ? `SLO breached for ${indicator.key}.`
            : `SLO approaching limit for ${indicator.key}.`,
        current: indicator.current,
        objective: indicator.objective,
        at: nowIso(),
      }));

    const errorObjective = safeNumber(scrib?.target || 0.03);
    const errorCurrent = safeNumber(scrib?.current || 0);
    const errorBurnRate = computeMaxBurnRate(errorCurrent, errorObjective);

    return {
      generatedAt: nowIso(),
      overallStatus: statusFromRank(overallRank),
      indicators,
      alerts,
      errorBudget: {
        objective: errorObjective,
        current: errorCurrent,
        remaining: Math.max(0, errorObjective - errorCurrent),
        burnRate: errorBurnRate,
      },
    };
  }

  toPrometheusMetrics(): string {
    const snapshot = this.getSnapshot();
    const slo = this.getSloSnapshot();
    const latest = snapshot.performance.latest;

    const lines = [
      '# HELP rey30_compose_duration_ms_avg Average compose duration in milliseconds.',
      '# TYPE rey30_compose_duration_ms_avg gauge',
      `rey30_compose_duration_ms_avg ${safeNumber(snapshot.averages.composeDurationMs)}`,
      '# HELP rey30_prompt_to_scene_ms_avg Average prompt to scene duration in milliseconds.',
      '# TYPE rey30_prompt_to_scene_ms_avg gauge',
      `rey30_prompt_to_scene_ms_avg ${safeNumber(snapshot.averages.promptToSceneMs)}`,
      '# HELP rey30_scrib_runtime_errors_total Total scrib runtime errors observed.',
      '# TYPE rey30_scrib_runtime_errors_total counter',
      `rey30_scrib_runtime_errors_total ${safeNumber(snapshot.totals.scribErrors)}`,
      '# HELP rey30_runtime_forensics_events_total Total runtime forensics control-plane events observed.',
      '# TYPE rey30_runtime_forensics_events_total counter',
      `rey30_runtime_forensics_events_total ${safeNumber(snapshot.totals.runtimeForensicsEvents)}`,
      '# HELP rey30_runtime_forensics_p0_reappeared_current Current P0 reappeared count in the telemetry window.',
      '# TYPE rey30_runtime_forensics_p0_reappeared_current gauge',
      `rey30_runtime_forensics_p0_reappeared_current ${safeNumber(
        slo.indicators.find((indicator) => indicator.key === 'runtime_forensics_p0_reappeared')?.current || 0
      )}`,
      '# HELP rey30_editor_fps_avg Average editor FPS.',
      '# TYPE rey30_editor_fps_avg gauge',
      `rey30_editor_fps_avg ${safeNumber(snapshot.averages.editorFps)}`,
      '# HELP rey30_editor_frame_time_ms_avg Average editor frame time in milliseconds.',
      '# TYPE rey30_editor_frame_time_ms_avg gauge',
      `rey30_editor_frame_time_ms_avg ${safeNumber(snapshot.averages.editorFrameTimeMs)}`,
      '# HELP rey30_editor_cpu_time_ms_avg Average editor CPU render time in milliseconds.',
      '# TYPE rey30_editor_cpu_time_ms_avg gauge',
      `rey30_editor_cpu_time_ms_avg ${safeNumber(snapshot.averages.editorCpuTimeMs)}`,
      '# HELP rey30_editor_draw_calls_avg Average editor draw call count.',
      '# TYPE rey30_editor_draw_calls_avg gauge',
      `rey30_editor_draw_calls_avg ${safeNumber(snapshot.averages.editorDrawCalls)}`,
      '# HELP rey30_editor_memory_used_mb_avg Average editor memory used in MB.',
      '# TYPE rey30_editor_memory_used_mb_avg gauge',
      `rey30_editor_memory_used_mb_avg ${safeNumber(snapshot.averages.editorMemoryUsedMb)}`,
      '# HELP rey30_editor_performance_samples_total Total editor performance samples observed.',
      '# TYPE rey30_editor_performance_samples_total counter',
      `rey30_editor_performance_samples_total ${safeNumber(snapshot.totals.performanceSamples)}`,
      '# HELP rey30_editor_fps_latest Latest editor FPS sample.',
      '# TYPE rey30_editor_fps_latest gauge',
      `rey30_editor_fps_latest ${safeNumber(latest?.fps || 0)}`,
      '# HELP rey30_editor_draw_calls_latest Latest editor draw call sample.',
      '# TYPE rey30_editor_draw_calls_latest gauge',
      `rey30_editor_draw_calls_latest ${safeNumber(latest?.drawCalls || 0)}`,
      '# HELP rey30_editor_memory_used_mb_latest Latest editor memory used sample in MB.',
      '# TYPE rey30_editor_memory_used_mb_latest gauge',
      `rey30_editor_memory_used_mb_latest ${safeNumber(latest?.memoryUsedMb || 0)}`,
      '# HELP rey30_slo_indicator_status SLO indicator status (0=ok,1=warn,2=error).',
      '# TYPE rey30_slo_indicator_status gauge',
      ...slo.indicators.map(
        (indicator) =>
          `rey30_slo_indicator_status{indicator="${indicator.key}"} ${statusToPromValue(indicator.status)}`
      ),
      '# HELP rey30_slo_indicator_burn_rate SLO burn rate by indicator.',
      '# TYPE rey30_slo_indicator_burn_rate gauge',
      ...slo.indicators.map(
        (indicator) => `rey30_slo_indicator_burn_rate{indicator="${indicator.key}"} ${safeNumber(indicator.burnRate)}`
      ),
      '# HELP rey30_slo_alerts_active Active SLO alerts count.',
      '# TYPE rey30_slo_alerts_active gauge',
      `rey30_slo_alerts_active ${slo.alerts.length}`,
      '',
    ];

    return lines.join('\n');
  }

  reset(): void {
    this.events.length = 0;
    this.composeDurations = [];
    this.promptDurations = [];
    this.scribErrorFlags = [];
    this.performanceSamples = [];
  }

  private pushEvent(event: TelemetryEvent): void {
    this.events.push(event);
    if (this.events.length > this.eventLimit) {
      this.events.splice(0, this.events.length - this.eventLimit);
    }
  }
}

export const engineTelemetry =
  globalThis.__rey30EngineTelemetry || (globalThis.__rey30EngineTelemetry = new EngineTelemetry());
