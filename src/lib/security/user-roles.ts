export const USER_ROLES = ['OWNER', 'EDITOR', 'VIEWER'] as const;

export type AppUserRole = (typeof USER_ROLES)[number];

export function isAppUserRole(value: string): value is AppUserRole {
  return (USER_ROLES as readonly string[]).includes(value);
}
