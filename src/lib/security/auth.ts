import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  persistDurableSecurityAuditLog,
} from '@/lib/server/external-integration-store';
import { hashToken, isMissingEncryptionSecretError } from './crypto';
import { getClientIp } from './client-ip';
import { applyCsrfCookie, clearCsrfCookie } from './csrf';
import { isSharedAccessUserEmail, resolveSharedAccessUserFromRequest } from './shared-access';
import type { AppUserRole } from './user-roles';

export const SESSION_COOKIE_NAME = 'rey30_session';
const SESSION_TTL_DAYS = 14;
const SESSION_TTL_SECONDS = SESSION_TTL_DAYS * 24 * 60 * 60;
const SESSION_COOKIE_SECURE = process.env.NODE_ENV === 'production';
const SESSION_COOKIE_SAMESITE: 'strict' | 'lax' =
  process.env.NODE_ENV === 'production' ? 'strict' : 'lax';

type RoleRank = Record<AppUserRole, number>;

const ROLE_RANK: RoleRank = {
  VIEWER: 1,
  EDITOR: 2,
  OWNER: 3,
};

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  role: AppUserRole;
  isActive: boolean;
};

export type SessionUser = AuthUser & {
  sessionId: string;
};

function getEffectiveSessionRole(user: Pick<AuthUser, 'email' | 'role'>): AppUserRole {
  return isSharedAccessUserEmail(user.email) ? 'VIEWER' : user.role;
}

function normalizeBooleanEnv(value: string | undefined, defaultValue = false): boolean {
  const normalized = (value || '').trim().toLowerCase();
  if (!normalized) return defaultValue;
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') {
    return true;
  }
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') {
    return false;
  }
  return defaultValue;
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === 'localhost' || normalized === '::1' || normalized === '[::1]') return true;
  return normalized.startsWith('127.');
}

export function isLocalRequest(request: NextRequest): boolean {
  return isLoopbackHostname(request.nextUrl.hostname);
}

export function shouldGrantLocalDevOwner(request: NextRequest): boolean {
  if (process.env.NODE_ENV !== 'development') return false;
  if (!isLocalRequest(request)) return false;
  const raw = (process.env.REY30_DEV_AUTO_OWNER || '').trim().toLowerCase();
  return raw !== 'false';
}

export function isLocalOwnerModeEnabled(request?: NextRequest): boolean {
  if (!normalizeBooleanEnv(process.env.REY30_LOCAL_OWNER_MODE, false)) {
    return false;
  }

  if (!request) {
    return true;
  }

  if (normalizeBooleanEnv(process.env.REY30_LOCAL_OWNER_ALLOW_REMOTE, false)) {
    return true;
  }

  return isLocalRequest(request);
}

export function getLocalOwnerIdentity() {
  return {
    email: (process.env.REY30_LOCAL_OWNER_EMAIL || 'owner@rey30.local').trim().toLowerCase(),
    name: (process.env.REY30_LOCAL_OWNER_NAME || 'REY30 Local Owner').trim() || 'REY30 Local Owner',
  };
}

export async function ensureLocalOwnerUser(options: { touchLastLogin?: boolean } = {}): Promise<AuthUser> {
  const { email, name } = getLocalOwnerIdentity();
  const touchLastLogin = options.touchLastLogin === true;
  const now = new Date();
  const record = await db.user.upsert({
    where: { email },
    create: {
      email,
      name,
      role: 'OWNER',
      isActive: true,
      ...(touchLastLogin ? { lastLoginAt: now } : {}),
    },
    update: {
      role: 'OWNER',
      isActive: true,
      name,
      ...(touchLastLogin ? { lastLoginAt: now } : {}),
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
    },
  });

  return {
    id: record.id,
    email: record.email,
    name: record.name,
    role: record.role,
    isActive: record.isActive,
  };
}

