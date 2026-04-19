import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import {
  collectReleaseFreezeArtifacts,
  createReleaseFreezeBundle,
  evaluateReleaseFreezeReport,
} from '../../scripts/release-freeze.mjs';

const tempRoots: string[] = [];

function makeBaseSummary() {
  return {
    ok: true,
    releaseCandidateEligible: true,
    finalSealTrueEligible: true,
    steps: [
      {
        name: 'release-check',
        ok: true,
      },
      {
        name: 'performance-budget-check',
        ok: true,
        reportPath: 'output/final-seal/performance-budget-report.json',
      },
      {
        name: 'production-preflight',
        ok: true,
        reportPath: 'output/final-seal/production-preflight-report.json',
      },
    ],
    qaTotal: {
      ok: true,
      bugBar: {
        sev1: 0,
        sev2: 0,
      },
      summary: {
        totalGates: 9,
        passedGates: 9,
        failedGates: 0,
      },
      releaseCandidate: {
        eligible: true,
      },
      finalSealTrue: {
        eligible: true,
      },
    },
    performanceBudget: {
      counts: {
        ok: 5,
        warn: 0,
        error: 0,
      },
      latest: {
        fps: 63.2,
        frameTimeMs: 16.68,
        cpuTimeMs: 10.846,
        memoryUsedMb: 14.5,
      },
    },
    performanceSmoke: {
      performanceSampleCount: 6,
    },
    productionPreflight: {
      checks: [
        {
          id: 'ops-backup-create',
          status: 'passed',
          backupId: 'backup_20260404_rc',
        },
        {
          id: 'ops-backup-verify',
          status: 'passed',
          backupId: 'backup_20260404_rc',
          checkedFiles: 3,
        },
        {
          id: 'ops-backup-restore-dry-run',
          status: 'passed',
          backupId: 'backup_20260404_rc',
          operations: 2,
        },
      ],
    },
  };
}

async function writeJson(filePath: string, payload: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0, tempRoots.length).map((root) =>
      rm(root, { recursive: true, force: true })
    )
  );
});

