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
        { error: 'Meshy API key no configurada para tu cuenta.' },
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
    return NextResponse.json({ success: true, ...result });
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
        baseUrl: DEFAULT_MESHY_API_URL,
        error: 'Usuario no autenticado',
      });
    }

    if (!taskId) {
      return NextResponse.json({
        configured: !!config.apiKey && config.enabled,
        baseUrl: config.baseUrl,
      });
    }

    if (!config.apiKey || !config.enabled) {
      return NextResponse.json(
        { error: 'Meshy API key not configured' },
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
    return NextResponse.json(result);
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
