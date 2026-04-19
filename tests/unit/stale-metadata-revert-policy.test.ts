import { afterEach, describe, expect, it } from 'vitest';
import {
  canConfirmStaleMetadataRevert,
  clearStaleMetadataRevertPolicyConfigForTest,
  createStaleMetadataRevertPolicySnapshot,
  getStaleMetadataRevertAllowedRolesFromEnv,
  STALE_METADATA_REVERT_CONFIRM_ROLES_ENV,
  updateStaleMetadataRevertPolicyConfig,
} from '@/lib/server/stale-metadata-revert-policy';

describe('stale metadata revert policy', () => {
  const originalValue = process.env[STALE_METADATA_REVERT_CONFIRM_ROLES_ENV];

  afterEach(() => {
    clearStaleMetadataRevertPolicyConfigForTest();
    if (originalValue === undefined) {
      delete process.env[STALE_METADATA_REVERT_CONFIRM_ROLES_ENV];
    } else {
      process.env[STALE_METADATA_REVERT_CONFIRM_ROLES_ENV] = originalValue;
    }
  });

  it('keeps OWNER as the default allowed role', () => {
    delete process.env[STALE_METADATA_REVERT_CONFIRM_ROLES_ENV];

    expect(getStaleMetadataRevertAllowedRolesFromEnv()).toMatchObject({
      defaultRoles: ['OWNER'],
      configuredRoles: [],
      ignoredValues: [],
      allowedRoles: ['OWNER'],
    });
    expect(canConfirmStaleMetadataRevert({ role: 'OWNER' })).toBe(true);
    expect(canConfirmStaleMetadataRevert({ role: 'EDITOR' })).toBe(false);
  });

  it('allows EDITOR when REY30_STALE_METADATA_REVERT_CONFIRM_ROLES=OWNER,EDITOR', () => {
    process.env[STALE_METADATA_REVERT_CONFIRM_ROLES_ENV] = 'OWNER,EDITOR';

    const policy = getStaleMetadataRevertAllowedRolesFromEnv();
    const snapshot = createStaleMetadataRevertPolicySnapshot({
      evaluatedRole: 'EDITOR',
      capturedAt: '2026-04-18T00:00:00.000Z',
    });

    expect(policy).toMatchObject({
      defaultRoles: ['OWNER'],
      configuredRoles: ['OWNER', 'EDITOR'],
      ignoredValues: [],
      allowedRoles: ['OWNER', 'EDITOR'],
    });
    expect(snapshot).toMatchObject({
      policyId: 'stale_metadata_revert_confirmation_roles',
      source: 'env',
      envVarName: STALE_METADATA_REVERT_CONFIRM_ROLES_ENV,
      evaluatedRole: 'EDITOR',
      allowed: true,
      capturedAt: '2026-04-18T00:00:00.000Z',
      allowedRoles: ['OWNER', 'EDITOR'],
    });
    expect(canConfirmStaleMetadataRevert({ role: 'EDITOR' })).toBe(true);
  });

  it('uses persisted allowlist config before env fallback and records the allowlist change event', async () => {
    delete process.env[STALE_METADATA_REVERT_CONFIRM_ROLES_ENV];

    const update = await updateStaleMetadataRevertPolicyConfig({
      allowedRoles: ['EDITOR'],
      actorUserId: 'owner-1',
      actorEmail: 'owner@example.com',
      reason: 'Delegate stale revert confirmations to editors.',
    });
    const snapshot = createStaleMetadataRevertPolicySnapshot({
      evaluatedRole: 'EDITOR',
      capturedAt: '2026-04-18T00:00:00.000Z',
    });

    expect(update.success).toBe(true);
    if (!update.success) {
      throw new Error('policy update unexpectedly failed');
    }
    expect(update.event).toMatchObject({
      eventType: 'stale_metadata_revert_allowlist_changed',
      actorUserId: 'owner-1',
      actorEmail: 'owner@example.com',
      beforeRoles: ['OWNER'],
      afterRoles: ['OWNER', 'EDITOR'],
      reason: 'Delegate stale revert confirmations to editors.',
    });
    expect(update.config.auditTrail).toHaveLength(1);
    expect(snapshot).toMatchObject({
      source: 'persisted_config',
      configuredRoles: ['OWNER', 'EDITOR'],
      allowedRoles: ['OWNER', 'EDITOR'],
      evaluatedRole: 'EDITOR',
      allowed: true,
      configVersion: 1,
      configUpdatedAt: update.config.updatedAt,
    });
  });
});
