import { NextRequest, NextResponse } from 'next/server';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import {
  acknowledgeScriptRuntimeForensicsAdminNotification,
  getScriptRuntimeForensicsAdminNotificationRetentionPolicy,
  listScriptRuntimeForensicsAdminNotifications,
  pruneScriptRuntimeForensicsAdminNotifications,
  putScriptRuntimeForensicsAdminNotification,
  scriptRuntimeForensicsAdminNotificationsToCsv,
  type ScriptRuntimeForensicsAdminNotification,
  type ScriptRuntimeForensicsAdminNotificationRetentionPolicy,
} from '@/lib/server/script-runtime-artifacts';
import {
  getRuntimeForensicsWebhookConfig,
  sendRuntimeForensicsWebhook,
} from '@/lib/server/runtime-forensics-webhook';

function readLimit(request: NextRequest): number {
  const value = Number(new URL(request.url).searchParams.get('limit') || 50);
  if (!Number.isFinite(value)) return 50;
  return Math.max(1, Math.min(100, Math.round(value)));
}

function asNotification(
  input: unknown,
  createdBy: string
): Partial<ScriptRuntimeForensicsAdminNotification> {
  const data = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  return {
    id: typeof data.id === 'string' ? data.id : undefined,
    alertId: typeof data.alertId === 'string' ? data.alertId : undefined,
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : undefined,
    acknowledgedAt: typeof data.acknowledgedAt === 'string' ? data.acknowledgedAt : null,
    level: data.level === 'warning' ? 'warning' : 'critical',
    indicator: typeof data.indicator === 'string' ? data.indicator : undefined,
    title: typeof data.title === 'string' ? data.title : undefined,
    message: typeof data.message === 'string' ? data.message : undefined,
    current: Number(data.current),
    objective: Number(data.objective),
    source:
      data.source === 'manual' || data.source === 'imported' || data.source === 'slo'
        ? data.source
        : 'slo',
    createdBy,
    acknowledgedBy: typeof data.acknowledgedBy === 'string' ? data.acknowledgedBy : null,
  };
}

function readRetentionPolicy(input: unknown): Partial<ScriptRuntimeForensicsAdminNotificationRetentionPolicy> {
  const data = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const policy = data.retentionPolicy && typeof data.retentionPolicy === 'object'
    ? data.retentionPolicy as Record<string, unknown>
    : data;
  const maxNotifications = Number(policy.maxNotifications);
  const maxAgeDays = Number(policy.maxAgeDays);
  return {
    ...(Number.isFinite(maxNotifications) ? { maxNotifications } : {}),
    ...(Number.isFinite(maxAgeDays) ? { maxAgeDays } : {}),
    source: 'request',
  };
}

export async function GET(request: NextRequest) {
  try {
    await requireSession(request, 'EDITOR');
    const searchParams = new URL(request.url).searchParams;
    const notifications = await listScriptRuntimeForensicsAdminNotifications(readLimit(request));
    const retentionPolicy = getScriptRuntimeForensicsAdminNotificationRetentionPolicy();
    const webhook = await getRuntimeForensicsWebhookConfig();
    const format = searchParams.get('format');

    if (format === 'csv') {
      return new Response(scriptRuntimeForensicsAdminNotificationsToCsv(notifications), {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': 'attachment; filename="runtime-forensics-admin-notifications.csv"',
        },
      });
    }

    if (format === 'json') {
      return new Response(
        JSON.stringify(
          {
            ok: true,
            exportedAt: new Date().toISOString(),
            retentionPolicy,
            webhook,
            notificationCount: notifications.length,
            notifications,
          },
          null,
          2
        ),
        {
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'content-disposition': 'attachment; filename="runtime-forensics-admin-notifications.json"',
          },
        }
      );
    }

    return NextResponse.json({
      ok: true,
      retentionPolicy,
      webhook,
      notificationCount: notifications.length,
      notifications,
    });
  } catch (error) {
    return authErrorToResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSession(request, 'EDITOR');
    const body = await request.json().catch(() => null) as {
      action?: string;
      id?: string;
      ids?: string[];
      notification?: unknown;
    } | null;

    if (body?.action === 'acknowledge') {
      const id = String(body.id || '').trim();
      if (!id) {
        return NextResponse.json({ error: 'notification id requerido.' }, { status: 400 });
      }
      const notification = await acknowledgeScriptRuntimeForensicsAdminNotification({
        id,
        acknowledgedBy: user.id,
      });
      return NextResponse.json({
        ok: true,
        notification,
        notifications: await listScriptRuntimeForensicsAdminNotifications(50),
      });
    }

    if (body?.action === 'acknowledge-all') {
      const requestedIds = Array.isArray(body.ids)
        ? body.ids.map((id) => String(id).trim()).filter(Boolean)
        : [];
      const source =
        requestedIds.length > 0
          ? requestedIds
          : (await listScriptRuntimeForensicsAdminNotifications(100))
              .filter((notification) => !notification.acknowledgedAt)
              .map((notification) => notification.id);
      const acknowledged = await Promise.all(
        source.map((id) =>
          acknowledgeScriptRuntimeForensicsAdminNotification({
            id,
            acknowledgedBy: user.id,
          })
        )
      );
      return NextResponse.json({
        ok: true,
        acknowledgedCount: acknowledged.filter(Boolean).length,
        notifications: await listScriptRuntimeForensicsAdminNotifications(50),
      });
    }

    if (body?.action === 'dry-run-prune' || body?.action === 'prune') {
      const prune = await pruneScriptRuntimeForensicsAdminNotifications({
        dryRun: body.action === 'dry-run-prune',
        policy: readRetentionPolicy(body),
      });
      return NextResponse.json({
        ok: true,
        prune,
        retentionPolicy: prune.policy,
        notifications: await listScriptRuntimeForensicsAdminNotifications(50),
      });
    }

    const notificationInput = asNotification(body?.notification || body, user.id);
    const notification = await putScriptRuntimeForensicsAdminNotification(
      notificationInput
    );
    const webhook = await sendRuntimeForensicsWebhook({ notification });
    return NextResponse.json({
      ok: true,
      notification,
      webhook,
      notifications: await listScriptRuntimeForensicsAdminNotifications(50),
    });
  } catch (error) {
    return authErrorToResponse(error);
  }
}
