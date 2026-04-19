'use client';

import { useEffect, useMemo, useRef } from 'react';
import { normalizeProjectKey } from '@/lib/project-key';
import {
  createEditorSessionSnapshot,
  editorSessionSnapshotToStoreState,
  isEditorSessionSnapshot,
} from '@/lib/editor-session-snapshot';
import { useEngineStore } from '@/store/editorStore';
import { fetchEditorSessionBootstrap, getOrCreateEditorSessionId } from './editorSessionClient';

const SYNC_INTERVAL_MS = 2500;
const HEARTBEAT_INTERVAL_MS = 10000;
export const EDITOR_SESSION_FORCE_SYNC_EVENT = 'rey30:editor-session-force-sync';

export function buildEditorSessionBootstrapRequest(sessionId: string, projectName: string) {
  return {
    sessionId,
    projectKey: normalizeProjectKey(projectName),
  };
}

export function requestEditorSessionBridgeSync() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(EDITOR_SESSION_FORCE_SYNC_EVENT));
}

export function useEditorSessionBridge(params: {
  enabled: boolean;
  projectName: string;
}) {
  const enabled = params.enabled;
  const projectName = params.projectName;
  const bridgeSessionId = useMemo(() => (enabled ? getOrCreateEditorSessionId() : null), [enabled]);
  const normalizedProjectKey = useMemo(() => normalizeProjectKey(projectName), [projectName]);
  const lastSnapshotRef = useRef<string>('');
  const lastSentAtRef = useRef(0);
  const knownServerMutationVersionRef = useRef(0);
  const syncInFlightRef = useRef(false);

  useEffect(() => {
    if (!enabled || !bridgeSessionId) return;

    let cancelled = false;

    const sync = async () => {
      if (cancelled || syncInFlightRef.current) return;

      const snapshot = createEditorSessionSnapshot(useEngineStore.getState());
      const serialized = JSON.stringify(snapshot);
      const now = Date.now();
      const shouldSend =
        serialized !== lastSnapshotRef.current ||
        now - lastSentAtRef.current >= HEARTBEAT_INTERVAL_MS;

      if (!shouldSend) return;

      syncInFlightRef.current = true;
      try {
        const response = await fetch('/api/editor-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-rey30-project': normalizedProjectKey || normalizeProjectKey(snapshot.projectName),
          },
          body: JSON.stringify({
            sessionId: bridgeSessionId,
            knownServerMutationVersion: knownServerMutationVersionRef.current,
            snapshot,
          }),
        });
        const payload = await response.json().catch(() => ({} as Record<string, unknown>));

        if (!response.ok || cancelled) return;

        if (typeof payload.serverMutationVersion === 'number') {
          knownServerMutationVersionRef.current = payload.serverMutationVersion;
        }

        if (payload.needsRefresh && isEditorSessionSnapshot(payload.snapshot)) {
          useEngineStore.setState(editorSessionSnapshotToStoreState(payload.snapshot));
          lastSnapshotRef.current = JSON.stringify(payload.snapshot);
          lastSentAtRef.current = Date.now();
          return;
        }

        lastSnapshotRef.current = serialized;
        lastSentAtRef.current = now;
      } catch {
        // El puente es oportunista; fallos temporales no deben romper el editor.
      } finally {
        syncInFlightRef.current = false;
      }
    };

    const bootstrap = async () => {
      const payload = await fetchEditorSessionBootstrap(
        buildEditorSessionBootstrapRequest(bridgeSessionId, projectName)
      );
      if (cancelled || !payload?.active) {
        return;
      }

      if (
        payload.session &&
        typeof payload.session.serverMutationVersion === 'number'
      ) {
        knownServerMutationVersionRef.current = payload.session.serverMutationVersion;
      }

      if (isEditorSessionSnapshot(payload.snapshot)) {
        useEngineStore.setState(editorSessionSnapshotToStoreState(payload.snapshot));
        lastSnapshotRef.current = JSON.stringify(payload.snapshot);
        lastSentAtRef.current = Date.now();
      }
    };

    void bootstrap().finally(() => {
      void sync();
    });
    const interval = window.setInterval(() => {
      void sync();
    }, SYNC_INTERVAL_MS);
    const handleForceSync = () => {
      void sync();
    };

    const handleBeforeUnload = () => {
      void fetch(`/api/editor-session?sessionId=${encodeURIComponent(bridgeSessionId)}`, {
        method: 'DELETE',
        keepalive: true,
      }).catch(() => undefined);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener(EDITOR_SESSION_FORCE_SYNC_EVENT, handleForceSync);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener(EDITOR_SESSION_FORCE_SYNC_EVENT, handleForceSync);
      void fetch(`/api/editor-session?sessionId=${encodeURIComponent(bridgeSessionId)}`, {
        method: 'DELETE',
      }).catch(() => undefined);
    };
  }, [bridgeSessionId, enabled, normalizedProjectKey, projectName]);
}
