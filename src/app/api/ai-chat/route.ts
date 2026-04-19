import { NextRequest, NextResponse } from 'next/server';
import { logSecurityEvent, requireSession } from '@/lib/security/auth';
import {
  isLocalProviderUsable,
  isLocalProviderConfigError,
  resolveEnabledLocalProviderBaseUrl,
} from '@/lib/security/local-provider-policy';
import { getUserScopedConfig, touchProviderUsage } from '@/lib/security/user-api-config';
import {
  assertUsageAllowed,
  isUsageLimitError,
  recordUsage,
} from '@/lib/security/usage-governance';
import { normalizeProjectKey, recordProjectUsage } from '@/lib/security/usage-finops';
import {
  createCorrelationId,
  logErrorWithCorrelation,
} from '@/lib/security/public-error';
import { fetchRemoteJson, RemoteFetchError } from '@/lib/security/remote-fetch';
import {
  createAssistantIntentReceipt,
  type AssistantReceiptProvider,
} from '@/lib/server/assistant-intent-receipts';
import { tryHandleAssistantSceneAction } from '@/lib/server/assistant-scene-actions';

type AIChatBody = {
  prompt?: string;
  messages?: Array<{ role: string; content: string }>;
  model?: string;
};

const CHAT_UNAVAILABLE_MESSAGE = 'El chat del asistente no está disponible para esta sesión.';
const CHAT_AUTH_REQUIRED_MESSAGE = 'Debes iniciar sesión para usar el asistente.';

function assistantErrorResponse(params: {
  status: number;
  error: string;
  code: string;
  correlationId: string;
  projectKey: string;
  provider: AssistantReceiptProvider;
  outcome:
    | 'provider_unavailable'
    | 'auth_required'
    | 'usage_limited'
    | 'provider_error'
    | 'internal_error';
}) {
  return NextResponse.json(
    {
      error: params.error,
      code: params.code,
      correlationId: params.correlationId,
      receipt: createAssistantIntentReceipt({
        correlationId: params.correlationId,
        projectKey: params.projectKey,
        source: 'provider-chat',
        provider: params.provider,
        outcome: params.outcome,
        handledSceneAction: false,
        sceneUpdated: false,
      }),
    },
    { status: params.status }
  );
}

function normalizeMessages(body: AIChatBody): Array<{ role: string; content: string }> {
  if (Array.isArray(body.messages) && body.messages.length > 0) {
    return body.messages;
  }
  return [
    {
      role: 'user',
      content: body.prompt || '',
    },
  ];
}

function pickLocalProvider(config: Awaited<ReturnType<typeof getUserScopedConfig>>) {
  const preferred = config.localConfig.routing.chat;
  if (config.localConfig[preferred].enabled) return preferred;
  if (config.localConfig.ollama.enabled) return 'ollama';
  if (config.localConfig.vllm.enabled) return 'vllm';
  return 'llamacpp';
}

function messagesToPrompt(messages: Array<{ role: string; content: string }>): string {
  const parts: string[] = [];
  for (const msg of messages) {
    if (msg.role === 'system') parts.push(`System: ${msg.content}`);
    if (msg.role === 'user') parts.push(`User: ${msg.content}`);
    if (msg.role === 'assistant') parts.push(`Assistant: ${msg.content}`);
  }
  parts.push('Assistant:');
  return parts.join('\n\n');
}

