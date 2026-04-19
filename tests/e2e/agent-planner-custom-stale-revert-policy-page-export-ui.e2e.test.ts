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
  seedFourStaleRevertPolicyAllowlistChanges,
} from './helpers/agentPlannerCustomUi';

describe.sequential('Agent planner stale revert policy page export UI e2e', () => {
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

  it('exports the currently selected allowlist audit page', async () => {
    if (!server || !browser) {
      throw new Error('Browser e2e server did not start.');
    }

    const page = await browser.newPage();
    const { routeState, policyPanel } = await openAgentPlannerPolicyPanel(page, server.baseUrl);

    seedFourStaleRevertPolicyAllowlistChanges(routeState);
    await policyPanel.locator('[data-testid="agent-planner-stale-revert-policy-refresh"]').click();

    await expect
      .poll(() => policyPanel.textContent(), { timeout: 5_000 })
      .toContain('1-3 de 4');

    await policyPanel.locator('[data-testid="agent-planner-stale-revert-policy-audit-next"]').click();
    await expect
      .poll(() => policyPanel.textContent(), { timeout: 5_000 })
      .toContain('4-4 de 4');

    const [policyAuditPageJsonDownload] = await Promise.all([
      page.waitForEvent('download'),
      policyPanel.locator('[data-testid="agent-planner-stale-revert-policy-export-json"]').click(),
    ]);
    const policyAuditPageJsonReport = JSON.parse(await readDownloadText(policyAuditPageJsonDownload));
    expect(policyAuditPageJsonReport).toMatchObject({
      kind: 'stale_metadata_revert_policy_audit',
      configured: true,
      eventTypeFilter: 'all',
      exportScope: 'page',
      auditCount: 1,
      totalAuditCount: 4,
      pagination: {
        offset: 3,
        total: 4,
      },
    });
    expect(routeState.staleRevertPolicyConfig?.allowedRoles).toEqual(['OWNER']);
    expect(routeState.staleRevertPolicyAuditTrail).toHaveLength(4);
  }, 100_000);
});
