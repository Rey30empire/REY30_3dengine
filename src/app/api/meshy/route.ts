// ============================================
// Meshy AI API Endpoint (BYOK per-user)
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
import { fetchRemoteText, RemoteFetchError } from '@/lib/security/remote-fetch';
import { upsertProviderJobRecord } from '@/lib/server/external-integration-store';

const DEFAULT_MESHY_API_URL = 'https://api.meshy.ai/v2';

async function resolveMeshyConfig(request: NextRequest): Promise<{
  userId: string;
  apiKey: string;
  baseUrl: string;
  enabled: boolean;
}> {
  const user = await requireSession(request, 'VIEWER');
  const scoped = await getUserScopedConfig(user.id);
  return {
    userId: user.id,
    apiKey: scoped.apiConfig.meshy.apiKey || '',
    baseUrl: scoped.apiConfig.meshy.baseUrl || DEFAULT_MESHY_API_URL,
    enabled: !!scoped.apiConfig.meshy.enabled,
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

// POST - Create new 3D model generation task
export async function POST(request: NextRequest) {
  const correlationId = createCorrelationId(request);
  try {
    const config = await resolveMeshyConfig(request);

    if (!config.apiKey || !config.enabled) {
      await logSecurityEvent({
        request,
        userId: config.userId,
        action: 'provider.meshy.use',
        status: 'denied',
        metadata: { reason: 'missing_api_key_or_disabled' },
      });
      return NextResponse.json(
        { error: 'El servicio no está disponible para esta sesión.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const projectKey = normalizeProjectKey(request.headers.get('x-rey30-project'));
    const {
      mode,
      prompt,
      art_style,
      negative_prompt,
      preview_task_id,
      image_url,
      topology,
      target_face_count,
      enable_pbr,
    } = body;
    const usageAction = mode === 'refine' ? 'refine' : 'preview';

    await assertUsageAllowed({
      userId: config.userId,
      provider: 'meshy',
      action: usageAction,
    });

    let endpoint = `${config.baseUrl}/text-to-3d`;
    let payload: Record<string, unknown> = {};

    if (mode === 'preview' && prompt) {
      payload = {
        mode: 'preview',
        prompt,
        art_style: art_style || 'realistic',
        negative_prompt: negative_prompt || 'blurry, low quality, distorted',
      };
    } else if (mode === 'refine' && preview_task_id) {
      payload = {
        mode: 'refine',
        preview_task_id,
        topology: topology || 'triangle',
        target_face_count: target_face_count || 3000,
        enable_pbr: enable_pbr !== false,
      };
    } else if (image_url) {
      endpoint = `${config.baseUrl}/image-to-3d`;
      payload = {
        image_url,
        mode: 'preview',
      };
    } else {
      return NextResponse.json(
        { error: 'Request inválido: prompt (preview) o preview_task_id (refine) requerido.' },
        { status: 400 }
      );
    }

    const { response, text } = await fetchRemoteText({
      provider: 'meshy',
      url: endpoint,
      init: {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
    });

    if (!response.ok) {
      await logSecurityEvent({
        request,
        userId: config.userId,
        action: 'provider.meshy.use',
        target: mode || 'unknown',
        status: 'error',
        metadata: { status: response.status, correlationId },
      });
      return publicErrorResponse({
        status: response.status,
        error: 'Meshy devolvió un error al procesar la solicitud.',
        code: 'MESHY_UPSTREAM_ERROR',
        correlationId,
      });
    }

    const result = text.trim() ? JSON.parse(text) : {};
    await Promise.all([
      touchProviderUsage(config.userId, 'meshy'),
      recordUsage({ userId: config.userId, provider: 'meshy', action: usageAction }),
      recordProjectUsage({
        userId: config.userId,
        provider: 'meshy',
        action: usageAction,
        projectKey,
      }),
    ]);
    const taskId =
      typeof result.result === 'string'
        ? result.result
        : typeof result.id === 'string'
          ? result.id
          : typeof result.taskId === 'string'
            ? result.taskId
            : '';
    const status = normalizeTaskStatus(String(result.status || 'queued'));
    if (taskId) {
      await upsertProviderJobRecord({
        provider: 'meshy',
        userId: config.userId,
        projectKey: projectKey || 'untitled_project',
        action: usageAction,
        remoteTaskId: taskId,
        status,
        requestSummary: {
          mode: mode || (image_url ? 'image_to_3d' : 'preview'),
          topology: topology || undefined,
          targetFaceCount: target_face_count || undefined,
          enablePbr: enable_pbr !== false,
        },
        result: {
          rawStatus: String(result.status || ''),
        },
      });
    }
    return NextResponse.json({
      success: true,
      status,
      taskId: taskId || undefined,
    });
  } catch (error) {
    if (isUsageLimitError(error)) {
      await logSecurityEvent({
        request,
        action: 'provider.meshy.use',
        status: 'denied',
        metadata: { reason: 'usage_limit_exceeded', correlationId },
      });
      return publicErrorResponse({
        status: 429,
        error: 'Límite de uso/costo excedido para Meshy en este período.',
        code: 'USAGE_LIMIT_EXCEEDED',
        correlationId,
      });
    }
    if (String(error).includes('UNAUTHORIZED')) {
      return NextResponse.json(
        { error: 'Debes iniciar sesión para usar Meshy.' },
        { status: 401 }
      );
    }
    if (error instanceof RemoteFetchError) {
      await logSecurityEvent({
        request,
        action: 'provider.meshy.use',
        status: 'error',
        metadata: { reason: error.code, correlationId },
      });
      return publicErrorResponse({
        status: error.status,
        error: 'No se pudo conectar con Meshy.',
        code: error.code,
        correlationId,
      });
    }

    await logSecurityEvent({
      request,
      action: 'provider.meshy.use',
      status: 'error',
      metadata: { error: String(error), correlationId },
    });
    logErrorWithCorrelation('api.meshy.post', correlationId, error);
    return publicErrorResponse({
      status: 500,
      error: 'Error interno al usar Meshy.',
      code: 'MESHY_INTERNAL_ERROR',
      correlationId,
    });
  }
}

// GET - Check task status
export async function GET(request: NextRequest) {
  const correlationId = createCorrelationId(request);
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');

    let config;
    try {
      config = await resolveMeshyConfig(request);
    } catch {
      return NextResponse.json({
        configured: false,
        available: false,
      });
    }

    if (!taskId) {
      return NextResponse.json({
        configured: !!config.apiKey && config.enabled,
        available: !!config.apiKey && config.enabled,
      });
    }

    if (!config.apiKey || !config.enabled) {
      return NextResponse.json(
        { error: 'El servicio no está disponible para esta sesión.' },
        { status: 401 }
      );
    }

    const endpoint = `${config.baseUrl}/text-to-3d/${taskId}`;
    const { response, text } = await fetchRemoteText({
      provider: 'meshy',
      url: endpoint,
      init: {
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
        },
      },
    });

    if (!response.ok) {
      return publicErrorResponse({
        status: response.status,
        error: 'Meshy devolvió un error al consultar el estado.',
        code: 'MESHY_UPSTREAM_ERROR',
        correlationId,
      });
    }

    const result = text.trim() ? JSON.parse(text) : {};
    await touchProviderUsage(config.userId, 'meshy');
    const url =
      typeof result.model_urls?.glb === 'string'
        ? result.model_urls.glb
        : typeof result.url === 'string'
          ? result.url
          : '';
    const thumbnailUrl = typeof result.thumbnail_url === 'string' ? result.thumbnail_url : '';
    const status = url
      ? 'completed'
      : normalizeTaskStatus(String(result.status || result.state || 'processing'));
    await upsertProviderJobRecord({
      provider: 'meshy',
      userId: config.userId,
      projectKey: normalizeProjectKey(request.headers.get('x-rey30-project')) || 'untitled_project',
      action: 'status',
      remoteTaskId: taskId,
      status,
      result: {
        url: url || undefined,
        thumbnailUrl: thumbnailUrl || undefined,
        progress: typeof result.progress === 'number' ? result.progress : undefined,
        rawStatus: String(result.status || result.state || ''),
      },
    });
    return NextResponse.json({
      success: true,
      status,
      progress: typeof result.progress === 'number' ? result.progress : undefined,
      url: url || undefined,
      thumbnailUrl: thumbnailUrl || undefined,
    });
  } catch (error) {
    if (error instanceof RemoteFetchError) {
      return publicErrorResponse({
        status: error.status,
        error: 'No se pudo consultar Meshy.',
        code: error.code,
        correlationId,
      });
    }
    logErrorWithCorrelation('api.meshy.get', correlationId, error);
    return publicErrorResponse({
      status: 500,
      error: 'Error interno al consultar Meshy.',
      code: 'MESHY_INTERNAL_ERROR',
      correlationId,
    });
  }
}