async function runOpenAIChat(params: {
  baseUrl: string;
  apiKey: string;
  organization?: string;
  project?: string;
  model: string;
  messages: Array<{ role: string; content: string }>;
}): Promise<string> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${params.apiKey}`,
  };
  if (params.organization) {
    headers['OpenAI-Organization'] = params.organization;
  }
  if (params.project) {
    headers['OpenAI-Project'] = params.project;
  }

  const { response, data } = await fetchRemoteJson<Record<string, any>>({
    provider: 'openai',
    url: `${params.baseUrl}/responses`,
    init: {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: params.model,
        input: params.messages.map((message) => ({
          role: message.role,
          content: [{ type: 'input_text', text: message.content }],
        })),
      }),
    },
  });

  const payload = data || {};
  if (!response.ok) {
    throw new Error(payload.error?.message || payload.error || 'OpenAI chat failed');
  }

  if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text;
  }
  if (Array.isArray(payload.choices)) {
    const text = payload.choices[0]?.message?.content;
    if (typeof text === 'string') return text;
  }
  return '';
}

async function runLocalChat(params: {
  provider: 'ollama' | 'vllm' | 'llamacpp';
  baseUrl: string;
  apiKey?: string;
  model?: string;
  messages: Array<{ role: string; content: string }>;
}): Promise<string> {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (params.apiKey) {
    headers.Authorization = `Bearer ${params.apiKey}`;
  }

  if (params.provider === 'ollama') {
    const { response, data } = await fetchRemoteJson<Record<string, any>>({
      provider: 'ollama',
      url: `${params.baseUrl}/api/chat`,
      init: {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: params.model || 'llama3.1',
          messages: params.messages,
          stream: false,
        }),
      },
    });
    const payload = data || {};
    if (!response.ok) {
      throw new Error(payload.error || payload.message || 'Ollama chat failed');
    }
    return payload?.message?.content || '';
  }

  if (params.provider === 'vllm') {
    const { response, data } = await fetchRemoteJson<Record<string, any>>({
      provider: 'vllm',
      url: `${params.baseUrl}/v1/chat/completions`,
      init: {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: params.model || 'meta-llama/Llama-3.1-8B-Instruct',
          messages: params.messages,
          stream: false,
        }),
      },
    });
    const payload = data || {};
    if (!response.ok) {
      throw new Error(payload.error || payload.message || 'vLLM chat failed');
    }
    return payload?.choices?.[0]?.message?.content || '';
  }

  const { response, data } = await fetchRemoteJson<Record<string, any>>({
    provider: 'llamacpp',
    url: `${params.baseUrl}/completion`,
    init: {
      method: 'POST',
      headers,
      body: JSON.stringify({
        prompt: messagesToPrompt(params.messages),
        n_predict: 2048,
        temperature: 0.7,
        stop: ['User:', '\n\n\n'],
      }),
    },
  });
  const payload = data || {};
  if (!response.ok) {
    throw new Error(payload.error || payload.message || 'llama.cpp chat failed');
  }
  return typeof payload.content === 'string' ? payload.content.trim() : '';
}

export async function POST(request: NextRequest) {
  const correlationId = createCorrelationId(request);
  const projectKey =
    normalizeProjectKey(request.headers.get('x-rey30-project')) || 'untitled_project';
  let attemptedProvider: AssistantReceiptProvider = 'none';
  try {
    const user = await requireSession(request, 'VIEWER');
    const body = await request.json() as AIChatBody;
    const messages = normalizeMessages(body);
    const assistantAction = await tryHandleAssistantSceneAction({
      command: body.prompt || messages[messages.length - 1]?.content || '',
      userId: user.id,
      userRole: user.role,
      preferredSessionId: request.headers.get('x-rey30-editor-session'),
      projectKey,
    });

    if (assistantAction.handled) {
      return NextResponse.json({
        text: assistantAction.text || '',
        handledSceneAction: true,
        sceneUpdated: assistantAction.sceneUpdated,
        receipt: createAssistantIntentReceipt({
          correlationId,
          projectKey,
          source: 'scene-action',
          provider: 'none',
          outcome: 'handled_scene_action',
          handledSceneAction: true,
          sceneUpdated: assistantAction.sceneUpdated,
        }),
      });
    }

    const scoped = await getUserScopedConfig(user.id);

    if (scoped.apiConfig.routing.chat === 'openai') {
      attemptedProvider = 'openai';
      const openai = scoped.apiConfig.openai;
      if (!openai.enabled || !openai.apiKey) {
        return assistantErrorResponse({
          status: 409,
          error: CHAT_UNAVAILABLE_MESSAGE,
          code: 'AI_CHAT_UNAVAILABLE',
          correlationId,
          projectKey,
          provider: attemptedProvider,
          outcome: 'provider_unavailable',
        });
      }
      await assertUsageAllowed({
        userId: user.id,
        provider: 'openai',
        action: 'chat',
      });
      const text = await runOpenAIChat({
        baseUrl: openai.baseUrl,
        apiKey: openai.apiKey,
        organization: openai.organization,
        project: openai.project,
        model: body.model || openai.textModel || 'gpt-4.1-mini',
        messages,
      });
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
      return NextResponse.json({
        text,
        handledSceneAction: false,
        sceneUpdated: false,
        receipt: createAssistantIntentReceipt({
          correlationId,
          projectKey,
          source: 'provider-chat',
          provider: attemptedProvider,
          outcome: 'provider_response',
          handledSceneAction: false,
          sceneUpdated: false,
          model: body.model || openai.textModel || 'gpt-4.1-mini',
        }),
      });
    }

    const localProvider = pickLocalProvider(scoped);
    attemptedProvider = localProvider;
    const providerConfig = scoped.localConfig[localProvider];
    if (!providerConfig.enabled) {
      return assistantErrorResponse({
        status: 409,
        error: CHAT_UNAVAILABLE_MESSAGE,
        code: 'AI_CHAT_UNAVAILABLE',
        correlationId,
        projectKey,
        provider: attemptedProvider,
        outcome: 'provider_unavailable',
      });
    }

    await assertUsageAllowed({
      userId: user.id,
      provider: localProvider,
      action: 'chat',
    });

    const text = await runLocalChat({
      provider: localProvider,
      baseUrl: resolveEnabledLocalProviderBaseUrl(localProvider, providerConfig.baseUrl),
      apiKey: providerConfig.apiKey,
      model: 'model' in providerConfig ? providerConfig.model : undefined,
      messages,
    });
    await Promise.all([
      touchProviderUsage(user.id, localProvider),
      recordUsage({ userId: user.id, provider: localProvider, action: 'chat' }),
      recordProjectUsage({
        userId: user.id,
        provider: localProvider,
        action: 'chat',
        projectKey,
      }),
    ]);
    return NextResponse.json({
      text,
      handledSceneAction: false,
      sceneUpdated: false,
      receipt: createAssistantIntentReceipt({
        correlationId,
        projectKey,
        source: 'provider-chat',
        provider: attemptedProvider,
        outcome: 'provider_response',
        handledSceneAction: false,
        sceneUpdated: false,
        model: 'model' in providerConfig ? providerConfig.model : undefined,
      }),
    });
  } catch (error) {
    if (isUsageLimitError(error)) {
      await logSecurityEvent({
        request,
        action: 'provider.ai_chat.use',
        status: 'denied',
        metadata: { reason: 'usage_limit_exceeded', correlationId },
      });
      return assistantErrorResponse({
        status: 429,
        error: 'Límite de uso/costo excedido para este período. Ajusta tu presupuesto en Usuario -> Uso.',
        code: 'USAGE_LIMIT_EXCEEDED',
        correlationId,
        projectKey,
        provider: attemptedProvider,
        outcome: 'usage_limited',
      });
    }
    if (String(error).includes('UNAUTHORIZED')) {
      return assistantErrorResponse({
        status: 401,
        error: CHAT_AUTH_REQUIRED_MESSAGE,
        code: 'AI_CHAT_AUTH_REQUIRED',
        correlationId,
        projectKey,
        provider: attemptedProvider,
        outcome: 'auth_required',
      });
    }
    if (error instanceof RemoteFetchError) {
      await logSecurityEvent({
        request,
        action: 'provider.ai_chat.use',
        status: 'error',
        metadata: { reason: error.code, correlationId },
      });
      return assistantErrorResponse({
        status: error.status,
        error: 'No se pudo conectar con el proveedor configurado.',
        code: error.code,
        correlationId,
        projectKey,
        provider: attemptedProvider,
        outcome: 'provider_error',
      });
    }
    if (isLocalProviderConfigError(error)) {
      await logSecurityEvent({
        request,
        action: 'provider.ai_chat.use',
        status: 'denied',
        metadata: { reason: error.code, correlationId },
      });
      return assistantErrorResponse({
        status: 409,
        error: CHAT_UNAVAILABLE_MESSAGE,
        code: error.code,
        correlationId,
        projectKey,
        provider: attemptedProvider,
        outcome: 'provider_unavailable',
      });
    }
    await logSecurityEvent({
      request,
      action: 'provider.ai_chat.use',
      status: 'error',
      metadata: { error: String(error), correlationId },
    });
    logErrorWithCorrelation('api.ai-chat', correlationId, error);
    return assistantErrorResponse({
      status: 500,
      error: 'No se pudo procesar el chat.',
      code: 'AI_CHAT_INTERNAL_ERROR',
      correlationId,
      projectKey,
      provider: attemptedProvider,
      outcome: 'internal_error',
    });
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession(request, 'VIEWER');
    const scoped = await getUserScopedConfig(user.id);
    const usingLocalChat =
      scoped.apiConfig.routing.chat === 'local' &&
      (isLocalProviderUsable('ollama', scoped.localConfig.ollama) ||
        isLocalProviderUsable('vllm', scoped.localConfig.vllm) ||
        isLocalProviderUsable('llamacpp', scoped.localConfig.llamacpp));
    const usingRemoteChat =
      scoped.apiConfig.routing.chat !== 'local' &&
      !!scoped.apiConfig.openai.enabled &&
      !!scoped.apiConfig.openai.apiKey &&
      !!scoped.apiConfig.openai.capabilities.chat;
    return NextResponse.json({
      status: 'ok',
      available: usingLocalChat || usingRemoteChat,
    });
  } catch {
    return NextResponse.json({
      status: 'ok',
      available: false,
    });
  }
}
