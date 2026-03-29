import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchRemoteText } from '@/lib/security/remote-fetch';

const ENV_KEYS = [
  'REY30_REMOTE_FETCH_ALLOWLIST',
  'REY30_REMOTE_FETCH_ALLOWLIST_ASSETS',
] as const;

type EnvSnapshot = Record<(typeof ENV_KEYS)[number], string | undefined>;

function snapshotEnv(): EnvSnapshot {
  return {
    REY30_REMOTE_FETCH_ALLOWLIST: process.env.REY30_REMOTE_FETCH_ALLOWLIST,
    REY30_REMOTE_FETCH_ALLOWLIST_ASSETS: process.env.REY30_REMOTE_FETCH_ALLOWLIST_ASSETS,
  };
}

function restoreEnv(snapshot: EnvSnapshot): void {
  for (const key of ENV_KEYS) {
    if (snapshot[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = snapshot[key];
    }
  }
}

describe('Remote fetch security policy', () => {
  let envBefore: EnvSnapshot;

  beforeEach(() => {
    envBefore = snapshotEnv();
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    restoreEnv(envBefore);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('blocks asset imports when allowlist is not configured', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await expect(
      fetchRemoteText({
        provider: 'assets',
        url: 'https://example.com/file.glb',
      })
    ).rejects.toMatchObject({
      code: 'host_allowlist_not_configured',
      status: 503,
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('blocks private network hosts even if allowlist exists', async () => {
    process.env.REY30_REMOTE_FETCH_ALLOWLIST_ASSETS = 'cdn.example.com';
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await expect(
      fetchRemoteText({
        provider: 'assets',
        url: 'http://127.0.0.1/internal.glb',
      })
    ).rejects.toMatchObject({
      code: 'loopback_not_allowlisted',
      status: 403,
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('blocks non-allowlisted public hosts before network call', async () => {
    process.env.REY30_REMOTE_FETCH_ALLOWLIST_ASSETS = 'cdn.example.com';
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await expect(
      fetchRemoteText({
        provider: 'assets',
        url: 'https://example.com/asset.glb',
      })
    ).rejects.toMatchObject({
      code: 'host_not_allowlisted',
      status: 403,
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects invalid urls, protocols, and embedded credentials', async () => {
    await expect(
      fetchRemoteText({
        provider: 'assets',
        url: 'not a url',
      })
    ).rejects.toMatchObject({
      code: 'invalid_remote_url',
      status: 400,
    });

    process.env.REY30_REMOTE_FETCH_ALLOWLIST_ASSETS = 'cdn.example.com';

    await expect(
      fetchRemoteText({
        provider: 'assets',
        url: 'ftp://cdn.example.com/file.glb',
      })
    ).rejects.toMatchObject({
      code: 'invalid_remote_protocol',
      status: 400,
    });

    await expect(
      fetchRemoteText({
        provider: 'assets',
        url: 'https://user:pass@cdn.example.com/file.glb',
      })
    ).rejects.toMatchObject({
      code: 'invalid_remote_credentials',
      status: 400,
    });
  });

  it('blocks private ipv4 addresses even when public hosts are allowlisted', async () => {
    process.env.REY30_REMOTE_FETCH_ALLOWLIST_ASSETS = 'cdn.example.com';
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await expect(
      fetchRemoteText({
        provider: 'assets',
        url: 'http://10.0.0.8/private.glb',
      })
    ).rejects.toMatchObject({
      code: 'blocked_private_ip',
      status: 403,
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('allows wildcard allowlists and returns parsed json payloads', async () => {
    process.env.REY30_REMOTE_FETCH_ALLOWLIST_ASSETS = '*.example.com';
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          'content-length': '12',
          'content-type': 'application/json',
        },
      })
    );
    vi.stubGlobal('fetch', fetchSpy);

    const { fetchRemoteJson } = await import('@/lib/security/remote-fetch');
    const result = await fetchRemoteJson({
      provider: 'assets',
      url: 'https://cdn.example.com/asset.json',
    });

    expect(result.data).toEqual({ ok: true });
    expect(result.rawText).toContain('"ok"');
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('returns null for empty json payloads and rejects invalid json', async () => {
    process.env.REY30_REMOTE_FETCH_ALLOWLIST_ASSETS = 'cdn.example.com';

    const { fetchRemoteJson } = await import('@/lib/security/remote-fetch');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('', {
          status: 200,
          headers: { 'content-length': '0' },
        })
      )
    );

    await expect(
      fetchRemoteJson({
        provider: 'assets',
        url: 'https://cdn.example.com/empty.json',
      })
    ).resolves.toMatchObject({
      data: null,
      rawText: '',
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('not json', {
          status: 200,
          headers: { 'content-length': '8' },
        })
      )
    );

    await expect(
      fetchRemoteJson({
        provider: 'assets',
        url: 'https://cdn.example.com/invalid.json',
      })
    ).rejects.toMatchObject({
      code: 'remote_invalid_json',
      status: 502,
    });
  });

  it('rejects oversized responses before reading the full body', async () => {
    process.env.REY30_REMOTE_FETCH_ALLOWLIST_ASSETS = 'cdn.example.com';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('abcdef', {
          status: 200,
          headers: { 'content-length': '6' },
        })
      )
    );

    await expect(
      fetchRemoteText({
        provider: 'assets',
        url: 'https://cdn.example.com/huge.txt',
        maxBytes: 4,
      })
    ).rejects.toMatchObject({
      code: 'remote_response_too_large',
      status: 502,
    });
  });
});
