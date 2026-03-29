import type { NextRequest } from 'next/server';

function isTruthy(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

export function trustProxyEnabled(): boolean {
  return isTruthy(process.env.REY30_TRUST_PROXY);
}

export function getClientIp(request: NextRequest): string | null {
  const realIp = request.headers.get('x-real-ip')?.trim() || '';
  if (trustProxyEnabled()) {
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) {
      const first = forwarded.split(',')[0]?.trim() || '';
      if (first) return first;
    }
    return realIp || null;
  }

  return realIp || null;
}
