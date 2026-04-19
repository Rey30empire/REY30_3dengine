import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page, Route } from 'playwright';
import { chromium } from '../../scripts/playwright-runtime.mjs';
import {
  fulfillJson,
  startNextDevServer,
  type StartedServer,
} from './helpers/nextDevServer';

const AUTHED_ADMIN = {
  authenticated: true,
  accessMode: 'user_session',
  user: { id: 'runtime-admin-1', role: 'OWNER', email: 'runtime-admin@example.com' },
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

async function installRuntimeForensicsAdminRoutes(page: Page) {
  const state = {
    notificationUpserts: 0,
    notificationDryRuns: 0,
    notificationPrunes: 0,
    notificationCsvExports: 0,
    notificationJsonExports: 0,
    webhookSaves: 0,
    webhookTests: 0,
    webhookRetries: 0,
    webhookCsvExports: 0,
    webhookJsonExports: 0,
    webhookAuditCsvExports: 0,
    webhookAuditJsonExports: 0,
    webhookDryRuns: 0,
    webhookPrunes: 0,
    webhookPolicySaves: 0,
    webhookLastQuery: '',
    webhookAuditLastQuery: '',
    prometheusMissing: false,
    webhookPolicy: {
      maxDeliveries: 5,
      maxAgeDays: 14,
      source: 'defaults',
      updatedAt: null,
      updatedBy: null,
    } as Record<string, unknown>,
    webhookPruneAudit: [] as Array<Record<string, unknown>>,
    notifications: [] as Array<Record<string, unknown>>,
    webhookAllowlistBlocked: true,
    webhookDeliveries: [
      {
        id: 'delivery-backoff-1',
        event: 'runtime_forensics.slo_alert',
        source: 'slo',
        notificationId: 'runtime-forensics-slo:slo:runtime_forensics_p0_reappeared:error',
        alertId: 'slo:runtime_forensics_p0_reappeared:error',
        status: 'blocked',
        createdAt: '2026-04-18T02:00:00.000Z',
        updatedAt: '2026-04-18T02:00:00.000Z',
        lastAttemptAt: null,
        nextAttemptAt: null,
        deliveredAt: null,
        attemptCount: 0,
        responseStatus: null,
        error: 'host_not_allowlisted',
        targetHost: 'blocked.example.test',
      },
    ] as Array<Record<string, unknown>>,
  };

  const retentionPolicy = {
    maxNotifications: 5,
    maxAgeDays: 14,
    source: 'defaults',
  };

  await page.route('**/api/auth/session', (route) => fulfillJson(route, AUTHED_ADMIN));

  await page.route('**/api/telemetry', (route) =>
    fulfillJson(route, {
      ok: true,
      snapshot: {
        events: [
          {
            id: 'telemetry-p0-reappeared',
            kind: 'runtime_forensics_event',
            value: 1,
            at: '2026-04-16T00:00:00.000Z',
            tags: {
              action: 'p0_reappeared',
              p0ReappearedCount: 2,
              targets: 'scribs/movement.scrib.ts',
            },
          },
          {
            id: 'telemetry-prune',
            kind: 'runtime_forensics_event',
            value: 1,
            at: '2026-04-18T01:00:00.000Z',
            tags: {
              action: 'prune_execute',
            },
          },
        ],
        totals: {
          runtimeForensicsEvents: 2,
        },
      },
      slo: {
        alerts: [
          {
            id: 'slo:runtime_forensics_p0_reappeared:error',
            level: 'critical',
            indicator: 'runtime_forensics_p0_reappeared',
            message: 'SLO breached for runtime_forensics_p0_reappeared.',
            current: 2,
            objective: 0,
            at: '2026-04-18T02:00:00.000Z',
          },
        ],
      },
    })
  );

  await page.route('**/api/scripts/runtime/fault-ledger**', async (route: Route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;

    if (pathname.endsWith('/overview')) {
      await fulfillJson(route, {
        ok: true,
        generatedAt: '2026-04-18T02:30:00.000Z',
        webhook: {
          configured: true,
          url: 'https://hooks.example.test/rey30',
          signingEnabled: true,
        },
        totals: {
          sessions: 2,
          snapshots: 3,
          snapshotsWithP0: 2,
          activeNotifications: state.notifications.length,
          criticalNotifications: state.notifications.filter(
            (notification) => notification.level === 'critical'
          ).length,
          pruneAudits: 1,
          runtimeForensicsEvents: 2,
          webhookDeliveries: state.webhookDeliveries.length,
          webhookDeliveryFailures: state.webhookDeliveries.filter(
            (delivery) => delivery.status !== 'delivered'
          ).length,
          webhookDeliveryFailureRate: 0.5,
        },
        webhookSlo: {
          key: 'runtime_forensics_webhook_delivery_failure_rate',
          objective: 0.05,
          warning: 0.1,
          current: 0.5,
          unit: 'ratio',
          status: 'error',
          delivered: 1,
          failed: 1,
          total: 2,
          windowSize: state.webhookDeliveries.length,
        },
        prometheus: {
          endpoint: '/api/ops/metrics',
          metricName: 'rey30_runtime_forensics_webhook_delivery_failure_rate',
          scrapeStatus: state.prometheusMissing ? 'missing' : 'ok',
          missingSince: state.prometheusMissing ? '2026-04-18T02:28:00.000Z' : null,
          missingDurationMs: state.prometheusMissing ? 120_000 : 0,
          missingDurationSlo: {
            key: 'runtime_forensics_prometheus_scrape_missing_duration',
            objectiveMs: 0,
            warningMs: 60_000,
            currentMs: state.prometheusMissing ? 120_000 : 0,
            unit: 'ms',
            status: state.prometheusMissing ? 'error' : 'ok',
            missingSince: state.prometheusMissing ? '2026-04-18T02:28:00.000Z' : null,
          },
          emittedAt: '2026-04-18T02:30:00.000Z',
          lastScrapedAt: '2026-04-18T02:30:00.000Z',
          lastValue: state.prometheusMissing ? 0 : 0.5,
          sample: state.prometheusMissing
            ? ''
            : 'rey30_runtime_forensics_webhook_delivery_failure_rate 0.5',
          failed: 1,
          total: 2,
          windowSize: state.webhookDeliveries.length,
        },
        sessions: [
          {
            key: 'session-alpha',
            sessionId: 'session-alpha',
            instanceIds: ['runtime-alpha'],
            snapshotCount: 2,
            latestAt: '2026-04-18T02:00:00.000Z',
            latestPlayState: 'PLAYING',
            latestP0Count: 2,
            maxP0Count: 2,
            p0SnapshotCount: 1,
            totalItems: 4,
            latestSnapshotId: 'snapshot-alpha-new',
          },
          {
            key: 'session-beta',
            sessionId: 'session-beta',
            instanceIds: ['runtime-beta'],
            snapshotCount: 1,
            latestAt: '2026-04-17T23:00:00.000Z',
            latestPlayState: 'IDLE',
            latestP0Count: 0,
            maxP0Count: 1,
            p0SnapshotCount: 1,
            totalItems: 1,
            latestSnapshotId: 'snapshot-beta',
          },
        ],
        notifications: state.notifications,
        pruneAudits: [
          {
            id: 'audit-prune-1',
            auditId: 'audit-prune-1',
            createdAt: '2026-04-17T00:00:00.000Z',
            actorId: 'runtime-admin-1',
            reason: 'manual-prune',
            dryRun: false,
            deleted: 1,
            wouldDelete: 1,
            retained: 2,
            policy: { maxSnapshots: 2, maxAgeDays: 30 },
            candidates: [],
          },
        ],
        telemetryEvents: [
          {
            id: 'telemetry-p0-reappeared',
            kind: 'runtime_forensics_event',
            value: 1,
            at: '2026-04-16T00:00:00.000Z',
            tags: { action: 'p0_reappeared', p0ReappearedCount: 2 },
          },
        ],
      });
      return;
    }

    if (pathname.endsWith('/webhook/prune-audit')) {
      state.webhookAuditLastQuery = url.searchParams.toString();
      const body = JSON.stringify({
        ok: true,
        exportedAt: '2026-04-18T02:11:00.000Z',
        filters: {
          actor: url.searchParams.get('actor') || null,
          reason: url.searchParams.get('reason') || null,
          from: url.searchParams.get('from') || null,
          to: url.searchParams.get('to') || null,
        },
        auditCount: state.webhookPruneAudit.length,
        audits: state.webhookPruneAudit,
      });
      if (url.searchParams.get('format') === 'csv') {
        state.webhookAuditCsvExports += 1;
        await route.fulfill({
          status: 200,
          contentType: 'text/csv',
          body: 'id,reason\nwebhook-audit-1,manual-prune\n',
        });
        return;
      }
      if (url.searchParams.get('format') === 'json') {
        state.webhookAuditJsonExports += 1;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body,
        });
        return;
      }
      await fulfillJson(route, JSON.parse(body));
      return;
    }

    if (pathname.endsWith('/webhook')) {
      if (url.searchParams.get('audit') === 'prune') {
        state.webhookAuditLastQuery = url.searchParams.toString();
        const body = JSON.stringify({
          ok: true,
          exportedAt: '2026-04-18T02:11:00.000Z',
          filters: {
            actor: url.searchParams.get('actor') || null,
            reason: url.searchParams.get('reason') || null,
            from: url.searchParams.get('from') || null,
            to: url.searchParams.get('to') || null,
          },
          auditCount: state.webhookPruneAudit.length,
          audits: state.webhookPruneAudit,
        });
        if (url.searchParams.get('format') === 'csv') {
          state.webhookAuditCsvExports += 1;
          await route.fulfill({
            status: 200,
            contentType: 'text/csv',
            body: 'id,reason\nwebhook-audit-1,manual-prune\n',
          });
          return;
        }
        if (url.searchParams.get('format') === 'json') {
          state.webhookAuditJsonExports += 1;
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body,
          });
          return;
        }
        await fulfillJson(route, JSON.parse(body));
        return;
      }
      if (url.searchParams.get('format') === 'csv') {
        state.webhookCsvExports += 1;
        await route.fulfill({
          status: 200,
          contentType: 'text/csv',
          body: 'id,status\ndelivery-backoff-1,blocked\n',
        });
        return;
      }
      if (url.searchParams.get('format') === 'json') {
        state.webhookJsonExports += 1;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            exportedAt: '2026-04-18T02:10:00.000Z',
            retentionPolicy: state.webhookPolicy,
            pruneAudit: state.webhookPruneAudit,
            deliveries: state.webhookDeliveries,
          }),
        });
        return;
      }
      state.webhookLastQuery = url.searchParams.toString();
      const makeWebhook = () => ({
        configured: true,
        enabled: true,
        source: 'persisted_config',
        url: 'https://blocked.example.test/rey30?redacted',
        host: state.webhookAllowlistBlocked ? 'blocked.example.test' : 'hooks.example.test',
        signingEnabled: true,
        hasSecret: true,
        allowlistHosts: state.webhookAllowlistBlocked
          ? ['hooks.example.test']
          : ['hooks.example.test', 'blocked.example.test'],
        effectiveAllowlist: state.webhookAllowlistBlocked
          ? ['hooks.example.test']
          : ['hooks.example.test', 'blocked.example.test'],
        allowlistConfigured: true,
        allowlistBlocked: state.webhookAllowlistBlocked,
        blockedReason: state.webhookAllowlistBlocked ? 'host_not_allowlisted' : null,
        updatedAt: '2026-04-18T02:00:00.000Z',
        updatedBy: 'runtime-admin-1',
      });

      if (route.request().method() === 'POST') {
        const body = JSON.parse(route.request().postData() || '{}') as {
          action?: string;
          allowlistHosts?: string;
          id?: string;
          retentionPolicy?: { maxDeliveries?: number; maxAgeDays?: number };
        };
        if (body.action === 'update-config') {
          state.webhookSaves += 1;
          state.webhookAllowlistBlocked = !String(body.allowlistHosts || '').includes(
            'blocked.example.test'
          );
        }
        if (body.action === 'update-retention-policy') {
          state.webhookPolicySaves += 1;
          state.webhookPolicy = {
            maxDeliveries: Number(body.retentionPolicy?.maxDeliveries || 5),
            maxAgeDays: Number(body.retentionPolicy?.maxAgeDays || 14),
            source: 'admin',
            updatedAt: '2026-04-18T02:07:00.000Z',
            updatedBy: 'runtime-admin-1',
          };
        }
        if (body.action === 'test') {
          state.webhookTests += 1;
          state.webhookDeliveries = [
            {
              id: `delivery-test-${state.webhookTests}`,
              event: 'runtime_forensics.webhook_test',
              source: 'manual-test',
              notificationId: 'runtime-forensics-webhook-test',
              alertId: 'webhook-test',
              status: state.webhookAllowlistBlocked ? 'blocked' : 'delivered',
              createdAt: '2026-04-18T02:05:00.000Z',
              updatedAt: '2026-04-18T02:05:00.000Z',
              lastAttemptAt: '2026-04-18T02:05:00.000Z',
              nextAttemptAt: null,
              deliveredAt: state.webhookAllowlistBlocked ? null : '2026-04-18T02:05:00.000Z',
              attemptCount: state.webhookAllowlistBlocked ? 0 : 1,
              responseStatus: state.webhookAllowlistBlocked ? null : 202,
              error: state.webhookAllowlistBlocked ? 'host_not_allowlisted' : null,
              targetHost: state.webhookAllowlistBlocked ? 'blocked.example.test' : 'hooks.example.test',
            },
            ...state.webhookDeliveries,
          ];
        }
        if (body.action === 'retry' || body.action === 'retry-due') {
          state.webhookRetries += 1;
          state.webhookDeliveries = state.webhookDeliveries.map((delivery) => ({
            ...delivery,
            status: state.webhookAllowlistBlocked ? delivery.status : 'delivered',
            deliveredAt: state.webhookAllowlistBlocked
              ? delivery.deliveredAt
              : '2026-04-18T02:06:00.000Z',
            responseStatus: state.webhookAllowlistBlocked ? delivery.responseStatus : 202,
            error: state.webhookAllowlistBlocked ? delivery.error : null,
          }));
        }
        if (body.action === 'dry-run-prune' || body.action === 'prune') {
          if (body.action === 'dry-run-prune') state.webhookDryRuns += 1;
          else state.webhookPrunes += 1;
          state.webhookPruneAudit = [
            {
              id: `webhook-audit-${state.webhookDryRuns + state.webhookPrunes}`,
              auditId: `webhook-audit-${state.webhookDryRuns + state.webhookPrunes}`,
              createdAt: '2026-04-18T02:08:00.000Z',
              actorId: 'runtime-admin-1',
              reason: body.action === 'dry-run-prune' ? 'manual-dry-run' : 'manual-prune',
              dryRun: body.action === 'dry-run-prune',
              deleted: body.action === 'dry-run-prune' ? 0 : 1,
              wouldDelete: 1,
              retained: state.webhookDeliveries.length,
              policy: state.webhookPolicy,
              candidates: [],
            },
            ...state.webhookPruneAudit,
          ];
        }
      }

      const webhookPrune =
        route.request().method() === 'POST' &&
        ['dry-run-prune', 'prune'].includes(
          (JSON.parse(route.request().postData() || '{}') as { action?: string }).action || ''
        )
          ? {
              dryRun:
                (JSON.parse(route.request().postData() || '{}') as { action?: string }).action ===
                'dry-run-prune',
              deleted:
                (JSON.parse(route.request().postData() || '{}') as { action?: string }).action ===
                'dry-run-prune'
                  ? 0
                  : 1,
              wouldDelete: 1,
              retained: state.webhookDeliveries.length,
              policy: state.webhookPolicy,
              candidates: [
                {
                  id: 'delivery-old',
                  createdAt: '2026-03-01T00:00:00.000Z',
                  status: 'blocked',
                  event: 'runtime_forensics.slo_alert',
                  reason: 'age',
                },
              ],
            }
          : null;

      await fulfillJson(route, {
        ok: true,
        webhook: makeWebhook(),
        retentionPolicy: state.webhookPolicy,
        pruneAudit: state.webhookPruneAudit,
        ...(webhookPrune ? { prune: webhookPrune } : {}),
        deliveries: state.webhookDeliveries,
      });
      return;
    }

    if (pathname.endsWith('/notifications')) {
      if (url.searchParams.get('format') === 'csv') {
        state.notificationCsvExports += 1;
        await route.fulfill({
          status: 200,
          contentType: 'text/csv',
          body: 'id,title\nruntime-forensics-slo:slo:runtime_forensics_p0_reappeared:error,SLO P0 reaparecido\n',
        });
        return;
      }
      if (url.searchParams.get('format') === 'json') {
        state.notificationJsonExports += 1;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            exportedAt: '2026-04-18T02:00:00.000Z',
            retentionPolicy,
            notificationCount: state.notifications.length,
            notifications: state.notifications,
          }),
        });
        return;
      }

      if (route.request().method() === 'POST') {
        const body = JSON.parse(route.request().postData() || '{}') as {
          action?: string;
          id?: string;
          ids?: string[];
          notification?: Record<string, unknown>;
          retentionPolicy?: { maxNotifications?: number; maxAgeDays?: number };
        };

        if (body.action === 'upsert') {
          state.notificationUpserts += 1;
          const notification = {
            id: body.notification?.id || `notification-${state.notificationUpserts}`,
            alertId: body.notification?.alertId || 'alert-1',
            createdAt: body.notification?.createdAt || '2026-04-18T02:00:00.000Z',
            acknowledgedAt: null,
            level: body.notification?.level || 'critical',
            indicator: body.notification?.indicator || 'runtime_forensics_p0_reappeared',
            title: body.notification?.title || 'SLO P0 reaparecido',
            message: body.notification?.message || 'P0 reaparecido',
            current: body.notification?.current || 2,
            objective: body.notification?.objective || 0,
            createdBy: 'runtime-admin-1',
            acknowledgedBy: null,
            source: 'slo',
          };
          state.notifications = [
            notification,
            ...state.notifications.filter((item) => item.id !== notification.id),
          ];
          await fulfillJson(route, {
            ok: true,
            notification,
            retentionPolicy,
            notifications: state.notifications,
          });
          return;
        }

        if (body.action === 'acknowledge-all') {
          state.notifications = state.notifications.map((notification) => ({
            ...notification,
            acknowledgedAt: '2026-04-18T02:01:00.000Z',
            acknowledgedBy: 'runtime-admin-1',
          }));
          await fulfillJson(route, {
            ok: true,
            acknowledgedCount: state.notifications.length,
            retentionPolicy,
            notifications: state.notifications,
          });
          return;
        }

        if (body.action === 'dry-run-prune' || body.action === 'prune') {
          if (body.action === 'dry-run-prune') state.notificationDryRuns += 1;
          else state.notificationPrunes += 1;
          const candidates = [
            {
              id: 'runtime-forensics-slo:old',
              createdAt: '2026-03-01T00:00:00.000Z',
              level: 'critical',
              indicator: 'runtime_forensics_p0_reappeared',
              reason: 'age',
            },
          ];
          const policy = {
            maxNotifications: Number(body.retentionPolicy?.maxNotifications || 5),
            maxAgeDays: Number(body.retentionPolicy?.maxAgeDays || 14),
            source: 'request',
          };
          await fulfillJson(route, {
            ok: true,
            retentionPolicy: policy,
            prune: {
              dryRun: body.action === 'dry-run-prune',
              deleted: body.action === 'dry-run-prune' ? 0 : candidates.length,
              wouldDelete: candidates.length,
              retained: state.notifications.length,
              policy,
              candidates,
            },
            notifications: state.notifications,
          });
          return;
        }
      }

      await fulfillJson(route, {
        ok: true,
        retentionPolicy,
        notificationCount: state.notifications.length,
        notifications: state.notifications,
      });
      return;
    }

    if (pathname.endsWith('/audit')) {
      await fulfillJson(route, {
        ok: true,
        auditCount: 1,
        audits: [
          {
            id: 'audit-prune-1',
            auditId: 'audit-prune-1',
            createdAt: '2026-04-17T00:00:00.000Z',
            actorId: 'runtime-admin-1',
            reason: 'manual-prune',
            dryRun: false,
            deleted: 1,
            wouldDelete: 1,
            retained: 2,
            policy: { maxSnapshots: 2, maxAgeDays: 30 },
            candidates: [],
          },
        ],
      });
      return;
    }

    await fulfillJson(route, {
      ok: true,
      retentionPolicy: {
        maxSnapshots: 500,
        maxAgeDays: 30,
        source: 'defaults',
      },
      pruneAudit: [],
      snapshots: [
        {
          id: 'snapshot-p0',
          generatedAt: '2026-04-18T00:00:00.000Z',
          itemCount: 1,
          p0Count: 1,
          p1Count: 0,
          p2Count: 0,
          playState: 'PLAYING',
        },
        {
          id: 'snapshot-ok',
          generatedAt: '2026-04-15T00:00:00.000Z',
          itemCount: 0,
          p0Count: 0,
          p1Count: 0,
          p2Count: 0,
          playState: 'IDLE',
        },
      ],
    });
  });

  return state;
}

