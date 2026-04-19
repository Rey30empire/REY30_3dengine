import { describe, expect, it } from 'vitest';
import { evaluateQaTotalReport } from '../../scripts/qa-total-check.mjs';

function makeBaseSummary() {
  return {
    steps: [
      {
        name: 'release-check',
        ok: true,
        command: 'pnpm run release:check',
      },
      {
        name: 'test-stability',
        ok: true,
        reportPath: 'output/final-seal/test-stability-report.json',
      },
      {
        name: 'editor-critical-smokes',
        ok: true,
        reportPath: 'output/final-seal/editor-critical-smokes/report.json',
      },
      {
        name: 'shadow-workspace-smoke',
        ok: true,
        reportPath: 'output/final-seal/shadow-workspace-smoke/report.json',
      },
      {
        name: 'editor-performance-smoke',
        ok: true,
        reportPath: 'output/final-seal/editor-performance-smoke/report.json',
      },
      {
        name: 'performance-budget-check',
        ok: true,
        reportPath: 'output/final-seal/performance-budget-report.json',
      },
      {
        name: 'postdeploy-smoke',
        ok: true,
        reportPath: 'output/final-seal/postdeploy-smoke-report.json',
      },
      {
        name: 'production-preflight',
        ok: true,
        reportPath: 'output/final-seal/production-preflight-report.json',
      },
      {
        name: 'release-security',
        ok: true,
        reportPath: 'output/final-seal/release-security-report.json',
      },
    ],
    testStability: {
      ok: true,
      iterationsRequested: 3,
      completedIterations: 3,
      exerciseBuild: true,
      iterations: [
        { iteration: 1, ok: true },
        { iteration: 2, ok: true },
        { iteration: 3, ok: true },
      ],
    },
    editorCritical: {
      ok: true,
      iterationsRequested: 2,
      completedIterations: 2,
      iterations: [
        {
          iteration: 1,
          ok: true,
          results: [
            { id: 'editor-world', ok: true, consoleErrors: 0 },
            { id: 'editor-paint', ok: true, consoleErrors: 0 },
          ],
        },
        {
          iteration: 2,
          ok: true,
          results: [
            { id: 'editor-world', ok: true, consoleErrors: 0 },
            { id: 'editor-paint', ok: true, consoleErrors: 0 },
          ],
        },
      ],
    },
    shadowWorkspace: {
      ok: true,
      steps: [
        { name: 'prisma-generate', status: 'passed' },
        { name: 'typecheck', status: 'passed' },
      ],
    },
    performanceSmoke: {
      ok: true,
      consoleErrors: [],
      performanceSnapshot: {
        totals: {
          performanceSamples: 3,
        },
      },
    },
    performanceBudget: {
      ok: true,
      counts: {
        ok: 5,
        warn: 0,
        error: 0,
      },
    },
    postdeploySmoke: {
      ok: true,
      skippedCount: 0,
      checks: [{ name: 'home', status: 'passed' }],
    },
    productionPreflight: {
      ok: true,
      summary: {
        passed: 10,
        warning: 0,
        failed: 0,
        skipped: 0,
      },
      checks: [],
    },
    releaseSecurity: {
      ok: true,
      checks: [{ name: 'health-ready', status: 'passed' }],
    },
  };
}

describe('qa total check', () => {
  it('marks QA and RC as green when every gate is present with no warnings', () => {
    const result = evaluateQaTotalReport(makeBaseSummary());

    expect(result.ok).toBe(true);
    expect(result.bugBar.sev1).toBe(0);
    expect(result.bugBar.sev2).toBe(0);
    expect(result.releaseCandidate.eligible).toBe(true);
    expect(result.localSingleUser.eligible).toBe(true);
    expect(result.finalSealTrue.eligible).toBe(false);
    expect(result.summary.passedGates).toBe(result.summary.totalGates);
  });

  it('raises sev1 when repeated stability evidence is missing or incomplete', () => {
    const summary = makeBaseSummary();
    summary.testStability.completedIterations = 1;
    summary.testStability.iterations = [{ iteration: 1, ok: true }];

    const result = evaluateQaTotalReport(summary);

    expect(result.ok).toBe(false);
    expect(result.bugBar.sev1).toBeGreaterThan(0);
    expect(result.bugBar.issues.some((issue) => issue.gate === 'stability-repeat')).toBe(true);
    expect(result.releaseCandidate.eligible).toBe(false);
  });

  it('keeps QA green but blocks RC when only sev2 warnings remain', () => {
    const summary = makeBaseSummary();
    summary.performanceBudget.counts.warn = 2;
    summary.productionPreflight.summary.warning = 1;

    const result = evaluateQaTotalReport(summary);

    expect(result.ok).toBe(true);
    expect(result.bugBar.sev1).toBe(0);
    expect(result.bugBar.sev2).toBe(2);
    expect(result.releaseCandidate.eligible).toBe(false);
    expect(result.localSingleUser.eligible).toBe(false);
  });

  it('keeps local single-user eligible when the only sev2 is a performance-budget warning', () => {
    const summary = makeBaseSummary();
    summary.performanceBudget.counts.warn = 1;

    const result = evaluateQaTotalReport(summary);

    expect(result.ok).toBe(true);
    expect(result.bugBar.sev1).toBe(0);
    expect(result.bugBar.sev2).toBe(1);
    expect(result.releaseCandidate.eligible).toBe(false);
    expect(result.localSingleUser.eligible).toBe(true);
  });

  it('marks finalSealTrue only when the report comes from a real target seal profile', () => {
    const summary = makeBaseSummary() as ReturnType<typeof makeBaseSummary> & {
      sealProfile?: {
        mode: string;
        usedMockRateLimitBackend: boolean;
        usedLocalProductionServer: boolean;
        explicitSmokeCredentials: boolean;
        storage: {
          allDurableShared: boolean;
        };
      };
    };
    summary.sealProfile = {
      mode: 'target-real',
      usedMockRateLimitBackend: false,
      usedLocalProductionServer: false,
      explicitSmokeCredentials: true,
      storage: {
        allDurableShared: true,
      },
    };

    const result = evaluateQaTotalReport(summary);

    expect(result.releaseCandidate.eligible).toBe(true);
    expect(result.localSingleUser.eligible).toBe(true);
    expect(result.finalSealTrue.eligible).toBe(true);
  });

  it('blocks release and final seal when a target-real report still has performance warnings', () => {
    const summary = makeBaseSummary() as ReturnType<typeof makeBaseSummary> & {
      sealProfile?: {
        mode: string;
        usedMockRateLimitBackend: boolean;
        usedLocalProductionServer: boolean;
        explicitSmokeCredentials: boolean;
        storage: {
          allDurableShared: boolean;
        };
      };
    };
    summary.performanceBudget.counts.warn = 1;
    summary.sealProfile = {
      mode: 'target-real',
      usedMockRateLimitBackend: false,
      usedLocalProductionServer: false,
      explicitSmokeCredentials: true,
      storage: {
        allDurableShared: true,
      },
    };

    const result = evaluateQaTotalReport(summary);

    expect(result.ok).toBe(true);
    expect(result.bugBar.sev2).toBe(1);
    expect(result.releaseCandidate.eligible).toBe(false);
    expect(result.finalSealTrue.eligible).toBe(false);
    expect(
      result.finalSealTrue.requirements.find((requirement) => requirement.id === 'zero-sev2')?.ok
    ).toBe(false);
  });
});
