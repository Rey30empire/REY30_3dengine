import { NextRequest, NextResponse } from 'next/server';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import { getScriptStorageStatus } from '@/lib/server/script-storage';
import {
  getScriptRuntimeArtifactStorageStatus,
  type ScriptRuntimeArtifactStorageStatus,
} from '@/lib/server/script-runtime-artifacts';
import { summarizeScriptRuntimeLiveSessions } from '@/lib/server/script-runtime-live-sessions';
import { getScriptRuntimeHealthSummary } from '@/lib/server/script-runtime-semantics';
import { getScriptRuntimePolicy } from '@/lib/security/script-runtime-policy';

function isAuthError(error: unknown): boolean {
  const msg = String(error);
  return msg.includes('UNAUTHORIZED') || msg.includes('FORBIDDEN');
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession(request, 'EDITOR');
    const currentInstanceId = new URL(request.url).searchParams.get('instanceId');
    const policy = getScriptRuntimePolicy();
    const [scriptStatus, runtimeArtifactStatus, live] = await Promise.all([
      getScriptStorageStatus(),
      policy.enabled
        ? getScriptRuntimeArtifactStorageStatus()
        : Promise.resolve<ScriptRuntimeArtifactStorageStatus>({
            available: true,
            backend: 'filesystem',
            scope: 'filesystem',
          }),
      summarizeScriptRuntimeLiveSessions({
        currentSessionId: user.sessionId,
        currentInstanceId,
      }).catch(() => null),
    ]);
    const runtime = getScriptRuntimeHealthSummary({
      policy,
      scriptStorage: scriptStatus,
      runtimeArtifacts: runtimeArtifactStatus,
    });
    const available = runtime.restartReady;
    if (!available) {
      console.error('[scripts/health][GET] unavailable:', {
        scriptStorageError: scriptStatus.available ? null : scriptStatus.error,
        runtimeArtifactError:
          runtimeArtifactStatus.available ? null : runtimeArtifactStatus.error,
        runtimePolicyEnabled: policy.enabled,
      });
    }

    return NextResponse.json({
      success: available,
      available,
      message: available
        ? 'La automatización de scripts está disponible.'
        : 'La automatización de scripts no está disponible en este momento.',
      runtime,
      live,
    });
  } catch (error) {
    if (isAuthError(error)) return authErrorToResponse(error);
    console.error('[scripts/health][GET] failed:', error);
    return NextResponse.json(
      {
        success: false,
        available: false,
        message: 'La automatización de scripts no está disponible en este momento.',
      },
      { status: 200 }
    );
  }
}
