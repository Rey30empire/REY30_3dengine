import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { readDurableSecurityAuditLogs } from '@/lib/server/external-integration-store';
import {
  authErrorToResponse,
  logSecurityEvent,
  requireSession,
} from '@/lib/security/auth';

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession(request, 'EDITOR');
    let dbReadError: unknown = null;
    const [dbLogs, fallbackLogs] = await Promise.all([
      db.securityAuditLog.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }).catch((error) => {
        dbReadError = error;
        return [];
      }),
      Promise.resolve(readDurableSecurityAuditLogs({ userId: user.id, take: 200 })),
    ]);

    if (dbReadError && fallbackLogs.length === 0) {
      throw dbReadError;
    }

    const logs = [
      ...dbLogs.map((entry) => ({
        id: entry.id,
        action: entry.action,
        target: entry.target,
        status: entry.status,
        ipAddress: entry.ipAddress,
        createdAt: entry.createdAt,
        metadata: entry.metadata,
      })),
      ...fallbackLogs.map((entry) => ({
        id: entry.id,
        action: entry.action,
        target: entry.target,
        status: entry.status,
        ipAddress: entry.ipAddress,
        createdAt: new Date(entry.createdAt),
        metadata: entry.metadata,
      })),
    ]
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .slice(0, 200);

    return NextResponse.json({
      logs,
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
