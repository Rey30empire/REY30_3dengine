import { ApiProvider, type AppApiProvider } from '@/lib/domain-enums';
import { db } from '@/lib/db';

export type ProviderKey = 'openai' | 'meshy' | 'runway' | 'ollama' | 'vllm' | 'llamacpp';

export type UsagePolicy = {
  monthlyBudgetUsd: number;
  hardStopEnabled: boolean;
  warningThresholdRatio: number;
  perProviderBudgets: Record<ProviderKey, number | null>;
};

export type UsageSummary = {
  period: string;
  totals: {
    requestCount: number;
    estimatedCostUsd: number;
    monthlyBudgetUsd: number;
    remainingBudgetUsd: number;
    status: 'ok' | 'warning' | 'blocked';
  };
  perProvider: Record<
    ProviderKey,
    {
      requestCount: number;
      estimatedCostUsd: number;
      budgetUsd: number | null;
      remainingBudgetUsd: number | null;
      blocked: boolean;
      status: 'ok' | 'warning' | 'blocked';
    }
  >;
};

export type UsageTrendPoint = {
  period: string;
  requestCount: number;
  estimatedCostUsd: number;
  monthlyBudgetUsd: number;
  remainingBudgetUsd: number;
  status: 'ok' | 'warning' | 'blocked';
  deltaCostUsd: number | null;
  deltaCostPct: number | null;
};

export type UsageRecommendation = {
  id: string;
  severity: 'low' | 'medium' | 'high';
  title: string;
  detail: string;
  action: string;
};

export type UsageInsights = {
  current: UsageSummary;
  trend: UsageTrendPoint[];
  projections: {
    projectedMonthEndUsd: number;
    projectedStatus: 'ok' | 'warning' | 'blocked';
    averageMonthlyCostUsd: number;
    topProvider: ProviderKey | null;
    topProviderShare: number;
  };
  recommendations: UsageRecommendation[];
};

export type UsagePolicyInput = Partial<{
  monthlyBudgetUsd: number;
  hardStopEnabled: boolean;
  warningThresholdRatio: number;
  perProviderBudgets: Partial<Record<ProviderKey, number | null>>;
}>;

const PROVIDER_TO_MODEL: Record<ProviderKey, AppApiProvider> = {
  openai: ApiProvider.OPENAI,
  meshy: ApiProvider.MESHY,
  runway: ApiProvider.RUNWAY,
  ollama: ApiProvider.OLLAMA,
  vllm: ApiProvider.VLLM,
  llamacpp: ApiProvider.LLAMACPP,
};

const PROVIDERS = Object.keys(PROVIDER_TO_MODEL) as ProviderKey[];

const DEFAULT_COST_BY_ACTION: Record<string, number> = {
  'openai:chat': 0.003,
  'openai:vision': 0.006,
  'openai:image': 0.045,
  'openai:video': 0.18,
  'openai:videoStatus': 0,
  'meshy:preview': 0.05,
  'meshy:refine': 0.09,
  'meshy:status': 0,
  'runway:textToVideo': 0.25,
  'runway:imageToVideo': 0.25,
  'runway:status': 0,
  'ollama:chat': 0,
  'vllm:chat': 0,
  'llamacpp:chat': 0,
};

export class UsageLimitError extends Error {
  readonly code = 'USAGE_LIMIT_EXCEEDED';
  readonly details: {
    provider: ProviderKey;
    action: string;
    projectedTotalUsd: number;
    monthlyBudgetUsd: number;
    projectedProviderUsd: number;
    providerBudgetUsd: number | null;
  };

  constructor(params: UsageLimitError['details']) {
    super('USAGE_LIMIT_EXCEEDED');
    this.details = params;
  }
}

function asPositiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function asRatio(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed <= 0 || parsed >= 1) return fallback;
  return parsed;
}

