import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { chromium } from '../../scripts/playwright-runtime.mjs';
import {
  startNextDevServer,
  type StartedServer,
} from './helpers/nextDevServer';
import {
  createManualCustomPlanner,
  installAgentPlannerCustomUiRoutes,
  openAgentPlannerPanel,
} from './helpers/agentPlannerCustomUi';

describe.sequential('Agent planner custom task status UI e2e', () => {
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

  it('starts, completes, and fails custom tasks from direct UI actions', async () => {
    if (!server || !browser) {
      throw new Error('Browser e2e server did not start.');
    }

    const page = await browser.newPage();
    const routeState = await installAgentPlannerCustomUiRoutes(page);
    const plannerPanel = await openAgentPlannerPanel(page, server.baseUrl);

    await createManualCustomPlanner(plannerPanel);

    await expect
      .poll(
        () => plannerPanel.locator('[data-testid="agent-planner-custom-tasks"]').textContent(),
        { timeout: 10_000 }
      )
      .toContain('Completar desde UI');

    const taskRows = plannerPanel.locator('[data-testid="agent-planner-custom-task"]');
    const completeTaskRow = taskRows.filter({ hasText: 'Completar desde UI' });
    const failedTaskRow = taskRows.filter({ hasText: 'Fallar desde UI' });

    await completeTaskRow.getByRole('button', { name: 'Iniciar task' }).click();
    await completeTaskRow.getByRole('button', { name: 'Completar task' }).click();
    await expect
      .poll(
        () => plannerPanel.locator('[data-testid="agent-planner-custom-tasks"]').textContent(),
        { timeout: 5_000 }
      )
      .toContain('completada desde acción directa');

    await failedTaskRow.getByRole('button', { name: 'Iniciar task' }).click();
    await failedTaskRow.getByRole('button', { name: 'Falló task' }).click();
    await expect
      .poll(
        () => plannerPanel.locator('[data-testid="agent-planner-custom-tasks"]').textContent(),
        { timeout: 5_000 }
      )
      .toContain('marcada con fallo desde acción directa');

    expect(routeState.patchStatuses).toEqual(['running', 'completed', 'running', 'failed']);
  }, 100_000);
});
