'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getAPIConfig,
  getProviderForCapability,
  type APIConfig,
} from '@/lib/api-config';
import type { AIMode, EngineWorkflowMode } from '@/types/engine';
import {
  DEFAULT_BACKEND_PROVIDER_STATUS,
  fetchBackendProviderStatus,
  resolveCapabilityStatus,
  type BackendProviderStatus,
  type CapabilityStatus,
} from './providerStatus';

export function useAIModeWorkflowSync(params: {
  aiMode: AIMode;
  engineMode: EngineWorkflowMode;
  setAIMode: (mode: AIMode) => void;
}) {
  const { aiMode, engineMode, setAIMode } = params;

  useEffect(() => {
    if (engineMode === 'MODE_MANUAL' && aiMode !== 'OFF') {
      setAIMode('OFF');
      return;
    }

    if (engineMode === 'MODE_AI_FIRST' && aiMode === 'OFF') {
      setAIMode('API');
    }
  }, [aiMode, engineMode, setAIMode]);
}

export function useAIProviderCapabilities(params: {
  aiMode: AIMode;
  engineMode: EngineWorkflowMode;
}) {
  const { aiMode, engineMode } = params;
  const [showConfigWarning, setShowConfigWarning] = useState(false);
  const [backendProviderStatus, setBackendProviderStatus] = useState<BackendProviderStatus>(
    DEFAULT_BACKEND_PROVIDER_STATUS
  );

  const loadBackendProviderStatus = useCallback(async () => {
    const nextStatus = await fetchBackendProviderStatus();
    setBackendProviderStatus(nextStatus);
    return nextStatus;
  }, []);

  const getCapabilityStatus = useCallback(
    async (config: APIConfig): Promise<CapabilityStatus> => {
      const backend = backendProviderStatus.loaded
        ? backendProviderStatus
        : await loadBackendProviderStatus();

      return resolveCapabilityStatus(config, backend);
    },
    [backendProviderStatus, loadBackendProviderStatus]
  );

  useEffect(() => {
    let cancelled = false;

    const syncWarning = async () => {
      if (engineMode === 'MODE_MANUAL' || aiMode === 'OFF' || aiMode === 'LOCAL') {
        if (!cancelled) {
          setShowConfigWarning(false);
        }
        return;
      }

      const config = getAPIConfig();
      const capabilityStatus = await getCapabilityStatus(config);
      const needsOpenAIChat =
        aiMode === 'API' &&
        getProviderForCapability('chat', config) === 'openai' &&
        !capabilityStatus.chatReady;

      if (!cancelled) {
        setShowConfigWarning(needsOpenAIChat);
      }
    };

    void syncWarning();

    return () => {
      cancelled = true;
    };
  }, [aiMode, engineMode, getCapabilityStatus]);

  return {
    showConfigWarning,
    getCapabilityStatus,
  };
}
