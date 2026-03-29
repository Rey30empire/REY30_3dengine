import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  authErrorToResponse,
  logSecurityEvent,
  requireSession,
} from '@/lib/security/auth';

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession(request, 'EDITOR');
    const logs = await db.securityAuditLog.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return NextResponse.json({
      logs: logs.map((entry) => ({
        id: entry.id,
        action: entry.action,
        target: entry.target,
        status: entry.status,
        ipAddress: entry.ipAddress,
        createdAt: entry.createdAt,
        metadata: entry.metadata,
      })),
    });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    await logSecurityEvent({
      request,
      action: 'user.security_logs.read',
      status: 'error',
      metadata: { error: String(error) },
    });
    return NextResponse.json({ error: 'No se pudo obtener el log de seguridad.' }, { status: 500 });
  }
}
