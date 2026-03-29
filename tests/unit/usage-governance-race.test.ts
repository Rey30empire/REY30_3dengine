import { Prisma } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const dbMock = {
  user: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  userUsagePolicy: {
    findUnique: vi.fn(),
    create: vi.fn(),
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
  it('skips users deleted during an alert scan', async () => {
    dbMock.user.findMany.mockResolvedValue([{ id: 'gone-user' }]);
    dbMock.userUsagePolicy.findUnique.mockResolvedValue(null);
    dbMock.userUsagePolicy.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(
        'Foreign key constraint violated on the constraint: UserUsagePolicy_userId_fkey',
        {
          code: 'P2003',
          clientVersion: 'test',
        }
      )
    );
    dbMock.user.findUnique.mockResolvedValue(null);

    const { getUsageAlerts } = await import('@/lib/security/usage-governance');
    await expect(getUsageAlerts('2026-03')).resolves.toEqual([]);
  });
});
