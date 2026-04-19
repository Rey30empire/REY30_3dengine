import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page, Route } from 'playwright';
import { chromium } from '../../scripts/playwright-runtime.mjs';
import {
  fulfillJson,
  startNextDevServer,
  type StartedServer,
} from './helpers/nextDevServer';

const AUTHED_EDITOR = {
  authenticated: true,
  accessMode: 'user_session',
  user: { id: 'scrib-editor-1', role: 'OWNER', email: 'scrib@example.com' },
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

function makeScriptEntry(relativePath: string, content: string) {
  const name = relativePath.split('/').pop() || relativePath;
  return {
    name,
    relativePath,
    size: content.length,
    modifiedAt: '2026-04-18T00:00:00.000Z',
    content,
  };
}

function runtimeCompiledCode(scriptPath: string) {
  return `
"use strict";
exports.default = function(entity, config, ctx) {
  if (ctx.scribType === "collider") {
    ctx.setComponent("Collider", { type: "box", isTrigger: false, center: { x: 0, y: 0, z: 0 }, size: { x: 1, y: 1, z: 1 } }, true);
  }
  if (ctx.scribType === "movement") {
    ctx.setComponent("PlayerController", { speed: config.speed || 5, walkSpeed: config.speed || 5, runSpeed: (config.speed || 5) * 1.6, jumpForce: config.jump || 7 }, true);
  }
  if (ctx.scribType === "cameraFollow") {
    ctx.setComponent("Camera", { fov: 60, near: 0.1, far: 1000, orthographic: false, clearColor: { r: 0, g: 0, b: 0, a: 1 }, isMain: true }, true);
  }
  if (ctx.config && ctx.config.debug) {
    console.log("${scriptPath}");
  }
};
`;
}

async function installScribStudioRoutes(
  page: Page,
  options?: { runtimeFailures?: Set<string> }
) {
  const scripts = new Map<string, string>();
  const createdPaths: string[] = [];
  const compiledPaths: string[] = [];
  const runtimePaths: string[] = [];
  const ledgerSnapshots: unknown[] = [];
  const ledgerCsvUrls: string[] = [];
  const ledgerJsonUrls: string[] = [];
  let ledgerPolicy = { maxSnapshots: 500, maxAgeDays: 30, source: 'defaults' };
  let ledgerDryRunRequests = 0;
  let ledgerPruneRequests = 0;
  let ledgerPolicyUpdates = 0;

  await page.route('**/api/auth/session', (route) => fulfillJson(route, AUTHED_EDITOR));
  await page.route('**/api/editor-session**', (route) =>
    fulfillJson(route, { success: true, active: false, session: null })
  );
  await page.route('**/api/editor-project**', (route) =>
    fulfillJson(route, {
      success: true,
      projectKey: 'scrib_ui_project',
      slot: 'editor_project_current',
      summary: {
        slot: 'editor_project_current',
        timestamp: Date.now(),
        projectName: 'Scrib UI Project',
        sceneCount: 1,
        entityCount: 1,
        assetCount: 0,
        scribProfileCount: 0,
        scribInstanceCount: 0,
      },
    })
  );
  await page.route('**/api/scripts/runtime/session', (route) =>
    fulfillJson(route, {
      ok: true,
      heartbeatAt: '2026-04-18T00:00:00.000Z',
      lease: {
        status: 'owned',
        ownerInstanceId: 'browser-scrib-ui',
        ownerPlayState: 'PLAYING',
        ownerHeartbeatAt: '2026-04-18T00:00:00.000Z',
        leaseExpiresAt: '2026-04-18T00:00:30.000Z',
        stale: false,
      },
      live: {
        coordinationMode: 'heartbeat-sessions',
        ownershipMode: 'session-lease',
        heartbeatTtlMs: 30000,
        storageMode: 'local',
        activeSessions: 1,
        playingSessions: 1,
        staleSessions: 0,
        currentSessionPresent: true,
        currentSessionOwnsLease: true,
        currentInstanceOwnsLease: true,
        lease: {
          status: 'owned',
          ownerInstanceId: 'browser-scrib-ui',
          ownerPlayState: 'PLAYING',
          ownerHeartbeatAt: '2026-04-18T00:00:00.000Z',
          leaseExpiresAt: '2026-04-18T00:00:30.000Z',
          stale: false,
        },
        sessions: [],
      },
    })
  );
  await page.route('**/api/scripts/runtime/verifications**', (route) =>
    fulfillJson(route, {
      ok: true,
      verifications: [],
    })
  );
  await page.route('**/api/scripts/runtime/fault-ledger**', async (route) => {
    const url = new URL(route.request().url());
    const buildHistory = () => {
      const snapshots = ledgerSnapshots.map((item, index) => {
          const payload = item as {
            instanceId?: string;
            playState?: string;
            generatedAt?: string;
            items?: Array<{
              severity?: 'P0' | 'P1' | 'P2';
              source?: 'legacy' | 'scrib' | 'node';
              target?: string;
              state?: string;
              action?: string;
              detail?: string;
              verificationStatus?: 'ok' | 'failed' | null;
              verificationOkCount?: number;
              verificationFailedCount?: number;
            }>;
          };
          const items = Array.isArray(payload.items) ? payload.items : [];
          return {
            id: `snapshot-${index + 1}`,
            instanceId: payload.instanceId || 'browser-scrib-ui',
            sessionId: 'session-1',
            playState: payload.playState || 'PLAYING',
            generatedAt: payload.generatedAt || `2026-04-18T00:00:0${index}.000Z`,
            itemCount: items.length,
            p0Count: items.filter((entry) => entry.severity === 'P0').length,
            p1Count: items.filter((entry) => entry.severity === 'P1').length,
            p2Count: items.filter((entry) => entry.severity === 'P2').length,
            items,
          };
        }).reverse();
      const latestP0 = snapshots[0]?.items?.find((entry) => entry.severity === 'P0');
      return latestP0
        ? [
            ...snapshots,
            {
              id: 'snapshot-resolved-between',
              instanceId: snapshots[0].instanceId,
              sessionId: 'session-1',
              playState: 'PLAYING',
              generatedAt: '2026-04-17T23:59:00.000Z',
              itemCount: 0,
              p0Count: 0,
              p1Count: 0,
              p2Count: 0,
              items: [],
            },
            {
              id: 'snapshot-older-p0',
              instanceId: snapshots[0].instanceId,
              sessionId: 'session-1',
              playState: 'PLAYING',
              generatedAt: '2026-04-17T23:58:00.000Z',
              itemCount: 1,
              p0Count: 1,
              p1Count: 0,
              p2Count: 0,
              items: [latestP0],
            },
          ]
        : snapshots;
    };
    if (url.searchParams.get('format') === 'csv') {
      ledgerCsvUrls.push(url.toString());
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/csv; charset=utf-8' },
        body: 'snapshotId,generatedAt,itemCount\n',
      });
      return;
    }
    if (url.searchParams.get('format') === 'json') {
      ledgerJsonUrls.push(url.toString());
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          ok: true,
          exportedAt: '2026-04-18T00:00:00.000Z',
          retentionPolicy: ledgerPolicy,
          pruneAudit: [],
          snapshots: buildHistory(),
        }),
      });
      return;
    }
    if (route.request().method() === 'POST') {
      const payload = JSON.parse(route.request().postData() || '{}') as Record<string, unknown>;
      if (payload.action === 'update-retention-policy') {
        ledgerPolicyUpdates += 1;
        const retentionPolicy = payload.retentionPolicy as
          | { maxSnapshots?: number; maxAgeDays?: number }
          | undefined;
        ledgerPolicy = {
          maxSnapshots: Number(retentionPolicy?.maxSnapshots || ledgerPolicy.maxSnapshots),
          maxAgeDays: Number(retentionPolicy?.maxAgeDays || ledgerPolicy.maxAgeDays),
          source: 'admin',
        };
        await fulfillJson(route, {
          ok: true,
          retentionPolicy: ledgerPolicy,
          pruneAudit: [],
        });
        return;
      }
      if (payload.action === 'dry-run-prune') {
        ledgerDryRunRequests += 1;
        const candidates = buildHistory().slice(1, 3).map((snapshot) => ({
          id: snapshot.id,
          generatedAt: snapshot.generatedAt,
          itemCount: snapshot.itemCount,
          p0Count: snapshot.p0Count,
          reason: 'count',
        }));
        await fulfillJson(route, {
          ok: true,
          prune: {
            dryRun: true,
            deleted: 0,
            wouldDelete: candidates.length,
            retained: buildHistory().length,
            policy: ledgerPolicy,
            candidates,
            auditId: 'dry-run-1',
          },
          retentionPolicy: ledgerPolicy,
          pruneAudit: [
            {
              id: 'dry-run-1',
              auditId: 'dry-run-1',
              createdAt: '2026-04-18T00:00:00.000Z',
              actorId: 'scrib-editor-1',
              reason: 'manual-dry-run',
              dryRun: true,
              deleted: 0,
              wouldDelete: candidates.length,
              retained: buildHistory().length,
              policy: ledgerPolicy,
              candidates,
            },
          ],
          snapshots: buildHistory(),
        });
        return;
      }
      if (payload.action === 'prune') {
        ledgerPruneRequests += 1;
        await fulfillJson(route, {
          ok: true,
          prune: {
            dryRun: false,
            deleted: 0,
            wouldDelete: 0,
            retained: buildHistory().length,
            policy: ledgerPolicy,
            candidates: [],
            auditId: 'prune-1',
          },
          retentionPolicy: ledgerPolicy,
          pruneAudit: [
            {
              id: 'prune-1',
              auditId: 'prune-1',
              createdAt: '2026-04-18T00:01:00.000Z',
              actorId: 'scrib-editor-1',
              reason: 'manual-prune',
              dryRun: false,
              deleted: 0,
              wouldDelete: 0,
              retained: buildHistory().length,
              policy: ledgerPolicy,
              candidates: [],
            },
          ],
          snapshots: buildHistory(),
        });
        return;
      }
      ledgerSnapshots.push(payload);
      await fulfillJson(route, {
        ok: true,
        retentionPolicy: ledgerPolicy,
        snapshot: {
          id: `snapshot-${ledgerSnapshots.length}`,
          generatedAt: new Date().toISOString(),
          itemCount: Array.isArray(payload.items) ? payload.items.length : 0,
          p0Count: 0,
          p1Count: 0,
          p2Count: 0,
          items: Array.isArray(payload.items) ? payload.items : [],
        },
      });
      return;
    }
    await fulfillJson(route, {
      ok: true,
      retentionPolicy: ledgerPolicy,
      pruneAudit: [],
      snapshots: buildHistory(),
    });
  });
  await page.route('**/api/scripts/health**', (route) =>
    fulfillJson(route, {
      success: true,
      available: true,
      message: 'runtime ready',
      runtime: {
        enabled: true,
        reviewedArtifactsRequired: true,
        sourceStorageMode: 'local',
        artifactStorageMode: 'local',
        executionIsolation: 'worker-per-instance',
        consistencyModel: 'reviewed-artifact-read-through',
        multiInstanceMode: 'shared-storage-ready',
        sourceStorageAvailable: true,
        artifactStorageAvailable: true,
        restartReady: true,
      },
      live: null,
    })
  );
  await page.route('**/api/scripts/runtime?**', async (route) => {
    const url = new URL(route.request().url());
    const scriptPath = url.searchParams.get('path') || '';
    runtimePaths.push(scriptPath);
    if (options?.runtimeFailures?.has(scriptPath)) {
      await fulfillJson(
        route,
        {
          error: 'Debes revisar el script en Scrib Studio antes de ejecutarlo.',
          ready: false,
        },
        409
      );
      return;
    }
    await fulfillJson(route, {
      ok: true,
      ready: true,
      policy: {
        enabled: true,
        mode: 'isolated_worker',
        requiresReviewedArtifact: true,
      },
      runtime: {
        scriptId: scriptPath,
        sourceHash: `source-${scriptPath}`,
        compiledHash: `compiled-${scriptPath}`,
        generatedAt: '2026-04-18T00:00:00.000Z',
      },
      live: null,
      compiledCode: runtimeCompiledCode(scriptPath),
    });
  });
  await page.route('**/api/scripts/compile', async (route) => {
    const payload = JSON.parse(route.request().postData() || '{}') as { path?: string };
    if (payload.path) compiledPaths.push(payload.path);
    await fulfillJson(route, {
      ok: true,
      diagnostics: [],
      summary: 'El script está listo para usarse.',
      runtime: {
        policy: {
          enabled: true,
          mode: 'isolated_worker',
          requiresReviewedArtifact: true,
        },
        reviewedArtifact: true,
        sourceHash: `source-${payload.path || 'inline'}`,
        compiledHash: `compiled-${payload.path || 'inline'}`,
        generatedAt: '2026-04-18T00:00:00.000Z',
        persisted: Boolean(payload.path),
      },
    });
  });
  await page.route('**/api/scripts**', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();

    if (url.pathname !== '/api/scripts') {
      await route.fallback();
      return;
    }

    if (method === 'GET') {
      const path = url.searchParams.get('path');
      if (path) {
        const content = scripts.get(path);
        if (!content) {
          await fulfillJson(route, { error: 'missing' }, 404);
          return;
        }
        await fulfillJson(route, { script: makeScriptEntry(path, content) });
        return;
      }

      await fulfillJson(route, {
        scripts: Array.from(scripts.entries()).map(([relativePath, content]) =>
          makeScriptEntry(relativePath, content)
        ),
      });
      return;
    }

    if (method === 'POST') {
      const payload = JSON.parse(request.postData() || '{}') as {
        directory?: string;
        name?: string;
        content?: string;
      };
      const relativePath = [payload.directory, payload.name].filter(Boolean).join('/');
      const content = payload.content || `// ${relativePath}\nexport default function() {}\n`;
      if (!scripts.has(relativePath)) {
        scripts.set(relativePath, content);
        createdPaths.push(relativePath);
      }
      await fulfillJson(route, {
        created: true,
        script: makeScriptEntry(relativePath, scripts.get(relativePath) || content),
      });
      return;
    }

    await fulfillJson(route, { success: true });
  });

  return {
    createdPaths,
    compiledPaths,
    runtimePaths,
    ledgerSnapshots,
    ledgerCsvUrls,
    ledgerJsonUrls,
    get ledgerDryRunRequests() {
      return ledgerDryRunRequests;
    },
    get ledgerPruneRequests() {
      return ledgerPruneRequests;
    },
    get ledgerPolicyUpdates() {
      return ledgerPolicyUpdates;
    },
  };
}

