// ============================================
// Runway API Route (BYOK per-user)
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { logSecurityEvent, requireSession } from '@/lib/security/auth';
import { getUserScopedConfig, touchProviderUsage } from '@/lib/security/user-api-config';
import { assertUsageAllowed, isUsageLimitError, recordUsage } from '@/lib/security/usage-governance';
import { normalizeProjectKey, recordProjectUsage } from '@/lib/security/usage-finops';
import {
  createCorrelationId,
  logErrorWithCorrelation,
  publicErrorResponse,
} from '@/lib/security/public-error';
import { fetchRemoteJson, RemoteFetchError } from '@/lib/security/remote-fetch';
import { upsertProviderJobRecord } from '@/lib/server/external-integration-store';

type RunwayRequestBody = {
  action?: 'textToVideo' | 'imageToVideo';
  model?: string;
  promptText?: string;
  promptImage?: string;
  duration?: number;
  ratio?: string;
  seed?: number;
};

async function resolveRunwayConfig(request: NextRequest) {
  const user = await requireSession(request, 'VIEWER');
  const scoped = await getUserScopedConfig(user.id);
  const runway = scoped.apiConfig.runway;
  return {
    userId: user.id,
    apiKey: runway.apiKey || '',
    enabled: !!runway.enabled,
    baseUrl: runway.baseUrl || 'https://api.dev.runwayml.com/v1',
    apiVersion: runway.apiVersion || '2024-11-06',
    defaultTextModel: runway.textToVideoModel || 'gen4_turbo',
    defaultImageModel: runway.imageToVideoModel || 'gen4_turbo',
    defaultDuration: runway.duration || 5,
    defaultRatio: runway.ratio || '1280:720',
  };
}

