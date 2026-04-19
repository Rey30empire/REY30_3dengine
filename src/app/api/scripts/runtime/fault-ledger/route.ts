import { NextRequest, NextResponse } from 'next/server';
import { engineTelemetry } from '@/engine/telemetry/engineTelemetry';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import { logSecurityEvent } from '@/lib/security/auth';
import {
  filterScriptRuntimeFaultLedgerSnapshots,
  getConfiguredScriptRuntimeFaultLedgerRetentionPolicy,
  listScriptRuntimeFaultLedgerPruneAudits,
  listScriptRuntimeFaultLedgerSnapshots,
  pruneScriptRuntimeFaultLedgerSnapshots,
  putScriptRuntimeFaultLedgerRetentionPolicy,
  putScriptRuntimeFaultLedgerSnapshot,
  scriptRuntimeFaultLedgerSnapshotsToCsv,
  type ScriptRuntimeFaultLedgerSeverity,
  type ScriptRuntimeFaultLedgerSnapshotFilters,
  type ScriptRuntimeFaultLedgerSnapshotItem,
} from '@/lib/server/script-runtime-artifacts';

const SCRIPT_RUNTIME_FAULT_LEDGER_FAILED_MESSAGE =
  'No se pudo persistir el ledger forense del runtime.';

function isAuthError(error: unknown): boolean {
  const text = String(error);
  return text.includes('UNAUTHORIZED') || text.includes('FORBIDDEN');
}

function readLimit(request: NextRequest): number {
  const value = Number(new URL(request.url).searchParams.get('limit') || 20);
  if (!Number.isFinite(value)) return 20;
  return Math.max(1, Math.min(100, Math.round(value)));
}

function readSeverityFilters(searchParams: URLSearchParams): ScriptRuntimeFaultLedgerSeverity[] {
  return [...searchParams.getAll('severity'), ...searchParams.getAll('severities')]
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter((value): value is ScriptRuntimeFaultLedgerSeverity =>
      value === 'P0' || value === 'P1' || value === 'P2'
    );
}

function readCsvFilters(request: NextRequest): ScriptRuntimeFaultLedgerSnapshotFilters {
  const searchParams = new URL(request.url).searchParams;
  return {
    severities: readSeverityFilters(searchParams),
    target: searchParams.get('target') || null,
    from: searchParams.get('from') || searchParams.get('dateFrom') || null,
    to: searchParams.get('to') || searchParams.get('dateTo') || null,
  };
}

function p0TargetsFromSnapshot(
  snapshot: { items?: Array<{ severity?: string; target?: string }> } | null | undefined
): Set<string> {
  return new Set(
    (snapshot?.items || [])
      .filter((item) => item.severity === 'P0' && item.target)
      .map((item) => String(item.target))
  );
}

function sameStringSet(left: Set<string>, right: Set<string>): boolean {
  if (left.size !== right.size) return false;
  for (const item of left) {
    if (!right.has(item)) return false;
  }
  return true;
}

function findReappearedP0Targets(
  snapshots: Array<{ items?: Array<{ severity?: string; target?: string }> }>
): string[] {
  const currentP0 = p0TargetsFromSnapshot(snapshots[0]);
  if (currentP0.size === 0) return [];
  const previousDifferentIndex = snapshots
    .slice(1)
    .findIndex((snapshot) => !sameStringSet(p0TargetsFromSnapshot(snapshot), currentP0));
  if (previousDifferentIndex < 0) return [];
  const previousIndex = previousDifferentIndex + 1;
  const previousP0 = p0TargetsFromSnapshot(snapshots[previousIndex]);
  const olderP0 = new Set(
    snapshots
      .slice(previousIndex + 1)
      .flatMap((snapshot) => snapshot.items || [])
      .filter((item) => item.severity === 'P0' && item.target)
      .map((item) => String(item.target))
  );
  return Array.from(currentP0)
    .filter((target) => !previousP0.has(target) && olderP0.has(target))
    .sort();
}

async function recordRuntimeForensicsAudit(params: {
  request: NextRequest;
  userId: string;
  action: string;
  status: 'allowed' | 'denied' | 'error';
  metadata?: Record<string, unknown>;
}): Promise<void> {
  engineTelemetry.recordRuntimeForensicsEvent({
    action: params.action,
    status: params.status,
  });
  await logSecurityEvent({
    request: params.request,
    userId: params.userId,
    action: `runtime.forensics.${params.action}`,
    target: 'scripts.runtime.fault-ledger',
    status: params.status,
    metadata: params.metadata || null,
    durability: 'critical',
  });
}

