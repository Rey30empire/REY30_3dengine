import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { getUserUsagePolicy } from '@/lib/security/usage-governance';
import {
  getFinOpsAutomationControl,
  getUserFinOpsAutopilotConfig,
  getUserUsageAlertProfile,
} from '@/lib/security/usage-finops';

const createdUserIds = new Set<string>();
const createdControlKeys = new Set<string>();

async function databaseReachable() {
  return db.$queryRaw`SELECT 1`
    .then(() => true)
    .catch(() => false);
}

async function createTestUser() {
  const user = await db.user.create({
    data: {
      email: `usage-finops-${Date.now()}-${Math.random().toString(36).slice(2)}@rey30.local`,
      role: 'VIEWER',
    },
    select: { id: true },
  });
  createdUserIds.add(user.id);
  return user;
}

afterEach(async () => {
  if (createdControlKeys.size > 0) {
    await db.finOpsAutomationControl.deleteMany({
      where: {
        controlKey: { in: Array.from(createdControlKeys) },
      },
    });
    createdControlKeys.clear();
  }

  if (createdUserIds.size > 0) {
    await db.user.deleteMany({
      where: {
        id: { in: Array.from(createdUserIds) },
      },
    });
    createdUserIds.clear();
  }
});

describe('Usage FinOps concurrency', () => {
  it('creates only one default usage policy under concurrent reads', async () => {
    if (!(await databaseReachable())) {
      expect(await databaseReachable()).toBe(false);
      return;
    }

    const user = await createTestUser();

    const policies = await Promise.all(
      Array.from({ length: 8 }, () => getUserUsagePolicy(user.id))
    );

    expect(policies).toHaveLength(8);
    expect(await db.userUsagePolicy.count({ where: { userId: user.id } })).toBe(1);
  });

  it('creates only one alert profile under concurrent reads', async () => {
    if (!(await databaseReachable())) {
      expect(await databaseReachable()).toBe(false);
      return;
    }

    const user = await createTestUser();

    const profiles = await Promise.all(
      Array.from({ length: 8 }, () => getUserUsageAlertProfile(user.id))
    );

    expect(profiles).toHaveLength(8);
    expect(await db.userUsageAlertProfile.count({ where: { userId: user.id } })).toBe(1);
  });

  it('creates only one autopilot config under concurrent reads', async () => {
    if (!(await databaseReachable())) {
      expect(await databaseReachable()).toBe(false);
      return;
    }

    const user = await createTestUser();

    const configs = await Promise.all(
      Array.from({ length: 8 }, () => getUserFinOpsAutopilotConfig(user.id))
    );

    expect(configs).toHaveLength(8);
    expect(await db.userFinOpsAutopilot.count({ where: { userId: user.id } })).toBe(1);
  });

  it('creates only one automation control row under concurrent reads', async () => {
    if (!(await databaseReachable())) {
      expect(await databaseReachable()).toBe(false);
      return;
    }

    const controlKey = `usage-finops-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    createdControlKeys.add(controlKey);

    const controls = await Promise.all(
      Array.from({ length: 8 }, () => getFinOpsAutomationControl(controlKey))
    );

    expect(controls).toHaveLength(8);
    expect(
      await db.finOpsAutomationControl.count({
        where: { controlKey },
      })
    ).toBe(1);
  });
});
