// ============================================
// Local AI Providers Configuration
// ============================================

export type LocalProviderId = 'ollama' | 'vllm' | 'llamacpp';

export interface OllamaConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey?: string;
  model: string;
}

export interface VllmConfig {
  enabled: boolean;
  baseUrl: string;
  model: string;
  apiKey?: string;
}

export interface LlamaCppConfig {
  enabled: boolean;
  baseUrl: string;
  contextSize: number;
  gpuLayers: number;
  apiKey?: string;
}

export interface LocalRoutingConfig {
  chat: LocalProviderId;
}

export interface LocalAIConfig {
  routing: LocalRoutingConfig;
  ollama: OllamaConfig;
  vllm: VllmConfig;
  llamacpp: LlamaCppConfig;
}

const LOCAL_AI_CONFIG_KEY = 'rey30_local_ai_config';

export const DEFAULT_LOCAL_AI_CONFIG: LocalAIConfig = {
  routing: {
    chat: 'ollama',
  },
  ollama: {
    enabled: false,
    baseUrl: 'http://localhost:11434',
    model: 'llama3.1',
  },
  vllm: {
    enabled: false,
    baseUrl: 'http://localhost:8000',
    model: 'meta-llama/Llama-3.1-8B-Instruct',
  },
  llamacpp: {
    enabled: false,
    baseUrl: 'http://localhost:8080',
    contextSize: 4096,
    gpuLayers: 35,
  },
};

function cloneDefaults(): LocalAIConfig {
  return JSON.parse(JSON.stringify(DEFAULT_LOCAL_AI_CONFIG)) as LocalAIConfig;
}

function stripSecrets(config: LocalAIConfig): LocalAIConfig {
  return {
    ...config,
    ollama: {
      ...config.ollama,
      apiKey: '',
    },
    vllm: {
      ...config.vllm,
      apiKey: '',
    },
    llamacpp: {
      ...config.llamacpp,
      apiKey: '',
    },
  };
}

export function getLocalAIConfig(): LocalAIConfig {
  if (typeof window === 'undefined') {
    return stripSecrets(cloneDefaults());
  }

  const stored = localStorage.getItem(LOCAL_AI_CONFIG_KEY);
  if (!stored) {
    return stripSecrets(cloneDefaults());
  }

  try {
    const parsed = JSON.parse(stored) as Partial<LocalAIConfig>;
    return stripSecrets({
      routing: {
        chat: parsed.routing?.chat || DEFAULT_LOCAL_AI_CONFIG.routing.chat,
      },
      ollama: {
        ...DEFAULT_LOCAL_AI_CONFIG.ollama,
        ...parsed.ollama,
      },
      vllm: {
        ...DEFAULT_LOCAL_AI_CONFIG.vllm,
        ...parsed.vllm,
      },
      llamacpp: {
        ...DEFAULT_LOCAL_AI_CONFIG.llamacpp,
        ...parsed.llamacpp,
      },
    });
  } catch (error) {
    console.warn('Failed to parse local AI config, using defaults', error);
    return stripSecrets(cloneDefaults());
  }
}

export function saveLocalAIConfig(config: LocalAIConfig): LocalAIConfig {
  const sanitized = stripSecrets(config);
  if (typeof window !== 'undefined') {
    localStorage.setItem(LOCAL_AI_CONFIG_KEY, JSON.stringify(sanitized));
  }

  return sanitized;
}

export function getPreferredLocalProvider(
  config: LocalAIConfig = getLocalAIConfig()
): LocalProviderId {
  if (config[config.routing.chat].enabled) {
    return config.routing.chat;
  }

  if (config.ollama.enabled) return 'ollama';
  if (config.vllm.enabled) return 'vllm';
  return 'llamacpp';
}
