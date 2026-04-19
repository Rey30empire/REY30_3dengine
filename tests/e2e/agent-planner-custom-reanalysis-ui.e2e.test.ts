import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { chromium } from '../../scripts/playwright-runtime.mjs';
import {
  startNextDevServer,
  type StartedServer,
} from './helpers/nextDevServer';
import {
  installAgentPlannerCustomUiRoutes,
  openAgentPlannerPanel,
} from './helpers/agentPlannerCustomUi';

describe.sequential('Agent planner approved reanalysis scope UI e2e', () => {
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

  it('loads approved reanalysis blocks and creates a planner only from selected blocks', async () => {
    if (!server || !browser) {
      throw new Error('Browser e2e server did not start.');
    }

    const page = await browser.newPage();
    const routeState = await installAgentPlannerCustomUiRoutes(page);
    const plannerPanel = await openAgentPlannerPanel(page, server.baseUrl);

    await plannerPanel.locator('[data-testid="agent-planner-custom-form-toggle"]').click();
    await plannerPanel.locator('[data-testid="agent-planner-create-from-reanalysis-scope"]').click();
    await expect
      .poll(
        () => plannerPanel.locator('[data-testid="agent-planner-approved-reanalysis-blocks"]').textContent(),
        { timeout: 10_000 }
      )
      .toContain('Approved scope block');

    const approvedBlocks = plannerPanel.locator('[data-testid="agent-planner-approved-reanalysis-block"]');
    await approvedBlocks.filter({ hasText: 'Approved UI block' }).locator('input').uncheck();
    await plannerPanel.locator('[data-testid="agent-planner-create-selected-reanalysis-scope"]').click();

    await expect
      .poll(
        () => plannerPanel.locator('[data-testid="agent-planner-custom-tasks"]').textContent(),
        { timeout: 5_000 }
      )
      .toContain('Scope aprobado desde reanalysis');
    await expect
      .poll(
        () => plannerPanel.locator('[data-testid="agent-planner-source-block-groups"]').textContent(),
        { timeout: 5_000 }
      )
      .toContain('approved_scope_block');
    await expect
      .poll(
        () => plannerPanel.locator('[data-testid="agent-planner-custom-tasks"]').textContent(),
        { timeout: 5_000 }
      )
      .not.toContain('Bloque UI opcional desde reanalysis');
    expect(routeState.reanalysisCreateBlockSelections).toEqual([['approved_scope_block']]);
  }, 140_000);
});
