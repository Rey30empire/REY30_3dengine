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

describe.sequential('Agent planner stale metadata revert UI e2e', () => {
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

  it('shows the 409 blocker, requires a reason, and audits confirmed stale revert', async () => {
    if (!server || !browser) {
      throw new Error('Browser e2e server did not start.');
    }

    const page = await browser.newPage();
    const routeState = await installAgentPlannerCustomUiRoutes(page);
    const plannerPanel = await openAgentPlannerPanel(page, server.baseUrl);

    await createManualCustomPlanner(plannerPanel);

    const taskRows = plannerPanel.locator('[data-testid="agent-planner-custom-task"]');
    const completeTaskRow = taskRows.filter({ hasText: 'Completar desde UI' });
    await expect
      .poll(
        () => completeTaskRow.locator('[data-testid="agent-planner-custom-task-title"]').textContent(),
        { timeout: 10_000 }
      )
      .toBe('Completar desde UI');

    await completeTaskRow.getByRole('button', { name: 'Editar metadata' }).click();
    await completeTaskRow
      .locator('[data-testid="agent-planner-custom-task-title-input"]')
      .fill('Completar desde UI v1');
    await completeTaskRow.getByRole('button', { name: 'Guardar metadata' }).click();
    await expect
      .poll(
        () => completeTaskRow.locator('[data-testid="agent-planner-custom-task-title"]').textContent(),
        { timeout: 5_000 }
      )
      .toBe('Completar desde UI v1');

    await completeTaskRow.getByRole('button', { name: 'Editar metadata' }).click();
    await completeTaskRow
      .locator('[data-testid="agent-planner-custom-task-title-input"]')
      .fill('Completar desde UI v2');
    await completeTaskRow.getByRole('button', { name: 'Guardar metadata' }).click();
    await expect
      .poll(
        () => completeTaskRow.locator('[data-testid="agent-planner-custom-task-title"]').textContent(),
        { timeout: 5_000 }
      )
      .toBe('Completar desde UI v2');

    await completeTaskRow
      .locator('[data-testid="agent-planner-custom-task-metadata-history"] summary')
      .click();
    await completeTaskRow.getByRole('button', { name: 'Revertir con riesgo' }).click();

    const blocker = plannerPanel.locator('[data-testid="agent-planner-stale-revert-blocker"]');
    await expect
      .poll(() => blocker.textContent(), { timeout: 5_000 })
      .toContain('Revert metadata bloqueado');
    await expect
      .poll(() => blocker.textContent(), { timeout: 5_000 })
      .toContain('valor actual Completar desde UI v2');
    await expect
      .poll(() => blocker.textContent(), { timeout: 5_000 })
      .toContain('revertir a Completar desde UI');
    await expect
      .poll(
        () => plannerPanel.locator('[data-testid="agent-planner-stale-revert-confirm"]').isDisabled(),
        { timeout: 5_000 }
      )
      .toBe(true);
    await expect
      .poll(
        () => completeTaskRow.locator('[data-testid="agent-planner-custom-task-title"]').textContent(),
        { timeout: 5_000 }
      )
      .toBe('Completar desde UI v2');

    await plannerPanel
      .locator('[data-testid="agent-planner-stale-revert-reason"]')
      .fill('Confirmado por E2E: recuperar el titulo original validado.');
    await plannerPanel.locator('[data-testid="agent-planner-stale-revert-confirm"]').click();

    await expect
      .poll(
        () => completeTaskRow.locator('[data-testid="agent-planner-custom-task-title"]').textContent(),
        { timeout: 5_000 }
      )
      .toBe('Completar desde UI');
    await expect.poll(() => blocker.count(), { timeout: 5_000 }).toBe(0);
    await expect
      .poll(
        () =>
          completeTaskRow
            .locator('[data-testid="agent-planner-custom-task-metadata-audit"]')
            .textContent(),
        { timeout: 5_000 }
      )
      .toContain('editor@example.com');
    await expect
      .poll(
        () =>
          completeTaskRow
            .locator('[data-testid="agent-planner-custom-task-metadata-audit"]')
            .textContent(),
        { timeout: 5_000 }
      )
      .toContain('recuperar el titulo original');

    await completeTaskRow
      .locator('[data-testid="agent-planner-custom-task-metadata-filter"]')
      .selectOption('reverts');
    await expect
      .poll(
        () =>
          completeTaskRow
            .locator('[data-testid="agent-planner-custom-task-metadata-history"] summary')
            .textContent(),
        { timeout: 5_000 }
      )
      .toContain('1/3');

    await completeTaskRow
      .locator('[data-testid="agent-planner-custom-task-metadata-filter"]')
      .selectOption('staleConfirmed');
    await expect
      .poll(
        () =>
          completeTaskRow
            .locator('[data-testid="agent-planner-custom-task-metadata-history"] summary')
            .textContent(),
        { timeout: 5_000 }
      )
      .toContain('1/3');

    const [auditJsonDownload] = await Promise.all([
      page.waitForEvent('download'),
      completeTaskRow.getByRole('button', { name: 'Audit JSON' }).click(),
    ]);
    const auditJsonReport = JSON.parse(await readDownloadText(auditJsonDownload));
    expect(auditJsonReport).toMatchObject({
      kind: 'agent_planner_custom_task_metadata_revert_audits',
      filter: 'staleConfirmed',
      auditCount: 1,
      audits: [
        expect.objectContaining({
          source: 'metadata_revert',
          staleRevertConfirmation: expect.objectContaining({
            confirmedByEmail: 'editor@example.com',
          }),
        }),
      ],
    });

    const [auditMarkdownDownload] = await Promise.all([
      page.waitForEvent('download'),
      completeTaskRow.getByRole('button', { name: 'Audit MD' }).click(),
    ]);
    const auditMarkdownReport = await readDownloadText(auditMarkdownDownload);
    expect(auditMarkdownReport).toContain('# Custom Task Metadata Revert Audits');
    expect(auditMarkdownReport).toContain('Filter: staleConfirmed');
    expect(auditMarkdownReport).toContain('confirmedByEmail: editor@example.com');

    const globalAuditPanel = plannerPanel.locator('[data-testid="agent-planner-metadata-audit-panel"]');
    await expect
      .poll(() => globalAuditPanel.textContent(), { timeout: 5_000 })
      .toContain('edits 2 · reverts 1 · stale confirmed 1');
    await expect
      .poll(
        () =>
          globalAuditPanel
            .locator('[data-testid="agent-planner-global-revert-audit-entry"]')
            .textContent(),
        { timeout: 5_000 }
      )
      .toContain('Completar desde UI');
    await globalAuditPanel
      .locator('[data-testid="agent-planner-global-revert-audit-filter"]')
      .selectOption('staleConfirmed');

    const [globalAuditJsonDownload] = await Promise.all([
      page.waitForEvent('download'),
      globalAuditPanel.getByRole('button', { name: 'JSON todo' }).click(),
    ]);
    const globalAuditJsonReport = JSON.parse(await readDownloadText(globalAuditJsonDownload));
    expect(globalAuditJsonReport).toMatchObject({
      kind: 'agent_planner_custom_task_metadata_revert_audits',
      scope: 'planner',
      task: null,
      taskCount: 2,
      counts: {
        edits: 2,
        reverts: 1,
        staleConfirmed: 1,
      },
      filter: 'staleConfirmed',
      exportScope: 'all',
      auditCount: 1,
    });
    expect(routeState.staleRevertConfirmations).toEqual([
      {
        taskId: 'source_ui_e2e_1',
        historyEntryId: expect.stringContaining('history-title-'),
        reason: 'Confirmado por E2E: recuperar el titulo original validado.',
        confirmedByEmail: 'editor@example.com',
      },
    ]);
  }, 180_000);
});
