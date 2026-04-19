import { createHmac } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchRemoteTextMock = vi.fn();
const getRemoteProviderAllowlistForDiagnosticsMock = vi.fn(
  (_provider: string, additional: string[] = []) => ['hooks.example.test', ...additional]
);
const isRemoteProviderHostAllowlistedMock = vi.fn(
  ({ host }: { host: string }) => host === 'hooks.example.test'
);

vi.mock('@/lib/security/remote-fetch', () => ({
  fetchRemoteText: fetchRemoteTextMock,
  getRemoteProviderAllowlistForDiagnostics: getRemoteProviderAllowlistForDiagnosticsMock,
  isRemoteProviderHostAllowlisted: isRemoteProviderHostAllowlistedMock,
}));

describe('runtime forensics webhook', () => {
  const notification = {
    id: 'runtime-forensics-slo:slo-1',
    alertId: 'slo-1',
    createdAt: '2026-04-18T02:00:00.000Z',
    acknowledgedAt: null,
    level: 'critical',
    indicator: 'runtime_forensics_p0_reappeared',
    title: 'SLO P0 reaparecido',
    message: 'P0 reaparecido',
    current: 2,
    objective: 0,
    createdBy: 'editor-1',
    acknowledgedBy: null,
    source: 'slo',
  } as const;
  let tempRoot: string;
  let previousScriptRoot: string | undefined;

  beforeEach(async () => {
    previousScriptRoot = process.env.REY30_SCRIPT_ROOT;
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'rey30-webhook-test-'));
    process.env.REY30_SCRIPT_ROOT = tempRoot;
  });

  afterEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    if (previousScriptRoot === undefined) delete process.env.REY30_SCRIPT_ROOT;
    else process.env.REY30_SCRIPT_ROOT = previousScriptRoot;
    await rm(tempRoot, { recursive: true, force: true });
  });

  it('stays inert when the webhook URL is not configured', async () => {
    const { getRuntimeForensicsWebhookConfig, sendRuntimeForensicsWebhook } = await import(
      '@/lib/server/runtime-forensics-webhook'
    );

    const emptyEnv = {} as unknown as NodeJS.ProcessEnv;
    await expect(getRuntimeForensicsWebhookConfig(emptyEnv)).resolves.toMatchObject({
      configured: false,
      url: null,
      signingEnabled: false,
    });
    await expect(
      sendRuntimeForensicsWebhook({
        notification,
        env: emptyEnv,
      })
    ).resolves.toMatchObject({ configured: false, delivered: false, skipped: 'not-configured' });
    expect(fetchRemoteTextMock).not.toHaveBeenCalled();
  });

  it('posts signed SLO alert payloads through the remote fetch webhook provider', async () => {
    fetchRemoteTextMock.mockResolvedValue({
      response: new Response('accepted', { status: 202 }),
      text: 'accepted',
    });
    const { getRuntimeForensicsWebhookConfig, sendRuntimeForensicsWebhook } = await import(
      '@/lib/server/runtime-forensics-webhook'
    );
    const env = {
      REY30_RUNTIME_FORENSICS_WEBHOOK_URL: 'https://hooks.example.test/rey30?token=secret-token',
      REY30_RUNTIME_FORENSICS_WEBHOOK_SECRET: 'secret-1',
    } as unknown as NodeJS.ProcessEnv;

    await expect(getRuntimeForensicsWebhookConfig(env)).resolves.toMatchObject({
      configured: true,
      url: 'https://hooks.example.test/rey30?redacted',
      signingEnabled: true,
      allowlistBlocked: false,
    });
    await expect(
      sendRuntimeForensicsWebhook({
        notification,
        env,
      })
    ).resolves.toMatchObject({
      configured: true,
      delivered: true,
      status: 202,
    });

    expect(fetchRemoteTextMock).toHaveBeenCalledOnce();
    const request = fetchRemoteTextMock.mock.calls[0][0];
    const body = String(request.init.body);
    expect(JSON.parse(body)).toMatchObject({
      event: 'runtime_forensics.slo_alert',
      notification,
    });
    expect(request).toMatchObject({
      provider: 'webhook',
      url: 'https://hooks.example.test/rey30?token=secret-token',
      additionalAllowlist: [],
      init: {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'rey30-runtime-forensics/1.0',
        },
      },
      timeoutMs: 10_000,
      maxBytes: 64 * 1024,
    });
    expect(request.init.headers['x-rey30-signature']).toBe(
      `sha256=${createHmac('sha256', 'secret-1').update(body).digest('hex')}`
    );
  });

  it('records allowlist-blocked delivery history without calling the network', async () => {
    getRemoteProviderAllowlistForDiagnosticsMock.mockReturnValueOnce(['hooks.example.test']);
    isRemoteProviderHostAllowlistedMock.mockReturnValueOnce(false);
    const { listRuntimeForensicsWebhookDeliveries, runtimeForensicsWebhookDeliveriesToCsv, sendRuntimeForensicsWebhook } = await import(
      '@/lib/server/runtime-forensics-webhook'
    );

    const result = await sendRuntimeForensicsWebhook({
      notification,
      env: {
        REY30_RUNTIME_FORENSICS_WEBHOOK_URL: 'https://blocked.example.test/rey30',
      } as unknown as NodeJS.ProcessEnv,
    });

    expect(result).toMatchObject({
      configured: true,
      delivered: false,
      skipped: 'blocked',
      allowlistBlocked: true,
    });
    expect(result.delivery).toMatchObject({
      status: 'blocked',
      targetHost: 'blocked.example.test',
      attemptCount: 0,
    });
    expect(fetchRemoteTextMock).not.toHaveBeenCalled();
  });

  it('persists retry backoff and suppresses duplicate delivery attempts until due', async () => {
    fetchRemoteTextMock.mockResolvedValue({
      response: new Response('busy', { status: 503 }),
      text: 'busy',
    });
    const {
      listRuntimeForensicsWebhookDeliveries,
      runtimeForensicsWebhookDeliveriesToCsv,
      sendRuntimeForensicsWebhook,
    } = await import('@/lib/server/runtime-forensics-webhook');
    const env = {
      REY30_RUNTIME_FORENSICS_WEBHOOK_URL: 'https://hooks.example.test/rey30',
      REY30_RUNTIME_FORENSICS_WEBHOOK_RETRY_BASE_MS: '60000',
    } as unknown as NodeJS.ProcessEnv;

    const first = await sendRuntimeForensicsWebhook({ notification, env });
    const second = await sendRuntimeForensicsWebhook({ notification, env });

    expect(first).toMatchObject({
      delivered: false,
      status: 503,
    });
    expect(first.delivery).toMatchObject({
      status: 'backoff',
      attemptCount: 1,
    });
    expect(second).toMatchObject({
      delivered: false,
      skipped: 'backoff',
      backoffUntil: first.backoffUntil,
    });
    const deliveries = await listRuntimeForensicsWebhookDeliveries(10);
    expect(deliveries).toHaveLength(1);
    expect(runtimeForensicsWebhookDeliveriesToCsv(deliveries)).toContain(
      'runtime-forensics-slo:slo-1'
    );
    expect(fetchRemoteTextMock).toHaveBeenCalledOnce();
  });

  it('dry-runs and prunes persisted webhook delivery history by retention policy', async () => {
    fetchRemoteTextMock.mockResolvedValue({
      response: new Response('accepted', { status: 202 }),
      text: 'accepted',
    });
    const {
      getConfiguredRuntimeForensicsWebhookDeliveryRetentionPolicy,
      listRuntimeForensicsWebhookDeliveries,
      listRuntimeForensicsWebhookDeliveryPruneAudits,
      pruneRuntimeForensicsWebhookDeliveries,
      putRuntimeForensicsWebhookDeliveryRetentionPolicy,
      sendRuntimeForensicsWebhook,
    } = await import('@/lib/server/runtime-forensics-webhook');
    const env = {
      REY30_RUNTIME_FORENSICS_WEBHOOK_URL: 'https://hooks.example.test/rey30',
    } as unknown as NodeJS.ProcessEnv;

    await sendRuntimeForensicsWebhook({
      notification,
      env,
      event: 'runtime_forensics.webhook_test_a',
      source: 'manual-test',
      force: true,
    });
    await sendRuntimeForensicsWebhook({
      notification,
      env,
      event: 'runtime_forensics.webhook_test_b',
      source: 'manual-test',
      force: true,
    });

    expect(await listRuntimeForensicsWebhookDeliveries(10)).toHaveLength(2);
    await expect(
      putRuntimeForensicsWebhookDeliveryRetentionPolicy({
        maxDeliveries: 1,
        maxAgeDays: 30,
        updatedBy: 'owner-1',
      })
    ).resolves.toMatchObject({
      maxDeliveries: 1,
      maxAgeDays: 30,
      source: 'admin',
      updatedBy: 'owner-1',
    });
    await expect(getConfiguredRuntimeForensicsWebhookDeliveryRetentionPolicy()).resolves.toMatchObject({
      maxDeliveries: 1,
      source: 'admin',
    });
    const dryRun = await pruneRuntimeForensicsWebhookDeliveries({
      dryRun: true,
      actorId: 'owner-1',
      reason: 'manual-dry-run',
    });
    expect(dryRun).toMatchObject({
      dryRun: true,
      deleted: 0,
      wouldDelete: 1,
      retained: 2,
    });
    expect(await listRuntimeForensicsWebhookDeliveries(10)).toHaveLength(2);

    const prune = await pruneRuntimeForensicsWebhookDeliveries({
      actorId: 'owner-1',
      reason: 'manual-prune',
    });
    expect(prune).toMatchObject({
      dryRun: false,
      deleted: 1,
      wouldDelete: 1,
      retained: 1,
    });
    expect(await listRuntimeForensicsWebhookDeliveries(10)).toHaveLength(1);
    await expect(listRuntimeForensicsWebhookDeliveryPruneAudits(10)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorId: 'owner-1',
          reason: 'manual-prune',
          deleted: 1,
        }),
        expect.objectContaining({
          actorId: 'owner-1',
          reason: 'manual-dry-run',
          dryRun: true,
        }),
      ])
    );
  });
});
