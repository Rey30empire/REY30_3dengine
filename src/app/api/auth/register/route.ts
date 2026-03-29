import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import type { UserRole } from '@prisma/client';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/security/password';
import {
  applySessionCookie,
  createSessionForUser,
  isLocalRequest,
  logSecurityEvent,
  shouldGrantLocalDevOwner,
} from '@/lib/security/auth';
import {
  allowLocalDevOpenRegistration,
  getRegistrationMode,
  parseRegistrationAllowlistEmails,
} from '@/lib/security/registration-policy';

type RegisterRequestBody = {
  email?: string;
  password?: string;
  name?: string;
  bootstrapOwnerToken?: string;
  inviteToken?: string;
};

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function safeTokenEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function canRegisterByPolicy(request: NextRequest, body: RegisterRequestBody, normalizedEmail: string): boolean {
  if (allowLocalDevOpenRegistration(request)) {
    return true;
  }

  const mode = getRegistrationMode();

  if (mode === 'open') {
    const allowlist = parseRegistrationAllowlistEmails();
    const emailAllowed = allowlist.size === 0 || allowlist.has(normalizedEmail);
    if (!emailAllowed) return false;
    const allowRemoteOpenRegistration =
      (process.env.REY30_ALLOW_OPEN_REGISTRATION_REMOTE || '').trim().toLowerCase() === 'true';
    return allowRemoteOpenRegistration || isLocalRequest(request);
  }
  if (mode === 'allowlist') {
    const allowlist = parseRegistrationAllowlistEmails();
    return allowlist.has(normalizedEmail);
  }

  const inviteSecret = (process.env.REY30_REGISTRATION_INVITE_TOKEN || '').trim();
  if (!inviteSecret) {
    return false;
  }

  const providedInvite = (
    request.headers.get('x-rey30-register-invite') ||
    body.inviteToken ||
    ''
  ).trim();

  if (!providedInvite || !safeTokenEqual(providedInvite, inviteSecret)) {
    return false;
  }

  const allowlist = parseRegistrationAllowlistEmails();
  if (allowlist.size > 0 && !allowlist.has(normalizedEmail)) {
    return false;
  }

  return true;
}

function canPromoteFirstUserToOwner(request: NextRequest, body: RegisterRequestBody): boolean {
  const expected = (process.env.REY30_BOOTSTRAP_OWNER_TOKEN || '').trim();
  if (!expected) return false;

  const provided = (
    request.headers.get('x-rey30-bootstrap-owner-token') ||
    body.bootstrapOwnerToken ||
    ''
  ).trim();

  if (!provided) return false;
  return safeTokenEqual(provided, expected);
}

function getPrismaErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return null;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

function isRetryablePrismaError(error: unknown): boolean {
  const code = getPrismaErrorCode(error);
  return code === 'P2002' || code === 'P2034';
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RegisterRequestBody;
    const email = normalizeEmail(body.email || '');
    const password = body.password || '';
    const name = (body.name || '').trim() || null;

    if (!email || !password || password.length < 8) {
      await logSecurityEvent({
        request,
        action: 'auth.register',
        status: 'denied',
        metadata: { reason: 'invalid_payload' },
      });
      return NextResponse.json(
        { error: 'Email valido y contrasena de minimo 8 caracteres requeridos.' },
        { status: 400 }
      );
    }

    if (!canRegisterByPolicy(request, body, email)) {
      await logSecurityEvent({
        request,
        action: 'auth.register',
        status: 'denied',
        metadata: { reason: 'registration_policy_blocked', mode: getRegistrationMode() },
      });
      return NextResponse.json({ error: 'Registro deshabilitado o requiere invitacion.' }, { status: 403 });
    }

    const passwordHash = hashPassword(password);
    let createdUser:
      | { id: string; email: string; name: string | null; role: UserRole }
      | null = null;
    let role: 'OWNER' | 'VIEWER' = 'VIEWER';
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      try {
        const registration = await db.$transaction(async (tx) => {
          const existing = await tx.user.findUnique({
            where: { email },
            select: { id: true },
          });
          if (existing) {
            return { kind: 'exists' as const, userId: existing.id };
          }

          const promoteOwner = canPromoteFirstUserToOwner(request, body);
          let nextRole: 'OWNER' | 'VIEWER' = 'VIEWER';

          if (shouldGrantLocalDevOwner(request)) {
            nextRole = 'OWNER';
          } else if (promoteOwner) {
            const ownersCount = await tx.user.count({ where: { role: 'OWNER' } });
            if (ownersCount === 0) {
              nextRole = 'OWNER';
            }
          }

          const user = await tx.user.create({
            data: {
              email,
              name,
              role: nextRole,
              passwordHash,
              isActive: true,
              lastLoginAt: new Date(),
            },
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
            },
          });

          return { kind: 'created' as const, user, role: nextRole };
        });

        if (registration.kind === 'exists') {
          await logSecurityEvent({
            request,
            userId: registration.userId,
            action: 'auth.register',
            status: 'denied',
            metadata: { reason: 'email_exists' },
          });
          return NextResponse.json({ error: 'El correo ya esta registrado.' }, { status: 409 });
        }

        createdUser = registration.user;
        role = registration.role;
        break;
      } catch (error) {
        if (!isRetryablePrismaError(error) || attempt === maxRetries) {
          throw error;
        }
        await sleep(20 * attempt);
      }
    }

    if (!createdUser) {
      throw new Error('REGISTER_CREATE_FAILED');
    }

    const { token, expiresAt } = await createSessionForUser(createdUser.id);
    const response = NextResponse.json({
      success: true,
      user: {
        id: createdUser.id,
        email: createdUser.email,
        name: createdUser.name,
        role: createdUser.role,
      },
    });

    await logSecurityEvent({
      request,
      userId: createdUser.id,
      action: 'auth.register',
      status: 'allowed',
      metadata: { role },
    });

    return applySessionCookie(response, token, expiresAt);
  } catch (error) {
    await logSecurityEvent({
      request,
      action: 'auth.register',
      status: 'error',
      metadata: { error: String(error) },
    });
    return NextResponse.json({ error: 'No se pudo registrar la cuenta.' }, { status: 500 });
  }
}


