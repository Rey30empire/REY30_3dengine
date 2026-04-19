import { spawnSync } from 'node:child_process';
import { loadWorkspaceEnv } from './env-utils.mjs';
import { applyResolvedLocalPostgresEnv, waitForRepoLocalPostgres } from './local-postgres.mjs';

loadWorkspaceEnv();

function run(command, args, env) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env,
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with code ${result.status}`);
  }
}

async function main() {
  const resolved = await applyResolvedLocalPostgresEnv(process.env);
  if (resolved.managed && resolved.usedFallbackPort) {
    process.stdout.write(
      `[db] Localhost:5432 is occupied; using repo Postgres on port ${resolved.port}.\n`
    );
  }

  run(
    'docker',
    ['compose', '-f', 'docker-compose.postgres.yml', 'up', '-d', '--force-recreate'],
    process.env
  );

  const ready = await waitForRepoLocalPostgres();
  process.stdout.write(
    `[db] Repo Postgres ready on localhost:${ready.port} (${ready.healthStatus}).\n`
  );
}

main().catch((error) => {
  process.stderr.write(`db-postgres-up failed: ${String(error?.message || error)}\n`);
  process.exit(1);
});
