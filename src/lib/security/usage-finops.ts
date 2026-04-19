import {
  ApiProvider,
  BudgetApprovalStatus,
  FinOpsRemediationStatus,
  type AppApiProvider,
  type AppBudgetApprovalStatus,
  type AppFinOpsRemediationStatus,
} from '@/lib/domain-enums';
import { db } from '@/lib/db';
import {
  estimateProviderCostUsd,
  getUserUsagePolicy,
  getUsageInsights,
  getUsageSummary,
  saveUserUsagePolicy,
  shouldIgnoreDeletedUserRace,
  type UsagePolicyInput,
  type ProviderKey,
} from '@/lib/security/usage-governance';
import type { AppUserRole } from '@/lib/security/user-roles';

const PROVIDER_TO_MODEL: Record<ProviderKey, AppApiProvider> = {
  openai: ApiProvider.OPENAI,
  meshy: ApiProvider.MESHY,
  runway: ApiProvider.RUNWAY,
  ollama: ApiProvider.OLLAMA,
  vllm: ApiProvider.VLLM,
  llamacpp: ApiProvider.LLAMACPP,
};

const MODEL_TO_PROVIDER: Record<AppApiProvider, ProviderKey> = {
  [ApiProvider.OPENAI]: 'openai',
  [ApiProvider.MESHY]: 'meshy',
  [ApiProvider.RUNWAY]: 'runway',
  [ApiProvider.OLLAMA]: 'ollama',
  [ApiProvider.VLLM]: 'vllm',
  [ApiProvider.LLAMACPP]: 'llamacpp',
};

const PROVIDERS = Object.keys(PROVIDER_TO_MODEL) as ProviderKey[];

export type UserUsageAlertProfile = {
  enabled: boolean;
  totalWarningRatio: number;
  providerWarningRatio: number;
  projectWarningRatio: number;
  includeLocalProviders: boolean;
};

export type ProjectUsageGoal = {
  projectKey: string;
  monthlyBudgetUsd: number;
  warningRatio: number;
  isActive: boolean;
};

export type ProjectUsageGoalInput = Partial<ProjectUsageGoal> & {
  projectKey: string;
  monthlyBudgetUsd: number;
};

export type ProjectUsageProviderBreakdown = Record<
  ProviderKey,
  {
    requestCount: number;
    estimatedCostUsd: number;
  }
>;

export type ProjectUsageSummaryItem = {
  projectKey: string;
  requestCount: number;
  estimatedCostUsd: number;
  monthlyBudgetUsd: number | null;
  remainingBudgetUsd: number | null;
  status: 'ok' | 'warning' | 'blocked';
  warningRatio: number | null;
  perProvider: ProjectUsageProviderBreakdown;
};

export type ProjectUsageSummary = {
  period: string;
  totals: {
    requestCount: number;
    estimatedCostUsd: number;
    projectCount: number;
  };
  projects: ProjectUsageSummaryItem[];
};

export type PersonalizedUsageAlert = {
  id: string;
  scope: 'total' | 'provider' | 'project';
  severity: 'warning' | 'critical';
  period: string;
  label: string;
  message: string;
  estimatedCostUsd: number;
  budgetUsd: number;
  ratio: number;
  threshold: number;
  provider: ProviderKey | null;
  projectKey: string | null;
};

export type FinOpsSnapshot = {
  profile: UserUsageAlertProfile;
  goals: ProjectUsageGoal[];
  projectSummary: ProjectUsageSummary;
  alerts: PersonalizedUsageAlert[];
  insights: Awaited<ReturnType<typeof getUsageInsights>>;
};

export type BudgetApprovalRequestItem = {
  id: string;
  userId: string;
  requesterEmail: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED';
  requestedMonthlyBudgetUsd: number | null;
  requestedProviderBudgets: Partial<Record<ProviderKey, number | null>>;
  requestedProjectGoals: ProjectUsageGoal[];
  reason: string | null;
  decisionNote: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedByUserId: string | null;
  resolverEmail: string | null;
};

export type BudgetApprovalRequestInput = {
  requestedMonthlyBudgetUsd?: number | null;
  requestedProviderBudgets?: Partial<Record<ProviderKey, number | null>>;
  requestedProjectGoals?: ProjectUsageGoalInput[];
  reason?: string;
};

export type EnterpriseFinOpsReport = {
  period: string;
  months: number;
  generatedAt: string;
  totals: {
    users: number;
    criticalAlerts: number;
    warningAlerts: number;
    pendingApprovals: number;
    monthlySpendUsd: number;
  };
  alerts: Array<
    PersonalizedUsageAlert & {
      userId: string;
      userEmail: string;
    }
  >;
  pendingApprovals: BudgetApprovalRequestItem[];
  users: Array<{
    userId: string;
    email: string;
    summary: Awaited<ReturnType<typeof getUsageSummary>>['totals'];
    topProjectKey: string | null;
    topProjectCostUsd: number;
  }>;
};

