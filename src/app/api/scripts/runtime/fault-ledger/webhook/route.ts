import { NextRequest, NextResponse } from 'next/server';
import { engineTelemetry } from '@/engine/telemetry/engineTelemetry';
import { authErrorToResponse, logSecurityEvent, requireSession } from '@/lib/security/auth';
import {
  deleteRuntimeForensicsWebhookConfig,
  filterRuntimeForensicsWebhookDeliveries,
  getConfiguredRuntimeForensicsWebhookDeliveryRetentionPolicy,
  getRuntimeForensicsWebhookConfig,
  listRuntimeForensicsWebhookDeliveryPruneAudits,
  listRuntimeForensicsWebhookDeliveries,
  normalizeRuntimeForensicsWebhookAllowlist,
  normalizeRuntimeForensicsWebhookDeliveryRetentionPolicy,
  pruneRuntimeForensicsWebhookDeliveries,
  putRuntimeForensicsWebhookConfig,
  putRuntimeForensicsWebhookDeliveryRetentionPolicy,
  retryRuntimeForensicsWebhookDeliveries,
  retryRuntimeForensicsWebhookDelivery,
  runtimeForensicsWebhookDeliveryPruneAuditsToCsv,
  runtimeForensicsWebhookDeliveriesToCsv,
  sendRuntimeForensicsWebhook,
  type RuntimeForensicsWebhookDeliveryFilters,
  type RuntimeForensicsWebhookDeliveryRetentionPolicy,
  type RuntimeForensicsWebhookDeliveryStatus,
} from '@/lib/server/runtime-forensics-webhook';
import type { ScriptRuntimeForensicsAdminNotification } from '@/lib/server/script-runtime-artifacts';

function readLimit(request: NextRequest): number {
  const value = Number(new URL(request.url).searchParams.get('limit') || 50);
  if (!Number.isFinite(value)) return 50;
  return Math.max(1, Math.min(200, Math.round(value)));
}

function readStatusFilters(searchParams: URLSearchParams): RuntimeForensicsWebhookDeliveryStatus[] {
  return [...searchParams.getAll('status'), ...searchParams.getAll('statuses')]
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter((value): value is RuntimeForensicsWebhookDeliveryStatus =>
      value === 'pending' ||
      value === 'delivered' ||
      value === 'failed' ||
      value === 'blocked' ||
      value === 'backoff' ||
      value === 'skipped'
    );
}

function readDeliveryFilters(request: NextRequest): RuntimeForensicsWebhookDeliveryFilters {
  const searchParams = new URL(request.url).searchParams;
  return {
    statuses: readStatusFilters(searchParams),
    event: searchParams.get('event') || null,
    from: searchParams.get('from') || searchParams.get('dateFrom') || null,
    to: searchParams.get('to') || searchParams.get('dateTo') || null,
  };
}

function hasDeliveryFilters(filters: RuntimeForensicsWebhookDeliveryFilters): boolean {
  return Boolean(
    (filters.statuses || []).length > 0 ||
      String(filters.event || '').trim() ||
      String(filters.from || '').trim() ||
      String(filters.to || '').trim()
  );
}

interface WebhookPruneAuditFilters {
  actor?: string | null;
  reason?: string | null;
  from?: string | null;
  to?: string | null;
}

