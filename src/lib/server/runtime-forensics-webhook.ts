import { createHmac } from 'node:crypto';
import { engineTelemetry } from '@/engine/telemetry/engineTelemetry';
import {
  fetchRemoteText,
  getRemoteProviderAllowlistForDiagnostics,
  isRemoteProviderHostAllowlisted,
} from '@/lib/security/remote-fetch';
import type { ScriptRuntimeForensicsAdminNotification } from './script-runtime-artifacts';
import {
  buildRuntimeForensicsWebhookDeliveryId,
  decryptRuntimeForensicsWebhookConfig,
  deleteRuntimeForensicsWebhookConfig,
  filterRuntimeForensicsWebhookDeliveries,
  getConfiguredRuntimeForensicsWebhookDeliveryRetentionPolicy,
  getRuntimeForensicsWebhookConfigRecord,
  getRuntimeForensicsWebhookDelivery,
  getRuntimeForensicsWebhookDeliveryRetentionPolicy,
  hashRuntimeForensicsWebhookPayload,
  listRuntimeForensicsWebhookDeliveries,
  listRuntimeForensicsWebhookDeliveryPruneAudits,
  listRuntimeForensicsWebhookDeliveriesReadyForRetry,
  normalizeRuntimeForensicsWebhookAllowlist,
  normalizeRuntimeForensicsWebhookDeliveryRetentionPolicy,
  pruneRuntimeForensicsWebhookDeliveries,
  putRuntimeForensicsWebhookConfig,
  putRuntimeForensicsWebhookDeliveryRetentionPolicy,
  putRuntimeForensicsWebhookDelivery,
  runtimeForensicsWebhookDeliveryPruneAuditsToCsv,
  runtimeForensicsWebhookDeliveriesToCsv,
  type RuntimeForensicsWebhookDeliveryFilters,
  type RuntimeForensicsWebhookDeliveryRecord,
  type RuntimeForensicsWebhookDeliveryRetentionPolicy,
  type RuntimeForensicsWebhookDeliverySource,
  type RuntimeForensicsWebhookDeliveryStatus,
} from './runtime-forensics-webhook-storage';

export interface RuntimeForensicsWebhookConfigStatus {
  configured: boolean;
  enabled: boolean;
  source: 'env' | 'persisted_config';
  url: string | null;
  host: string | null;
  signingEnabled: boolean;
  hasSecret: boolean;
  allowlistHosts: string[];
  effectiveAllowlist: string[];
  allowlistConfigured: boolean;
  allowlistBlocked: boolean;
  blockedReason: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface RuntimeForensicsWebhookResult {
  configured: boolean;
  delivered: boolean;
  status?: number;
  error?: string;
  skipped?: 'delivered' | 'backoff' | 'disabled' | 'not-configured' | 'blocked';
  backoffUntil?: string | null;
  allowlistBlocked?: boolean;
  delivery?: RuntimeForensicsWebhookDeliveryRecord | null;
}

interface EffectiveWebhookConfig {
  status: RuntimeForensicsWebhookConfigStatus;
  url: string;
  secret: string;
  additionalAllowlist: string[];
}

function readWebhookUrl(env: NodeJS.ProcessEnv = process.env): string {
  return String(env.REY30_RUNTIME_FORENSICS_WEBHOOK_URL || '').trim();
}

function readWebhookSecret(env: NodeJS.ProcessEnv = process.env): string {
  return String(env.REY30_RUNTIME_FORENSICS_WEBHOOK_SECRET || '').trim();
}

function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

function redactWebhookUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.username = '';
    parsed.password = '';
    parsed.hash = '';
    if (parsed.search) parsed.search = '?redacted';
    return parsed.toString();
  } catch {
    return 'configured';
  }
}

function resolveHost(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function buildPayload(params: {
  event: string;
  notification: ScriptRuntimeForensicsAdminNotification;
}): string {
  return JSON.stringify({
    event: params.event,
    deliveredAt: new Date().toISOString(),
    notification: params.notification,
  });
}

function retryDelayMs(attemptCount: number, env: NodeJS.ProcessEnv = process.env): number {
  const base = Math.max(
    1_000,
    Number(env.REY30_RUNTIME_FORENSICS_WEBHOOK_RETRY_BASE_MS) || 60_000
  );
  const max = Math.max(
    base,
    Number(env.REY30_RUNTIME_FORENSICS_WEBHOOK_RETRY_MAX_MS) || 30 * 60_000
  );
  return Math.min(max, base * Math.max(1, 2 ** Math.max(0, attemptCount - 1)));
}

function isRetryableStatus(status: number | undefined): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

function errorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code || '')
    : '';
}

