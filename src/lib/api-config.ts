// ============================================
// Cloud AI Provider Configuration
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

export type CloudCapability =
  | 'chat'
  | 'multimodal'
  | 'image'
  | 'video'
  | 'threeD';

export type CloudProviderId = 'openai' | 'meshy' | 'runway';
export type ChatProviderId = 'openai' | 'local';
export type VideoProviderId = 'openai' | 'runway';

export interface CapabilityToggles {
  chat: boolean;
  multimodal: boolean;
  image: boolean;
  video: boolean;
  threeD: boolean;
}

export interface OpenAIProviderConfig {
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  organization: string;
  project: string;
  textModel: string;
  multimodalModel: string;
  imageModel: string;
  videoModel: string;
  imageSize: string;
  videoSize: string;
  capabilities: CapabilityToggles;
}

export interface MeshyProviderConfig {
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  defaultArtStyle: 'realistic' | 'cartoon' | 'lowpoly' | 'voxel' | 'anime';
  defaultTopology: 'triangle' | 'quad';
  targetFaceCount: number;
  enablePbr: boolean;
  capabilities: CapabilityToggles;
}

export interface RunwayProviderConfig {
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  apiVersion: string;
  textToVideoModel: string;
  imageToVideoModel: string;
  duration: number;
  ratio: string;
  capabilities: CapabilityToggles;
}

export interface APIRoutingConfig {
  chat: ChatProviderId;
  multimodal: 'openai';
  image: 'openai';
  video: VideoProviderId;
  threeD: 'meshy';
}

export interface APIConfig {
  routing: APIRoutingConfig;
  openai: OpenAIProviderConfig;
  meshy: MeshyProviderConfig;
  runway: RunwayProviderConfig;
}

type LegacyAPIConfig = {
  meshyApiKey?: string;
  openaiApiKey?: string;
};

const API_CONFIG_KEY = 'rey30_api_config';

export const DEFAULT_API_CONFIG: APIConfig = {
  routing: {
    chat: 'openai',
    multimodal: 'openai',
    image: 'openai',
    video: 'runway',
    threeD: 'meshy',
  },
  openai: {
    enabled: false,
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    organization: '',
    project: '',
    textModel: 'gpt-4.1-mini',
    multimodalModel: 'gpt-4.1-mini',
    imageModel: 'gpt-image-1',
    videoModel: 'sora-2',
    imageSize: '1024x1024',
    videoSize: '1280x720',
    capabilities: {
      chat: true,
      multimodal: true,
      image: true,
      video: true,
      threeD: false,
    },
  },
  meshy: {
    enabled: false,
    apiKey: '',
    baseUrl: 'https://api.meshy.ai/v2',
    defaultArtStyle: 'lowpoly',
    defaultTopology: 'triangle',
    targetFaceCount: 5000,
    enablePbr: true,
    capabilities: {
      chat: false,
      multimodal: false,
      image: false,
      video: false,
      threeD: true,
    },
  },
  runway: {
    enabled: false,
    apiKey: '',
    baseUrl: 'https://api.dev.runwayml.com/v1',
    apiVersion: '2024-11-06',
    textToVideoModel: 'gen4_turbo',
    imageToVideoModel: 'gen4_turbo',
    duration: 5,
    ratio: '1280:720',
    capabilities: {
      chat: false,
      multimodal: false,
      image: false,
      video: true,
      threeD: false,
    },
  },
};

function cloneDefaults(): APIConfig {
  return JSON.parse(JSON.stringify(DEFAULT_API_CONFIG)) as APIConfig;
}

function coerceBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function coerceNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function mergeCapabilities(
  current: CapabilityToggles,
  updates?: Partial<CapabilityToggles>
): CapabilityToggles {
  if (!updates) return current;

  return {
    chat: coerceBoolean(updates.chat, current.chat),
    multimodal: coerceBoolean(updates.multimodal, current.multimodal),
    image: coerceBoolean(updates.image, current.image),
    video: coerceBoolean(updates.video, current.video),
    threeD: coerceBoolean(updates.threeD, current.threeD),
  };
}

