import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const QA_TOTAL_POLICY = {
  stabilityIterationsMin: 3,
  editorCriticalIterationsMin: 2,
};

function parseArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) continue;
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args.set(item.slice(2), 'true');
      continue;
    }
    args.set(item.slice(2), next);
    index += 1;
  }
  return args;
}

function getStep(summary, name) {
  return summary?.steps?.find((step) => step?.name === name) || null;
}

function makeMatrixEntry(id, area, label, present, ok, details = {}) {
  return {
    id,
    area,
    label,
    present,
    ok,
    status: present ? (ok ? 'passed' : 'failed') : 'missing',
    ...details,
  };
}

function makeIssue(severity, gate, message, details = {}) {
  return {
    severity,
    gate,
    message,
    ...details,
  };
}

function isLocalSingleUserTolerableIssue(issue) {
  if (!issue || issue.severity !== 'sev2') return false;
  return issue.gate === 'performance-budget';
}

function sumBy(items, selector) {
  return (Array.isArray(items) ? items : []).reduce((total, item) => total + selector(item), 0);
}

function countFailedChecks(report) {
  return (Array.isArray(report?.checks) ? report.checks : []).filter(
    (check) => check?.status === 'failed'
  ).length;
}

function countConsoleErrors(iterations) {
  return sumBy(iterations, (iteration) =>
    sumBy(iteration?.results, (result) => Number(result?.consoleErrors || 0))
  );
}

function describeIterations(report) {
  const iterations = Array.isArray(report?.iterations) ? report.iterations : [];
  return {
    requested: Number(report?.iterationsRequested || iterations.length || 0),
    completed: Number(report?.completedIterations || iterations.length || 0),
    iterations,
  };
}

