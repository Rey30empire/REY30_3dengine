export interface AssistantSurfaceAvailability {
  chatRemote: boolean;
  chatLocal: boolean;
  image: boolean;
  videoStandard: boolean;
  videoCinematic: boolean;
  model3d: boolean;
  character: boolean;
  loaded: boolean;
}

export type CapabilityStatus = {
  chat: {
    available: boolean;
    remote: boolean;
    local: boolean;
  };
  image: {
    available: boolean;
  };
  video: {
    available: boolean;
    standard: boolean;
    cinematic: boolean;
  };
  model3d: {
    available: boolean;
  };
  character: {
    available: boolean;
  };
};

export const DEFAULT_ASSISTANT_SURFACE_AVAILABILITY: AssistantSurfaceAvailability = {
  chatRemote: false,
  chatLocal: false,
  image: false,
  videoStandard: false,
  videoCinematic: false,
  model3d: false,
  character: false,
  loaded: false,
};

export function resolveCapabilityStatus(
  assistantAvailability: AssistantSurfaceAvailability
): CapabilityStatus {
  const remoteChat = assistantAvailability.chatRemote;
  const localChat = assistantAvailability.chatLocal;
  const imageAvailable = assistantAvailability.image;
  const standardVideo = assistantAvailability.videoStandard;
  const cinematicVideo = assistantAvailability.videoCinematic;
  const model3dAvailable = assistantAvailability.model3d;
  const characterAvailable = assistantAvailability.character;

  return {
    chat: {
      available: remoteChat || localChat,
      remote: remoteChat,
      local: localChat,
    },
    image: {
      available: imageAvailable,
    },
    video: {
      available: standardVideo || cinematicVideo,
      standard: standardVideo,
      cinematic: cinematicVideo,
    },
    model3d: {
      available: model3dAvailable,
    },
    character: {
      available: characterAvailable,
    },
  };
}

export async function fetchAssistantSurfaceAvailability(): Promise<AssistantSurfaceAvailability> {
  try {
    const response = await fetch('/api/assistant/status');
    const data = await response.json().catch(() => ({}));
    const capabilities =
      typeof data?.assistant === 'object' && data.assistant
        ? (data.assistant.capabilities as Record<string, any>)
        : {};
    const chatCapabilities =
      typeof capabilities.chat === 'object' && capabilities.chat
        ? capabilities.chat
        : {};
    const videoCapabilities =
      typeof capabilities.video === 'object' && capabilities.video
        ? capabilities.video
        : {};

    return {
      chatRemote: !!chatCapabilities.remote,
      chatLocal: !!chatCapabilities.local,
      image: !!capabilities.image,
      videoStandard: !!videoCapabilities.standard,
      videoCinematic: !!videoCapabilities.cinematic,
      model3d: !!capabilities.model3D,
      character: !!capabilities.character,
      loaded: true,
    };
  } catch {
    return {
      ...DEFAULT_ASSISTANT_SURFACE_AVAILABILITY,
      loaded: true,
    };
  }
}