export type BudgetApprovalPolicyItem = {
  id: string;
  role: 'OWNER' | 'EDITOR' | 'VIEWER';
  projectKey: string | null;
  autoApproveBelowUsd: number | null;
  requireManualForProviderChanges: boolean;
  requireReason: boolean;
  alwaysRequireManual: boolean;
  enabled: boolean;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BudgetApprovalPolicyInput = {
  role: 'OWNER' | 'EDITOR' | 'VIEWER';
  projectKey?: string | null;
  autoApproveBelowUsd?: number | null;
  requireManualForProviderChanges?: boolean;
  requireReason?: boolean;
  alwaysRequireManual?: boolean;
  enabled?: boolean;
};

export type UserFinOpsAutopilotConfig = {
  enabled: boolean;
  seasonalityEnabled: boolean;
  budgetBufferRatio: number;
  lookbackMonths: number;
};

export type UserFinOpsAutopilotSuggestion = {
  period: string;
  season: 'holiday_peak' | 'summer_launch' | 'standard';
  seasonalityFactor: number;
  baselineMonthlySpendUsd: number;
  projectedMonthEndUsd: number;
  currentBudgetUsd: number;
  suggestedBudgetUsd: number;
  reason: string;
  providerSuggestions: Array<{
    provider: ProviderKey;
    currentCostUsd: number;
    share: number;
    suggestedBudgetUsd: number | null;
  }>;
};

export type UserFinOpsAutopilotSnapshot = {
  config: UserFinOpsAutopilotConfig;
  suggestion: UserFinOpsAutopilotSuggestion;
  matchingPolicies: BudgetApprovalPolicyItem[];
};

export type FinOpsIncident = {
  id: string;
  type: 'budget_alert' | 'approval_backlog' | 'spend_concentration';
  severity: 'critical' | 'high' | 'medium' | 'low';
  period: string;
  userId: string | null;
  userEmail: string | null;
  projectKey: string | null;
  provider: ProviderKey | null;
  summary: string;
  suggestedAction: string;
  estimatedImpactUsd: number;
  sourceRef: string;
};

export type EnterpriseFinOpsIncidentReport = {
  period: string;
  months: number;
  generatedAt: string;
  totals: {
    incidents: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  incidents: FinOpsIncident[];
};

export type FinOpsAutomationControl = {
  controlKey: string;
  enabled: boolean;
  windowStartUtc: string | null;
  windowEndUtc: string | null;
  cooldownMinutes: number;
  maxActionsPerRun: number;
  minSeverity: 'critical' | 'high' | 'medium' | 'low';
  allowPolicyMutations: boolean;
  allowBudgetMutations: boolean;
};

export type FinOpsAutomationControlInput = Partial<FinOpsAutomationControl>;

export type FinOpsRemediationLogItem = {
  id: string;
  period: string;
  incidentId: string;
  userId: string | null;
  actionType: string;
  status: 'PROPOSED' | 'APPLIED' | 'SKIPPED' | 'FAILED';
  reason: string;
  dryRun: boolean;
  metadata: string | null;
  appliedAt: string | null;
  createdAt: string;
};

export type FinOpsClosedLoopAction = {
  incidentId: string;
  type: 'enforce_hard_stop' | 'tighten_provider_budget' | 'create_project_guardrail' | 'harden_approval_policy';
  userId: string | null;
  reason: string;
  payload: Record<string, unknown>;
};

export type FinOpsClosedLoopRunReport = {
  period: string;
  generatedAt: string;
  dryRun: boolean;
  windowOpen: boolean;
  skippedByWindow: boolean;
  incidentsEvaluated: number;
  actionsPlanned: number;
  actionsApplied: number;
  actionsSkipped: number;
  actionsFailed: number;
  control: FinOpsAutomationControl;
  actions: Array<
    FinOpsClosedLoopAction & {
      status: 'APPLIED' | 'SKIPPED' | 'FAILED' | 'PROPOSED';
      error?: string;
    }
  >;
};

function toFixed4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function toRatio(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  if (value <= 0 || value >= 1) return fallback;
  return value;
}

function getPeriod(now = new Date()): string {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
}

function parsePeriod(period: string): Date | null {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return new Date(Date.UTC(year, month - 1, 1));
}

function shiftPeriod(period: string, offsetMonths: number): string {
  const parsed = parsePeriod(period);
  if (!parsed) return period;
  parsed.setUTCMonth(parsed.getUTCMonth() + offsetMonths);
  return getPeriod(parsed);
}

function recentPeriods(months: number, currentPeriod: string): string[] {
  const safeMonths = Math.max(1, Math.min(12, Math.floor(months)));
  const out: string[] = [];
  for (let index = safeMonths - 1; index >= 0; index -= 1) {
    out.push(shiftPeriod(currentPeriod, -index));
  }
  return out;
}

function defaultAlertProfile(): UserUsageAlertProfile {
  return {
    enabled: true,
    totalWarningRatio: 0.85,
    providerWarningRatio: 0.85,
    projectWarningRatio: 0.85,
    includeLocalProviders: false,
  };
}

function defaultAutopilotConfig(): UserFinOpsAutopilotConfig {
  return {
    enabled: true,
    seasonalityEnabled: true,
    budgetBufferRatio: 0.15,
    lookbackMonths: 6,
  };
}

function defaultAutomationControl(): FinOpsAutomationControl {
  return {
    controlKey: 'global',
    enabled: true,
    windowStartUtc: '01:00',
    windowEndUtc: '06:00',
    cooldownMinutes: 240,
    maxActionsPerRun: 15,
    minSeverity: 'high',
    allowPolicyMutations: true,
    allowBudgetMutations: true,
  };
}

function parseSeverity(
  value: string | null | undefined,
  fallback: FinOpsAutomationControl['minSeverity']
): FinOpsAutomationControl['minSeverity'] {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'critical') return 'critical';
  if (normalized === 'high') return 'high';
  if (normalized === 'medium') return 'medium';
  if (normalized === 'low') return 'low';
  return fallback;
}

function normalizeClock(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(raw.trim());
  if (!match) return null;
  const hh = String(Number(match[1])).padStart(2, '0');
  const mm = String(Number(match[2])).padStart(2, '0');
  return `${hh}:${mm}`;
}

function clockToMinutes(raw: string | null): number | null {
  const normalized = normalizeClock(raw);
  if (!normalized) return null;
  const [hh, mm] = normalized.split(':').map((value) => Number(value));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

function isWindowOpen(now: Date, start: string | null, end: string | null): boolean {
  const startMin = clockToMinutes(start);
  const endMin = clockToMinutes(end);
  if (startMin === null || endMin === null) return true;

  const current = now.getUTCHours() * 60 + now.getUTCMinutes();
  if (startMin === endMin) return true;
  if (startMin < endMin) {
    return current >= startMin && current <= endMin;
  }
  return current >= startMin || current <= endMin;
}

function clampAutopilotConfig(input: Partial<UserFinOpsAutopilotConfig>): UserFinOpsAutopilotConfig {
  const base = defaultAutopilotConfig();
  const budgetBufferRatio =
    typeof input.budgetBufferRatio === 'number' && Number.isFinite(input.budgetBufferRatio)
      ? Math.min(1, Math.max(0.02, input.budgetBufferRatio))
      : base.budgetBufferRatio;
  const lookbackMonths =
    typeof input.lookbackMonths === 'number' && Number.isFinite(input.lookbackMonths)
      ? Math.max(3, Math.min(12, Math.floor(input.lookbackMonths)))
      : base.lookbackMonths;

  return {
    enabled: typeof input.enabled === 'boolean' ? input.enabled : base.enabled,
    seasonalityEnabled:
      typeof input.seasonalityEnabled === 'boolean'
        ? input.seasonalityEnabled
        : base.seasonalityEnabled,
    budgetBufferRatio,
    lookbackMonths,
  };
}

function toPolicyItem(row: {
  id: string;
  role: AppUserRole;
  projectKey: string | null;
  autoApproveBelowUsd: number | null;
  requireManualForProviderChanges: boolean;
  requireReason: boolean;
  alwaysRequireManual: boolean;
  enabled: boolean;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): BudgetApprovalPolicyItem {
  return {
    id: row.id,
    role: row.role,
    projectKey: row.projectKey,
    autoApproveBelowUsd:
      row.autoApproveBelowUsd === null ? null : toFixed4(row.autoApproveBelowUsd),
    requireManualForProviderChanges: !!row.requireManualForProviderChanges,
    requireReason: !!row.requireReason,
    alwaysRequireManual: !!row.alwaysRequireManual,
    enabled: !!row.enabled,
    createdByUserId: row.createdByUserId || null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function defaultApprovalPolicies(): BudgetApprovalPolicyInput[] {
  return [
    {
      role: 'VIEWER',
      projectKey: null,
      autoApproveBelowUsd: null,
      requireManualForProviderChanges: true,
      requireReason: true,
      alwaysRequireManual: true,
      enabled: true,
    },
    {
      role: 'EDITOR',
      projectKey: null,
      autoApproveBelowUsd: 60,
      requireManualForProviderChanges: true,
      requireReason: true,
      alwaysRequireManual: false,
      enabled: true,
    },
    {
      role: 'OWNER',
      projectKey: null,
      autoApproveBelowUsd: null,
      requireManualForProviderChanges: false,
      requireReason: false,
      alwaysRequireManual: false,
      enabled: true,
    },
  ];
}

function providerIsLocal(provider: ProviderKey): boolean {
  return provider === 'ollama' || provider === 'vllm' || provider === 'llamacpp';
}

function budgetStatus(params: {
  spent: number;
  budget: number | null;
  warningRatio: number;
}): 'ok' | 'warning' | 'blocked' {
  if (params.budget === null || params.budget <= 0) return 'ok';
  if (params.spent > params.budget) return 'blocked';
  if (params.spent >= params.budget * params.warningRatio) return 'warning';
  return 'ok';
}

export function normalizeProjectKey(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const normalized = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9._\-\s]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 64);
  return normalized || null;
}

export async function getUserUsageAlertProfile(
  userId: string,
  options?: { persistDefaults?: boolean }
): Promise<UserUsageAlertProfile> {
  const row = await db.userUsageAlertProfile.findUnique({ where: { userId } });
  if (!row) {
    const defaults = defaultAlertProfile();
    if (options?.persistDefaults === false) {
      return defaults;
    }

    try {
      await db.userUsageAlertProfile.createMany({
        data: [
          {
            userId,
            enabled: defaults.enabled,
            totalWarningRatio: defaults.totalWarningRatio,
            providerWarningRatio: defaults.providerWarningRatio,
            projectWarningRatio: defaults.projectWarningRatio,
            includeLocalProviders: defaults.includeLocalProviders,
          },
        ],
        skipDuplicates: true,
      });
    } catch (error) {
      if (await shouldIgnoreDeletedUserRace(userId, error)) {
        return defaults;
      }
      throw error;
    }

    const ensured = await db.userUsageAlertProfile.findUnique({ where: { userId } });
    if (!ensured) {
      return defaults;
    }

    return {
      enabled: !!ensured.enabled,
      totalWarningRatio: toRatio(ensured.totalWarningRatio, defaults.totalWarningRatio),
      providerWarningRatio: toRatio(ensured.providerWarningRatio, defaults.providerWarningRatio),
      projectWarningRatio: toRatio(ensured.projectWarningRatio, defaults.projectWarningRatio),
      includeLocalProviders: !!ensured.includeLocalProviders,
    };
  }

  return {
    enabled: !!row.enabled,
    totalWarningRatio: toRatio(row.totalWarningRatio, 0.85),
    providerWarningRatio: toRatio(row.providerWarningRatio, 0.85),
    projectWarningRatio: toRatio(row.projectWarningRatio, 0.85),
    includeLocalProviders: !!row.includeLocalProviders,
  };
}

export async function saveUserUsageAlertProfile(
  userId: string,
  input: Partial<UserUsageAlertProfile>
): Promise<UserUsageAlertProfile> {
  const current = await getUserUsageAlertProfile(userId);
  const next: UserUsageAlertProfile = {
    enabled: typeof input.enabled === 'boolean' ? input.enabled : current.enabled,
    totalWarningRatio:
      typeof input.totalWarningRatio === 'number'
        ? toRatio(input.totalWarningRatio, current.totalWarningRatio)
        : current.totalWarningRatio,
    providerWarningRatio:
      typeof input.providerWarningRatio === 'number'
        ? toRatio(input.providerWarningRatio, current.providerWarningRatio)
        : current.providerWarningRatio,
    projectWarningRatio:
      typeof input.projectWarningRatio === 'number'
        ? toRatio(input.projectWarningRatio, current.projectWarningRatio)
        : current.projectWarningRatio,
    includeLocalProviders:
      typeof input.includeLocalProviders === 'boolean'
        ? input.includeLocalProviders
        : current.includeLocalProviders,
  };

  await db.userUsageAlertProfile.upsert({
    where: { userId },
    create: {
      userId,
      enabled: next.enabled,
      totalWarningRatio: next.totalWarningRatio,
      providerWarningRatio: next.providerWarningRatio,
      projectWarningRatio: next.projectWarningRatio,
      includeLocalProviders: next.includeLocalProviders,
    },
    update: {
      enabled: next.enabled,
      totalWarningRatio: next.totalWarningRatio,
      providerWarningRatio: next.providerWarningRatio,
      projectWarningRatio: next.projectWarningRatio,
      includeLocalProviders: next.includeLocalProviders,
    },
  });

  return next;
}

function normalizeGoalInput(input: ProjectUsageGoalInput): ProjectUsageGoal {
  const key = normalizeProjectKey(input.projectKey);
  if (!key) throw new Error('Project key inválido');
  const monthlyBudgetUsd = Number(input.monthlyBudgetUsd);
  if (!Number.isFinite(monthlyBudgetUsd) || monthlyBudgetUsd <= 0) {
    throw new Error('monthlyBudgetUsd debe ser mayor que 0');
  }

  const warningRatio = toRatio(
    typeof input.warningRatio === 'number' ? input.warningRatio : 0.85,
    0.85
  );

  return {
    projectKey: key,
    monthlyBudgetUsd: toFixed4(monthlyBudgetUsd),
    warningRatio,
    isActive: input.isActive !== false,
  };
}

function parseProviderBudgetJson(
  raw: string | null | undefined
): Partial<Record<ProviderKey, number | null>> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Partial<Record<ProviderKey, unknown>>;
    const output: Partial<Record<ProviderKey, number | null>> = {};
    for (const provider of PROVIDERS) {
      const value = parsed?.[provider];
      if (typeof value === 'undefined') continue;
      if (value === null) {
        output[provider] = null;
        continue;
      }
      const numeric = Number(value);
      if (Number.isFinite(numeric) && numeric >= 0) {
        output[provider] = toFixed4(numeric);
      }
    }
    return output;
  } catch {
    return {};
  }
}

function parseGoalJson(raw: string | null | undefined): ProjectUsageGoal[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed)) return [];
    const goals: ProjectUsageGoal[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const projectKey = normalizeProjectKey(String((item as { projectKey?: unknown }).projectKey || ''));
      const monthlyBudgetUsd = Number((item as { monthlyBudgetUsd?: unknown }).monthlyBudgetUsd);
      const warningRatio = Number((item as { warningRatio?: unknown }).warningRatio);
      if (!projectKey) continue;
      if (!Number.isFinite(monthlyBudgetUsd) || monthlyBudgetUsd <= 0) continue;
      goals.push({
        projectKey,
        monthlyBudgetUsd: toFixed4(monthlyBudgetUsd),
        warningRatio: toRatio(warningRatio, 0.85),
        isActive: true,
      });
    }
    return goals;
  } catch {
    return [];
  }
}

export async function getProjectUsageGoals(userId: string): Promise<ProjectUsageGoal[]> {
  const rows = await db.projectUsageGoal.findMany({
    where: { userId, isActive: true },
    orderBy: { projectKey: 'asc' },
  });
  return rows.map((row) => ({
    projectKey: row.projectKey,
    monthlyBudgetUsd: toFixed4(row.monthlyBudgetUsd),
    warningRatio: toRatio(row.warningRatio, 0.85),
    isActive: row.isActive,
  }));
}

