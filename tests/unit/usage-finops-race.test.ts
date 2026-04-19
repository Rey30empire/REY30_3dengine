import { Prisma } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const shouldIgnoreDeletedUserRaceMock = vi.fn();

const dbMock = {
  userUsageAlertProfile: {
    findUnique: vi.fn(),
    createMany: vi.fn(),
  },
  userFinOpsAutopilot: {
    findUnique: vi.fn(),
    createMany: vi.fn(),
  },
  finOpsAutomationControl: {
    findUnique: vi.fn(),
    createMany: vi.fn(),
  },
  budgetApprovalPolicy: {
    findMany: vi.fn(),
    deleteMany: vi.fn(),
    createMany: vi.fn(),
  },
  $transaction: vi.fn(),
};

vi.mock('@/lib/db', () => ({
  db: dbMock,
}));

vi.mock('@/lib/security/usage-governance', () => ({
  estimateProviderCostUsd: vi.fn(),
  getUserUsagePolicy: vi.fn(),
  getUsageInsights: vi.fn(),
  getUsageSummary: vi.fn(),
  saveUserUsagePolicy: vi.fn(),
  shouldIgnoreDeletedUserRace: shouldIgnoreDeletedUserRaceMock,
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  shouldIgnoreDeletedUserRaceMock.mockResolvedValue(false);
});

describe('Usage FinOps idempotent bootstrap', () => {
  it('returns a virtual alert profile in read-only mode without writing', async () => {
    dbMock.userUsageAlertProfile.findUnique.mockResolvedValue(null);

    const { getUserUsageAlertProfile } = await import('@/lib/security/usage-finops');
    await expect(
      getUserUsageAlertProfile('user-readonly', { persistDefaults: false })
    ).resolves.toMatchObject({
      enabled: true,
      totalWarningRatio: 0.85,
      providerWarningRatio: 0.85,
      projectWarningRatio: 0.85,
      includeLocalProviders: false,
    });

    expect(dbMock.userUsageAlertProfile.createMany).not.toHaveBeenCalled();
  });

  it('creates alert profiles through skip-duplicate bootstrap when the profile is missing', async () => {
    dbMock.userUsageAlertProfile.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
      enabled: true,
      totalWarningRatio: 0.85,
      providerWarningRatio: 0.85,
      projectWarningRatio: 0.85,
      includeLocalProviders: false,
    });
    dbMock.userUsageAlertProfile.createMany.mockResolvedValue({ count: 1 });

    const { getUserUsageAlertProfile } = await import('@/lib/security/usage-finops');
    await expect(getUserUsageAlertProfile('user-1')).resolves.toMatchObject({
      enabled: true,
      totalWarningRatio: 0.85,
      providerWarningRatio: 0.85,
      projectWarningRatio: 0.85,
      includeLocalProviders: false,
    });

    expect(dbMock.userUsageAlertProfile.createMany).toHaveBeenCalledTimes(1);
  });

  it('returns defaults when alert profile bootstrap collides with a deleted-user race', async () => {
    dbMock.userUsageAlertProfile.findUnique.mockResolvedValue(null);
    dbMock.userUsageAlertProfile.createMany.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Foreign key constraint failed', {
        code: 'P2003',
        clientVersion: 'test',
      })
    );
    shouldIgnoreDeletedUserRaceMock.mockResolvedValue(true);

    const { getUserUsageAlertProfile } = await import('@/lib/security/usage-finops');
    await expect(getUserUsageAlertProfile('gone-user')).resolves.toMatchObject({
      enabled: true,
      totalWarningRatio: 0.85,
      providerWarningRatio: 0.85,
      projectWarningRatio: 0.85,
      includeLocalProviders: false,
    });
  });

  it('creates automation control through skip-duplicate bootstrap when the singleton row is missing', async () => {
    dbMock.finOpsAutomationControl.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
      controlKey: 'test-control',
      enabled: true,
      windowStartUtc: '01:00',
      windowEndUtc: '06:00',
      cooldownMinutes: 240,
      maxActionsPerRun: 15,
      minSeverity: 'high',
      allowPolicyMutations: true,
      allowBudgetMutations: true,
    });
    dbMock.finOpsAutomationControl.createMany.mockResolvedValue({ count: 1 });

    const { getFinOpsAutomationControl } = await import('@/lib/security/usage-finops');
    await expect(getFinOpsAutomationControl('test-control')).resolves.toMatchObject({
      controlKey: 'test-control',
      enabled: true,
      minSeverity: 'high',
    });

    expect(dbMock.finOpsAutomationControl.createMany).toHaveBeenCalledTimes(1);
  });

  it('creates autopilot config through skip-duplicate bootstrap when the row is missing', async () => {
    dbMock.userFinOpsAutopilot.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
      enabled: true,
      seasonalityEnabled: true,
      budgetBufferRatio: 0.15,
      lookbackMonths: 6,
    });
    dbMock.userFinOpsAutopilot.createMany.mockResolvedValue({ count: 1 });

    const { getUserFinOpsAutopilotConfig } = await import('@/lib/security/usage-finops');
    await expect(getUserFinOpsAutopilotConfig('user-1')).resolves.toMatchObject({
      enabled: true,
      seasonalityEnabled: true,
      budgetBufferRatio: 0.15,
      lookbackMonths: 6,
    });

    expect(dbMock.userFinOpsAutopilot.createMany).toHaveBeenCalledTimes(1);
  });

  it('returns virtual default approval policies without persisting bootstrap rows', async () => {
    dbMock.budgetApprovalPolicy.findMany.mockResolvedValue([]);

    const { getBudgetApprovalPolicies } = await import('@/lib/security/usage-finops');
    const policies = await getBudgetApprovalPolicies();

    expect(policies).toHaveLength(3);
    expect(policies.map((policy) => policy.role)).toEqual(['VIEWER', 'EDITOR', 'OWNER']);
    expect(dbMock.budgetApprovalPolicy.createMany).not.toHaveBeenCalled();
    expect(dbMock.budgetApprovalPolicy.deleteMany).not.toHaveBeenCalled();
  });
});
