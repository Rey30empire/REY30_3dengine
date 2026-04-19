import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { getClientIp, trustProxyEnabled } from '@/lib/security/client-ip';

describe('Client IP trust model', () => {
  const prevTrustProxy = process.env.REY30_TRUST_PROXY;

  beforeEach(() => {
    delete process.env.REY30_TRUST_PROXY;
  });

  afterEach(() => {
    if (prevTrustProxy === undefined) {
      delete process.env.REY30_TRUST_PROXY;
    } else {
      process.env.REY30_TRUST_PROXY = prevTrustProxy;
    }
  });

  it('does not trust x-forwarded-for by default', () => {
    const request = new NextRequest('http://localhost/api/test', {
      headers: {
        'x-forwarded-for': '203.0.113.10, 198.51.100.4',
      },
    });

    expect(trustProxyEnabled()).toBe(false);
    expect(getClientIp(request)).toBeNull();
  });

  it('does not trust x-real-ip when proxy trust is disabled', () => {
    const request = new NextRequest('http://localhost/api/test', {
      headers: {
        'x-real-ip': '198.51.100.24',
        'x-forwarded-for': '203.0.113.10',
      },
    });

    expect(getClientIp(request)).toBeNull();
  });

  it('uses x-forwarded-for first when proxy trust is enabled', () => {
    process.env.REY30_TRUST_PROXY = 'true';
    const request = new NextRequest('http://localhost/api/test', {
      headers: {
        'x-real-ip': '198.51.100.24',
        'x-forwarded-for': '203.0.113.10, 198.51.100.4',
      },
    });

    expect(trustProxyEnabled()).toBe(true);
    expect(getClientIp(request)).toBe('203.0.113.10');
  });

  it('uses x-real-ip as fallback when proxy trust is enabled', () => {
    process.env.REY30_TRUST_PROXY = 'true';
    const request = new NextRequest('http://localhost/api/test', {
      headers: {
        'x-real-ip': '198.51.100.24',
      },
    });

    expect(getClientIp(request)).toBe('198.51.100.24');
  });
});