export async function saveProjectUsageGoals(
  userId: string,
  goalsInput: ProjectUsageGoalInput[]
): Promise<ProjectUsageGoal[]> {
  const normalized = goalsInput.map(normalizeGoalInput);
  const seen = new Set<string>();

  for (const goal of normalized) {
    if (seen.has(goal.projectKey)) {
      throw new Error(`Proyecto duplicado en objetivos: ${goal.projectKey}`);
    }
    seen.add(goal.projectKey);

    await db.projectUsageGoal.upsert({
      where: {
        userId_projectKey: {
          userId,
          projectKey: goal.projectKey,
        },
      },
      create: {
        userId,
        projectKey: goal.projectKey,
        monthlyBudgetUsd: goal.monthlyBudgetUsd,
        warningRatio: goal.warningRatio,
        isActive: goal.isActive,
      },
      update: {
        monthlyBudgetUsd: goal.monthlyBudgetUsd,
        warningRatio: goal.warningRatio,
        isActive: goal.isActive,
      },
    });
  }

  await db.projectUsageGoal.updateMany({
    where: {
      userId,
      projectKey: { notIn: normalized.map((goal) => goal.projectKey) },
      isActive: true,
    },
    data: { isActive: false },
  });

  return getProjectUsageGoals(userId);
}

export async function recordProjectUsage(params: {
  userId: string;
  provider: ProviderKey;
  action: string;
  projectKey?: string | null;
  estimatedCostUsd?: number;
  estimatedUnits?: number;
}): Promise<void> {
  const normalizedProject = normalizeProjectKey(params.projectKey);
  if (!normalizedProject) return;

  const period = getPeriod();
  const estimatedCostUsd =
    typeof params.estimatedCostUsd === 'number'
      ? Math.max(0, params.estimatedCostUsd)
      : estimateProviderCostUsd(params.provider, params.action);
  const units = Number.isFinite(params.estimatedUnits) ? Math.max(0, Math.floor(params.estimatedUnits || 0)) : 0;

  await db.projectUsageLedger.upsert({
    where: {
      userId_projectKey_provider_period: {
        userId: params.userId,
        projectKey: normalizedProject,
        provider: PROVIDER_TO_MODEL[params.provider],
        period,
      },
    },
    create: {
      userId: params.userId,
      projectKey: normalizedProject,
      provider: PROVIDER_TO_MODEL[params.provider],
      period,
      requestCount: 1,
      estimatedCostUsd: toFixed4(estimatedCostUsd),
      estimatedUnits: units,
      blocked: false,
      lastAction: params.action,
      lastUsedAt: new Date(),
    },
    update: {
      requestCount: { increment: 1 },
      estimatedCostUsd: { increment: toFixed4(estimatedCostUsd) },
      estimatedUnits: { increment: units },
      blocked: false,
      lastAction: params.action,
      lastUsedAt: new Date(),
    },
  });
}

export async function getProjectUsageSummary(
  userId: string,
  period = getPeriod()
): Promise<ProjectUsageSummary> {
  const [rows, goals] = await Promise.all([
    db.projectUsageLedger.findMany({ where: { userId, period } }),
    getProjectUsageGoals(userId),
  ]);

  const goalsByProject = goals.reduce(
    (acc, goal) => {
      acc[goal.projectKey] = goal;
      return acc;
    },
    {} as Record<string, ProjectUsageGoal>
  );

  const byProject = new Map<string, ProjectUsageSummaryItem>();
  let totalRequests = 0;
  let totalCost = 0;

  for (const row of rows) {
    const provider = MODEL_TO_PROVIDER[row.provider];
    const current =
      byProject.get(row.projectKey) ||
      ({
        projectKey: row.projectKey,
        requestCount: 0,
        estimatedCostUsd: 0,
        monthlyBudgetUsd: null,
        remainingBudgetUsd: null,
        status: 'ok',
        warningRatio: null,
        perProvider: PROVIDERS.reduce(
          (acc, item) => {
            acc[item] = { requestCount: 0, estimatedCostUsd: 0 };
            return acc;
          },
          {} as ProjectUsageProviderBreakdown
        ),
      } as ProjectUsageSummaryItem);

    current.requestCount += row.requestCount;
    current.estimatedCostUsd = toFixed4(current.estimatedCostUsd + row.estimatedCostUsd);
    current.perProvider[provider].requestCount += row.requestCount;
    current.perProvider[provider].estimatedCostUsd = toFixed4(
      current.perProvider[provider].estimatedCostUsd + row.estimatedCostUsd
    );

    byProject.set(row.projectKey, current);
    totalRequests += row.requestCount;
    totalCost += row.estimatedCostUsd;
  }

  const projects = Array.from(byProject.values())
    .map((project) => {
      const goal = goalsByProject[project.projectKey];
      const budget = goal?.monthlyBudgetUsd ?? null;
      const warningRatio = goal?.warningRatio ?? null;
      const status = budgetStatus({
        spent: project.estimatedCostUsd,
        budget,
        warningRatio: warningRatio || 0.85,
      });

      return {
        ...project,
        monthlyBudgetUsd: budget,
        warningRatio,
        remainingBudgetUsd: budget === null ? null : Math.max(0, toFixed4(budget - project.estimatedCostUsd)),
        status,
      };
    })
    .sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd);

  return {
    period,
    totals: {
      requestCount: totalRequests,
      estimatedCostUsd: toFixed4(totalCost),
      projectCount: projects.length,
    },
    projects,
  };
}

function alertSeverity(status: 'ok' | 'warning' | 'blocked'): 'warning' | 'critical' {
  return status === 'blocked' ? 'critical' : 'warning';
}

export async function getPersonalizedUsageAlerts(
  userId: string,
  period = getPeriod(),
  options?: { persistDefaults?: boolean }
): Promise<PersonalizedUsageAlert[]> {
  const [profile, summary, projectSummary] = await Promise.all([
    getUserUsageAlertProfile(userId, { persistDefaults: options?.persistDefaults }),
    getUsageSummary(userId, period, { persistDefaults: options?.persistDefaults }),
    getProjectUsageSummary(userId, period),
  ]);

  if (!profile.enabled) return [];

  const alerts: PersonalizedUsageAlert[] = [];
  const totalBudget = summary.totals.monthlyBudgetUsd;
  const totalRatio = totalBudget > 0 ? summary.totals.estimatedCostUsd / totalBudget : 0;
  if (totalBudget > 0 && totalRatio >= profile.totalWarningRatio) {
    alerts.push({
      id: `total_${period}`,
      scope: 'total',
      severity: alertSeverity(summary.totals.status),
      period,
      label: 'Presupuesto global',
      message: `Consumo global en ${Math.round(totalRatio * 100)}% del presupuesto mensual.`,
      estimatedCostUsd: summary.totals.estimatedCostUsd,
      budgetUsd: totalBudget,
      ratio: toFixed4(totalRatio),
      threshold: profile.totalWarningRatio,
      provider: null,
      projectKey: null,
    });
  }

  for (const provider of PROVIDERS) {
    if (!profile.includeLocalProviders && providerIsLocal(provider)) continue;
    const item = summary.perProvider[provider];
    if (item.budgetUsd === null || item.budgetUsd <= 0) continue;
    const ratio = item.estimatedCostUsd / item.budgetUsd;
    if (ratio < profile.providerWarningRatio) continue;

    alerts.push({
      id: `provider_${provider}_${period}`,
      scope: 'provider',
      severity: alertSeverity(item.status),
      period,
      label: `Proveedor ${provider}`,
      message: `${provider} en ${Math.round(ratio * 100)}% de su límite.`,
      estimatedCostUsd: item.estimatedCostUsd,
      budgetUsd: item.budgetUsd,
      ratio: toFixed4(ratio),
      threshold: profile.providerWarningRatio,
      provider,
      projectKey: null,
    });
  }

  for (const project of projectSummary.projects) {
    if (!project.monthlyBudgetUsd || project.monthlyBudgetUsd <= 0) continue;
    const ratio = project.estimatedCostUsd / project.monthlyBudgetUsd;
    const threshold = project.warningRatio || profile.projectWarningRatio;
    if (ratio < threshold) continue;

    alerts.push({
      id: `project_${project.projectKey}_${period}`,
      scope: 'project',
      severity: alertSeverity(project.status),
      period,
      label: `Proyecto ${project.projectKey}`,
      message: `${project.projectKey} en ${Math.round(ratio * 100)}% de su objetivo mensual.`,
      estimatedCostUsd: project.estimatedCostUsd,
      budgetUsd: project.monthlyBudgetUsd,
      ratio: toFixed4(ratio),
      threshold,
      provider: null,
      projectKey: project.projectKey,
    });
  }

  return alerts.sort((a, b) => {
    if (a.severity !== b.severity) {
      return a.severity === 'critical' ? -1 : 1;
    }
    return b.estimatedCostUsd - a.estimatedCostUsd;
  });
}

export async function getFinOpsSnapshot(
  userId: string,
  options?: {
    months?: number;
    period?: string;
  }
): Promise<FinOpsSnapshot> {
  const period = options?.period || getPeriod();
  const [profile, goals, projectSummary, alerts, insights] = await Promise.all([
    getUserUsageAlertProfile(userId),
    getProjectUsageGoals(userId),
    getProjectUsageSummary(userId, period),
    getPersonalizedUsageAlerts(userId, period),
    getUsageInsights(userId, { months: options?.months, period }),
  ]);

  return {
    profile,
    goals,
    projectSummary,
    alerts,
    insights,
  };
}

function toBudgetApprovalItem(row: {
  id: string;
  userId: string;
  status: AppBudgetApprovalStatus;
  requestedMonthlyBudgetUsd: number | null;
  requestedProviderBudgetJson: string | null;
  requestedProjectGoalsJson: string | null;
  reason: string | null;
  decisionNote: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  resolvedByUserId: string | null;
  user: { email: string };
  resolvedBy: { email: string } | null;
}): BudgetApprovalRequestItem {
  return {
    id: row.id,
    userId: row.userId,
    requesterEmail: row.user.email,
    status: row.status,
    requestedMonthlyBudgetUsd:
      row.requestedMonthlyBudgetUsd === null ? null : toFixed4(row.requestedMonthlyBudgetUsd),
    requestedProviderBudgets: parseProviderBudgetJson(row.requestedProviderBudgetJson),
    requestedProjectGoals: parseGoalJson(row.requestedProjectGoalsJson),
    reason: row.reason || null,
    decisionNote: row.decisionNote || null,
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    resolvedByUserId: row.resolvedByUserId || null,
    resolverEmail: row.resolvedBy?.email || null,
  };
}