describe('Admin Runtime Forensics UI', () => {
  let server: StartedServer | null = null;
  let browser: Browser | null = null;

  beforeAll(async () => {
    server = await startNextDevServer(process.cwd());
    browser = await chromium.launch({ headless: true });
  }, 240_000);

  afterAll(async () => {
    await browser?.close();
    await server?.stop();
  });

  it('persists admin notifications and filters the unified timeline', async () => {
    if (!server || !browser) {
      throw new Error('Browser e2e server did not start.');
    }

    const page = await browser.newPage();
    const state = await installRuntimeForensicsAdminRoutes(page);

    await page.goto(`${server.baseUrl}/admin/runtime-forensics`, { waitUntil: 'domcontentloaded' });

    await expect
      .poll(() => page.getByTestId('admin-runtime-forensics-notifications').textContent(), {
        timeout: 60_000,
      })
      .toContain('Admin notifications');
    await expect.poll(() => state.notificationUpserts, { timeout: 30_000 }).toBeGreaterThan(0);

    await page.getByTestId('admin-runtime-forensics-notifications-export-csv').click();
    await expect.poll(() => state.notificationCsvExports, { timeout: 30_000 }).toBe(1);
    await page.getByTestId('admin-runtime-forensics-notifications-export-json').click();
    await expect.poll(() => state.notificationJsonExports, { timeout: 30_000 }).toBe(1);

    await page.getByTestId('admin-runtime-forensics-notifications-retention-max').fill('2');
    await page.getByTestId('admin-runtime-forensics-notifications-retention-days').fill('14');
    await page.getByTestId('admin-runtime-forensics-notifications-dry-run').click();
    await expect.poll(() => state.notificationDryRuns, { timeout: 30_000 }).toBe(1);
    await expect
      .poll(
        () => page.getByTestId('admin-runtime-forensics-notifications-retention').textContent(),
        { timeout: 30_000 }
      )
      .toContain('dry run: 1 candidatos');
    await page.getByTestId('admin-runtime-forensics-notifications-prune').click();
    await expect.poll(() => state.notificationPrunes, { timeout: 30_000 }).toBe(1);
    await expect
      .poll(
        () => page.getByTestId('admin-runtime-forensics-notifications-retention').textContent(),
        { timeout: 30_000 }
      )
      .toContain('último prune: 1 borradas');

    await expect
      .poll(() => page.getByTestId('admin-runtime-forensics-webhook-allowlist-alert').textContent(), {
        timeout: 30_000,
      })
      .toContain('bloqueado por allowlist');
    await page
      .getByTestId('admin-runtime-forensics-webhook-allowlist')
      .fill('hooks.example.test, blocked.example.test');
    await page.getByTestId('admin-runtime-forensics-webhook-save').click();
    await expect.poll(() => state.webhookSaves, { timeout: 30_000 }).toBe(1);
    await expect
      .poll(() => page.getByTestId('admin-runtime-forensics-webhook-status').textContent(), {
        timeout: 30_000,
      })
      .toContain('configurado');
    await page.getByTestId('admin-runtime-forensics-webhook-test').click();
    await expect.poll(() => state.webhookTests, { timeout: 30_000 }).toBe(1);
    await expect
      .poll(() => page.getByTestId('admin-runtime-forensics-webhook-history').textContent(), {
        timeout: 30_000,
      })
      .toContain('delivered');
    await page.getByTestId('admin-runtime-forensics-webhook-filter-status').selectOption('delivered');
    await page
      .getByTestId('admin-runtime-forensics-webhook-filter-event')
      .fill('webhook_test');
    await page.getByTestId('admin-runtime-forensics-webhook-filter-from').fill('2026-04-18');
    await page.getByTestId('admin-runtime-forensics-webhook-filter-apply').click();
    await expect
      .poll(() => state.webhookLastQuery, { timeout: 30_000 })
      .toContain('status=delivered');
    await page.getByTestId('admin-runtime-forensics-webhook-retention-max').fill('1');
    await page.getByTestId('admin-runtime-forensics-webhook-retention-days').fill('14');
    await page.getByTestId('admin-runtime-forensics-webhook-retention-save').click();
    await expect.poll(() => state.webhookPolicySaves, { timeout: 30_000 }).toBe(1);
    await expect
      .poll(() => page.getByTestId('admin-runtime-forensics-webhook-retention').textContent(), {
        timeout: 30_000,
      })
      .toContain('fuente: admin');
    await page.getByTestId('admin-runtime-forensics-webhook-dry-run').click();
    await expect.poll(() => state.webhookDryRuns, { timeout: 30_000 }).toBe(1);
    await expect
      .poll(() => page.getByTestId('admin-runtime-forensics-webhook-retention').textContent(), {
        timeout: 30_000,
      })
      .toContain('dry run: 1 candidatos');
    await page.getByTestId('admin-runtime-forensics-webhook-prune').click();
    await expect.poll(() => state.webhookPrunes, { timeout: 30_000 }).toBe(1);
    await expect
      .poll(() => page.getByTestId('admin-runtime-forensics-webhook-retention').textContent(), {
        timeout: 30_000,
      })
      .toContain('último prune: 1 borradas');
    await expect
      .poll(() => page.getByTestId('admin-runtime-forensics-webhook-prune-audit').textContent(), {
        timeout: 30_000,
      })
      .toContain('manual-prune');
    await page
      .getByTestId('admin-runtime-forensics-webhook-audit-actor')
      .fill('runtime-admin-1');
    await page
      .getByTestId('admin-runtime-forensics-webhook-audit-reason')
      .fill('manual-prune');
    await page.getByTestId('admin-runtime-forensics-webhook-audit-from').fill('2026-04-18');
    await page.getByTestId('admin-runtime-forensics-webhook-audit-filter-apply').click();
    await expect
      .poll(() => state.webhookLastQuery, { timeout: 30_000 })
      .toContain('auditActor=runtime-admin-1');
    await page.getByTestId('admin-runtime-forensics-webhook-audit-export-csv').click();
    await expect.poll(() => state.webhookAuditCsvExports, { timeout: 30_000 }).toBe(1);
    await expect
      .poll(() => state.webhookAuditLastQuery, { timeout: 30_000 })
      .toContain('reason=manual-prune');
    await page.getByTestId('admin-runtime-forensics-webhook-audit-export-json').click();
    await expect.poll(() => state.webhookAuditJsonExports, { timeout: 30_000 }).toBe(1);
    await page.getByTestId('admin-runtime-forensics-webhook-export-csv').click();
    await expect.poll(() => state.webhookCsvExports, { timeout: 30_000 }).toBe(1);
    await page.getByTestId('admin-runtime-forensics-webhook-export-json').click();
    await expect.poll(() => state.webhookJsonExports, { timeout: 30_000 }).toBe(1);
    await page.getByTestId('admin-runtime-forensics-webhook-retry-due').click();
    await expect.poll(() => state.webhookRetries, { timeout: 30_000 }).toBe(1);

    const timeline = page.getByTestId('admin-runtime-forensics-timeline');
    await expect.poll(() => timeline.textContent(), { timeout: 30_000 }).toContain('Snapshot ledger');
    await expect.poll(() => timeline.textContent(), { timeout: 30_000 }).toContain('Prune');
    await expect.poll(() => timeline.textContent(), { timeout: 30_000 }).toContain('Telemetry');

    await page.getByTestId('admin-runtime-forensics-timeline-filter-telemetry').click();
    await expect.poll(() => timeline.textContent(), { timeout: 30_000 }).toContain('Telemetry');
    await expect.poll(() => timeline.textContent(), { timeout: 30_000 }).not.toContain('Snapshot ledger');

    await page.getByTestId('admin-runtime-forensics-timeline-filter-all').click();
    await page.getByTestId('admin-runtime-forensics-timeline-severity-warn').click();
    await expect.poll(() => timeline.textContent(), { timeout: 30_000 }).toContain('Prune');
    await expect.poll(() => timeline.textContent(), { timeout: 30_000 }).not.toContain('Telemetry');

    await page.getByTestId('admin-runtime-forensics-timeline-severity-all').click();
    await page.getByTestId('admin-runtime-forensics-timeline-from').fill('2026-04-18');
    await expect.poll(() => timeline.textContent(), { timeout: 30_000 }).toContain('Snapshot ledger');
    await expect.poll(() => timeline.textContent(), { timeout: 30_000 }).not.toContain('Prune | would');

    await page.close();
  }, 180_000);

  it('shows the multi-session forensics overview', async () => {
    if (!server || !browser) {
      throw new Error('Browser e2e server did not start.');
    }

    const page = await browser.newPage();
    const state = await installRuntimeForensicsAdminRoutes(page);

    await page.goto(`${server.baseUrl}/admin/runtime-forensics/overview`, {
      waitUntil: 'domcontentloaded',
    });

    const body = page.locator('body');
    const sessions = page.getByTestId('runtime-forensics-overview-sessions');
    await expect.poll(() => sessions.textContent(), { timeout: 60_000 }).toContain('session-alpha');
    await expect.poll(() => sessions.textContent(), { timeout: 30_000 }).toContain('session-beta');
    await expect.poll(() => sessions.textContent(), { timeout: 30_000 }).toContain('latest P0 2');
    await expect.poll(() => body.textContent(), { timeout: 30_000 }).toContain('webhook: configurado');
    await expect.poll(() => body.textContent(), { timeout: 30_000 }).toContain('snapshots con P0');
    await expect
      .poll(() => page.getByTestId('runtime-forensics-overview-webhook-slo').textContent(), {
        timeout: 30_000,
      })
      .toContain('50%');
    await expect
      .poll(() => page.getByTestId('runtime-forensics-overview-prometheus-health').textContent(), {
        timeout: 30_000,
      })
      .toContain('rey30_runtime_forensics_webhook_delivery_failure_rate');
    state.prometheusMissing = true;
    await page.getByRole('button', { name: /Refrescar/ }).click();
    await expect
      .poll(() => page.getByTestId('runtime-forensics-overview-prometheus-alert').textContent(), {
        timeout: 30_000,
      })
      .toContain('missing');
    await expect
      .poll(() => page.getByTestId('runtime-forensics-overview-prometheus-health').textContent(), {
        timeout: 30_000,
      })
      .toContain('missing: 2m 0s');
    await expect.poll(() => state.notificationUpserts, { timeout: 30_000 }).toBeGreaterThan(0);
    await expect
      .poll(() => String(state.notifications[0]?.indicator || ''), { timeout: 30_000 })
      .toBe('runtime_forensics_prometheus_scrape_missing_duration');

    await page.close();
  }, 180_000);
});
