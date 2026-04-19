import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { chromium } from '../../scripts/playwright-runtime.mjs';
import {
  readDownloadText,
  startNextDevServer,
  type StartedServer,
} from './helpers/nextDevServer';
import {
  createManualCustomPlanner,
  installAgentPlannerCustomUiRoutes,
  openAgentPlannerPanel,
} from './helpers/agentPlannerCustomUi';

describe.sequential('Agent planner custom metadata UI e2e', () => {
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

  it('edits, diffs, reverts, filters, and exports custom task metadata', async () => {
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
    await expect
      .poll(
        () => plannerPanel.locator('[data-testid="agent-planner-source-block-groups"]').textContent(),
        { timeout: 5_000 }
      )
      .toContain('pending 2');

    const taskRows = plannerPanel.locator('[data-testid="agent-planner-custom-task"]');
    const completeTaskRow = taskRows.filter({ hasText: 'Completar desde UI' });

    await completeTaskRow.getByRole('button', { name: 'Editar metadata' }).click();
    await completeTaskRow
      .locator('[data-testid="agent-planner-custom-task-title-input"]')
      .fill('Completar desde UI editada');
    await completeTaskRow
      .locator('[data-testid="agent-planner-custom-task-summary-input"]')
      .fill('Resumen editado desde el panel real.');
    await completeTaskRow
      .locator('[data-testid="agent-planner-custom-task-owner-input"]')
      .fill('maintenance_agent');
    await completeTaskRow
      .locator('[data-testid="agent-planner-custom-task-priority-input"]')
      .selectOption('low');
    await completeTaskRow
      .locator('[data-testid="agent-planner-custom-task-source-input"]')
      .fill('source_ui_e2e_edited');
    await completeTaskRow.getByRole('button', { name: 'Guardar metadata' }).click();

    await expect
      .poll(
        () => plannerPanel.locator('[data-testid="agent-planner-custom-tasks"]').textContent(),
        { timeout: 5_000 }
      )
      .toContain('Completar desde UI editada');
    await expect
      .poll(
        () => completeTaskRow.locator('[data-testid="agent-planner-custom-task-metadata-history"]').textContent(),
        { timeout: 5_000 }
      )
      .toContain('Historial metadata');
    await completeTaskRow
      .locator('[data-testid="agent-planner-custom-task-metadata-history"] summary')
      .click();
    await expect
      .poll(
        () =>
          completeTaskRow
            .locator('[data-testid="agent-planner-custom-task-metadata-diff"]')
            .filter({ hasText: 'title' })
            .textContent(),
        { timeout: 5_000 }
      )
      .toContain('Completar desde UI editada');

    const [jsonDownload] = await Promise.all([
      page.waitForEvent('download'),
      completeTaskRow.getByRole('button', { name: 'JSON', exact: true }).click(),
    ]);
    const jsonReport = JSON.parse(await readDownloadText(jsonDownload));
    expect(jsonReport).toMatchObject({
      kind: 'agent_planner_custom_task_metadata_history',
      task: {
        taskId: 'source_ui_e2e_1',
        title: 'Completar desde UI editada',
      },
      historyCount: 5,
    });

    const [markdownDownload] = await Promise.all([
      page.waitForEvent('download'),
      completeTaskRow.getByRole('button', { name: 'Markdown' }).click(),
    ]);
    const markdownReport = await readDownloadText(markdownDownload);
    expect(markdownReport).toContain('# Custom Task Metadata History');
    expect(markdownReport).toContain('Completar desde UI editada');

    await completeTaskRow
      .locator('[data-testid="agent-planner-custom-task-metadata-diff"]')
      .filter({ hasText: 'title' })
      .getByRole('button', { name: 'Revertir' })
      .click();
    await expect
      .poll(
        () => plannerPanel.locator('[data-testid="agent-planner-custom-tasks"]').textContent(),
        { timeout: 5_000 }
      )
      .toContain('Completar desde UI');
    await expect
      .poll(
        () => plannerPanel.locator('[data-testid="agent-planner-source-block-groups"]').textContent(),
        { timeout: 5_000 }
      )
      .toContain('source_ui_e2e_edited');
    expect(routeState.metadataSources).toEqual(['source_ui_e2e_edited']);

    await plannerPanel
      .locator('[data-testid="agent-planner-source-block-filter"]')
      .selectOption('source_ui_e2e_edited');
    await expect
      .poll(
        () => plannerPanel.locator('[data-testid="agent-planner-custom-tasks"]').textContent(),
        { timeout: 5_000 }
      )
      .toContain('maintenance_agent');
    await plannerPanel
      .locator('[data-testid="agent-planner-source-block-filter"]')
      .selectOption('all');
  }, 140_000);
});