function parseDateBound(value: string | null | undefined, endOfDay: boolean): number | null {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? `${trimmed}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`
    : trimmed;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function readWebhookPruneAuditFilters(
  request: NextRequest,
  options: { allowGeneric?: boolean } = {}
): WebhookPruneAuditFilters {
  const searchParams = new URL(request.url).searchParams;
  return {
    actor: searchParams.get('auditActor') || (options.allowGeneric ? searchParams.get('actor') : null),
    reason: searchParams.get('auditReason') || (options.allowGeneric ? searchParams.get('reason') : null),
    from: searchParams.get('auditFrom') || (options.allowGeneric ? searchParams.get('from') : null),
    to: searchParams.get('auditTo') || (options.allowGeneric ? searchParams.get('to') : null),
  };
}

function filterWebhookPruneAudits<
  T extends {
    createdAt: string;
    actorId: string | null;
    reason: string;
  },
>(audits: T[], filters: WebhookPruneAuditFilters = {}): T[] {
  const actor = String(filters.actor || '').trim().toLowerCase();
  const reason = String(filters.reason || '').trim().toLowerCase();
  const fromMs = parseDateBound(filters.from, false);
  const toMs = parseDateBound(filters.to, true);

  return audits.filter((audit) => {
    if (actor && !String(audit.actorId || '').toLowerCase().includes(actor)) return false;
    if (reason && !audit.reason.toLowerCase().includes(reason)) return false;
    const createdAtMs = Date.parse(audit.createdAt);
    if (fromMs !== null && Number.isFinite(createdAtMs) && createdAtMs < fromMs) return false;
    if (toMs !== null && Number.isFinite(createdAtMs) && createdAtMs > toMs) return false;
    return true;
  });
}

function readRetentionPolicy(input: unknown): RuntimeForensicsWebhookDeliveryRetentionPolicy {
  const data = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const policy = data.retentionPolicy && typeof data.retentionPolicy === 'object'
    ? data.retentionPolicy as Record<string, unknown>
    : data;
  return normalizeRuntimeForensicsWebhookDeliveryRetentionPolicy({
    maxDeliveries: Number(policy.maxDeliveries),
    maxAgeDays: Number(policy.maxAgeDays),
    source: 'request',
  });
}

function validateWebhookUrl(value: string | null): string | null {
  const url = String(value || '').trim();
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('INVALID_WEBHOOK_URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('INVALID_WEBHOOK_PROTOCOL');
  }
  if (parsed.username || parsed.password) {
    throw new Error('INVALID_WEBHOOK_CREDENTIALS');
  }
  return parsed.toString();
}

function makeTestNotification(userId: string): ScriptRuntimeForensicsAdminNotification {
  const createdAt = new Date().toISOString();
  return {
    id: `runtime-forensics-webhook-test:${createdAt}`,
    alertId: `webhook-test:${createdAt}`,
    createdAt,
    acknowledgedAt: null,
    level: 'warning',
    indicator: 'runtime_forensics_webhook_test',
    title: 'Runtime forensics webhook test',
    message: 'Manual webhook probe from Admin Runtime Forensics.',
    current: 1,
    objective: 1,
    createdBy: userId,
    acknowledgedBy: null,
    source: 'manual',
  };
}

async function responsePayload(request: NextRequest, options: { fullHistory?: boolean } = {}) {
  const filters = readDeliveryFilters(request);
  const auditFilters = readWebhookPruneAuditFilters(request);
  const limit = readLimit(request);
  const listLimit = options.fullHistory || hasDeliveryFilters(filters) ? 1_000 : limit;
  const [webhook, retentionPolicy, pruneAudit, deliveries] = await Promise.all([
    getRuntimeForensicsWebhookConfig(),
    getConfiguredRuntimeForensicsWebhookDeliveryRetentionPolicy(),
    listRuntimeForensicsWebhookDeliveryPruneAudits(100),
    listRuntimeForensicsWebhookDeliveries(listLimit),
  ]);
  const filteredDeliveries = filterRuntimeForensicsWebhookDeliveries(deliveries, filters)
    .slice(0, limit);
  const filteredPruneAudit = filterWebhookPruneAudits(pruneAudit, auditFilters).slice(0, 10);
  return {
    ok: true,
    webhook,
    filters,
    auditFilters,
    retentionPolicy,
    pruneAudit: filteredPruneAudit,
    deliveryCount: filteredDeliveries.length,
    deliveries: filteredDeliveries,
  };
}

async function recordWebhookConfigAudit(params: {
  request: NextRequest;
  userId: string;
  action:
    | 'webhook_config_update'
    | 'webhook_config_reset'
    | 'webhook_history_retention_policy_update'
    | 'webhook_history_prune'
    | 'webhook_history_prune_dry_run';
  metadata: Record<string, unknown>;
}) {
  engineTelemetry.recordRuntimeForensicsEvent({
    action: params.action,
    status: 'allowed',
  });
  await logSecurityEvent({
    request: params.request,
    userId: params.userId,
    action: `runtime.forensics.${params.action}`,
    target: 'scripts.runtime.fault-ledger.webhook',
    status: 'allowed',
    metadata: params.metadata,
    durability: 'critical',
  });
}

export async function GET(request: NextRequest) {
  try {
    await requireSession(request, 'OWNER');
    const searchParams = new URL(request.url).searchParams;
    const format = searchParams.get('format');
    const audit = searchParams.get('audit') || searchParams.get('kind');

    if (audit === 'prune') {
      const filters = readWebhookPruneAuditFilters(request, { allowGeneric: true });
      const audits = filterWebhookPruneAudits(
        await listRuntimeForensicsWebhookDeliveryPruneAudits(100),
        filters
      ).slice(0, readLimit(request));

      if (format === 'csv') {
        return new Response(runtimeForensicsWebhookDeliveryPruneAuditsToCsv(audits), {
          headers: {
            'content-type': 'text/csv; charset=utf-8',
            'content-disposition': 'attachment; filename="runtime-forensics-webhook-prune-audit.csv"',
          },
        });
      }

      if (format === 'json') {
        return new Response(
          JSON.stringify(
            {
              ok: true,
              exportedAt: new Date().toISOString(),
              filters,
              auditCount: audits.length,
              audits,
            },
            null,
            2
          ),
          {
            headers: {
              'content-type': 'application/json; charset=utf-8',
              'content-disposition': 'attachment; filename="runtime-forensics-webhook-prune-audit.json"',
            },
          }
        );
      }

      return NextResponse.json({
        ok: true,
        filters,
        auditCount: audits.length,
        audits,
      });
    }

    const payload = await responsePayload(request, { fullHistory: format === 'csv' || format === 'json' });

    if (format === 'csv') {
      return new Response(runtimeForensicsWebhookDeliveriesToCsv(payload.deliveries), {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': 'attachment; filename="runtime-forensics-webhook-deliveries.csv"',
        },
      });
    }

    if (format === 'json') {
      return new Response(
        JSON.stringify(
          {
            ...payload,
            exportedAt: new Date().toISOString(),
          },
          null,
          2
        ),
        {
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'content-disposition': 'attachment; filename="runtime-forensics-webhook-deliveries.json"',
          },
        }
      );
    }

    return NextResponse.json(payload);
  } catch (error) {
    return authErrorToResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSession(request, 'OWNER');
    const body = await request.json().catch(() => ({})) as {
      action?: string;
      enabled?: boolean;
      url?: string | null;
      secret?: string | null;
      clearSecret?: boolean;
      allowlistHosts?: unknown;
      id?: string;
      maxDeliveries?: number;
      maxAgeDays?: number;
      retentionPolicy?: {
        maxDeliveries?: number;
        maxAgeDays?: number;
      };
    };

    if (body.action === 'update-retention-policy') {
      const policy = await putRuntimeForensicsWebhookDeliveryRetentionPolicy({
        maxDeliveries: Number(body.retentionPolicy?.maxDeliveries ?? body.maxDeliveries),
        maxAgeDays: Number(body.retentionPolicy?.maxAgeDays ?? body.maxAgeDays),
        updatedBy: user.id,
      });
      const nextPayload = await responsePayload(request);
      await recordWebhookConfigAudit({
        request,
        userId: user.id,
        action: 'webhook_history_retention_policy_update',
        metadata: {
          maxDeliveries: policy.maxDeliveries,
          maxAgeDays: policy.maxAgeDays,
          source: policy.source,
        },
      });
      return NextResponse.json({
        ...nextPayload,
        retentionPolicy: policy,
      });
    }

    if (body.action === 'update-config') {
      const hasUrlInput = typeof body.url === 'string' && body.url.trim().length > 0;
      const currentWebhook = await getRuntimeForensicsWebhookConfig();
      const envUrl =
        currentWebhook.source === 'env'
          ? String(process.env.REY30_RUNTIME_FORENSICS_WEBHOOK_URL || '').trim()
          : '';
      const envSecret =
        currentWebhook.source === 'env'
          ? String(process.env.REY30_RUNTIME_FORENSICS_WEBHOOK_SECRET || '').trim()
          : '';
      const url = hasUrlInput
        ? validateWebhookUrl(body.url || null)
        : envUrl
          ? validateWebhookUrl(envUrl)
          : undefined;
      const secretInput = typeof body.secret === 'string' ? body.secret.trim() : '';
      const hasSecretInput = secretInput.length > 0;
      const secret =
        body.clearSecret
          ? null
          : hasSecretInput
            ? secretInput
            : envSecret || undefined;
      await putRuntimeForensicsWebhookConfig({
        enabled: body.enabled !== false,
        url,
        preserveUrl: !hasUrlInput && !envUrl,
        secret,
        preserveSecret: !hasSecretInput && !body.clearSecret && !envSecret,
        allowlistHosts: normalizeRuntimeForensicsWebhookAllowlist(body.allowlistHosts),
        updatedBy: user.id,
      });
      const nextPayload = await responsePayload(request);
      await recordWebhookConfigAudit({
        request,
        userId: user.id,
        action: 'webhook_config_update',
        metadata: {
          sourceBefore: currentWebhook.source,
          sourceAfter: nextPayload.webhook.source,
          enabled: nextPayload.webhook.enabled,
          configured: nextPayload.webhook.configured,
          host: nextPayload.webhook.host,
          allowlistBlocked: nextPayload.webhook.allowlistBlocked,
          allowlistHostCount: nextPayload.webhook.allowlistHosts.length,
          urlChanged: hasUrlInput,
          secretChanged: hasSecretInput || Boolean(body.clearSecret),
          secretCleared: Boolean(body.clearSecret),
        },
      });
      return NextResponse.json(nextPayload);
    }

    if (body.action === 'reset-config') {
      const before = await getRuntimeForensicsWebhookConfig();
      await deleteRuntimeForensicsWebhookConfig();
      const nextPayload = await responsePayload(request);
      await recordWebhookConfigAudit({
        request,
        userId: user.id,
        action: 'webhook_config_reset',
        metadata: {
          sourceBefore: before.source,
          configuredBefore: before.configured,
          sourceAfter: nextPayload.webhook.source,
          configuredAfter: nextPayload.webhook.configured,
          hostBefore: before.host,
        },
      });
      return NextResponse.json(nextPayload);
    }

    if (body.action === 'test') {
      const result = await sendRuntimeForensicsWebhook({
        notification: makeTestNotification(user.id),
        event: 'runtime_forensics.webhook_test',
        source: 'manual-test',
        requestedBy: user.id,
        force: true,
      });
      return NextResponse.json({
        ...(await responsePayload(request)),
        test: result,
      });
    }

    if (body.action === 'retry') {
      const id = String(body.id || '').trim();
      if (!id) {
        return NextResponse.json({ error: 'delivery id requerido.' }, { status: 400 });
      }
      const retry = await retryRuntimeForensicsWebhookDelivery({
        id,
        requestedBy: user.id,
        force: true,
      });
      return NextResponse.json({
        ...(await responsePayload(request)),
        retry,
      });
    }

    if (body.action === 'retry-due') {
      const retry = await retryRuntimeForensicsWebhookDeliveries({
        requestedBy: user.id,
      });
      return NextResponse.json({
        ...(await responsePayload(request)),
        retry,
      });
    }

    if (body.action === 'dry-run-prune' || body.action === 'prune') {
      const prune = await pruneRuntimeForensicsWebhookDeliveries({
        dryRun: body.action === 'dry-run-prune',
        ...(body.retentionPolicy ? { policy: readRetentionPolicy(body) } : {}),
        actorId: user.id,
        reason: body.action === 'dry-run-prune' ? 'manual-dry-run' : 'manual-prune',
      });
      const nextPayload = await responsePayload(request, { fullHistory: true });
      await recordWebhookConfigAudit({
        request,
        userId: user.id,
        action:
          body.action === 'dry-run-prune'
            ? 'webhook_history_prune_dry_run'
            : 'webhook_history_prune',
        metadata: {
          dryRun: prune.dryRun,
          deleted: prune.deleted,
          wouldDelete: prune.wouldDelete,
          retained: prune.retained,
          maxDeliveries: prune.policy.maxDeliveries,
          maxAgeDays: prune.policy.maxAgeDays,
        },
      });
      return NextResponse.json({
        ...nextPayload,
        retentionPolicy: prune.policy,
        prune,
      });
    }

    return NextResponse.json({ error: 'acción webhook inválida.' }, { status: 400 });
  } catch (error) {
    const message = String(error || '');
    if (message.includes('INVALID_WEBHOOK_URL')) {
      return NextResponse.json({ error: 'Webhook URL inválida.' }, { status: 400 });
    }
    if (message.includes('INVALID_WEBHOOK_PROTOCOL')) {
      return NextResponse.json({ error: 'Webhook URL debe usar http o https.' }, { status: 400 });
    }
    if (message.includes('INVALID_WEBHOOK_CREDENTIALS')) {
      return NextResponse.json(
        { error: 'Webhook URL no puede incluir credenciales embebidas.' },
        { status: 400 }
      );
    }
    return authErrorToResponse(error);
  }
}
