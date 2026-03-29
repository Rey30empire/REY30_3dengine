import type { NextRequest, NextResponse } from 'next/server';

export const CSRF_COOKIE_NAME = 'rey30_csrf';
export const CSRF_HEADER_NAME = 'x-rey30-csrf';

const CSRF_TOKEN_BYTES = 32;
const CSRF_TOKEN_HEX_LENGTH = CSRF_TOKEN_BYTES * 2;
const CSRF_COOKIE_SECURE = process.env.NODE_ENV === 'production';
const CSRF_COOKIE_SAMESITE: 'strict' | 'lax' =
  process.env.NODE_ENV === 'production' ? 'strict' : 'lax';
const CSRF_COOKIE_MAX_AGE_SECONDS = 14 * 24 * 60 * 60;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return diff === 0;
}

export function generateCsrfToken(): string {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) {
    throw new Error('Secure random source unavailable for CSRF token generation.');
  }
  const bytes = new Uint8Array(CSRF_TOKEN_BYTES);
  cryptoApi.getRandomValues(bytes);
  return toHex(bytes);
}

export function isValidCsrfTokenFormat(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

export function applyCsrfCookie(response: NextResponse, token: string = generateCsrfToken()): string {
  response.cookies.set({
    name: CSRF_COOKIE_NAME,
    value: token,
    httpOnly: false,
    secure: CSRF_COOKIE_SECURE,
    sameSite: CSRF_COOKIE_SAMESITE,
    path: '/',
    maxAge: CSRF_COOKIE_MAX_AGE_SECONDS,
    priority: 'high',
  });
  return token;
}

export function clearCsrfCookie(response: NextResponse): void {
  response.cookies.set({
    name: CSRF_COOKIE_NAME,
    value: '',
    httpOnly: false,
    secure: CSRF_COOKIE_SECURE,
    sameSite: CSRF_COOKIE_SAMESITE,
    path: '/',
    expires: new Date(0),
    maxAge: 0,
    priority: 'high',
  });
}

export function validateCsrfRequest(request: NextRequest): { ok: boolean; reason?: string } {
  const cookieToken = (request.cookies.get(CSRF_COOKIE_NAME)?.value || '').trim();
  const headerToken = (request.headers.get(CSRF_HEADER_NAME) || '').trim();

  if (!cookieToken || !headerToken) {
    return { ok: false, reason: 'missing_token' };
  }

  if (!isValidCsrfTokenFormat(cookieToken) || !isValidCsrfTokenFormat(headerToken)) {
    return { ok: false, reason: 'invalid_format' };
  }

  if (!constantTimeEqual(cookieToken, headerToken)) {
    return { ok: false, reason: 'token_mismatch' };
  }

  if (cookieToken.length !== CSRF_TOKEN_HEX_LENGTH || headerToken.length !== CSRF_TOKEN_HEX_LENGTH) {
    return { ok: false, reason: 'invalid_length' };
  }

  return { ok: true };
}
