import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { fetchRemoteText } from '@/lib/security/remote-fetch';
import {
  readRemoteProviderCircuitState,
  resetExternalIntegrationStorageForTest,
} from '@/lib/server/external-integration-store';

const ENV_KEYS = [
  'REY30_REMOTE_FETCH_ALLOWLIST',
  'REY30_REMOTE_FETCH_ALLOWLIST_ASSETS',
  'REY30_REMOTE_FETCH_ALLOWLIST_OPENAI',
  'REY30_REMOTE_FETCH_ALLOWLIST_WEBHOOK',
  'REY30_REMOTE_FETCH_RETRY_ATTEMPTS',
  'REY30_REMOTE_FETCH_RETRY_BASE_MS',
  'REY30_REMOTE_FETCH_CIRCUIT_THRESHOLD',
  'REY30_REMOTE_FETCH_CIRCUIT_COOLDOWN_MS',
  'REY30_EXTERNAL_INTEGRATION_ROOT',
] as const;

type EnvSnapshot = Record<(typeof ENV_KEYS)[number], string | undefined>;

function snapshotEnv(): EnvSnapshot {
  return {
    REY30_REMOTE_FETCH_ALLOWLIST: process.env.REY30_REMOTE_FETCH_ALLOWLIST,
    REY30_REMOTE_FETCH_ALLOWLIST_ASSETS: process.env.REY30_REMOTE_FETCH_ALLOWLIST_ASSETS,
    REY30_REMOTE_FETCH_ALLOWLIST_OPENAI: process.env.REY30_REMOTE_FETCH_ALLOWLIST_OPENAI,
    REY30_REMOTE_FETCH_ALLOWLIST_WEBHOOK: process.env.REY30_REMOTE_FETCH_ALLOWLIST_WEBHOOK,
    REY30_REMOTE_FETCH_RETRY_ATTEMPTS: process.env.REY30_REMOTE_FETCH_RETRY_ATTEMPTS,
    REY30_REMOTE_FETCH_RETRY_BASE_MS: process.env.REY30_REMOTE_FETCH_RETRY_BASE_MS,
    REY30_REMOTE_FETCH_CIRCUIT_THRESHOLD: process.env.REY30_REMOTE_FETCH_CIRCUIT_THRESHOLD,
    REY30_REMOTE_FETCH_CIRCUIT_COOLDOWN_MS: process.env.REY30_REMOTE_FETCH_CIRCUIT_COOLDOWN_MS,
    REY30_EXTERNAL_INTEGRATION_ROOT: process.env.REY30_EXTERNAL_INTEGRATION_ROOT,
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
  let tempRoot: string;

  beforeEach(async () => {
    envBefore = snapshotEnv();
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'rey30-remote-fetch-'));
    process.env.REY30_EXTERNAL_INTEGRATION_ROOT = tempRoot;
    process.env.REY30_REMOTE_FETCH_RETRY_BASE_MS = '1';
  });

  afterEach(async () => {
    restoreEnv(envBefore);
    await resetExternalIntegrationStorageForTest();
    await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
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

  it('uses a dedicated allowlist for outbound webhook delivery', async () => {
    process.env.REY30_REMOTE_FETCH_ALLOWLIST_WEBHOOK = 'hooks.example.test';
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response('accepted', {
        status: 202,
        headers: {
          'content-length': '8',
          'content-type': 'text/plain',
        },
      })
    );
    vi.stubGlobal('fetch', fetchSpy);

    await expect(
      fetchRemoteText({
        provider: 'webhook',
        url: 'https://hooks.example.test/rey30',
        init: {
          method: 'POST',
          body: JSON.stringify({ ok: true }),
        },
      })
    ).resolves.toMatchObject({
      response: expect.objectContaining({ status: 202 }),
      text: 'accepted',
    });

    await expect(
      fetchRemoteText({
        provider: 'webhook',
        url: 'https://other.example.test/rey30',
      })
    ).rejects.toMatchObject({
      code: 'host_not_allowlisted',
      status: 403,
    });
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

  it('retries transient upstream failures before succeeding', async () => {
    process.env.REY30_REMOTE_FETCH_ALLOWLIST_OPENAI = 'api.openai.com';
    process.env.REY30_REMOTE_FETCH_RETRY_ATTEMPTS = '3';

    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(new Response('busy', { status: 503, headers: { 'retry-after': '0' } }))
      .mockResolvedValueOnce(new Response('busy', { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-length': '12' },
        })
      );
    vi.stubGlobal('fetch', fetchSpy);

    const { fetchRemoteJson } = await import('@/lib/security/remote-fetch');
    const result = await fetchRemoteJson({
      provider: 'openai',
      url: 'https://api.openai.com/v1/test',
    });

    expect(result.data).toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(
      readRemoteProviderCircuitState({ provider: 'openai', host: 'api.openai.com' })?.consecutiveFailures ?? 0
    ).toBe(0);
  });

  it('opens a durable circuit after repeated retryable failures', async () => {
    process.env.REY30_REMOTE_FETCH_ALLOWLIST_OPENAI = 'api.openai.com';
    process.env.REY30_REMOTE_FETCH_RETRY_ATTEMPTS = '1';
    process.env.REY30_REMOTE_FETCH_CIRCUIT_THRESHOLD = '2';
    process.env.REY30_REMOTE_FETCH_CIRCUIT_COOLDOWN_MS = '60000';

    const fetchSpy = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response('busy', { status: 503, headers: { 'content-length': '4' } }))
      );
    vi.stubGlobal('fetch', fetchSpy);

    await expect(
      fetchRemoteText({
        provider: 'openai',
        url: 'https://api.openai.com/v1/test',
      })
    ).resolves.toMatchObject({
      response: expect.objectContaining({ status: 503 }),
    });

    await expect(
      fetchRemoteText({
        provider: 'openai',
        url: 'https://api.openai.com/v1/test',
      })
    ).resolves.toMatchObject({
      response: expect.objectContaining({ status: 503 }),
    });

    const circuit = readRemoteProviderCircuitState({
      provider: 'openai',
      host: 'api.openai.com',
    });
    expect(circuit?.consecutiveFailures).toBe(2);
    expect((circuit?.openUntil || 0) > Date.now()).toBe(true);

    await expect(
      fetchRemoteText({
        provider: 'openai',
        url: 'https://api.openai.com/v1/test',
      })
    ).rejects.toMatchObject({
      code: 'provider_circuit_open',
      status: 503,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
