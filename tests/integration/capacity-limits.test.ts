import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';
import { GET as capacityGet } from '@/app/api/ops/capacity/route';

function resetRateStore() {
  (globalThis as any).__rey30RateLimitStore = new Map();
}

describe('Capacity policies and mode limits', () => {
  it('returns capacity policy for ops token', async () => {
    const response = await capacityGet(
      new NextRequest('http://localhost/api/ops/capacity', {
        headers: {
          'x-rey30-ops-token': 'test-ops-token',
        },
      })
    );
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.ok).toBe(true);
    expect(payload.capacity.aiChatPerMode.MODE_AI_FIRST).toBeGreaterThan(0);
  });

  it('enforces ai-first mode limit independently from manual mode', async () => {
    const previous = {
      REY30_RATE_LIMIT_WINDOW_MS: process.env.REY30_RATE_LIMIT_WINDOW_MS,
      REY30_LIMIT_AI_CHAT_MANUAL_PER_WINDOW: process.env.REY30_LIMIT_AI_CHAT_MANUAL_PER_WINDOW,
      REY30_LIMIT_AI_CHAT_HYBRID_PER_WINDOW: process.env.REY30_LIMIT_AI_CHAT_HYBRID_PER_WINDOW,
      REY30_LIMIT_AI_CHAT_AI_FIRST_PER_WINDOW: process.env.REY30_LIMIT_AI_CHAT_AI_FIRST_PER_WINDOW,
    };

    process.env.REY30_RATE_LIMIT_WINDOW_MS = '60000';
    process.env.REY30_LIMIT_AI_CHAT_MANUAL_PER_WINDOW = '4';
    process.env.REY30_LIMIT_AI_CHAT_HYBRID_PER_WINDOW = '4';
    process.env.REY30_LIMIT_AI_CHAT_AI_FIRST_PER_WINDOW = '2';
    resetRateStore();

    try {
      const csrfToken = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const makeReq = (mode: string) =>
        new NextRequest('http://localhost/api/ai-chat', {
          method: 'POST',
          headers: {
            origin: 'http://localhost',
            'x-rey30-engine-mode': mode,
            'x-rey30-csrf': csrfToken,
            cookie: `rey30_session=session_capacity_1; rey30_csrf=${csrfToken}`,
          },
        });

      const first = await proxy(makeReq('MODE_AI_FIRST'));
      const second = await proxy(makeReq('MODE_AI_FIRST'));
      const third = await proxy(makeReq('MODE_AI_FIRST'));

      expect(first.status).not.toBe(429);
      expect(second.status).not.toBe(429);
      expect(third.status).toBe(429);
      const thirdPayload = await third.json();
      expect(thirdPayload.mode).toBe('MODE_AI_FIRST');
      expect(thirdPayload.limit).toBe(2);

      const manualFirst = await proxy(makeReq('MODE_MANUAL'));
      const manualSecond = await proxy(makeReq('MODE_MANUAL'));
      expect(manualFirst.status).not.toBe(429);
      expect(manualSecond.status).not.toBe(429);
    } finally {
      process.env.REY30_RATE_LIMIT_WINDOW_MS = previous.REY30_RATE_LIMIT_WINDOW_MS;
      process.env.REY30_LIMIT_AI_CHAT_MANUAL_PER_WINDOW = previous.REY30_LIMIT_AI_CHAT_MANUAL_PER_WINDOW;
      process.env.REY30_LIMIT_AI_CHAT_HYBRID_PER_WINDOW = previous.REY30_LIMIT_AI_CHAT_HYBRID_PER_WINDOW;
      process.env.REY30_LIMIT_AI_CHAT_AI_FIRST_PER_WINDOW = previous.REY30_LIMIT_AI_CHAT_AI_FIRST_PER_WINDOW;
      resetRateStore();
    }
  });
});
