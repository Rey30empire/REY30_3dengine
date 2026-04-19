import type { ScriptRuntimePolicy } from '@/lib/security/script-runtime-policy';
import type { ScriptStorageInfo, ScriptStorageStatus } from '@/lib/server/script-storage';
import type {
  ScriptRuntimeArtifactStorageInfo,
  ScriptRuntimeArtifactStorageStatus,
} from '@/lib/server/script-runtime-artifacts';

export type ScriptRuntimeStorageMode = 'local' | 'shared' | 'not-required';
export type ScriptRuntimeMultiInstanceMode =
  | 'not-required'
  | 'single-instance-only'
  | 'shared-storage-ready';

export interface ScriptRuntimeOperationalSemantics {
  enabled: boolean;
  reviewedArtifactsRequired: boolean;
  sourceStorageMode: Exclude<ScriptRuntimeStorageMode, 'not-required'>;
  artifactStorageMode: ScriptRuntimeStorageMode;
  executionIsolation: 'worker-per-instance';
  consistencyModel: 'reviewed-artifact-read-through';
  multiInstanceMode: ScriptRuntimeMultiInstanceMode;
}

export interface ScriptRuntimeHealthSummary extends ScriptRuntimeOperationalSemantics {
  sourceStorageAvailable: boolean;
  artifactStorageAvailable: boolean;
  restartReady: boolean;
}

function toStorageMode(
  backend: ScriptStorageInfo['backend'] | ScriptRuntimeArtifactStorageInfo['backend'] | undefined
): Exclude<ScriptRuntimeStorageMode, 'not-required'> {
  return backend === 'netlify-blobs' ? 'shared' : 'local';
}

export function getScriptRuntimeOperationalSemantics(params: {
  policy: ScriptRuntimePolicy;
  scriptStorage: Pick<ScriptStorageInfo, 'backend'>;
  runtimeArtifacts?: Pick<ScriptRuntimeArtifactStorageInfo, 'backend'> | null;
}): ScriptRuntimeOperationalSemantics {
  const sourceStorageMode = toStorageMode(params.scriptStorage.backend);
  const artifactStorageMode =
    params.policy.enabled && params.runtimeArtifacts
      ? toStorageMode(params.runtimeArtifacts.backend)
      : 'not-required';
  const multiInstanceMode: ScriptRuntimeMultiInstanceMode =
    !params.policy.enabled
      ? 'not-required'
      : sourceStorageMode === 'shared' && artifactStorageMode === 'shared'
        ? 'shared-storage-ready'
        : 'single-instance-only';

  return {
    enabled: params.policy.enabled,
    reviewedArtifactsRequired: params.policy.requiresReviewedArtifact,
    sourceStorageMode,
    artifactStorageMode,
    executionIsolation: 'worker-per-instance',
    consistencyModel: 'reviewed-artifact-read-through',
    multiInstanceMode,
  };
}

export function getScriptRuntimeHealthSummary(params: {
  policy: ScriptRuntimePolicy;
  scriptStorage: ScriptStorageStatus;
  runtimeArtifacts?: ScriptRuntimeArtifactStorageStatus | null;
}): ScriptRuntimeHealthSummary {
  const semantics = getScriptRuntimeOperationalSemantics({
    policy: params.policy,
    scriptStorage: params.scriptStorage,
    runtimeArtifacts: params.runtimeArtifacts,
  });

  const sourceStorageAvailable = params.scriptStorage.available;
  const artifactStorageAvailable = params.policy.enabled
    ? Boolean(params.runtimeArtifacts?.available)
    : true;

  return {
    ...semantics,
    sourceStorageAvailable,
    artifactStorageAvailable,
    restartReady: sourceStorageAvailable && artifactStorageAvailable,
  };
}
