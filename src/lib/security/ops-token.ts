import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import { isAutomatedTestRuntime } from './capacity-policy';

function extractProvidedToken(request: NextRequest): string {
  const direct = request.headers.get('x-rey30-ops-token');
  if (direct && direct.trim()) return direct.trim();

  const auth = request.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice('Bearer '.length).trim();
    if (token) return token;
  }

  return '';
}

function getExpectedOpsToken(): string {
  const configured = process.env.REY30_OPS_TOKEN;
  if (configured && configured.trim()) return configured.trim();
  if (isAutomatedTestRuntime()) return 'test-ops-token';
  return '';
}

function safeCompare(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function hasValidOpsToken(request: NextRequest): boolean {
  const expected = getExpectedOpsToken();
  if (!expected) return false;
  const provided = extractProvidedToken(request);
  if (!provided) return false;
  return safeCompare(provided, expected);
}
