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

describe.sequential('Agent planner stale revert policy reset UI e2e', () => {
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

  it('confirms reset with a dialog and exports only reset audit events', async () => {
    if (!server || !browser) {
      throw new Error('Browser e2e server did not start.');
    }

    const page = await browser.newPage();
    const { routeState, policyPanel } = await openAgentPlannerPolicyPanel(page, server.baseUrl);

    await policyPanel.locator('[data-testid="agent-planner-stale-revert-policy-role-editor"]').check();
    await policyPanel
      .locator('[data-testid="agent-planner-stale-revert-policy-reason"]')
      .fill('Permitir EDITOR antes del restore controlado.');
    await policyPanel.locator('[data-testid="agent-planner-stale-revert-policy-save"]').click();
    await expect
      .poll(() => policyPanel.textContent(), { timeout: 5_000 })
      .toContain('OWNER, EDITOR');

    await policyPanel
      .locator('[data-testid="agent-planner-stale-revert-policy-reason"]')
      .fill('Restaurar a env default despues de validar auditoria.');
    await policyPanel.locator('[data-testid="agent-planner-stale-revert-policy-reset"]').click();

    const resetDialog = page.locator('[data-testid="agent-planner-stale-revert-policy-reset-dialog"]');
    await expect
      .poll(
        () => resetDialog.locator('[data-testid="agent-planner-stale-revert-policy-reset-preview"]').textContent(),
        { timeout: 5_000 }
      )
      .toContain('Antes: OWNER, EDITOR');
    await expect
      .poll(
        () => resetDialog.locator('[data-testid="agent-planner-stale-revert-policy-reset-preview"]').textContent(),
        { timeout: 5_000 }
      )
      .toContain('Después: OWNER');
    await resetDialog.locator('[data-testid="agent-planner-stale-revert-policy-reset-confirm"]').click();

    await expect
      .poll(() => policyPanel.textContent(), { timeout: 5_000 })
      .toContain('source env');
    await expect
      .poll(() => policyPanel.textContent(), { timeout: 5_000 })
      .toContain('reset env');

    await policyPanel
      .locator('[data-testid="agent-planner-stale-revert-policy-audit-filter"]')
      .selectOption('stale_metadata_revert_allowlist_reset_to_env');
    await expect
      .poll(() => policyPanel.textContent(), { timeout: 5_000 })
      .toContain('1-1 de 1');

    const [policyAuditJsonDownload] = await Promise.all([
      page.waitForEvent('download'),
      policyPanel.locator('[data-testid="agent-planner-stale-revert-policy-export-json-all"]').click(),
    ]);
    const policyAuditJsonReport = JSON.parse(await readDownloadText(policyAuditJsonDownload));
    expect(policyAuditJsonReport).toMatchObject({
      kind: 'stale_metadata_revert_policy_audit',
      configured: false,
      eventTypeFilter: 'stale_metadata_revert_allowlist_reset_to_env',
      exportScope: 'all',
      auditCount: 1,
      auditTrail: [
        expect.objectContaining({
          eventType: 'stale_metadata_revert_allowlist_reset_to_env',
          afterRoles: ['OWNER'],
        }),
      ],
    });
    expect(routeState.staleRevertPolicyConfig).toBeNull();
    expect(routeState.staleRevertPolicyAuditTrail).toHaveLength(2);
  }, 120_000);
});
