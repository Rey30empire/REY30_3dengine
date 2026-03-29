import type { APIConfig } from '@/lib/api-config';
import { DEFAULT_API_CONFIG } from '@/lib/api-config';
import { ApiProvider, type AppApiProvider } from '@/lib/domain-enums';
import type { LocalAIConfig } from '@/lib/local-ai-config';
import { DEFAULT_LOCAL_AI_CONFIG } from '@/lib/local-ai-config';
import { db } from '@/lib/db';
import { cloneJson, decryptText, encryptText } from './crypto';

type ProviderKey = 'openai' | 'meshy' | 'runway' | 'ollama' | 'vllm' | 'llamacpp';

type ProviderModelMap = Record<ProviderKey, AppApiProvider>;

const PROVIDER_TO_MODEL: ProviderModelMap = {
  openai: ApiProvider.OPENAI,
  meshy: ApiProvider.MESHY,
  runway: ApiProvider.RUNWAY,
  ollama: ApiProvider.OLLAMA,
  vllm: ApiProvider.VLLM,
  llamacpp: ApiProvider.LLAMACPP,
};

const MODEL_TO_PROVIDER = Object.entries(PROVIDER_TO_MODEL).reduce(
  (acc, [provider, model]) => {
    acc[model] = provider as ProviderKey;
    return acc;
  },
  {} as Record<AppApiProvider, ProviderKey>
);

export type UserScopedConfig = {
  apiConfig: APIConfig;
  localConfig: LocalAIConfig;
  hasSecrets: Record<ProviderKey, boolean>;
};

type PersistedSettings = {
  routing?: APIConfig['routing'];
  localRouting?: LocalAIConfig['routing'];
};

