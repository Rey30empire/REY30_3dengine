// ============================================
// Ollama API Route (BYOK per-user, local provider)
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import { getUserScopedConfig, touchProviderUsage } from '@/lib/security/user-api-config';
import {
  createCorrelationId,
  logErrorWithCorrelation,
  publicErrorResponse,
} from '@/lib/security/public-error';
import { fetchRemoteJson, RemoteFetchError } from '@/lib/security/remote-fetch';

type ProviderRequestBody = {
  action?: string;
  model?: string;
  messages?: Array<{ role: string; content: string }>;
  prompt?: string;
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
};

type OllamaConfig = {
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

async function resolveProviderConfig(request: NextRequest): Promise<OllamaConfig> {
  const user = await requireSession(request, 'VIEWER');
  const scoped = await getUserScopedConfig(user.id);
  const provider = scoped.localConfig.ollama;

  return {
    userId: user.id,
    enabled: !!provider.enabled,
    baseUrl: provider.baseUrl || 'http://localhost:11434',
    apiKey: provider.apiKey || '',
    defaultModel: provider.model || 'llama3.1',
  };
}

function disabledPayload(config: OllamaConfig): Record<string, unknown> {
  return {
    configured: false,
    running: false,
    baseUrl: config.baseUrl,
    error: 'Ollama no está habilitado en tu configuración de usuario.',
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
        provider: 'ollama',
        url: `${config.baseUrl}/api/tags`,
        init: {
          headers: getHeaders(config.apiKey),
        },
      });

      if (!response.ok) {
        return publicErrorResponse({
          status: response.status,
          error: 'Ollama respondió con error al listar modelos.',
          code: 'OLLAMA_UPSTREAM_ERROR',
          correlationId,
        });
      }

      await touchProviderUsage(config.userId, 'ollama');
      return NextResponse.json(data || {});
    }

    const { response, data } = await fetchRemoteJson<Record<string, unknown>>({
      provider: 'ollama',
      url: `${config.baseUrl}/api/version`,
      init: {
        headers: getHeaders(config.apiKey),
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Ollama not running', running: false, configured: true, baseUrl: config.baseUrl },
        { status: 200 }
      );
    }

    await touchProviderUsage(config.userId, 'ollama');
    return NextResponse.json({ running: true, configured: true, baseUrl: config.baseUrl, ...(data || {}) });
  } catch (error) {
    const text = String(error || '');
    if (text.includes('UNAUTHORIZED') || text.includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    if (error instanceof RemoteFetchError) {
      return publicErrorResponse({
        status: 200,
        error: 'No se pudo conectar con Ollama',
        code: error.code,
        correlationId,
        extra: { running: false, configured: true },
      });
    }
    return NextResponse.json(
      { error: 'Failed to connect to Ollama', running: false, configured: true },
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
    const { action, model, messages, prompt, stream = false } = body;

    switch (action) {
      case 'chat': {
        const { response: chatResponse, data } = await fetchRemoteJson<Record<string, any>>({
          provider: 'ollama',
          url: `${config.baseUrl}/api/chat`,
          init: {
            method: 'POST',
            headers: getHeaders(config.apiKey),
            body: JSON.stringify({
              model: model || config.defaultModel,
              messages,
              stream,
              options: {
                temperature: body.temperature ?? 0.7,
                num_predict: body.maxTokens ?? 2048,
              },
            }),
          },
        });

        if (!chatResponse.ok) {
          return publicErrorResponse({
            status: chatResponse.status,
            error: 'Ollama devolvió error en chat.',
            code: 'OLLAMA_UPSTREAM_ERROR',
            correlationId,
          });
        }

        const chatData = data || {};
        await touchProviderUsage(config.userId, 'ollama');
        return NextResponse.json({
          id: `ollama-${Date.now()}`,
          choices: [
            {
              message: chatData.message,
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: chatData.prompt_eval_count || 0,
            completion_tokens: chatData.eval_count || 0,
            total_tokens: (chatData.prompt_eval_count || 0) + (chatData.eval_count || 0),
          },
        });
      }

      case 'generate': {
        const { response: genResponse, data } = await fetchRemoteJson<Record<string, any>>({
          provider: 'ollama',
          url: `${config.baseUrl}/api/generate`,
          init: {
            method: 'POST',
            headers: getHeaders(config.apiKey),
            body: JSON.stringify({
              model: model || config.defaultModel,
              prompt,
              stream,
              options: {
                temperature: body.temperature ?? 0.7,
                num_predict: body.maxTokens ?? 2048,
              },
            }),
          },
        });

        if (!genResponse.ok) {
          return publicErrorResponse({
            status: genResponse.status,
            error: 'Ollama devolvió error en generación.',
            code: 'OLLAMA_UPSTREAM_ERROR',
            correlationId,
          });
        }

        const genData = data || {};
        await touchProviderUsage(config.userId, 'ollama');
        return NextResponse.json({
          response: genData.response,
          done: genData.done,
        });
      }

      case 'pull': {
        const { response: pullResponse, data } = await fetchRemoteJson<Record<string, any>>({
          provider: 'ollama',
          url: `${config.baseUrl}/api/pull`,
          init: {
            method: 'POST',
            headers: getHeaders(config.apiKey),
            body: JSON.stringify({
              name: model || config.defaultModel,
              stream: false,
            }),
          },
        });

        if (!pullResponse.ok) {
          return publicErrorResponse({
            status: pullResponse.status,
            error: 'Ollama devolvió error al descargar modelo.',
            code: 'OLLAMA_UPSTREAM_ERROR',
            correlationId,
          });
        }

        const pullData = data || {};
        await touchProviderUsage(config.userId, 'ollama');
        return NextResponse.json({
          success: true,
          status: pullData.status,
        });
      }

      case 'embed': {
        const { response: embedResponse, data } = await fetchRemoteJson<Record<string, any>>({
          provider: 'ollama',
          url: `${config.baseUrl}/api/embeddings`,
          init: {
            method: 'POST',
            headers: getHeaders(config.apiKey),
            body: JSON.stringify({
              model: model || 'nomic-embed-text',
              prompt,
            }),
          },
        });

        if (!embedResponse.ok) {
          return publicErrorResponse({
            status: embedResponse.status,
            error: 'Ollama devolvió error en embeddings.',
            code: 'OLLAMA_UPSTREAM_ERROR',
            correlationId,
          });
        }

        const embedData = data || {};
        await touchProviderUsage(config.userId, 'ollama');
        return NextResponse.json({
          embedding: embedData.embedding,
        });
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
    if (error instanceof RemoteFetchError) {
      return publicErrorResponse({
        status: error.status,
        error: 'No se pudo conectar con Ollama.',
        code: error.code,
        correlationId,
      });
    }
    logErrorWithCorrelation('api.ollama.post', correlationId, error);
    return publicErrorResponse({
      status: 500,
      error: 'Error interno en Ollama.',
      code: 'OLLAMA_INTERNAL_ERROR',
      correlationId,
    });
  }
}

export async function DELETE(request: NextRequest) {
  const correlationId = createCorrelationId(request);
  try {
    const { searchParams } = new URL(request.url);
    const model = searchParams.get('model');

    if (!model) {
      return NextResponse.json(
        { error: 'Model name required' },
        { status: 400 }
      );
    }

    const config = await resolveProviderConfig(request);
    if (!config.enabled) {
      return NextResponse.json(disabledPayload(config), { status: 401 });
    }

    const { response } = await fetchRemoteJson<Record<string, unknown>>({
      provider: 'ollama',
      url: `${config.baseUrl}/api/delete`,
      init: {
        method: 'DELETE',
        headers: getHeaders(config.apiKey),
        body: JSON.stringify({ name: model }),
      },
    });

    if (!response.ok) {
      return publicErrorResponse({
        status: response.status,
        error: 'Ollama devolvió error al borrar el modelo.',
        code: 'OLLAMA_UPSTREAM_ERROR',
        correlationId,
      });
    }

    await touchProviderUsage(config.userId, 'ollama');
    return NextResponse.json({ success: true });
  } catch (error) {
    const text = String(error || '');
    if (text.includes('UNAUTHORIZED') || text.includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    if (error instanceof RemoteFetchError) {
      return publicErrorResponse({
        status: error.status,
        error: 'No se pudo conectar con Ollama.',
        code: error.code,
        correlationId,
      });
    }
    logErrorWithCorrelation('api.ollama.delete', correlationId, error);
    return publicErrorResponse({
      status: 500,
      error: 'Error interno en Ollama.',
      code: 'OLLAMA_INTERNAL_ERROR',
      correlationId,
    });
  }
}
