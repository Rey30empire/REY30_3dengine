import { hasRequiredRole } from './auth';
import { isLocalProviderUsable } from './local-provider-policy';
import type { AppUserRole } from './user-roles';
import type { UserScopedConfig } from './user-api-config';

export type AssistantSurfaceDiagnosticLevel = 'ok' | 'warn' | 'error' | 'unknown';

export type AssistantSurfaceDiagnosticItem = {
  available: boolean;
  level: AssistantSurfaceDiagnosticLevel;
  message: string;
};

export type AssistantSurfaceDiagnostics = {
  checkedAt: string;
  assistant: AssistantSurfaceDiagnosticItem & {
    requiresSignIn: boolean;
  };
  automation: AssistantSurfaceDiagnosticItem & {
    restricted: boolean;
  };
  characters: AssistantSurfaceDiagnosticItem & {
    configured: boolean;
    restricted: boolean;
  };
};

export type AssistantSurfaceStatus = {
  authenticated: boolean;
  experience: 'advanced' | 'product';
  access: {
    advancedTools: boolean;
    configurationAccess: boolean;
  };
  assistant: {
    available: boolean;
    capabilities: {
      chat: {
        remote: boolean;
        local: boolean;
      };
      image: boolean;
      video: {
        standard: boolean;
        cinematic: boolean;
      };
      model3D: boolean;
      character: boolean;
    };
  };
  diagnostics?: AssistantSurfaceDiagnostics;
};

function hasCloudAccess(enabled: boolean, secret: string | undefined): boolean {
  return enabled && !!secret?.trim();
}

function hasLocalChatAccess(config: UserScopedConfig): boolean {
  return (
    isLocalProviderUsable('ollama', config.localConfig.ollama) ||
    isLocalProviderUsable('vllm', config.localConfig.vllm) ||
    isLocalProviderUsable('llamacpp', config.localConfig.llamacpp)
  );
}

export function createAnonymousAssistantSurfaceStatus(): AssistantSurfaceStatus {
  return {
    authenticated: false,
    experience: 'product',
    access: {
      advancedTools: false,
      configurationAccess: false,
    },
    assistant: {
      available: false,
      capabilities: {
        chat: { remote: false, local: false },
        image: false,
        video: { standard: false, cinematic: false },
        model3D: false,
        character: false,
      },
    },
  };
}

export function deriveAssistantSurfaceStatus(params: {
  config: UserScopedConfig;
  role: AppUserRole;
  sharedAccess: boolean;
}): AssistantSurfaceStatus {
  const { config, role, sharedAccess } = params;
  const effectiveRole: AppUserRole = sharedAccess ? 'VIEWER' : role;
  const openaiAvailable = hasCloudAccess(
    !!config.apiConfig.openai.enabled,
    config.apiConfig.openai.apiKey
  );
  const meshyAvailable = hasCloudAccess(
    !!config.apiConfig.meshy.enabled,
    config.apiConfig.meshy.apiKey
  );
  const runwayAvailable = hasCloudAccess(
    !!config.apiConfig.runway.enabled,
    config.apiConfig.runway.apiKey
  );
  const localChatAvailable = hasLocalChatAccess(config);
  const advancedTools = hasRequiredRole(effectiveRole, 'EDITOR');
  const chatRemoteAvailable =
    openaiAvailable && !!config.apiConfig.openai.capabilities.chat;
  const imageAvailable =
    openaiAvailable && !!config.apiConfig.openai.capabilities.image;
  const standardVideoAvailable =
    openaiAvailable && !!config.apiConfig.openai.capabilities.video;
  const cinematicVideoAvailable =
    runwayAvailable && !!config.apiConfig.runway.capabilities.video;
  const model3DAvailable =
    meshyAvailable && !!config.apiConfig.meshy.capabilities.threeD;
  const characterAvailable = hasRequiredRole(effectiveRole, 'EDITOR');

  return {
    authenticated: true,
    experience: advancedTools ? 'advanced' : 'product',
    access: {
      advancedTools,
      configurationAccess: advancedTools,
    },
    assistant: {
      available:
        chatRemoteAvailable ||
        localChatAvailable ||
        imageAvailable ||
        standardVideoAvailable ||
        cinematicVideoAvailable ||
        model3DAvailable ||
        characterAvailable,
      capabilities: {
        chat: {
          remote: chatRemoteAvailable,
          local: localChatAvailable,
        },
        image: imageAvailable,
        video: {
          standard: standardVideoAvailable,
          cinematic: cinematicVideoAvailable,
        },
        model3D: model3DAvailable,
        character: characterAvailable,
      },
    },
  };
}
