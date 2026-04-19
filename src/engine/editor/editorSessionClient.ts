import { normalizeProjectKey } from '@/lib/project-key';

const EDITOR_SESSION_STORAGE_KEY = 'rey30.editor-session-id';

export function getActiveEditorSessionId(): string | null {
  if (typeof window === 'undefined') return null;
  const sessionId = window.sessionStorage.getItem(EDITOR_SESSION_STORAGE_KEY)?.trim();
  return sessionId || null;
}

export function getOrCreateEditorSessionId(): string | null {
  if (typeof window === 'undefined') return null;
  const existing = getActiveEditorSessionId();
  if (existing) return existing;

  const sessionId = crypto.randomUUID();
  window.sessionStorage.setItem(EDITOR_SESSION_STORAGE_KEY, sessionId);
  return sessionId;
}

export function clearActiveEditorSessionId() {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(EDITOR_SESSION_STORAGE_KEY);
}

export type EditorSessionBootstrapPayload = {
  session: {
    sessionId: string;
    projectKey: string;
    serverMutationVersion: number;
    lastClientSyncAt: string;
    lastServerMutationAt: string | null;
  } | null;
  snapshot?: unknown;
  active: boolean;
};

export async function fetchEditorSessionBootstrap(params: {
  sessionId: string;
  projectKey?: string;
}): Promise<EditorSessionBootstrapPayload | null> {
  const normalizedProjectKey = params.projectKey?.trim()
    ? normalizeProjectKey(params.projectKey)
    : null;
  const query = new URLSearchParams({
    sessionId: params.sessionId,
    includeSnapshot: '1',
  });
  if (normalizedProjectKey) {
    query.set('projectKey', normalizedProjectKey);
  }

  try {
    const response = await fetch(`/api/editor-session?${query.toString()}`, {
      method: 'GET',
      cache: 'no-store',
      headers: normalizedProjectKey
        ? { 'x-rey30-project': normalizedProjectKey }
        : undefined,
    });
    if (!response.ok) {
      return null;
    }

    const payload = (await response.json().catch(() => null)) as EditorSessionBootstrapPayload | null;
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
