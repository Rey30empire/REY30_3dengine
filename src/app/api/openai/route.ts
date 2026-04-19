// ============================================
// OpenAI API Route
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

type OpenAIRequestBody = {
  action?: 'chat' | 'vision' | 'image' | 'video' | 'videoStatus';
  model?: string;
  prompt?: string;
  imageUrl?: string;
  imageBase64?: string;
  messages?: Array<{ role: string; content: string }>;
  size?: string;
  quality?: 'low' | 'medium' | 'high' | 'auto';
  background?: 'transparent' | 'opaque' | 'auto';
  videoId?: string;
  duration?: number;
};

function buildHeaders(config: {
  apiKey: string;
  organization?: string;
  project?: string;
}): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.apiKey}`,
  };

  if (config.organization) {
    headers['OpenAI-Organization'] = config.organization;
  }

  if (config.project) {
    headers['OpenAI-Project'] = config.project;
  }

  return headers;
}

function extractResponseText(payload: Record<string, any>): string {
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text;
  }

  if (Array.isArray(payload.output)) {
    const parts = payload.output
      .flatMap((item: Record<string, any>) => item.content || [])
      .filter((item: Record<string, any>) => item.type === 'output_text')
      .map((item: Record<string, any>) => item.text)
      .filter(Boolean);

    if (parts.length > 0) {
      return parts.join('\n');
    }
  }

  if (Array.isArray(payload.choices)) {
    const message = payload.choices[0]?.message?.content;
    if (typeof message === 'string') {
      return message;
    }
  }

  return '';
}

function buildChatInput(messages: Array<{ role: string; content: string }>) {
  return messages.map((message) => ({
    role: message.role,
    content: [
      {
        type: 'input_text',
        text: message.content,
      },
    ],
  }));
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

function normalizeVideoUrl(payload: Record<string, any>): string {
  if (typeof payload.url === 'string' && payload.url.trim()) {
    return payload.url;
  }
  if (Array.isArray(payload.output) && typeof payload.output[0]?.url === 'string') {
    return payload.output[0].url;
  }
  return '';
}

export async function GET(request: NextRequest) {
  const correlationId = createCorrelationId(request);
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const videoId = searchParams.get('videoId');

  try {
    const user = await requireSession(request, 'VIEWER');
    const scoped = await getUserScopedConfig(user.id);
    const openai = scoped.apiConfig.openai;
    const config = {
      apiKey: openai.apiKey || '',
      baseUrl: openai.baseUrl || 'https://api.openai.com/v1',
      organization: openai.organization || '',
      project: openai.project || '',
    };

    if (!config.apiKey || !openai.enabled) {
      return NextResponse.json(
        { configured: false, available: false },
        { status: 200 }
      );
    }

    if (action === 'videoStatus' && videoId) {
      const { response, data } = await fetchRemoteJson<Record<string, unknown>>({
        provider: 'openai',
        url: `${config.baseUrl}/videos/${videoId}`,
        init: {
          headers: buildHeaders(config),
        },
      });
      await touchProviderUsage(user.id, 'openai');
      const payload = (data || {}) as Record<string, any>;
      const url = normalizeVideoUrl(payload);
      const status = url
        ? 'completed'
        : normalizeTaskStatus(String(payload.status || payload.state || 'processing'));
      await upsertProviderJobRecord({
        provider: 'openai',
        userId: user.id,
        projectKey: normalizeProjectKey(request.headers.get('x-rey30-project')) || 'untitled_project',
        action: 'video',
        remoteTaskId: videoId,
        status,
        result: {
          url: url || undefined,
          rawStatus: String(payload.status || payload.state || ''),
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
    }

    return NextResponse.json({
      configured: true,
      available: true,
    });
  } catch (error) {
    if (error instanceof RemoteFetchError) {
      return publicErrorResponse({
        status: error.status,
        error: 'No se pudo consultar el estado de OpenAI.',
        code: error.code,
        correlationId,
        extra: { configured: false },
      });
    }
    return NextResponse.json({
      configured: false,
      available: false,
    }, { status: 200 });
  }
}

export async function POST(request: NextRequest) {
  const correlationId = createCorrelationId(request);
  try {
    const user = await requireSession(request, 'VIEWER');
    const scoped = await getUserScopedConfig(user.id);
    const body = await request.json() as OpenAIRequestBody;
    const action = body.action || 'chat';
    const projectKey = normalizeProjectKey(request.headers.get('x-rey30-project'));
    const openai = scoped.apiConfig.openai;
    const config = {
      apiKey: openai.apiKey || '',
      baseUrl: openai.baseUrl || 'https://api.openai.com/v1',
      organization: openai.organization || '',
      project: openai.project || '',
    };

    if (!config.apiKey || !openai.enabled) {
      await logSecurityEvent({
        request,
        userId: user.id,
        action: 'provider.openai.use',
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
      case 'chat': {
        await assertUsageAllowed({ userId: user.id, provider: 'openai', action: 'chat' });
        const { response, data } = await fetchRemoteJson<Record<string, any>>({
          provider: 'openai',
          url: `${config.baseUrl}/responses`,
          init: {
            method: 'POST',
            headers: buildHeaders(config),
            body: JSON.stringify({
              model: body.model || openai.textModel || 'gpt-4.1-mini',
              input: buildChatInput(body.messages || [
                {
                  role: 'user',
                  content: body.prompt || '',
                },
              ]),
            }),
          },
        });
        const payload = data || {};
        if (response.ok) {
          await Promise.all([
            touchProviderUsage(user.id, 'openai'),
            recordUsage({ userId: user.id, provider: 'openai', action: 'chat' }),
            recordProjectUsage({
              userId: user.id,
              provider: 'openai',
              action: 'chat',
              projectKey,
            }),
          ]);
        }
        return NextResponse.json(
          {
            success: response.ok,
            text: extractResponseText(payload),
          },
          { status: response.status }
        );
      }

      case 'vision': {
        await assertUsageAllowed({ userId: user.id, provider: 'openai', action: 'vision' });
        const { response, data } = await fetchRemoteJson<Record<string, any>>({
          provider: 'openai',
          url: `${config.baseUrl}/responses`,
          init: {
            method: 'POST',
            headers: buildHeaders(config),
            body: JSON.stringify({
              model: body.model || openai.multimodalModel || 'gpt-4.1-mini',
              input: [
                {
                  role: 'user',
                  content: [
                    {
                      type: 'input_text',
                      text: body.prompt || 'Describe this image.',
                    },
                    body.imageBase64
                      ? {
                          type: 'input_image',
                          image_url: body.imageBase64,
                        }
                      : {
                          type: 'input_image',
                          image_url: body.imageUrl,
                        },
                  ],
                },
              ],
            }),
          },
        });
        const payload = data || {};
        if (response.ok) {
          await Promise.all([
            touchProviderUsage(user.id, 'openai'),
            recordUsage({ userId: user.id, provider: 'openai', action: 'vision' }),
            recordProjectUsage({
              userId: user.id,
              provider: 'openai',
              action: 'vision',
              projectKey,
            }),
          ]);
        }
        return NextResponse.json(
          {
            success: response.ok,
            text: extractResponseText(payload),
          },
          { status: response.status }
        );
      }

      case 'image': {
        await assertUsageAllowed({ userId: user.id, provider: 'openai', action: 'image' });
        const { response, data } = await fetchRemoteJson<Record<string, any>>({
          provider: 'openai',
          url: `${config.baseUrl}/images/generations`,
          init: {
            method: 'POST',
            headers: buildHeaders(config),
            body: JSON.stringify({
              model: body.model || openai.imageModel || 'gpt-image-1',
              prompt: body.prompt,
              size: body.size || openai.imageSize || '1024x1024',
              quality: body.quality || 'auto',
              background: body.background || 'auto',
            }),
          },
          maxBytes: 12 * 1024 * 1024,
        });
        const payload = data || {};
        if (response.ok) {
          await Promise.all([
            touchProviderUsage(user.id, 'openai'),
            recordUsage({ userId: user.id, provider: 'openai', action: 'image' }),
            recordProjectUsage({
              userId: user.id,
              provider: 'openai',
              action: 'image',
              projectKey,
            }),
          ]);
        }
        const imageResult = Array.isArray(payload.data) ? payload.data[0] : null;
        const dataUrl = imageResult?.b64_json
          ? `data:image/png;base64,${imageResult.b64_json}`
          : imageResult?.url || '';

        return NextResponse.json(
          {
            success: response.ok,
            imageUrl: dataUrl,
            revisedPrompt: imageResult?.revised_prompt || '',
          },
          { status: response.status }
        );
      }

      case 'video': {
        await assertUsageAllowed({ userId: user.id, provider: 'openai', action: 'video' });
        const { response, data } = await fetchRemoteJson<Record<string, any>>({
          provider: 'openai',
          url: `${config.baseUrl}/videos`,
          init: {
            method: 'POST',
            headers: buildHeaders(config),
            body: JSON.stringify({
              model: body.model || openai.videoModel || 'sora-2',
              prompt: body.prompt,
              size: body.size || openai.videoSize || '1280x720',
              duration: body.duration || 5,
            }),
          },
        });
        const payload = data || {};
        if (response.ok) {
          await Promise.all([
            touchProviderUsage(user.id, 'openai'),
            recordUsage({ userId: user.id, provider: 'openai', action: 'video' }),
            recordProjectUsage({
              userId: user.id,
              provider: 'openai',
              action: 'video',
              projectKey,
            }),
          ]);
        }
        const taskId =
          typeof payload.id === 'string'
            ? payload.id
            : typeof payload.taskId === 'string'
              ? payload.taskId
              : typeof payload.videoId === 'string'
                ? payload.videoId
                : '';
        const url = normalizeVideoUrl(payload);
        const status = url
          ? 'completed'
          : normalizeTaskStatus(String(payload.status || payload.state || 'queued'));
        if (response.ok && taskId) {
          await upsertProviderJobRecord({
            provider: 'openai',
            userId: user.id,
            projectKey: projectKey || 'untitled_project',
            action: 'video',
            remoteTaskId: taskId,
            status,
            requestSummary: {
              model: body.model || openai.videoModel || 'sora-2',
              duration: body.duration || 5,
              size: body.size || openai.videoSize || '1280x720',
            },
            result: {
              url: url || undefined,
              rawStatus: String(payload.status || payload.state || ''),
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
        action: 'provider.openai.use',
        status: 'denied',
        metadata: { reason: 'usage_limit_exceeded', correlationId },
      });
      return publicErrorResponse({
        status: 429,
        error: 'Límite de uso/costo excedido para OpenAI en este período.',
        code: 'USAGE_LIMIT_EXCEEDED',
        correlationId,
      });
    }
    if (error instanceof RemoteFetchError) {
      await logSecurityEvent({
        request,
        action: 'provider.openai.use',
        status: 'error',
        metadata: { reason: error.code, correlationId },
      });
      return publicErrorResponse({
        status: error.status,
        error: 'No se pudo completar la solicitud hacia OpenAI.',
        code: error.code,
        correlationId,
      });
    }
    await logSecurityEvent({
      request,
      action: 'provider.openai.use',
      status: 'error',
      metadata: { error: String(error), correlationId },
    });
    logErrorWithCorrelation('api.openai', correlationId, error);
    if (String(error).includes('UNAUTHORIZED')) {
      return NextResponse.json({ error: 'Debes iniciar sesión para usar OpenAI.' }, { status: 401 });
    }
    return publicErrorResponse({
      status: 500,
      error: 'Error interno al procesar OpenAI.',
      code: 'OPENAI_INTERNAL_ERROR',
      correlationId,
    });
  }
}