describe('release freeze', () => {
  it('accepts a green RC report with rollback evidence', () => {
    const result = evaluateReleaseFreezeReport(makeBaseSummary());

    expect(result.ok).toBe(true);
    expect(result.releaseCandidateEligible).toBe(true);
    expect(result.finalSealTrueEligible).toBe(true);
    expect(result.rollback.backupId).toBe('backup_20260404_rc');
    expect(result.performance.budgetCounts.warn).toBe(0);
  });

  it('blocks freeze when the release candidate is not eligible', () => {
    const summary = makeBaseSummary();
    summary.releaseCandidateEligible = false;
    summary.qaTotal.releaseCandidate.eligible = false;
    summary.qaTotal.bugBar.sev2 = 1;
    summary.performanceBudget.counts.warn = 1;

    const result = evaluateReleaseFreezeReport(summary);

    expect(result.ok).toBe(false);
    expect(result.reasons).toContain('release candidate is not eligible.');
    expect(result.reasons).toContain('bug bar still has sev2 findings.');
    expect(result.reasons).toContain('performance budgets still have warning counts.');
  });

  it('blocks freeze when the final seal true target requirements are missing', () => {
    const summary = makeBaseSummary();
    summary.finalSealTrueEligible = false;
    summary.qaTotal.finalSealTrue.eligible = false;

    const result = evaluateReleaseFreezeReport(summary);

    expect(result.ok).toBe(false);
    expect(result.releaseCandidateEligible).toBe(true);
    expect(result.finalSealTrueEligible).toBe(false);
    expect(result.reasons).toContain('final seal true is not eligible.');
  });

  it('collects escrow artifacts from the final seal summary without duplicates', () => {
    const summary = makeBaseSummary();
    summary.steps.push({
      name: 'postdeploy-smoke',
      ok: true,
      reportPath: 'output/final-seal/performance-budget-report.json',
    });

    const artifacts = collectReleaseFreezeArtifacts(summary, {
      inputReportPath: 'output/final-seal/report.json',
      qaReportPath: 'output/qa-total/report.json',
    });

    expect(artifacts.map((artifact) => artifact.sourcePath)).toEqual([
      path.join('output', 'final-seal', 'report.json'),
      path.join('output', 'qa-total', 'report.json'),
      path.join('output', 'final-seal', 'performance-budget-report.json'),
      path.join('output', 'final-seal', 'production-preflight-report.json'),
    ]);
  });

  it('writes a freeze bundle with manifest, handoff, rollback plan and escrowed evidence', async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), 'rey30-release-freeze-'));
    tempRoots.push(rootDir);

    const summary = makeBaseSummary();
    const finalSealPath = path.join(rootDir, 'output', 'final-seal', 'report.json');
    const qaReportPath = path.join(rootDir, 'output', 'qa-total', 'report.json');
    const perfReportPath = path.join(
      rootDir,
      'output',
      'final-seal',
      'performance-budget-report.json'
    );
    const preflightReportPath = path.join(
      rootDir,
      'output',
      'final-seal',
      'production-preflight-report.json'
    );
    const packageJsonPath = path.join(rootDir, 'package.json');

    await writeJson(finalSealPath, summary);
    await writeJson(qaReportPath, {
      ok: true,
      qaTotal: summary.qaTotal,
    });
    await writeJson(perfReportPath, {
      ok: true,
      counts: summary.performanceBudget.counts,
      latest: summary.performanceBudget.latest,
    });
    await writeJson(preflightReportPath, {
      ok: true,
      checks: summary.productionPreflight.checks,
    });
    await writeJson(packageJsonPath, {
      name: 'nextjs_tailwind_shadcn_ts',
      version: '0.2.0',
    });

    const result = await createReleaseFreezeBundle({
      rootDir,
      summary,
      inputReportPath: 'output/final-seal/report.json',
      qaReportPath: 'output/qa-total/report.json',
      outputRoot: 'output/release-freeze',
      freezeId: 'rc-test-freeze',
      now: new Date('2026-04-04T19:05:00.000Z'),
      gitMetadata: {
        commit: 'abc123',
        branch: 'main',
        dirty: true,
        dirtyFileCount: 2,
        dirtyFilesSample: [' M package.json', ' M scripts/release-freeze.mjs'],
      },
    });

    const manifest = JSON.parse(
      await readFile(path.join(rootDir, result.manifestPath), 'utf8')
    );
    const handoff = await readFile(path.join(rootDir, result.handoffPath), 'utf8');
    const rollbackPlan = await readFile(
      path.join(rootDir, result.rollbackPlanPath),
      'utf8'
    );
    const cutoverRunbook = await readFile(
      path.join(rootDir, result.cutoverRunbookPath),
      'utf8'
    );
    const publicationChecklist = await readFile(
      path.join(rootDir, result.publicationChecklistPath),
      'utf8'
    );
    const escrowedFinalSeal = JSON.parse(
      await readFile(
        path.join(
          rootDir,
          'output',
          'release-freeze',
          'rc-test-freeze',
          'evidence',
          'output',
          'final-seal',
          'report.json'
        ),
        'utf8'
      )
    );

    expect(result.ok).toBe(true);
    expect(manifest.freezeId).toBe('rc-test-freeze');
    expect(manifest.rollback.backupId).toBe('backup_20260404_rc');
    expect(manifest.releaseCandidate.eligible).toBe(true);
    expect(handoff).toContain('backup_20260404_rc');
    expect(handoff).toContain('production-cutover-runbook.md');
    expect(rollbackPlan).toContain('backup_20260404_rc');
    expect(cutoverRunbook).toContain('git tag -a rc-test-freeze');
    expect(publicationChecklist).toContain('Create annotated Git tag `rc-test-freeze`.');
    expect(escrowedFinalSeal.releaseCandidateEligible).toBe(true);
  });
});
