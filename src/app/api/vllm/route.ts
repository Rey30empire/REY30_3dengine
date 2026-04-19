// ============================================
// vLLM API Route (BYOK per-user, local provider)
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import {
  getStoredLocalProviderBaseUrl,
  isLocalProviderConfigError,
  resolveEnabledLocalProviderBaseUrl,
} from '@/lib/security/local-provider-policy';
import { getUserScopedConfig, touchProviderUsage } from '@/lib/security/user-api-config';
import {
  createCorrelationId,
  logErrorWithCorrelation,
  publicErrorResponse,
} from '@/lib/security/public-error';
import { fetchRemoteJson, fetchRemoteText, RemoteFetchError } from '@/lib/security/remote-fetch';

type ProviderRequestBody = {
  action?: string;
  model?: string;
  messages?: Array<{ role: string; content: string }>;
  prompt?: string;
  temperature?: number;
  maxTokens?: number;
};

type VllmConfig = {
  userId: string;
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
};

function getHeaders(apiKey?: string): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  return headers;
}

async function resolveProviderConfig(request: NextRequest): Promise<VllmConfig> {
  const user = await requireSession(request, 'VIEWER');
  const scoped = await getUserScopedConfig(user.id);
  const provider = scoped.localConfig.vllm;
  const enabled = !!provider.enabled;
  const baseUrl = enabled
    ? resolveEnabledLocalProviderBaseUrl('vllm', provider.baseUrl)
    : getStoredLocalProviderBaseUrl('vllm', provider.baseUrl);

  return {
    userId: user.id,
    enabled,
    baseUrl,
    apiKey: provider.apiKey || '',
    defaultModel: provider.model || 'meta-llama/Llama-3.1-8B-Instruct',
  };
}

function disabledPayload(config: VllmConfig): Record<string, unknown> {
  return {
    configured: false,
    running: false,
    baseUrl: config.baseUrl,
    error: 'vLLM no está habilitado en tu configuración de usuario.',
  };
}

export async function GET(request: NextRequest) {
  const correlationId = createCorrelationId(request);
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  try {
    const config = await resolveProviderConfig(request);
    if (!config.enabled) {
      return NextResponse.json(disabledPayload(config), { status: 200 });
    }

    if (action === 'models') {
      const { response, data } = await fetchRemoteJson<Record<string, unknown>>({
        provider: 'vllm',
        url: `${config.baseUrl}/v1/models`,
        init: {
          headers: getHeaders(config.apiKey),
        },
      });

      if (!response.ok) {
        return publicErrorResponse({
          status: response.status,
          error: 'vLLM respondió con error al listar modelos.',
          code: 'VLLM_UPSTREAM_ERROR',
          correlationId,
        });
      }

      await touchProviderUsage(config.userId, 'vllm');
      return NextResponse.json(data || {});
    }

    const { response } = await fetchRemoteText({
      provider: 'vllm',
      url: `${config.baseUrl}/health`,
    });
    await touchProviderUsage(config.userId, 'vllm');
    return NextResponse.json({
      running: response.ok,
      configured: true,
      baseUrl: config.baseUrl,
    });
  } catch (error) {
    const text = String(error || '');
    if (text.includes('UNAUTHORIZED') || text.includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    if (isLocalProviderConfigError(error)) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          running: false,
          configured: false,
        },
        { status: 200 }
      );
    }
    if (error instanceof RemoteFetchError) {
      return publicErrorResponse({
        status: 200,
        error: 'No se pudo conectar con VLLM',
        code: error.code,
        correlationId,
        extra: { running: false, configured: true },
      });
    }
    return NextResponse.json(
      { error: 'Failed to connect to VLLM', running: false, configured: true },
      { status: 200 }
    );
  }
}

export async function POST(request: NextRequest) {
  const correlationId = createCorrelationId(request);
  try {
    const config = await resolveProviderConfig(request);
    if (!config.enabled) {
      return NextResponse.json(disabledPayload(config), { status: 401 });
    }

    const body = await request.json() as ProviderRequestBody;
    const { action, model, messages, prompt } = body;

    switch (action) {
      case 'chat': {
        const { response: chatResponse, data } = await fetchRemoteJson<Record<string, any>>({
          provider: 'vllm',
          url: `${config.baseUrl}/v1/chat/completions`,
          init: {
            method: 'POST',
            headers: getHeaders(config.apiKey),
            body: JSON.stringify({
              model: model || config.defaultModel,
              messages,
              temperature: body.temperature ?? 0.7,
              max_tokens: body.maxTokens ?? 2048,
              stream: false,
            }),
          },
        });

        if (!chatResponse.ok) {
          return publicErrorResponse({
            status: chatResponse.status,
            error: 'vLLM devolvió error en chat.',
            code: 'VLLM_UPSTREAM_ERROR',
            correlationId,
          });
        }

        const chatData = data || {};
        await touchProviderUsage(config.userId, 'vllm');
        return NextResponse.json(chatData);
      }

      case 'complete': {
        const { response: compResponse, data } = await fetchRemoteJson<Record<string, any>>({
          provider: 'vllm',
          url: `${config.baseUrl}/v1/completions`,
          init: {
            method: 'POST',
            headers: getHeaders(config.apiKey),
            body: JSON.stringify({
              model: model || config.defaultModel,
              prompt,
              temperature: body.temperature ?? 0.7,
              max_tokens: body.maxTokens ?? 2048,
            }),
          },
        });

        if (!compResponse.ok) {
          return publicErrorResponse({
            status: compResponse.status,
            error: 'vLLM devolvió error en completion.',
            code: 'VLLM_UPSTREAM_ERROR',
            correlationId,
          });
        }

        const compData = data || {};
        await touchProviderUsage(config.userId, 'vllm');
        return NextResponse.json(compData);
      }

      case 'embed': {
        const { response: embedResponse, data } = await fetchRemoteJson<Record<string, any>>({
          provider: 'vllm',
          url: `${config.baseUrl}/v1/embeddings`,
          init: {
            method: 'POST',
            headers: getHeaders(config.apiKey),
            body: JSON.stringify({
              model: model || 'BAAI/bge-large-en-v1.5',
              input: prompt,
            }),
          },
        });

        if (!embedResponse.ok) {
          return publicErrorResponse({
            status: embedResponse.status,
            error: 'vLLM devolvió error en embeddings.',
            code: 'VLLM_UPSTREAM_ERROR',
            correlationId,
          });
        }

        const embedData = data || {};
        await touchProviderUsage(config.userId, 'vllm');
        return NextResponse.json(embedData);
      }

      default:
        return NextResponse.json(
          { error: 'Unknown action' },
          { status: 400 }
        );
    }
  } catch (error) {
    const text = String(error || '');
    if (text.includes('UNAUTHORIZED') || text.includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    if (isLocalProviderConfigError(error)) {
      return publicErrorResponse({
        status: error.status,
        error: error.message,
        code: error.code,
        correlationId,
      });
    }
    if (error instanceof RemoteFetchError) {
      return publicErrorResponse({
        status: error.status,
        error: 'No se pudo conectar con VLLM.',
        code: error.code,
        correlationId,
      });
    }
    logErrorWithCorrelation('api.vllm.post', correlationId, error);
    return publicErrorResponse({
      status: 500,
      error: 'Error interno en VLLM.',
      code: 'VLLM_INTERNAL_ERROR',
      correlationId,
    });
  }
}
