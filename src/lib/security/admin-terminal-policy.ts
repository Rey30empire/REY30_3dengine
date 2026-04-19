import type { NextRequest } from 'next/server';
import { getClientIp } from './client-ip';

function isLoopbackHost(value: string): boolean {
  const host = (value || '').trim().toLowerCase();
  if (!host) return false;
  if (host === 'localhost' || host === '::1' || host === '[::1]') return true;
  return host.startsWith('127.');
}

function isLoopbackIp(value: string): boolean {
  const normalized = (value || '').trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === '::1' || normalized === '[::1]') return true;
  return normalized.startsWith('127.');
}

export function isLocalAdminTerminalRequest(request: NextRequest): boolean {
  if (isLoopbackHost(request.nextUrl.hostname)) return true;
  const clientIp = getClientIp(request);
  return !!clientIp && isLoopbackIp(clientIp);
}

export function isAdminTerminalEnabled(): boolean {
  return process.env.REY30_ENABLE_TERMINAL_API === 'true';
}

export function isAdminTerminalRemoteEnabled(): boolean {
  return (process.env.REY30_ENABLE_TERMINAL_API_REMOTE || '').trim().toLowerCase() === 'true';
}

export function isAdminTerminalAdminTokenRequired(): boolean {
  return Boolean((process.env.REY30_ADMIN_TOKEN || '').trim());
}

export function isAdminTerminalRouteAvailable(request: NextRequest): boolean {
  if (process.env.NODE_ENV === 'production') {
    return false;
  }

  if (!isAdminTerminalEnabled()) {
    return false;
  }

  return isAdminTerminalRemoteEnabled() || isLocalAdminTerminalRequest(request);
}
