import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { chromium } from '../../scripts/playwright-runtime.mjs';
import {
  fulfillJson,
  startNextDevServer,
  type StartedServer,
} from './helpers/nextDevServer';

describe.sequential('Agentic runtime scaffold client browser e2e', () => {
  let server: StartedServer | null = null;
  let browser: Browser | null = null;

  beforeAll(async () => {
    server = await startNextDevServer(process.cwd());
    browser = await chromium.launch({ headless: true });
  }, 320_000);

  afterAll(async () => {
    await browser?.close();
    await server?.stop();
  }, 30_000);

  it('shows runtime scaffold metadata in the chat after a remote build export', async () => {
    if (!server || !browser) {
      throw new Error('Browser e2e server did not start.');
    }

    const page = await browser.newPage();
    let remoteSaveCalls = 0;
    let remoteBuildCalls = 0;

    await page.route('**/api/auth/session', (route) =>
      fulfillJson(route, {
        authenticated: false,
        editorAccess: {
          shellMode: 'product',
          permissions: {
            advancedShell: false,
            admin: false,
            compile: false,
            advancedWorkspaces: false,
            debugTools: false,
            editorSessionBridge: false,
            terminalActions: false,
          },
        },
      })
    );

    await page.route('**/api/editor-project**', async (route) => {
      if (route.request().method() === 'POST') {
        remoteSaveCalls += 1;
        const payload = JSON.parse(route.request().postData() || '{}');
        expect(payload.saveData?.custom?.kind).toBe('editor_project');
        expect(payload.saveData?.custom?.entityCount).toBeGreaterThanOrEqual(2);
      }

      await fulfillJson(route, {
        success: true,
        projectKey: 'untitled_project',
        slot: 'editor_project_current',
        summary: {
          slot: 'editor_project_current',
          timestamp: Date.now(),
          projectName: 'Untitled Project',
          sceneCount: 1,
          entityCount: 2,
          assetCount: 1,
          scribProfileCount: 0,
          scribInstanceCount: 0,
        },
      });
    });

    await page.route('**/api/build', async (route) => {
      remoteBuildCalls += 1;
      await fulfillJson(route, {
        ok: true,
        target: 'web',
        buildId: 'browser-agentic-build',
        report: {
          ok: true,
          sceneCount: 1,
          assetCount: 1,
          entityCount: 2,
          diagnostics: [],
          summary: 'Remote browser build ok.',
          generatedAt: '2026-04-16T00:00:00.000Z',
        },
        artifacts: [
          {
            id: 'artifact-browser-agentic-web',
            target: 'web',
            path: 'output/builds/browser-agentic/browser-agentic-web.zip',
            size: 512,
            createdAt: '2026-04-16T00:00:00.000Z',
            kind: 'bundle',
          },
        ],
        missingDeps: [],
        logs: ['Remote package emitted for browser e2e.'],
        source: 'remote_editor_project',
      });
    });

    await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'AI Chat', exact: true }).click({ timeout: 120_000 });

    const input = page.locator('input').last();
    await input.fill('exporta esta escena para web');
    await input.press('Enter');

    const scaffold = page.locator('[data-testid="agentic-runtime-scaffold"]').first();
    await scaffold.waitFor({ state: 'visible', timeout: 120_000 });

    await expect.poll(() => remoteSaveCalls, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
    await expect.poll(() => remoteBuildCalls, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
    await expect.poll(() => scaffold.textContent(), { timeout: 5_000 }).toContain(
      'Runtime export preparado'
    );
    await expect
      .poll(() => page.locator('[data-testid="agentic-runtime-scaffold-camera"]').first().textContent())
      .toBe('camera');
    await expect
      .poll(() => page.locator('[data-testid="agentic-runtime-scaffold-player"]').first().textContent())
      .toBe('player');
  }, 180_000);
});
