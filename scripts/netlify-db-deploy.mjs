import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { loadWorkspaceEnv, resolveDatabaseUrl } from './env-utils.mjs';

loadWorkspaceEnv();

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

function trim(value) {
  return String(value || '').trim();
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    shell: process.platform === 'win32',
    stdio: options.captureOutput ? 'pipe' : 'inherit',
    encoding: options.captureOutput ? 'utf8' : undefined,
    env: {
      ...process.env,
      ...(options.envOverrides || {}),
    },
  });

  if (result.status !== 0) {
    const stderr = trim(result.stderr);
    throw new Error(
      stderr || `${command} ${args.join(' ')} failed with code ${result.status}`
    );
  }

  return result;
}

function getNetlifyDatabaseUrl() {
  const explicit = resolveDatabaseUrl(process.env);
  if (explicit) {
    return explicit;
  }

  const result = run('netlify', ['env:get', 'NETLIFY_DATABASE_URL'], {
    captureOutput: true,
  });
  const databaseUrl = trim(result.stdout);
  if (!databaseUrl) {
    throw new Error(
      'Netlify did not return NETLIFY_DATABASE_URL. Asegura `netlify login`, `netlify link` y que Netlify DB ya fue provisionada.'
    );
  }

  return databaseUrl;
}

async function main() {
  parseArgs(process.argv.slice(2));
  const databaseUrl = getNetlifyDatabaseUrl();

  process.stdout.write('Using Netlify DB connection from DATABASE_URL/NETLIFY_DATABASE_URL.\n');

  run('node', ['scripts/prisma-db-safe.mjs', 'migrate', 'deploy'], {
    envOverrides: {
      DATABASE_URL: databaseUrl,
    },
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`netlify-db-deploy failed: ${String(error?.message || error)}\n`);
    process.exit(1);
  });
}