function isAllowlistError(error: unknown): boolean {
  const code = errorCode(error);
  return (
    code === 'host_allowlist_not_configured' ||
    code === 'host_not_allowlisted' ||
    code === 'loopback_not_allowlisted'
  );
}

function buildStatus(params: {
  enabled: boolean;
  source: RuntimeForensicsWebhookConfigStatus['source'];
  url: string;
  secret: string;
  additionalAllowlist: string[];
  updatedAt?: string | null;
  updatedBy?: string | null;
}): RuntimeForensicsWebhookConfigStatus {
  const host = params.url ? resolveHost(params.url) : null;
  const effectiveAllowlist = getRemoteProviderAllowlistForDiagnostics(
    'webhook',
    params.additionalAllowlist
  );
  const invalidUrl = Boolean(params.url && !host);
  const allowlistConfigured = effectiveAllowlist.length > 0;
  const allowlisted = host
    ? isRemoteProviderHostAllowlisted({
        provider: 'webhook',
        host,
        additionalAllowlist: params.additionalAllowlist,
      })
    : false;
  const allowlistBlocked = Boolean(
    params.enabled &&
      params.url &&
      (invalidUrl || !allowlistConfigured || (host && !allowlisted))
  );
  return {
    configured: Boolean(params.enabled && params.url),
    enabled: params.enabled,
    source: params.source,
    url: params.url ? redactWebhookUrl(params.url) : null,
    host,
    signingEnabled: Boolean(params.secret),
    hasSecret: Boolean(params.secret),
    allowlistHosts: params.additionalAllowlist,
    effectiveAllowlist,
    allowlistConfigured,
    allowlistBlocked,
    blockedReason: invalidUrl
      ? 'invalid_url'
      : !allowlistConfigured && params.url
        ? 'allowlist_not_configured'
        : allowlistBlocked
          ? 'host_not_allowlisted'
          : null,
    updatedAt: params.updatedAt || null,
    updatedBy: params.updatedBy || null,
  };
}

async function getEffectiveWebhookConfig(
  env: NodeJS.ProcessEnv = process.env
): Promise<EffectiveWebhookConfig> {
  const persisted = await getRuntimeForensicsWebhookConfigRecord();
  if (persisted) {
    const decrypted = decryptRuntimeForensicsWebhookConfig(persisted);
    const url = decrypted.url || '';
    const secret = decrypted.secret || '';
    return {
      url,
      secret,
      additionalAllowlist: decrypted.allowlistHosts,
      status: buildStatus({
        enabled: decrypted.enabled,
        source: 'persisted_config',
        url,
        secret,
        additionalAllowlist: decrypted.allowlistHosts,
        updatedAt: decrypted.updatedAt,
        updatedBy: decrypted.updatedBy,
      }),
    };
  }

  const url = readWebhookUrl(env);
  const secret = readWebhookSecret(env);
  return {
    url,
    secret,
    additionalAllowlist: [],
    status: buildStatus({
      enabled: Boolean(url),
      source: 'env',
      url,
      secret,
      additionalAllowlist: [],
    }),
  };
}

export async function getRuntimeForensicsWebhookConfig(
  env: NodeJS.ProcessEnv = process.env
): Promise<RuntimeForensicsWebhookConfigStatus> {
  return (await getEffectiveWebhookConfig(env)).status;
}

function createDeliveryRecord(params: {
  id: string;
  event: string;
  source: RuntimeForensicsWebhookDeliverySource;
  notification: ScriptRuntimeForensicsAdminNotification;
  status: RuntimeForensicsWebhookDeliveryStatus;
  attemptCount: number;
  targetUrl: string | null;
  targetHost: string | null;
  payloadDigest: string | null;
  requestedBy?: string | null;
  lastAttemptAt?: string | null;
  nextAttemptAt?: string | null;
  deliveredAt?: string | null;
  responseStatus?: number | null;
  error?: string | null;
  createdAt?: string | null;
}): RuntimeForensicsWebhookDeliveryRecord {
  const now = new Date().toISOString();
  return {
    version: 1,
    id: params.id,
    event: params.event,
    source: params.source,
    notificationId: params.notification.id,
    alertId: params.notification.alertId || null,
    notification: params.notification,
    status: params.status,
    createdAt: params.createdAt || now,
    updatedAt: now,
    lastAttemptAt: params.lastAttemptAt || null,
    nextAttemptAt: params.nextAttemptAt || null,
    deliveredAt: params.deliveredAt || null,
    attemptCount: params.attemptCount,
    responseStatus: params.responseStatus ?? null,
    error: params.error || null,
    targetUrl: params.targetUrl,
    targetHost: params.targetHost,
    payloadDigest: params.payloadDigest,
    requestedBy: params.requestedBy || null,
  };
}

