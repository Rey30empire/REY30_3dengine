import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const isLocalRequestMock = vi.fn();
const env = process.env as Record<string, string | undefined>;
const ORIGINAL_ENV = {
  NODE_ENV: process.env.NODE_ENV,
  REY30_REGISTRATION_MODE: process.env.REY30_REGISTRATION_MODE,
  REY30_ALLOW_DEV_LOCAL_REGISTRATION: process.env.REY30_ALLOW_DEV_LOCAL_REGISTRATION,
};

vi.mock('@/lib/security/auth', () => ({
  isLocalRequest: isLocalRequestMock,
}));

describe('registration policy defaults', () => {
  beforeEach(() => {
    isLocalRequestMock.mockReturnValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    if (ORIGINAL_ENV.NODE_ENV === undefined) {
      delete env.NODE_ENV;
    } else {
      env.NODE_ENV = ORIGINAL_ENV.NODE_ENV;
    }
    if (ORIGINAL_ENV.REY30_REGISTRATION_MODE === undefined) {
      delete env.REY30_REGISTRATION_MODE;
    } else {
      env.REY30_REGISTRATION_MODE = ORIGINAL_ENV.REY30_REGISTRATION_MODE;
    }
    if (ORIGINAL_ENV.REY30_ALLOW_DEV_LOCAL_REGISTRATION === undefined) {
      delete env.REY30_ALLOW_DEV_LOCAL_REGISTRATION;
    } else {
      env.REY30_ALLOW_DEV_LOCAL_REGISTRATION = ORIGINAL_ENV.REY30_ALLOW_DEV_LOCAL_REGISTRATION;
    }
  });

  it('defaults to invite-only when no explicit registration mode is configured', async () => {
    env.NODE_ENV = 'development';
    delete env.REY30_REGISTRATION_MODE;

    const { getRegistrationMode } = await import('@/lib/security/registration-policy');

    expect(getRegistrationMode()).toBe('invite_only');
  });

  it('keeps local development registration closed unless explicitly enabled', async () => {
    env.NODE_ENV = 'development';
    delete env.REY30_ALLOW_DEV_LOCAL_REGISTRATION;

    const { allowLocalDevOpenRegistration } = await import('@/lib/security/registration-policy');

    expect(allowLocalDevOpenRegistration({} as any)).toBe(false);

    env.REY30_ALLOW_DEV_LOCAL_REGISTRATION = 'true';

    expect(allowLocalDevOpenRegistration({} as any)).toBe(true);
  });
});