function nowPlusDays(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export async function logSecurityEvent(params: {
  request?: NextRequest;
  userId?: string | null;
  action: string;
  target?: string | null;
  status: 'allowed' | 'denied' | 'error';
  metadata?: Record<string, unknown> | null;
  durability?: 'best_effort' | 'critical';
}): Promise<void> {
  const metadata = params.metadata ? JSON.stringify(params.metadata) : null;
  const ipAddress = params.request ? getClientIp(params.request) : null;
  const userAgent = params.request?.headers.get('user-agent') || null;

  try {
    await db.securityAuditLog.create({
      data: {
        userId: params.userId || null,
        action: params.action,
        target: params.target || null,
        status: params.status,
        ipAddress,
        userAgent,
        metadata,
      },
    });
  } catch (error) {
    if (params.durability === 'critical') {
      try {
        await persistDurableSecurityAuditLog({
          userId: params.userId || null,
          action: params.action,
          target: params.target || null,
          status: params.status,
          ipAddress,
          userAgent,
          metadata,
        });
        console.warn('[security] audit log persisted via durable fallback', {
          action: params.action,
          status: params.status,
        });
        return;
      } catch (fallbackError) {
        console.warn('[security] failed to write audit log and durable fallback', {
          error,
          fallbackError,
          action: params.action,
          status: params.status,
        });
        return;
      }
    }

    console.warn('[security] failed to write audit log', error);
  }
}

export function hasRequiredRole(role: AppUserRole, minimum: AppUserRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export function ensureRole(role: AppUserRole, minimum: AppUserRole): void {
  if (!hasRequiredRole(role, minimum)) {
    throw new Error(`Role ${role} cannot access ${minimum} actions`);
  }
}

export async function createSessionForUser(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = nowPlusDays(SESSION_TTL_DAYS);

  await db.authSession.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
    },
  });

  return { token, expiresAt };
}

export function applySessionCookie(response: NextResponse, token: string, expiresAt: Date): NextResponse {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: SESSION_COOKIE_SECURE,
    sameSite: SESSION_COOKIE_SAMESITE,
    path: '/',
    expires: expiresAt,
    maxAge: SESSION_TTL_SECONDS,
    priority: 'high',
  });
  applyCsrfCookie(response);
  return response;
}

export function clearSessionCookie(response: NextResponse): NextResponse {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: SESSION_COOKIE_SECURE,
    sameSite: SESSION_COOKIE_SAMESITE,
    path: '/',
    expires: new Date(0),
    maxAge: 0,
    priority: 'high',
  });
  clearCsrfCookie(response);
  return response;
}

export async function getSessionUser(request: NextRequest): Promise<SessionUser | null> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    const tokenHash = hashToken(token);
    const session = await db.authSession.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (session) {
      if (session.expiresAt.getTime() <= Date.now()) {
        await db.authSession.delete({ where: { id: session.id } }).catch(() => undefined);
      } else if (session.user.isActive) {
        await db.authSession.update({
          where: { id: session.id },
          data: { lastSeenAt: new Date() },
        }).catch(() => undefined);

        return {
          id: session.user.id,
          email: session.user.email,
          name: session.user.name,
          role: getEffectiveSessionRole(session.user),
          isActive: session.user.isActive,
          sessionId: session.id,
        };
      }
    }
  }

  const sharedUser = await resolveSharedAccessUserFromRequest(request);
  if (!sharedUser) return null;

  return {
    ...sharedUser,
    role: getEffectiveSessionRole(sharedUser),
    sessionId: 'shared-access',
  };
}

export async function requireSession(
  request: NextRequest,
  minimumRole: AppUserRole = 'VIEWER'
): Promise<SessionUser> {
  const user = await getSessionUser(request);
  if (!user) {
    throw new Error('UNAUTHORIZED');
  }
  if (!hasRequiredRole(user.role, minimumRole)) {
    throw new Error('FORBIDDEN');
  }
  return user;
}

export function authErrorToResponse(error: unknown): NextResponse {
  const message = String(error || '');
  if (message.includes('UNAUTHORIZED')) {
    return NextResponse.json({ error: 'Debes iniciar sesión o usar un token de acceso.' }, { status: 401 });
  }
  if (message.includes('FORBIDDEN')) {
    return NextResponse.json({ error: 'No tienes permisos para esta acción.' }, { status: 403 });
  }
  if (isMissingEncryptionSecretError(error)) {
    return NextResponse.json(
      { error: 'Configuración incompleta del servidor: falta clave de cifrado.' },
      { status: 503 }
    );
  }
  return NextResponse.json({ error: 'Error de autenticación.' }, { status: 500 });
}