export function evaluateQaTotalReport(summary, options = {}) {
  const policy = {
    ...QA_TOTAL_POLICY,
    ...(options.policy || {}),
  };
  const issues = [];
  const matrix = [];

  const releaseCheck = summary?.releaseCheck || getStep(summary, 'release-check');
  const stabilityReport = summary?.testStability || null;
  const editorCriticalReport = summary?.editorCritical || null;
  const shadowWorkspaceReport = summary?.shadowWorkspace || null;
  const performanceSmokeReport = summary?.performanceSmoke || null;
  const performanceBudgetReport = summary?.performanceBudget || null;
  const postdeploySmokeReport = summary?.postdeploySmoke || null;
  const productionPreflightReport = summary?.productionPreflight || null;
  const releaseSecurityReport = summary?.releaseSecurity || null;
  const sealProfile = summary?.sealProfile || null;

  const stability = describeIterations(stabilityReport);
  const editorCritical = describeIterations(editorCriticalReport);
  const editorCriticalConsoleErrors = countConsoleErrors(editorCritical.iterations);
  const performanceBudgetWarns = Number(performanceBudgetReport?.counts?.warn || 0);
  const productionPreflightWarnings = Number(productionPreflightReport?.summary?.warning || 0);
  const postdeploySkipped = Number(postdeploySmokeReport?.skippedCount || 0);
  const shadowFailedSteps = Array.isArray(shadowWorkspaceReport?.steps)
    ? shadowWorkspaceReport.steps.filter((step) => step?.status === 'failed').map((step) => step.name)
    : [];

  const releaseCheckEntry = makeMatrixEntry(
    'release-check',
    'core',
    'Static analysis, unit/integration/e2e y build base',
    Boolean(releaseCheck),
    releaseCheck?.ok === true,
    {
      command: releaseCheck?.command || null,
      durationMs: releaseCheck?.durationMs || 0,
      reportPath: releaseCheck?.reportPath || null,
    }
  );
  matrix.push(releaseCheckEntry);
  if (!releaseCheckEntry.present || !releaseCheckEntry.ok) {
    issues.push(
      makeIssue(
        'sev1',
        releaseCheckEntry.id,
        'release:check no quedó verde o no dejó evidencia en el resumen.',
        { step: releaseCheck?.name || null }
      )
    );
  }

  const stabilityEntry = makeMatrixEntry(
    'stability-repeat',
    'stability',
    'Repetición disciplinada de la suite crítica',
    Boolean(stabilityReport),
    stabilityReport?.ok === true &&
      stability.completed >= policy.stabilityIterationsMin &&
      stability.requested >= policy.stabilityIterationsMin,
    {
      iterationsRequested: stability.requested,
      completedIterations: stability.completed,
      requiredIterations: policy.stabilityIterationsMin,
      exerciseBuild: Boolean(stabilityReport?.exerciseBuild),
      reportPath: getStep(summary, 'test-stability')?.reportPath || null,
    }
  );
  matrix.push(stabilityEntry);
  if (!stabilityEntry.present || !stabilityEntry.ok) {
    issues.push(
      makeIssue(
        'sev1',
        stabilityEntry.id,
        'La suite crítica repetida no alcanzó el mínimo requerido o falló durante la repetición.',
        {
          completedIterations: stability.completed,
          requiredIterations: policy.stabilityIterationsMin,
        }
      )
    );
  }

  const editorCriticalEntry = makeMatrixEntry(
    'editor-critical-repeat',
    'smoke',
    'Repetición disciplinada de smokes críticos del editor',
    Boolean(editorCriticalReport),
    editorCriticalReport?.ok === true &&
      editorCritical.completed >= policy.editorCriticalIterationsMin &&
      editorCritical.requested >= policy.editorCriticalIterationsMin,
    {
      iterationsRequested: editorCritical.requested,
      completedIterations: editorCritical.completed,
      requiredIterations: policy.editorCriticalIterationsMin,
      consoleErrors: editorCriticalConsoleErrors,
      reportPath: getStep(summary, 'editor-critical-smokes')?.reportPath || null,
    }
  );
  matrix.push(editorCriticalEntry);
  if (!editorCriticalEntry.present || !editorCriticalEntry.ok) {
    issues.push(
      makeIssue(
        'sev1',
        editorCriticalEntry.id,
        'Los smokes críticos del editor no completaron las repeticiones mínimas requeridas.',
        {
          completedIterations: editorCritical.completed,
          requiredIterations: policy.editorCriticalIterationsMin,
        }
      )
    );
  }
  if (editorCriticalEntry.ok && editorCriticalConsoleErrors > 0) {
    issues.push(
      makeIssue(
        'sev2',
        editorCriticalEntry.id,
        'Los smokes del editor quedaron verdes, pero registraron console errors.',
        { consoleErrors: editorCriticalConsoleErrors }
      )
    );
  }

  const shadowWorkspaceEntry = makeMatrixEntry(
    'shadow-workspace',
    'smoke',
    'Smoke de shadow workspace',
    Boolean(shadowWorkspaceReport),
    shadowWorkspaceReport?.ok === true,
    {
      failedSteps: shadowFailedSteps,
      reportPath: getStep(summary, 'shadow-workspace-smoke')?.reportPath || null,
    }
  );
  matrix.push(shadowWorkspaceEntry);
  if (!shadowWorkspaceEntry.present || !shadowWorkspaceEntry.ok) {
    issues.push(
      makeIssue(
        'sev1',
        shadowWorkspaceEntry.id,
        'El smoke de shadow workspace falló o no dejó reporte.',
        { failedSteps: shadowFailedSteps }
      )
    );
  }

  const performanceSmokeEntry = makeMatrixEntry(
    'performance-smoke',
    'performance',
    'Smoke real del editor con snapshot de performance',
    Boolean(performanceSmokeReport),
    performanceSmokeReport?.ok === true,
    {
      performanceSamples: Number(performanceSmokeReport?.performanceSnapshot?.totals?.performanceSamples || 0),
      consoleErrors: Array.isArray(performanceSmokeReport?.consoleErrors)
        ? performanceSmokeReport.consoleErrors.length
        : 0,
      reportPath: getStep(summary, 'editor-performance-smoke')?.reportPath || null,
    }
  );
  matrix.push(performanceSmokeEntry);
  if (!performanceSmokeEntry.present || !performanceSmokeEntry.ok) {
    issues.push(
      makeIssue(
        'sev1',
        performanceSmokeEntry.id,
        'El smoke de performance no produjo un snapshot válido del editor.',
        {
          performanceSamples: performanceSmokeEntry.performanceSamples,
        }
      )
    );
  }
  if (performanceSmokeEntry.ok && performanceSmokeEntry.consoleErrors > 0) {
    issues.push(
      makeIssue(
        'sev2',
        performanceSmokeEntry.id,
        'El smoke de performance quedó verde, pero registró console errors.',
        { consoleErrors: performanceSmokeEntry.consoleErrors }
      )
    );
  }

  const performanceBudgetEntry = makeMatrixEntry(
    'performance-budget',
    'performance',
    'Budget gate de performance',
    Boolean(performanceBudgetReport),
    performanceBudgetReport?.ok === true,
    {
      counts: performanceBudgetReport?.counts || null,
      reportPath: getStep(summary, 'performance-budget-check')?.reportPath || null,
    }
  );
  matrix.push(performanceBudgetEntry);
  if (!performanceBudgetEntry.present || !performanceBudgetEntry.ok) {
    issues.push(
      makeIssue(
        'sev1',
        performanceBudgetEntry.id,
        'El gate de budgets de performance falló o no dejó reporte.',
        { counts: performanceBudgetReport?.counts || null }
      )
    );
  }
  if (performanceBudgetEntry.ok && performanceBudgetWarns > 0) {
    issues.push(
      makeIssue(
        'sev2',
        performanceBudgetEntry.id,
        'Hay budgets de performance en warning aunque no estén en error.',
        { warnCount: performanceBudgetWarns }
      )
    );
  }

  const postdeployEntry = makeMatrixEntry(
    'postdeploy-smoke',
    'production',
    'Smoke autenticado postdeploy',
    Boolean(postdeploySmokeReport),
    postdeploySmokeReport?.ok === true,
    {
      skippedCount: postdeploySkipped,
      failedChecks: countFailedChecks(postdeploySmokeReport),
      reportPath: getStep(summary, 'postdeploy-smoke')?.reportPath || null,
    }
  );
  matrix.push(postdeployEntry);
  if (!postdeployEntry.present || !postdeployEntry.ok) {
    issues.push(
      makeIssue(
        'sev1',
        postdeployEntry.id,
        'El smoke postdeploy falló o no dejó reporte consumible.',
        { failedChecks: postdeployEntry.failedChecks }
      )
    );
  }
  if (postdeployEntry.ok && postdeploySkipped > 0) {
    issues.push(
      makeIssue(
        'sev2',
        postdeployEntry.id,
        'El smoke postdeploy quedó verde, pero dejó checks saltados.',
        { skippedCount: postdeploySkipped }
      )
    );
  }

  const productionPreflightEntry = makeMatrixEntry(
    'production-preflight',
    'production',
    'Preflight de producción y backup drill',
    Boolean(productionPreflightReport),
    productionPreflightReport?.ok === true,
    {
      summary: productionPreflightReport?.summary || null,
      reportPath: getStep(summary, 'production-preflight')?.reportPath || null,
    }
  );
  matrix.push(productionPreflightEntry);
  if (!productionPreflightEntry.present || !productionPreflightEntry.ok) {
    issues.push(
      makeIssue(
        'sev1',
        productionPreflightEntry.id,
        'El preflight de producción falló o no dejó evidencia suficiente.',
        { summary: productionPreflightReport?.summary || null }
      )
    );
  }
  if (productionPreflightEntry.ok && productionPreflightWarnings > 0) {
    issues.push(
      makeIssue(
        'sev2',
        productionPreflightEntry.id,
        'El preflight quedó verde, pero dejó warnings operativos.',
        { warningCount: productionPreflightWarnings }
      )
    );
  }

  const releaseSecurityEntry = makeMatrixEntry(
    'release-security',
    'security',
    'Security release check',
    Boolean(releaseSecurityReport),
    releaseSecurityReport?.ok === true,
    {
      failedChecks: countFailedChecks(releaseSecurityReport),
      reportPath: getStep(summary, 'release-security')?.reportPath || null,
    }
  );
  matrix.push(releaseSecurityEntry);
  if (!releaseSecurityEntry.present || !releaseSecurityEntry.ok) {
    issues.push(
      makeIssue(
        'sev1',
        releaseSecurityEntry.id,
        'El release security check falló o no dejó reporte.',
        { failedChecks: releaseSecurityEntry.failedChecks }
      )
    );
  }

  const bugBar = {
    sev1: issues.filter((issue) => issue.severity === 'sev1').length,
    sev2: issues.filter((issue) => issue.severity === 'sev2').length,
    issues,
  };

  const releaseCandidateRequirements = [
    { id: 'release-check-green', ok: releaseCheckEntry.ok },
    { id: 'stability-repeat-green', ok: stabilityEntry.ok },
    { id: 'editor-critical-repeat-green', ok: editorCriticalEntry.ok },
    { id: 'shadow-workspace-green', ok: shadowWorkspaceEntry.ok },
    { id: 'performance-smoke-green', ok: performanceSmokeEntry.ok },
    { id: 'performance-budget-green', ok: performanceBudgetEntry.ok },
    { id: 'postdeploy-green', ok: postdeployEntry.ok },
    { id: 'production-preflight-green', ok: productionPreflightEntry.ok },
    { id: 'release-security-green', ok: releaseSecurityEntry.ok },
    { id: 'zero-sev1', ok: bugBar.sev1 === 0 },
    { id: 'zero-sev2', ok: bugBar.sev2 === 0 },
  ];

  const finalSealTrueRequirements = [
    ...releaseCandidateRequirements,
    { id: 'seal-mode-target-real', ok: sealProfile?.mode === 'target-real' },
    { id: 'no-mock-rate-limit-backend', ok: sealProfile?.usedMockRateLimitBackend === false },
    { id: 'no-local-production-server', ok: sealProfile?.usedLocalProductionServer === false },
    { id: 'explicit-smoke-credentials', ok: sealProfile?.explicitSmokeCredentials === true },
    { id: 'shared-durable-storage', ok: sealProfile?.storage?.allDurableShared === true },
  ];

  const localSingleUserRequirements = [
    { id: 'release-check-green', ok: releaseCheckEntry.ok },
    { id: 'stability-repeat-green', ok: stabilityEntry.ok },
    { id: 'editor-critical-repeat-green', ok: editorCriticalEntry.ok },
    { id: 'shadow-workspace-green', ok: shadowWorkspaceEntry.ok },
    { id: 'performance-smoke-green', ok: performanceSmokeEntry.ok },
    { id: 'performance-budget-green', ok: performanceBudgetEntry.ok },
    { id: 'postdeploy-green', ok: postdeployEntry.ok },
    { id: 'production-preflight-green', ok: productionPreflightEntry.ok },
    { id: 'release-security-green', ok: releaseSecurityEntry.ok },
    { id: 'zero-sev1', ok: bugBar.sev1 === 0 },
    {
      id: 'only-local-tolerable-sev2',
      ok: issues.filter((issue) => issue.severity === 'sev2').every(isLocalSingleUserTolerableIssue),
    },
  ];

  return {
    ok: bugBar.sev1 === 0,
    generatedAt: new Date().toISOString(),
    policy,
    matrix,
    bugBar,
    summary: {
      totalGates: matrix.length,
      passedGates: matrix.filter((gate) => gate.ok).length,
      failedGates: matrix.filter((gate) => gate.present && !gate.ok).length,
      missingGates: matrix.filter((gate) => !gate.present).length,
    },
    releaseCandidate: {
      eligible: releaseCandidateRequirements.every((item) => item.ok),
      requirements: releaseCandidateRequirements,
    },
    localSingleUser: {
      eligible: localSingleUserRequirements.every((item) => item.ok),
      requirements: localSingleUserRequirements,
    },
    finalSealTrue: {
      eligible: finalSealTrueRequirements.every((item) => item.ok),
      requirements: finalSealTrueRequirements,
      sealProfile,
    },
  };
}

async function readJson(filePath) {
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.join(process.cwd(), filePath);
  return JSON.parse(await readFile(absolutePath, 'utf8'));
}

async function writeReport(reportPath, report) {
  const absolutePath = path.isAbsolute(reportPath)
    ? reportPath
    : path.join(process.cwd(), reportPath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath =
    args.get('input-report') || path.join('output', 'final-seal', 'report.json');
  const outputPath =
    args.get('report-output') || path.join('output', 'qa-total', 'report.json');
  const summary = await readJson(path.isAbsolute(inputPath) ? inputPath : path.join(process.cwd(), inputPath));
  const qaTotal = evaluateQaTotalReport(summary);
  const report = {
    ok: qaTotal.ok,
    finishedAt: new Date().toISOString(),
    sourceReportPath: inputPath,
    qaTotal,
  };

  await writeReport(outputPath, report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

  if (!report.ok) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`qa-total-check failed: ${String(error?.message || error)}\n`);
    process.exit(1);
  });
}
