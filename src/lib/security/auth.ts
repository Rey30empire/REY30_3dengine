import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type { UserRole } from '@prisma/client';
import { db } from '@/lib/db';
import { hashToken, isMissingEncryptionSecretError } from './crypto';
import { getClientIp } from './client-ip';
import { applyCsrfCookie, clearCsrfCookie } from './csrf';

export const SESSION_COOKIE_NAME = 'rey30_session';
const SESSION_TTL_DAYS = 14;
const SESSION_TTL_SECONDS = SESSION_TTL_DAYS * 24 * 60 * 60;
const SESSION_COOKIE_SECURE = process.env.NODE_ENV === 'production';
const SESSION_COOKIE_SAMESITE: 'strict' | 'lax' =
  process.env.NODE_ENV === 'production' ? 'strict' : 'lax';

type RoleRank = Record<UserRole, number>;

const ROLE_RANK: RoleRank = {
  VIEWER: 1,
  EDITOR: 2,
  OWNER: 3,
};

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  isActive: boolean;
};

export type SessionUser = AuthUser & {
  sessionId: string;
};

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
}): Promise<void> {
  try {
    await db.securityAuditLog.create({
      data: {
        userId: params.userId || null,
        action: params.action,
        target: params.target || null,
        status: params.status,
        ipAddress: params.request ? getClientIp(params.request) : null,
        userAgent: params.request?.headers.get('user-agent') || null,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      },
    });
  } catch (error) {
    console.warn('[security] failed to write audit log', error);
  }
}

export function hasRequiredRole(role: UserRole, minimum: UserRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export function ensureRole(role: UserRole, minimum: UserRole): void {
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
  if (!token) return null;

  const tokenHash = hashToken(token);
  const session = await db.authSession.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await db.authSession.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  if (!session.user.isActive) return null;

  await db.authSession.update({
    where: { id: session.id },
    data: { lastSeenAt: new Date() },
  }).catch(() => undefined);

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role,
    isActive: session.user.isActive,
    sessionId: session.id,
  };
}

export async function requireSession(
  request: NextRequest,
  minimumRole: UserRole = 'VIEWER'
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
    return NextResponse.json({ error: 'Debes iniciar sesión.' }, { status: 401 });
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
