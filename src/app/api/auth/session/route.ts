import { NextRequest, NextResponse } from 'next/server';
import {
  applySessionCookie,
  createSessionForUser,
  ensureLocalOwnerUser,
  getLocalOwnerIdentity,
  getSessionUser,
  isLocalOwnerModeEnabled,
  logSecurityEvent,
} from '@/lib/security/auth';
import { applyCsrfCookie, CSRF_COOKIE_NAME, isValidCsrfTokenFormat } from '@/lib/security/csrf';
import { buildEditorAccessMatrix, getDefaultEditorAccessMatrix } from '@/lib/security/editor-access';
import {
  isAdminTerminalAdminTokenRequired,
  isAdminTerminalRouteAvailable,
} from '@/lib/security/admin-terminal-policy';
import { isSharedAccessUserEmail } from '@/lib/security/shared-access';

async function resolveSessionResponse(request: NextRequest) {
  try {
    const localOwnerModeRequested = isLocalOwnerModeEnabled(request);
    let user = await getSessionUser(request);
    let bootstrappedLocalOwner = false;

    if (!user && localOwnerModeRequested) {
      const localOwner = await ensureLocalOwnerUser({ touchLastLogin: true });
      user = {
        ...localOwner,
        sessionId: 'local-owner-bootstrap',
      };
      bootstrappedLocalOwner = true;
    }

    if (!user) {
      return NextResponse.json(
        {
          authenticated: false,
          editorAccess: getDefaultEditorAccessMatrix(),
        },
        { status: 200 }
      );
    }

    const accessMode = isSharedAccessUserEmail(user.email) ? 'shared_token' : 'user_session';
    const localOwnerEmail = getLocalOwnerIdentity().email;
    const localOwnerMode =
      (bootstrappedLocalOwner ||
        (localOwnerModeRequested &&
          accessMode === 'user_session' &&
          user.email.trim().toLowerCase() === localOwnerEmail));
    const computedEditorAccess = buildEditorAccessMatrix({
      sessionRole: user.role,
      sessionAccessMode: accessMode,
    });
    const editorAccess = {
      ...computedEditorAccess,
      permissions: {
        ...computedEditorAccess.permissions,
        terminalActions:
          computedEditorAccess.permissions.terminalActions &&
          isAdminTerminalRouteAvailable(request) &&
          !isAdminTerminalAdminTokenRequired(),
      },
    };

    const response = NextResponse.json({
      authenticated: true,
      accessMode,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      editorAccess,
      policy: {
        byok: accessMode !== 'shared_token',
        sharedAccess: accessMode === 'shared_token',
        localOwnerMode,
        note: accessMode === 'shared_token'
          ? 'Acceso compartido por token. La app usa credenciales del servidor con permisos de colaborador.'
          : localOwnerMode
            ? 'Modo local single-user activo. La app inicia sesión automáticamente sin email ni password.'
            : 'Cada usuario opera con sus propias APIs y asume costos/uso.',
      },
    });

    const hasSessionCookie = Boolean(request.cookies.get('rey30_session')?.value);
    if (localOwnerMode && (!hasSessionCookie || bootstrappedLocalOwner)) {
      const { token, expiresAt } = await createSessionForUser(user.id);
      applySessionCookie(response, token, expiresAt);
    }

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
    return NextResponse.json(
      {
        authenticated: false,
        editorAccess: getDefaultEditorAccessMatrix(),
      },
      { status: 200 }
    );
  }
}

export async function GET(request: NextRequest) {
  return resolveSessionResponse(request);
}

export async function HEAD(request: NextRequest) {
  const response = await resolveSessionResponse(request);
  return new NextResponse(null, {
    status: response.status,
    headers: response.headers,
  });
}
