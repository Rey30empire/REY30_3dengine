import { NextRequest, NextResponse } from 'next/server';
import {
  applySessionCookie,
  createSessionForUser,
  logSecurityEvent,
} from '@/lib/security/auth';
import {
  ensureSharedAccessUser,
  isValidSharedAccessToken,
} from '@/lib/security/shared-access';

type TokenAuthRequestBody = {
  token?: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as TokenAuthRequestBody;
    const providedToken = String(body.token || '').trim();

    if (!providedToken) {
      await logSecurityEvent({
        request,
        action: 'auth.token_login',
        status: 'denied',
        metadata: { reason: 'missing_token' },
        durability: 'critical',
      });
      return NextResponse.json({ error: 'Token de acceso requerido.' }, { status: 400 });
    }

    if (!isValidSharedAccessToken(providedToken)) {
      await logSecurityEvent({
        request,
        action: 'auth.token_login',
        status: 'denied',
        metadata: { reason: 'invalid_token' },
        durability: 'critical',
      });
      return NextResponse.json({ error: 'Token de acceso inválido.' }, { status: 401 });
    }

    const user = await ensureSharedAccessUser({ touchLastLogin: true });
    if (!user) {
      await logSecurityEvent({
        request,
        action: 'auth.token_login',
        status: 'error',
        metadata: { reason: 'shared_access_not_configured' },
        durability: 'critical',
      });
      return NextResponse.json(
        { error: 'Acceso compartido no configurado en el servidor.' },
        { status: 503 }
      );
    }

    const { token, expiresAt } = await createSessionForUser(user.id);
    const response = NextResponse.json({
      success: true,
      accessMode: 'shared_token',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      policy: {
        byok: false,
        sharedAccess: true,
        note: 'Acceso compartido por token activado. La app usa credenciales del servidor con permisos de colaborador.',
      },
    });

    await logSecurityEvent({
      request,
      userId: user.id,
      action: 'auth.token_login',
      status: 'allowed',
      metadata: { role: user.role },
      durability: 'critical',
    });

    return applySessionCookie(response, token, expiresAt);
  } catch (error) {
    await logSecurityEvent({
      request,
      action: 'auth.token_login',
      status: 'error',
      metadata: { error: String(error) },
      durability: 'critical',
    });
    return NextResponse.json({ error: 'No se pudo iniciar sesión con token.' }, { status: 500 });
  }
}