function normalizeLegacyConfig(config: unknown): APIConfig {
  const defaults = cloneDefaults();

  if (!config || typeof config !== 'object') {
    return defaults;
  }

  const record = config as Record<string, unknown>;

  // Migrate the old flat key structure.
  if ('meshyApiKey' in record || 'openaiApiKey' in record) {
    const legacy = record as LegacyAPIConfig;

    return {
      ...defaults,
      openai: {
        ...defaults.openai,
        enabled: !!legacy.openaiApiKey,
        apiKey: legacy.openaiApiKey || '',
      },
      meshy: {
        ...defaults.meshy,
        enabled: !!legacy.meshyApiKey,
        apiKey: legacy.meshyApiKey || '',
      },
    };
  }

  const openai = typeof record.openai === 'object' && record.openai ? record.openai as Record<string, unknown> : {};
  const meshy = typeof record.meshy === 'object' && record.meshy ? record.meshy as Record<string, unknown> : {};
  const runway = typeof record.runway === 'object' && record.runway ? record.runway as Record<string, unknown> : {};
  const routing = typeof record.routing === 'object' && record.routing ? record.routing as Record<string, unknown> : {};

  return {
    routing: {
      chat: routing.chat === 'local' ? 'local' : defaults.routing.chat,
      multimodal: 'openai',
      image: 'openai',
      video: routing.video === 'openai' ? 'openai' : defaults.routing.video,
      threeD: 'meshy',
    },
    openai: {
      ...defaults.openai,
      ...openai,
      enabled: coerceBoolean(openai.enabled, defaults.openai.enabled),
      apiKey: typeof openai.apiKey === 'string' ? openai.apiKey : defaults.openai.apiKey,
      baseUrl: typeof openai.baseUrl === 'string' ? openai.baseUrl : defaults.openai.baseUrl,
      organization: typeof openai.organization === 'string' ? openai.organization : defaults.openai.organization,
      project: typeof openai.project === 'string' ? openai.project : defaults.openai.project,
      textModel: typeof openai.textModel === 'string' ? openai.textModel : defaults.openai.textModel,
      multimodalModel:
        typeof openai.multimodalModel === 'string'
          ? openai.multimodalModel
          : defaults.openai.multimodalModel,
      imageModel: typeof openai.imageModel === 'string' ? openai.imageModel : defaults.openai.imageModel,
      videoModel: typeof openai.videoModel === 'string' ? openai.videoModel : defaults.openai.videoModel,
      imageSize: typeof openai.imageSize === 'string' ? openai.imageSize : defaults.openai.imageSize,
      videoSize: typeof openai.videoSize === 'string' ? openai.videoSize : defaults.openai.videoSize,
      capabilities: mergeCapabilities(defaults.openai.capabilities, openai.capabilities as Partial<CapabilityToggles>),
    },
    meshy: {
      ...defaults.meshy,
      ...meshy,
      enabled: coerceBoolean(meshy.enabled, defaults.meshy.enabled),
      apiKey: typeof meshy.apiKey === 'string' ? meshy.apiKey : defaults.meshy.apiKey,
      baseUrl: typeof meshy.baseUrl === 'string' ? meshy.baseUrl : defaults.meshy.baseUrl,
      defaultArtStyle:
        typeof meshy.defaultArtStyle === 'string'
          ? meshy.defaultArtStyle as MeshyProviderConfig['defaultArtStyle']
          : defaults.meshy.defaultArtStyle,
      defaultTopology:
        typeof meshy.defaultTopology === 'string'
          ? meshy.defaultTopology as MeshyProviderConfig['defaultTopology']
          : defaults.meshy.defaultTopology,
      targetFaceCount: coerceNumber(meshy.targetFaceCount, defaults.meshy.targetFaceCount),
      enablePbr: coerceBoolean(meshy.enablePbr, defaults.meshy.enablePbr),
      capabilities: mergeCapabilities(defaults.meshy.capabilities, meshy.capabilities as Partial<CapabilityToggles>),
    },
    runway: {
      ...defaults.runway,
      ...runway,
      enabled: coerceBoolean(runway.enabled, defaults.runway.enabled),
      apiKey: typeof runway.apiKey === 'string' ? runway.apiKey : defaults.runway.apiKey,
      baseUrl: typeof runway.baseUrl === 'string' ? runway.baseUrl : defaults.runway.baseUrl,
      apiVersion: typeof runway.apiVersion === 'string' ? runway.apiVersion : defaults.runway.apiVersion,
      textToVideoModel:
        typeof runway.textToVideoModel === 'string'
          ? runway.textToVideoModel
          : defaults.runway.textToVideoModel,
      imageToVideoModel:
        typeof runway.imageToVideoModel === 'string'
          ? runway.imageToVideoModel
          : defaults.runway.imageToVideoModel,
      duration: coerceNumber(runway.duration, defaults.runway.duration),
      ratio: typeof runway.ratio === 'string' ? runway.ratio : defaults.runway.ratio,
      capabilities: mergeCapabilities(defaults.runway.capabilities, runway.capabilities as Partial<CapabilityToggles>),
    },
  };
}

