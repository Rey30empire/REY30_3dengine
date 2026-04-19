import { loadWorkspaceEnv, resolveDatabaseUrl } from './env-utils.mjs';
import { applyResolvedLocalPostgresEnv } from './local-postgres.mjs';
import {
  getFallbackDatabaseUrl,
  pathNeedsShadow,
  prepareShadowWorkspace,
  resolvePrismaProvider,
  runCommand,
  syncRelativePathBack,
} from './shadow-workspace.mjs';

const args = process.argv.slice(2);
if (args.length === 0) {
  args.push('db', 'push');
}

loadWorkspaceEnv();

async function main() {
  await applyResolvedLocalPostgresEnv(process.env);
  const root = process.cwd();
  const targetRoot = pathNeedsShadow(root)
    ? await prepareShadowWorkspace({
        root,
        bucket: 'REY30_shadow_prisma',
        binaryRelativePath: [
          'node_modules',
          '.bin',
          process.platform === 'win32' ? 'prisma.cmd' : 'prisma',
        ],
        ensurePrisma: false,
      })
    : root;

  if (targetRoot !== root) {
    process.stdout.write(
      `Detected '#' in path. Running Prisma command in shadow workspace:\n${targetRoot}\n`
    );
  }

  const prismaProvider = resolvePrismaProvider(targetRoot);
  const fallbackDatabaseUrl = getFallbackDatabaseUrl(targetRoot);
  const resolvedDatabaseUrl = resolveDatabaseUrl(process.env);
  const env = {
    ...process.env,
    ...(resolvedDatabaseUrl
      ? { DATABASE_URL: resolvedDatabaseUrl }
      : fallbackDatabaseUrl
        ? { DATABASE_URL: fallbackDatabaseUrl }
        : {}),
    RUST_LOG: process.env.RUST_LOG || 'info',
  };

  if (!env.DATABASE_URL && prismaProvider !== 'sqlite') {
    throw new Error(`DATABASE_URL is required for Prisma provider "${prismaProvider}".`);
  }

  runCommand('pnpm', ['exec', 'prisma', ...args], {
    cwd: targetRoot,
    envOverrides: env,
  });

  if (targetRoot !== root) {
    await syncRelativePathBack(targetRoot, root, 'prisma');
  }
}

main().catch((error) => {
  process.stderr.write(`prisma-db-safe failed: ${String(error?.message || error)}\n`);
  process.exit(1);
});