export async function GET(request: NextRequest) {
  try {
    await requireSession(request, 'EDITOR');
    const snapshots = await listScriptRuntimeFaultLedgerSnapshots(readLimit(request));
    const retentionPolicy = await getConfiguredScriptRuntimeFaultLedgerRetentionPolicy();
    const pruneAudit = await listScriptRuntimeFaultLedgerPruneAudits(10);
    const format = new URL(request.url).searchParams.get('format');
    if (format === 'csv') {
      const filteredSnapshots = filterScriptRuntimeFaultLedgerSnapshots(
        snapshots,
        readCsvFilters(request)
      );
      return new Response(scriptRuntimeFaultLedgerSnapshotsToCsv(filteredSnapshots), {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': 'attachment; filename="runtime-fault-ledger-history.csv"',
        },
      });
    }
    if (format === 'json') {
      const filters = readCsvFilters(request);
      const filteredSnapshots = filterScriptRuntimeFaultLedgerSnapshots(snapshots, filters);
      return new Response(
        JSON.stringify(
          {
            ok: true,
            exportedAt: new Date().toISOString(),
            filters,
            retentionPolicy,
            pruneAudit,
            snapshots: filteredSnapshots,
          },
          null,
          2
        ),
        {
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'content-disposition': 'attachment; filename="runtime-fault-ledger-history.json"',
          },
        }
      );
    }
    return NextResponse.json({
      ok: true,
      retentionPolicy,
      pruneAudit,
      snapshots,
    });
  } catch (error) {
    if (isAuthError(error)) {
      return authErrorToResponse(error);
    }
    console.error('[scripts][runtime][fault-ledger] list failed:', error);
    return NextResponse.json(
      { error: SCRIPT_RUNTIME_FAULT_LEDGER_FAILED_MESSAGE },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSession(request, 'EDITOR');
    const body = (await request.json()) as {
      action?: string;
      maxSnapshots?: number;
      maxAgeDays?: number;
      retentionPolicy?: {
        maxSnapshots?: number;
        maxAgeDays?: number;
      };
      instanceId?: string;
      playState?: string;
      generatedAt?: string;
      items?: ScriptRuntimeFaultLedgerSnapshotItem[];
    };

    if (body.action === 'update-retention-policy') {
      const retentionPolicy = await putScriptRuntimeFaultLedgerRetentionPolicy({
        maxSnapshots: Number(body.retentionPolicy?.maxSnapshots ?? body.maxSnapshots),
        maxAgeDays: Number(body.retentionPolicy?.maxAgeDays ?? body.maxAgeDays),
        updatedBy: user.id,
      });
      const pruneAudit = await listScriptRuntimeFaultLedgerPruneAudits(10);
      await recordRuntimeForensicsAudit({
        request,
        userId: user.id,
        action: 'retention_policy_update',
        status: 'allowed',
        metadata: {
          maxSnapshots: retentionPolicy.maxSnapshots,
          maxAgeDays: retentionPolicy.maxAgeDays,
          source: retentionPolicy.source,
        },
      });
      return NextResponse.json({
        ok: true,
        retentionPolicy,
        pruneAudit,
      });
    }

    if (body.action === 'dry-run-prune') {
      const prune = await pruneScriptRuntimeFaultLedgerSnapshots({
        dryRun: true,
        actorId: user.id,
        reason: 'manual-dry-run',
      });
      const pruneAudit = await listScriptRuntimeFaultLedgerPruneAudits(10);
      const snapshots = await listScriptRuntimeFaultLedgerSnapshots(readLimit(request));
      await recordRuntimeForensicsAudit({
        request,
        userId: user.id,
        action: 'prune_dry_run',
        status: 'allowed',
        metadata: {
          wouldDelete: prune.wouldDelete,
          retained: prune.retained,
          auditId: prune.auditId,
        },
      });
      return NextResponse.json({
        ok: true,
        prune,
        retentionPolicy: prune.policy,
        pruneAudit,
        snapshots,
      });
    }

    if (body.action === 'prune') {
      const prune = await pruneScriptRuntimeFaultLedgerSnapshots({
        actorId: user.id,
        reason: 'manual-prune',
      });
      const snapshots = await listScriptRuntimeFaultLedgerSnapshots(readLimit(request));
      const pruneAudit = await listScriptRuntimeFaultLedgerPruneAudits(10);
      await recordRuntimeForensicsAudit({
        request,
        userId: user.id,
        action: 'prune_execute',
        status: 'allowed',
        metadata: {
          deleted: prune.deleted,
          wouldDelete: prune.wouldDelete,
          retained: prune.retained,
          auditId: prune.auditId,
        },
      });
      return NextResponse.json({
        ok: true,
        prune,
        retentionPolicy: prune.policy,
        pruneAudit,
        snapshots,
      });
    }

    const snapshot = await putScriptRuntimeFaultLedgerSnapshot({
      instanceId: body.instanceId || user.sessionId || user.id,
      sessionId: user.sessionId || null,
      playState: body.playState,
      generatedAt: body.generatedAt,
      items: Array.isArray(body.items) ? body.items : [],
    });
    const history = await listScriptRuntimeFaultLedgerSnapshots(50);
    const reappearedP0Targets = findReappearedP0Targets(history);
    if (reappearedP0Targets.length > 0) {
      engineTelemetry.recordRuntimeForensicsEvent({
        action: 'p0_reappeared',
        p0ReappearedCount: reappearedP0Targets.length,
        targets: reappearedP0Targets.slice(0, 5).join('|'),
      });
    }

    return NextResponse.json({
      ok: true,
      snapshot,
      retentionPolicy: await getConfiguredScriptRuntimeFaultLedgerRetentionPolicy(),
    });
  } catch (error) {
    if (isAuthError(error)) {
      return authErrorToResponse(error);
    }
    console.error('[scripts][runtime][fault-ledger] persist failed:', error);
    return NextResponse.json(
      { error: SCRIPT_RUNTIME_FAULT_LEDGER_FAILED_MESSAGE },
      { status: 500 }
    );
  }
}