function envProviderBudget(provider: ProviderKey): number | null {
  const keyMap: Record<ProviderKey, string> = {
    openai: 'REY30_DEFAULT_BUDGET_OPENAI_USD',
    meshy: 'REY30_DEFAULT_BUDGET_MESHY_USD',
    runway: 'REY30_DEFAULT_BUDGET_RUNWAY_USD',
    ollama: 'REY30_DEFAULT_BUDGET_OLLAMA_USD',
    vllm: 'REY30_DEFAULT_BUDGET_VLLM_USD',
    llamacpp: 'REY30_DEFAULT_BUDGET_LLAMACPP_USD',
  };
  const raw = process.env[keyMap[provider]];
  if (!raw || !raw.trim()) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function buildDefaultPolicy(): UsagePolicy {
  const perProviderBudgets = PROVIDERS.reduce((acc, provider) => {
    acc[provider] = envProviderBudget(provider);
    return acc;
  }, {} as Record<ProviderKey, number | null>);

  return {
    monthlyBudgetUsd: asPositiveNumber(process.env.REY30_DEFAULT_MONTHLY_BUDGET_USD, 25),
    hardStopEnabled: String(process.env.REY30_DEFAULT_HARD_STOP_ENABLED || 'true').toLowerCase() !== 'false',
    warningThresholdRatio: asRatio(process.env.REY30_DEFAULT_WARNING_THRESHOLD_RATIO, 0.85),
    perProviderBudgets,
  };
}

function normalizeBudget(value: unknown, fallback: number | null): number | null {
  if (value === null) return null;
  if (typeof value === 'undefined') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error('Invalid budget value');
  if (parsed < 0) throw new Error('Budget cannot be negative');
  return parsed;
}

function parseBudgetJson(raw: string | null | undefined): Record<ProviderKey, number | null> {
  const defaults = buildDefaultPolicy().perProviderBudgets;
  if (!raw) return defaults;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<ProviderKey, unknown>>;
    const result = { ...defaults };
    for (const provider of PROVIDERS) {
      result[provider] = normalizeBudget(parsed?.[provider], defaults[provider]);
    }
    return result;
  } catch {
    return defaults;
  }
}

function clampPolicy(policy: UsagePolicy): UsagePolicy {
  const warningRatio =
    Number.isFinite(policy.warningThresholdRatio) &&
    policy.warningThresholdRatio > 0 &&
    policy.warningThresholdRatio < 1
      ? policy.warningThresholdRatio
      : 0.85;

  const monthlyBudget =
    Number.isFinite(policy.monthlyBudgetUsd) && policy.monthlyBudgetUsd > 0
      ? policy.monthlyBudgetUsd
      : 25;

  const nextProvider = { ...policy.perProviderBudgets };
  for (const provider of PROVIDERS) {
    const current = nextProvider[provider];
    if (current === null) continue;
    if (!Number.isFinite(current) || current < 0) {
      nextProvider[provider] = null;
    }
  }

  return {
    monthlyBudgetUsd: monthlyBudget,
    hardStopEnabled: !!policy.hardStopEnabled,
    warningThresholdRatio: warningRatio,
    perProviderBudgets: nextProvider,
  };
}

function policyRowToUsagePolicy(row: {
  monthlyBudgetUsd: number;
  hardStopEnabled: boolean;
  warningThresholdRatio: number;
  perProviderBudgetJson: string | null;
}): UsagePolicy {
  return clampPolicy({
    monthlyBudgetUsd: row.monthlyBudgetUsd,
    hardStopEnabled: row.hardStopEnabled,
    warningThresholdRatio: row.warningThresholdRatio,
    perProviderBudgets: parseBudgetJson(row.perProviderBudgetJson),
  });
}

function getPeriod(now = new Date()): string {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
}

function normalizeTrendMonths(months?: number): number {
  if (!Number.isFinite(months)) return 6;
  const rounded = Math.floor(months || 6);
  if (rounded < 2) return 2;
  if (rounded > 12) return 12;
  return rounded;
}

function parsePeriodToDate(period: string): Date | null {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return new Date(Date.UTC(year, month - 1, 1));
}

function shiftPeriod(period: string, offsetMonths: number): string {
  const parsed = parsePeriodToDate(period);
  if (!parsed) return period;
  parsed.setUTCMonth(parsed.getUTCMonth() + offsetMonths);
  return getPeriod(parsed);
}

