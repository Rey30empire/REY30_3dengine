import { afterEach, describe, expect, it, vi } from 'vitest';

const dbMock = {
  user: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  apiCredential: {
    findMany: vi.fn(),
  },
};

vi.mock('@/lib/db', () => ({
  db: dbMock,
}));

vi.mock('@/lib/security/crypto', () => ({
  decryptText: (value: string) => value,
}));

function restoreEnv(previous: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) {
      delete process.env[key];
      continue;
    }
    process.env[key] = value;
  }
}

describe('shared access overrides', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('caps shared access users to viewer permissions even when owner is configured', async () => {
    const previous = {
      REY30_SHARED_ACCESS_TOKEN: process.env.REY30_SHARED_ACCESS_TOKEN,
      REY30_SHARED_ACCESS_EMAIL: process.env.REY30_SHARED_ACCESS_EMAIL,
      REY30_SHARED_ACCESS_NAME: process.env.REY30_SHARED_ACCESS_NAME,
      REY30_SHARED_ACCESS_ROLE: process.env.REY30_SHARED_ACCESS_ROLE,
    };

    process.env.REY30_SHARED_ACCESS_TOKEN = 'shared-access-test-token';
    process.env.REY30_SHARED_ACCESS_EMAIL = 'shared-access-test@rey30.local';
    process.env.REY30_SHARED_ACCESS_NAME = 'Shared Access Test';
    process.env.REY30_SHARED_ACCESS_ROLE = 'OWNER';

    dbMock.user.findUnique.mockResolvedValue({
      id: 'shared-user-1',
      email: 'shared-access-test@rey30.local',
      name: 'Shared Access Test',
      role: 'OWNER',
      isActive: true,
    });
    dbMock.user.update.mockResolvedValue({
      id: 'shared-user-1',
      email: 'shared-access-test@rey30.local',
      name: 'Shared Access Test',
      role: 'VIEWER',
      isActive: true,
    });

    try {
      const { ensureSharedAccessUser, getSharedAccessEnvConfig } = await import(
        '@/lib/security/shared-access'
      );
      const user = await ensureSharedAccessUser();

      expect(getSharedAccessEnvConfig().role).toBe('VIEWER');
      expect(dbMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            role: 'VIEWER',
          }),
        })
      );
      expect(user?.role).toBe('VIEWER');
    } finally {
      restoreEnv(previous);
    }
  });

  it('prefers the invite profile OpenAI key over the generic environment key', async () => {
    const previous = {
      REY30_SHARED_ACCESS_TOKEN: process.env.REY30_SHARED_ACCESS_TOKEN,
      REY30_SHARED_ACCESS_EMAIL: process.env.REY30_SHARED_ACCESS_EMAIL,
      REY30_SHARED_ACCESS_NAME: process.env.REY30_SHARED_ACCESS_NAME,
      REY30_SHARED_ACCESS_ROLE: process.env.REY30_SHARED_ACCESS_ROLE,
      INVITE_PROFILE_OPENAI_API_KEY: process.env.INVITE_PROFILE_OPENAI_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    };

    process.env.REY30_SHARED_ACCESS_TOKEN = 'shared-access-test-token';
    process.env.REY30_SHARED_ACCESS_EMAIL = 'shared-access-test@rey30.local';
    process.env.REY30_SHARED_ACCESS_NAME = 'Shared Access Test';
    process.env.REY30_SHARED_ACCESS_ROLE = 'OWNER';
    process.env.INVITE_PROFILE_OPENAI_API_KEY = 'sk-test-invite-openai';
    process.env.OPENAI_API_KEY = 'sk-test-generic-openai';

    dbMock.user.findUnique.mockResolvedValue({
      id: 'shared-user-1',
      email: 'shared-access-test@rey30.local',
      name: 'Shared Access Test',
      role: 'VIEWER',
      isActive: true,
    });
    dbMock.apiCredential.findMany.mockResolvedValue([]);

    try {
      const { getSharedAccessOverridesForUserId } = await import('@/lib/security/shared-access');
      const overrides = await getSharedAccessOverridesForUserId('shared-user-1');

      expect(overrides?.apiConfig.routing?.chat).toBe('openai');
      expect(overrides?.apiConfig.openai?.enabled).toBe(true);
      expect(overrides?.apiConfig.openai?.apiKey).toBe('sk-test-invite-openai');
      expect(overrides?.hasSecrets.openai).toBe(true);
    } finally {
      restoreEnv(previous);
    }
  });
});
