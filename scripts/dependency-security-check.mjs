import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const SECURITY_DEPENDENCY_POLICY = {
  next: {
    minimumVersion: '16.2.3',
    required: true,
  },
  'next-intl': {
    minimumVersion: '4.9.1',
    required: true,
  },
  picomatch: {
    minimumVersion: '4.0.4',
    required: false,
  },
  defu: {
    minimumVersion: '6.1.7',
    required: false,
  },
  lodash: {
    minimumVersion: '4.18.1',
    required: false,
  },
  'lodash-es': {
    minimumVersion: '4.18.1',
    required: false,
  },
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

function normalizeVersion(value) {
  return String(value || '')
    .trim()
    .replace(/^v/i, '')
    .split('-')[0];
}

export function compareSemver(left, right) {
  const leftParts = normalizeVersion(left)
    .split('.')
    .map((part) => Number.parseInt(part, 10));
  const rightParts = normalizeVersion(right)
    .split('.')
    .map((part) => Number.parseInt(part, 10));
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = Number.isFinite(leftParts[index]) ? leftParts[index] : 0;
    const rightValue = Number.isFinite(rightParts[index]) ? rightParts[index] : 0;
    if (leftValue > rightValue) return 1;
    if (leftValue < rightValue) return -1;
  }

  return 0;
}

function uniqueBy(items, selector) {
  const seen = new Set();
  const nextItems = [];
  for (const item of items) {
    const key = selector(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    nextItems.push(item);
  }
  return nextItems;
}

function collectOccurrences(node, targetNames, into, seen) {
  if (!node || typeof node !== 'object') return;

  const name = typeof node.name === 'string' ? node.name : '';
  const version = typeof node.version === 'string' ? node.version : '';
  const nodePath = typeof node.path === 'string' ? node.path : '';
  const visitKey = `${name}::${version}::${nodePath}`;
  if (seen.has(visitKey)) return;
  seen.add(visitKey);

  if (name && version && targetNames.has(name)) {
    into.push({
      name,
      version,
      path: nodePath || null,
      resolved: typeof node.resolved === 'string' ? node.resolved : null,
      from: typeof node.from === 'string' ? node.from : null,
    });
  }

  const dependencies = node.dependencies && typeof node.dependencies === 'object'
    ? Object.entries(node.dependencies)
    : [];

  for (const [dependencyName, dependencyNode] of dependencies) {
    if (!dependencyNode || typeof dependencyNode !== 'object') continue;
    collectOccurrences(
      dependencyNode.name ? dependencyNode : { ...dependencyNode, name: dependencyName },
      targetNames,
      into,
      seen
    );
  }
}

export function evaluateDependencySecurity(snapshot, options = {}) {
  const policy = {
    ...SECURITY_DEPENDENCY_POLICY,
    ...(options.policy || {}),
  };
  const targetNames = new Set(Object.keys(policy));
  const roots = Array.isArray(snapshot) ? snapshot : [snapshot];
  const occurrences = [];
  const seen = new Set();

  for (const root of roots) {
    collectOccurrences(root, targetNames, occurrences, seen);
  }

  const packages = Object.entries(policy).map(([name, rule]) => {
    const matches = occurrences.filter((item) => item.name === name);
    const versions = uniqueBy(
      matches
        .map((item) => item.version)
        .filter((value) => value),
      (value) => value
    ).sort(compareSemver);

    if (matches.length === 0) {
      return {
        name,
        minimumVersion: rule.minimumVersion,
        required: rule.required !== false,
        present: false,
        ok: rule.required === false,
        versions: [],
        offenders: [],
      };
    }

    const offenders = uniqueBy(
      matches
        .filter((item) => compareSemver(item.version, rule.minimumVersion) < 0)
        .map((item) => ({
          version: item.version,
          path: item.path,
          resolved: item.resolved,
          from: item.from,
        })),
      (item) => `${item.version}::${item.path || ''}::${item.from || ''}`
    );

    return {
      name,
      minimumVersion: rule.minimumVersion,
      required: rule.required !== false,
      present: true,
      ok: offenders.length === 0,
      versions,
      offenders,
    };
  });

  const failedPackages = packages.filter((entry) => !entry.ok);

  return {
    ok: failedPackages.length === 0,
    checkedAt: new Date().toISOString(),
    summary: {
      packagesChecked: packages.length,
      packagesFailing: failedPackages.length,
      resolvedOccurrences: occurrences.length,
    },
    packages,
  };
}

function readJsonText(text, sourceLabel) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`No se pudo parsear JSON desde ${sourceLabel}: ${String(error?.message || error)}`);
  }
}

async function loadSnapshotFromFile(filePath) {
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.join(process.cwd(), filePath);
  return readJsonText(await readFile(absolutePath, 'utf8'), absolutePath);
}

function loadSnapshotFromPnpm(policy) {
  const commandArgs = [
    'list',
    '--prod',
    '--json',
    '--depth',
    '16',
  ];
  const result = spawnSync('pnpm', commandArgs, {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: process.platform === 'win32',
    maxBuffer: 32 * 1024 * 1024,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const stderr = String(result.stderr || '').trim();
    throw new Error(
      `pnpm list falló con código ${String(result.status ?? 1)}${stderr ? `: ${stderr}` : ''}`
    );
  }

  return {
    source: `pnpm ${commandArgs.join(' ')}`,
    snapshot: readJsonText(String(result.stdout || '[]'), 'pnpm list'),
  };
}

async function writeReportIfNeeded(reportPath, report) {
  if (!reportPath) return;
  const absolutePath = path.isAbsolute(reportPath)
    ? reportPath
    : path.join(process.cwd(), reportPath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

function printReport(report) {
  process.stdout.write('Dependency security policy:\n');
  for (const entry of report.packages) {
    const versions = entry.versions.length > 0 ? entry.versions.join(', ') : 'missing';
    process.stdout.write(
      `- ${entry.name}: ${entry.ok ? 'PASS' : 'FAIL'} minimum=${entry.minimumVersion} resolved=${versions}\n`
    );
    for (const offender of entry.offenders) {
      process.stdout.write(
        `  offender version=${offender.version} path=${offender.path || 'unknown'}\n`
      );
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const policy = SECURITY_DEPENDENCY_POLICY;
  const inputFile = String(args.get('input-file') || '').trim();
  const loaded = inputFile
    ? {
        source: inputFile,
        snapshot: await loadSnapshotFromFile(inputFile),
      }
    : loadSnapshotFromPnpm(policy);

  const evaluation = evaluateDependencySecurity(loaded.snapshot, { policy });
  const report = {
    ...evaluation,
    source: loaded.source,
    policy,
    finishedAt: new Date().toISOString(),
  };

  await writeReportIfNeeded(args.get('report-path') || '', report);
  printReport(report);

  if (!report.ok) {
    process.stderr.write(
      `Dependency security check failed: ${report.packages
        .filter((entry) => !entry.ok)
        .map((entry) => entry.name)
        .join(', ')}\n`
    );
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`dependency-security-check failed: ${String(error?.message || error)}\n`);
    process.exit(1);
  });
}
