import { afterEach, describe, expect, it, vi } from 'vitest';

describe('editor session client bootstrap', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches a bootstrap snapshot for an active editor session', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        active: true,
        session: {
          sessionId: 'bridge-1',
          projectKey: 'demo-project',
          serverMutationVersion: 2,
          lastClientSyncAt: '2026-04-02T00:00:00.000Z',
          lastServerMutationAt: '2026-04-02T00:00:05.000Z',
        },
        snapshot: {
          version: 1,
          projectName: 'demo-project',
          activeSceneId: 'scene-1',
        },
      }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const { fetchEditorSessionBootstrap } = await import('@/engine/editor/editorSessionClient');

    const payload = await fetchEditorSessionBootstrap({
      sessionId: 'bridge-1',
      projectKey: 'Demo Project',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/editor-session?sessionId=bridge-1&includeSnapshot=1&projectKey=demo_project',
      expect.objectContaining({
        method: 'GET',
        cache: 'no-store',
        headers: { 'x-rey30-project': 'demo_project' },
      })
    );
    expect(payload).toMatchObject({
      active: true,
      session: {
        sessionId: 'bridge-1',
        serverMutationVersion: 2,
      },
      snapshot: {
        projectName: 'demo-project',
      },
    });
  });

  it('returns null when the bootstrap request fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ success: false }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const { fetchEditorSessionBootstrap } = await import('@/engine/editor/editorSessionClient');

    const payload = await fetchEditorSessionBootstrap({
      sessionId: 'bridge-1',
    });

    expect(payload).toBeNull();
  });
});
