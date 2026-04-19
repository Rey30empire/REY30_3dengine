import {
  listRuntimeForensicsWebhookDeliveries,
  type RuntimeForensicsWebhookDeliveryStatus,
} from './runtime-forensics-webhook';

export const WEBHOOK_FAILURE_RATE_METRIC =
  'rey30_runtime_forensics_webhook_delivery_failure_rate';
const PROMETHEUS_SCRAPE_MISSING_DURATION_SLO =
  'runtime_forensics_prometheus_scrape_missing_duration' as const;

type RuntimeForensicsWebhookDeliveryLike = {
  status: RuntimeForensicsWebhookDeliveryStatus;
};

export interface RuntimeForensicsPrometheusHealth {
  endpoint: string;
  metricName: typeof WEBHOOK_FAILURE_RATE_METRIC;
  scrapeStatus: 'ok' | 'missing';
  missingSince: string | null;
  missingDurationMs: number;
  missingDurationSlo: {
    key: typeof PROMETHEUS_SCRAPE_MISSING_DURATION_SLO;
    objectiveMs: number;
    warningMs: number;
    currentMs: number;
    unit: 'ms';
    status: 'ok' | 'warn' | 'error';
    missingSince: string | null;
  };
  emittedAt: string;
  lastScrapedAt: string;
  lastValue: number;
  sample: string;
  failed: number;
  total: number;
  windowSize: number;
}

declare global {
  // Tracks a single-process incident window so the overview can expose duration, not just state.
  // Durable notification history is persisted separately by the admin notifications endpoint.
  // eslint-disable-next-line no-var
  var __rey30RuntimeForensicsPrometheusMissingSince: string | null | undefined;
}

export function calculateRuntimeForensicsWebhookDeliveryFailureRate(
  deliveries: RuntimeForensicsWebhookDeliveryLike[]
) {
  const considered = deliveries.filter((delivery) =>
    ['delivered', 'failed', 'blocked', 'backoff'].includes(delivery.status)
  );
  const failed = considered.filter((delivery) =>
    ['failed', 'blocked', 'backoff'].includes(delivery.status)
  ).length;
  return {
    failed,
    total: considered.length,
    rate: considered.length > 0 ? failed / considered.length : 0,
  };
}

export function formatRuntimeForensicsWebhookFailureRateMetric(
  deliveries: RuntimeForensicsWebhookDeliveryLike[]
): string {
  const { rate } = calculateRuntimeForensicsWebhookDeliveryFailureRate(deliveries);
  return [
    `# HELP ${WEBHOOK_FAILURE_RATE_METRIC} Runtime forensics webhook delivery failure rate from persisted delivery history.`,
    `# TYPE ${WEBHOOK_FAILURE_RATE_METRIC} gauge`,
    `${WEBHOOK_FAILURE_RATE_METRIC} ${Number.isFinite(rate) ? rate : 0}`,
  ].join('\n');
}

export async function runtimeForensicsWebhookFailureRateMetric(): Promise<string> {
  const deliveries = await listRuntimeForensicsWebhookDeliveries(200).catch(() => []);
  return formatRuntimeForensicsWebhookFailureRateMetric(deliveries);
}

function readEnvNumber(key: string, fallback: number): number {
  const value = Number(process.env[key]);
  return Number.isFinite(value) ? value : fallback;
}

function evaluateDurationSlo(
  currentMs: number,
  objectiveMs: number,
  warningMs: number
): 'ok' | 'warn' | 'error' {
  if (currentMs <= objectiveMs) return 'ok';
  if (currentMs <= warningMs) return 'warn';
  return 'error';
}

function updateMissingSince(scrapeStatus: 'ok' | 'missing', emittedAt: string): string | null {
  if (scrapeStatus === 'ok') {
    globalThis.__rey30RuntimeForensicsPrometheusMissingSince = null;
    return null;
  }
  if (!globalThis.__rey30RuntimeForensicsPrometheusMissingSince) {
    globalThis.__rey30RuntimeForensicsPrometheusMissingSince = emittedAt;
  }
  return globalThis.__rey30RuntimeForensicsPrometheusMissingSince;
}

function buildMissingDurationSlo(params: {
  scrapeStatus: 'ok' | 'missing';
  emittedAt: string;
}) {
  const missingSince = updateMissingSince(params.scrapeStatus, params.emittedAt);
  const emittedAtMs = Date.parse(params.emittedAt);
  const missingSinceMs = missingSince ? Date.parse(missingSince) : NaN;
  const currentMs =
    missingSince && Number.isFinite(emittedAtMs) && Number.isFinite(missingSinceMs)
      ? Math.max(0, emittedAtMs - missingSinceMs)
      : 0;
  const objectiveMs = readEnvNumber(
    'REY30_SLO_RUNTIME_FORENSICS_PROMETHEUS_MISSING_DURATION_TARGET_MS',
    0
  );
  const warningMs = readEnvNumber(
    'REY30_SLO_RUNTIME_FORENSICS_PROMETHEUS_MISSING_DURATION_WARN_MS',
    60_000
  );
  return {
    key: PROMETHEUS_SCRAPE_MISSING_DURATION_SLO,
    objectiveMs,
    warningMs,
    currentMs,
    unit: 'ms' as const,
    status: evaluateDurationSlo(currentMs, objectiveMs, warningMs),
    missingSince,
  };
}

export function getRuntimeForensicsPrometheusHealth(
  deliveries: RuntimeForensicsWebhookDeliveryLike[],
  emittedAt = new Date().toISOString()
): RuntimeForensicsPrometheusHealth {
  const { failed, total, rate } = calculateRuntimeForensicsWebhookDeliveryFailureRate(deliveries);
  const sample = formatRuntimeForensicsWebhookFailureRateMetric(deliveries);
  const scrapeStatus = sample.includes(`${WEBHOOK_FAILURE_RATE_METRIC} `) ? 'ok' : 'missing';
  const missingDurationSlo = buildMissingDurationSlo({ scrapeStatus, emittedAt });
  return {
    endpoint: '/api/ops/metrics',
    metricName: WEBHOOK_FAILURE_RATE_METRIC,
    scrapeStatus,
    missingSince: missingDurationSlo.missingSince,
    missingDurationMs: missingDurationSlo.currentMs,
    missingDurationSlo,
    emittedAt,
    lastScrapedAt: emittedAt,
    lastValue: Number.isFinite(rate) ? rate : 0,
    sample,
    failed,
    total,
    windowSize: deliveries.length,
  };
}