function buildHeaders(config: {
  apiKey: string;
  apiVersion: string;
}): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.apiKey}`,
    'X-Runway-Version': config.apiVersion,
  };
}

function normalizeTaskStatus(raw: string): 'queued' | 'processing' | 'completed' | 'failed' | 'canceled' {
  const value = raw.trim().toLowerCase();
  if (!value) return 'processing';
  if (value.includes('queue') || value.includes('pending')) return 'queued';
  if (value.includes('cancel')) return 'canceled';
  if (value.includes('fail') || value.includes('error')) return 'failed';
  if (value.includes('complete') || value.includes('succeed') || value === 'done') return 'completed';
  return 'processing';
}

function normalizeRunwayUrl(payload: Record<string, any>): string {
  const outputs = Array.isArray(payload.output) ? payload.output : Array.isArray(payload.outputs) ? payload.outputs : [];
  return (
    (typeof outputs[0]?.url === 'string' ? outputs[0].url : '') ||
    (typeof outputs[0] === 'string' ? outputs[0] : '') ||
    (typeof payload.url === 'string' ? payload.url : '')
  );
}

export async function GET(request: NextRequest) {
  const correlationId = createCorrelationId(request);
  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get('taskId');

  try {
    const config = await resolveRunwayConfig(request);

    if (!config.apiKey || !config.enabled) {
      return NextResponse.json(
        { configured: false, available: false },
        { status: 200 }
      );
    }

    if (!taskId) {
      return NextResponse.json({
        configured: true,
        available: true,
      });
    }

    const { response, data } = await fetchRemoteJson<Record<string, unknown>>({
      provider: 'runway',
      url: `${config.baseUrl}/tasks/${taskId}`,
      init: {
        headers: buildHeaders(config),
      },
    });
    await touchProviderUsage(config.userId, 'runway');
    const payload = (data || {}) as Record<string, any>;
    const url = normalizeRunwayUrl(payload);
    const status = url ? 'completed' : normalizeTaskStatus(String(payload.status || 'processing'));
    await upsertProviderJobRecord({
      provider: 'runway',
      userId: config.userId,
      projectKey: normalizeProjectKey(request.headers.get('x-rey30-project')) || 'untitled_project',
      action: 'status',
      remoteTaskId: taskId,
      status,
      result: {
        url: url || undefined,
        rawStatus: String(payload.status || ''),
      },
    });
    return NextResponse.json(
      {
        success: response.ok,
        status,
        url: url || undefined,
      },
      { status: response.status }
    );
  } catch (error) {
    if (error instanceof RemoteFetchError) {
      return publicErrorResponse({
        status: error.status,
        error: 'No se pudo consultar el estado de Runway.',
        code: error.code,
        correlationId,
        extra: { configured: false },
      });
    }
    return NextResponse.json(
      { configured: false, available: false },
      { status: 200 }
    );
  }
}

export async function POST(request: NextRequest) {
  const correlationId = createCorrelationId(request);
  try {
    const body = await request.json() as RunwayRequestBody;
    const action = body.action || 'textToVideo';
    const projectKey = normalizeProjectKey(request.headers.get('x-rey30-project'));
    const config = await resolveRunwayConfig(request);

    if (!config.apiKey || !config.enabled) {
      await logSecurityEvent({
        request,
        userId: config.userId,
        action: 'provider.runway.use',
        target: action,
        status: 'denied',
        metadata: { reason: 'missing_api_key_or_disabled' },
      });
      return NextResponse.json(
        { error: 'El servicio no está disponible para esta sesión.' },
        { status: 401 }
      );
    }

    switch (action) {
      case 'textToVideo': {
        await assertUsageAllowed({
          userId: config.userId,
          provider: 'runway',
          action: 'textToVideo',
        });
        const { response, data } = await fetchRemoteJson<Record<string, any>>({
          provider: 'runway',
          url: `${config.baseUrl}/text_to_video`,
          init: {
            method: 'POST',
            headers: buildHeaders(config),
            body: JSON.stringify({
              model: body.model || config.defaultTextModel,
              promptText: body.promptText,
              ratio: body.ratio || config.defaultRatio,
              duration: body.duration || config.defaultDuration,
              seed: body.seed,
            }),
          },
        });

        const payload = data || {};
        if (response.ok) {
          await Promise.all([
            touchProviderUsage(config.userId, 'runway'),
            recordUsage({ userId: config.userId, provider: 'runway', action: 'textToVideo' }),
            recordProjectUsage({
              userId: config.userId,
              provider: 'runway',
              action: 'textToVideo',
              projectKey,
            }),
          ]);
        }
        const taskId =
          typeof payload.id === 'string'
            ? payload.id
            : typeof payload.taskId === 'string'
              ? payload.taskId
              : '';
        const url = normalizeRunwayUrl(payload);
        const status = url ? 'completed' : normalizeTaskStatus(String(payload.status || 'queued'));
        if (response.ok && taskId) {
          await upsertProviderJobRecord({
            provider: 'runway',
            userId: config.userId,
            projectKey: projectKey || 'untitled_project',
            action: 'textToVideo',
            remoteTaskId: taskId,
            status,
            requestSummary: {
              model: body.model || config.defaultTextModel,
              duration: body.duration || config.defaultDuration,
              ratio: body.ratio || config.defaultRatio,
            },
            result: {
              url: url || undefined,
              rawStatus: String(payload.status || ''),
            },
          });
        }
        return NextResponse.json(
          {
            success: response.ok,
            status,
            taskId: taskId || undefined,
            url: url || undefined,
          },
          { status: response.status }
        );
      }

      case 'imageToVideo': {
        await assertUsageAllowed({
          userId: config.userId,
          provider: 'runway',
          action: 'imageToVideo',
        });
        const { response, data } = await fetchRemoteJson<Record<string, any>>({
          provider: 'runway',
          url: `${config.baseUrl}/image_to_video`,
          init: {
            method: 'POST',
            headers: buildHeaders(config),
            body: JSON.stringify({
              model: body.model || config.defaultImageModel,
              promptText: body.promptText,
              promptImage: body.promptImage,
              ratio: body.ratio || config.defaultRatio,
              duration: body.duration || config.defaultDuration,
              seed: body.seed,
            }),
          },
        });

        const payload = data || {};
        if (response.ok) {
          await Promise.all([
            touchProviderUsage(config.userId, 'runway'),
            recordUsage({ userId: config.userId, provider: 'runway', action: 'imageToVideo' }),
            recordProjectUsage({
              userId: config.userId,
              provider: 'runway',
              action: 'imageToVideo',
              projectKey,
            }),
          ]);
        }
        const taskId =
          typeof payload.id === 'string'
            ? payload.id
            : typeof payload.taskId === 'string'
              ? payload.taskId
              : '';
        const url = normalizeRunwayUrl(payload);
        const status = url ? 'completed' : normalizeTaskStatus(String(payload.status || 'queued'));
        if (response.ok && taskId) {
          await upsertProviderJobRecord({
            provider: 'runway',
            userId: config.userId,
            projectKey: projectKey || 'untitled_project',
            action: 'imageToVideo',
            remoteTaskId: taskId,
            status,
            requestSummary: {
              model: body.model || config.defaultImageModel,
              duration: body.duration || config.defaultDuration,
              ratio: body.ratio || config.defaultRatio,
            },
            result: {
              url: url || undefined,
              rawStatus: String(payload.status || ''),
            },
          });
        }
        return NextResponse.json(
          {
            success: response.ok,
            status,
            taskId: taskId || undefined,
            url: url || undefined,
          },
          { status: response.status }
        );
      }

      default:
        return NextResponse.json(
          { error: 'Unknown action' },
          { status: 400 }
        );
    }
  } catch (error) {
    if (isUsageLimitError(error)) {
      await logSecurityEvent({
        request,
        action: 'provider.runway.use',
        status: 'denied',
        metadata: { reason: 'usage_limit_exceeded', correlationId },
      });
      return publicErrorResponse({
        status: 429,
        error: 'Límite de uso/costo excedido para Runway en este período.',
        code: 'USAGE_LIMIT_EXCEEDED',
        correlationId,
      });
    }
    if (String(error).includes('UNAUTHORIZED')) {
      return NextResponse.json({ error: 'Debes iniciar sesión para usar Runway.' }, { status: 401 });
    }
    if (error instanceof RemoteFetchError) {
      await logSecurityEvent({
        request,
        action: 'provider.runway.use',
        status: 'error',
        metadata: { reason: error.code, correlationId },
      });
      return publicErrorResponse({
        status: error.status,
        error: 'No se pudo completar la solicitud hacia Runway.',
        code: error.code,
        correlationId,
      });
    }

    await logSecurityEvent({
      request,
      action: 'provider.runway.use',
      status: 'error',
      metadata: { error: String(error), correlationId },
    });
    logErrorWithCorrelation('api.runway', correlationId, error);
    return publicErrorResponse({
      status: 500,
      error: 'Error interno al procesar Runway.',
      code: 'RUNWAY_INTERNAL_ERROR',
      correlationId,
    });
  }
}
