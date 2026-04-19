export interface ScriptRuntimePolicy {
  enabled: boolean;
  mode: 'disabled' | 'isolated_worker';
  requiresReviewedArtifact: boolean;
  reason?: 'disabled_by_env' | 'disabled_in_production';
}

function normalizeFlag(value: string | undefined): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function getScriptRuntimePolicy(
  env: NodeJS.ProcessEnv = process.env
): ScriptRuntimePolicy {
  const explicitFlag = normalizeFlag(env.REY30_ENABLE_CUSTOM_SCRIPT_RUNTIME);
  const nodeEnv = normalizeFlag(env.NODE_ENV) || 'development';

  if (explicitFlag === 'false') {
    return {
      enabled: false,
      mode: 'disabled',
      requiresReviewedArtifact: true,
      reason: 'disabled_by_env',
    };
  }

  if (nodeEnv === 'production') {
    return {
      enabled: false,
      mode: 'disabled',
      requiresReviewedArtifact: true,
      reason: 'disabled_in_production',
    };
  }

  return {
    enabled: true,
    mode: 'isolated_worker',
    requiresReviewedArtifact: true,
  };
}

