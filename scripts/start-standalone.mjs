import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadWorkspaceEnv } from './env-utils.mjs';

loadWorkspaceEnv();

async function main() {
  const rootDir = process.cwd();
  const serverPath = path.join(rootDir, '.next', 'standalone', 'server.js');
  const serverDir = path.dirname(serverPath);

  if (!existsSync(serverPath)) {
    throw new Error('Missing standalone server. Run "pnpm run build" first.');
  }

  process.env.NODE_ENV = 'production';
  process.env.HOSTNAME = process.env.HOSTNAME || '127.0.0.1';
  process.env.PORT = process.env.PORT || '3000';
  process.chdir(serverDir);

  await import(pathToFileURL(serverPath).href);
}

main().catch((error) => {
  process.stderr.write(`start-standalone failed: ${String(error?.message || error)}\n`);
  process.exit(1);
});
