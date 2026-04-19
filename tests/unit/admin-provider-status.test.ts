import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_API_CONFIG } from '@/lib/api-config';
import { DEFAULT_LOCAL_AI_CONFIG } from '@/lib/local-ai-config';
import type { UserScopedConfig } from '@/lib/security/user-api-config';

const fetchRemoteJsonMock = vi.fn();
const fetchRemoteTextMock = vi.fn();
type MutableEnv = Record<string, string | undefined>;

vi.mock('@/lib/security/remote-fetch', () => ({
  fetchRemoteJson: fetchRemoteJsonMock,
  fetchRemoteText: fetchRemoteTextMock,
}));

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

describe('admin provider status', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    delete (process.env as MutableEnv).NODE_ENV;
    delete process.env.REY30_LOCAL_PROVIDER_ALLOWLIST_OLLAMA;
  });

  it('marks invalid local provider endpoints as not ready without probing them', async () => {
    (process.env as MutableEnv).NODE_ENV = 'test';
    const config = createScopedConfig();
    config.localConfig.ollama.enabled = true;
    config.localConfig.ollama.baseUrl = 'http://127.0.0.1:9';

    const { buildAdminProviderStatuses } = await import('@/lib/server/admin-provider-status');
    const statuses = await buildAdminProviderStatuses(config);

    expect(statuses.ollama.ok).toBe(false);
    expect(statuses.ollama.detail).toContain('loopback aprobados');
    expect(fetchRemoteJsonMock).not.toHaveBeenCalled();
    expect(fetchRemoteTextMock).not.toHaveBeenCalled();
  });
});
