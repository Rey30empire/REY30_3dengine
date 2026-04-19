import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadWorkspaceEnv } from './env-utils.mjs';

loadWorkspaceEnv();

const PERFORMANCE_BUDGET_KEYS = new Set([
  'editor_fps_min',
  'editor_frame_time_ms',
  'editor_cpu_time_ms',
  'editor_draw_calls',
  'editor_memory_used_mb',
]);
const LOCAL_SINGLE_USER_WAIVED_BUDGET_KEYS = new Set([
  'editor_fps_min',
  'editor_frame_time_ms',
  'editor_cpu_time_ms',
]);

function parseArgs(argv) {
  const args = new Map();

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) continue;

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

function summarizeStatuses(budgets) {
  return budgets.reduce(
    (acc, budget) => {
      acc[budget.status] = (acc[budget.status] || 0) + 1;
      return acc;
    },
    { ok: 0, warn: 0, error: 0 }
  );
}

function normalizePerformanceBudgetProfile(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (
    normalized === 'local-single-user' ||
    normalized === 'local' ||
    normalized === 'single-user'
  ) {
    return 'local-single-user';
  }
  return 'strict';
}

function applyPerformanceBudgetProfile(budgets, profile) {
  if (profile !== 'local-single-user') {
    return budgets;
  }

  return budgets.map((budget) => {
    if (
      !LOCAL_SINGLE_USER_WAIVED_BUDGET_KEYS.has(budget.key) ||
      budget.status === 'ok'
    ) {
      return budget;
    }

    return {
      ...budget,
      status: 'ok',
      adjustedFromStatus: budget.status,
      localWaiver: 'headless-renderer-stall',
      adjustmentReason:
        'local-single-user profile waives headless renderer stalls in local-only rehearsal.',
    };
  });
}

export function evaluatePerformanceSnapshot(snapshot, options = {}) {
  const budgets = Array.isArray(snapshot?.budgets)
    ? snapshot.budgets.filter((budget) => PERFORMANCE_BUDGET_KEYS.has(budget.key))
    : [];
  const latest = snapshot?.performance?.latest ?? null;
  const profile = normalizePerformanceBudgetProfile(options.profile);

  if (budgets.length === 0) {
    return {
      ok: false,
      reason: 'Snapshot does not include performance budgets.',
      budgets: [],
      latest,
      counts: { ok: 0, warn: 0, error: 0 },
      profile,
    };
  }

  if (!latest) {
    return {
      ok: false,
      reason: 'Snapshot does not include a latest performance sample.',
      budgets,
      latest: null,
      counts: summarizeStatuses(budgets),
      profile,
    };
  }

  const profiledBudgets = applyPerformanceBudgetProfile(budgets, profile);
  const counts = summarizeStatuses(profiledBudgets);
  return {
    ok: counts.error === 0,
    reason: counts.error === 0 ? null : 'Performance budgets breached.',
    budgets: profiledBudgets,
    latest,
    counts,
    profile,
  };
}

function extractSnapshot(payload) {
  if (payload?.snapshot?.budgets) {
    return payload.snapshot;
  }
  if (payload?.performanceSnapshot?.budgets) {
    return payload.performanceSnapshot;
  }
  return null;
}

async function loadJson(filePath) {
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.join(process.cwd(), filePath);
  return JSON.parse(await readFile(absolutePath, 'utf8'));
}

async function fetchSnapshot(baseUrl) {
  const headers = {};
  if (process.env.REY30_OPS_TOKEN) {
    headers['x-rey30-ops-token'] = process.env.REY30_OPS_TOKEN;
  }

  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/telemetry`, {
    method: 'GET',
    cache: 'no-store',
    headers,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Telemetry fetch failed (${response.status}): ${JSON.stringify(payload)}`);
  }

  return payload;
}

async function writeReport(reportOutput, report) {
  const absolutePath = path.isAbsolute(reportOutput)
    ? reportOutput
    : path.join(process.cwd(), reportOutput);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

export async function runPerformanceBudgetCheck(options = {}) {
  const reportPath =
    options.reportPath ||
    process.env.REY30_PERFORMANCE_REPORT_PATH ||
    'output/editor-performance-smoke/report.json';
  const baseUrl =
    options.baseUrl ||
    process.env.REY30_PERFORMANCE_BASE_URL ||
    process.env.PRODUCTION_BASE_URL ||
    process.env.SMOKE_BASE_URL ||
    '';
  const profile =
    options.profile ||
    process.env.REY30_PERFORMANCE_BUDGET_PROFILE ||
    process.env.REY30_RELEASE_PROFILE ||
    'strict';

  let source = 'report';
  let payload;

  try {
    payload = await loadJson(reportPath);
  } catch {
    if (!baseUrl) {
      throw new Error(
        'No performance report found and no base URL configured. Use --report-path or --base-url.'
      );
    }
    payload = await fetchSnapshot(baseUrl);
    source = 'telemetry-api';
  }

  const snapshot = extractSnapshot(payload);
  const evaluation = evaluatePerformanceSnapshot(snapshot, { profile });

  return {
    ok: evaluation.ok,
    source,
    profile: evaluation.profile,
    generatedAt: new Date().toISOString(),
    snapshotGeneratedAt: snapshot?.generatedAt ?? null,
    reason: evaluation.reason,
    latest: evaluation.latest,
    counts: evaluation.counts,
    budgets: evaluation.budgets,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = await runPerformanceBudgetCheck({
    reportPath: args.get('report-path'),
    baseUrl: args.get('base-url'),
    profile: args.get('profile'),
  });

  const reportOutput = args.get('report-output') || 'output/performance-budget/report.json';
  await writeReport(reportOutput, report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

  if (!report.ok) {
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`performance-budget-check failed: ${String(error?.message || error)}\n`);
    process.exit(1);
  });
}
