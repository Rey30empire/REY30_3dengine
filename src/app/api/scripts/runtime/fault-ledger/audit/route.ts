import { NextRequest, NextResponse } from 'next/server';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import {
  listScriptRuntimeFaultLedgerPruneAudits,
  scriptRuntimeFaultLedgerPruneAuditsToCsv,
} from '@/lib/server/script-runtime-artifacts';

function readLimit(request: NextRequest): number {
  const value = Number(new URL(request.url).searchParams.get('limit') || 50);
  if (!Number.isFinite(value)) return 50;
  return Math.max(1, Math.min(100, Math.round(value)));
}

function readDateBound(value: string | null, endOfDay: boolean): number | null {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? `${trimmed}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`
    : trimmed;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(request: NextRequest) {
  try {
    await requireSession(request, 'EDITOR');
    const searchParams = new URL(request.url).searchParams;
    const actor = String(searchParams.get('actor') || '').trim().toLowerCase();
    const reason = String(searchParams.get('reason') || '').trim().toLowerCase();
    const fromMs = readDateBound(searchParams.get('from') || searchParams.get('dateFrom'), false);
    const toMs = readDateBound(searchParams.get('to') || searchParams.get('dateTo'), true);
    const limit = readLimit(request);
    const audits = (await listScriptRuntimeFaultLedgerPruneAudits(100)).filter(
      (entry) => {
        if (actor && !String(entry.actorId || '').toLowerCase().includes(actor)) return false;
        if (reason && !entry.reason.toLowerCase().includes(reason)) return false;
        const createdAtMs = Date.parse(entry.createdAt);
        if (fromMs !== null && Number.isFinite(createdAtMs) && createdAtMs < fromMs) return false;
        if (toMs !== null && Number.isFinite(createdAtMs) && createdAtMs > toMs) return false;
        return true;
      }
    ).slice(0, limit);
    const filters = {
      actor: actor || null,
      reason: reason || null,
      from: searchParams.get('from') || searchParams.get('dateFrom') || null,
      to: searchParams.get('to') || searchParams.get('dateTo') || null,
    };
    const format = searchParams.get('format');

    if (format === 'csv') {
      return new Response(scriptRuntimeFaultLedgerPruneAuditsToCsv(audits), {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': 'attachment; filename="runtime-fault-ledger-prune-audit.csv"',
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
            'content-disposition': 'attachment; filename="runtime-fault-ledger-prune-audit.json"',
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
