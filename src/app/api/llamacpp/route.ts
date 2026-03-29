// ============================================
// Llama.cpp API Route (BYOK per-user, local provider)
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import { getUserScopedConfig, touchProviderUsage } from '@/lib/security/user-api-config';
import {
  createCorrelationId,
  logErrorWithCorrelation,
  publicErrorResponse,
} from '@/lib/security/public-error';
import { fetchRemoteJson, fetchRemoteText, RemoteFetchError } from '@/lib/security/remote-fetch';

type ProviderRequestBody = {
  action?: string;
  prompt?: string;
  messages?: Array<{ role: string; content: string }>;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  repeatPenalty?: number;
  stop?: string[];
  tokens?: number[];
};

type LlamaCppConfig = {
  userId: string;
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
};

function buildHeaders(apiKey?: string): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  return headers;
}

function messagesToPrompt(messages: Array<{ role: string; content: string }>): string {
  const parts: string[] = [];

  for (const msg of messages) {
    switch (msg.role) {
      case 'system':
        parts.push(`System: ${msg.content}`);
        break;
      case 'user':
        parts.push(`User: ${msg.content}`);
        break;
      case 'assistant':
        parts.push(`Assistant: ${msg.content}`);
        break;
    }
  }

  parts.push('Assistant:');
  return parts.join('\n\n');
}

async function resolveProviderConfig(request: NextRequest): Promise<LlamaCppConfig> {
  const user = await requireSession(request, 'VIEWER');
  const scoped = await getUserScopedConfig(user.id);
  const provider = scoped.localConfig.llamacpp;

  return {
    userId: user.id,
    enabled: !!provider.enabled,
    baseUrl: provider.baseUrl || 'http://localhost:8080',
    apiKey: provider.apiKey || '',
  };
}

