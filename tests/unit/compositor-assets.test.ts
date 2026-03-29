import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  persistCompositorStill,
  persistCompositorVideoJob,
} from '@/engine/editor/compositorAssets';

describe('compositorAssets', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('includes the project header when persisting still captures', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          asset: {
            id: 'still_1',
            name: 'Still',
            type: 'texture',
            path: 'output_Rey30/assets/texture/compositor/demo/still.png',
            size: 12,
            createdAt: new Date().toISOString(),
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );
    vi.stubGlobal('fetch', fetchSpy);

    await persistCompositorStill({
      name: 'Still',
      sceneName: 'Arena',
      dataUrl: 'data:image/png;base64,AAA=',
      projectName: 'Demo Project',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0];
    expect(init?.headers).toMatchObject({
      'Content-Type': 'application/json',
      'x-rey30-project': 'Demo Project',
    });
  });

  it('includes the project header when persisting video jobs', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          asset: {
            id: 'job_1',
            name: 'Job',
            type: 'video',
            path: 'output_Rey30/assets/video/jobs/demo/job.json',
            size: 24,
            createdAt: new Date().toISOString(),
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );
    vi.stubGlobal('fetch', fetchSpy);

    await persistCompositorVideoJob({
      name: 'Job',
      sceneName: 'Arena',
      documentJson: '{"version":1}',
      projectName: 'Demo Project',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0];
    expect(init?.headers).toMatchObject({
      'Content-Type': 'application/json',
      'x-rey30-project': 'Demo Project',
    });
  });
});