function normalizeApprovalInput(input: BudgetApprovalRequestInput): BudgetApprovalRequestInput {
  const output: BudgetApprovalRequestInput = {};

  if (typeof input.requestedMonthlyBudgetUsd === 'number') {
    if (!Number.isFinite(input.requestedMonthlyBudgetUsd) || input.requestedMonthlyBudgetUsd <= 0) {
      throw new Error('requestedMonthlyBudgetUsd debe ser mayor que 0');
    }
    output.requestedMonthlyBudgetUsd = toFixed4(input.requestedMonthlyBudgetUsd);
  }

  if (input.requestedProviderBudgets && typeof input.requestedProviderBudgets === 'object') {
    const next: Partial<Record<ProviderKey, number | null>> = {};
    for (const provider of PROVIDERS) {
      if (!Object.prototype.hasOwnProperty.call(input.requestedProviderBudgets, provider)) continue;
      const value = input.requestedProviderBudgets[provider];
      if (value === null) {
        next[provider] = null;
        continue;
      }
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric < 0) {
        throw new Error(`Budget inválido para proveedor ${provider}`);
      }
      next[provider] = toFixed4(numeric);
    }
    output.requestedProviderBudgets = next;
  }

  if (Array.isArray(input.requestedProjectGoals)) {
    output.requestedProjectGoals = input.requestedProjectGoals.map(normalizeGoalInput);
  }

  if (typeof input.reason === 'string') {
    const trimmed = input.reason.trim();
    if (trimmed) output.reason = trimmed.slice(0, 1200);
  }

  if (
    typeof output.requestedMonthlyBudgetUsd === 'undefined' &&
    (!output.requestedProviderBudgets || Object.keys(output.requestedProviderBudgets).length === 0) &&
    (!output.requestedProjectGoals || output.requestedProjectGoals.length === 0)
  ) {
    throw new Error('Debes solicitar al menos un cambio de presupuesto/objetivo.');
  }

  return output;
}

function normalizePolicyInput(input: BudgetApprovalPolicyInput): {
  role: AppUserRole;
  projectKey: string | null;
  autoApproveBelowUsd: number | null;
  requireManualForProviderChanges: boolean;
  requireReason: boolean;
  alwaysRequireManual: boolean;
  enabled: boolean;
} {
  const role =
    input.role === 'OWNER' || input.role === 'EDITOR' || input.role === 'VIEWER'
      ? input.role
      : null;
  if (!role) {
    throw new Error('role inválido en policy');
  }

  const projectKey =
    typeof input.projectKey === 'string' ? normalizeProjectKey(input.projectKey) : null;
  const rawAutoApprove =
    typeof input.autoApproveBelowUsd === 'undefined' ? null : input.autoApproveBelowUsd;
  const autoApproveBelowUsd =
    rawAutoApprove === null
      ? null
      : Number.isFinite(Number(rawAutoApprove)) && Number(rawAutoApprove) >= 0
        ? toFixed4(Number(rawAutoApprove))
        : null;

  return {
    role,
    projectKey: projectKey || null,
    autoApproveBelowUsd,
    requireManualForProviderChanges: input.requireManualForProviderChanges !== false,
    requireReason: !!input.requireReason,
    alwaysRequireManual: !!input.alwaysRequireManual,
    enabled: input.enabled !== false,
  };
}

async function ensureDefaultApprovalPolicies(): Promise<void> {
  return;
}

export async function getBudgetApprovalPolicies(): Promise<BudgetApprovalPolicyItem[]> {
  await ensureDefaultApprovalPolicies();
  const rows = await db.budgetApprovalPolicy.findMany({
    orderBy: [{ role: 'asc' }, { projectKey: 'asc' }, { createdAt: 'asc' }],
  });
  if (rows.length === 0) {
    const timestamp = new Date().toISOString();
    return defaultApprovalPolicies().map((policy) => {
      const normalized = normalizePolicyInput(policy);
      return {
        id: `default:${normalized.role}:${normalized.projectKey || '*'}`,
        role: normalized.role,
        projectKey: normalized.projectKey,
        autoApproveBelowUsd: normalized.autoApproveBelowUsd,
        requireManualForProviderChanges: normalized.requireManualForProviderChanges,
        requireReason: normalized.requireReason,
        alwaysRequireManual: normalized.alwaysRequireManual,
        enabled: normalized.enabled,
        createdByUserId: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    });
  }
  return rows.map((row) => toPolicyItem(row));
}

export async function saveBudgetApprovalPolicies(
  inputPolicies: BudgetApprovalPolicyInput[],
  actorUserId?: string | null
): Promise<BudgetApprovalPolicyItem[]> {
  if (!Array.isArray(inputPolicies) || inputPolicies.length === 0) {
    throw new Error('Debes enviar al menos una policy.');
  }

  const normalized = inputPolicies.map(normalizePolicyInput);
  const dedup = new Map<string, (typeof normalized)[number]>();
  for (const policy of normalized) {
    dedup.set(`${policy.role}:${policy.projectKey || '*'}`, policy);
  }

  const rows = Array.from(dedup.values());
  await db.$transaction([
    db.budgetApprovalPolicy.deleteMany({}),
    db.budgetApprovalPolicy.createMany({
      data: rows.map((policy) => ({
        role: policy.role,
        projectKey: policy.projectKey,
        autoApproveBelowUsd: policy.autoApproveBelowUsd,
        requireManualForProviderChanges: policy.requireManualForProviderChanges,
        requireReason: policy.requireReason,
        alwaysRequireManual: policy.alwaysRequireManual,
        enabled: policy.enabled,
        createdByUserId: actorUserId || null,
      })),
    }),
  ]);

  return getBudgetApprovalPolicies();
}

function normalizeAutomationControlInput(
  input: FinOpsAutomationControlInput,
  fallback?: FinOpsAutomationControl
): FinOpsAutomationControl {
  const base = fallback || defaultAutomationControl();
  const minSeverity = parseSeverity(input.minSeverity, base.minSeverity);
  const cooldownMinutes =
    typeof input.cooldownMinutes === 'number' && Number.isFinite(input.cooldownMinutes)
      ? Math.max(10, Math.min(24 * 60, Math.floor(input.cooldownMinutes)))
      : base.cooldownMinutes;
  const maxActionsPerRun =
    typeof input.maxActionsPerRun === 'number' && Number.isFinite(input.maxActionsPerRun)
      ? Math.max(1, Math.min(200, Math.floor(input.maxActionsPerRun)))
      : base.maxActionsPerRun;

  return {
    controlKey:
      typeof input.controlKey === 'string' && input.controlKey.trim()
        ? input.controlKey.trim().toLowerCase()
        : base.controlKey,
    enabled: typeof input.enabled === 'boolean' ? input.enabled : base.enabled,
    windowStartUtc: normalizeClock(input.windowStartUtc ?? null) ?? base.windowStartUtc,
    windowEndUtc: normalizeClock(input.windowEndUtc ?? null) ?? base.windowEndUtc,
    cooldownMinutes,
    maxActionsPerRun,
    minSeverity,
    allowPolicyMutations:
      typeof input.allowPolicyMutations === 'boolean'
        ? input.allowPolicyMutations
        : base.allowPolicyMutations,
    allowBudgetMutations:
      typeof input.allowBudgetMutations === 'boolean'
        ? input.allowBudgetMutations
        : base.allowBudgetMutations,
  };
}

export async function getFinOpsAutomationControl(
  controlKey = 'global'
): Promise<FinOpsAutomationControl> {
  const normalizedKey = controlKey.trim().toLowerCase() || 'global';
  const existing = await db.finOpsAutomationControl.findUnique({
    where: { controlKey: normalizedKey },
  });
  if (!existing) {
    const defaults = normalizeAutomationControlInput({ controlKey: normalizedKey });
    await db.finOpsAutomationControl.createMany({
      data: [
        {
          controlKey: defaults.controlKey,
          enabled: defaults.enabled,
          windowStartUtc: defaults.windowStartUtc,
          windowEndUtc: defaults.windowEndUtc,
          cooldownMinutes: defaults.cooldownMinutes,
          maxActionsPerRun: defaults.maxActionsPerRun,
          minSeverity: defaults.minSeverity,
          allowPolicyMutations: defaults.allowPolicyMutations,
          allowBudgetMutations: defaults.allowBudgetMutations,
        },
      ],
      skipDuplicates: true,
    });
    const created = await db.finOpsAutomationControl.findUnique({
      where: { controlKey: normalizedKey },
    });
    if (!created) {
      return defaults;
    }
    return normalizeAutomationControlInput(
      {
        controlKey: created.controlKey,
        enabled: created.enabled,
        windowStartUtc: created.windowStartUtc,
        windowEndUtc: created.windowEndUtc,
        cooldownMinutes: created.cooldownMinutes,
        maxActionsPerRun: created.maxActionsPerRun,
        minSeverity: parseSeverity(created.minSeverity, defaultAutomationControl().minSeverity),
        allowPolicyMutations: created.allowPolicyMutations,
        allowBudgetMutations: created.allowBudgetMutations,
      },
      defaultAutomationControl()
    );
  }

  return normalizeAutomationControlInput(
    {
      controlKey: existing.controlKey,
      enabled: existing.enabled,
      windowStartUtc: existing.windowStartUtc,
      windowEndUtc: existing.windowEndUtc,
      cooldownMinutes: existing.cooldownMinutes,
      maxActionsPerRun: existing.maxActionsPerRun,
      minSeverity: parseSeverity(existing.minSeverity, defaultAutomationControl().minSeverity),
      allowPolicyMutations: existing.allowPolicyMutations,
      allowBudgetMutations: existing.allowBudgetMutations,
    },
    defaultAutomationControl()
  );
}

export async function saveFinOpsAutomationControl(
  input: FinOpsAutomationControlInput,
  actorUserId?: string | null
): Promise<FinOpsAutomationControl> {
  const current = await getFinOpsAutomationControl(input.controlKey || 'global');
  const merged = normalizeAutomationControlInput(input, current);

  await db.finOpsAutomationControl.upsert({
    where: { controlKey: merged.controlKey },
    create: {
      controlKey: merged.controlKey,
      enabled: merged.enabled,
      windowStartUtc: merged.windowStartUtc,
      windowEndUtc: merged.windowEndUtc,
      cooldownMinutes: merged.cooldownMinutes,
      maxActionsPerRun: merged.maxActionsPerRun,
      minSeverity: merged.minSeverity,
      allowPolicyMutations: merged.allowPolicyMutations,
      allowBudgetMutations: merged.allowBudgetMutations,
      createdByUserId: actorUserId || null,
    },
    update: {
      enabled: merged.enabled,
      windowStartUtc: merged.windowStartUtc,
      windowEndUtc: merged.windowEndUtc,
      cooldownMinutes: merged.cooldownMinutes,
      maxActionsPerRun: merged.maxActionsPerRun,
      minSeverity: merged.minSeverity,
      allowPolicyMutations: merged.allowPolicyMutations,
      allowBudgetMutations: merged.allowBudgetMutations,
      createdByUserId: actorUserId || null,
    },
  });

  return getFinOpsAutomationControl(merged.controlKey);
}

async function resolveApprovalPolicyForRequest(
  userId: string,
  input: BudgetApprovalRequestInput
): Promise<{
  role: AppUserRole;
  selectedPolicy: BudgetApprovalPolicyItem | null;
  shouldAutoApprove: boolean;
  autoApproveReason: string;
}> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });
  if (!user) throw new Error('Usuario no encontrado');

  const policies = await getBudgetApprovalPolicies();
  const requestedProjects = new Set(
    (input.requestedProjectGoals || [])
      .map((goal) => normalizeProjectKey(goal.projectKey))
      .filter((value): value is string => !!value)
  );

  const rolePolicies = policies.filter(
    (policy) => policy.enabled && policy.role === user.role
  );
  const scopedPolicies = rolePolicies
    .filter(
      (policy) =>
        !policy.projectKey ||
        requestedProjects.size === 0 ||
        requestedProjects.has(policy.projectKey)
    )
    .sort((left, right) => {
      if (!!left.projectKey !== !!right.projectKey) return left.projectKey ? -1 : 1;
      return left.updatedAt > right.updatedAt ? -1 : 1;
    });

  const selected = scopedPolicies[0] || null;
  if (selected?.requireReason && !input.reason) {
    throw new Error('La policy activa exige motivo en la solicitud.');
  }

  const hasProviderChanges =
    !!input.requestedProviderBudgets &&
    Object.keys(input.requestedProviderBudgets).length > 0;

  let maxRequestedBudget = 0;
  if (typeof input.requestedMonthlyBudgetUsd === 'number') {
    maxRequestedBudget = Math.max(maxRequestedBudget, input.requestedMonthlyBudgetUsd);
  }
  for (const goal of input.requestedProjectGoals || []) {
    maxRequestedBudget = Math.max(maxRequestedBudget, Number(goal.monthlyBudgetUsd) || 0);
  }

  if (!selected) {
    const ownerFallback = user.role === 'OWNER';
    return {
      role: user.role,
      selectedPolicy: null,
      shouldAutoApprove: ownerFallback,
      autoApproveReason: ownerFallback
        ? 'Auto-aprobada por fallback de rol OWNER.'
        : 'Sin policy activa para auto-aprobación.',
    };
  }

  if (selected.alwaysRequireManual) {
    return {
      role: user.role,
      selectedPolicy: selected,
      shouldAutoApprove: false,
      autoApproveReason: 'Policy marcada como aprobación manual obligatoria.',
    };
  }

  if (selected.requireManualForProviderChanges && hasProviderChanges) {
    return {
      role: user.role,
      selectedPolicy: selected,
      shouldAutoApprove: false,
      autoApproveReason: 'La policy exige revisión manual para cambios por proveedor.',
    };
  }

  if (selected.autoApproveBelowUsd !== null && maxRequestedBudget > selected.autoApproveBelowUsd) {
    return {
      role: user.role,
      selectedPolicy: selected,
      shouldAutoApprove: false,
      autoApproveReason: `El monto solicitado supera el umbral auto-approve (${selected.autoApproveBelowUsd}).`,
    };
  }

  const ownerUnlimited =
    user.role === 'OWNER' &&
    selected.autoApproveBelowUsd === null &&
    !selected.requireManualForProviderChanges;
  const thresholdAllows =
    selected.autoApproveBelowUsd !== null &&
    (maxRequestedBudget === 0 || maxRequestedBudget <= selected.autoApproveBelowUsd);

  return {
    role: user.role,
    selectedPolicy: selected,
    shouldAutoApprove: ownerUnlimited || thresholdAllows,
    autoApproveReason: ownerUnlimited
      ? 'Auto-aprobada por policy OWNER.'
      : thresholdAllows
        ? 'Auto-aprobada por umbral de policy.'
        : 'Policy sin auto-aprobación para esta solicitud.',
  };
}

