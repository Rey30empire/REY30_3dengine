type TelemetryEventKind =
  | 'compose_duration_ms'
  | 'prompt_to_scene_ms'
  | 'scrib_runtime_error';
type TelemetryStatus = 'ok' | 'warn' | 'error';

type TelemetryEvent = {
  id: string;
  kind: TelemetryEventKind;
  value: number;
  at: string;
  tags?: Record<string, string | number | boolean>;
};

type TelemetryBudget = {
  key: 'compose_duration_ms' | 'prompt_to_scene_ms' | 'scrib_error_rate';
  target: number;
  windowSize: number;
  status: TelemetryStatus;
  current: number;
  unit: 'ms' | 'ratio';
};

type TelemetrySnapshot = {
  generatedAt: string;
  totals: {
    composeSamples: number;
    promptSamples: number;
    scribErrors: number;
  };
  averages: {
    composeDurationMs: number;
    promptToSceneMs: number;
  };
  budgets: TelemetryBudget[];
  events: TelemetryEvent[];
};

type SloIndicator = {
  key: 'compose_latency' | 'prompt_to_scene_latency' | 'scrib_runtime_error_rate';
  objective: number;
  current: number;
  unit: 'ms' | 'ratio';
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
  return value;
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

export class EngineTelemetry {
  private readonly eventLimit = 500;
  private readonly events: TelemetryEvent[] = [];
  private readonly composeWindow = 120;
  private readonly promptWindow = 80;
  private readonly errorWindow = 200;

  private composeDurations: number[] = [];
  private promptDurations: number[] = [];
  private scribErrorFlags: number[] = [];

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

  getSnapshot(): TelemetrySnapshot {
    const composeAvg = avg(this.composeDurations);
    const promptAvg = avg(this.promptDurations);
    const errorRate = avg(this.scribErrorFlags);

    const budgets: TelemetryBudget[] = [
      {
        key: 'compose_duration_ms',
        target: Number(process.env.REY30_BUDGET_COMPOSE_MS || 40),
        windowSize: this.composeDurations.length,
        current: composeAvg,
        unit: 'ms',
        status: composeAvg <= Number(process.env.REY30_BUDGET_COMPOSE_MS || 40)
          ? 'ok'
          : composeAvg <= Number(process.env.REY30_BUDGET_COMPOSE_MS_WARN || 60)
            ? 'warn'
            : 'error',
      },
      {
        key: 'prompt_to_scene_ms',
        target: Number(process.env.REY30_BUDGET_PROMPT_TO_SCENE_MS || 8000),
        windowSize: this.promptDurations.length,
        current: promptAvg,
        unit: 'ms',
        status: promptAvg <= Number(process.env.REY30_BUDGET_PROMPT_TO_SCENE_MS || 8000)
          ? 'ok'
          : promptAvg <= Number(process.env.REY30_BUDGET_PROMPT_TO_SCENE_MS_WARN || 12000)
            ? 'warn'
            : 'error',
      },
      {
        key: 'scrib_error_rate',
        target: Number(process.env.REY30_BUDGET_SCRIB_ERROR_RATE || 0.03),
        windowSize: this.scribErrorFlags.length,
        current: errorRate,
        unit: 'ratio',
        status: errorRate <= Number(process.env.REY30_BUDGET_SCRIB_ERROR_RATE || 0.03)
          ? 'ok'
          : errorRate <= Number(process.env.REY30_BUDGET_SCRIB_ERROR_RATE_WARN || 0.08)
            ? 'warn'
            : 'error',
      },
    ];

    return {
      generatedAt: nowIso(),
      totals: {
        composeSamples: this.composeDurations.length,
        promptSamples: this.promptDurations.length,
        scribErrors: this.events.filter((event) => event.kind === 'scrib_runtime_error').length,
      },
      averages: {
        composeDurationMs: composeAvg,
        promptToSceneMs: promptAvg,
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

    const indicators: SloIndicator[] = [
      {
        key: 'compose_latency',
        objective: safeNumber(compose?.target || 0),
        current: safeNumber(compose?.current || 0),
        unit: 'ms',
        burnRate: safeNumber((compose?.current || 0) / Math.max((compose?.target || 1), 1e-6)),
        status: compose?.status || 'ok',
      },
      {
        key: 'prompt_to_scene_latency',
        objective: safeNumber(prompt?.target || 0),
        current: safeNumber(prompt?.current || 0),
        unit: 'ms',
        burnRate: safeNumber((prompt?.current || 0) / Math.max((prompt?.target || 1), 1e-6)),
        status: prompt?.status || 'ok',
      },
      {
        key: 'scrib_runtime_error_rate',
        objective: safeNumber(scrib?.target || 0.03),
        current: safeNumber(scrib?.current || 0),
        unit: 'ratio',
        burnRate: safeNumber((scrib?.current || 0) / Math.max((scrib?.target || 0.03), 1e-6)),
        status: scrib?.status || 'ok',
      },
    ];

    const overallRank = indicators.reduce((acc, indicator) => Math.max(acc, statusRank(indicator.status)), 0);
    const alerts: SloAlert[] = indicators
      .filter((indicator) => indicator.status !== 'ok')
      .map((indicator) => ({
        id: randomId(),
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
    const errorBurnRate = safeNumber(errorCurrent / Math.max(errorObjective, 1e-6));

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
