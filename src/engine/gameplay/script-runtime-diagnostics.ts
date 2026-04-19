export interface RuntimeArtifactRecord {
  scriptId: string;
  status: 'ready' | 'missing' | 'stale' | 'error';
  compiledHash: string | null;
  sourceHash: string | null;
  generatedAt: string | null;
}

export interface RuntimeArtifactVerificationRecord {
  scriptId: string;
  okCount: number;
  failedCount: number;
  lastStatus: 'ok' | 'failed';
  lastVerifiedAt: string;
  lastMessage: string | null;
}

export interface ScriptExecutionStatus {
  scriptId: string;
  status: 'ready' | 'backoff' | 'disabled' | 'error';
  failures: number;
  retryAt: string | null;
  lastError: string | null;
  lastStatusCode: number | null;
}

export interface RuntimeEventRecord {
  id: string;
  at: string;
  kind:
    | 'script_load_failed'
    | 'scrib_load_failed'
    | 'script_load_recovered'
    | 'legacy_script_disabled'
    | 'scrib_node_disabled'
    | 'artifact_verification_ok'
    | 'artifact_verification_failed'
    | 'scrib_node_retry_requested';
  scriptId?: string;
  nodeId?: string;
  message: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface DisabledScribNodeRecord {
  nodeId: string;
  sourceScribId: string | null;
  code: string | null;
  scribType: string | null;
  autoAdded: boolean | null;
}

export interface ScriptRuntimeInstanceStatus {
  instanceId: string;
  heartbeatStatus: 'idle' | 'healthy' | 'error';
  lastHeartbeatAt: string | null;
  lastHeartbeatError: string | null;
  executionLeaseStatus?: 'unknown' | 'local-only' | 'owned' | 'standby';
  executionLeaseOwnerInstanceId?: string | null;
  executionLeaseExpiresAt?: string | null;
}

export interface ScriptRuntimeDiagnostics {
  generatedAt: string;
  instance: ScriptRuntimeInstanceStatus;
  composer: {
    planReady: boolean;
    signature: string;
    diagnosticSignature: string;
    activeScribNodes: number;
    disabledScribNodes: string[];
    disabledScribNodeDetails: DisabledScribNodeRecord[];
  };
  legacyScripts: {
    activeEntityScripts: number;
    activeScriptIds: string[];
    cachedScripts: number;
    statuses: ScriptExecutionStatus[];
  };
  artifacts: RuntimeArtifactRecord[];
  artifactVerifications: RuntimeArtifactVerificationRecord[];
  pauses: {
    authBlockedUntil: string | null;
    serverBlockedUntil: string | null;
  };
  recentEvents: RuntimeEventRecord[];
}
