import { describe, expect, it } from 'vitest';
import { engineTelemetry } from '@/engine/telemetry/engineTelemetry';

describe('Engine telemetry', () => {
  it('records compose/prompt/error/performance metrics and computes snapshot', () => {
    engineTelemetry.reset();
    engineTelemetry.recordComposeDuration(12, { sceneId: 'scene_01' });
    engineTelemetry.recordComposeDuration(22, { sceneId: 'scene_01' });
    engineTelemetry.recordPromptToSceneDuration(1500, { mode: 'MODE_AI_FIRST' });
    engineTelemetry.recordScribRuntimeError({ type: 'movement' });
    engineTelemetry.recordRuntimeForensicsEvent({ action: 'prune_dry_run' });
    engineTelemetry.recordPerformanceSample({
      fps: 58,
      frameTimeMs: 17.2,
      cpuTimeMs: 8.4,
      gpuTimeMs: 0,
      drawCalls: 1240,
      triangles: 12000,
      vertices: 36000,
      memoryUsedMb: 412,
      memoryAllocatedMb: 620,
      textures: 21,
      meshes: 16,
      audioBuffers: 3,
      runtimeState: 'PLAYING',
      sceneId: 'scene_01',
      source: 'unit_test',
    });

    const snapshot = engineTelemetry.getSnapshot();
    expect(snapshot.totals.composeSamples).toBe(2);
    expect(snapshot.totals.promptSamples).toBe(1);
    expect(snapshot.totals.scribErrors).toBe(1);
    expect(snapshot.totals.runtimeForensicsEvents).toBe(1);
    expect(snapshot.totals.performanceSamples).toBe(1);
    expect(snapshot.averages.composeDurationMs).toBeGreaterThan(10);
    expect(snapshot.performance.latest?.sceneId).toBe('scene_01');
    expect(snapshot.budgets.length).toBeGreaterThanOrEqual(8);

    const slo = engineTelemetry.getSloSnapshot();
    expect(slo.indicators.length).toBeGreaterThanOrEqual(8);
    expect(['ok', 'warn', 'error']).toContain(slo.overallStatus);

    const metrics = engineTelemetry.toPrometheusMetrics();
    expect(metrics).toContain('rey30_compose_duration_ms_avg');
    expect(metrics).toContain('rey30_editor_fps_avg');
    expect(metrics).toContain('rey30_editor_draw_calls_latest');
    expect(metrics).toContain('rey30_runtime_forensics_events_total');
    expect(metrics).toContain('rey30_slo_alerts_active');
  });

  it('marks performance budgets as error when the sample breaches frame and memory thresholds', () => {
    engineTelemetry.reset();
    engineTelemetry.recordPerformanceSample({
      fps: 22,
      frameTimeMs: 41,
      cpuTimeMs: 25,
      gpuTimeMs: 0,
      drawCalls: 5200,
      triangles: 42000,
      vertices: 126000,
      memoryUsedMb: 1400,
      memoryAllocatedMb: 1800,
      textures: 64,
      meshes: 81,
      audioBuffers: 7,
      runtimeState: 'PLAYING',
      source: 'budget_test',
    });

    const snapshot = engineTelemetry.getSnapshot();
    const failingKeys = snapshot.budgets
      .filter((budget) => budget.status === 'error')
      .map((budget) => budget.key);

    expect(failingKeys).toContain('editor_fps_min');
    expect(failingKeys).toContain('editor_frame_time_ms');
    expect(failingKeys).toContain('editor_draw_calls');
    expect(failingKeys).toContain('editor_memory_used_mb');
  });

  it('raises SLO alerts when runtime forensics reports repeated P0 reappearances', () => {
    engineTelemetry.reset();
    engineTelemetry.recordRuntimeForensicsEvent({
      action: 'p0_reappeared',
      p0ReappearedCount: 2,
      targets: 'scribs/movement.scrib.ts|scribs/collider.scrib.ts',
    });

    const slo = engineTelemetry.getSloSnapshot();
    const p0Indicator = slo.indicators.find(
      (indicator) => indicator.key === 'runtime_forensics_p0_reappeared'
    );

    expect(p0Indicator).toMatchObject({
      current: 2,
      status: 'error',
    });
    expect(slo.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: 'critical',
          indicator: 'runtime_forensics_p0_reappeared',
        }),
      ])
    );
  });

  it('evaluates editor performance budgets against the recent sample window instead of cold-start spikes', () => {
    engineTelemetry.reset();
    engineTelemetry.recordPerformanceSample({
      fps: 11,
      frameTimeMs: 91.9,
      cpuTimeMs: 360.2,
      gpuTimeMs: 0,
      drawCalls: 3,
      triangles: 2,
      vertices: 6,
      memoryUsedMb: 12.8,
      memoryAllocatedMb: 22,
      textures: 3,
      meshes: 13,
      audioBuffers: 0,
      runtimeState: 'IDLE',
      source: 'cold_start',
    });

    for (let index = 0; index < 5; index += 1) {
      engineTelemetry.recordPerformanceSample({
        fps: 66,
        frameTimeMs: 15.3,
        cpuTimeMs: 0.4,
        gpuTimeMs: 0,
        drawCalls: 3,
        triangles: 2,
        vertices: 6,
        memoryUsedMb: 12.8,
        memoryAllocatedMb: 22,
        textures: 3,
        meshes: 13,
        audioBuffers: 0,
        runtimeState: 'IDLE',
        source: 'steady_state',
      });
    }

    const snapshot = engineTelemetry.getSnapshot();
    const fpsBudget = snapshot.budgets.find((budget) => budget.key === 'editor_fps_min');
    const frameBudget = snapshot.budgets.find((budget) => budget.key === 'editor_frame_time_ms');
    const cpuBudget = snapshot.budgets.find((budget) => budget.key === 'editor_cpu_time_ms');

    expect(snapshot.totals.performanceSamples).toBe(6);
    expect(snapshot.performance.windowSize).toBe(5);
    expect(fpsBudget?.status).toBe('ok');
    expect(frameBudget?.status).toBe('ok');
    expect(cpuBudget?.status).toBe('ok');
  });
});
