import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface RuntimeForensicsPrometheusIncident {
  id: string;
  metricName: string;
  status: 'open' | 'resolved';
  missingSince: string;
  resolvedAt: string | null;
  lastSeenAt: string;
  durationMs: number;
  severity: 'warning' | 'critical';
}

const PROMETHEUS_INCIDENT_VERSION = 1 as const;
const PROMETHEUS_INCIDENT_ROOT = '.runtime-forensics-prometheus';
const PROMETHEUS_INCIDENT_DIR = 'incidents';

interface RuntimeForensicsPrometheusIncidentDocument
  extends RuntimeForensicsPrometheusIncident {
  version: typeof PROMETHEUS_INCIDENT_VERSION;
}

function getPrometheusIncidentRoot() {
  return path.join(process.cwd(), PROMETHEUS_INCIDENT_ROOT, PROMETHEUS_INCIDENT_DIR);
}

function toIncidentPath(id: string) {
  return path.join(getPrometheusIncidentRoot(), `${encodeURIComponent(id)}.json`);
}

function normalizeIncident(
  input: Partial<RuntimeForensicsPrometheusIncident>
): RuntimeForensicsPrometheusIncident {
  const now = new Date().toISOString();
  const metricName = String(input.metricName || 'unknown_metric');
  const missingSince = String(input.missingSince || input.lastSeenAt || now);
  const id = String(input.id || `prometheus-missing:${metricName}:${missingSince}`);
  const status = input.status === 'resolved' ? 'resolved' : 'open';
  const resolvedAt = status === 'resolved'
    ? String(input.resolvedAt || input.lastSeenAt || now)
    : null;
  const lastSeenAt = String(input.lastSeenAt || resolvedAt || now);
  return {
    id,
    metricName,
    status,
    missingSince,
    resolvedAt,
    lastSeenAt,
    durationMs: Math.max(0, Math.round(Number(input.durationMs) || 0)),
    severity: input.severity === 'warning' ? 'warning' : 'critical',
  };
}

function toStoredIncident(
  document: RuntimeForensicsPrometheusIncidentDocument
): RuntimeForensicsPrometheusIncident | null {
  if (document.version !== PROMETHEUS_INCIDENT_VERSION) return null;
  return normalizeIncident(document);
}

export async function putRuntimeForensicsPrometheusIncident(
  input: Partial<RuntimeForensicsPrometheusIncident>
): Promise<RuntimeForensicsPrometheusIncident> {
  const incident = normalizeIncident(input);
  const target = toIncidentPath(incident.id);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const document: RuntimeForensicsPrometheusIncidentDocument = {
    ...incident,
    version: PROMETHEUS_INCIDENT_VERSION,
  };
  await fs.writeFile(target, JSON.stringify(document, null, 2), 'utf8');
  return incident;
}

export async function getRuntimeForensicsPrometheusIncident(
  id: string
): Promise<RuntimeForensicsPrometheusIncident | null> {
  try {
    const raw = await fs.readFile(toIncidentPath(id), 'utf8');
    return toStoredIncident(JSON.parse(raw) as RuntimeForensicsPrometheusIncidentDocument);
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'ENOENT'
    ) {
      return null;
    }
    throw error;
  }
}

export async function listRuntimeForensicsPrometheusIncidents(
  limit = 100
): Promise<RuntimeForensicsPrometheusIncident[]> {
  const entries = await fs
    .readdir(getPrometheusIncidentRoot(), { withFileTypes: true })
    .catch((error) => {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: unknown }).code === 'ENOENT'
      ) {
        return [];
      }
      throw error;
    });
  const ids = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => decodeURIComponent(entry.name.slice(0, -'.json'.length)));
  const incidents = await Promise.all(ids.map((id) => getRuntimeForensicsPrometheusIncident(id)));
  return (incidents.filter(Boolean) as RuntimeForensicsPrometheusIncident[])
    .sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt))
    .slice(0, Math.max(1, Math.min(500, Math.round(limit))));
}

export async function resolveOpenRuntimeForensicsPrometheusIncidents(params: {
  metricName: string;
  resolvedAt: string;
}): Promise<RuntimeForensicsPrometheusIncident[]> {
  const incidents = await listRuntimeForensicsPrometheusIncidents(500);
  const resolved = await Promise.all(
    incidents
      .filter(
        (incident) =>
          incident.status === 'open' && incident.metricName === params.metricName
      )
      .map((incident) => {
        const resolvedAtMs = Date.parse(params.resolvedAt);
        const missingSinceMs = Date.parse(incident.missingSince);
        const durationMs =
          Number.isFinite(resolvedAtMs) && Number.isFinite(missingSinceMs)
            ? Math.max(incident.durationMs, resolvedAtMs - missingSinceMs)
            : incident.durationMs;
        return putRuntimeForensicsPrometheusIncident({
          ...incident,
          status: 'resolved',
          resolvedAt: params.resolvedAt,
          lastSeenAt: params.resolvedAt,
          durationMs,
        });
      })
  );
  return resolved;
}

export function runtimeForensicsPrometheusIncidentsToCsv(
  incidents: RuntimeForensicsPrometheusIncident[]
): string {
  const rows = [
    [
      'id',
      'metricName',
      'status',
      'missingSince',
      'resolvedAt',
      'lastSeenAt',
      'durationMs',
      'severity',
    ],
    ...incidents.map((incident) => [
      incident.id,
      incident.metricName,
      incident.status,
      incident.missingSince,
      incident.resolvedAt || '',
      incident.lastSeenAt,
      String(incident.durationMs),
      incident.severity,
    ]),
  ];
  return rows
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
    .join('\n');
}
