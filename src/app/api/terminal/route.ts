import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import { getClientIp } from '@/lib/security/client-ip';

const execAsync = promisify(exec);
const DEFAULT_TIMEOUT = 15_000;
const MAX_OUTPUT = 200_000; // 200 KB
const TERMINAL_ENABLED = process.env.REY30_ENABLE_TERMINAL_API === 'true';
const TERMINAL_ENABLE_REMOTE = (process.env.REY30_ENABLE_TERMINAL_API_REMOTE || '').trim().toLowerCase() === 'true';
function isLoopbackHost(value: string): boolean {
  const host = (value || '').trim().toLowerCase();
  if (!host) return false;
  if (host === 'localhost' || host === '::1' || host === '[::1]') return true;
  return host.startsWith('127.');
}
function isLoopbackIp(value: string): boolean {
  const normalized = (value || '').trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === '::1' || normalized === '[::1]') return true;
  return normalized.startsWith('127.');
}
function isLocalTerminalRequest(request: NextRequest): boolean {
  if (isLoopbackHost(request.nextUrl.hostname)) return true;
  const clientIp = getClientIp(request);
  return !!clientIp && isLoopbackIp(clientIp);
}

export async function POST(request: NextRequest) {
  if (!TERMINAL_ENABLED) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!TERMINAL_ENABLE_REMOTE && !isLocalTerminalRequest(request)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    await requireSession(request, 'OWNER');
  } catch (error) {
    return authErrorToResponse(error);
  }

  const adminToken = (process.env.REY30_ADMIN_TOKEN || '').trim();
  if (adminToken) {
    const provided = request.headers.get('x-rey30-admin-token');
    if (provided !== adminToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const body = await request.json();
    const cmd: string | undefined = body?.cmd;
    const cwd: string | undefined = body?.cwd;
    const timeout: number | undefined = body?.timeout;

    if (!cmd || typeof cmd !== 'string' || cmd.length > 500) {
      return NextResponse.json({ error: 'cmd is required' }, { status: 400 });
    }

    const safeCwd = cwd && typeof cwd === 'string' ? path.resolve(process.cwd(), cwd) : process.cwd();
    const rel = path.relative(process.cwd(), safeCwd);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      return NextResponse.json({ error: 'cwd must stay inside project root' }, { status: 400 });
    }

    const result = await execAsync(cmd, {
      cwd: safeCwd,
      timeout: Math.min(timeout ?? DEFAULT_TIMEOUT, 60_000),
      maxBuffer: MAX_OUTPUT,
      windowsHide: true,
    });

    return NextResponse.json({
      ok: true,
      cmd,
      cwd: safeCwd,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      code: 0,
    });
  } catch (error: unknown) {
    const err = error as { message?: string; stdout?: string; stderr?: string; code?: number };
    return NextResponse.json({
      ok: false,
      error: String(err?.message || 'Command failed'),
      stdout: err?.stdout ?? '',
      stderr: err?.stderr ?? '',
      code: typeof err?.code === 'number' ? err.code : 1,
    }, { status: 500 });
  }
}