function recordWebhookDeliveryTelemetry(delivery: RuntimeForensicsWebhookDeliveryRecord): void {
  engineTelemetry.recordRuntimeForensicsEvent({
    action: 'webhook_delivery',
    deliveryStatus: delivery.status,
    delivered: delivery.status === 'delivered',
    event: delivery.event,
    source: delivery.source,
    responseStatus: delivery.responseStatus || 0,
    targetHost: delivery.targetHost || 'n/a',
  });
}

export async function sendRuntimeForensicsWebhook(params: {
  notification: ScriptRuntimeForensicsAdminNotification;
  event?: string;
  env?: NodeJS.ProcessEnv;
  deliveryId?: string;
  source?: RuntimeForensicsWebhookDeliverySource;
  requestedBy?: string | null;
  force?: boolean;
}): Promise<RuntimeForensicsWebhookResult> {
  const env = params.env || process.env;
  const event = params.event || 'runtime_forensics.slo_alert';
  const source = params.source || 'slo';
  const effective = await getEffectiveWebhookConfig(env);
  const status = effective.status;
  const deliveryId =
    params.deliveryId ||
    buildRuntimeForensicsWebhookDeliveryId({
      event,
      notificationId: params.notification.id,
      createdAt: source === 'manual-test' ? new Date().toISOString() : null,
    });
  const existing = await getRuntimeForensicsWebhookDelivery(deliveryId);

  if (!effective.url) {
    return { configured: false, delivered: false, skipped: 'not-configured' };
  }
  if (!status.enabled) {
    return { configured: false, delivered: false, skipped: 'disabled' };
  }
  if (existing?.status === 'delivered' && !params.force) {
    return { configured: true, delivered: true, skipped: 'delivered', delivery: existing };
  }
  if (existing?.status === 'backoff' && existing.nextAttemptAt && !params.force) {
    const nextMs = Date.parse(existing.nextAttemptAt);
    if (Number.isFinite(nextMs) && nextMs > Date.now()) {
      return {
        configured: true,
        delivered: false,
        skipped: 'backoff',
        backoffUntil: existing.nextAttemptAt,
        delivery: existing,
      };
    }
  }

  const targetHost = resolveHost(effective.url);
  const payload = buildPayload({ event, notification: params.notification });
  const payloadDigest = hashRuntimeForensicsWebhookPayload(payload);
  const createdAt = existing?.createdAt || null;
  const nextAttemptCount = (existing?.attemptCount || 0) + 1;

  if (status.allowlistBlocked) {
    const delivery = await putRuntimeForensicsWebhookDelivery(
      createDeliveryRecord({
        id: deliveryId,
        event,
        source,
        notification: params.notification,
        status: 'blocked',
        attemptCount: existing?.attemptCount || 0,
        targetUrl: status.url,
        targetHost,
        payloadDigest,
        requestedBy: params.requestedBy,
        error: status.blockedReason || 'allowlist_blocked',
        createdAt,
      })
    );
    recordWebhookDeliveryTelemetry(delivery);
    return {
      configured: true,
      delivered: false,
      skipped: 'blocked',
      allowlistBlocked: true,
      error: status.blockedReason || 'allowlist_blocked',
      delivery,
    };
  }

  await putRuntimeForensicsWebhookDelivery(
    createDeliveryRecord({
      id: deliveryId,
      event,
      source,
      notification: params.notification,
      status: 'pending',
      attemptCount: nextAttemptCount,
      targetUrl: status.url,
      targetHost,
      payloadDigest,
      requestedBy: params.requestedBy,
      lastAttemptAt: new Date().toISOString(),
      createdAt,
    })
  );

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'user-agent': 'rey30-runtime-forensics/1.0',
  };
  if (effective.secret) {
    headers['x-rey30-signature'] = `sha256=${signPayload(payload, effective.secret)}`;
  }

  try {
    const { response } = await fetchRemoteText({
      provider: 'webhook',
      url: effective.url,
      init: {
        method: 'POST',
        headers,
        body: payload,
      },
      timeoutMs: 10_000,
      maxBytes: 64 * 1024,
      additionalAllowlist: effective.additionalAllowlist,
    });
    const delivered = response.ok;
    const retryable = !delivered && isRetryableStatus(response.status);
    const nextAttemptAt = retryable
      ? new Date(Date.now() + retryDelayMs(nextAttemptCount, env)).toISOString()
      : null;
    const delivery = await putRuntimeForensicsWebhookDelivery(
      createDeliveryRecord({
        id: deliveryId,
        event,
        source,
        notification: params.notification,
        status: delivered ? 'delivered' : retryable ? 'backoff' : 'failed',
        attemptCount: nextAttemptCount,
        targetUrl: status.url,
        targetHost,
        payloadDigest,
        requestedBy: params.requestedBy,
        lastAttemptAt: new Date().toISOString(),
        nextAttemptAt,
        deliveredAt: delivered ? new Date().toISOString() : null,
        responseStatus: response.status,
        error: delivered ? null : `HTTP ${response.status}`,
        createdAt,
      })
    );
    recordWebhookDeliveryTelemetry(delivery);
    return {
      configured: true,
      delivered,
      status: response.status,
      error: delivered ? undefined : `HTTP ${response.status}`,
      backoffUntil: nextAttemptAt,
      delivery,
    };
  } catch (error) {
    const blocked = isAllowlistError(error);
    const nextAttemptAt = blocked
      ? null
      : new Date(Date.now() + retryDelayMs(nextAttemptCount, env)).toISOString();
    const delivery = await putRuntimeForensicsWebhookDelivery(
      createDeliveryRecord({
        id: deliveryId,
        event,
        source,
        notification: params.notification,
        status: blocked ? 'blocked' : 'backoff',
        attemptCount: nextAttemptCount,
        targetUrl: status.url,
        targetHost,
        payloadDigest,
        requestedBy: params.requestedBy,
        lastAttemptAt: new Date().toISOString(),
        nextAttemptAt,
        error: String(error),
        createdAt,
      })
    );
    recordWebhookDeliveryTelemetry(delivery);
    return {
      configured: true,
      delivered: false,
      error: String(error),
      allowlistBlocked: blocked,
      backoffUntil: nextAttemptAt,
      delivery,
    };
  }
}

