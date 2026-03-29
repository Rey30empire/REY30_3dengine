import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as sloGet } from '@/app/api/ops/slo/route';
import { GET as alertsGet } from '@/app/api/ops/alerts/route';
import { GET as metricsGet } from '@/app/api/ops/metrics/route';
import { engineTelemetry } from '@/engine/telemetry/engineTelemetry';

describe('Ops observability APIs', () => {
  it('blocks anonymous access without ops token header', async () => {
    const response = await sloGet(new NextRequest('http://localhost/api/ops/slo'));
    expect(response.status).toBe(401);
  });

  it('allows token-based access to slo, alerts and metrics', async () => {
    engineTelemetry.reset();
    engineTelemetry.recordComposeDuration(35, { mode: 'MODE_HYBRID' });
    engineTelemetry.recordPromptToSceneDuration(4200, { mode: 'MODE_AI_FIRST' });

    const headers = { 'x-rey30-ops-token': 'test-ops-token' };

    try {
      const sloResponse = await sloGet(
        new NextRequest('http://localhost/api/ops/slo', { headers })
      );
      expect(sloResponse.status).toBe(200);
      const sloPayload = await sloResponse.json();
      expect(sloPayload.ok).toBe(true);
      expect(Array.isArray(sloPayload.slo.indicators)).toBe(true);

      const alertsResponse = await alertsGet(
        new NextRequest('http://localhost/api/ops/alerts', { headers })
      );
      expect(alertsResponse.status).toBe(200);
      const alertsPayload = await alertsResponse.json();
      expect(alertsPayload.ok).toBe(true);
      expect(Array.isArray(alertsPayload.active)).toBe(true);

      const metricsResponse = await metricsGet(
        new NextRequest('http://localhost/api/ops/metrics', { headers })
      );
      expect(metricsResponse.status).toBe(200);
      const metricsText = await metricsResponse.text();
      expect(metricsText).toContain('rey30_compose_duration_ms_avg');
      expect(metricsText).toContain('rey30_slo_indicator_status');
    } finally {
      engineTelemetry.reset();
    }
  });
});
