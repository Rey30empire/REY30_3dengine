import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { chromium } from '../../scripts/playwright-runtime.mjs';
import {
  startNextDevServer,
  type StartedServer,
} from './helpers/nextDevServer';
import {
  openAgentPlannerPolicyPanel,
  seedFourStaleRevertPolicyAllowlistChanges,
} from './helpers/agentPlannerCustomUi';

describe.sequential('Agent planner stale revert policy UI e2e', () => {
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

  it('filters the allowlist audit by actor/date and clears filters from chips', async () => {
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

    await policyPanel.locator('[data-testid="agent-planner-stale-revert-policy-date-to-filter"]').fill('1970-01-01T00:00');
    await policyPanel.locator('[data-testid="agent-planner-stale-revert-policy-date-filter-apply"]').click();
    await expect
      .poll(() => policyPanel.textContent(), { timeout: 5_000 })
      .toContain('0-0 de 0');
    await expect
      .poll(
        () => policyPanel.locator('[data-testid="agent-planner-stale-revert-policy-active-filters"]').textContent(),
        { timeout: 5_000 }
      )
      .toContain('to: 1970-01-01T00:00');

    await policyPanel.locator('[data-testid="agent-planner-stale-revert-policy-active-filter-to"]').click();
    await expect
      .poll(
        () => policyPanel.locator('[data-testid="agent-planner-stale-revert-policy-date-to-filter"]').inputValue(),
        { timeout: 5_000 }
      )
      .toBe('');
    await expect
      .poll(() => policyPanel.textContent(), { timeout: 5_000 })
      .toContain('1-3 de 4');

    await policyPanel
      .locator('[data-testid="agent-planner-stale-revert-policy-actor-filter"]')
      .fill('missing@example.com');
    await policyPanel.locator('[data-testid="agent-planner-stale-revert-policy-actor-filter-apply"]').click();
    await expect
      .poll(() => policyPanel.textContent(), { timeout: 5_000 })
      .toContain('0-0 de 0');
    await expect
      .poll(
        () => policyPanel.locator('[data-testid="agent-planner-stale-revert-policy-active-filters"]').textContent(),
        { timeout: 5_000 }
      )
      .toContain('actor: missing@example.com');

    await policyPanel.locator('[data-testid="agent-planner-stale-revert-policy-active-filter-actor"]').click();
    await expect
      .poll(
        () => policyPanel.locator('[data-testid="agent-planner-stale-revert-policy-actor-filter"]').inputValue(),
        { timeout: 5_000 }
      )
      .toBe('');
    await expect
      .poll(() => policyPanel.textContent(), { timeout: 5_000 })
      .toContain('1-3 de 4');

    await policyPanel.locator('[data-testid="agent-planner-stale-revert-policy-date-from-filter"]').fill('2999-01-01T00:00');
    await policyPanel.locator('[data-testid="agent-planner-stale-revert-policy-date-filter-apply"]').click();
    await expect
      .poll(() => policyPanel.textContent(), { timeout: 5_000 })
      .toContain('0-0 de 0');
    await expect
      .poll(
        () => policyPanel.locator('[data-testid="agent-planner-stale-revert-policy-active-filters"]').textContent(),
        { timeout: 5_000 }
      )
      .toContain('from: 2999-01-01T00:00');

    await policyPanel.locator('[data-testid="agent-planner-stale-revert-policy-active-filter-from"]').click();
    await expect
      .poll(
        () => policyPanel.locator('[data-testid="agent-planner-stale-revert-policy-date-from-filter"]').inputValue(),
        { timeout: 5_000 }
      )
      .toBe('');
    await expect
      .poll(() => policyPanel.textContent(), { timeout: 5_000 })
      .toContain('1-3 de 4');

    await policyPanel
      .locator('[data-testid="agent-planner-stale-revert-policy-actor-filter"]')
      .fill('missing@example.com');
    await policyPanel.locator('[data-testid="agent-planner-stale-revert-policy-date-from-filter"]').fill('2999-01-01T00:00');
    await policyPanel.locator('[data-testid="agent-planner-stale-revert-policy-date-filter-apply"]').click();
    await expect
      .poll(
        () => policyPanel.locator('[data-testid="agent-planner-stale-revert-policy-active-filters"]').textContent(),
        { timeout: 5_000 }
      )
      .toContain('actor: missing@example.com');
    await policyPanel.locator('[data-testid="agent-planner-stale-revert-policy-filter-clear-all"]').click();
    await expect
      .poll(
        () => policyPanel.locator('[data-testid="agent-planner-stale-revert-policy-actor-filter"]').inputValue(),
        { timeout: 5_000 }
      )
      .toBe('');
    await expect
      .poll(
        () => policyPanel.locator('[data-testid="agent-planner-stale-revert-policy-date-from-filter"]').inputValue(),
        { timeout: 5_000 }
      )
      .toBe('');
    await expect
      .poll(
        () => policyPanel.locator('[data-testid="agent-planner-stale-revert-policy-active-filters"]').count(),
        { timeout: 5_000 }
      )
      .toBe(0);
    await expect
      .poll(() => policyPanel.textContent(), { timeout: 5_000 })
      .toContain('1-3 de 4');
  }, 100_000);
});
