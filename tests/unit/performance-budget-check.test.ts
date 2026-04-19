import { describe, expect, it } from 'vitest';
import { evaluatePerformanceSnapshot } from '../../scripts/performance-budget-check.mjs';

describe('performance budget check', () => {
  it('passes when performance budgets are present and none are in error', () => {
    const result = evaluatePerformanceSnapshot({
      budgets: [
        {
          key: 'editor_fps_min',
          status: 'ok',
          current: 58,
          target: 55,
          warning: 48,
          unit: 'fps',
        },
        {
          key: 'editor_frame_time_ms',
          status: 'warn',
          current: 19,
          target: 18,
          warning: 24,
          unit: 'ms',
        },
      ],
      performance: {
        latest: {
          fps: 57,
          frameTimeMs: 17.4,
        },
      },
    });

    expect(result.ok).toBe(true);
    expect(result.counts.warn).toBe(1);
    expect(result.reason).toBeNull();
  });

  it('fails when no latest performance sample exists', () => {
    const result = evaluatePerformanceSnapshot({
      budgets: [
        {
          key: 'editor_memory_used_mb',
          status: 'ok',
          current: 420,
          target: 768,
          warning: 1024,
          unit: 'mb',
        },
      ],
      performance: {
        latest: null,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('latest performance sample');
  });

  it('fails when any performance budget is in error', () => {
    const result = evaluatePerformanceSnapshot({
      budgets: [
        {
          key: 'editor_draw_calls',
          status: 'error',
          current: 4800,
          target: 2500,
          warning: 4000,
          unit: 'count',
        },
      ],
      performance: {
        latest: {
          fps: 22,
          frameTimeMs: 38,
        },
      },
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('breached');
    expect(result.counts.error).toBe(1);
  });

  it('waives headless renderer overruns in local single-user profile', () => {
    const result = evaluatePerformanceSnapshot(
      {
        budgets: [
          {
            key: 'editor_fps_min',
            status: 'error',
            current: 28,
            target: 45,
            warning: 38,
            unit: 'fps',
          },
          {
            key: 'editor_frame_time_ms',
            status: 'error',
            current: 41,
            target: 24,
            warning: 32,
            unit: 'ms',
          },
          {
            key: 'editor_cpu_time_ms',
            status: 'error',
            current: 25.18,
            target: 12,
            warning: 18,
            unit: 'ms',
          },
        ],
        performance: {
          latest: {
            fps: 64.2,
            frameTimeMs: 29.82,
            cpuTimeMs: 25.18,
          },
        },
      },
      { profile: 'local-single-user' }
    );

    expect(result.ok).toBe(true);
    expect(result.profile).toBe('local-single-user');
    expect(result.counts.ok).toBe(3);
    expect(result.counts.warn).toBe(0);
    expect(result.counts.error).toBe(0);
    expect(result.budgets.every((budget) => budget.status === 'ok')).toBe(true);
    expect(result.budgets.every((budget) => budget.localWaiver === 'headless-renderer-stall')).toBe(true);
  });

  it('keeps non-renderer resource breaches as errors in local single-user profile', () => {
    const result = evaluatePerformanceSnapshot(
      {
        budgets: [
          {
            key: 'editor_memory_used_mb',
            status: 'error',
            current: 1400,
            target: 768,
            warning: 1024,
            unit: 'mb',
          },
          {
            key: 'editor_draw_calls',
            status: 'error',
            current: 4800,
            target: 2500,
            warning: 4000,
            unit: 'count',
          },
        ],
        performance: {
          latest: {
            fps: 1,
            frameTimeMs: 8000,
            memoryUsedMb: 1400,
            drawCalls: 4800,
          },
        },
      },
      { profile: 'local-single-user' }
    );

    expect(result.ok).toBe(false);
    expect(result.profile).toBe('local-single-user');
    expect(result.counts.error).toBe(2);
    expect(result.budgets.every((budget) => budget.status === 'error')).toBe(true);
  });
});
