import { describe, expect, it } from 'vitest';
import { engineTelemetry } from '@/engine/telemetry/engineTelemetry';

describe('Engine telemetry', () => {
  it('records compose/prompt/error metrics and computes snapshot', () => {
    engineTelemetry.reset();
    engineTelemetry.recordComposeDuration(12, { sceneId: 'scene_01' });
    engineTelemetry.recordComposeDuration(22, { sceneId: 'scene_01' });
    engineTelemetry.recordPromptToSceneDuration(1500, { mode: 'MODE_AI_FIRST' });
    engineTelemetry.recordScribRuntimeError({ type: 'movement' });

    const snapshot = engineTelemetry.getSnapshot();
    expect(snapshot.totals.composeSamples).toBe(2);
    expect(snapshot.totals.promptSamples).toBe(1);
    expect(snapshot.totals.scribErrors).toBe(1);
    expect(snapshot.averages.composeDurationMs).toBeGreaterThan(10);
    expect(snapshot.budgets.length).toBe(3);

    const slo = engineTelemetry.getSloSnapshot();
    expect(slo.indicators.length).toBe(3);
    expect(['ok', 'warn', 'error']).toContain(slo.overallStatus);

    const metrics = engineTelemetry.toPrometheusMetrics();
    expect(metrics).toContain('rey30_compose_duration_ms_avg');
    expect(metrics).toContain('rey30_slo_alerts_active');
  });
});
