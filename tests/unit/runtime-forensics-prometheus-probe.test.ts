import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  parsePrometheusMetricSample,
  runRuntimeForensicsExternalPrometheusProbe,
} from '@/lib/server/runtime-forensics-prometheus-probe';

describe('runtime forensics external Prometheus probe', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.REY30_RUNTIME_FORENSICS_PROMETHEUS_PROBE_URL;
    delete process.env.REY30_RUNTIME_FORENSICS_ALERTMANAGER_URL;
    delete process.env.REY30_RUNTIME_FORENSICS_PROMETHEUS_PROBE_TOKEN;
  });

  it('parses labelled Prometheus metrics', () => {
    const parsed = parsePrometheusMetricSample(
      [
        '# HELP rey30_runtime_forensics_webhook_delivery_failure_rate x',
        'rey30_runtime_forensics_webhook_delivery_failure_rate{source="persisted"} 0.25',
      ].join('\n'),
      'rey30_runtime_forensics_webhook_delivery_failure_rate'
    );

    expect(parsed).toEqual({
      found: true,
      value: 0.25,
      sample: 'rey30_runtime_forensics_webhook_delivery_failure_rate{source="persisted"} 0.25',
    });
  });

  it('returns ok when the external metrics scrape contains the runtime forensics metric', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('alertmanager')) {
        return new Response(JSON.stringify({ versionInfo: { version: '0.27.0' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(
        [
          '# TYPE rey30_runtime_forensics_webhook_delivery_failure_rate gauge',
          'rey30_runtime_forensics_webhook_delivery_failure_rate 0',
        ].join('\n'),
        { status: 200, headers: { 'content-type': 'text/plain' } }
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await runRuntimeForensicsExternalPrometheusProbe({
      metricsUrl: 'https://app.example.test/api/ops/metrics?token=secret',
      alertmanagerUrl: 'https://alertmanager.example.test',
      opsToken: 'ops-token',
      persist: false,
      checkedAt: '2026-04-19T12:00:00.000Z',
    });

    expect(result).toMatchObject({
      ok: true,
      status: 'ok',
      value: 0,
      sample: 'rey30_runtime_forensics_webhook_delivery_failure_rate 0',
      metricsUrl: 'https://app.example.test/api/ops/metrics?token=REDACTED',
      alertmanager: {
        status: 'ok',
        version: '0.27.0',
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://app.example.test/api/ops/metrics?token=secret',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-rey30-ops-token': 'ops-token',
        }),
      })
    );
  });

  it('returns missing when the external scrape does not include the metric', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('unrelated_metric 1', { status: 200 }))
    );

    const result = await runRuntimeForensicsExternalPrometheusProbe({
      metricsUrl: 'https://app.example.test/api/ops/metrics',
      persist: false,
      checkedAt: '2026-04-19T12:05:00.000Z',
    });

    expect(result).toMatchObject({
      ok: false,
      status: 'missing',
      value: null,
      error:
        'Metric rey30_runtime_forensics_webhook_delivery_failure_rate was not found in external scrape.',
    });
  });
});
