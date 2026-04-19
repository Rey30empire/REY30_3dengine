import { loadWorkspaceEnv } from './env-utils.mjs';
import { applyResolvedLocalPostgresEnv } from './local-postgres.mjs';

loadWorkspaceEnv();

async function main() {
  const resolved = await applyResolvedLocalPostgresEnv(process.env);
  if (!resolved.managed || !resolved.databaseUrl || !resolved.port) {
    return;
  }

  process.stdout.write(`REY30_POSTGRES_PORT=${resolved.port}\n`);
  process.stdout.write(`DATABASE_URL=${resolved.databaseUrl}\n`);
  if (process.env.NETLIFY_DATABASE_URL) {
    process.stdout.write(`NETLIFY_DATABASE_URL=${process.env.NETLIFY_DATABASE_URL}\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`print-local-postgres-env failed: ${String(error?.message || error)}\n`);
  process.exit(1);
});
