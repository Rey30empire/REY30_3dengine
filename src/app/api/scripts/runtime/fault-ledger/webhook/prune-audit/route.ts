import { NextRequest, NextResponse } from 'next/server';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import {
  listRuntimeForensicsWebhookDeliveryPruneAudits,
  runtimeForensicsWebhookDeliveryPruneAuditsToCsv,
} from '@/lib/server/runtime-forensics-webhook';

interface WebhookPruneAuditFilters {
  actor?: string | null;
  reason?: string | null;
  from?: string | null;
  to?: string | null;
}

function readLimit(request: NextRequest): number {
  const value = Number(new URL(request.url).searchParams.get('limit') || 100);
  if (!Number.isFinite(value)) return 100;
  return Math.max(1, Math.min(200, Math.round(value)));
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

function readFilters(request: NextRequest): WebhookPruneAuditFilters {
  const searchParams = new URL(request.url).searchParams;
  return {
    actor: searchParams.get('actor') || searchParams.get('auditActor'),
    reason: searchParams.get('reason') || searchParams.get('auditReason'),
    from: searchParams.get('from') || searchParams.get('auditFrom'),
    to: searchParams.get('to') || searchParams.get('auditTo'),
  };
}

function filterAudits<
  T extends {
    createdAt: string;
    actorId: string | null;
    reason: string;
  },
>(audits: T[], filters: WebhookPruneAuditFilters): T[] {
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

export async function GET(request: NextRequest) {
  try {
    await requireSession(request, 'OWNER');
    const searchParams = new URL(request.url).searchParams;
    const format = searchParams.get('format');
    const filters = readFilters(request);
    const audits = filterAudits(
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
  } catch (error) {
    return authErrorToResponse(error);
  }
}
