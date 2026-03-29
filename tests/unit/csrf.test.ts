import { describe, expect, it } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import {
  applyCsrfCookie,
  clearCsrfCookie,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  generateCsrfToken,
  isValidCsrfTokenFormat,
  validateCsrfRequest,
} from '@/lib/security/csrf';

describe('CSRF security helpers', () => {
  it('generates tokens in expected format', () => {
    const token = generateCsrfToken();
    expect(isValidCsrfTokenFormat(token)).toBe(true);
    expect(token).toHaveLength(64);
  });

  it('validates matching csrf cookie and header', () => {
    const token = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const request = new NextRequest('http://localhost/api/user/api-config', {
      method: 'POST',
      headers: {
        [CSRF_HEADER_NAME]: token,
        cookie: `${CSRF_COOKIE_NAME}=${token}`,
      },
    });

    expect(validateCsrfRequest(request)).toEqual({ ok: true });
  });

  it('rejects missing or mismatched tokens', () => {
    const token = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const missingHeader = new NextRequest('http://localhost/api/user/api-config', {
      method: 'POST',
      headers: {
        cookie: `${CSRF_COOKIE_NAME}=${token}`,
      },
    });
    const mismatch = new NextRequest('http://localhost/api/user/api-config', {
      method: 'POST',
      headers: {
        [CSRF_HEADER_NAME]: token,
        cookie: `${CSRF_COOKIE_NAME}=abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd`,
      },
    });

    expect(validateCsrfRequest(missingHeader).ok).toBe(false);
    expect(validateCsrfRequest(mismatch).ok).toBe(false);
  });

  it('sets and clears csrf cookie', () => {
    const response = NextResponse.json({ ok: true });
    const token = applyCsrfCookie(
      response,
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
    );
    expect(token).toHaveLength(64);
    expect(response.cookies.get(CSRF_COOKIE_NAME)?.value).toBe(token);

    clearCsrfCookie(response);
    expect(response.cookies.get(CSRF_COOKIE_NAME)?.value).toBe('');
  });
});