export async function retryRuntimeForensicsWebhookDelivery(params: {
  id: string;
  requestedBy?: string | null;
  force?: boolean;
}): Promise<RuntimeForensicsWebhookResult> {
  const delivery = await getRuntimeForensicsWebhookDelivery(params.id);
  if (!delivery?.notification) {
    return {
      configured: (await getRuntimeForensicsWebhookConfig()).configured,
      delivered: false,
      error: 'delivery_not_retryable',
      delivery,
    };
  }
  return sendRuntimeForensicsWebhook({
    notification: delivery.notification,
    event: delivery.event,
    deliveryId: delivery.id,
    source: 'retry',
    requestedBy: params.requestedBy,
    force: params.force,
  });
}

export async function retryRuntimeForensicsWebhookDeliveries(params: {
  limit?: number;
  requestedBy?: string | null;
} = {}) {
  const due = await listRuntimeForensicsWebhookDeliveriesReadyForRetry(params.limit || 10);
  const results: RuntimeForensicsWebhookResult[] = [];
  for (const delivery of due) {
    results.push(
      await retryRuntimeForensicsWebhookDelivery({
        id: delivery.id,
        requestedBy: params.requestedBy,
        force: true,
      })
    );
  }
  return {
    attempted: results.length,
    delivered: results.filter((result) => result.delivered).length,
    failed: results.filter((result) => !result.delivered).length,
    results,
  };
}

export {
  deleteRuntimeForensicsWebhookConfig,
  filterRuntimeForensicsWebhookDeliveries,
  getConfiguredRuntimeForensicsWebhookDeliveryRetentionPolicy,
  getRuntimeForensicsWebhookDeliveryRetentionPolicy,
  listRuntimeForensicsWebhookDeliveries,
  listRuntimeForensicsWebhookDeliveryPruneAudits,
  normalizeRuntimeForensicsWebhookAllowlist,
  normalizeRuntimeForensicsWebhookDeliveryRetentionPolicy,
  pruneRuntimeForensicsWebhookDeliveries,
  putRuntimeForensicsWebhookConfig,
  putRuntimeForensicsWebhookDeliveryRetentionPolicy,
  runtimeForensicsWebhookDeliveryPruneAuditsToCsv,
  runtimeForensicsWebhookDeliveriesToCsv,
  type RuntimeForensicsWebhookDeliveryFilters,
  type RuntimeForensicsWebhookDeliveryRetentionPolicy,
  type RuntimeForensicsWebhookDeliveryStatus,
};
