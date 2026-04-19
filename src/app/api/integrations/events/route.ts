import { NextRequest, NextResponse } from 'next/server';
import { logSecurityEvent } from '@/lib/security/auth';
import {
  authenticateIntegrationRequest,
  integrationAuthErrorToResponse,
} from '@/lib/security/integration-auth';
import { persistIntegrationEvent } from '@/lib/server/external-integration-store';

export const dynamic = 'force-dynamic';

type IntegrationEventBody = {
  eventType?: string;
  source?: string;
  payload?: unknown;
  idempotencyKey?: string;
};

function normalizeEventType(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .slice(0, 80);
}

function parseBody(rawBody: string): IntegrationEventBody {
  if (!rawBody.trim()) return {};
  try {
    return JSON.parse(rawBody) as IntegrationEventBody;
  } catch {
    throw new Error('INVALID_JSON');
  }
}

export async function POST(request: NextRequest) {
  let integrationId = '';
  try {
    const rawBody = await request.text();
    const integration = await authenticateIntegrationRequest({
      request,
      rawBody,
      requiredScope: 'events:write',
    });
    integrationId = integration.id;

    const body = parseBody(rawBody);
    const eventType = normalizeEventType(body.eventType);
    if (!eventType) {
      await logSecurityEvent({
        request,
        action: 'integration.events.write',
        target: integration.id,
        status: 'denied',
        metadata: { reason: 'missing_event_type' },
      });
      return NextResponse.json(
        { error: 'eventType es obligatorio.', code: 'missing_event_type' },
        { status: 400 }
      );
    }

    const persisted = await persistIntegrationEvent({
      integrationId: integration.id,
      eventType,
      source: String(body.source || ''),
      payload: body.payload,
      idempotencyKey: String(body.idempotencyKey || ''),
      rawBody,
    });

    await logSecurityEvent({
      request,
      action: 'integration.events.write',
      target: integration.id,
      status: 'allowed',
      metadata: {
        eventType,
        source: String(body.source || '').slice(0, 120),
        idempotencyKey: String(body.idempotencyKey || '').slice(0, 120),
        bodySizeBytes: Buffer.byteLength(rawBody, 'utf8'),
        recordId: persisted.record.id,
        duplicate: persisted.duplicate,
      },
    });

    return NextResponse.json({
      ok: true,
      accepted: true,
      alreadyAccepted: persisted.duplicate,
      integrationId: integration.id,
      scope: 'events:write',
      eventType,
      recordId: persisted.record.id,
      receivedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (String(error).includes('INVALID_JSON')) {
      await logSecurityEvent({
        request,
        action: 'integration.events.write',
        target: integrationId || null,
        status: 'denied',
        metadata: { reason: 'invalid_json' },
      });
      return NextResponse.json(
        { error: 'JSON inválido.', code: 'invalid_json' },
        { status: 400 }
      );
    }

    await logSecurityEvent({
      request,
      action: 'integration.events.write',
      target: integrationId || null,
      status: 'denied',
      metadata: { reason: String(error) },
    });
    return integrationAuthErrorToResponse(error);
  }
}
