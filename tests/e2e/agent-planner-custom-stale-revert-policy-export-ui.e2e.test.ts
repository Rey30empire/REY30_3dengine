import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { chromium } from '../../scripts/playwright-runtime.mjs';
import {
  readDownloadText,
  startNextDevServer,
  type StartedServer,
} from './helpers/nextDevServer';
import {
  openAgentPlannerPolicyPanel,
} from './helpers/agentPlannerCustomUi';

describe.sequential('Agent planner stale revert policy export UI e2e', () => {
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

  it('exports the full allowlist audit with actor and date filters', async () => {
    if (!server || !browser) {
      throw new Error('Browser e2e server did not start.');
    }

    const page = await browser.newPage();
    const { routeState, policyPanel } = await openAgentPlannerPolicyPanel(page, server.baseUrl);

    await policyPanel.locator('[data-testid="agent-planner-stale-revert-policy-role-editor"]').check();
    await policyPanel
      .locator('[data-testid="agent-planner-stale-revert-policy-reason"]')
      .fill('Permitir EDITOR durante QA supervisado.');
    await policyPanel.locator('[data-testid="agent-planner-stale-revert-policy-save"]').click();
    await expect
      .poll(() => policyPanel.textContent(), { timeout: 5_000 })
      .toContain('OWNER, EDITOR');

    await policyPanel.locator('[data-testid="agent-planner-stale-revert-policy-role-viewer"]').check();
    await policyPanel
      .locator('[data-testid="agent-planner-stale-revert-policy-reason"]')
      .fill('Permitir VIEWER para prueba de export completo.');
    await policyPanel.locator('[data-testid="agent-planner-stale-revert-policy-save"]').click();
    await expect
      .poll(() => policyPanel.textContent(), { timeout: 5_000 })
      .toContain('OWNER, EDITOR, VIEWER');

    await policyPanel
      .locator('[data-testid="agent-planner-stale-revert-policy-actor-filter"]')
      .fill('editor@example.com');
    await policyPanel.locator('[data-testid="agent-planner-stale-revert-policy-date-from-filter"]').fill('1970-01-01T00:00');
    await policyPanel.locator('[data-testid="agent-planner-stale-revert-policy-date-filter-apply"]').click();
    await expect
      .poll(() => policyPanel.textContent(), { timeout: 5_000 })
      .toContain('1-2 de 2');

    const [policyAuditAllJsonDownload] = await Promise.all([
      page.waitForEvent('download'),
      policyPanel.locator('[data-testid="agent-planner-stale-revert-policy-export-json-all"]').click(),
    ]);
    const policyAuditAllJsonReport = JSON.parse(await readDownloadText(policyAuditAllJsonDownload));
    expect(policyAuditAllJsonReport).toMatchObject({
      kind: 'stale_metadata_revert_policy_audit',
      configured: true,
      actorFilter: 'editor@example.com',
      dateFromFilter: '1970-01-01T00:00',
      dateToFilter: null,
      exportScope: 'all',
      auditCount: 2,
      totalAuditCount: 2,
    });
    expect(routeState.staleRevertPolicyConfig?.allowedRoles).toEqual(['OWNER', 'EDITOR', 'VIEWER']);
    expect(routeState.staleRevertPolicyAuditTrail).toHaveLength(2);
  }, 120_000);
});