export async function createBudgetApprovalRequest(
  userId: string,
  input: BudgetApprovalRequestInput
): Promise<BudgetApprovalRequestItem> {
  const normalized = normalizeApprovalInput(input);
  const policyResolution = await resolveApprovalPolicyForRequest(userId, normalized);
  const created = await db.budgetApprovalRequest.create({
    data: {
      userId,
      status: BudgetApprovalStatus.PENDING,
      requestedMonthlyBudgetUsd: normalized.requestedMonthlyBudgetUsd ?? null,
      requestedProviderBudgetJson: normalized.requestedProviderBudgets
        ? JSON.stringify(normalized.requestedProviderBudgets)
        : null,
      requestedProjectGoalsJson: normalized.requestedProjectGoals
        ? JSON.stringify(normalized.requestedProjectGoals)
        : null,
      reason: normalized.reason || null,
    },
    include: {
      user: { select: { email: true } },
      resolvedBy: { select: { email: true } },
    },
  });

  if (!policyResolution.shouldAutoApprove) {
    return toBudgetApprovalItem(created);
  }

  await applyApprovedBudgetChanges({
    userId,
    requestedMonthlyBudgetUsd: created.requestedMonthlyBudgetUsd,
    requestedProviderBudgetJson: created.requestedProviderBudgetJson,
    requestedProjectGoalsJson: created.requestedProjectGoalsJson,
  });

  const resolved = await db.budgetApprovalRequest.update({
    where: { id: created.id },
    data: {
      status: BudgetApprovalStatus.APPROVED,
      decisionNote: `AUTO_APPROVED: ${policyResolution.autoApproveReason}`.slice(0, 1200),
      resolvedAt: new Date(),
      resolvedByUserId: null,
    },
    include: {
      user: { select: { email: true } },
      resolvedBy: { select: { email: true } },
    },
  });

  return toBudgetApprovalItem(resolved);
}

