import type { NextRequest } from 'next/server';
import { isLocalRequest } from './auth';

export type RegistrationMode = 'open' | 'invite_only' | 'allowlist';

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function allowLocalDevOpenRegistration(request: NextRequest): boolean {
  if (process.env.NODE_ENV !== 'development') return false;
  if (!isLocalRequest(request)) return false;
  const raw = (process.env.REY30_ALLOW_DEV_LOCAL_REGISTRATION || '').trim().toLowerCase();
  return raw !== 'false';
}

export function getRegistrationMode(): RegistrationMode {
  const raw = (process.env.REY30_REGISTRATION_MODE || '').trim().toLowerCase();
  if (raw === 'open' || raw === 'invite_only' || raw === 'allowlist') {
    return raw;
  }
  if (process.env.NODE_ENV === 'development') {
    return 'open';
  }
  return 'invite_only';
}

export function parseRegistrationAllowlistEmails(): Set<string> {
  return new Set(
    (process.env.REY30_REGISTRATION_ALLOWLIST || '')
      .split(',')
      .map((value) => normalizeEmail(value || ''))
      .filter(Boolean)
  );
}

export function isInviteTokenConfigured(): boolean {
  return (process.env.REY30_REGISTRATION_INVITE_TOKEN || '').trim().length > 0;
}

export function isBootstrapOwnerTokenConfigured(): boolean {
  return (process.env.REY30_BOOTSTRAP_OWNER_TOKEN || '').trim().length > 0;
}

export function isRemoteOpenRegistrationAllowed(): boolean {
  return (process.env.REY30_ALLOW_OPEN_REGISTRATION_REMOTE || '').trim().toLowerCase() === 'true';
}

export function getProductionRegistrationPosture(): {
  mode: RegistrationMode;
  inviteTokenConfigured: boolean;
  bootstrapOwnerTokenConfigured: boolean;
  allowRemoteOpenRegistration: boolean;
  issues: string[];
  warnings: string[];
} {
  const mode = getRegistrationMode();
  const inviteTokenConfigured = isInviteTokenConfigured();
  const bootstrapOwnerTokenConfigured = isBootstrapOwnerTokenConfigured();
  const allowRemoteOpenRegistration = isRemoteOpenRegistrationAllowed();
  const issues: string[] = [];
  const warnings: string[] = [];

  if (process.env.NODE_ENV !== 'production') {
    return {
      mode,
      inviteTokenConfigured,
      bootstrapOwnerTokenConfigured,
      allowRemoteOpenRegistration,
      issues,
      warnings,
    };
  }

  if (mode === 'open') {
    issues.push(
      'Production registration mode must not be open. Use invite_only or allowlist.'
    );
  }

  if (mode === 'invite_only' && !inviteTokenConfigured) {
    issues.push(
      'Missing REY30_REGISTRATION_INVITE_TOKEN while REY30_REGISTRATION_MODE=invite_only.'
    );
  }

  if (allowRemoteOpenRegistration) {
    issues.push('REY30_ALLOW_OPEN_REGISTRATION_REMOTE must remain false in production.');
  }

  if (!bootstrapOwnerTokenConfigured) {
    issues.push('Missing REY30_BOOTSTRAP_OWNER_TOKEN for production bootstrap recovery.');
  }

  if (mode === 'allowlist' && parseRegistrationAllowlistEmails().size === 0) {
    warnings.push(
      'REY30_REGISTRATION_MODE=allowlist is enabled without REY30_REGISTRATION_ALLOWLIST entries.'
    );
  }

  return {
    mode,
    inviteTokenConfigured,
    bootstrapOwnerTokenConfigured,
    allowRemoteOpenRegistration,
    issues,
    warnings,
  };
}
