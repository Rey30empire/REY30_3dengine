import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { evaluateQaTotalReport } from './qa-total-check.mjs';

const DEFAULT_FINAL_SEAL_REPORT = path.join('output', 'final-seal', 'report.json');
const DEFAULT_QA_TOTAL_REPORT = path.join('output', 'qa-total', 'report.json');
const DEFAULT_RELEASE_FREEZE_ROOT = path.join('output', 'release-freeze');

function parseArgs(argv) {
  const args = new Map();

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) {
      continue;
    }

    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args.set(key, 'true');
      continue;
    }

    args.set(key, next);
    index += 1;
  }

  return args;
}

function getStep(summary, name) {
  return summary?.steps?.find((step) => step?.name === name) || null;
}

function sanitizeFreezeIdSegment(value) {
  return String(value || 'unknown')
    .trim()
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'unknown';
}

function formatTimestamp(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  return `${year}${month}${day}-${hours}${minutes}${seconds}Z`;
}

function normalizePathValue(filePath) {
  if (!filePath) {
    return null;
  }
  return String(filePath).replace(/[\\/]+/g, path.sep);
}

function toPosixPath(filePath) {
  return String(filePath).replace(/\\/g, '/');
}

function uniqueBy(items, selector) {
  const seen = new Set();
  const nextItems = [];

  for (const item of items) {
    const key = selector(item);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    nextItems.push(item);
  }

  return nextItems;
}

function findPreflightCheck(summary, id) {
  return (
    summary?.productionPreflight?.checks?.find((check) => check?.id === id) || null
  );
}

function extractBackupSummary(summary) {
  const created = findPreflightCheck(summary, 'ops-backup-create');
  const verified = findPreflightCheck(summary, 'ops-backup-verify');
  const restoreDryRun = findPreflightCheck(summary, 'ops-backup-restore-dry-run');
  return {
    backupId: created?.backupId || verified?.backupId || restoreDryRun?.backupId || null,
    createOk: created?.status === 'passed',
    verifyOk: verified?.status === 'passed',
    restoreDryRunOk: restoreDryRun?.status === 'passed',
    verifyCheckedFiles: Number(verified?.checkedFiles || 0),
    restoreDryRunOperations: Number(restoreDryRun?.operations || 0),
  };
}

function extractPerformanceSummary(summary) {
  return {
    sampleCount: Number(summary?.performanceSmoke?.performanceSampleCount || 0),
    budgetCounts: summary?.performanceBudget?.counts || { ok: 0, warn: 0, error: 0 },
    latest: summary?.performanceBudget?.latest || summary?.performanceSmoke?.performanceSnapshot?.performance?.latest || null,
  };
}

export function evaluateReleaseFreezeReport(summary) {
  const qaTotal = summary?.qaTotal || evaluateQaTotalReport(summary);
  const rollback = extractBackupSummary(summary);
  const performance = extractPerformanceSummary(summary);
  const releaseCandidateEligible =
    summary?.releaseCandidateEligible === true ||
    qaTotal?.releaseCandidate?.eligible === true;
  const finalSealTrueEligible =
    summary?.finalSealTrueEligible === true ||
    qaTotal?.finalSealTrue?.eligible === true;
  const reasons = [];

  if (summary?.ok !== true) {
    reasons.push('final-seal did not complete green.');
  }
  if (qaTotal?.ok !== true) {
    reasons.push('qa total did not complete green.');
  }
  if (!releaseCandidateEligible) {
    reasons.push('release candidate is not eligible.');
  }
  if (!finalSealTrueEligible) {
    reasons.push('final seal true is not eligible.');
  }
  if (Number(qaTotal?.bugBar?.sev1 || 0) > 0) {
    reasons.push('bug bar still has sev1 findings.');
  }
  if (Number(qaTotal?.bugBar?.sev2 || 0) > 0) {
    reasons.push('bug bar still has sev2 findings.');
  }
  if (!rollback.backupId) {
    reasons.push('rollback backup id is missing from production preflight evidence.');
  }
  if (!rollback.createOk || !rollback.verifyOk || !rollback.restoreDryRunOk) {
    reasons.push('rollback backup drill is incomplete.');
  }
  if (Number(performance.budgetCounts.error || 0) > 0) {
    reasons.push('performance budgets still have error counts.');
  }
  if (Number(performance.budgetCounts.warn || 0) > 0) {
    reasons.push('performance budgets still have warning counts.');
  }

  return {
    ok: reasons.length === 0,
    reason: reasons[0] || null,
    reasons,
    qaTotal,
    rollback,
    performance,
    releaseCandidateEligible,
    finalSealTrueEligible,
  };
}