export async function getUserBudgetApprovalRequests(
  userId: string
): Promise<BudgetApprovalRequestItem[]> {
  const rows = await db.budgetApprovalRequest.findMany({
    where: { userId },
    include: {
      user: { select: { email: true } },
      resolvedBy: { select: { email: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return rows.map((row) => toBudgetApprovalItem(row));
}

export async function getBudgetApprovalRequests(params?: {
  status?: AppBudgetApprovalStatus | 'ALL';
  take?: number;
}): Promise<BudgetApprovalRequestItem[]> {
  const rows = await db.budgetApprovalRequest.findMany({
    where: params?.status && params.status !== 'ALL' ? { status: params.status } : undefined,
    include: {
      user: { select: { email: true } },
      resolvedBy: { select: { email: true } },
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: Math.max(1, Math.min(500, Math.floor(params?.take || 200))),
  });

  return rows.map((row) => toBudgetApprovalItem(row));
}

async function applyApprovedBudgetChanges(params: {
  userId: string;
  requestedMonthlyBudgetUsd: number | null;
  requestedProviderBudgetJson: string | null;
  requestedProjectGoalsJson: string | null;
}): Promise<void> {
  const policyInput: UsagePolicyInput = {};
  if (typeof params.requestedMonthlyBudgetUsd === 'number' && params.requestedMonthlyBudgetUsd > 0) {
    policyInput.monthlyBudgetUsd = params.requestedMonthlyBudgetUsd;
  }

  const requestedProviderBudgets = parseProviderBudgetJson(params.requestedProviderBudgetJson);
  if (Object.keys(requestedProviderBudgets).length > 0) {
    policyInput.perProviderBudgets = requestedProviderBudgets;
  }

  if (Object.keys(policyInput).length > 0) {
    await saveUserUsagePolicy(params.userId, policyInput);
  }

  const requestedGoals = parseGoalJson(params.requestedProjectGoalsJson);
  if (requestedGoals.length > 0) {
    await saveProjectUsageGoals(
      params.userId,
      requestedGoals.map((goal) => ({
        projectKey: goal.projectKey,
        monthlyBudgetUsd: goal.monthlyBudgetUsd,
        warningRatio: goal.warningRatio,
        isActive: goal.isActive,
      }))
    );
  }
}

export async function decideBudgetApprovalRequest(params: {
  requestId: string;
  deciderUserId: string;
  decision: 'approve' | 'reject' | 'cancel';
  note?: string;
}): Promise<BudgetApprovalRequestItem> {
  const current = await db.budgetApprovalRequest.findUnique({
    where: { id: params.requestId },
  });
  if (!current) {
    throw new Error('Solicitud no encontrada');
  }
  if (current.status !== BudgetApprovalStatus.PENDING) {
    throw new Error('La solicitud ya fue resuelta');
  }

  const nextStatus =
    params.decision === 'approve'
      ? BudgetApprovalStatus.APPROVED
      : params.decision === 'reject'
        ? BudgetApprovalStatus.REJECTED
        : BudgetApprovalStatus.CANCELED;

  if (nextStatus === BudgetApprovalStatus.APPROVED) {
    await applyApprovedBudgetChanges({
      userId: current.userId,
      requestedMonthlyBudgetUsd: current.requestedMonthlyBudgetUsd,
      requestedProviderBudgetJson: current.requestedProviderBudgetJson,
      requestedProjectGoalsJson: current.requestedProjectGoalsJson,
    });
  }

  const updated = await db.budgetApprovalRequest.update({
    where: { id: params.requestId },
    data: {
      status: nextStatus,
      decisionNote: params.note ? params.note.slice(0, 1200) : null,
      resolvedByUserId: params.deciderUserId,
      resolvedAt: new Date(),
    },
    include: {
      user: { select: { email: true } },
      resolvedBy: { select: { email: true } },
    },
  });

  return toBudgetApprovalItem(updated);
}

export async function getEnterpriseFinOpsReport(options?: {
  period?: string;
  months?: number;
  includeUsersWithoutAlerts?: boolean;
}): Promise<EnterpriseFinOpsReport> {
  const period = options?.period || getPeriod();
  const months = Math.max(1, Math.min(12, Math.floor(options?.months || 6)));
  const users = await db.user.findMany({
    select: { id: true, email: true },
    orderBy: { createdAt: 'asc' },
  });

  const pendingApprovals = await getBudgetApprovalRequests({ status: BudgetApprovalStatus.PENDING, take: 500 });
  const includeUsersWithoutAlerts = options?.includeUsersWithoutAlerts !== false;

  type EnterpriseUserSnapshot = {
    userId: string;
    email: string;
    alerts: Awaited<ReturnType<typeof getPersonalizedUsageAlerts>>;
    summary: Awaited<ReturnType<typeof getUsageSummary>>;
    topProjectKey: string | null;
    topProjectCostUsd: number;
  };

  const perUserResults = await Promise.all(
    users.map(async (user) => {
      try {
        const [alerts, summary, projectSummary] = await Promise.all([
          getPersonalizedUsageAlerts(user.id, period, { persistDefaults: false }),
          getUsageSummary(user.id, period, { persistDefaults: false }),
          getProjectUsageSummary(user.id, period),
        ]);
        const topProject = projectSummary.projects[0];
        return {
          userId: user.id,
          email: user.email,
          alerts,
          summary,
          topProjectKey: topProject?.projectKey || null,
          topProjectCostUsd: topProject?.estimatedCostUsd || 0,
        } satisfies EnterpriseUserSnapshot;
      } catch (error) {
        if (await shouldIgnoreDeletedUserRace(user.id, error)) {
          return null;
        }
        throw error;
      }
    })
  );
  const perUser = perUserResults.filter(
    (entry): entry is EnterpriseUserSnapshot => entry !== null
  );

  const flattenedAlerts = perUser.flatMap((entry) =>
    entry.alerts.map((alert) => ({
      ...alert,
      userId: entry.userId,
      userEmail: entry.email,
    }))
  );

  const usersForReport = perUser
    .filter((entry) => includeUsersWithoutAlerts || entry.alerts.length > 0)
    .map((entry) => ({
      userId: entry.userId,
      email: entry.email,
      summary: entry.summary.totals,
      topProjectKey: entry.topProjectKey,
      topProjectCostUsd: toFixed4(entry.topProjectCostUsd),
    }));

  const totals = {
    users: usersForReport.length,
    criticalAlerts: flattenedAlerts.filter((item) => item.severity === 'critical').length,
    warningAlerts: flattenedAlerts.filter((item) => item.severity === 'warning').length,
    pendingApprovals: pendingApprovals.length,
    monthlySpendUsd: toFixed4(perUser.reduce((sum, item) => sum + item.summary.totals.estimatedCostUsd, 0)),
  };

  return {
    period,
    months,
    generatedAt: new Date().toISOString(),
    totals,
    alerts: flattenedAlerts.sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1;
      return b.estimatedCostUsd - a.estimatedCostUsd;
    }),
    pendingApprovals,
    users: usersForReport,
  };
}

function getSeasonDescriptor(period: string): {
  season: 'holiday_peak' | 'summer_launch' | 'standard';
  factor: number;
} {
  const date = parsePeriod(period) || new Date();
  const month = date.getUTCMonth() + 1;
  if (month === 11 || month === 12) {
    return { season: 'holiday_peak', factor: 1.18 };
  }
  if (month >= 6 && month <= 8) {
    return { season: 'summer_launch', factor: 1.1 };
  }
  return { season: 'standard', factor: 1 };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function incidentSeverityRank(severity: FinOpsIncident['severity']): number {
  if (severity === 'critical') return 0;
  if (severity === 'high') return 1;
  if (severity === 'medium') return 2;
  return 3;
}

export async function getUserFinOpsAutopilotConfig(
  userId: string
): Promise<UserFinOpsAutopilotConfig> {
  const row = await db.userFinOpsAutopilot.findUnique({ where: { userId } });
  if (!row) {
    const defaults = defaultAutopilotConfig();
    try {
      await db.userFinOpsAutopilot.createMany({
        data: [
          {
            userId,
            enabled: defaults.enabled,
            seasonalityEnabled: defaults.seasonalityEnabled,
            budgetBufferRatio: defaults.budgetBufferRatio,
            lookbackMonths: defaults.lookbackMonths,
          },
        ],
        skipDuplicates: true,
      });
    } catch (error) {
      if (await shouldIgnoreDeletedUserRace(userId, error)) {
        return defaults;
      }
      throw error;
    }

    const ensured = await db.userFinOpsAutopilot.findUnique({ where: { userId } });
    if (!ensured) {
      return defaults;
    }

    return clampAutopilotConfig({
      enabled: ensured.enabled,
      seasonalityEnabled: ensured.seasonalityEnabled,
      budgetBufferRatio: ensured.budgetBufferRatio,
      lookbackMonths: ensured.lookbackMonths,
    });
  }

  return clampAutopilotConfig({
    enabled: row.enabled,
    seasonalityEnabled: row.seasonalityEnabled,
    budgetBufferRatio: row.budgetBufferRatio,
    lookbackMonths: row.lookbackMonths,
  });
}

export async function saveUserFinOpsAutopilotConfig(
  userId: string,
  input: Partial<UserFinOpsAutopilotConfig>
): Promise<UserFinOpsAutopilotConfig> {
  const current = await getUserFinOpsAutopilotConfig(userId);
  const merged = clampAutopilotConfig({
    enabled: typeof input.enabled === 'boolean' ? input.enabled : current.enabled,
    seasonalityEnabled:
      typeof input.seasonalityEnabled === 'boolean'
        ? input.seasonalityEnabled
        : current.seasonalityEnabled,
    budgetBufferRatio:
      typeof input.budgetBufferRatio === 'number'
        ? input.budgetBufferRatio
        : current.budgetBufferRatio,
    lookbackMonths:
      typeof input.lookbackMonths === 'number'
        ? input.lookbackMonths
        : current.lookbackMonths,
  });

  await db.userFinOpsAutopilot.upsert({
    where: { userId },
    create: {
      userId,
      enabled: merged.enabled,
      seasonalityEnabled: merged.seasonalityEnabled,
      budgetBufferRatio: merged.budgetBufferRatio,
      lookbackMonths: merged.lookbackMonths,
    },
    update: {
      enabled: merged.enabled,
      seasonalityEnabled: merged.seasonalityEnabled,
      budgetBufferRatio: merged.budgetBufferRatio,
      lookbackMonths: merged.lookbackMonths,
    },
  });

  return merged;
}

export async function getUserFinOpsAutopilotSnapshot(
  userId: string,
  options?: {
    period?: string;
    months?: number;
  }
): Promise<UserFinOpsAutopilotSnapshot> {
  const period = options?.period || getPeriod();
  const config = await getUserFinOpsAutopilotConfig(userId);
  const lookbackMonths = Math.max(
    3,
    Math.min(12, Math.floor(options?.months || config.lookbackMonths))
  );
  const insights = await getUsageInsights(userId, {
    period,
    months: lookbackMonths,
  });

  const seasonDescriptor = getSeasonDescriptor(period);
  const trend = insights.trend;
  const latest3 = trend.slice(-3);
  const previous3 = trend.slice(-6, -3);
  const latestAverage =
    latest3.length > 0
      ? latest3.reduce((sum, item) => sum + item.estimatedCostUsd, 0) / latest3.length
      : insights.projections.averageMonthlyCostUsd;
  const previousAverage =
    previous3.length > 0
      ? previous3.reduce((sum, item) => sum + item.estimatedCostUsd, 0) / previous3.length
      : latestAverage;
  const trendFactor =
    previousAverage > 0 ? clamp(latestAverage / previousAverage, 0.85, 1.25) : 1;
  const seasonalityFactor = config.seasonalityEnabled
    ? toFixed4(Math.max(seasonDescriptor.factor, trendFactor))
    : 1;

  const baselineMonthlySpendUsd = toFixed4(
    Math.max(insights.projections.averageMonthlyCostUsd, insights.projections.projectedMonthEndUsd)
  );
  const currentBudgetUsd = insights.current.totals.monthlyBudgetUsd;
  const suggestedBudgetUsd = config.enabled
    ? toFixed4(
        Math.max(
          currentBudgetUsd,
          baselineMonthlySpendUsd * seasonalityFactor * (1 + config.budgetBufferRatio)
        )
      )
    : currentBudgetUsd;

  const totalCost = Math.max(0, insights.current.totals.estimatedCostUsd);
  const providerSuggestions = PROVIDERS.map((provider) => {
    const currentCostUsd = insights.current.perProvider[provider].estimatedCostUsd;
    const share = totalCost > 0 ? toFixed4(currentCostUsd / totalCost) : 0;
    const suggestedBudget =
      currentCostUsd > 0 && share >= 0.15
        ? toFixed4(currentCostUsd * seasonalityFactor * (1 + config.budgetBufferRatio))
        : null;
    return {
      provider,
      currentCostUsd,
      share,
      suggestedBudgetUsd: suggestedBudget,
    };
  }).sort((left, right) => right.currentCostUsd - left.currentCostUsd);

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  const matchingPolicies = user
    ? (await getBudgetApprovalPolicies()).filter(
        (policy) => policy.enabled && policy.role === user.role
      )
    : [];

  const reason = config.enabled
    ? `Sugerencia calculada con promedio ${lookbackMonths}m, proyección actual y factor estacional ${seasonalityFactor}.`
    : 'Autopilot desactivado; se mantiene presupuesto actual.';

  return {
    config,
    suggestion: {
      period,
      season: seasonDescriptor.season,
      seasonalityFactor,
      baselineMonthlySpendUsd,
      projectedMonthEndUsd: insights.projections.projectedMonthEndUsd,
      currentBudgetUsd,
      suggestedBudgetUsd,
      reason,
      providerSuggestions,
    },
    matchingPolicies,
  };
}

export async function getEnterpriseFinOpsIncidentReport(options?: {
  period?: string;
  months?: number;
}): Promise<EnterpriseFinOpsIncidentReport> {
  const report = await getEnterpriseFinOpsReport({
    period: options?.period,
    months: options?.months,
    includeUsersWithoutAlerts: true,
  });
  const incidents: FinOpsIncident[] = [];

  for (const alert of report.alerts) {
    const severity: FinOpsIncident['severity'] =
      alert.severity === 'critical'
        ? 'critical'
        : alert.ratio >= 1
          ? 'high'
          : 'medium';

    incidents.push({
      id: `alert_${alert.id}`,
      type: 'budget_alert',
      severity,
      period: alert.period,
      userId: alert.userId,
      userEmail: alert.userEmail,
      projectKey: alert.projectKey,
      provider: alert.provider,
      summary: `${alert.userEmail} excede umbral en ${alert.label} (${Math.round(alert.ratio * 100)}%).`,
      suggestedAction:
        severity === 'critical'
          ? 'Aplicar hard stop temporal y revisar budget/políticas en menos de 24h.'
          : 'Revisar límite mensual y optimizar carga por proveedor.',
      estimatedImpactUsd: alert.estimatedCostUsd,
      sourceRef: `alert:${alert.id}`,
    });
  }

  for (const pending of report.pendingApprovals) {
    const ageHours = Math.max(
      0,
      Math.floor((Date.now() - new Date(pending.createdAt).getTime()) / (1000 * 60 * 60))
    );
    const severity: FinOpsIncident['severity'] =
      ageHours >= 72 ? 'critical' : ageHours >= 24 ? 'high' : 'medium';
    incidents.push({
      id: `approval_${pending.id}`,
      type: 'approval_backlog',
      severity,
      period: report.period,
      userId: pending.userId,
      userEmail: pending.requesterEmail,
      projectKey: null,
      provider: null,
      summary: `Solicitud pendiente de ${pending.requesterEmail} (${ageHours}h)`,
      suggestedAction: 'Resolver solicitud (approve/reject/cancel) para evitar bloqueo operativo.',
      estimatedImpactUsd: pending.requestedMonthlyBudgetUsd || 0,
      sourceRef: `approval:${pending.id}`,
    });
  }

  for (const user of report.users) {
    const total = user.summary.estimatedCostUsd;
    if (total <= 0 || !user.topProjectKey) continue;
    const share = user.topProjectCostUsd / total;
    if (share < 0.7) continue;
    incidents.push({
      id: `concentration_${user.userId}_${user.topProjectKey}`,
      type: 'spend_concentration',
      severity: share >= 0.85 ? 'high' : 'medium',
      period: report.period,
      userId: user.userId,
      userEmail: user.email,
      projectKey: user.topProjectKey,
      provider: null,
      summary: `${user.email} concentra ${Math.round(share * 100)}% del gasto en ${user.topProjectKey}.`,
      suggestedAction:
        'Establecer objetivo dedicado por proyecto y revisar reparto de costos por proveedor.',
      estimatedImpactUsd: user.topProjectCostUsd,
      sourceRef: `concentration:${user.userId}:${user.topProjectKey}`,
    });
  }

  const sorted = incidents.sort((left, right) => {
    const bySeverity = incidentSeverityRank(left.severity) - incidentSeverityRank(right.severity);
    if (bySeverity !== 0) return bySeverity;
    return right.estimatedImpactUsd - left.estimatedImpactUsd;
  });

  return {
    period: report.period,
    months: report.months,
    generatedAt: new Date().toISOString(),
    totals: {
      incidents: sorted.length,
      critical: sorted.filter((item) => item.severity === 'critical').length,
      high: sorted.filter((item) => item.severity === 'high').length,
      medium: sorted.filter((item) => item.severity === 'medium').length,
      low: sorted.filter((item) => item.severity === 'low').length,
    },
    incidents: sorted,
  };
}

function remediationLogToItem(row: {
  id: string;
  period: string;
  incidentId: string;
  userId: string | null;
  actionType: string;
  status: AppFinOpsRemediationStatus;
  reason: string;
  dryRun: boolean;
  metadata: string | null;
  appliedAt: Date | null;
  createdAt: Date;
}): FinOpsRemediationLogItem {
  return {
    id: row.id,
    period: row.period,
    incidentId: row.incidentId,
    userId: row.userId || null,
    actionType: row.actionType,
    status: row.status,
    reason: row.reason,
    dryRun: !!row.dryRun,
    metadata: row.metadata || null,
    appliedAt: row.appliedAt ? row.appliedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

async function saveRemediationLog(params: {
  period: string;
  incidentId: string;
  userId: string | null;
  actionType: string;
  status: AppFinOpsRemediationStatus;
  reason: string;
  dryRun: boolean;
  metadata?: Record<string, unknown> | null;
  appliedAt?: Date | null;
}): Promise<FinOpsRemediationLogItem> {
  const data = {
    period: params.period,
    incidentId: params.incidentId,
    userId: params.userId,
    actionType: params.actionType,
    status: params.status,
    reason: params.reason.slice(0, 1200),
    dryRun: params.dryRun,
    metadata: params.metadata ? JSON.stringify(params.metadata).slice(0, 5000) : null,
    appliedAt: params.appliedAt || null,
  };

  try {
    const row = await db.finOpsRemediationLog.create({ data });
    return remediationLogToItem(row);
  } catch (error) {
    if (params.userId && (await shouldIgnoreDeletedUserRace(params.userId, error))) {
      const row = await db.finOpsRemediationLog.create({
        data: {
          ...data,
          userId: null,
        },
      });
      return remediationLogToItem(row);
    }
    throw error;
  }
}

export async function getFinOpsRemediationLogs(params?: {
  take?: number;
  userId?: string;
  actionType?: string;
  status?: AppFinOpsRemediationStatus;
}): Promise<FinOpsRemediationLogItem[]> {
  const rows = await db.finOpsRemediationLog.findMany({
    where: {
      userId: params?.userId || undefined,
      actionType: params?.actionType || undefined,
      status: params?.status || undefined,
    },
    orderBy: { createdAt: 'desc' },
    take: Math.max(1, Math.min(500, Math.floor(params?.take || 100))),
  });
  return rows.map((row) => remediationLogToItem(row));
}

function severityAllowed(
  severity: FinOpsIncident['severity'],
  minSeverity: FinOpsAutomationControl['minSeverity']
): boolean {
  return incidentSeverityRank(severity) <= incidentSeverityRank(minSeverity);
}

async function hasActionCooldown(params: {
  userId: string | null;
  actionType: string;
  cooldownMinutes: number;
}): Promise<boolean> {
  const threshold = new Date(Date.now() - params.cooldownMinutes * 60 * 1000);
  const row = await db.finOpsRemediationLog.findFirst({
    where: {
      userId: params.userId,
      actionType: params.actionType,
      status: FinOpsRemediationStatus.APPLIED,
      appliedAt: { gte: threshold },
    },
    orderBy: { appliedAt: 'desc' },
  });
  return !!row;
}

function detectProviderFromIncidentSummary(summary: string): ProviderKey | null {
  const normalized = summary.toLowerCase();
  for (const provider of PROVIDERS) {
    if (normalized.includes(provider)) return provider;
  }
  return null;
}

function buildActionFromIncident(
  incident: FinOpsIncident,
  control: FinOpsAutomationControl
): FinOpsClosedLoopAction | null {
  if (incident.type === 'budget_alert') {
    if (!control.allowBudgetMutations || !incident.userId) return null;
    const provider = incident.provider || detectProviderFromIncidentSummary(incident.summary);
    if (provider) {
      return {
        incidentId: incident.id,
        type: 'tighten_provider_budget',
        userId: incident.userId,
        reason: 'Ajuste automático de límite por proveedor ante incidente de presupuesto.',
        payload: {
          provider,
          period: incident.period,
          estimatedImpactUsd: incident.estimatedImpactUsd,
        },
      };
    }
    return {
      incidentId: incident.id,
      type: 'enforce_hard_stop',
      userId: incident.userId,
      reason: 'Activar hard stop ante incidente crítico de presupuesto global.',
      payload: {
        period: incident.period,
        estimatedImpactUsd: incident.estimatedImpactUsd,
      },
    };
  }

  if (incident.type === 'spend_concentration') {
    if (!control.allowBudgetMutations || !incident.userId || !incident.projectKey) return null;
    return {
      incidentId: incident.id,
      type: 'create_project_guardrail',
      userId: incident.userId,
      reason: 'Crear/ajustar guardrail por concentración de gasto en proyecto.',
      payload: {
        projectKey: incident.projectKey,
        period: incident.period,
      },
    };
  }

  if (incident.type === 'approval_backlog') {
    if (!control.allowPolicyMutations) return null;
    return {
      incidentId: incident.id,
      type: 'harden_approval_policy',
      userId: incident.userId,
      reason: 'Endurecer policies de aprobación para evitar backlog recurrente.',
      payload: {
        period: incident.period,
      },
    };
  }

  return null;
}

async function applyClosedLoopAction(action: FinOpsClosedLoopAction): Promise<{
  status: AppFinOpsRemediationStatus;
  reason: string;
  metadata?: Record<string, unknown>;
}> {
  if (action.type === 'enforce_hard_stop') {
    if (!action.userId) {
      return {
        status: FinOpsRemediationStatus.SKIPPED,
        reason: 'Sin userId para aplicar hard stop.',
      };
    }
    const current = await getUserUsagePolicy(action.userId);
    if (current.hardStopEnabled) {
      return {
        status: FinOpsRemediationStatus.SKIPPED,
        reason: 'Hard stop ya estaba activo.',
      };
    }
    await saveUserUsagePolicy(action.userId, {
      hardStopEnabled: true,
      warningThresholdRatio: Math.min(current.warningThresholdRatio, 0.8),
    });
    return {
      status: FinOpsRemediationStatus.APPLIED,
      reason: 'Hard stop activado automáticamente.',
      metadata: { warningThresholdRatio: Math.min(current.warningThresholdRatio, 0.8) },
    };
  }

  if (action.type === 'tighten_provider_budget') {
    if (!action.userId) {
      return {
        status: FinOpsRemediationStatus.SKIPPED,
        reason: 'Sin userId para ajustar provider budget.',
      };
    }
    const provider = String(action.payload.provider || '') as ProviderKey;
    if (!PROVIDERS.includes(provider)) {
      return {
        status: FinOpsRemediationStatus.SKIPPED,
        reason: 'Provider inválido para ajustar budget.',
      };
    }

    const [policy, summary] = await Promise.all([
      getUserUsagePolicy(action.userId),
      getUsageSummary(action.userId, String(action.payload.period || getPeriod())),
    ]);
    const spent = summary.perProvider[provider]?.estimatedCostUsd || 0;
    const currentBudget = policy.perProviderBudgets[provider];
    const candidate = toFixed4(Math.max(1, spent * 1.05));
    const nextBudget =
      currentBudget === null ? candidate : currentBudget > candidate ? candidate : currentBudget;

    if (currentBudget !== null && nextBudget === currentBudget) {
      return {
        status: FinOpsRemediationStatus.SKIPPED,
        reason: 'El límite actual del proveedor ya es igual o más estricto.',
      };
    }

    await saveUserUsagePolicy(action.userId, {
      perProviderBudgets: {
        [provider]: nextBudget,
      },
    });
    return {
      status: FinOpsRemediationStatus.APPLIED,
      reason: `Límite de ${provider} ajustado automáticamente.`,
      metadata: {
        provider,
        previousBudget: currentBudget,
        nextBudget,
        spent,
      },
    };
  }

  if (action.type === 'create_project_guardrail') {
    if (!action.userId) {
      return {
        status: FinOpsRemediationStatus.SKIPPED,
        reason: 'Sin userId para guardar guardrail de proyecto.',
      };
    }
    const projectKey = normalizeProjectKey(String(action.payload.projectKey || ''));
    if (!projectKey) {
      return {
        status: FinOpsRemediationStatus.SKIPPED,
        reason: 'projectKey inválido para guardrail.',
      };
    }
    const [goals, summary] = await Promise.all([
      getProjectUsageGoals(action.userId),
      getProjectUsageSummary(action.userId, String(action.payload.period || getPeriod())),
    ]);
    const project = summary.projects.find((item) => item.projectKey === projectKey);
    if (!project) {
      return {
        status: FinOpsRemediationStatus.SKIPPED,
        reason: 'No hay consumo reciente en el proyecto objetivo.',
      };
    }
    const candidateBudget = toFixed4(Math.max(1, project.estimatedCostUsd * 1.15));
    const existing = goals.find((goal) => goal.projectKey === projectKey);
    if (existing && existing.monthlyBudgetUsd <= candidateBudget && existing.warningRatio <= 0.8) {
      return {
        status: FinOpsRemediationStatus.SKIPPED,
        reason: 'Guardrail del proyecto ya existe con configuración estricta.',
      };
    }

    const nextGoals = [
      ...goals.filter((goal) => goal.projectKey !== projectKey),
      {
        projectKey,
        monthlyBudgetUsd: existing ? Math.min(existing.monthlyBudgetUsd, candidateBudget) : candidateBudget,
        warningRatio: existing ? Math.min(existing.warningRatio, 0.8) : 0.8,
        isActive: true,
      },
    ];
    await saveProjectUsageGoals(action.userId, nextGoals);

    return {
      status: FinOpsRemediationStatus.APPLIED,
      reason: `Guardrail de proyecto actualizado (${projectKey}).`,
      metadata: {
        projectKey,
        budget: nextGoals.find((goal) => goal.projectKey === projectKey)?.monthlyBudgetUsd || candidateBudget,
      },
    };
  }

  if (action.type === 'harden_approval_policy') {
    const policies = await getBudgetApprovalPolicies();
    const nextPolicies = policies.map((policy) => {
      if (policy.role === 'OWNER') return policy;
      return {
        ...policy,
        requireReason: true,
        requireManualForProviderChanges: true,
        alwaysRequireManual: policy.role === 'VIEWER' ? true : policy.alwaysRequireManual,
      };
    });

    const changed = nextPolicies.some((policy, index) => {
      const current = policies[index];
      return (
        policy.requireReason !== current.requireReason ||
        policy.requireManualForProviderChanges !== current.requireManualForProviderChanges ||
        policy.alwaysRequireManual !== current.alwaysRequireManual
      );
    });

    if (!changed) {
      return {
        status: FinOpsRemediationStatus.SKIPPED,
        reason: 'Policies ya estaban endurecidas.',
      };
    }

    await saveBudgetApprovalPolicies(
      nextPolicies.map((policy) => ({
        role: policy.role,
        projectKey: policy.projectKey,
        autoApproveBelowUsd: policy.autoApproveBelowUsd,
        requireManualForProviderChanges: policy.requireManualForProviderChanges,
        requireReason: policy.requireReason,
        alwaysRequireManual: policy.alwaysRequireManual,
        enabled: policy.enabled,
      }))
    );

    return {
      status: FinOpsRemediationStatus.APPLIED,
      reason: 'Policies de aprobación endurecidas automáticamente.',
      metadata: {
        affectedPolicies: nextPolicies.length,
      },
    };
  }

  return {
    status: FinOpsRemediationStatus.SKIPPED,
    reason: 'Tipo de acción no soportado.',
  };
}

export async function runFinOpsClosedLoop(options?: {
  period?: string;
  months?: number;
  controlKey?: string;
  dryRun?: boolean;
  force?: boolean;
  maxActions?: number;
}): Promise<FinOpsClosedLoopRunReport> {
  const period = options?.period || getPeriod();
  const control = await getFinOpsAutomationControl(options?.controlKey || 'global');
  const report = await getEnterpriseFinOpsIncidentReport({
    period,
    months: options?.months,
  });

  const dryRun = options?.dryRun !== false;
  const force = options?.force === true;
  const now = new Date();
  const windowOpen = isWindowOpen(now, control.windowStartUtc, control.windowEndUtc);
  const shouldSkipByWindow = !force && (!control.enabled || !windowOpen);
  const maxActions = Math.max(
    1,
    Math.min(200, Math.floor(options?.maxActions || control.maxActionsPerRun))
  );

  const actionResults: FinOpsClosedLoopRunReport['actions'] = [];
  let actionsApplied = 0;
  let actionsSkipped = 0;
  let actionsFailed = 0;

  if (shouldSkipByWindow) {
    return {
      period,
      generatedAt: new Date().toISOString(),
      dryRun,
      windowOpen,
      skippedByWindow: true,
      incidentsEvaluated: report.incidents.length,
      actionsPlanned: 0,
      actionsApplied: 0,
      actionsSkipped: 0,
      actionsFailed: 0,
      control,
      actions: [],
    };
  }

  const actionableIncidents = report.incidents.filter((incident) =>
    severityAllowed(incident.severity, control.minSeverity)
  );

  for (const incident of actionableIncidents) {
    if (actionResults.length >= maxActions) break;
    const action = buildActionFromIncident(incident, control);
    if (!action) continue;

    const hasCooldown = await hasActionCooldown({
      userId: action.userId,
      actionType: action.type,
      cooldownMinutes: control.cooldownMinutes,
    });
    if (hasCooldown) {
      actionsSkipped += 1;
      const reason = `Cooldown activo para ${action.type}.`;
      await saveRemediationLog({
        period,
        incidentId: action.incidentId,
        userId: action.userId,
        actionType: action.type,
        status: FinOpsRemediationStatus.SKIPPED,
        reason,
        dryRun,
        metadata: action.payload,
      });
      actionResults.push({
        ...action,
        status: 'SKIPPED',
      });
      continue;
    }

    if (dryRun) {
      await saveRemediationLog({
        period,
        incidentId: action.incidentId,
        userId: action.userId,
        actionType: action.type,
        status: FinOpsRemediationStatus.PROPOSED,
        reason: action.reason,
        dryRun: true,
        metadata: action.payload,
      });
      actionResults.push({
        ...action,
        status: 'PROPOSED',
      });
      continue;
    }

    try {
      const result = await applyClosedLoopAction(action);
      if (result.status === FinOpsRemediationStatus.APPLIED) {
        actionsApplied += 1;
      } else {
        actionsSkipped += 1;
      }

      await saveRemediationLog({
        period,
        incidentId: action.incidentId,
        userId: action.userId,
        actionType: action.type,
        status: result.status,
        reason: result.reason,
        dryRun: false,
        metadata: { ...action.payload, ...(result.metadata || {}) },
        appliedAt: result.status === FinOpsRemediationStatus.APPLIED ? new Date() : null,
      });

      actionResults.push({
        ...action,
        status: result.status as 'APPLIED' | 'SKIPPED',
      });
    } catch (error) {
      actionsFailed += 1;
      const reason = String(error || 'Error desconocido en remediación.');
      await saveRemediationLog({
        period,
        incidentId: action.incidentId,
        userId: action.userId,
        actionType: action.type,
        status: FinOpsRemediationStatus.FAILED,
        reason,
        dryRun: false,
        metadata: action.payload,
      });
      actionResults.push({
        ...action,
        status: 'FAILED',
        error: reason,
      });
    }
  }

  return {
    period,
    generatedAt: new Date().toISOString(),
    dryRun,
    windowOpen,
    skippedByWindow: false,
    incidentsEvaluated: actionableIncidents.length,
    actionsPlanned: actionResults.length,
    actionsApplied,
    actionsSkipped,
    actionsFailed,
    control,
    actions: actionResults,
  };
}

function escapeCsv(value: string | number | null | undefined): string {
  if (value === null || typeof value === 'undefined') return '';
  const raw = String(value);
  if (!/[",\n]/.test(raw)) return raw;
  return `"${raw.replace(/"/g, '""')}"`;
}

export async function getUsageExportCsv(params: {
  userId: string;
  period?: string;
  months?: number;
}): Promise<string> {
  const period = params.period || getPeriod();
  const months = Math.max(1, Math.min(12, Math.floor(params.months || 6)));
  const periods = recentPeriods(months, period);
  const rows: string[] = [];

  rows.push(
    [
      'section',
      'period',
      'scope',
      'project_key',
      'provider',
      'request_count',
      'estimated_cost_usd',
      'budget_usd',
      'status',
      'ratio',
      'threshold',
      'message',
    ].join(',')
  );

  const periodRows = await Promise.all(
    periods.map(async (currentPeriod) => {
      const [summary, projectSummary] = await Promise.all([
        getUsageSummary(params.userId, currentPeriod),
        getProjectUsageSummary(params.userId, currentPeriod),
      ]);

      const localRows: string[] = [];

      localRows.push(
        [
          'total',
          currentPeriod,
          'total',
          '',
          '',
          summary.totals.requestCount,
          summary.totals.estimatedCostUsd,
          summary.totals.monthlyBudgetUsd,
          summary.totals.status,
          summary.totals.monthlyBudgetUsd > 0
            ? toFixed4(summary.totals.estimatedCostUsd / summary.totals.monthlyBudgetUsd)
            : '',
          '',
          '',
        ]
          .map(escapeCsv)
          .join(',')
      );

      for (const provider of PROVIDERS) {
        const item = summary.perProvider[provider];
        localRows.push(
          [
            'provider',
            currentPeriod,
            'provider',
            '',
            provider,
            item.requestCount,
            item.estimatedCostUsd,
            item.budgetUsd,
            item.status,
            item.budgetUsd && item.budgetUsd > 0
              ? toFixed4(item.estimatedCostUsd / item.budgetUsd)
              : '',
            '',
            '',
          ]
            .map(escapeCsv)
            .join(',')
        );
      }

      for (const project of projectSummary.projects) {
        localRows.push(
          [
            'project',
            currentPeriod,
            'project',
            project.projectKey,
            '',
            project.requestCount,
            project.estimatedCostUsd,
            project.monthlyBudgetUsd,
            project.status,
            project.monthlyBudgetUsd && project.monthlyBudgetUsd > 0
              ? toFixed4(project.estimatedCostUsd / project.monthlyBudgetUsd)
              : '',
            project.warningRatio,
            '',
          ]
            .map(escapeCsv)
            .join(',')
        );
      }

      return localRows;
    })
  );

  for (const item of periodRows) {
    rows.push(...item);
  }

  const alerts = await getPersonalizedUsageAlerts(params.userId, period);
  for (const alert of alerts) {
    rows.push(
      [
        'alert',
        alert.period,
        alert.scope,
        alert.projectKey,
        alert.provider,
        '',
        alert.estimatedCostUsd,
        alert.budgetUsd,
        alert.severity,
        alert.ratio,
        alert.threshold,
        alert.message,
      ]
        .map(escapeCsv)
        .join(',')
    );
  }

  return rows.join('\n');
}
