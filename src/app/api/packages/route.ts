// ============================================
// Packages API - persist packages through the shared storage adapter
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import { upsertStoredPackage } from '@/lib/server/package-storage';

type RequestBody = Parameters<typeof upsertStoredPackage>[0];

export async function POST(request: NextRequest) {
  try {
    await requireSession(request, 'EDITOR');
    const body = (await request.json()) as RequestBody;
    const rawName = body.name?.trim();
    if (!rawName) {
      return NextResponse.json({ success: false, error: 'name es requerido' }, { status: 400 });
    }
    const stored = await upsertStoredPackage(body);

    const filePath =
      stored.storage.backend === 'filesystem'
        ? path.relative(process.cwd(), stored.filePath).replace(/\\/g, '/')
        : stored.filePath;

    return NextResponse.json({
      success: true,
      name: stored.name,
      path: filePath,
      package: stored.package,
      storage: stored.storage,
    });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