function stripSecrets(config: APIConfig): APIConfig {
  return {
    ...config,
    openai: {
      ...config.openai,
      apiKey: '',
    },
    meshy: {
      ...config.meshy,
      apiKey: '',
    },
    runway: {
      ...config.runway,
      apiKey: '',
    },
  };
}

export function mergeAPIConfig(
  current: APIConfig,
  updates: Partial<APIConfig>
): APIConfig {
  return normalizeLegacyConfig({
    ...current,
    ...updates,
    routing: {
      ...current.routing,
      ...updates.routing,
    },
    openai: {
      ...current.openai,
      ...updates.openai,
      capabilities: mergeCapabilities(current.openai.capabilities, updates.openai?.capabilities),
    },
    meshy: {
      ...current.meshy,
      ...updates.meshy,
      capabilities: mergeCapabilities(current.meshy.capabilities, updates.meshy?.capabilities),
    },
    runway: {
      ...current.runway,
      ...updates.runway,
      capabilities: mergeCapabilities(current.runway.capabilities, updates.runway?.capabilities),
    },
  });
}

export function getAPIConfig(): APIConfig {
  if (typeof window === 'undefined') {
    return stripSecrets(cloneDefaults());
  }

  const stored = localStorage.getItem(API_CONFIG_KEY);
  if (!stored) {
    return stripSecrets(cloneDefaults());
  }

  try {
    return stripSecrets(normalizeLegacyConfig(JSON.parse(stored)));
  } catch (error) {
    console.warn('Failed to parse API config, using defaults', error);
    return stripSecrets(cloneDefaults());
  }
}

export function saveAPIConfig(config: Partial<APIConfig> | APIConfig): APIConfig {
  const current = getAPIConfig();
  const next = mergeAPIConfig(current, config as Partial<APIConfig>);
  const sanitized = stripSecrets(next);

  if (typeof window !== 'undefined') {
    localStorage.setItem(API_CONFIG_KEY, JSON.stringify(sanitized));
  }

  return sanitized;
}

export function getProviderForCapability(
  capability: CloudCapability,
  config: APIConfig = getAPIConfig()
): ChatProviderId | CloudProviderId {
  switch (capability) {
    case 'chat':
      return config.routing.chat;
    case 'multimodal':
      return config.routing.multimodal;
    case 'image':
      return config.routing.image;
    case 'video':
      return config.routing.video;
    case 'threeD':
      return config.routing.threeD;
  }
}

export function isProviderReady(
  provider: CloudProviderId,
  config: APIConfig = getAPIConfig()
): boolean {
  const entry = config[provider];
  return entry.enabled && !!entry.apiKey;
}

export function isCapabilityConfigured(
  capability: CloudCapability,
  config: APIConfig = getAPIConfig()
): boolean {
  const provider = getProviderForCapability(capability, config);

  if (provider === 'local') {
    return true;
  }

  if (!isProviderReady(provider, config)) {
    return false;
  }

  return config[provider].capabilities[capability];
}

export function isMeshyConfigured(config: APIConfig = getAPIConfig()): boolean {
  return isProviderReady('meshy', config) && config.meshy.capabilities.threeD;
}

export function isOpenAIConfigured(config: APIConfig = getAPIConfig()): boolean {
  return isProviderReady('openai', config);
}

export function isRunwayConfigured(config: APIConfig = getAPIConfig()): boolean {
  return isProviderReady('runway', config) && config.runway.capabilities.video;
}