export function collectReleaseFreezeArtifacts(summary, options = {}) {
  const artifacts = [
    {
      kind: 'final-seal-report',
      sourcePath: normalizePathValue(options.inputReportPath || DEFAULT_FINAL_SEAL_REPORT),
      required: true,
    },
    {
      kind: 'qa-total-report',
      sourcePath: normalizePathValue(options.qaReportPath || DEFAULT_QA_TOTAL_REPORT),
      required: true,
    },
    {
      kind: 'test-stability-report',
      sourcePath: normalizePathValue(getStep(summary, 'test-stability')?.reportPath),
      required: false,
    },
    {
      kind: 'editor-critical-report',
      sourcePath: normalizePathValue(getStep(summary, 'editor-critical-smokes')?.reportPath),
      required: false,
    },
    {
      kind: 'shadow-workspace-report',
      sourcePath: normalizePathValue(getStep(summary, 'shadow-workspace-smoke')?.reportPath),
      required: false,
    },
    {
      kind: 'performance-smoke-report',
      sourcePath: normalizePathValue(getStep(summary, 'editor-performance-smoke')?.reportPath),
      required: false,
    },
    {
      kind: 'performance-budget-report',
      sourcePath: normalizePathValue(getStep(summary, 'performance-budget-check')?.reportPath),
      required: false,
    },
    {
      kind: 'postdeploy-smoke-report',
      sourcePath: normalizePathValue(getStep(summary, 'postdeploy-smoke')?.reportPath),
      required: false,
    },
    {
      kind: 'production-preflight-report',
      sourcePath: normalizePathValue(getStep(summary, 'production-preflight')?.reportPath),
      required: false,
    },
    {
      kind: 'release-security-report',
      sourcePath: normalizePathValue(getStep(summary, 'release-security')?.reportPath),
      required: false,
    },
  ].filter((artifact) => artifact.sourcePath);

  return uniqueBy(artifacts, (artifact) => artifact.sourcePath).map((artifact) => ({
    kind: artifact.kind,
    sourcePath: artifact.sourcePath,
    required: artifact.required,
  }));
}

function resolveProjectPath(rootDir, filePath) {
  if (path.isAbsolute(filePath)) {
    return filePath;
  }
  return path.join(rootDir, filePath);
}

function toEscrowRelativePath(rootDir, absoluteSourcePath) {
  const relativePath = path.relative(rootDir, absoluteSourcePath);
  if (!relativePath || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))) {
    return path.join('evidence', relativePath || path.basename(absoluteSourcePath));
  }
  return path.join('evidence', 'external', path.basename(absoluteSourcePath));
}

function readTextResult(result) {
  return result.status === 0 ? String(result.stdout || '').trim() : null;
}

