import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import path from 'path';
import { isAppUserRole, type AppUserRole } from '@/lib/security/user-roles';

export const STALE_METADATA_REVERT_CONFIRM_ROLES_ENV =
  'REY30_STALE_METADATA_REVERT_CONFIRM_ROLES';
const POLICY_ID = 'stale_metadata_revert_confirmation_roles';

export type StaleMetadataRevertPolicySnapshot = {
  policyId: typeof POLICY_ID;
  source: 'env' | 'persisted_config';
  envVarName?: typeof STALE_METADATA_REVERT_CONFIRM_ROLES_ENV;
  defaultRoles: AppUserRole[];
  configuredRoles: AppUserRole[];
  ignoredValues: string[];
  allowedRoles: AppUserRole[];
  evaluatedRole: AppUserRole;
  allowed: boolean;
  capturedAt: string;
  configVersion?: number;
  configUpdatedAt?: string;
};

export type StaleMetadataRevertPolicyAuditEvent = {
  id: string;
  eventType: StaleMetadataRevertPolicyAuditEventType;
  at: string;
  actorUserId: string;
  actorEmail: string;
  beforeRoles: AppUserRole[];
  afterRoles: AppUserRole[];
  reason: string | null;
};

export type StaleMetadataRevertPolicyAuditEventType =
  | 'stale_metadata_revert_allowlist_changed'
  | 'stale_metadata_revert_allowlist_reset_to_env';

export type StaleMetadataRevertPolicyAuditEventTypeFilter =
  | 'all'
  | StaleMetadataRevertPolicyAuditEventType;

export type StaleMetadataRevertPolicyConfigRecord = {
  policyId: typeof POLICY_ID;
  version: number;
  allowedRoles: AppUserRole[];
  updatedAt: string;
  updatedByUserId: string;
  updatedByEmail: string;
  auditTrail: StaleMetadataRevertPolicyAuditEvent[];
};

export type StaleMetadataRevertPolicyAuditReportFormat = 'json' | 'markdown';

export type StaleMetadataRevertPolicyAuditPagination = {
  limit: number;
  offset: number;
  total: number;
  hasMore: boolean;
  nextOffset: number | null;
};

export type StaleMetadataRevertPolicyAuditExportScope = 'page' | 'all';

