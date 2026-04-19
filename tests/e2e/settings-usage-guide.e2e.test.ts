import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { chromium } from '../../scripts/playwright-runtime.mjs';
import {
  fulfillJson,
  startNextDevServer,
  type StartedServer,
} from './helpers/nextDevServer';

const AUTHED_ADMIN = {
  authenticated: true,
  accessMode: 'user_session',
  user: { id: 'guide-admin-1', role: 'OWNER', email: 'guide-admin@example.com' },
  editorAccess: {
    shellMode: 'advanced',
    permissions: {
      advancedShell: true,
      admin: true,
      compile: true,
      advancedWorkspaces: true,
      debugTools: true,
      editorSessionBridge: true,
      terminalActions: false,
    },
  },
};

async function installGuideRoutes(page: Page) {
  await page.route('**/api/auth/session', (route) => fulfillJson(route, AUTHED_ADMIN));
  await page.route('**/api/user/api-config', (route) =>
    fulfillJson(route, {
      ok: true,
    })
  );
  await page.route('**/api/user/security-logs', (route) =>
    fulfillJson(route, {
      ok: true,
      logs: [],
    })
  );
}

describe('Settings usage guide tour', () => {
  let server: StartedServer;
  let browser: Browser;

  beforeAll(async () => {
    server = await startNextDevServer(process.cwd());
    browser = await chromium.launch({ headless: true });
  }, 240_000);

  afterAll(async () => {
    await browser?.close();
    await server?.stop();
  }, 60_000);

  it('opens Guia de uso and creates the guided demo scene', async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    await installGuideRoutes(page);

    await page.goto(`${server.baseUrl}/admin`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('settings-usage-guide-button').click({ timeout: 120_000 });

    const guide = page.getByTestId('usage-guide-copilot-panel');
    await guide.waitFor({ state: 'visible', timeout: 120_000 });

    await expect
      .poll(async () => (await guide.textContent()) || '', { timeout: 30_000 })
      .toContain('Copilot de uso REY30');
    await expect
      .poll(async () => (await guide.textContent()) || '', { timeout: 30_000 })
      .toContain('Mapa de implementación');
    await expect
      .poll(async () => (await guide.textContent()) || '', { timeout: 30_000 })
      .toContain('Tour guiado');

    await page.getByTestId('usage-guide-create-demo-scene').click();

    await expect
      .poll(async () => (await page.getByTestId('usage-guide-demo-scene-result').textContent()) || '', {
        timeout: 30_000,
      })
      .toContain('player seleccionado');
    await expect
      .poll(async () => (await page.getByTestId('usage-guide-copilot-summary').textContent()) || '', {
        timeout: 30_000,
      })
      .toContain('entidades 8');

    await page.close();
  }, 120_000);
});
