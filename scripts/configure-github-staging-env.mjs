import { spawnSync } from 'node:child_process';

const REQUIRED_VARS = [
  'STAGING_BASE_URL',
  'REY30_RUNTIME_FORENSICS_PROMETHEUS_PROBE_URL',
  'REY30_RUNTIME_FORENSICS_ALERTMANAGER_URL',
  'REY30_RUNTIME_FORENSICS_PROBE_PUBLISH_URL',
];

const REQUIRED_SECRETS = ['REY30_OPS_TOKEN'];

function parseArgs(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args.set(key, 'true');
      continue;
    }
    args.set(key, next);
    i += 1;
  }
  return args;
}

function help() {
  return `Configure GitHub environment staging for hardening/restore/probe.

Required env values:
  STAGING_BASE_URL
  REY30_OPS_TOKEN
  REY30_RUNTIME_FORENSICS_PROMETHEUS_PROBE_URL
  REY30_RUNTIME_FORENSICS_ALERTMANAGER_URL
  REY30_RUNTIME_FORENSICS_PROBE_PUBLISH_URL

Usage:
  node scripts/configure-github-staging-env.mjs --repo Rey30empire/REY30_3dengine
`;
}

function requireValue(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required in the local environment.`);
  }
  if (/example|your_|<|CHANGE|TODO|xxx/i.test(value)) {
    throw new Error(`${name} looks like a placeholder.`);
  }
  return value;
}

function runGh(args, options = {}) {
  const result = spawnSync('gh', args, {
    input: options.input,
    encoding: 'utf8',
    stdio: options.input ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    throw new Error(`gh ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function configureVariable(repo, name, value) {
  runGh(['variable', 'set', name, '--repo', repo, '--env', 'staging', '--body', value]);
  process.stdout.write(`variable ${name}=configured\n`);
}

function configureSecret(repo, name, value) {
  runGh(['secret', 'set', name, '--repo', repo, '--env', 'staging'], {
    input: value,
  });
  process.stdout.write(`secret ${name}=configured\n`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.has('help') || args.has('h')) {
    process.stdout.write(help());
    return;
  }

  const repo = args.get('repo') || process.env.GITHUB_REPOSITORY || '';
  if (!repo) {
    throw new Error('Missing --repo or GITHUB_REPOSITORY.');
  }

  const vars = Object.fromEntries(REQUIRED_VARS.map((name) => [name, requireValue(name)]));
  const secrets = Object.fromEntries(
    REQUIRED_SECRETS.map((name) => [name, requireValue(name)])
  );

  runGh(['api', '-X', 'PUT', `repos/${repo}/environments/staging`, '--input', '-'], {
    input: '{}',
  });
  process.stdout.write('environment staging=ready\n');

  for (const [name, value] of Object.entries(vars)) {
    configureVariable(repo, name, value);
  }
  for (const [name, value] of Object.entries(secrets)) {
    configureSecret(repo, name, value);
  }

  process.stdout.write('GitHub staging environment configured.\n');
}

try {
  main();
} catch (error) {
  process.stderr.write(`configure-github-staging-env failed: ${String(error?.message || error)}\n`);
  process.exit(1);
}