function disabledPayload(config: LlamaCppConfig): Record<string, unknown> {
  return {
    configured: false,
    running: false,
    baseUrl: config.baseUrl,
    error: 'llama.cpp no está habilitado en tu configuración de usuario.',
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

    if (action === 'props') {
      const { response, data } = await fetchRemoteJson<Record<string, unknown>>({
        provider: 'llamacpp',
        url: `${config.baseUrl}/props`,
        init: {
          headers: buildHeaders(config.apiKey),
        },
      });

      if (!response.ok) {
        return publicErrorResponse({
          status: response.status,
          error: 'llama.cpp respondió con error al consultar props.',
          code: 'LLAMACPP_UPSTREAM_ERROR',
          correlationId,
        });
      }

      await touchProviderUsage(config.userId, 'llamacpp');
      return NextResponse.json(data || {});
    }

    try {
      const { response } = await fetchRemoteText({
        provider: 'llamacpp',
        url: `${config.baseUrl}/health`,
        init: {
          headers: buildHeaders(config.apiKey),
        },
      });

      await touchProviderUsage(config.userId, 'llamacpp');
      return NextResponse.json({
        running: response.ok,
        configured: true,
        baseUrl: config.baseUrl,
      });
    } catch {
      const { response } = await fetchRemoteJson<Record<string, unknown>>({
        provider: 'llamacpp',
        url: `${config.baseUrl}/props`,
        init: {
          headers: buildHeaders(config.apiKey),
        },
      });

      await touchProviderUsage(config.userId, 'llamacpp');
      return NextResponse.json({
        running: response.ok,
        configured: true,
        baseUrl: config.baseUrl,
      });
    }
  } catch (error) {
    const text = String(error || '');
    if (text.includes('UNAUTHORIZED') || text.includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    if (error instanceof RemoteFetchError) {
      return publicErrorResponse({
        status: 200,
        error: 'No se pudo conectar con llama.cpp',
        code: error.code,
        correlationId,
        extra: { running: false, configured: true },
      });
    }
    return NextResponse.json(
      { error: 'Failed to connect to Llama.cpp', running: false, configured: true },
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
    const { action, prompt, messages } = body;

    switch (action) {
      case 'complete': {
        const { response: compResponse, data } = await fetchRemoteJson<Record<string, any>>({
          provider: 'llamacpp',
          url: `${config.baseUrl}/completion`,
          init: {
            method: 'POST',
            headers: buildHeaders(config.apiKey),
            body: JSON.stringify({
              prompt,
              n_predict: body.maxTokens ?? 2048,
              temperature: body.temperature ?? 0.7,
              top_p: body.topP ?? 0.9,
              top_k: body.topK ?? 40,
              repeat_penalty: body.repeatPenalty ?? 1.1,
              stop: body.stop || [],
            }),
          },
        });

        if (!compResponse.ok) {
          return publicErrorResponse({
            status: compResponse.status,
            error: 'llama.cpp devolvió error en completion.',
            code: 'LLAMACPP_UPSTREAM_ERROR',
            correlationId,
          });
        }

        const compData = data || {};
        await touchProviderUsage(config.userId, 'llamacpp');
        return NextResponse.json({
          id: `llamacpp-${Date.now()}`,
          content: compData.content,
          tokens_evaluated: compData.tokens_evaluated,
          tokens_predicted: compData.tokens_predicted,
        });
      }

      case 'chat': {
        const chatPrompt = messagesToPrompt(messages || []);

        const { response: chatResponse, data } = await fetchRemoteJson<Record<string, any>>({
          provider: 'llamacpp',
          url: `${config.baseUrl}/completion`,
          init: {
            method: 'POST',
            headers: buildHeaders(config.apiKey),
            body: JSON.stringify({
              prompt: chatPrompt,
              n_predict: body.maxTokens ?? 2048,
              temperature: body.temperature ?? 0.7,
              stop: ['User:', '\n\n\n'],
            }),
          },
        });

        if (!chatResponse.ok) {
          return publicErrorResponse({
            status: chatResponse.status,
            error: 'llama.cpp devolvió error en chat.',
            code: 'LLAMACPP_UPSTREAM_ERROR',
            correlationId,
          });
        }

        const chatData = data || {};
        await touchProviderUsage(config.userId, 'llamacpp');
        return NextResponse.json({
          id: `llamacpp-${Date.now()}`,
          choices: [
            {
              message: {
                role: 'assistant',
                content: chatData.content.trim(),
              },
              finish_reason: 'stop',
            },
          ],
        });
      }

      case 'tokenize': {
        const { response: tokResponse, data } = await fetchRemoteJson<Record<string, unknown>>({
          provider: 'llamacpp',
          url: `${config.baseUrl}/tokenize`,
          init: {
            method: 'POST',
            headers: buildHeaders(config.apiKey),
            body: JSON.stringify({ content: prompt }),
          },
        });

        if (!tokResponse.ok) {
          return publicErrorResponse({
            status: tokResponse.status,
            error: 'llama.cpp devolvió error en tokenize.',
            code: 'LLAMACPP_UPSTREAM_ERROR',
            correlationId,
          });
        }

        await touchProviderUsage(config.userId, 'llamacpp');
        return NextResponse.json(data || {});
      }

      case 'detokenize': {
        const { response: detokResponse, data } = await fetchRemoteJson<Record<string, unknown>>({
          provider: 'llamacpp',
          url: `${config.baseUrl}/detokenize`,
          init: {
            method: 'POST',
            headers: buildHeaders(config.apiKey),
            body: JSON.stringify({ tokens: body.tokens }),
          },
        });

        if (!detokResponse.ok) {
          return publicErrorResponse({
            status: detokResponse.status,
            error: 'llama.cpp devolvió error en detokenize.',
            code: 'LLAMACPP_UPSTREAM_ERROR',
            correlationId,
          });
        }

        await touchProviderUsage(config.userId, 'llamacpp');
        return NextResponse.json(data || {});
      }

      case 'embed': {
        const { response: embedResponse, data } = await fetchRemoteJson<Record<string, any>>({
          provider: 'llamacpp',
          url: `${config.baseUrl}/embedding`,
          init: {
            method: 'POST',
            headers: buildHeaders(config.apiKey),
            body: JSON.stringify({ content: prompt }),
          },
        });

        if (!embedResponse.ok) {
          return publicErrorResponse({
            status: embedResponse.status,
            error: 'llama.cpp devolvió error en embeddings.',
            code: 'LLAMACPP_UPSTREAM_ERROR',
            correlationId,
          });
        }

        const embedData = data || {};
        await touchProviderUsage(config.userId, 'llamacpp');
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
        error: 'No se pudo conectar con llama.cpp.',
        code: error.code,
        correlationId,
      });
    }
    logErrorWithCorrelation('api.llamacpp.post', correlationId, error);
    return publicErrorResponse({
      status: 500,
      error: 'Error interno en llama.cpp.',
      code: 'LLAMACPP_INTERNAL_ERROR',
      correlationId,
    });
  }
}
