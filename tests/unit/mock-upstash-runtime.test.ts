import { afterEach, describe, expect, it } from 'vitest';
import { startMockUpstashServer } from '../../scripts/mock-upstash-runtime.mjs';

type MockServerHandle = Awaited<ReturnType<typeof startMockUpstashServer>>;

const startedServers: MockServerHandle[] = [];

afterEach(async () => {
  while (startedServers.length > 0) {
    const server = startedServers.pop();
    await server?.stop?.().catch(() => undefined);
  }
});

describe('mock Upstash runtime', () => {
  it('supports the pipeline commands used by the production rate limiter', async () => {
    const server = await startMockUpstashServer({ token: 'test-token' });
    startedServers.push(server);

    const response = await fetch(`${server.url}/pipeline`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify([
        ['INCR', 'rey30:rl:test'],
        ['EXPIRE', 'rey30:rl:test', 60, 'NX'],
        ['PTTL', 'rey30:rl:test'],
      ]),
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload[0]?.result).toBe(1);
    expect(payload[1]?.result).toBe(1);
    expect(Number(payload[2]?.result)).toBeGreaterThan(0);
  });
});
