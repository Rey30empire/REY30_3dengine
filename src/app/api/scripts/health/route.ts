import { NextRequest, NextResponse } from 'next/server';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import { getScriptStorageStatus } from '@/lib/server/script-storage';

function isAuthError(error: unknown): boolean {
  const msg = String(error);
  return msg.includes('UNAUTHORIZED') || msg.includes('FORBIDDEN');
}

export async function GET(request: NextRequest) {
  try {
    await requireSession(request, 'VIEWER');
    const status = await getScriptStorageStatus();
    if (!status.available && status.error) {
      console.error('[scripts/health][GET] unavailable:', status.error);
    }

    return NextResponse.json({
      success: status.available,
      available: status.available,
      backend: status.backend,
      scope: status.scope,
      root: status.root,
      storeName: status.storeName,
      message: status.available
        ? status.backend === 'netlify-blobs'
          ? 'Scripts API operativa con Netlify Blobs.'
          : 'Scripts API operativa.'
        : 'No se pudo acceder al backend de scripts.',
    });
  } catch (error) {
    if (isAuthError(error)) return authErrorToResponse(error);
    console.error('[scripts/health][GET] failed:', error);
    return NextResponse.json(
      {
        success: false,
        available: false,
        message: 'No se pudo acceder al root de scripts.',
      },
      { status: 200 }
    );
  }
}
