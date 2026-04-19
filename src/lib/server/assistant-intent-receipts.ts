import crypto from 'crypto';

export type AssistantReceiptSource = 'scene-action' | 'provider-chat';
export type AssistantReceiptProvider =
  | 'none'
  | 'openai'
  | 'ollama'
  | 'vllm'
  | 'llamacpp';
export type AssistantReceiptOutcome =
  | 'handled_scene_action'
  | 'provider_response'
  | 'provider_unavailable'
  | 'auth_required'
  | 'usage_limited'
  | 'provider_error'
  | 'internal_error';

export interface AssistantIntentReceipt {
  id: string;
  createdAt: string;
  correlationId: string;
  projectKey: string;
  source: AssistantReceiptSource;
  provider: AssistantReceiptProvider;
  outcome: AssistantReceiptOutcome;
  handledSceneAction: boolean;
  sceneUpdated: boolean;
  model?: string;
}

export function createAssistantIntentReceipt(params: {
  correlationId: string;
  projectKey: string;
  source: AssistantReceiptSource;
  provider: AssistantReceiptProvider;
  outcome: AssistantReceiptOutcome;
  handledSceneAction: boolean;
  sceneUpdated: boolean;
  model?: string;
}): AssistantIntentReceipt {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    correlationId: params.correlationId,
    projectKey: params.projectKey,
    source: params.source,
    provider: params.provider,
    outcome: params.outcome,
    handledSceneAction: params.handledSceneAction,
    sceneUpdated: params.sceneUpdated,
    model: params.model,
  };
}
