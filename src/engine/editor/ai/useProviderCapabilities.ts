'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AIMode, EngineWorkflowMode } from '@/types/engine';
import {
  DEFAULT_ASSISTANT_SURFACE_AVAILABILITY,
  fetchAssistantSurfaceAvailability,
  resolveCapabilityStatus,
  type AssistantSurfaceAvailability,
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
  const [assistantAvailability, setAssistantAvailability] = useState<AssistantSurfaceAvailability>(
    DEFAULT_ASSISTANT_SURFACE_AVAILABILITY
  );

  const loadAssistantAvailability = useCallback(async () => {
    const nextStatus = await fetchAssistantSurfaceAvailability();
    setAssistantAvailability(nextStatus);
    return nextStatus;
  }, []);

  const getCapabilityStatus = useCallback(
    async (): Promise<CapabilityStatus> => {
      const availability = assistantAvailability.loaded
        ? assistantAvailability
        : await loadAssistantAvailability();

      return resolveCapabilityStatus(availability);
    },
    [assistantAvailability, loadAssistantAvailability]
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

      const capabilityStatus = await getCapabilityStatus();
      const needsRemoteChat = aiMode === 'API' && !capabilityStatus.chat.remote;

      if (!cancelled) {
        setShowConfigWarning(needsRemoteChat);
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
