import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { engineTelemetry } from '@/engine/telemetry/engineTelemetry';

const requireSessionMock = vi.fn();
const authErrorToResponseMock = vi.fn((error: unknown) =>
  Response.json(
    {
      error: String(error).includes('FORBIDDEN')
        ? 'No tienes permisos para esta acción.'
        : 'Debes iniciar sesión o usar un token de acceso.',
    },
    { status: String(error).includes('FORBIDDEN') ? 403 : 401 }
  )
);
const hasValidOpsTokenMock = vi.fn(() => false);

vi.mock('@/lib/security/auth', () => ({
  requireSession: requireSessionMock,
  authErrorToResponse: authErrorToResponseMock,
}));

vi.mock('@/lib/security/ops-token', () => ({
  hasValidOpsToken: hasValidOpsTokenMock,
}));

describe('telemetry route', () => {
  beforeEach(() => {
    engineTelemetry.reset();
    requireSessionMock.mockReset();
    authErrorToResponseMock.mockClear();
    hasValidOpsTokenMock.mockReset();
    hasValidOpsTokenMock.mockReturnValue(false);
  });

  afterEach(() => {
    engineTelemetry.reset();
  });

  it('records an authenticated performance sample through POST', async () => {
    requireSessionMock.mockResolvedValue({
      id: 'user_1',
      email: 'editor@example.com',
      role: 'EDITOR',
    });

    const { POST } = await import('@/app/api/telemetry/route');
    const response = await POST(
      new NextRequest('http://localhost/api/telemetry', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          performance: {
            fps: 57,
            frameTimeMs: 17.4,
            cpuTimeMs: 8.6,
            drawCalls: 900,
            triangles: 12000,
            vertices: 36000,
            memoryUsedMb: 420,
            memoryAllocatedMb: 640,
            textures: 19,
            meshes: 16,
            audioBuffers: 2,
            runtimeState: 'PLAYING',
            source: 'route_test',
          },
        }),
      })
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.ok).toBe(true);
    expect(payload.sample.source).toBe('route_test');
    expect(payload.snapshot.totals.performanceSamples).toBe(1);
    expect(requireSessionMock).toHaveBeenCalledWith(expect.any(NextRequest), 'EDITOR');
  });

  it('rejects malformed performance payloads', async () => {
    requireSessionMock.mockResolvedValue({
      id: 'user_1',
      email: 'editor@example.com',
      role: 'EDITOR',
    });

    const { POST } = await import('@/app/api/telemetry/route');
    const response = await POST(
      new NextRequest('http://localhost/api/telemetry', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ invalid: true }),
      })
    );

    expect(response.status).toBe(400);
  });

  it('allows ops-token reads without requiring a session', async () => {
    engineTelemetry.recordPerformanceSample({
      fps: 60,
      frameTimeMs: 16.6,
      cpuTimeMs: 7.9,
      drawCalls: 840,
      triangles: 8400,
      vertices: 25200,
      memoryUsedMb: 384,
      memoryAllocatedMb: 512,
      textures: 12,
      meshes: 9,
      audioBuffers: 1,
      source: 'ops_token',
    });

    hasValidOpsTokenMock.mockReturnValue(true);
    const { GET } = await import('@/app/api/telemetry/route');
    const response = await GET(
      new NextRequest('http://localhost/api/telemetry', {
        headers: {
          'x-rey30-ops-token': 'test-ops-token',
        },
      })
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.ok).toBe(true);
    expect(payload.snapshot.performance.latest?.source).toBe('ops_token');
    expect(requireSessionMock).not.toHaveBeenCalled();
  });
});
