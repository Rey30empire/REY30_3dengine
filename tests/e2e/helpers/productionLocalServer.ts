import path from 'node:path';
import {
  createProcessLogBuffer,
  createStartedServer,
  E2E_HOST,
  findFreePort,
  spawnNodeServerProcess,
  type StartedServer,
  waitForProcessReady,
} from './serverProcess';

export type { StartedServer } from './serverProcess';

const START_TIMEOUT_MS = 240_000;

export const PRODUCTION_E2E_OUTPUT_SCRIPTS_ROOT = path.join(
  process.cwd(),
  'output',
  'e2e-http-scripts'
);

export async function startProductionLocalServer(
  root: string,
  productionEnv: Record<string, string>
): Promise<StartedServer> {
  const port = await findFreePort();
  const baseUrl = `http://${E2E_HOST}:${port}`;

  const startArgs = ['scripts/start-production-local.mjs', '--skip-build'];
  if (
    process.env.CI === 'true' ||
    process.env.REY30_PRODUCTION_LOCAL_SKIP_DOCKER === 'true'
  ) {
    startArgs.push('--skip-docker');
  }

  const child = spawnNodeServerProcess({
    root,
    args: startArgs,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOSTNAME: E2E_HOST,
      PORT: String(port),
      DATABASE_URL: productionEnv.DATABASE_URL,
      NEXTAUTH_SECRET: productionEnv.NEXTAUTH_SECRET,
      REY30_ENCRYPTION_KEY: productionEnv.REY30_ENCRYPTION_KEY,
      REY30_REGISTRATION_MODE: productionEnv.REY30_REGISTRATION_MODE,
      REY30_REGISTRATION_INVITE_TOKEN: productionEnv.REY30_REGISTRATION_INVITE_TOKEN,
      REY30_BOOTSTRAP_OWNER_TOKEN: productionEnv.REY30_BOOTSTRAP_OWNER_TOKEN,
      REY30_ALLOW_OPEN_REGISTRATION_REMOTE:
        productionEnv.REY30_ALLOW_OPEN_REGISTRATION_REMOTE || 'false',
      REY30_ALLOW_IN_MEMORY_RATE_LIMIT_PRODUCTION:
        productionEnv.REY30_ALLOW_IN_MEMORY_RATE_LIMIT_PRODUCTION || 'true',
      REY30_ALLOWED_ORIGINS: `${baseUrl},http://localhost:${port}`,
      REY30_SCRIPT_ROOT: PRODUCTION_E2E_OUTPUT_SCRIPTS_ROOT,
    },
  });
  const logs = createProcessLogBuffer(child);

  await waitForProcessReady({
    baseUrl,
    child,
    getLogs: logs,
    label: 'production-local',
    timeoutMs: START_TIMEOUT_MS,
    check: async (url) => {
      const response = await fetch(`${url}/api/health/ready`, {
        method: 'GET',
        cache: 'no-store',
      });
      if (response.status !== 200) {
        return false;
      }
      const payload = await response.json();
      return payload?.ok === true && payload?.status === 'ready';
    },
  });

  return createStartedServer({ baseUrl, child, logs });
}
