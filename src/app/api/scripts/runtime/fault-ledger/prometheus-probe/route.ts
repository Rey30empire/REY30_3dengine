import { NextRequest, NextResponse } from 'next/server';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import { hasValidOpsToken } from '@/lib/security/ops-token';
import {
  getLatestRuntimeForensicsExternalPrometheusProbeSnapshot,
  getRuntimeForensicsExternalPrometheusProbeConfig,
  putRuntimeForensicsExternalPrometheusProbeSnapshot,
  runRuntimeForensicsExternalPrometheusProbe,
} from '@/lib/server/runtime-forensics-prometheus-probe';

async function authorize(request: NextRequest) {
  if (hasValidOpsToken(request)) return { id: 'ops-token', role: 'OPS' };
  return requireSession(request, 'EDITOR');
}

export async function GET(request: NextRequest) {
  try {
    await authorize(request);
    return NextResponse.json({
      ok: true,
      config: getRuntimeForensicsExternalPrometheusProbeConfig(),
      latest: await getLatestRuntimeForensicsExternalPrometheusProbeSnapshot(),
    });
  } catch (error) {
    return authErrorToResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await authorize(request);
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      result?: unknown;
    };
    const action = body.action || 'run';

    if (action === 'publish') {
      const latest = await putRuntimeForensicsExternalPrometheusProbeSnapshot({
        ...((body.result || {}) as object),
        source: 'external',
      });
      return NextResponse.json({
        ok: true,
        latest,
      });
    }

    if (action !== 'run') {
      return NextResponse.json(
        { ok: false, error: 'Unsupported prometheus probe action.' },
        { status: 400 }
      );
    }

    const latest = await runRuntimeForensicsExternalPrometheusProbe();
    return NextResponse.json({
      ok: true,
      config: getRuntimeForensicsExternalPrometheusProbeConfig(),
      latest,
    });
  } catch (error) {
    return authErrorToResponse(error);
  }
}
