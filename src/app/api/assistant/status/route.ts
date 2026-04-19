import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/security/auth';
import { isSharedAccessUserEmail } from '@/lib/security/shared-access';
import {
  createAnonymousAssistantSurfaceStatus,
  deriveAssistantSurfaceStatus,
} from '@/lib/security/assistant-surface';
import { getUserScopedConfig } from '@/lib/security/user-api-config';
import { buildAssistantSurfaceDiagnostics } from '@/lib/server/assistant-diagnostics';

function shouldIncludeDiagnostics(request: NextRequest): boolean {
  const flag = (request.nextUrl.searchParams.get('includeDiagnostics') || '').trim().toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes';
}

export async function GET(request: NextRequest) {
  const includeDiagnostics = shouldIncludeDiagnostics(request);

  try {
    const user = await getSessionUser(request);
    if (!user) {
      const payload = createAnonymousAssistantSurfaceStatus();
      if (includeDiagnostics) {
        payload.diagnostics = await buildAssistantSurfaceDiagnostics(payload);
      }
      return NextResponse.json(payload);
    }

    const config = await getUserScopedConfig(user.id);
    const payload = deriveAssistantSurfaceStatus({
      config,
      role: user.role,
      sharedAccess: isSharedAccessUserEmail(user.email),
    });

    if (includeDiagnostics) {
      payload.diagnostics = await buildAssistantSurfaceDiagnostics(payload);
    }

    return NextResponse.json(payload);
  } catch {
    const payload = createAnonymousAssistantSurfaceStatus();
    if (includeDiagnostics) {
      payload.diagnostics = await buildAssistantSurfaceDiagnostics(payload);
    }
    return NextResponse.json(payload);
  }
}
