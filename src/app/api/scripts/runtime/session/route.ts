import { NextRequest, NextResponse } from 'next/server';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import {
  registerScriptRuntimeHeartbeat,
  summarizeScriptRuntimeLiveSessions,
  type ScriptRuntimePlayState,
} from '@/lib/server/script-runtime-live-sessions';

const INVALID_INSTANCE_MESSAGE = 'La instancia del runtime no es válida.';
const HEARTBEAT_FAILED_MESSAGE = 'No se pudo registrar el heartbeat del runtime.';

function isAuthError(error: unknown): boolean {
  const message = String(error);
  return message.includes('UNAUTHORIZED') || message.includes('FORBIDDEN');
}

function readPlayState(value: unknown): ScriptRuntimePlayState {
  return value === 'PLAYING' || value === 'PAUSED' || value === 'IDLE' ? value : 'IDLE';
}

function readCount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0;
}

function readScriptIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
    )
  ).slice(0, 12);
}

function readInstanceId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{5,127}$/.test(normalized)) {
    return null;
  }
  return normalized;
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSession(request, 'EDITOR');
    const body = (await request.json().catch(() => ({}))) as {
      instanceId?: unknown;
      playState?: unknown;
      activeEntityScripts?: unknown;
      activeScribNodes?: unknown;
      activeScriptIds?: unknown;
    };

    const instanceId = readInstanceId(body.instanceId);
    if (!instanceId) {
      return NextResponse.json({ error: INVALID_INSTANCE_MESSAGE }, { status: 400 });
    }

    const registration = await registerScriptRuntimeHeartbeat({
      instanceId,
      sessionId: user.sessionId,
      userId: user.id,
      playState: readPlayState(body.playState),
      activeEntityScripts: readCount(body.activeEntityScripts),
      activeScribNodes: readCount(body.activeScribNodes),
      activeScriptIds: readScriptIds(body.activeScriptIds),
    });
    const live = await summarizeScriptRuntimeLiveSessions({
      currentSessionId: user.sessionId,
      currentInstanceId: instanceId,
    });

    return NextResponse.json({
      ok: true,
      heartbeatAt: registration.heartbeat.heartbeatAt,
      lease: registration.lease,
      instance: {
        instanceId: registration.heartbeat.instanceId,
        playState: registration.heartbeat.playState,
        activeEntityScripts: registration.heartbeat.activeEntityScripts,
        activeScribNodes: registration.heartbeat.activeScribNodes,
        activeScriptIds: registration.heartbeat.activeScriptIds,
      },
      live,
    });
  } catch (error) {
    if (isAuthError(error)) {
      return authErrorToResponse(error);
    }
    console.error('[scripts/runtime/session][POST] failed:', error);
    return NextResponse.json({ error: HEARTBEAT_FAILED_MESSAGE }, { status: 500 });
  }
}