describe.sequential('Scrib Studio runtime UI', () => {
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

  it('runs Baseline, assigns movement/collider/cameraFollow, and starts Render All', async () => {
    if (!server || !browser) {
      throw new Error('Browser e2e server did not start.');
    }

    const page = await browser.newPage();
    const routeState = await installScribStudioRoutes(page);

    await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('scene-add-cube').click({ timeout: 120_000 });
    await page.getByTestId('workspace-switcher-scripting').click();

    const studio = page.getByTestId('scrib-studio');
    await studio.waitFor({ state: 'visible', timeout: 120_000 });

    await expect
      .poll(() => page.getByTestId('scrib-baseline-action').isEnabled(), { timeout: 120_000 })
      .toBe(true);
    await page.getByTestId('scrib-baseline-action').click();
    await expect.poll(() => routeState.createdPaths, { timeout: 30_000 }).toEqual(
      expect.arrayContaining([
        'scribs/transform.scrib.ts',
        'scribs/movement.scrib.ts',
        'scribs/collider.scrib.ts',
        'scribs/cameraFollow.scrib.ts',
      ])
    );
    await expect.poll(() => routeState.compiledPaths, { timeout: 30_000 }).toEqual(
      expect.arrayContaining([
        'scribs/transform.scrib.ts',
        'scribs/movement.scrib.ts',
        'scribs/collider.scrib.ts',
        'scribs/cameraFollow.scrib.ts',
      ])
    );
    await expect
      .poll(() => studio.textContent(), { timeout: 30_000 })
      .toContain('Baseline revisado');

    await studio.getByRole('button', { name: 'Asignar' }).first().click();
    await studio.getByRole('button', { name: /CUBE Manual/i }).click({ timeout: 30_000 });

    for (const scribType of ['movement', 'collider', 'cameraFollow']) {
      await page.getByTestId('scrib-assign-type').selectOption(scribType);
      await page.getByTestId('scrib-assign-action').click();
      await expect
        .poll(() => studio.textContent(), { timeout: 30_000 })
        .toContain(`Asignación lista: ${scribType}`);
    }

    await page.getByTestId('scrib-render-all-action').click();
    await expect.poll(() => routeState.runtimePaths, { timeout: 30_000 }).toEqual(
      expect.arrayContaining([
        'scribs/transform.scrib.ts',
        'scribs/movement.scrib.ts',
        'scribs/collider.scrib.ts',
        'scribs/cameraFollow.scrib.ts',
      ])
    );
    await expect
      .poll(() => studio.textContent(), { timeout: 30_000 })
      .toContain('Render All:');
  }, 180_000);

  it('shows a visible runtime issue when a scrib artifact is stale', async () => {
    if (!server || !browser) {
      throw new Error('Browser e2e server did not start.');
    }

    const page = await browser.newPage();
    const routeState = await installScribStudioRoutes(page, {
      runtimeFailures: new Set(['scribs/movement.scrib.ts']),
    });

    await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('scene-add-cube').click({ timeout: 120_000 });
    await page.getByTestId('workspace-switcher-scripting').click();

    const studio = page.getByTestId('scrib-studio');
    await studio.waitFor({ state: 'visible', timeout: 120_000 });

    await studio.getByRole('button', { name: 'Asignar' }).first().click();
    await studio.getByRole('button', { name: /CUBE Manual/i }).click({ timeout: 30_000 });
    await page.getByTestId('scrib-assign-type').selectOption('movement');
    await page.getByTestId('scrib-assign-action').click();
    await expect
      .poll(() => studio.textContent(), { timeout: 30_000 })
      .toContain('Asignación lista: movement');

    await page.getByTestId('scrib-render-all-action').click();
    const issuePanel = page.getByTestId('scrib-runtime-issues');
    await issuePanel.waitFor({ state: 'visible', timeout: 30_000 });
    await expect
      .poll(() => issuePanel.textContent(), { timeout: 30_000 })
      .toContain('scribs/movement.scrib.ts');
    await expect
      .poll(() => issuePanel.textContent(), { timeout: 30_000 })
      .toMatch(/artifact sin revisar|runtime en backoff/);
    await expect
      .poll(() => issuePanel.textContent(), { timeout: 30_000 })
      .toContain('Scrib');
    const issueTextBeforeVerify = (await issuePanel.textContent()) || '';
    if (issueTextBeforeVerify.includes('scrib node bloqueado')) {
      await page.getByTestId('scrib-runtime-issue-retry-node').first().waitFor({ state: 'visible' });
    } else {
      expect(issueTextBeforeVerify).toMatch(/Verificar artifact|Reintentar runtime/);
    }

    const compileCountBeforeVerify = routeState.compiledPaths.length;
    await page.getByTestId('scrib-runtime-issue-verify').first().click();
    await expect
      .poll(() => routeState.compiledPaths.length, { timeout: 30_000 })
      .toBeGreaterThan(compileCountBeforeVerify);
    expect(routeState.compiledPaths).toContain('scribs/movement.scrib.ts');

    await studio.getByRole('button', { name: /^Consola$/ }).last().click();
    await expect
      .poll(() => studio.textContent(), { timeout: 30_000 })
      .toContain('Estado operativo del runtime');
    const ledger = page.getByTestId('runtime-fault-ledger');
    await expect
      .poll(async () => (await ledger.textContent()) || '', { timeout: 30_000 })
      .toContain('Runtime Fault Ledger');
    await page.getByTestId('runtime-fault-ledger-filter-P0').click();
    await page.getByTestId('runtime-fault-ledger-filter-all').click();
    await page.getByTestId('runtime-fault-ledger-export').waitFor({ state: 'visible' });
    await expect
      .poll(() => routeState.ledgerSnapshots.length, { timeout: 30_000 })
      .toBeGreaterThan(0);
    await page.getByTestId('runtime-fault-ledger-history-refresh').click();
    await page.getByTestId('runtime-fault-ledger-history-export').waitFor({ state: 'visible' });
    await expect
      .poll(async () => (await page.getByTestId('runtime-fault-ledger-retention').textContent()) || '', { timeout: 30_000 })
      .toContain('Retención forense');
    await page.getByTestId('runtime-fault-ledger-policy-max').fill('250');
    await page.getByTestId('runtime-fault-ledger-policy-days').fill('14');
    const policyUpdatesBefore = routeState.ledgerPolicyUpdates;
    await page.getByTestId('runtime-fault-ledger-policy-save').click();
    await expect
      .poll(() => routeState.ledgerPolicyUpdates, { timeout: 30_000 })
      .toBeGreaterThan(policyUpdatesBefore);
    await expect
      .poll(async () => (await page.getByTestId('runtime-fault-ledger-retention').textContent()) || '', { timeout: 30_000 })
      .toContain('fuente: admin');
    await page.getByTestId('runtime-fault-ledger-history-severity').selectOption('P0');
    await page.getByTestId('runtime-fault-ledger-history-target').fill('movement');
    await page.getByTestId('runtime-fault-ledger-history-export').click();
    await expect
      .poll(() => routeState.ledgerCsvUrls.length, { timeout: 30_000 })
      .toBeGreaterThan(0);
    const latestCsvUrl = routeState.ledgerCsvUrls[routeState.ledgerCsvUrls.length - 1];
    expect(latestCsvUrl).toContain('severity=P0');
    expect(latestCsvUrl).toContain('target=movement');
    await page.getByTestId('runtime-fault-ledger-history-export-json').click();
    await expect
      .poll(() => routeState.ledgerJsonUrls.length, { timeout: 30_000 })
      .toBeGreaterThan(0);
    const latestJsonUrl = routeState.ledgerJsonUrls[routeState.ledgerJsonUrls.length - 1];
    expect(latestJsonUrl).toContain('format=json');
    expect(latestJsonUrl).toContain('severity=P0');
    const dryRunCountBefore = routeState.ledgerDryRunRequests;
    await page.getByTestId('runtime-fault-ledger-dry-run').click();
    await expect
      .poll(() => routeState.ledgerDryRunRequests, { timeout: 30_000 })
      .toBeGreaterThan(dryRunCountBefore);
    await expect
      .poll(async () => (await page.getByTestId('runtime-fault-ledger-retention').textContent()) || '', { timeout: 30_000 })
      .toContain('dry run:');
    await expect
      .poll(async () => (await page.getByTestId('runtime-fault-ledger-prune-audit').textContent()) || '', { timeout: 30_000 })
      .toContain('dry run');
    const pruneCountBefore = routeState.ledgerPruneRequests;
    await page.getByTestId('runtime-fault-ledger-prune').click();
    await expect
      .poll(() => routeState.ledgerPruneRequests, { timeout: 30_000 })
      .toBeGreaterThan(pruneCountBefore);
    await expect
      .poll(async () => (await page.getByTestId('runtime-fault-ledger-retention').textContent()) || '', { timeout: 30_000 })
      .toContain('último prune');
    await expect
      .poll(async () => (await page.getByTestId('runtime-fault-ledger-history').textContent()) || '', { timeout: 30_000 })
      .toContain('Diff P0');
    await expect
      .poll(async () => (await page.getByTestId('runtime-fault-ledger-timeline').textContent()) || '', { timeout: 30_000 })
      .toContain('Timeline target');
    const historySelect = page.getByTestId('runtime-fault-ledger-history-select');
    const initialSnapshotId = await historySelect.inputValue();
    const secondHistoricalChip = page
      .getByTestId('runtime-fault-ledger-timeline-chip')
      .filter({ hasText: /^t-2:/ })
      .first();
    if ((await secondHistoricalChip.count()) > 0) {
      await secondHistoricalChip.click();
      await expect
        .poll(async () => historySelect.inputValue(), { timeout: 30_000 })
        .not.toBe(initialSnapshotId);
    }
    const hasP0Snapshot = routeState.ledgerSnapshots.some((entry) => {
      const items = (entry as { items?: Array<{ severity?: string }> }).items || [];
      return items.some((item) => item.severity === 'P0');
    });
    if (hasP0Snapshot) {
      await expect
        .poll(async () => (await ledger.textContent()) || '', { timeout: 30_000 })
        .toContain('P0 reaparecido');
    }
    await expect
      .poll(async () => (await page.getByTestId('scrib-runtime-scrib-statuses').textContent()) || '', { timeout: 30_000 })
      .toMatch(/scribs\/.+\.scrib\.ts|scrib_node_disabled|scrib_load_failed/);
    await expect
      .poll(async () => (await page.getByTestId('scrib-runtime-scrib-statuses').textContent()) || '', { timeout: 30_000 })
      .toMatch(/verify: OK|OK 1/);
    await expect
      .poll(async () => (await page.getByTestId('scrib-runtime-legacy-statuses').textContent()) || '', { timeout: 30_000 })
      .not.toContain('scribs/');
  }, 300_000);
});
