import { NextRequest, NextResponse } from 'next/server';
import {
  authErrorToResponse,
  logSecurityEvent,
  requireSession,
} from '@/lib/security/auth';
import {
  isAdminTerminalEnabled,
  isAdminTerminalRemoteEnabled,
  isAdminTerminalRouteAvailable,
  isLocalAdminTerminalRequest,
} from '@/lib/security/admin-terminal-policy';
import {
  executeAdminTerminalAction,
  getAdminTerminalActionById,
  getAdminTerminalActionCatalog,
} from '@/lib/server/admin-terminal-actions';

async function authorizeTerminalRequest(
  request: NextRequest,
  auditAction: 'admin.terminal.catalog' | 'admin.terminal.execute'
): Promise<{ userId: string }> {
  if (!isAdminTerminalEnabled()) {
    throw new Error('NOT_FOUND');
  }

  if (!isAdminTerminalRemoteEnabled() && !isLocalAdminTerminalRequest(request)) {
    throw new Error('NOT_FOUND');
  }

  if (!isAdminTerminalRouteAvailable(request)) {
    throw new Error('NOT_FOUND');
  }

  const user = await requireSession(request, 'OWNER');
  const adminToken = (process.env.REY30_ADMIN_TOKEN || '').trim();
  if (adminToken) {
    const provided = request.headers.get('x-rey30-admin-token');
    if (provided !== adminToken) {
      await logSecurityEvent({
        request,
        userId: user.id,
        action: auditAction,
        status: 'denied',
        metadata: { reason: 'admin_token_mismatch' },
      });
      throw new Error('ADMIN_TOKEN_REQUIRED');
    }
  }

  return { userId: user.id };
}

function notFoundResponse() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

function actionDeniedResponse(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeTerminalRequest(request, 'admin.terminal.catalog');
    await logSecurityEvent({
      request,
      userId: auth.userId,
      action: 'admin.terminal.catalog',
      status: 'allowed',
      metadata: { actionCount: getAdminTerminalActionCatalog().length },
    });
    return NextResponse.json({
      ok: true,
      actions: getAdminTerminalActionCatalog(),
    });
  } catch (error) {
    if (String(error).includes('NOT_FOUND')) {
      return notFoundResponse();
    }
    if (String(error).includes('ADMIN_TOKEN_REQUIRED')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return authErrorToResponse(error);
  }
}

export async function POST(request: NextRequest) {
  let actorUserId: string | null = null;

  try {
    const auth = await authorizeTerminalRequest(request, 'admin.terminal.execute');
    actorUserId = auth.userId;
  } catch (error) {
    if (String(error).includes('NOT_FOUND')) {
      return notFoundResponse();
    }
    if (String(error).includes('ADMIN_TOKEN_REQUIRED')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return authErrorToResponse(error);
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      actionId?: string;
      relativePath?: string;
    };
    const actionId = typeof body.actionId === 'string' ? body.actionId.trim() : '';
    const relativePath =
      typeof body.relativePath === 'string' ? body.relativePath.trim() : undefined;

    if (!actionId) {
      await logSecurityEvent({
        request,
        userId: actorUserId,
        action: 'admin.terminal.execute',
        status: 'denied',
        metadata: { reason: 'missing_action_id' },
      });
      return actionDeniedResponse('actionId is required');
    }

    const action = getAdminTerminalActionById(actionId);
    if (!action) {
      await logSecurityEvent({
        request,
        userId: actorUserId,
        action: 'admin.terminal.execute',
        status: 'denied',
        metadata: { reason: 'unknown_action', actionId },
      });
      return actionDeniedResponse('Unknown terminal action');
    }

    const startedAt = Date.now();
    const result = await executeAdminTerminalAction({
      actionId,
      relativePath,
    });

    await logSecurityEvent({
      request,
      userId: actorUserId,
      action: 'admin.terminal.execute',
      target: actionId,
      status: result.code === 0 ? 'allowed' : 'error',
      metadata: {
        commandPreview: action.commandPreview,
        relativePath: relativePath || '.',
        cwd: result.cwd,
        code: result.code,
        durationMs: Date.now() - startedAt,
      },
    });

    const status = result.code === 0 ? 200 : 500;
    return NextResponse.json(
      {
        ok: result.code === 0,
        actionId: result.actionId,
        label: result.label,
        commandPreview: result.commandPreview,
        cwd: result.cwd,
        stdout: result.stdout,
        stderr: result.stderr,
        code: result.code,
      },
      { status }
    );
  } catch (error: unknown) {
    const message = String((error as { message?: string })?.message || error || 'Action failed');
    const denied = message.includes('relativePath must stay inside project root');

    await logSecurityEvent({
      request,
      userId: actorUserId,
      action: 'admin.terminal.execute',
      status: denied ? 'denied' : 'error',
      metadata: { error: message },
    });

    return NextResponse.json(
      {
        ok: false,
        error: message,
        stdout: '',
        stderr: '',
        code: denied ? 1 : 1,
      },
      { status: denied ? 400 : 500 }
    );
  }
}
