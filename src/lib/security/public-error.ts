import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const CORRELATION_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

function fallbackCorrelationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `corr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createCorrelationId(request?: NextRequest): string {
  const candidate =
    request?.headers.get('x-correlation-id') ||
    request?.headers.get('x-request-id') ||
    '';
  const normalized = candidate.trim();
  if (normalized && CORRELATION_PATTERN.test(normalized)) {
    return normalized;
  }
  return fallbackCorrelationId();
}

export function logErrorWithCorrelation(
  scope: string,
  correlationId: string,
  error: unknown,
  metadata?: Record<string, unknown>
): void {
  const normalizedError = error instanceof Error
    ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      }
    : String(error);

  console.error(`[${scope}]`, {
    correlationId,
    error: normalizedError,
    ...(metadata || {}),
  });
}

export function publicErrorResponse(params: {
  status: number;
  error: string;
  correlationId: string;
  code?: string;
  extra?: Record<string, unknown>;
}): NextResponse {
  const payload: Record<string, unknown> = {
    error: params.error,
    correlationId: params.correlationId,
  };
  if (params.code) payload.code = params.code;
  if (params.extra) Object.assign(payload, params.extra);

  const response = NextResponse.json(payload, { status: params.status });
  response.headers.set('x-correlation-id', params.correlationId);
  return response;
}