function getRecentPeriods(months: number, currentPeriod: string): string[] {
  const list: string[] = [];
  for (let index = months - 1; index >= 0; index -= 1) {
    list.push(shiftPeriod(currentPeriod, -index));
  }
  return list;
}

function getMonthDayMeta(period: string, now = new Date()): { currentDay: number; daysInMonth: number } {
  const parsed = parsePeriodToDate(period);
  if (!parsed) return { currentDay: 1, daysInMonth: 30 };
  const year = parsed.getUTCFullYear();
  const month = parsed.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const sameMonth = now.getUTCFullYear() === year && now.getUTCMonth() === month;
  const currentDay = sameMonth ? now.getUTCDate() : daysInMonth;
  return { currentDay: Math.max(1, currentDay), daysInMonth: Math.max(1, daysInMonth) };
}

function toFixed4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function statusByBudget(params: {
  spent: number;
  budget: number | null;
  warningRatio: number;
  hardStopEnabled: boolean;
}): 'ok' | 'warning' | 'blocked' {
  if (params.budget === null || params.budget <= 0) return 'ok';
  if (params.spent > params.budget) return params.hardStopEnabled ? 'blocked' : 'warning';
  if (params.spent >= params.budget * params.warningRatio) return 'warning';
  return 'ok';
}

export function estimateProviderCostUsd(provider: ProviderKey, action: string): number {
  const key = `${provider}:${action}`;
  if (Object.prototype.hasOwnProperty.call(DEFAULT_COST_BY_ACTION, key)) {
    return DEFAULT_COST_BY_ACTION[key];
  }
  return DEFAULT_COST_BY_ACTION[`${provider}:chat`] ?? 0;
}

function getPrismaErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return null;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

