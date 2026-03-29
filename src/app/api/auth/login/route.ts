import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyPassword } from '@/lib/security/password';
import {
  applySessionCookie,
  createSessionForUser,
  logSecurityEvent,
  shouldGrantLocalDevOwner,
} from '@/lib/security/auth';

type LoginRequestBody = {
  email?: string;
  password?: string;
};

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as LoginRequestBody;
    const email = normalizeEmail(body.email || '');
    const password = body.password || '';

    if (!email || !password) {
      await logSecurityEvent({
        request,
        action: 'auth.login',
        status: 'denied',
        metadata: { reason: 'missing_credentials' },
      });
      return NextResponse.json({ error: 'Credenciales incompletas.' }, { status: 400 });
    }

    const user = await db.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash || !user.isActive) {
      await logSecurityEvent({
        request,
        userId: user?.id || null,
        action: 'auth.login',
        status: 'denied',
        metadata: { reason: 'invalid_user' },
      });
      return NextResponse.json({ error: 'Credenciales inválidas.' }, { status: 401 });
    }

    const ok = verifyPassword(password, user.passwordHash);
    if (!ok) {
      await logSecurityEvent({
        request,
        userId: user.id,
        action: 'auth.login',
        status: 'denied',
        metadata: { reason: 'invalid_password' },
      });
      return NextResponse.json({ error: 'Credenciales inválidas.' }, { status: 401 });
    }

    const now = new Date();
    let effectiveUser = user;
    if (shouldGrantLocalDevOwner(request) && user.role !== 'OWNER') {
      effectiveUser = await db.user.update({
        where: { id: user.id },
        data: {
          role: 'OWNER',
          lastLoginAt: now,
        },
      });
    } else {
      await db.user.update({
        where: { id: user.id },
        data: { lastLoginAt: now },
      });
    }

    const { token, expiresAt } = await createSessionForUser(effectiveUser.id);

    const response = NextResponse.json({
      success: true,
      user: {
        id: effectiveUser.id,
        email: effectiveUser.email,
        name: effectiveUser.name,
        role: effectiveUser.role,
      },
    });

    await logSecurityEvent({
      request,
      userId: effectiveUser.id,
      action: 'auth.login',
      status: 'allowed',
      metadata: {
        promotedToOwner: user.role !== effectiveUser.role,
      },
    });

    return applySessionCookie(response, token, expiresAt);
  } catch (error) {
    await logSecurityEvent({
      request,
      action: 'auth.login',
      status: 'error',
      metadata: { error: String(error) },
    });
    return NextResponse.json({ error: 'No se pudo iniciar sesión.' }, { status: 500 });
  }
}
