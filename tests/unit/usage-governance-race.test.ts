import { Prisma } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const dbMock = {
  user: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  userUsagePolicy: {
    findUnique: vi.fn(),
    createMany: vi.fn(),
  },
  providerUsageLedger: {
    findMany: vi.fn(),
  },
};

vi.mock('@/lib/db', () => ({
  db: dbMock,
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe('Usage governance deleted-user race', () => {
  it('returns a virtual default policy in read-only mode without writing', async () => {
    dbMock.userUsagePolicy.findUnique.mockResolvedValue(null);

    const { getUserUsagePolicy } = await import('@/lib/security/usage-governance');
    await expect(
      getUserUsagePolicy('user-readonly', { persistDefaults: false })
    ).resolves.toMatchObject({
      monthlyBudgetUsd: 25,
      hardStopEnabled: true,
      warningThresholdRatio: 0.85,
    });

    expect(dbMock.userUsagePolicy.createMany).not.toHaveBeenCalled();
  });

  it('skips users deleted during an alert scan', async () => {
    dbMock.user.findMany.mockResolvedValue([{ id: 'gone-user' }]);
    dbMock.userUsagePolicy.findUnique.mockResolvedValue(null);
    dbMock.userUsagePolicy.createMany.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(
        'Foreign key constraint violated on the constraint: UserUsagePolicy_userId_fkey',
        {
          code: 'P2003',
          clientVersion: 'test',
        }
      )
    );
    dbMock.user.findUnique.mockResolvedValue(null);
    dbMock.providerUsageLedger.findMany.mockResolvedValue([]);

    const { getUsageAlerts } = await import('@/lib/security/usage-governance');
    await expect(getUsageAlerts('2026-03')).resolves.toEqual([]);
  });

  it('recovers when the default usage policy is created concurrently by another request', async () => {
    dbMock.userUsagePolicy.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        monthlyBudgetUsd: 40,
        hardStopEnabled: true,
        warningThresholdRatio: 0.9,
        perProviderBudgetJson: JSON.stringify({
          openai: 10,
          meshy: null,
          runway: null,
          ollama: null,
          vllm: null,
          llamacpp: null,
        }),
      });
    dbMock.userUsagePolicy.createMany.mockResolvedValue({ count: 1 });

    const { getUserUsagePolicy } = await import('@/lib/security/usage-governance');
    await expect(getUserUsagePolicy('user-1')).resolves.toMatchObject({
      monthlyBudgetUsd: 40,
      warningThresholdRatio: 0.9,
      perProviderBudgets: expect.objectContaining({
        openai: 10,
      }),
    });
  });
});
