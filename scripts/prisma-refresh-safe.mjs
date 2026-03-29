import path from 'node:path';
import { loadWorkspaceEnv } from './env-utils.mjs';
import {
  ensureShadowPrismaClient,
  pathExists,
  resolvePrismaProvider,
  getPrismaCommandEnv,
} from './shadow-workspace.mjs';

loadWorkspaceEnv();

async function main() {
  const root = process.cwd();
  const schemaPath = path.join(root, 'prisma', 'schema.prisma');
  if (!(await pathExists(schemaPath))) {
    process.stdout.write('Prisma schema not found; skipping client refresh.\n');
    return;
  }

  const prismaProvider = resolvePrismaProvider(root);
  const env = getPrismaCommandEnv(root, process.env);
  if (!env.DATABASE_URL && prismaProvider !== 'sqlite') {
    throw new Error(`DATABASE_URL is required for Prisma provider "${prismaProvider}".`);
  }

  await ensureShadowPrismaClient(root, process.env);
  process.stdout.write('Prisma client ready.\n');
}

main().catch((error) => {
  process.stderr.write(`prisma-refresh-safe failed: ${String(error?.message || error)}\n`);
  process.exit(1);
});