function resolveGitMetadata(rootDir) {
  const commitResult = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: rootDir,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  const branchResult = spawnSync('git', ['branch', '--show-current'], {
    cwd: rootDir,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  const statusResult = spawnSync('git', ['status', '--short'], {
    cwd: rootDir,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });

  const statusLines = readTextResult(statusResult)
    ? readTextResult(statusResult).split(/\r?\n/).filter(Boolean)
    : [];

  return {
    commit: readTextResult(commitResult),
    branch: readTextResult(branchResult),
    dirty: statusLines.length > 0,
    dirtyFileCount: statusLines.length,
    dirtyFilesSample: statusLines.slice(0, 20),
  };
}

async function resolvePackageMetadata(rootDir) {
  const packageJsonPath = path.join(rootDir, 'package.json');
  const payload = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  return {
    name: payload?.name || 'unknown',
    version: payload?.version || '0.0.0',
  };
}

export function renderReleaseNotesMarkdown(manifest) {
  return [
    '# Release Notes',
    '',
    `- Freeze ID: \`${manifest.freezeId}\``,
    `- Frozen At: \`${manifest.frozenAt}\``,
    `- Package: \`${manifest.release.name}@${manifest.release.version}\``,
    `- Release Candidate Eligible: \`${manifest.releaseCandidate.eligible}\``,
    `- QA Gates: \`${manifest.releaseCandidate.passedGates}/${manifest.releaseCandidate.totalGates}\``,
    `- Bug Bar: \`sev1=${manifest.releaseCandidate.sev1}\`, \`sev2=${manifest.releaseCandidate.sev2}\``,
    `- Rollback Backup: \`${manifest.rollback.backupId || 'missing'}\``,
    '',
    '## Performance Snapshot',
    '',
    `- FPS: \`${manifest.performance.latest?.fps ?? 'n/a'}\``,
    `- Frame Time (ms): \`${manifest.performance.latest?.frameTimeMs ?? 'n/a'}\``,
    `- CPU Time (ms): \`${manifest.performance.latest?.cpuTimeMs ?? 'n/a'}\``,
    `- Memory Used (MB): \`${manifest.performance.latest?.memoryUsedMb ?? 'n/a'}\``,
    '',
    '## Evidence Bundle',
    '',
    `- Artifacts escrowed: \`${manifest.artifacts.length}\``,
    `- Artifact index: \`${manifest.files.artifactIndexPath}\``,
    `- Final seal report: \`${manifest.files.finalSealReportPath}\``,
    '',
  ].join('\n');
}

export function renderRollbackPlanMarkdown(manifest) {
  return [
    '# Rollback Plan',
    '',
    `- Backup ID: \`${manifest.rollback.backupId || 'missing'}\``,
    `- Verify Check: \`${manifest.rollback.verifyOk}\``,
    `- Restore Dry Run: \`${manifest.rollback.restoreDryRunOk}\``,
    `- Verified Files: \`${manifest.rollback.verifyCheckedFiles}\``,
    `- Dry Run Operations: \`${manifest.rollback.restoreDryRunOperations}\``,
    '',
    '## Operator Notes',
    '',
    '- Use the backup evidence referenced in the freeze manifest before cutting over or rolling back.',
    '- Validate the production preflight and postdeploy smoke reports inside the evidence bundle before making rollback decisions.',
    '- If a rollback is required, restore from the recorded backup id and re-run the authenticated smoke and release security checks.',
    '',
  ].join('\n');
}

export function renderReleaseHandoffMarkdown(manifest) {
  return [
    '# Release Handoff',
    '',
    `- Freeze ID: \`${manifest.freezeId}\``,
    `- Release Candidate: \`${manifest.releaseCandidate.eligible ? 'eligible' : 'blocked'}\``,
    `- Frozen At: \`${manifest.frozenAt}\``,
    `- Git Commit: \`${manifest.git.commit || 'unknown'}\``,
    `- Git Branch: \`${manifest.git.branch || 'unknown'}\``,
    `- Workspace Dirty: \`${manifest.git.dirty}\` (\`${manifest.git.dirtyFileCount}\` entries captured for traceability)`,
    '',
    '## Acceptance',
    '',
    `- QA Gates: \`${manifest.releaseCandidate.passedGates}/${manifest.releaseCandidate.totalGates}\``,
    `- Bug Bar: \`sev1=${manifest.releaseCandidate.sev1}\`, \`sev2=${manifest.releaseCandidate.sev2}\``,
    `- Rollback Backup: \`${manifest.rollback.backupId || 'missing'}\``,
    '',
    '## Evidence',
    '',
    `- Manifest: \`${manifest.files.manifestPath}\``,
    `- Release Notes: \`${manifest.files.releaseNotesPath}\``,
    `- Rollback Plan: \`${manifest.files.rollbackPlanPath}\``,
    `- Cutover Runbook: \`${manifest.files.cutoverRunbookPath}\``,
    `- Publication Checklist: \`${manifest.files.publicationChecklistPath}\``,
    `- Artifact Index: \`${manifest.files.artifactIndexPath}\``,
    '',
    '## Operational Handoff',
    '',
    '- Keep the evidence bundle immutable for the candidate you are releasing.',
    '- Use the rollback plan in this bundle if post-cutover validation regresses.',
    '- Re-run `pnpm run qa:total` if the candidate is rebuilt or any artifact changes after freeze.',
    '',
  ].join('\n');
}

export function renderProductionCutoverRunbookMarkdown(manifest) {
  const tagName = `${manifest.freezeId}`;
  return [
    '# Production Cutover Runbook',
    '',
    `- Freeze ID: \`${manifest.freezeId}\``,
    `- Release Version: \`${manifest.release.name}@${manifest.release.version}\``,
    `- Candidate Commit: \`${manifest.git.commit || 'unknown'}\``,
    `- Rollback Backup: \`${manifest.rollback.backupId || 'missing'}\``,
    '',
    '## Preconditions',
    '',
    `1. Confirm [freeze-manifest.json](./freeze-manifest.json) still shows \`eligible=true\`, \`sev1=0\` and \`sev2=0\`.`,
    `2. Confirm [release-handoff.md](./release-handoff.md) and [rollback-plan.md](./rollback-plan.md) are the operator references for this cutover.`,
    `3. Confirm the candidate commit \`${manifest.git.commit || 'unknown'}\` exists in the remote repository you will release from.`,
    '4. Confirm the production environment still matches the assumptions in the preflight report.',
    '',
    '## Cutover Steps',
    '',
    '1. Sync a clean release workspace from the target remote.',
    `2. Checkout commit \`${manifest.git.commit || 'unknown'}\` in that clean workspace.`,
    '3. Run the production build in the clean workspace.',
    '4. Run `pnpm run qa:total` again if anything in the release workspace differs from the frozen evidence.',
    '5. Promote the built artifact to the production slot.',
    '6. Run authenticated postdeploy smoke and release security checks.',
    '',
    '## Verification Commands',
    '',
    '```powershell',
    'pnpm run build',
    'pnpm run qa:total',
    'node scripts/postdeploy-smoke.mjs --base-url <prod-url> --require-authenticated-flow true --report-path output/postdeploy-smoke-report.json',
    'node scripts/release-security-check.mjs --base-url <prod-url> --allowed-origin <prod-url> --expect-hsts true --report-path output/release-security-report.json',
    '```',
    '',
    '## Manual Tagging',
    '',
    'Run these only from a clean release clone, not from a dirty workspace:',
    '',
    '```powershell',
    `git fetch origin`,
    `git checkout ${manifest.git.commit || '<commit>'}`,
    `git tag -a ${tagName} -m "Release freeze ${manifest.freezeId}"`,
    `git push origin ${tagName}`,
    '```',
    '',
    '## Rollback Trigger',
    '',
    'Rollback immediately if postdeploy smoke, release security, or authenticated critical workflows regress after cutover.',
    '',
  ].join('\n');
}

export function renderManualPublicationChecklistMarkdown(manifest) {
  const releaseUrlSafeCommit = manifest.git.commit || 'unknown';
  return [
    '# Manual Publication Checklist',
    '',
    `- Freeze ID: \`${manifest.freezeId}\``,
    `- Commit: \`${releaseUrlSafeCommit}\``,
    `- Backup ID: \`${manifest.rollback.backupId || 'missing'}\``,
    '',
    '## Checklist',
    '',
    '- [ ] Review [freeze-manifest.json](./freeze-manifest.json) and confirm `eligible=true`.',
    '- [ ] Review [release-notes.md](./release-notes.md) for this freeze.',
    '- [ ] Review [production-cutover-runbook.md](./production-cutover-runbook.md) before starting cutover.',
    '- [ ] Review [rollback-plan.md](./rollback-plan.md) and confirm the rollback backup id is accessible.',
    '- [ ] Use a clean release clone, not the current dirty workspace.',
    `- [ ] Verify the release clone is at commit \`${releaseUrlSafeCommit}\`.`,
    '- [ ] Run `pnpm run build` in the release clone.',
    '- [ ] Run postdeploy smoke against the target deployment.',
    '- [ ] Run release security check against the target deployment.',
    `- [ ] Create annotated Git tag \`${manifest.freezeId}\`.`,
    '- [ ] Push the tag to the canonical remote.',
    '- [ ] Record the deployment URL, time and operator in the release log outside this workspace.',
    '',
  ].join('\n');
}

async function writeTextFile(absolutePath, contents) {
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${contents.trimEnd()}\n`, 'utf8');
}

async function writeJsonFile(absolutePath, payload) {
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

export async function createReleaseFreezeBundle(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const inputReportPath = normalizePathValue(
    options.inputReportPath || DEFAULT_FINAL_SEAL_REPORT
  );
  const qaReportPath = normalizePathValue(options.qaReportPath || DEFAULT_QA_TOTAL_REPORT);
  const outputRoot = normalizePathValue(
    options.outputRoot || DEFAULT_RELEASE_FREEZE_ROOT
  );
  const summary =
    options.summary || JSON.parse(await readFile(resolveProjectPath(rootDir, inputReportPath), 'utf8'));
  const evaluation = evaluateReleaseFreezeReport(summary);

  if (!evaluation.ok) {
    throw new Error(
      `release-freeze blocked: ${evaluation.reasons.join(' ')}`
    );
  }

  const packageMetadata = options.packageMetadata || (await resolvePackageMetadata(rootDir));
  const gitMetadata = options.gitMetadata || resolveGitMetadata(rootDir);
  const now = options.now || new Date();
  const freezeId =
    options.freezeId ||
    `rc-${sanitizeFreezeIdSegment(packageMetadata.version)}-${formatTimestamp(now)}`;
  const bundleDir = resolveProjectPath(rootDir, path.join(outputRoot, freezeId));
  const manifestPath = path.join(bundleDir, 'freeze-manifest.json');
  const artifactIndexPath = path.join(bundleDir, 'artifact-index.json');
  const releaseNotesPath = path.join(bundleDir, 'release-notes.md');
  const rollbackPlanPath = path.join(bundleDir, 'rollback-plan.md');
  const handoffPath = path.join(bundleDir, 'release-handoff.md');
  const cutoverRunbookPath = path.join(bundleDir, 'production-cutover-runbook.md');
  const publicationChecklistPath = path.join(bundleDir, 'manual-publication-checklist.md');
  const latestPath = resolveProjectPath(rootDir, path.join(outputRoot, 'latest.json'));
  const artifacts = collectReleaseFreezeArtifacts(summary, {
    inputReportPath,
    qaReportPath,
  });

  const escrowArtifacts = [];

  for (const artifact of artifacts) {
    const absoluteSourcePath = resolveProjectPath(rootDir, artifact.sourcePath);
    let artifactStats = null;
    try {
      artifactStats = await stat(absoluteSourcePath);
    } catch (error) {
      if (artifact.required) {
        throw new Error(
          `required release artifact is missing: ${artifact.sourcePath} (${String(error?.message || error)})`
        );
      }
      continue;
    }

    const escrowRelativePath = toEscrowRelativePath(rootDir, absoluteSourcePath);
    const absoluteEscrowPath = path.join(bundleDir, escrowRelativePath);
    await mkdir(path.dirname(absoluteEscrowPath), { recursive: true });
    await copyFile(absoluteSourcePath, absoluteEscrowPath);

    escrowArtifacts.push({
      kind: artifact.kind,
      sourcePath: toPosixPath(artifact.sourcePath),
      escrowPath: toPosixPath(path.relative(rootDir, absoluteEscrowPath)),
      sizeBytes: artifactStats.size,
      required: artifact.required,
    });
  }

  const manifest = {
    ok: true,
    freezeId,
    frozenAt: now.toISOString(),
    sourceReportPath: toPosixPath(inputReportPath),
    workspaceRoot: rootDir,
    release: packageMetadata,
    git: gitMetadata,
    releaseCandidate: {
      eligible: evaluation.releaseCandidateEligible,
      totalGates: Number(evaluation.qaTotal?.summary?.totalGates || 0),
      passedGates: Number(evaluation.qaTotal?.summary?.passedGates || 0),
      failedGates: Number(evaluation.qaTotal?.summary?.failedGates || 0),
      sev1: Number(evaluation.qaTotal?.bugBar?.sev1 || 0),
      sev2: Number(evaluation.qaTotal?.bugBar?.sev2 || 0),
    },
    rollback: evaluation.rollback,
    performance: evaluation.performance,
    artifacts: escrowArtifacts,
    files: {
      manifestPath: toPosixPath(path.relative(rootDir, manifestPath)),
      artifactIndexPath: toPosixPath(path.relative(rootDir, artifactIndexPath)),
      releaseNotesPath: toPosixPath(path.relative(rootDir, releaseNotesPath)),
      rollbackPlanPath: toPosixPath(path.relative(rootDir, rollbackPlanPath)),
      handoffPath: toPosixPath(path.relative(rootDir, handoffPath)),
      cutoverRunbookPath: toPosixPath(path.relative(rootDir, cutoverRunbookPath)),
      publicationChecklistPath: toPosixPath(path.relative(rootDir, publicationChecklistPath)),
      finalSealReportPath: toPosixPath(inputReportPath),
      qaTotalReportPath: toPosixPath(qaReportPath),
    },
  };

  await writeJsonFile(manifestPath, manifest);
  await writeJsonFile(artifactIndexPath, {
    ok: true,
    freezeId,
    generatedAt: now.toISOString(),
    artifacts: escrowArtifacts,
  });
  await writeTextFile(releaseNotesPath, renderReleaseNotesMarkdown(manifest));
  await writeTextFile(rollbackPlanPath, renderRollbackPlanMarkdown(manifest));
  await writeTextFile(handoffPath, renderReleaseHandoffMarkdown(manifest));
  await writeTextFile(cutoverRunbookPath, renderProductionCutoverRunbookMarkdown(manifest));
  await writeTextFile(
    publicationChecklistPath,
    renderManualPublicationChecklistMarkdown(manifest)
  );
  await writeJsonFile(latestPath, {
    ok: true,
    freezeId,
    frozenAt: now.toISOString(),
    bundlePath: toPosixPath(path.relative(rootDir, bundleDir)),
    manifestPath: manifest.files.manifestPath,
    handoffPath: manifest.files.handoffPath,
    cutoverRunbookPath: manifest.files.cutoverRunbookPath,
    publicationChecklistPath: manifest.files.publicationChecklistPath,
  });

  return {
    ok: true,
    freezeId,
    bundleDir: toPosixPath(path.relative(rootDir, bundleDir)),
    manifestPath: manifest.files.manifestPath,
    artifactIndexPath: manifest.files.artifactIndexPath,
    releaseNotesPath: manifest.files.releaseNotesPath,
    rollbackPlanPath: manifest.files.rollbackPlanPath,
    handoffPath: manifest.files.handoffPath,
    cutoverRunbookPath: manifest.files.cutoverRunbookPath,
    publicationChecklistPath: manifest.files.publicationChecklistPath,
    latestPath: toPosixPath(path.relative(rootDir, latestPath)),
    artifacts: escrowArtifacts.length,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await createReleaseFreezeBundle({
    inputReportPath: args.get('input-report'),
    qaReportPath: args.get('qa-report'),
    outputRoot: args.get('output-dir'),
    freezeId: args.get('freeze-id'),
  });

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`release-freeze failed: ${String(error?.message || error)}\n`);
    process.exit(1);
  });
}
