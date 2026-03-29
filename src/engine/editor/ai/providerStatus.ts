import type { APIConfig } from '@/lib/api-config';

export interface BackendProviderStatus {
  openai: boolean;
  meshy: boolean;
  runway: boolean;
  loaded: boolean;
}

export type CapabilityStatus = {
  chatReady: boolean;
  imageReady: boolean;
  openAIVideoReady: boolean;
  runwayVideoReady: boolean;
  meshyReady: boolean;
};

export const DEFAULT_BACKEND_PROVIDER_STATUS: BackendProviderStatus = {
  openai: false,
  meshy: false,
  runway: false,
  loaded: false,
};

export function resolveCapabilityStatus(
  config: APIConfig,
  backendStatus: BackendProviderStatus
): CapabilityStatus {
  const openaiEnabled = !!config.openai.enabled;
  const meshyEnabled = !!config.meshy.enabled;
  const runwayEnabled = !!config.runway.enabled;

  const openaiProviderReady =
    openaiEnabled && (!!config.openai.apiKey || backendStatus.openai);
  const meshyProviderReady =
    meshyEnabled && (!!config.meshy.apiKey || backendStatus.meshy);
  const runwayProviderReady =
    runwayEnabled && (!!config.runway.apiKey || backendStatus.runway);

  return {
    chatReady:
      config.routing.chat === 'local'
        ? true
        : openaiProviderReady && config.openai.capabilities.chat,
    imageReady: openaiProviderReady && config.openai.capabilities.image,
    openAIVideoReady: openaiProviderReady && config.openai.capabilities.video,
    runwayVideoReady: runwayProviderReady && config.runway.capabilities.video,
    meshyReady: meshyProviderReady && config.meshy.capabilities.threeD,
  };
}

export async function fetchBackendProviderStatus(): Promise<BackendProviderStatus> {
  try {
    const [openaiResponse, meshyResponse, runwayResponse] = await Promise.all([
      fetch('/api/openai'),
      fetch('/api/meshy'),
      fetch('/api/runway'),
    ]);

    const [openaiData, meshyData, runwayData] = await Promise.all([
      openaiResponse.json().catch(() => ({})),
      meshyResponse.json().catch(() => ({})),
      runwayResponse.json().catch(() => ({})),
    ]);

    return {
      openai: !!openaiData?.configured,
      meshy: !!meshyData?.configured,
      runway: !!runwayData?.configured,
      loaded: true,
    };
  } catch {
    return {
      ...DEFAULT_BACKEND_PROVIDER_STATUS,
      loaded: true,
    };
  }
}