function filterAuditTrailByDateRange(
  events: StaleMetadataRevertPolicyAuditEvent[],
  params?: {
    fromMs?: number | null;
    toMs?: number | null;
  }
) {
  const fromMs = params?.fromMs ?? null;
  const toMs = params?.toMs ?? null;
  if (fromMs === null && toMs === null) {
    return events;
  }
  return events.filter((event) => {
    const eventMs = Date.parse(event.at);
    if (!Number.isFinite(eventMs)) {
      return false;
    }
    return (fromMs === null || eventMs >= fromMs) && (toMs === null || eventMs <= toMs);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function buildDefaultPolicyRoot() {
  if (process.env.NODE_ENV === 'test') {
    const poolId = process.env.VITEST_POOL_ID || 'default';
    return path.join(process.cwd(), '.vitest', 'stale-metadata-revert-policy', `${process.pid}-${poolId}`);
  }
  return path.join(process.cwd(), 'download', 'stale-metadata-revert-policy');
}

export function getStaleMetadataRevertPolicyStorageRoot() {
  return process.env.REY30_STALE_METADATA_REVERT_POLICY_ROOT?.trim() || buildDefaultPolicyRoot();
}

function getPolicyConfigPath() {
  return path.join(getStaleMetadataRevertPolicyStorageRoot(), 'config.json');
}

function getPolicyAuditPath() {
  return path.join(getStaleMetadataRevertPolicyStorageRoot(), 'audit.json');
}

function getPolicyLockPath() {
  return path.join(getStaleMetadataRevertPolicyStorageRoot(), '.policy.lock');
}

function normalizeRoleList(values: unknown): {
  roles: AppUserRole[];
  invalidValues: string[];
} {
  const rawValues = Array.isArray(values) ? values : [];
  const roles: AppUserRole[] = [];
  const invalidValues: string[] = [];

  for (const raw of rawValues) {
    const value = String(raw ?? '').trim().toUpperCase();
    if (!value) {
      continue;
    }
    if (isAppUserRole(value)) {
      roles.push(value);
    } else {
      invalidValues.push(value);
    }
  }

  return {
    roles: [...new Set<AppUserRole>(['OWNER', ...roles])],
    invalidValues: [...new Set(invalidValues)],
  };
}

function isPolicyAuditEvent(value: unknown): value is StaleMetadataRevertPolicyAuditEvent {
  if (!isRecord(value)) return false;
  return (
    (value.eventType === 'stale_metadata_revert_allowlist_changed' ||
      value.eventType === 'stale_metadata_revert_allowlist_reset_to_env') &&
    typeof value.id === 'string' &&
    typeof value.at === 'string' &&
    typeof value.actorUserId === 'string' &&
    typeof value.actorEmail === 'string' &&
    Array.isArray(value.beforeRoles) &&
    value.beforeRoles.every((role) => typeof role === 'string' && isAppUserRole(role)) &&
    Array.isArray(value.afterRoles) &&
    value.afterRoles.every((role) => typeof role === 'string' && isAppUserRole(role)) &&
    (typeof value.reason === 'string' || value.reason === null)
  );
}

function isPolicyAuditTrail(value: unknown): value is StaleMetadataRevertPolicyAuditEvent[] {
  return Array.isArray(value) && value.every(isPolicyAuditEvent);
}

function isPolicyConfigRecord(value: unknown): value is StaleMetadataRevertPolicyConfigRecord {
  if (!isRecord(value)) return false;
  return (
    value.policyId === POLICY_ID &&
    typeof value.version === 'number' &&
    Array.isArray(value.allowedRoles) &&
    value.allowedRoles.every((role) => typeof role === 'string' && isAppUserRole(role)) &&
    typeof value.updatedAt === 'string' &&
    typeof value.updatedByUserId === 'string' &&
    typeof value.updatedByEmail === 'string' &&
    Array.isArray(value.auditTrail) &&
    value.auditTrail.every(isPolicyAuditEvent)
  );
}

function readJsonFile<T>(filePath: string, validate: (value: unknown) => value is T): T | null {
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as unknown;
    return validate(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeJsonFileAtomic(filePath: string, value: unknown) {
  const tempPath = `${filePath}.${process.pid}.tmp`;
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(tempPath, JSON.stringify(value, null, 2), 'utf-8');
  try {
    renameSync(tempPath, filePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === 'EEXIST' || code === 'EPERM' || code === 'ENOTEMPTY') {
      rmSync(filePath, { force: true });
      renameSync(tempPath, filePath);
      return;
    }
    rmSync(tempPath, { force: true });
    throw error;
  }
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withPolicyWriteLock<T>(work: () => Promise<T>) {
  const root = getStaleMetadataRevertPolicyStorageRoot();
  mkdirSync(root, { recursive: true });
  const lockPath = getPolicyLockPath();
  const deadline = Date.now() + 2_000;

  while (true) {
    try {
      mkdirSync(lockPath);
      break;
    } catch (error) {
      const code =
        typeof error === 'object' && error && 'code' in error
          ? String((error as { code?: unknown }).code)
          : '';
      if (code !== 'EEXIST') {
        throw error;
      }
      if (Date.now() >= deadline) {
        throw new Error('STALE_METADATA_REVERT_POLICY_LOCK_TIMEOUT');
      }
      await sleep(25);
    }
  }

  try {
    return await work();
  } finally {
    rmSync(lockPath, { recursive: true, force: true });
  }
}

export function normalizeStaleMetadataRevertPolicyRoles(values: unknown) {
  return normalizeRoleList(values);
}

export function readStaleMetadataRevertPolicyConfig() {
  return readJsonFile(getPolicyConfigPath(), isPolicyConfigRecord);
}

export function readStaleMetadataRevertPolicyAuditTrail() {
  const standaloneTrail = readJsonFile(getPolicyAuditPath(), isPolicyAuditTrail);
  if (standaloneTrail) {
    return standaloneTrail;
  }
  return readStaleMetadataRevertPolicyConfig()?.auditTrail ?? [];
}

export function isStaleMetadataRevertPolicyAuditEventType(
  value: string
): value is StaleMetadataRevertPolicyAuditEventType {
  return (
    value === 'stale_metadata_revert_allowlist_changed' ||
    value === 'stale_metadata_revert_allowlist_reset_to_env'
  );
}

function writePolicyAuditTrailAtomic(events: StaleMetadataRevertPolicyAuditEvent[]) {
  writeJsonFileAtomic(getPolicyAuditPath(), events.slice(-1000));
}

export function paginateStaleMetadataRevertPolicyAuditTrail(params?: {
  limit?: number;
  offset?: number;
  eventType?: StaleMetadataRevertPolicyAuditEventTypeFilter;
  actor?: string;
  fromMs?: number | null;
  toMs?: number | null;
}) {
  const parsedLimit = Math.min(Math.max(params?.limit ?? 50, 1), 250);
  const parsedOffset = Math.max(params?.offset ?? 0, 0);
  const actorFilter = params?.actor?.trim().toLowerCase() ?? '';
  const allEvents = readStaleMetadataRevertPolicyAuditTrail();
  const filteredByEventType =
    params?.eventType && params.eventType !== 'all'
      ? allEvents.filter((event) => event.eventType === params.eventType)
      : allEvents;
  const filteredEvents = actorFilter
    ? filteredByEventType.filter(
        (event) =>
          event.actorUserId.toLowerCase().includes(actorFilter) ||
          event.actorEmail.toLowerCase().includes(actorFilter)
      )
    : filteredByEventType;
  const filteredByDate = filterAuditTrailByDateRange(filteredEvents, {
    fromMs: params?.fromMs,
    toMs: params?.toMs,
  });
  const orderedEvents = [...filteredByDate].reverse();
  const events = orderedEvents.slice(parsedOffset, parsedOffset + parsedLimit);
  const pagination: StaleMetadataRevertPolicyAuditPagination = {
    limit: parsedLimit,
    offset: parsedOffset,
    total: filteredByDate.length,
    hasMore: parsedOffset + parsedLimit < filteredByDate.length,
    nextOffset: parsedOffset + parsedLimit < filteredByDate.length ? parsedOffset + parsedLimit : null,
  };
  return {
    events,
    allEvents,
    filteredEvents: filteredByDate,
    pagination,
  };
}

export async function updateStaleMetadataRevertPolicyConfig(params: {
  allowedRoles: unknown;
  actorUserId: string;
  actorEmail: string;
  reason?: string | null;
}) {
  const normalized = normalizeRoleList(params.allowedRoles);
  if (normalized.invalidValues.length > 0) {
    return {
      success: false as const,
      invalidValues: normalized.invalidValues,
    };
  }

  return withPolicyWriteLock(async () => {
    const existing = readStaleMetadataRevertPolicyConfig();
    const now = new Date().toISOString();
    const beforeRoles = existing?.allowedRoles ?? ['OWNER'];
    const event: StaleMetadataRevertPolicyAuditEvent = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      eventType: 'stale_metadata_revert_allowlist_changed',
      at: now,
      actorUserId: params.actorUserId,
      actorEmail: params.actorEmail,
      beforeRoles,
      afterRoles: normalized.roles,
      reason: params.reason?.trim() || null,
    };
    const auditTrail = [...readStaleMetadataRevertPolicyAuditTrail(), event].slice(-1000);
    const record: StaleMetadataRevertPolicyConfigRecord = {
      policyId: POLICY_ID,
      version: (existing?.version ?? 0) + 1,
      allowedRoles: normalized.roles,
      updatedAt: now,
      updatedByUserId: params.actorUserId,
      updatedByEmail: params.actorEmail,
      auditTrail: auditTrail.slice(-100),
    };

    writePolicyAuditTrailAtomic(auditTrail);
    writeJsonFileAtomic(getPolicyConfigPath(), record);
    return {
      success: true as const,
      config: record,
      event,
      invalidValues: [] as string[],
    };
  });
}

export async function resetStaleMetadataRevertPolicyConfigToEnv(params: {
  actorUserId: string;
  actorEmail: string;
  reason?: string | null;
}) {
  return withPolicyWriteLock(async () => {
    const existing = readStaleMetadataRevertPolicyConfig();
    const envPolicy = getStaleMetadataRevertAllowedRolesFromEnv();
    const now = new Date().toISOString();
    const event: StaleMetadataRevertPolicyAuditEvent = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      eventType: 'stale_metadata_revert_allowlist_reset_to_env',
      at: now,
      actorUserId: params.actorUserId,
      actorEmail: params.actorEmail,
      beforeRoles: existing?.allowedRoles ?? envPolicy.allowedRoles,
      afterRoles: envPolicy.allowedRoles,
      reason: params.reason?.trim() || null,
    };
    writePolicyAuditTrailAtomic([...readStaleMetadataRevertPolicyAuditTrail(), event].slice(-1000));
    rmSync(getPolicyConfigPath(), { force: true });

    return {
      success: true as const,
      config: null,
      event,
    };
  });
}

export function clearStaleMetadataRevertPolicyConfigForTest() {
  const root = getStaleMetadataRevertPolicyStorageRoot();
  if (existsSync(root)) {
    rmSync(root, { recursive: true, force: true });
  }
  try {
    unlinkSync(getPolicyConfigPath());
  } catch {
    // noop
  }
}

export function getStaleMetadataRevertAllowedRolesFromEnv(rawValue?: string): {
  defaultRoles: AppUserRole[];
  configuredRoles: AppUserRole[];
  ignoredValues: string[];
  allowedRoles: AppUserRole[];
} {
  const defaultRoles: AppUserRole[] = ['OWNER'];
  const configuredRoles: AppUserRole[] = [];
  const ignoredValues: string[] = [];

  for (const value of (rawValue ?? process.env[STALE_METADATA_REVERT_CONFIRM_ROLES_ENV] ?? '')
    .split(',')
    .map((role) => role.trim().toUpperCase())
    .filter(Boolean)) {
    if (isAppUserRole(value)) {
      configuredRoles.push(value);
    } else {
      ignoredValues.push(value);
    }
  }

  return {
    defaultRoles,
    configuredRoles: [...new Set(configuredRoles)],
    ignoredValues: [...new Set(ignoredValues)],
    allowedRoles: [...new Set<AppUserRole>([...defaultRoles, ...configuredRoles])],
  };
}

export function createStaleMetadataRevertPolicySnapshot(params: {
  evaluatedRole: AppUserRole;
  capturedAt?: string;
  rawEnvValue?: string;
}): StaleMetadataRevertPolicySnapshot {
  const persistedConfig = params.rawEnvValue === undefined ? readStaleMetadataRevertPolicyConfig() : null;
  if (persistedConfig) {
    const allowedRoles = [...new Set<AppUserRole>(['OWNER', ...persistedConfig.allowedRoles])];
    return {
      policyId: POLICY_ID,
      source: 'persisted_config',
      defaultRoles: ['OWNER'],
      configuredRoles: persistedConfig.allowedRoles,
      ignoredValues: [],
      allowedRoles,
      evaluatedRole: params.evaluatedRole,
      allowed: allowedRoles.includes(params.evaluatedRole),
      capturedAt: params.capturedAt ?? new Date().toISOString(),
      configVersion: persistedConfig.version,
      configUpdatedAt: persistedConfig.updatedAt,
    };
  }

  const rolePolicy = getStaleMetadataRevertAllowedRolesFromEnv(params.rawEnvValue);
  return {
    policyId: POLICY_ID,
    source: 'env',
    envVarName: STALE_METADATA_REVERT_CONFIRM_ROLES_ENV,
    defaultRoles: rolePolicy.defaultRoles,
    configuredRoles: rolePolicy.configuredRoles,
    ignoredValues: rolePolicy.ignoredValues,
    allowedRoles: rolePolicy.allowedRoles,
    evaluatedRole: params.evaluatedRole,
    allowed: rolePolicy.allowedRoles.includes(params.evaluatedRole),
    capturedAt: params.capturedAt ?? new Date().toISOString(),
  };
}

export function canConfirmStaleMetadataRevert(params: {
  role: AppUserRole;
  rawEnvValue?: string;
}) {
  return createStaleMetadataRevertPolicySnapshot({
    evaluatedRole: params.role,
    rawEnvValue: params.rawEnvValue,
  }).allowed;
}

export function createStaleMetadataRevertPolicyAuditReport(params: {
  config: StaleMetadataRevertPolicyConfigRecord | null;
  policySnapshot: StaleMetadataRevertPolicySnapshot;
  auditTrail?: StaleMetadataRevertPolicyAuditEvent[];
  eventTypeFilter?: StaleMetadataRevertPolicyAuditEventTypeFilter;
  actorFilter?: string;
  dateFromFilter?: string | null;
  dateToFilter?: string | null;
  fromMs?: number | null;
  toMs?: number | null;
  exportScope?: StaleMetadataRevertPolicyAuditExportScope;
  totalAuditCount?: number;
  pagination?: StaleMetadataRevertPolicyAuditPagination | null;
  format: StaleMetadataRevertPolicyAuditReportFormat;
}) {
  const allAuditTrail = params.auditTrail ?? readStaleMetadataRevertPolicyAuditTrail();
  const actorFilter = params.actorFilter?.trim().toLowerCase() ?? '';
  const eventTypeFilteredTrail =
    params.eventTypeFilter && params.eventTypeFilter !== 'all'
      ? allAuditTrail.filter((event) => event.eventType === params.eventTypeFilter)
      : allAuditTrail;
  const auditTrail = eventTypeFilteredTrail.filter((event) =>
    actorFilter
      ? event.actorUserId.toLowerCase().includes(actorFilter) ||
        event.actorEmail.toLowerCase().includes(actorFilter)
      : true
  );
  const dateFilteredAuditTrail = filterAuditTrailByDateRange(auditTrail, {
    fromMs: params.fromMs,
    toMs: params.toMs,
  });
  const payload = {
    kind: 'stale_metadata_revert_policy_audit',
    generatedAt: new Date().toISOString(),
    configured: Boolean(params.config),
    eventTypeFilter: params.eventTypeFilter ?? 'all',
    actorFilter: params.actorFilter?.trim() || null,
    dateFromFilter: params.dateFromFilter?.trim() || null,
    dateToFilter: params.dateToFilter?.trim() || null,
    exportScope: params.exportScope ?? 'all',
    auditCount: dateFilteredAuditTrail.length,
    totalAuditCount: params.totalAuditCount ?? dateFilteredAuditTrail.length,
    pagination: params.pagination ?? null,
    policySnapshot: params.policySnapshot,
    config: params.config
      ? {
          policyId: params.config.policyId,
          version: params.config.version,
          allowedRoles: params.config.allowedRoles,
          updatedAt: params.config.updatedAt,
          updatedByUserId: params.config.updatedByUserId,
          updatedByEmail: params.config.updatedByEmail,
        }
      : null,
    auditTrail: dateFilteredAuditTrail,
  };

  if (params.format === 'json') {
    return JSON.stringify(payload, null, 2);
  }

  const lines = [
    '# Stale Metadata Revert Policy Audit',
    '',
    `Generated At: ${payload.generatedAt}`,
    `Configured: ${payload.configured ? 'true' : 'false'}`,
    `Event Type Filter: ${payload.eventTypeFilter}`,
    `Actor Filter: ${payload.actorFilter ?? 'none'}`,
    `Date From Filter: ${payload.dateFromFilter ?? 'none'}`,
    `Date To Filter: ${payload.dateToFilter ?? 'none'}`,
    `Export Scope: ${payload.exportScope}`,
    `Audit Count: ${payload.auditCount}`,
    `Total Audit Count: ${payload.totalAuditCount}`,
    ...(payload.pagination
      ? [
          `Limit: ${payload.pagination.limit}`,
          `Offset: ${payload.pagination.offset}`,
          `Has More: ${payload.pagination.hasMore ? 'true' : 'false'}`,
          `Next Offset: ${payload.pagination.nextOffset ?? 'none'}`,
        ]
      : []),
    `Policy Source: ${params.policySnapshot.source}`,
    `Allowed Roles: ${params.policySnapshot.allowedRoles.join(', ')}`,
    `Evaluated Role: ${params.policySnapshot.evaluatedRole}`,
    `Allowed: ${params.policySnapshot.allowed ? 'true' : 'false'}`,
  ];

  if (payload.config) {
    lines.push(
      `Config Version: ${payload.config.version}`,
      `Updated At: ${payload.config.updatedAt}`,
      `Updated By: ${payload.config.updatedByEmail}`
    );
  }

  lines.push('', '## Allowlist Change Events');
  if (dateFilteredAuditTrail.length === 0) {
    lines.push('', 'No persisted allowlist changes recorded.');
  } else {
    for (const event of dateFilteredAuditTrail) {
      lines.push(
        '',
        `### ${event.id}`,
        `- eventType: ${event.eventType}`,
        `- at: ${event.at}`,
        `- actorUserId: ${event.actorUserId}`,
        `- actorEmail: ${event.actorEmail}`,
        `- beforeRoles: ${event.beforeRoles.join(', ')}`,
        `- afterRoles: ${event.afterRoles.join(', ')}`,
        `- reason: ${event.reason ?? 'none'}`
      );
    }
  }

  return `${lines.join('\n')}\n`;
}

export function createStaleMetadataRevertPolicyAuditReportFilename(
  format: StaleMetadataRevertPolicyAuditReportFormat
) {
  const extension = format === 'json' ? 'json' : 'md';
  return `stale-metadata-revert-policy-audit.${extension}`;
}