export async function shouldIgnoreDeletedUserRace(
  userId: string,
  error: unknown
): Promise<boolean> {
  const code = getPrismaErrorCode(error);
  if (code !== 'P2003' && code !== 'P2025') {
    return false;
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  return !user;
}

export async function getUserUsagePolicy(
  userId: string,
  options?: { persistDefaults?: boolean }
): Promise<UsagePolicy> {
  const defaults = buildDefaultPolicy();
  const row = await db.userUsagePolicy.findUnique({ where: { userId } });
  if (!row) {
    if (options?.persistDefaults === false) {
      return defaults;
    }

    try {
      await db.userUsagePolicy.createMany({
        data: [
          {
          userId,
          monthlyBudgetUsd: defaults.monthlyBudgetUsd,
          hardStopEnabled: defaults.hardStopEnabled,
          warningThresholdRatio: defaults.warningThresholdRatio,
          perProviderBudgetJson: JSON.stringify(defaults.perProviderBudgets),
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

    const ensured = await db.userUsagePolicy.findUnique({ where: { userId } });
    return ensured ? policyRowToUsagePolicy(ensured) : defaults;
  }

  return policyRowToUsagePolicy(row);
}

export async function saveUserUsagePolicy(
  userId: string,
  input: UsagePolicyInput
): Promise<UsagePolicy> {
  const current = await getUserUsagePolicy(userId);
  const merged: UsagePolicy = clampPolicy({
    monthlyBudgetUsd: normalizeBudget(input.monthlyBudgetUsd, current.monthlyBudgetUsd) || current.monthlyBudgetUsd,
    hardStopEnabled:
      typeof input.hardStopEnabled === 'boolean' ? input.hardStopEnabled : current.hardStopEnabled,
    warningThresholdRatio:
      typeof input.warningThresholdRatio === 'number'
        ? input.warningThresholdRatio
        : current.warningThresholdRatio,
    perProviderBudgets: {
      ...current.perProviderBudgets,
      ...(input.perProviderBudgets || {}),
    },
  });

  await db.userUsagePolicy.upsert({
    where: { userId },
    create: {
      userId,
      monthlyBudgetUsd: merged.monthlyBudgetUsd,
      hardStopEnabled: merged.hardStopEnabled,
      warningThresholdRatio: merged.warningThresholdRatio,
      perProviderBudgetJson: JSON.stringify(merged.perProviderBudgets),
    },
    update: {
      monthlyBudgetUsd: merged.monthlyBudgetUsd,
      hardStopEnabled: merged.hardStopEnabled,
      warningThresholdRatio: merged.warningThresholdRatio,
      perProviderBudgetJson: JSON.stringify(merged.perProviderBudgets),
    },
  });

  return merged;
}

async function getProviderLedgerCost(
  userId: string,
  provider: ProviderKey,
  period: string
): Promise<number> {
  const row = await db.providerUsageLedger.findUnique({
    where: {
      userId_provider_period: {
        userId,
        provider: PROVIDER_TO_MODEL[provider],
        period,
      },
    },
  });
  return row?.estimatedCostUsd || 0;
}

async function getTotalLedgerCost(userId: string, period: string): Promise<number> {
  const aggregated = await db.providerUsageLedger.aggregate({
    where: { userId, period },
    _sum: { estimatedCostUsd: true },
  });
  return aggregated._sum.estimatedCostUsd || 0;
}

export async function assertUsageAllowed(params: {
  userId: string;
  provider: ProviderKey;
  action: string;
  estimatedCostUsd?: number;
}): Promise<{
  allowed: true;
  projectedTotalUsd: number;
  projectedProviderUsd: number;
  warning: boolean;
}> {
  const period = getPeriod();
  const estimatedCostUsd =
    typeof params.estimatedCostUsd === 'number'
      ? Math.max(0, params.estimatedCostUsd)
      : estimateProviderCostUsd(params.provider, params.action);

  const [policy, providerCurrent, totalCurrent] = await Promise.all([
    getUserUsagePolicy(params.userId),
    getProviderLedgerCost(params.userId, params.provider, period),
    getTotalLedgerCost(params.userId, period),
  ]);

  const projectedProviderUsd = toFixed4(providerCurrent + estimatedCostUsd);
  const projectedTotalUsd = toFixed4(totalCurrent + estimatedCostUsd);
  const providerBudgetUsd = policy.perProviderBudgets[params.provider];
  const providerExceeded =
    providerBudgetUsd !== null && providerBudgetUsd >= 0 && projectedProviderUsd > providerBudgetUsd;
  const monthlyExceeded = projectedTotalUsd > policy.monthlyBudgetUsd;

  if (policy.hardStopEnabled && (providerExceeded || monthlyExceeded)) {
    await db.providerUsageLedger.upsert({
      where: {
        userId_provider_period: {
          userId: params.userId,
          provider: PROVIDER_TO_MODEL[params.provider],
          period,
        },
      },
      create: {
        userId: params.userId,
        provider: PROVIDER_TO_MODEL[params.provider],
        period,
        blocked: true,
        lastAction: params.action,
        lastUsedAt: new Date(),
      },
      update: {
        blocked: true,
        lastAction: params.action,
        lastUsedAt: new Date(),
      },
    });

    throw new UsageLimitError({
      provider: params.provider,
      action: params.action,
      projectedTotalUsd,
      monthlyBudgetUsd: policy.monthlyBudgetUsd,
      projectedProviderUsd,
      providerBudgetUsd,
    });
  }

  const monthlyStatus = statusByBudget({
    spent: projectedTotalUsd,
    budget: policy.monthlyBudgetUsd,
    warningRatio: policy.warningThresholdRatio,
    hardStopEnabled: policy.hardStopEnabled,
  });
  const providerStatus = statusByBudget({
    spent: projectedProviderUsd,
    budget: providerBudgetUsd,
    warningRatio: policy.warningThresholdRatio,
    hardStopEnabled: policy.hardStopEnabled,
  });

  return {
    allowed: true,
    projectedTotalUsd,
    projectedProviderUsd,
    warning: monthlyStatus === 'warning' || providerStatus === 'warning',
  };
}

export async function recordUsage(params: {
  userId: string;
  provider: ProviderKey;
  action: string;
  estimatedCostUsd?: number;
  estimatedUnits?: number;
}): Promise<void> {
  const period = getPeriod();
  const estimatedCostUsd =
    typeof params.estimatedCostUsd === 'number'
      ? Math.max(0, params.estimatedCostUsd)
      : estimateProviderCostUsd(params.provider, params.action);
  const units = Number.isFinite(params.estimatedUnits) ? Math.max(0, Math.floor(params.estimatedUnits || 0)) : 0;

  await db.providerUsageLedger.upsert({
    where: {
      userId_provider_period: {
        userId: params.userId,
        provider: PROVIDER_TO_MODEL[params.provider],
        period,
      },
    },
    create: {
      userId: params.userId,
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

export async function getUsageSummary(
  userId: string,
  period = getPeriod(),
  options?: { persistDefaults?: boolean }
): Promise<UsageSummary> {
  const [policy, rows] = await Promise.all([
    getUserUsagePolicy(userId, options),
    db.providerUsageLedger.findMany({
      where: { userId, period },
    }),
  ]);

  const byProvider = PROVIDERS.reduce((acc, provider) => {
    acc[provider] = {
      requestCount: 0,
      estimatedCostUsd: 0,
      budgetUsd: policy.perProviderBudgets[provider],
      remainingBudgetUsd: policy.perProviderBudgets[provider],
      blocked: false,
      status: 'ok' as const,
    };
    return acc;
  }, {} as UsageSummary['perProvider']);

  let totalRequests = 0;
  let totalCost = 0;

  for (const row of rows) {
    const provider = PROVIDERS.find((item) => PROVIDER_TO_MODEL[item] === row.provider);
    if (!provider) continue;
    const current = byProvider[provider];
    current.requestCount = row.requestCount;
    current.estimatedCostUsd = toFixed4(row.estimatedCostUsd);
    current.blocked = row.blocked;
    current.remainingBudgetUsd =
      current.budgetUsd === null ? null : Math.max(0, toFixed4(current.budgetUsd - current.estimatedCostUsd));
    current.status = row.blocked
      ? 'blocked'
      : statusByBudget({
          spent: current.estimatedCostUsd,
          budget: current.budgetUsd,
          warningRatio: policy.warningThresholdRatio,
          hardStopEnabled: policy.hardStopEnabled,
        });

    totalRequests += row.requestCount;
    totalCost += row.estimatedCostUsd;
  }

  totalCost = toFixed4(totalCost);
  const remainingBudgetUsd = Math.max(0, toFixed4(policy.monthlyBudgetUsd - totalCost));
  const totalStatus = statusByBudget({
    spent: totalCost,
    budget: policy.monthlyBudgetUsd,
    warningRatio: policy.warningThresholdRatio,
    hardStopEnabled: policy.hardStopEnabled,
  });

  return {
    period,
    totals: {
      requestCount: totalRequests,
      estimatedCostUsd: totalCost,
      monthlyBudgetUsd: policy.monthlyBudgetUsd,
      remainingBudgetUsd,
      status: totalStatus,
    },
    perProvider: byProvider,
  };
}

export function generateUsageRecommendations(input: {
  policy: UsagePolicy;
  current: UsageSummary;
  trend: UsageTrendPoint[];
  projectedMonthEndUsd: number;
  topProvider: ProviderKey | null;
  topProviderShare: number;
}): UsageRecommendation[] {
  const recommendations: UsageRecommendation[] = [];
  const { policy, current, trend, projectedMonthEndUsd, topProvider, topProviderShare } = input;

  if (current.totals.status === 'blocked') {
    recommendations.push({
      id: 'budget_blocked',
      severity: 'high',
      title: 'Bloqueo por presupuesto',
      detail: 'Tu cuenta superó límites activos y algunas llamadas AI se están bloqueando.',
      action:
        'Reduce consumo inmediato, baja capacidades cloud no críticas o aumenta presupuesto mensual/proveedor.',
    });
  } else if (current.totals.status === 'warning') {
    recommendations.push({
      id: 'budget_warning',
      severity: 'medium',
      title: 'Cerca del límite mensual',
      detail: 'Tu consumo del período actual está en zona de advertencia.',
      action: 'Activa límites por proveedor y prioriza tareas críticas hasta cierre de mes.',
    });
  }

  if (projectedMonthEndUsd > current.totals.monthlyBudgetUsd) {
    recommendations.push({
      id: 'projection_over_budget',
      severity: policy.hardStopEnabled ? 'high' : 'medium',
      title: 'Proyección sobre presupuesto',
      detail: `Al ritmo actual podrías cerrar en $${projectedMonthEndUsd.toFixed(2)} (presupuesto: $${current.totals.monthlyBudgetUsd.toFixed(2)}).`,
      action: 'Ajusta presupuesto o migra parte del flujo a proveedores locales para evitar picos.',
    });
  }

  if (topProvider && topProviderShare >= 0.65 && current.perProvider[topProvider].estimatedCostUsd > 0) {
    recommendations.push({
      id: 'provider_concentration',
      severity: topProviderShare >= 0.8 ? 'high' : 'medium',
      title: 'Costo concentrado en un proveedor',
      detail: `El ${(topProviderShare * 100).toFixed(1)}% del gasto actual viene de ${topProvider}.`,
      action: `Define límite específico para ${topProvider} y distribuye carga con alternativas (local/híbrido).`,
    });
  }

  if (trend.length >= 3) {
    const last = trend[trend.length - 1];
    const previousTwo = trend.slice(-3, -1);
    const previousAvg =
      previousTwo.reduce((sum, item) => sum + item.estimatedCostUsd, 0) / Math.max(1, previousTwo.length);
    if (previousAvg > 0 && last.estimatedCostUsd > previousAvg * 1.3) {
      recommendations.push({
        id: 'spend_acceleration',
        severity: 'medium',
        title: 'Aceleración de gasto detectada',
        detail: 'El período actual subió más de 30% frente al promedio de los dos meses previos.',
        action: 'Revisa prompts de alto costo (video/3D) y aplica límites por proveedor temporalmente.',
      });
    }
  }

  if (recommendations.length === 0) {
    recommendations.push({
      id: 'healthy_budget',
      severity: 'low',
      title: 'Consumo bajo control',
      detail: 'No se detectaron riesgos inmediatos de sobrecosto en tu patrón de uso actual.',
      action: 'Mantén límites actuales y revisa este panel cada semana.',
    });
  }

  return recommendations.slice(0, 5);
}

export async function getUsageInsights(
  userId: string,
  options?: {
    months?: number;
    period?: string;
    now?: Date;
    persistDefaults?: boolean;
  }
): Promise<UsageInsights> {
  const now = options?.now || new Date();
  const currentPeriod = options?.period || getPeriod(now);
  const months = normalizeTrendMonths(options?.months);
  const periods = getRecentPeriods(months, currentPeriod);

  const [policy, current, rows] = await Promise.all([
    getUserUsagePolicy(userId, { persistDefaults: options?.persistDefaults }),
    getUsageSummary(userId, currentPeriod, { persistDefaults: options?.persistDefaults }),
    db.providerUsageLedger.findMany({
      where: {
        userId,
        period: { in: periods },
      },
    }),
  ]);

  const monthlyIndex = periods.reduce(
    (acc, period) => {
      acc[period] = {
        requestCount: 0,
        estimatedCostUsd: 0,
      };
      return acc;
    },
    {} as Record<string, { requestCount: number; estimatedCostUsd: number }>
  );

  for (const row of rows) {
    const bucket = monthlyIndex[row.period];
    if (!bucket) continue;
    bucket.requestCount += row.requestCount;
    bucket.estimatedCostUsd = toFixed4(bucket.estimatedCostUsd + row.estimatedCostUsd);
  }

  const trend: UsageTrendPoint[] = periods.map((period, index) => {
    const point = monthlyIndex[period] || { requestCount: 0, estimatedCostUsd: 0 };
    const previous = index > 0 ? monthlyIndex[periods[index - 1]] : null;
    const deltaCostUsd =
      previous ? toFixed4(point.estimatedCostUsd - previous.estimatedCostUsd) : null;
    const deltaCostPct =
      previous && previous.estimatedCostUsd > 0
        ? toFixed4((point.estimatedCostUsd - previous.estimatedCostUsd) / previous.estimatedCostUsd)
        : null;
    const status = statusByBudget({
      spent: point.estimatedCostUsd,
      budget: policy.monthlyBudgetUsd,
      warningRatio: policy.warningThresholdRatio,
      hardStopEnabled: policy.hardStopEnabled,
    });

    return {
      period,
      requestCount: point.requestCount,
      estimatedCostUsd: toFixed4(point.estimatedCostUsd),
      monthlyBudgetUsd: policy.monthlyBudgetUsd,
      remainingBudgetUsd: Math.max(0, toFixed4(policy.monthlyBudgetUsd - point.estimatedCostUsd)),
      status,
      deltaCostUsd,
      deltaCostPct,
    };
  });

  const { currentDay, daysInMonth } = getMonthDayMeta(currentPeriod, now);
  const projectedMonthEndUsd = toFixed4(
    (current.totals.estimatedCostUsd / Math.max(1, currentDay)) * daysInMonth
  );
  const projectedStatus = statusByBudget({
    spent: projectedMonthEndUsd,
    budget: current.totals.monthlyBudgetUsd,
    warningRatio: policy.warningThresholdRatio,
    hardStopEnabled: policy.hardStopEnabled,
  });

  const averageMonthlyCostUsd =
    trend.length > 0
      ? toFixed4(trend.reduce((sum, item) => sum + item.estimatedCostUsd, 0) / trend.length)
      : 0;

  let topProvider: ProviderKey | null = null;
  let topProviderCost = 0;
  for (const provider of PROVIDERS) {
    const cost = current.perProvider[provider].estimatedCostUsd;
    if (cost > topProviderCost) {
      topProviderCost = cost;
      topProvider = provider;
    }
  }

  const totalCost = Math.max(0, current.totals.estimatedCostUsd);
  const topProviderShare = totalCost > 0 ? toFixed4(topProviderCost / totalCost) : 0;

  const recommendations = generateUsageRecommendations({
    policy,
    current,
    trend,
    projectedMonthEndUsd,
    topProvider,
    topProviderShare,
  });

  return {
    current,
    trend,
    projections: {
      projectedMonthEndUsd,
      projectedStatus,
      averageMonthlyCostUsd,
      topProvider,
      topProviderShare,
    },
    recommendations,
  };
}

export async function getUsageAlerts(period = getPeriod()): Promise<Array<{
  userId: string;
  period: string;
  totalCostUsd: number;
  monthlyBudgetUsd: number;
  status: 'warning' | 'blocked';
  provider: ProviderKey | null;
  providerCostUsd: number | null;
  providerBudgetUsd: number | null;
}>> {
  const users = await db.user.findMany({
    select: { id: true },
  });

  const alerts: Array<{
    userId: string;
    period: string;
    totalCostUsd: number;
    monthlyBudgetUsd: number;
    status: 'warning' | 'blocked';
    provider: ProviderKey | null;
    providerCostUsd: number | null;
    providerBudgetUsd: number | null;
  }> = [];

  for (const user of users) {
    let summary: UsageSummary;
    try {
      summary = await getUsageSummary(user.id, period, { persistDefaults: false });
    } catch (error) {
      if (await shouldIgnoreDeletedUserRace(user.id, error)) {
        continue;
      }
      throw error;
    }

    if (summary.totals.status !== 'ok') {
      alerts.push({
        userId: user.id,
        period,
        totalCostUsd: summary.totals.estimatedCostUsd,
        monthlyBudgetUsd: summary.totals.monthlyBudgetUsd,
        status: summary.totals.status === 'blocked' ? 'blocked' : 'warning',
        provider: null,
        providerCostUsd: null,
        providerBudgetUsd: null,
      });
    }

    for (const provider of PROVIDERS) {
      const item = summary.perProvider[provider];
      if (item.status === 'ok') continue;
      alerts.push({
        userId: user.id,
        period,
        totalCostUsd: summary.totals.estimatedCostUsd,
        monthlyBudgetUsd: summary.totals.monthlyBudgetUsd,
        status: item.status === 'blocked' ? 'blocked' : 'warning',
        provider,
        providerCostUsd: item.estimatedCostUsd,
        providerBudgetUsd: item.budgetUsd,
      });
    }
  }

  return alerts;
}

export function isUsageLimitError(error: unknown): error is UsageLimitError {
  return error instanceof UsageLimitError || String(error).includes('USAGE_LIMIT_EXCEEDED');
}
