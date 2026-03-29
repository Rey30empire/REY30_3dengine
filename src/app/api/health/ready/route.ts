import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getReleaseInfo } from '@/lib/ops/release-info';
import {
  isDistributedRateLimitConfigured,
  isInMemoryRateLimitFallbackAllowedInProduction,
  isAutomatedTestRuntime,
} from '@/lib/security/capacity-policy';
import { isEncryptionSecretConfigured } from '@/lib/security/crypto';
import { getProductionRegistrationPosture } from '@/lib/security/registration-policy';

export const dynamic = 'force-dynamic';

type ReadinessCheckStatus = 'ok' | 'warn' | 'error';

function summarizeError(error: unknown): string {
  const raw = String(error || 'unknown_error');
  const firstLine = raw.split('\n')[0] || 'unknown_error';
  return firstLine.slice(0, 160);
}

export async function GET() {
  const release = getReleaseInfo();
  const timestamp = new Date().toISOString();
  const isProduction = process.env.NODE_ENV === 'production';
  const automatedTestRuntime = isAutomatedTestRuntime();
  const isSecretConfigured = isEncryptionSecretConfigured();
  const rateLimitBackendConfigured = isDistributedRateLimitConfigured();
  const allowInMemoryRateLimitFallback = isInMemoryRateLimitFallbackAllowedInProduction();
  const registrationPosture = getProductionRegistrationPosture();
  const checks: Record<string, ReadinessCheckStatus> = {
    securityConfig: isSecretConfigured ? 'ok' : isProduction ? 'error' : 'warn',
    database: 'ok',
    registrationPolicy:
      registrationPosture.issues.length > 0
        ? 'error'
        : registrationPosture.warnings.length > 0
          ? 'warn'
          : 'ok',
    rateLimitBackend:
      rateLimitBackendConfigured || !isProduction || automatedTestRuntime
        ? rateLimitBackendConfigured ? 'ok' : 'warn'
        : allowInMemoryRateLimitFallback
          ? 'warn'
          : 'error',
  };
  const reasons: string[] = [];
  const warnings: string[] = [];
  const missingSecretReason =
    'Missing encryption secret. Define REY30_ENCRYPTION_KEY or NEXTAUTH_SECRET to enable encrypted user secrets.';
  const missingRateLimitReason =
    'Missing distributed rate limit backend. Define REY30_UPSTASH_REDIS_REST_URL and REY30_UPSTASH_REDIS_REST_TOKEN, or set REY30_ALLOW_IN_MEMORY_RATE_LIMIT_PRODUCTION=true only for a single-node deployment.';

  if (checks.securityConfig === 'warn') {
    warnings.push(missingSecretReason);
  }

  if (checks.securityConfig === 'error') {
    reasons.push(missingSecretReason);
  }

  warnings.push(...registrationPosture.warnings);
  reasons.push(...registrationPosture.issues);

  if (checks.rateLimitBackend === 'warn') {
    warnings.push(missingRateLimitReason);
  }

  if (checks.rateLimitBackend === 'error') {
    reasons.push(missingRateLimitReason);
  }

  try {
    await db.$queryRaw`SELECT 1`;
  } catch (error) {
    checks.database = 'error';
    reasons.push(summarizeError(error));
  }

  if (reasons.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        status: 'not_ready',
        checks,
        reason: reasons[0],
        reasons,
        warnings,
        release,
        timestamp,
      },
      { status: 503 }
    );
  }

  return NextResponse.json({
    ok: true,
    status: 'ready',
    checks,
    warnings,
    release,
    timestamp,
  });
}
