import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, logSecurityEvent } from '@/lib/security/auth';
import { applyCsrfCookie, CSRF_COOKIE_NAME, isValidCsrfTokenFormat } from '@/lib/security/csrf';

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request);
    if (!user) {
      return NextResponse.json({ authenticated: false }, { status: 200 });
    }

    const response = NextResponse.json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      policy: {
        byok: true,
        note: 'Cada usuario opera con sus propias APIs y asume costos/uso.',
      },
    });

    const csrfToken = (request.cookies.get(CSRF_COOKIE_NAME)?.value || '').trim();
    if (!isValidCsrfTokenFormat(csrfToken)) {
      applyCsrfCookie(response);
    }

    return response;
  } catch (error) {
    await logSecurityEvent({
      request,
      action: 'auth.session',
      status: 'error',
      metadata: { error: String(error) },
    });
    return NextResponse.json({ authenticated: false }, { status: 200 });
  }
}
