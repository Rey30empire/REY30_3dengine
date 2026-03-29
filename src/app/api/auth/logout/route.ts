import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  clearSessionCookie,
  getSessionUser,
  logSecurityEvent,
  SESSION_COOKIE_NAME,
} from '@/lib/security/auth';
import { hashToken } from '@/lib/security/crypto';

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const user = await getSessionUser(request);

    if (token) {
      await db.authSession.deleteMany({
        where: { tokenHash: hashToken(token) },
      });
    }

    await logSecurityEvent({
      request,
      userId: user?.id || null,
      action: 'auth.logout',
      status: 'allowed',
    });

    const response = NextResponse.json({ success: true });
    return clearSessionCookie(response);
  } catch (error) {
    await logSecurityEvent({
      request,
      action: 'auth.logout',
      status: 'error',
      metadata: { error: String(error) },
    });
    return NextResponse.json({ error: 'No se pudo cerrar sesión.' }, { status: 500 });
  }
}
