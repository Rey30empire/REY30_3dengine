import { describe, expect, it } from 'vitest';
import {
  estimateProviderCostUsd,
  generateUsageRecommendations,
  type UsagePolicy,
  type UsageSummary,
  type UsageTrendPoint,
} from '@/lib/security/usage-governance';

describe('Usage governance cost estimation', () => {
  it('returns non-zero estimates for cloud expensive actions and zero for local chat', () => {
    const openaiChat = estimateProviderCostUsd('openai', 'chat');
    const openaiVideo = estimateProviderCostUsd('openai', 'video');
    const meshyRefine = estimateProviderCostUsd('meshy', 'refine');
    const localChat = estimateProviderCostUsd('ollama', 'chat');

    expect(openaiChat).toBeGreaterThan(0);
    expect(openaiVideo).toBeGreaterThan(openaiChat);
    expect(meshyRefine).toBeGreaterThan(0);
    expect(localChat).toBe(0);
  });

  it('generates savings recommendations when projection and concentration are risky', () => {
    const policy: UsagePolicy = {
      monthlyBudgetUsd: 25,
      hardStopEnabled: true,
      warningThresholdRatio: 0.85,
      perProviderBudgets: {
        openai: 20,
        meshy: 10,
        runway: 10,
        ollama: null,
        vllm: null,
        llamacpp: null,
      },
    };

    const current: UsageSummary = {
      period: '2026-03',
      totals: {
        requestCount: 120,
        estimatedCostUsd: 23,
        monthlyBudgetUsd: 25,
        remainingBudgetUsd: 2,
        status: 'warning',
      },
      perProvider: {
        openai: {
          requestCount: 110,
          estimatedCostUsd: 20,
          budgetUsd: 20,
          remainingBudgetUsd: 0,
          blocked: false,
          status: 'warning',
        },
        meshy: {
          requestCount: 10,
          estimatedCostUsd: 3,
          budgetUsd: 10,
          remainingBudgetUsd: 7,
          blocked: false,
          status: 'ok',
        },
        runway: {
          requestCount: 0,
          estimatedCostUsd: 0,
          budgetUsd: 10,
          remainingBudgetUsd: 10,
          blocked: false,
          status: 'ok',
        },
        ollama: {
          requestCount: 0,
          estimatedCostUsd: 0,
          budgetUsd: null,
          remainingBudgetUsd: null,
          blocked: false,
          status: 'ok',
        },
        vllm: {
          requestCount: 0,
          estimatedCostUsd: 0,
          budgetUsd: null,
          remainingBudgetUsd: null,
          blocked: false,
          status: 'ok',
        },
        llamacpp: {
          requestCount: 0,
          estimatedCostUsd: 0,
          budgetUsd: null,
          remainingBudgetUsd: null,
          blocked: false,
          status: 'ok',
        },
      },
    };

    const trend: UsageTrendPoint[] = [
      {
        period: '2026-01',
        requestCount: 40,
        estimatedCostUsd: 10,
        monthlyBudgetUsd: 25,
        remainingBudgetUsd: 15,
        status: 'ok',
        deltaCostUsd: null,
        deltaCostPct: null,
      },
      {
        period: '2026-02',
        requestCount: 55,
        estimatedCostUsd: 12,
        monthlyBudgetUsd: 25,
        remainingBudgetUsd: 13,
        status: 'ok',
        deltaCostUsd: 2,
        deltaCostPct: 0.2,
      },
      {
        period: '2026-03',
        requestCount: 120,
        estimatedCostUsd: 23,
        monthlyBudgetUsd: 25,
        remainingBudgetUsd: 2,
        status: 'warning',
        deltaCostUsd: 11,
        deltaCostPct: 0.9167,
      },
    ];

    const recommendations = generateUsageRecommendations({
      policy,
      current,
      trend,
      projectedMonthEndUsd: 40,
      topProvider: 'openai',
      topProviderShare: 0.87,
    });

    const ids = recommendations.map((item) => item.id);
    expect(ids).toContain('budget_warning');
    expect(ids).toContain('projection_over_budget');
    expect(ids).toContain('provider_concentration');
  });
});
