import type { UserScopedConfig } from '@/lib/security/user-api-config';
import {
  isLocalProviderConfigError,
  resolveEnabledLocalProviderBaseUrl,
} from '@/lib/security/local-provider-policy';
import {
  fetchRemoteJson,
  fetchRemoteText,
} from '@/lib/security/remote-fetch';

export type AdminProviderStatus = {
  ok: boolean;
  detail: string;
};

export type AdminProviderStatusMap = {
  openai: AdminProviderStatus;
  meshy: AdminProviderStatus;
  runway: AdminProviderStatus;
  ollama: AdminProviderStatus;
  vllm: AdminProviderStatus;
  llamacpp: AdminProviderStatus;
};

const HEALTHCHECK_TIMEOUT_MS = 2_500;

function cloudStatus(params: {
  enabled: boolean;
  hasSecret: boolean;
  readyLabel: string;
}): AdminProviderStatus {
  if (!params.enabled) {
    return { ok: false, detail: 'Desactivado' };
  }
  if (!params.hasSecret) {
    return { ok: false, detail: 'Falta clave guardada' };
  }
  return { ok: true, detail: params.readyLabel };
}

function authHeaders(apiKey?: string): HeadersInit | undefined {
  const token = (apiKey || '').trim();
  if (!token) return undefined;
  return {
    Authorization: `Bearer ${token}`,
  };
}

async function probeOllama(baseUrl: string, apiKey?: string): Promise<AdminProviderStatus> {
  try {
    const { response } = await fetchRemoteJson({
      provider: 'ollama',
      url: `${baseUrl.replace(/\/+$/, '')}/api/version`,
      init: {
        headers: authHeaders(apiKey),
      },
      timeoutMs: HEALTHCHECK_TIMEOUT_MS,
    });
    return response.ok
      ? { ok: true, detail: 'Servidor local activo' }
      : { ok: false, detail: 'No responde' };
  } catch {
    return { ok: false, detail: 'No responde' };
  }
}

async function probeVllm(baseUrl: string, apiKey?: string): Promise<AdminProviderStatus> {
  try {
    const { response } = await fetchRemoteText({
      provider: 'vllm',
      url: `${baseUrl.replace(/\/+$/, '')}/health`,
      init: {
        headers: authHeaders(apiKey),
      },
      timeoutMs: HEALTHCHECK_TIMEOUT_MS,
    });
    return response.ok
      ? { ok: true, detail: 'Servidor local activo' }
      : { ok: false, detail: 'No responde' };
  } catch {
    return { ok: false, detail: 'No responde' };
  }
}

async function probeLlamaCpp(baseUrl: string, apiKey?: string): Promise<AdminProviderStatus> {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  const headers = authHeaders(apiKey);

  try {
    const { response } = await fetchRemoteText({
      provider: 'llamacpp',
      url: `${normalizedBaseUrl}/health`,
      init: { headers },
      timeoutMs: HEALTHCHECK_TIMEOUT_MS,
    });
    return response.ok
      ? { ok: true, detail: 'Servidor local activo' }
      : { ok: false, detail: 'No responde' };
  } catch {
    try {
      const { response } = await fetchRemoteJson({
        provider: 'llamacpp',
        url: `${normalizedBaseUrl}/props`,
        init: { headers },
        timeoutMs: HEALTHCHECK_TIMEOUT_MS,
      });
      return response.ok
        ? { ok: true, detail: 'Servidor local activo' }
        : { ok: false, detail: 'No responde' };
    } catch {
      return { ok: false, detail: 'No responde' };
    }
  }
}

export async function buildAdminProviderStatuses(
  config: UserScopedConfig
): Promise<AdminProviderStatusMap> {
  const statuses: AdminProviderStatusMap = {
    openai: cloudStatus({
      enabled: !!config.apiConfig.openai.enabled,
      hasSecret: !!config.hasSecrets.openai,
      readyLabel: 'Configurado para esta sesión',
    }),
    meshy: cloudStatus({
      enabled: !!config.apiConfig.meshy.enabled,
      hasSecret: !!config.hasSecrets.meshy,
      readyLabel: 'Listo para 3D',
    }),
    runway: cloudStatus({
      enabled: !!config.apiConfig.runway.enabled,
      hasSecret: !!config.hasSecrets.runway,
      readyLabel: 'Listo para video',
    }),
    ollama: { ok: false, detail: 'Desactivado' },
    vllm: { ok: false, detail: 'Desactivado' },
    llamacpp: { ok: false, detail: 'Desactivado' },
  };

  const localChecks: Array<Promise<readonly [keyof AdminProviderStatusMap, AdminProviderStatus]>> = [];

  if (config.localConfig.ollama.enabled) {
    try {
      localChecks.push(
        probeOllama(
          resolveEnabledLocalProviderBaseUrl('ollama', config.localConfig.ollama.baseUrl),
          config.localConfig.ollama.apiKey
        ).then((status) => ['ollama', status] as const)
      );
    } catch (error) {
      if (isLocalProviderConfigError(error)) {
        statuses.ollama = { ok: false, detail: error.message };
      } else {
        throw error;
      }
    }
  }

  if (config.localConfig.vllm.enabled) {
    try {
      localChecks.push(
        probeVllm(
          resolveEnabledLocalProviderBaseUrl('vllm', config.localConfig.vllm.baseUrl),
          config.localConfig.vllm.apiKey
        ).then((status) => ['vllm', status] as const)
      );
    } catch (error) {
      if (isLocalProviderConfigError(error)) {
        statuses.vllm = { ok: false, detail: error.message };
      } else {
        throw error;
      }
    }
  }

  if (config.localConfig.llamacpp.enabled) {
    try {
      localChecks.push(
        probeLlamaCpp(
          resolveEnabledLocalProviderBaseUrl('llamacpp', config.localConfig.llamacpp.baseUrl),
          config.localConfig.llamacpp.apiKey
        ).then((status) => ['llamacpp', status] as const)
      );
    } catch (error) {
      if (isLocalProviderConfigError(error)) {
        statuses.llamacpp = { ok: false, detail: error.message };
      } else {
        throw error;
      }
    }
  }

  const localStatuses = await Promise.all(localChecks);
  for (const [provider, status] of localStatuses) {
    statuses[provider] = status;
  }

  return statuses;
}