function cloneDefaults(): UserScopedConfig {
  return {
    apiConfig: cloneJson(DEFAULT_API_CONFIG),
    localConfig: cloneJson(DEFAULT_LOCAL_AI_CONFIG),
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

function safeParseJson<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function redactSecrets(config: UserScopedConfig): UserScopedConfig {
  const next = cloneJson(config);
  next.apiConfig.openai.apiKey = '';
  next.apiConfig.meshy.apiKey = '';
  next.apiConfig.runway.apiKey = '';
  next.localConfig.ollama.apiKey = '';
  next.localConfig.vllm.apiKey = '';
  next.localConfig.llamacpp.apiKey = '';
  return next;
}

function clearableSecret(secret: string | undefined): {
  clear: boolean;
  value: string;
} {
  const value = (secret || '').trim();
  if (value === '__CLEAR__') {
    return { clear: true, value: '' };
  }
  return { clear: false, value };
}

export async function getUserScopedConfig(userId: string): Promise<UserScopedConfig> {
  const base = cloneDefaults();

  const [settingsRow, credentials] = await Promise.all([
    db.userApiSettings.findUnique({ where: { userId } }),
    db.apiCredential.findMany({ where: { userId } }),
  ]);

  const persistedSettingsRaw = settingsRow?.encryptedSettings
    ? decryptText(settingsRow.encryptedSettings)
    : '';
  const persistedSettings = safeParseJson<PersistedSettings>(persistedSettingsRaw);

  if (persistedSettings?.routing) {
    base.apiConfig.routing = { ...base.apiConfig.routing, ...persistedSettings.routing };
  }
  if (persistedSettings?.localRouting) {
    base.localConfig.routing = { ...base.localConfig.routing, ...persistedSettings.localRouting };
  }

  for (const credential of credentials) {
    const provider = MODEL_TO_PROVIDER[credential.provider];
    if (!provider) continue;

    base.hasSecrets[provider] = credential.hasApiKey;
    const decryptedConfig = credential.encryptedConfig
      ? safeParseJson<Record<string, unknown>>(decryptText(credential.encryptedConfig))
      : null;
    const key = credential.hasApiKey && credential.encryptedApiKey
      ? decryptText(credential.encryptedApiKey)
      : '';

    if (provider === 'openai') {
      base.apiConfig.openai = {
        ...base.apiConfig.openai,
        ...(decryptedConfig || {}),
        enabled: credential.enabled,
        apiKey: key,
      };
      continue;
    }

    if (provider === 'meshy') {
      base.apiConfig.meshy = {
        ...base.apiConfig.meshy,
        ...(decryptedConfig || {}),
        enabled: credential.enabled,
        apiKey: key,
      };
      continue;
    }

    if (provider === 'runway') {
      base.apiConfig.runway = {
        ...base.apiConfig.runway,
        ...(decryptedConfig || {}),
        enabled: credential.enabled,
        apiKey: key,
      };
      continue;
    }

    if (provider === 'ollama') {
      base.localConfig.ollama = {
        ...base.localConfig.ollama,
        ...(decryptedConfig || {}),
        enabled: credential.enabled,
        apiKey: key || undefined,
      };
      continue;
    }

    if (provider === 'vllm') {
      base.localConfig.vllm = {
        ...base.localConfig.vllm,
        ...(decryptedConfig || {}),
        enabled: credential.enabled,
        apiKey: key || undefined,
      };
      continue;
    }

    base.localConfig.llamacpp = {
      ...base.localConfig.llamacpp,
      ...(decryptedConfig || {}),
      enabled: credential.enabled,
      apiKey: key || undefined,
    };
  }

  return base;
}

export async function getUserScopedConfigForClient(userId: string): Promise<UserScopedConfig> {
  const loaded = await getUserScopedConfig(userId);
  return redactSecrets(loaded);
}

async function upsertProviderConfig(
  userId: string,
  provider: ProviderKey,
  enabled: boolean,
  configWithoutSecret: Record<string, unknown>,
  nextSecret: { clear: boolean; value: string }
): Promise<void> {
  const modelProvider = PROVIDER_TO_MODEL[provider];
  const existing = await db.apiCredential.findUnique({
    where: {
      userId_provider: {
        userId,
        provider: modelProvider,
      },
    },
  });

  let finalSecret = '';
  if (nextSecret.clear) {
    finalSecret = '';
  } else if (nextSecret.value) {
    finalSecret = nextSecret.value;
  } else if (existing?.hasApiKey && existing.encryptedApiKey) {
    finalSecret = decryptText(existing.encryptedApiKey);
  }

  await db.apiCredential.upsert({
    where: {
      userId_provider: {
        userId,
        provider: modelProvider,
      },
    },
    create: {
      userId,
      provider: modelProvider,
      enabled,
      hasApiKey: !!finalSecret,
      encryptedApiKey: finalSecret ? encryptText(finalSecret) : null,
      encryptedConfig: encryptText(JSON.stringify(configWithoutSecret)),
    },
    update: {
      enabled,
      hasApiKey: !!finalSecret,
      encryptedApiKey: finalSecret ? encryptText(finalSecret) : null,
      encryptedConfig: encryptText(JSON.stringify(configWithoutSecret)),
    },
  });
}

export async function saveUserScopedConfig(
  userId: string,
  payload: {
    apiConfig: APIConfig;
    localConfig: LocalAIConfig;
  }
): Promise<UserScopedConfig> {
  const apiConfig = cloneJson(payload.apiConfig);
  const localConfig = cloneJson(payload.localConfig);

  const openaiSecret = clearableSecret(apiConfig.openai.apiKey);
  const meshySecret = clearableSecret(apiConfig.meshy.apiKey);
  const runwaySecret = clearableSecret(apiConfig.runway.apiKey);
  const ollamaSecret = clearableSecret(localConfig.ollama.apiKey || '');
  const vllmSecret = clearableSecret(localConfig.vllm.apiKey || '');
  const llamacppSecret = clearableSecret(localConfig.llamacpp.apiKey || '');

  const openaiConfig = { ...apiConfig.openai };
  delete (openaiConfig as { apiKey?: string }).apiKey;
  const meshyConfig = { ...apiConfig.meshy };
  delete (meshyConfig as { apiKey?: string }).apiKey;
  const runwayConfig = { ...apiConfig.runway };
  delete (runwayConfig as { apiKey?: string }).apiKey;

  const ollamaConfig = { ...localConfig.ollama };
  delete (ollamaConfig as { apiKey?: string }).apiKey;
  const vllmConfig = { ...localConfig.vllm };
  delete (vllmConfig as { apiKey?: string }).apiKey;
  const llamacppConfig = { ...localConfig.llamacpp };
  delete (llamacppConfig as { apiKey?: string }).apiKey;

  await Promise.all([
    upsertProviderConfig(userId, 'openai', !!apiConfig.openai.enabled, openaiConfig, openaiSecret),
    upsertProviderConfig(userId, 'meshy', !!apiConfig.meshy.enabled, meshyConfig, meshySecret),
    upsertProviderConfig(userId, 'runway', !!apiConfig.runway.enabled, runwayConfig, runwaySecret),
    upsertProviderConfig(userId, 'ollama', !!localConfig.ollama.enabled, ollamaConfig, ollamaSecret),
    upsertProviderConfig(userId, 'vllm', !!localConfig.vllm.enabled, vllmConfig, vllmSecret),
    upsertProviderConfig(userId, 'llamacpp', !!localConfig.llamacpp.enabled, llamacppConfig, llamacppSecret),
  ]);

  await db.userApiSettings.upsert({
    where: { userId },
    create: {
      userId,
      encryptedSettings: encryptText(JSON.stringify({
        routing: apiConfig.routing,
        localRouting: localConfig.routing,
      } satisfies PersistedSettings)),
    },
    update: {
      encryptedSettings: encryptText(JSON.stringify({
        routing: apiConfig.routing,
        localRouting: localConfig.routing,
      } satisfies PersistedSettings)),
    },
  });

  return getUserScopedConfigForClient(userId);
}

export async function touchProviderUsage(userId: string, provider: ProviderKey): Promise<void> {
  const modelProvider = PROVIDER_TO_MODEL[provider];
  await db.apiCredential.updateMany({
    where: { userId, provider: modelProvider },
    data: { lastUsedAt: new Date() },
  });
}
