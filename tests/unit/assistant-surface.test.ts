import { describe, expect, it } from 'vitest';
import { DEFAULT_API_CONFIG } from '@/lib/api-config';
import { DEFAULT_LOCAL_AI_CONFIG } from '@/lib/local-ai-config';
import { deriveAssistantSurfaceStatus } from '@/lib/security/assistant-surface';
import type { UserScopedConfig } from '@/lib/security/user-api-config';

type MutableEnv = Record<string, string | undefined>;

function createScopedConfig(): UserScopedConfig {
  return {
    apiConfig: structuredClone(DEFAULT_API_CONFIG),
    localConfig: structuredClone(DEFAULT_LOCAL_AI_CONFIG),
    hasSecrets: {
      openai: false,
      meshy: false,
      runway: false,
      ollama: false,
      vllm: false,
      llamacpp: false,
    },
  };
}

describe('deriveAssistantSurfaceStatus', () => {
  it('returns a product surface with no assistant capabilities for a viewer session without services', () => {
    const config = createScopedConfig();

    const result = deriveAssistantSurfaceStatus({
      config,
      role: 'VIEWER',
      sharedAccess: false,
    });

    expect(result.authenticated).toBe(true);
    expect(result.experience).toBe('product');
    expect(result.access.advancedTools).toBe(false);
    expect(result.access.configurationAccess).toBe(false);
    expect(result.assistant.available).toBe(false);
    expect(result.assistant.capabilities).toEqual({
      chat: { remote: false, local: false },
      image: false,
      video: { standard: false, cinematic: false },
      model3D: false,
      character: false,
    });
  });

  it('collapses enabled cloud and local services into generic assistant capabilities', () => {
    const config = createScopedConfig();
    config.apiConfig.openai.enabled = true;
    config.apiConfig.openai.apiKey = 'openai-key';
    config.apiConfig.openai.capabilities.chat = true;
    config.apiConfig.openai.capabilities.image = true;
    config.apiConfig.openai.capabilities.video = true;
    config.apiConfig.meshy.enabled = true;
    config.apiConfig.meshy.apiKey = 'meshy-key';
    config.apiConfig.meshy.capabilities.threeD = true;
    config.apiConfig.runway.enabled = true;
    config.apiConfig.runway.apiKey = 'runway-key';
    config.apiConfig.runway.capabilities.video = true;
    config.localConfig.ollama.enabled = true;
    const previousNodeEnv = process.env.NODE_ENV;

    try {
      (process.env as MutableEnv).NODE_ENV = 'test';

      const result = deriveAssistantSurfaceStatus({
        config,
        role: 'EDITOR',
        sharedAccess: false,
      });

      expect(result.experience).toBe('advanced');
      expect(result.access.advancedTools).toBe(true);
      expect(result.assistant.available).toBe(true);
      expect(result.assistant.capabilities).toEqual({
        chat: { remote: true, local: true },
        image: true,
        video: { standard: true, cinematic: true },
        model3D: true,
        character: true,
      });
    } finally {
      if (previousNodeEnv === undefined) {
        delete (process.env as MutableEnv).NODE_ENV;
      } else {
        (process.env as MutableEnv).NODE_ENV = previousNodeEnv;
      }
    }
  });

  it('keeps advanced tools hidden for shared access while preserving allowed capabilities', () => {
    const config = createScopedConfig();
    config.apiConfig.openai.enabled = true;
    config.apiConfig.openai.apiKey = 'openai-key';
    config.apiConfig.openai.capabilities.chat = true;

    const result = deriveAssistantSurfaceStatus({
      config,
      role: 'OWNER',
      sharedAccess: true,
    });

    expect(result.experience).toBe('product');
    expect(result.access.advancedTools).toBe(false);
    expect(result.access.configurationAccess).toBe(false);
    expect(result.assistant.available).toBe(true);
    expect(result.assistant.capabilities.chat).toEqual({ remote: true, local: false });
    expect(result.assistant.capabilities.character).toBe(false);
  });
});
